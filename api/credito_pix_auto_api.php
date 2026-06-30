<?php
/**
 * SOU+BLU — Pix Automático Efi Pay para Propostas de Crédito
 *
 * Actions:
 *   GET  ?action=health
 *   POST ?action=criar_recorrencia   { proposal_id }
 *   POST ?action=verificar_conta     { proposal_id }
 *   GET  ?action=consultar           &proposal_id=
 *   POST ?action=gerar_cobrancas     { proposal_id }
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/CreditProposalRepository.php';
require_once __DIR__ . '/lib/EfiPayPixAutomatico.php';

$configPath = dirname(__DIR__) . '/config.pix.local.php';
if (is_file($configPath)) {
    require_once $configPath;
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

function pix_auto_json_body(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function pix_auto_parse_esteira(array $row): array
{
    $est = $row['esteira'] ?? [];
    if (is_string($est)) {
        try {
            $est = json_decode($est, true) ?: [];
        } catch (Throwable) {
            $est = [];
        }
    }
    return is_array($est) ? $est : [];
}

function pix_auto_digits(string $v): string
{
    return preg_replace('/\D+/', '', $v) ?? '';
}

/** Agência para solicrec: só números, até 4 dígitos (sem dígito verificador). Ex.: 2805-0 → 2805 */
function pix_auto_normalize_agencia(string $raw): string
{
    $raw = trim($raw);
    if ($raw === '') {
        return '';
    }
    if (preg_match('/^(\d{1,4})\s*[-\/]\s*\d+$/', $raw, $m)) {
        return $m[1];
    }
    $digits = pix_auto_digits($raw);
    if (strlen($digits) > 4) {
        return substr($digits, 0, 4);
    }
    return $digits;
}

/** Conta para solicrec: só números; 12345-6 → 123456 */
function pix_auto_normalize_conta(string $raw): string
{
    $raw = trim($raw);
    if ($raw === '') {
        return '';
    }
    if (preg_match('/^(\d+)\s*[-\/]\s*(\d+)$/', $raw, $m)) {
        return $m[1] . $m[2];
    }
    return pix_auto_digits($raw);
}

function pix_auto_proposal_context(array $row): array
{
    $est = pix_auto_parse_esteira($row);
    $meta = is_array($row['meta'] ?? null) ? $row['meta'] : [];
    $cpf = pix_auto_digits((string) ($row['cpf'] ?? $meta['cpf_funcionario'] ?? ''));
    $nome = (string) ($row['nome'] ?? $row['employee_name'] ?? $meta['nome_funcionario'] ?? 'Funcionário');
    $protocolo = (string) ($row['protocolo'] ?? $row['id'] ?? '');
    $valorParcela = (float) ($est['valor_parcela'] ?? $row['valor_parcela'] ?? 0);
    $parcelas = (int) ($est['parcelas_meses'] ?? $est['parcelas'] ?? $meta['parcelas_meses'] ?? $meta['parcelas'] ?? 0);
    $dataDesconto = (string) ($est['data_desconto'] ?? $est['data_credito'] ?? '');
    $formaPag = strtoupper(trim((string) ($est['forma_pagamento'] ?? $row['forma_pagamento'] ?? $meta['forma_pagamento'] ?? '')));
    $agenciaRaw = (string) ($row['agencia'] ?? $meta['agencia'] ?? '');
    $contaRaw = (string) ($row['conta_corrente'] ?? $meta['conta_corrente'] ?? '');
    $agencia = pix_auto_normalize_agencia($agenciaRaw);
    $conta = pix_auto_normalize_conta($contaRaw);
    $banco = (string) ($row['banco'] ?? $meta['banco'] ?? '');
    return compact('est', 'meta', 'cpf', 'nome', 'protocolo', 'valorParcela', 'parcelas', 'dataDesconto', 'formaPag', 'agencia', 'conta', 'banco')
        + ['agencia_raw' => $agenciaRaw, 'conta_raw' => $contaRaw];
}

function pix_auto_save_esteira($repo, string $id, array $est, array $extra = []): array
{
    $row = $repo->getById($id);
    if (!$row) {
        throw new RuntimeException('Proposta não encontrada.');
    }
    $patch = array_merge(['esteira' => $est], $extra);
    $repo->update($id, $patch);
    return $repo->getById($id) ?: $row;
}

function pix_auto_add_months(string $ymd, int $months): string
{
    try {
        $dt = new DateTimeImmutable($ymd, pix_auto_tz());
        return $dt->modify('+' . $months . ' months')->format('Y-m-d');
    } catch (Throwable) {
        return (new DateTimeImmutable('today', pix_auto_tz()))
            ->modify('+' . $months . ' months')
            ->format('Y-m-d');
    }
}

function pix_auto_tz(): DateTimeZone
{
    return new DateTimeZone('America/Sao_Paulo');
}

/** Efi exige dataInicial > data de criação (não pode ser hoje). */
function pix_auto_resolve_data_inicial(string $dataDesconto): array
{
    $tz = pix_auto_tz();
    $hoje = (new DateTimeImmutable('today', $tz))->format('Y-m-d');
    $amanha = (new DateTimeImmutable('today', $tz))->modify('+1 day')->format('Y-m-d');
    $original = trim(substr($dataDesconto, 0, 10));

    $candidata = $original;
    if ($candidata === '') {
        return ['dataInicial' => $amanha, 'original' => '', 'ajustada' => true, 'motivo' => 'sem_data_desconto'];
    }

    try {
        $dt = new DateTimeImmutable($candidata, $tz);
        $candidata = $dt->format('Y-m-d');
    } catch (Throwable) {
        return ['dataInicial' => $amanha, 'original' => $original, 'ajustada' => true, 'motivo' => 'data_invalida'];
    }

    if ($candidata <= $hoje) {
        return [
            'dataInicial' => $amanha,
            'original' => $original,
            'ajustada' => true,
            'motivo' => 'dataInicial_nao_pode_ser_hoje',
            'hoje' => $hoje,
        ];
    }

    return ['dataInicial' => $candidata, 'original' => $original, 'ajustada' => false, 'motivo' => 'ok'];
}

$action = strtolower(trim((string) ($_GET['action'] ?? 'health')));
$body = pix_auto_json_body();

try {
    soublu_ensure_credit_proposals_table(soublu_pdo());
    $repo = soublu_credit_proposal_repository();
    $service = pix_auto_service();
    $provider = defined('PIX_PROVIDER') ? (string) PIX_PROVIDER : 'mock';

    if ($action === 'health') {
        $scopes = [
            'payloadlocationrec.read',
            'payloadlocationrec.write',
            'rec.read',
            'rec.write',
            'solicrec.read',
            'solicrec.write',
            'cobr.read',
            'cobr.write',
        ];
        $sandbox = defined('EFI_SANDBOX') ? (bool) EFI_SANDBOX : true;
        $pixBase = $sandbox ? 'https://pix-h.api.efipay.com.br' : 'https://pix.api.efipay.com.br';
        $cobrBase = $sandbox ? 'https://cobrancas-h.api.efipay.com.br' : 'https://cobrancas.api.efipay.com.br';
        $health = [
            'ok' => true,
            'build' => '97c411agencia1',
            'client_build' => EfiPayPixAutomatico::CLIENT_BUILD,
            'provider' => $provider,
            'mock' => strtolower($provider) !== 'efipay',
            'api_usada' => 'API Pix (não API Cobranças)',
            'pix_base_url' => $pixBase,
            'oauth_endpoint' => $pixBase . '/oauth/token',
            'cobrancas_base_url' => $cobrBase,
            'cobrancas_oauth' => $cobrBase . '/v1/authorize',
            'cobrancas_nao_usada' => 'API Cobranças é para boleto/cartão/assinaturas — não debita conta via Pix Automático',
            'pix_automatico_doc' => 'https://dev.efipay.com.br/docs/api-pix/pix-automatico',
            'credenciais_doc_pix' => 'https://dev.efipay.com.br/docs/api-pix/credenciais',
            'credenciais_doc_cobrancas' => 'https://dev.efipay.com.br/docs/api-cobrancas/credenciais',
            'required_scopes' => $scopes,
            'banks' => array_keys(EfiPayPixAutomatico::BANK_CODE_ISPB),
            'cert_configured' => defined('EFI_CERT_PATH') && is_file((string) EFI_CERT_PATH),
            'client_id_configured' => defined('EFI_CLIENT_ID') && trim((string) EFI_CLIENT_ID) !== '',
        ];
        if (strtolower($provider) === 'efipay') {
            try {
                require_once __DIR__ . '/lib/EfiPayClient.php';
                $client = efi_pay_client_from_config();
                $client->getAccessToken(true);
                $health['efi_oauth'] = true;
                $health['ok'] = true;
            } catch (Throwable $oauthErr) {
                $health['efi_oauth'] = false;
                $health['oauth_error'] = $oauthErr->getMessage();
                $health['ok'] = false;
                $health['hint'] = 'Verifique Client_Id, Client_Secret, certificado .p12 e escopos Pix Automático na app Efi (API Pix, não API Cobranças). Inclua payloadlocationrec.read e payloadlocationrec.write.';
            }
        }
        if (!empty($_GET['probe_locrec']) && strtolower($provider) === 'efipay') {
            try {
                $loc = $service->createLocation();
                $health['locrec_probe'] = [
                    'ok' => true,
                    'id' => $loc['id'] ?? null,
                    'location' => $loc['location'] ?? null,
                    'client_build' => EfiPayPixAutomatico::CLIENT_BUILD,
                ];
            } catch (Throwable $probeErr) {
                $health['locrec_probe'] = [
                    'ok' => false,
                    'error' => $probeErr->getMessage(),
                    'client_build' => EfiPayPixAutomatico::CLIENT_BUILD,
                ];
                $health['ok'] = false;
            }
        }
        soublu_json($health, $health['ok'] ? 200 : 503);
    }

    $proposalId = trim((string) ($body['proposal_id'] ?? $_GET['proposal_id'] ?? ''));
    if ($proposalId === '') {
        soublu_json(['ok' => false, 'error' => 'Informe proposal_id.'], 400);
    }

    $row = $repo->getById($proposalId);
    if (!$row) {
        soublu_json(['ok' => false, 'error' => 'Proposta não encontrada.'], 404);
    }

    $ctx = pix_auto_proposal_context($row);
    $est = $ctx['est'];
    $pixAuto = is_array($est['pix_automatico'] ?? null) ? $est['pix_automatico'] : [];

    if ($action === 'criar_recorrencia') {
        if ($ctx['cpf'] === '' || strlen($ctx['cpf']) !== 11) {
            soublu_json(['ok' => false, 'error' => 'CPF do funcionário inválido na proposta.'], 400);
        }
        if ($ctx['valorParcela'] <= 0) {
            soublu_json(['ok' => false, 'error' => 'Informe o valor da parcela na esteira antes de criar a recorrência.'], 400);
        }
        if (!in_array($ctx['parcelas'], [2, 3, 4], true)) {
            soublu_json(['ok' => false, 'error' => 'Número de parcelas deve ser 2, 3 ou 4.'], 400);
        }
        $dataIni = pix_auto_resolve_data_inicial($ctx['dataDesconto']);
        $dataInicial = $dataIni['dataInicial'];
        $dataFinal = pix_auto_add_months($dataInicial, $ctx['parcelas'] - 1);
        // #region agent log
        pix_auto_dbg_log('credito_pix_auto_api.php:criar_recorrencia', 'datas recorrência', [
            'dataInicial' => $dataInicial,
            'dataFinal' => $dataFinal,
            'dataDescontoOriginal' => $dataIni['original'] ?? '',
            'ajustada' => $dataIni['ajustada'] ?? false,
            'motivo' => $dataIni['motivo'] ?? '',
        ], 'rec-data-inicial', 'post-fix');
        // #endregion

        $loc = $service->createLocation();
        $locId = (int) ($loc['id'] ?? 0);
        $recPayload = EfiPayPixAutomatico::buildRecPayload(
            $locId,
            $ctx['protocolo'],
            $ctx['cpf'],
            $ctx['nome'],
            (string) $ctx['valorParcela'],
            $dataInicial,
            $dataFinal,
            $ctx['parcelas']
        );
        $rec = $service->createRecurrence($recPayload);
        $idRec = (string) ($rec['idRec'] ?? '');
        if ($idRec !== '' && empty($rec['dadosQR']['pixCopiaECola'])) {
            $rec = $service->getRecurrence($idRec);
        }

        $pixAuto = array_merge($pixAuto, [
            'idRec' => $idRec,
            'status' => (string) ($rec['status'] ?? 'CRIADA'),
            'loc_id' => $locId,
            'pix_copia_cola' => (string) ($rec['dadosQR']['pixCopiaECola'] ?? ''),
            'valor_rec' => (string) $ctx['valorParcela'],
            'parcelas' => $ctx['parcelas'],
            'data_inicial' => $dataInicial,
            'data_inicial_original' => $dataIni['original'] ?? '',
            'data_inicial_ajustada' => (bool) ($dataIni['ajustada'] ?? false),
            'data_final' => $dataFinal,
            'forma_pagamento' => $ctx['formaPag'],
            'criado_em' => gmdate('c'),
            'provider' => $provider,
            'mock' => strtolower($provider) !== 'efipay',
        ]);
        $est['pix_automatico'] = $pixAuto;
        pix_auto_save_esteira($repo, $proposalId, $est);

        $msgRec = 'Recorrência criada. Envie o QR Code ao funcionário para autorizar o débito automático.';
        if (!empty($dataIni['ajustada'])) {
            $msgRec .= ' A data do primeiro desconto foi ajustada para ' . $dataInicial
                . ' (a Efi não permite iniciar a recorrência no mesmo dia da criação).';
        }
        soublu_json([
            'ok' => true,
            'pix_automatico' => $pixAuto,
            'rec' => $rec,
            'message' => $msgRec,
        ]);
    }

    if ($action === 'verificar_conta') {
        $idRec = (string) ($pixAuto['idRec'] ?? '');
        if ($idRec === '') {
            soublu_json(['ok' => false, 'error' => 'Crie a recorrência antes de verificar a conta.'], 400);
        }
        if ($ctx['agencia'] === '' || strlen($ctx['agencia']) > 4) {
            soublu_json([
                'ok' => false,
                'error' => 'Agência inválida. Informe só o número da agência (até 4 dígitos), sem dígito verificador. Ex.: 2805 em vez de 2805-0.',
            ], 400);
        }
        if ($ctx['conta'] === '') {
            soublu_json(['ok' => false, 'error' => 'Conta corrente do funcionário não encontrada na proposta.'], 400);
        }
        $ispb = EfiPayPixAutomatico::bankIspb($ctx['banco']);
        if ($ispb === null) {
            soublu_json(['ok' => false, 'error' => 'Informe o banco do funcionário na proposta (BB, Bradesco, Santander, Itaú ou Caixa).'], 400);
        }
        // #region agent log
        pix_auto_dbg_log('credito_pix_auto_api.php:verificar_conta', 'solicrec payload', [
            'idRec' => $idRec,
            'banco' => $ctx['banco'],
            'ispb' => $ispb,
            'agencia' => $ctx['agencia'],
            'agencia_raw' => $ctx['agencia_raw'] ?? '',
            'conta_len' => strlen($ctx['conta']),
            'conta_raw' => $ctx['conta_raw'] ?? '',
        ], 'verificar-conta-agencia', 'post-fix');
        // #endregion

        $expira = (new DateTimeImmutable('+7 days'))->format('Y-m-d\TH:i:s\Z');
        $solicPayload = [
            'idRec' => $idRec,
            'calendario' => ['dataExpiracaoSolicitacao' => $expira],
            'destinatario' => [
                'agencia' => $ctx['agencia'],
                'conta' => $ctx['conta'],
                'cpf' => $ctx['cpf'],
                'ispbParticipante' => $ispb,
            ],
        ];
        $solic = $service->createSolicRec($solicPayload);
        $pixAuto['idSolicRec'] = (string) ($solic['idSolicRec'] ?? '');
        $pixAuto['solic_status'] = (string) ($solic['status'] ?? 'CRIADA');
        $pixAuto['conta_verificada_em'] = gmdate('c');
        $pixAuto['destinatario'] = $solicPayload['destinatario'];
        $est['pix_automatico'] = $pixAuto;
        pix_auto_save_esteira($repo, $proposalId, $est);

        soublu_json([
            'ok' => true,
            'pix_automatico' => $pixAuto,
            'solicrec' => $solic,
            'message' => 'Solicitação enviada ao banco (push). Opcional na Jornada 2 — o funcionário também pode autorizar pelo QR Code. Aguarde confirmação no app.',
        ]);
    }

    if ($action === 'consultar') {
        $idRec = (string) ($pixAuto['idRec'] ?? '');
        if ($idRec === '') {
            soublu_json(['ok' => false, 'error' => 'Recorrência não configurada.'], 400);
        }
        $rec = $service->getRecurrence($idRec);
        $pixAuto['status'] = (string) ($rec['status'] ?? $pixAuto['status'] ?? '');
        if (!empty($rec['dadosQR']['pixCopiaECola'])) {
            $pixAuto['pix_copia_cola'] = (string) $rec['dadosQR']['pixCopiaECola'];
        }
        if (!empty($rec['pagador'])) {
            $pixAuto['pagador'] = $rec['pagador'];
        }
        $pixAuto['consultado_em'] = gmdate('c');

        $idSolicRec = (string) ($pixAuto['idSolicRec'] ?? '');
        if ($idSolicRec !== '') {
            $solic = $service->getSolicRec($idSolicRec);
            $pixAuto['solic_status'] = (string) ($solic['status'] ?? $pixAuto['solic_status'] ?? '');
        }

        $est['pix_automatico'] = $pixAuto;
        pix_auto_save_esteira($repo, $proposalId, $est);

        soublu_json([
            'ok' => true,
            'pix_automatico' => $pixAuto,
            'rec' => $rec,
        ]);
    }

    if ($action === 'gerar_cobrancas') {
        $idRec = (string) ($pixAuto['idRec'] ?? '');
        $status = strtoupper((string) ($pixAuto['status'] ?? ''));
        if ($idRec === '') {
            soublu_json(['ok' => false, 'error' => 'Recorrência não configurada.'], 400);
        }
        if ($status !== 'APROVADA' && strtolower($provider) === 'efipay') {
            soublu_json([
                'ok' => false,
                'error' => 'Recorrência ainda não aprovada pelo funcionário. Status atual: ' . ($status ?: 'CRIADA'),
                'pix_automatico' => $pixAuto,
            ], 409);
        }

        $parcelas = (int) ($pixAuto['parcelas'] ?? $ctx['parcelas'] ?? 0);
        $valor = (string) ($pixAuto['valor_rec'] ?? $ctx['valorParcela']);
        $dataBase = (string) ($pixAuto['data_inicial'] ?? '');
        if ($dataBase === '') {
            $resolved = pix_auto_resolve_data_inicial($ctx['dataDesconto']);
            $dataBase = $resolved['dataInicial'];
        }
        $cobrancas = is_array($pixAuto['cobrancas'] ?? null) ? $pixAuto['cobrancas'] : [];
        $criadas = [];

        for ($i = count($cobrancas); $i < $parcelas; $i++) {
            $venc = pix_auto_add_months($dataBase, $i);
            $cobPayload = [
                'idRec' => $idRec,
                'infoAdicional' => 'Parcela ' . ($i + 1) . '/' . $parcelas . ' — Crédito SOU+BLU ' . $ctx['protocolo'],
                'calendario' => ['dataDeVencimento' => $venc],
                'valor' => ['original' => number_format((float) $valor, 2, '.', '')],
                'ajusteDiaUtil' => true,
            ];
            $cob = $service->createCobranca($cobPayload);
            $item = [
                'txid' => (string) ($cob['txid'] ?? ''),
                'parcela' => $i + 1,
                'vencimento' => $venc,
                'valor' => $valor,
                'status' => (string) ($cob['status'] ?? 'CRIADA'),
                'criado_em' => gmdate('c'),
            ];
            $cobrancas[] = $item;
            $criadas[] = $item;
        }

        $pixAuto['cobrancas'] = $cobrancas;
        $pixAuto['cobrancas_geradas_em'] = gmdate('c');
        $est['pix_automatico'] = $pixAuto;
        pix_auto_save_esteira($repo, $proposalId, $est);

        soublu_json([
            'ok' => true,
            'criadas' => $criadas,
            'cobrancas' => $cobrancas,
            'pix_automatico' => $pixAuto,
            'message' => count($criadas) . ' cobrança(s) gerada(s).',
        ]);
    }

    soublu_json(['ok' => false, 'error' => 'Ação inválida.'], 400);
} catch (Throwable $e) {
    soublu_json([
        'ok' => false,
        'error' => $e->getMessage(),
        'action' => $action,
    ], 500);
}
