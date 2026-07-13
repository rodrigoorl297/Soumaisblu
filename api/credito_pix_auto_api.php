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

/** Conta para solicrec — formato varia por banco (Santander: sem DV; Nubank/outros: com DV). */
function pix_auto_normalize_conta(string $raw, string $banco = ''): string
{
    $raw = trim($raw);
    if ($raw === '') {
        return '';
    }
    if (preg_match('/^(\d+)\s*[-\/]\s*(\d+)$/', $raw, $m)) {
        if (preg_match('/033|santander/i', $banco)) {
            return $m[1];
        }
        return $m[1] . $m[2];
    }
    return pix_auto_digits($raw);
}

function pix_auto_mask_cpf(string $cpf): string
{
    $d = pix_auto_digits($cpf);
    if (strlen($d) !== 11) {
        return '***';
    }
    return substr($d, 0, 3) . '*****' . substr($d, -2);
}

/** Compara conta da proposta vs enviado vs resposta Efi (consulta qual conta está batendo). */
function pix_auto_conta_comparacao(array $ctx, array $pixAuto, ?array $efiSolic = null): array
{
    $efiDest = is_array($efiSolic['destinatario'] ?? null) ? $efiSolic['destinatario'] : [];
    $localDest = is_array($pixAuto['destinatario'] ?? null) ? $pixAuto['destinatario'] : [];
    $dest = $efiDest !== [] ? $efiDest : $localDest;

    $propAg = trim((string) ($ctx['agencia_raw'] !== '' ? $ctx['agencia_raw'] : $ctx['agencia']));
    $propConta = trim((string) ($ctx['conta_raw'] !== '' ? $ctx['conta_raw'] : $ctx['conta']));
    $apiAg = (string) ($pixAuto['agencia_enviada'] ?? $ctx['agencia']);
    $apiConta = (string) ($pixAuto['conta_api'] ?? $ctx['conta']);
    $efiAg = (string) ($dest['agencia'] ?? '');
    $efiConta = (string) ($dest['conta'] ?? '');
    $efiCpf = pix_auto_digits((string) ($dest['cpf'] ?? ''));
    $propCpf = (string) $ctx['cpf'];
    $cpfProposta = (string) ($ctx['cpf_proposta'] ?? $propCpf);

    $agenciaBate = pix_auto_normalize_agencia($propAg) === $efiAg && ($efiAg === '' || $apiAg === $efiAg);
    $contaApiBate = $apiConta !== '' && $efiConta !== '' && $apiConta === $efiConta;
    $cpfBate = $propCpf !== '' && $efiCpf !== '' && $propCpf === $efiCpf;
    $temEfi = $efiDest !== [];

    $appConta = $propConta;
    if ($appConta === '' && $apiConta !== '') {
        $appConta = $apiConta;
    }

    $resumo = 'Sem solicitação enviada à Efi ainda.';
    if ($temEfi) {
        if ($agenciaBate && $contaApiBate && $cpfBate) {
            $resumo = 'Conta bate com a Efi. No app do banco confira Ag ' . ($propAg ?: $apiAg)
                . ' e conta ' . ($propConta ?: $apiConta)
                . ' (CPF ' . $propCpf . '). Status: ' . strtoupper((string) ($efiSolic['status'] ?? $pixAuto['solic_status'] ?? '')) . '.';
            if (strtoupper((string) ($efiSolic['status'] ?? $pixAuto['solic_status'] ?? '')) === 'ENVIADA') {
                $resumo .= ' Push enviado — o app pode não notificar; abra Pix Automático → Autorizações pendentes.';
            }
        } else {
            $partes = [];
            if (!$agenciaBate) {
                $partes[] = 'agência proposta ' . ($propAg ?: '—') . ' ≠ Efi ' . ($efiAg ?: '—');
            }
            if (!$contaApiBate) {
                $partes[] = 'conta API ' . ($apiConta ?: '—') . ' ≠ Efi ' . ($efiConta ?: '—');
            }
            if (!$cpfBate) {
                $partes[] = 'CPF proposta ' . ($propCpf ?: '—') . ' ≠ Efi ' . ($efiCpf ?: '—');
            }
            $resumo = 'Divergência: ' . implode('; ', $partes) . '.';
        }
    } elseif ($apiConta !== '' || $propAg !== '') {
        $resumo = 'Dados OK na proposta (Ag ' . ($propAg ?: $apiAg)
            . ', conta ' . ($propConta ?: $pixAuto['conta_enviada'] ?? '')
            . ', CPF ' . $propCpf
            . '). A API Efi recebe a conta sem o dígito após o hífen (ex.: 26972551-6 → 26972551).'
            . ' Clique em Reenviar ao banco para enviar ao Nubank.';
    }

    return [
        'proposta' => [
            'banco' => (string) $ctx['banco'],
            'agencia' => $propAg,
            'conta' => $propConta,
            'cpf' => $propCpf,
            'cpf_funcionario' => $cpfProposta,
            'cpf_origem' => (string) ($ctx['cpf_origem'] ?? 'cpf_proposta'),
            'nome' => (string) $ctx['nome'],
        ],
        'enviado_efipay' => [
            'agencia' => $apiAg,
            'conta_api' => $apiConta,
            'conta_exibicao' => (string) ($pixAuto['conta_enviada'] ?? $propConta),
            'cpf' => (string) ($localDest['cpf'] ?? $propCpf),
            'ispb' => (string) ($localDest['ispbParticipante'] ?? EfiPayPixAutomatico::bankIspb((string) $ctx['banco']) ?? ''),
            'idSolicRec' => (string) ($pixAuto['idSolicRec'] ?? ''),
            'solic_status' => (string) ($pixAuto['solic_status'] ?? ''),
        ],
        'efi_respondeu' => $temEfi ? [
            'agencia' => $efiAg,
            'conta' => $efiConta,
            'cpf' => $efiCpf,
            'ispb' => (string) ($efiDest['ispbParticipante'] ?? ''),
            'idSolicRec' => (string) ($efiSolic['idSolicRec'] ?? $pixAuto['idSolicRec'] ?? ''),
            'status' => (string) ($efiSolic['status'] ?? $pixAuto['solic_status'] ?? ''),
        ] : null,
        'app_banco_deve_mostrar' => [
            'agencia' => $propAg ?: $apiAg,
            'conta' => $propConta ?: $appConta,
            'cpf' => $propCpf,
            'cpf_titular_obrigatorio' => true,
            'dica' => pix_auto_banco_dica((string) $ctx['banco']),
        ],
        'conferencia' => [
            'agencia_bate' => $agenciaBate,
            'conta_api_bate' => $contaApiBate,
            'cpf_bate' => $cpfBate,
            'cpf_proposta_diferente' => $cpfProposta !== '' && $propCpf !== '' && $cpfProposta !== $propCpf,
            'tudo_bate' => $temEfi && $agenciaBate && $contaApiBate && $cpfBate,
            'pendente_envio' => !$temEfi && (string) ($pixAuto['idRec'] ?? '') !== '',
            'conta_api_sem_digito' => $propConta !== '' && $apiConta !== '' && str_contains($propConta, '-')
                && preg_match('/033|santander/i', (string) $ctx['banco']),
        ],
        'resumo' => $resumo,
    ];
}

function pix_auto_banco_dica(string $banco): string
{
    if (preg_match('/260|nubank|nu\s*pagamentos/i', $banco)) {
        return 'No Nubank: Área Pix → Pix Automático → Autorizações pendentes. Agência costuma ser 0001 — confira no app.';
    }
    if (preg_match('/033|santander/i', $banco)) {
        return 'No Santander: Pix → Pix Automático → Autorizações pendentes. A conta no app deve bater com "conta" acima (com hífen).';
    }
    return 'No app do banco: Pix → Pix Automático → Autorizações pendentes.';
}

function pix_auto_resolve_cpf_pagador(array $row, array $est, array $meta): array
{
    $cpfProposta = pix_auto_digits((string) ($row['cpf'] ?? $meta['cpf_funcionario'] ?? ''));
    $cpfTitular = pix_auto_digits((string) (
        $meta['cpf_titular_conta']
        ?? $est['cpf_titular_conta']
        ?? $meta['cpf_conta_corrente']
        ?? $est['cpf_conta_corrente']
        ?? ''
    ));
    $cpfPagador = $cpfTitular !== '' ? $cpfTitular : $cpfProposta;
    return [
        'cpf' => $cpfPagador,
        'cpf_proposta' => $cpfProposta,
        'cpf_titular_conta' => $cpfTitular,
        'cpf_origem' => $cpfTitular !== '' ? 'cpf_titular_conta' : 'cpf_proposta',
    ];
}

function pix_auto_proposal_context(array $row): array
{
    $est = pix_auto_parse_esteira($row);
    $meta = is_array($row['meta'] ?? null) ? $row['meta'] : [];
    $cpfInfo = pix_auto_resolve_cpf_pagador($row, $est, $meta);
    $cpf = (string) $cpfInfo['cpf'];
    $nome = (string) ($row['nome'] ?? $row['employee_name'] ?? $meta['nome_funcionario'] ?? 'Funcionário');
    $protocolo = (string) ($row['protocolo'] ?? $row['id'] ?? '');
    $valorParcela = (float) ($est['valor_parcela'] ?? $row['valor_parcela'] ?? 0);
    $parcelas = (int) ($est['parcelas_meses'] ?? $est['parcelas'] ?? $meta['parcelas_meses'] ?? $meta['parcelas'] ?? 0);
    $dataDesconto = (string) ($est['data_desconto'] ?? $est['data_credito'] ?? '');
    $formaPag = strtoupper(trim((string) ($est['forma_pagamento'] ?? $row['forma_pagamento'] ?? $meta['forma_pagamento'] ?? '')));
    $agenciaRaw = (string) ($row['agencia'] ?? $meta['agencia'] ?? '');
    $contaRaw = (string) ($row['conta_corrente'] ?? $meta['conta_corrente'] ?? '');
    $banco = (string) ($row['banco'] ?? $meta['banco'] ?? '');
    $agencia = pix_auto_normalize_agencia($agenciaRaw);
    $conta = pix_auto_normalize_conta($contaRaw, $banco);
    return compact('est', 'meta', 'cpf', 'nome', 'protocolo', 'valorParcela', 'parcelas', 'dataDesconto', 'formaPag', 'agencia', 'conta', 'banco')
        + [
            'agencia_raw' => $agenciaRaw,
            'conta_raw' => $contaRaw,
            'cpf_proposta' => (string) $cpfInfo['cpf_proposta'],
            'cpf_titular_conta' => (string) $cpfInfo['cpf_titular_conta'],
            'cpf_origem' => (string) $cpfInfo['cpf_origem'],
        ];
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

function pix_auto_can_verificar_conta(array $ctx): bool
{
    return $ctx['agencia'] !== ''
        && strlen($ctx['agencia']) <= 4
        && $ctx['conta'] !== ''
        && EfiPayPixAutomatico::bankIspb($ctx['banco']) !== null;
}

function pix_auto_verificar_conta_apply(EfiPayPixAutomatico $service, array $ctx, array &$pixAuto): array
{
    $idRec = (string) ($pixAuto['idRec'] ?? '');
    if ($idRec === '') {
        throw new RuntimeException('Crie a recorrência antes de verificar a conta.');
    }
    if (!pix_auto_can_verificar_conta($ctx)) {
        throw new RuntimeException('Dados bancários incompletos na proposta (banco, agência e conta).');
    }
    $ispb = EfiPayPixAutomatico::bankIspb($ctx['banco']);
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
$idSolicNew = (string) ($solic['idSolicRec'] ?? '');
    $solicPollStatus = '';
    if ($idSolicNew !== '') {
        try {
            $solicPoll = $service->getSolicRec($idSolicNew);
            $solicPollStatus = (string) ($solicPoll['status'] ?? '');
} catch (Throwable $pollErr) {
            pix_auto_dbg_log('credito_pix_auto_api.php:verificar_conta:poll', 'poll falhou', [
                'error' => $pollErr->getMessage(),
            ], 'H2-enviada', 'push-debug');
        }
    }
    $pixAuto['idSolicRec'] = $idSolicNew;
    $pixAuto['solic_status'] = $solicPollStatus !== ''
        ? $solicPollStatus
        : (string) ($solic['status'] ?? 'CRIADA');
    $pixAuto['conta_verificada_em'] = gmdate('c');
    $pixAuto['destinatario'] = $solicPayload['destinatario'];
    $pixAuto['agencia_enviada'] = $ctx['agencia'];
    $pixAuto['conta_enviada'] = $ctx['conta_raw'] !== '' ? $ctx['conta_raw'] : $ctx['conta'];
    $pixAuto['conta_api'] = $ctx['conta'];
    $pixAuto['conta_raw'] = $ctx['conta_raw'] ?? '';
    $pixAuto['agencia_raw'] = $ctx['agencia_raw'] ?? '';
    $pixAuto['jornada'] = 'JORNADA_1';
    return $solic;
}

function pix_auto_consultar_apply(EfiPayPixAutomatico $service, array &$pixAuto): array
{
    $idRec = (string) ($pixAuto['idRec'] ?? '');
    if ($idRec === '') {
        throw new RuntimeException('Recorrência não configurada.');
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
    return $rec;
}

function pix_auto_gerar_cobrancas_apply(EfiPayPixAutomatico $service, array $ctx, array &$pixAuto, string $provider): array
{
    $idRec = (string) ($pixAuto['idRec'] ?? '');
    $status = strtoupper((string) ($pixAuto['status'] ?? ''));
    if ($idRec === '') {
        throw new RuntimeException('Recorrência não configurada.');
    }
    if ($status !== 'APROVADA' && strtolower($provider) === 'efipay') {
        throw new RuntimeException('Recorrência ainda não aprovada pelo funcionário. Status atual: ' . ($status ?: 'CRIADA'));
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
    if ($criadas !== []) {
        $pixAuto['cobrancas_geradas_em'] = gmdate('c');
    }
    return $criadas;
}

function pix_auto_fluxo_fase(array $pixAuto, int $parcelas): string
{
    $status = strtoupper((string) ($pixAuto['status'] ?? ''));
    $cobrancas = is_array($pixAuto['cobrancas'] ?? null) ? $pixAuto['cobrancas'] : [];
    if ($parcelas > 0 && count($cobrancas) >= $parcelas) {
        return 'cobrancas_prontas';
    }
    if ($status === 'APROVADA') {
        return 'aprovada_gerar_cobrancas';
    }
    if ((string) ($pixAuto['idSolicRec'] ?? '') !== '') {
        return 'aguardando_aprovacao_banco';
    }
    if ((string) ($pixAuto['idRec'] ?? '') !== '') {
        return 'aguardando_verificacao_conta';
    }
    return 'inicial';
}

function pix_auto_fluxo_message(string $fase, array $pixAuto): string
{
    $solic = strtoupper((string) ($pixAuto['solic_status'] ?? ''));
    $rec = strtoupper((string) ($pixAuto['status'] ?? ''));
    return match ($fase) {
        'cobrancas_prontas' => 'Débito automático configurado. Cobranças mensais agendadas.',
        'aprovada_gerar_cobrancas' => 'Recorrência aprovada. Gerando cobranças…',
        'aguardando_aprovacao_banco' => 'Autorização pendente no banco do funcionário'
            . ($solic !== '' ? " (status conta: {$solic}" . ($rec !== '' ? ", recorrência: {$rec}" : '') . ').'
            : '.')
            . ' Peça ao funcionário autorizar no painel SOU+BLU (menu Autorizar Pix) ou no app do banco.',
        'aguardando_verificacao_conta' => 'Recorrência criada. Confirme os dados bancários na proposta para enviar ao banco.',
        default => 'Pronto para iniciar o débito automático.',
    };
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
            'build' => '97c411pixauto6',
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

    if ($action === 'diagnostico') {
        $idRec = (string) ($pixAuto['idRec'] ?? '');
        $idSolicRec = (string) ($pixAuto['idSolicRec'] ?? '');
        $efiRec = $idRec !== '' ? $service->getRecurrence($idRec) : null;
        $efiSolic = $idSolicRec !== '' ? $service->getSolicRec($idSolicRec) : null;
        if ($efiRec !== null) {
            pix_auto_consultar_apply($service, $pixAuto);
        }
        if ($efiSolic !== null && $idSolicRec !== '') {
            $efiSolic = $service->getSolicRec($idSolicRec);
            $pixAuto['solic_status'] = (string) ($efiSolic['status'] ?? $pixAuto['solic_status'] ?? '');
        }
        $est['pix_automatico'] = $pixAuto;
        pix_auto_save_esteira($repo, $proposalId, $est);
        $sandbox = defined('EFI_SANDBOX') ? (bool) EFI_SANDBOX : true;
        soublu_json([
            'ok' => true,
            'proposal_id' => $proposalId,
            'ctx' => [
                'cpf' => $ctx['cpf'],
                'nome' => $ctx['nome'],
                'banco' => $ctx['banco'],
                'agencia' => $ctx['agencia'],
                'agencia_raw' => $ctx['agencia_raw'],
                'conta' => $ctx['conta'],
                'conta_raw' => $ctx['conta_raw'],
                'valor_parcela' => $ctx['valorParcela'],
                'parcelas' => $ctx['parcelas'],
            ],
            'pix_automatico' => $pixAuto,
            'conta_comparacao' => pix_auto_conta_comparacao($ctx, $pixAuto, $efiSolic),
            'efi_rec' => $efiRec,
            'efi_solicrec' => $efiSolic,
            'efi_sandbox' => $sandbox,
            'provider' => $provider,
            'push_provavel' => !$sandbox && strtoupper((string) ($efiSolic['status'] ?? '')) === 'ENVIADA',
            'usar_qr_jornada2' => !empty($pixAuto['pix_copia_cola']),
        ]);
    }

    if ($action === 'consultar_conta') {
        $idRec = (string) ($pixAuto['idRec'] ?? '');
        $idSolicRec = (string) ($pixAuto['idSolicRec'] ?? '');
        $solicSt = strtoupper((string) ($pixAuto['solic_status'] ?? ''));
        $autoEnviou = false;
        if ($idRec !== ''
            && strtolower($provider) === 'efipay'
            && pix_auto_can_verificar_conta($ctx)
            && ($idSolicRec === '' || in_array($solicSt, ['', 'CANCELADA', 'REJEITADA', 'EXPIRADA'], true))
        ) {
            try {
                pix_auto_verificar_conta_apply($service, $ctx, $pixAuto);
                $est['pix_automatico'] = $pixAuto;
                pix_auto_save_esteira($repo, $proposalId, $est);
                $idSolicRec = (string) ($pixAuto['idSolicRec'] ?? '');
                $autoEnviou = true;
                pix_auto_dbg_log('credito_pix_auto_api.php:consultar_conta', 'auto enviou solicrec', [
                    'idSolicRec' => $idSolicRec,
                    'solic_status' => (string) ($pixAuto['solic_status'] ?? ''),
                    'conta_api' => (string) ($pixAuto['conta_api'] ?? ''),
                ], 'H5-auto-send', 'push-debug');
            } catch (Throwable $autoErr) {
                pix_auto_dbg_log('credito_pix_auto_api.php:consultar_conta', 'auto envio falhou', [
                    'error' => $autoErr->getMessage(),
                ], 'H5-auto-send', 'push-debug');
            }
        }
        $efiSolic = null;
        if ($idSolicRec !== '' && strtolower($provider) === 'efipay') {
            $efiSolic = $service->getSolicRec($idSolicRec);
            $pixAuto['solic_status'] = (string) ($efiSolic['status'] ?? $pixAuto['solic_status'] ?? '');
            $est['pix_automatico'] = $pixAuto;
            pix_auto_save_esteira($repo, $proposalId, $est);
        }
        $cmp = pix_auto_conta_comparacao($ctx, $pixAuto, $efiSolic);
        if ($autoEnviou && strtoupper((string) ($pixAuto['solic_status'] ?? '')) === 'ENVIADA') {
            $cmp['resumo'] = 'Pedido enviado ao banco (status ENVIADA). O app pode não notificar — abra Pix → Pix Automático → Autorizações pendentes.';
        }
        soublu_json([
            'ok' => true,
            'proposal_id' => $proposalId,
            'conta_comparacao' => $cmp,
            'pix_automatico' => $pixAuto,
            'auto_enviou' => $autoEnviou,
            'message' => (string) ($cmp['resumo'] ?? 'Consulta concluída.'),
        ]);
    }

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

        $msgRec = 'Recorrência criada.';
        if (pix_auto_can_verificar_conta($ctx)) {
            try {
                pix_auto_verificar_conta_apply($service, $ctx, $pixAuto);
                $est['pix_automatico'] = $pixAuto;
                pix_auto_save_esteira($repo, $proposalId, $est);
                $msgRec = 'Recorrência criada e verificação enviada ao banco do funcionário. Ele só precisa autorizar no app — sem QR Code.';
            } catch (Throwable $verErr) {
                $msgRec .= ' Não foi possível enviar verificação ao banco: ' . $verErr->getMessage();
            }
        } else {
            $msgRec .= ' Informe banco, agência e conta na proposta para envio automático ao banco.';
        }
        if (!empty($dataIni['ajustada'])) {
            $msgRec .= ' Primeiro desconto ajustado para ' . $dataInicial . '.';
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
        if (EfiPayPixAutomatico::bankIspb($ctx['banco']) === null) {
            soublu_json(['ok' => false, 'error' => 'Informe o banco do funcionário na proposta (BB, Bradesco, Santander, Itaú ou Caixa).'], 400);
        }
        $solic = pix_auto_verificar_conta_apply($service, $ctx, $pixAuto);
        $est['pix_automatico'] = $pixAuto;
        pix_auto_save_esteira($repo, $proposalId, $est);

        soublu_json([
            'ok' => true,
            'pix_automatico' => $pixAuto,
            'solicrec' => $solic,
            'fase' => pix_auto_fluxo_fase($pixAuto, (int) ($pixAuto['parcelas'] ?? $ctx['parcelas'] ?? 0)),
            'message' => 'Verificação enviada ao app do banco. O funcionário autoriza lá — as cobranças começam automaticamente após aprovação.',
        ]);
    }

    if ($action === 'consultar') {
        $rec = pix_auto_consultar_apply($service, $pixAuto);
        $est['pix_automatico'] = $pixAuto;
        pix_auto_save_esteira($repo, $proposalId, $est);

        soublu_json([
            'ok' => true,
            'pix_automatico' => $pixAuto,
            'rec' => $rec,
            'fase' => pix_auto_fluxo_fase($pixAuto, (int) ($pixAuto['parcelas'] ?? $ctx['parcelas'] ?? 0)),
        ]);
    }

    if ($action === 'gerar_cobrancas') {
        try {
            $criadas = pix_auto_gerar_cobrancas_apply($service, $ctx, $pixAuto, $provider);
        } catch (RuntimeException $e) {
            soublu_json([
                'ok' => false,
                'error' => $e->getMessage(),
                'pix_automatico' => $pixAuto,
            ], 409);
        }
        $est['pix_automatico'] = $pixAuto;
        pix_auto_save_esteira($repo, $proposalId, $est);

        soublu_json([
            'ok' => true,
            'criadas' => $criadas,
            'cobrancas' => $pixAuto['cobrancas'] ?? [],
            'pix_automatico' => $pixAuto,
            'fase' => pix_auto_fluxo_fase($pixAuto, (int) ($pixAuto['parcelas'] ?? $ctx['parcelas'] ?? 0)),
            'message' => count($criadas) . ' cobrança(s) gerada(s).',
        ]);
    }

    if ($action === 'iniciar_fluxo' || $action === 'sincronizar') {
        $parcelas = (int) ($pixAuto['parcelas'] ?? $ctx['parcelas'] ?? 0);
        $steps = [];

        if ($action === 'iniciar_fluxo' && (string) ($pixAuto['idRec'] ?? '') === '') {
            if ($ctx['cpf'] === '' || strlen($ctx['cpf']) !== 11) {
                soublu_json(['ok' => false, 'error' => 'CPF do funcionário inválido na proposta.'], 400);
            }
            if ($ctx['valorParcela'] <= 0) {
                soublu_json(['ok' => false, 'error' => 'Informe o valor da parcela na esteira.'], 400);
            }
            if (!in_array($parcelas, [2, 3, 4], true)) {
                soublu_json(['ok' => false, 'error' => 'Número de parcelas deve ser 2, 3 ou 4.'], 400);
            }
            $dataIni = pix_auto_resolve_data_inicial($ctx['dataDesconto']);
            $dataInicial = $dataIni['dataInicial'];
            $dataFinal = pix_auto_add_months($dataInicial, $parcelas - 1);
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
                $parcelas
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
                'parcelas' => $parcelas,
                'data_inicial' => $dataInicial,
                'data_inicial_original' => $dataIni['original'] ?? '',
                'data_inicial_ajustada' => (bool) ($dataIni['ajustada'] ?? false),
                'data_final' => $dataFinal,
                'forma_pagamento' => $ctx['formaPag'],
                'criado_em' => gmdate('c'),
                'provider' => $provider,
                'mock' => strtolower($provider) !== 'efipay',
            ]);
            $steps[] = 'recorrencia_criada';
        }

        if ((string) ($pixAuto['idRec'] ?? '') !== ''
            && (string) ($pixAuto['idSolicRec'] ?? '') === ''
            && pix_auto_can_verificar_conta($ctx)
        ) {
            pix_auto_verificar_conta_apply($service, $ctx, $pixAuto);
            $steps[] = 'conta_verificada';
        }

        if ((string) ($pixAuto['idRec'] ?? '') !== '') {
            pix_auto_consultar_apply($service, $pixAuto);
            $steps[] = 'status_atualizado';
        }

        $fase = pix_auto_fluxo_fase($pixAuto, $parcelas);
        if ($fase === 'aprovada_gerar_cobrancas' || $fase === 'cobrancas_prontas') {
            try {
                $criadas = pix_auto_gerar_cobrancas_apply($service, $ctx, $pixAuto, $provider);
                if ($criadas !== []) {
                    $steps[] = 'cobrancas_geradas';
                }
                $fase = pix_auto_fluxo_fase($pixAuto, $parcelas);
            } catch (RuntimeException $e) {
                $steps[] = 'cobrancas_pendentes:' . $e->getMessage();
            }
        }

        $est['pix_automatico'] = $pixAuto;
        $extraUpdate = [];
        if (($row['status'] ?? '') === 'AG. ACEITE FUNCIONÁRIO' && $fase === 'aprovada_gerar_cobrancas') {
            $extraUpdate['status'] = 'APROVADO AG. PAGAMENTO';
        }
        pix_auto_save_esteira($repo, $proposalId, $est, $extraUpdate);

        soublu_json([
            'ok' => true,
            'pix_automatico' => $pixAuto,
            'fase' => $fase,
            'steps' => $steps,
            'polling' => in_array($fase, ['aguardando_aprovacao_banco', 'aguardando_verificacao_conta'], true),
            'message' => pix_auto_fluxo_message($fase, $pixAuto),
        ]);
    }

    if ($action === 'recriar_recorrencia') {
        if ($ctx['cpf'] === '' || strlen($ctx['cpf']) !== 11) {
            soublu_json(['ok' => false, 'error' => 'CPF do titular da conta inválido. Informe cpf_titular_conta na proposta.'], 400);
        }
        if ($ctx['valorParcela'] <= 0) {
            soublu_json(['ok' => false, 'error' => 'Informe o valor da parcela na esteira.'], 400);
        }
        $parcelas = (int) ($pixAuto['parcelas'] ?? $ctx['parcelas'] ?? 0);
        if (!in_array($parcelas, [2, 3, 4], true)) {
            soublu_json(['ok' => false, 'error' => 'Número de parcelas deve ser 2, 3 ou 4.'], 400);
        }

        $oldSolic = (string) ($pixAuto['idSolicRec'] ?? '');
        if ($oldSolic !== '') {
            try {
                $service->cancelSolicRec($oldSolic);
            } catch (Throwable) {
            }
        }
        $oldIdRec = (string) ($pixAuto['idRec'] ?? '');
        if ($oldIdRec !== '') {
            try {
                $service->cancelRecurrence($oldIdRec);
            } catch (Throwable $cancelRecErr) {
                pix_auto_dbg_log('credito_pix_auto_api.php:recriar_recorrencia', 'cancel rec', [
                    'idRec' => $oldIdRec,
                    'error' => $cancelRecErr->getMessage(),
                ], 'recriar-rec', 'post-fix');
            }
        }
        $historico = is_array($pixAuto['historico'] ?? null) ? $pixAuto['historico'] : [];
        if ($oldIdRec !== '') {
            $historico[] = [
                'idRec' => $oldIdRec,
                'idSolicRec' => $oldSolic,
                'cpf' => (string) ($pixAuto['destinatario']['cpf'] ?? ''),
                'substituido_em' => gmdate('c'),
                'motivo' => 'recriar_recorrencia',
            ];
        }

        $dataIni = pix_auto_resolve_data_inicial($ctx['dataDesconto']);
        $dataInicial = $dataIni['dataInicial'];
        $dataFinal = pix_auto_add_months($dataInicial, $parcelas - 1);
        $contratoEfi = $ctx['protocolo'] . '-PA-' . substr($ctx['cpf'], -4);
        $loc = $service->createLocation();
        $locId = (int) ($loc['id'] ?? 0);
        $recPayload = EfiPayPixAutomatico::buildRecPayload(
            $locId,
            $contratoEfi,
            $ctx['cpf'],
            $ctx['nome'],
            (string) $ctx['valorParcela'],
            $dataInicial,
            $dataFinal,
            $parcelas
        );
        $rec = $service->createRecurrence($recPayload);
        $idRec = (string) ($rec['idRec'] ?? '');
        if ($idRec !== '' && empty($rec['dadosQR']['pixCopiaECola'])) {
            $rec = $service->getRecurrence($idRec);
        }

        $pixAuto = [
            'historico' => $historico,
            'idRec' => $idRec,
            'contrato_efipay' => $contratoEfi,
            'status' => (string) ($rec['status'] ?? 'CRIADA'),
            'loc_id' => $locId,
            'pix_copia_cola' => (string) ($rec['dadosQR']['pixCopiaECola'] ?? ''),
            'valor_rec' => (string) $ctx['valorParcela'],
            'parcelas' => $parcelas,
            'data_inicial' => $dataInicial,
            'data_inicial_original' => $dataIni['original'] ?? '',
            'data_inicial_ajustada' => (bool) ($dataIni['ajustada'] ?? false),
            'data_final' => $dataFinal,
            'forma_pagamento' => $ctx['formaPag'],
            'criado_em' => gmdate('c'),
            'provider' => $provider,
            'mock' => strtolower($provider) !== 'efipay',
            'cpf_pagador' => $ctx['cpf'],
            'cpf_proposta' => (string) ($ctx['cpf_proposta'] ?? ''),
        ];

        if (pix_auto_can_verificar_conta($ctx)) {
            pix_auto_verificar_conta_apply($service, $ctx, $pixAuto);
        }
        pix_auto_consultar_apply($service, $pixAuto);
        $est['pix_automatico'] = $pixAuto;
        pix_auto_save_esteira($repo, $proposalId, $est);
        $fase = pix_auto_fluxo_fase($pixAuto, $parcelas);
        $efiSolic = null;
        $newSolic = (string) ($pixAuto['idSolicRec'] ?? '');
        if ($newSolic !== '') {
            $efiSolic = $service->getSolicRec($newSolic);
        }

        soublu_json([
            'ok' => true,
            'pix_automatico' => $pixAuto,
            'fase' => $fase,
            'conta_comparacao' => pix_auto_conta_comparacao($ctx, $pixAuto, $efiSolic),
            'polling' => true,
            'message' => 'Recorrência recriada com CPF ' . $ctx['cpf']
                . ((string) ($ctx['cpf_proposta'] ?? '') !== '' && (string) $ctx['cpf_proposta'] !== (string) $ctx['cpf']
                    ? ' (titular da conta; CPF na proposta: ' . $ctx['cpf_proposta'] . ')'
                    : '')
                . '. Nova verificação enviada ao banco.',
        ]);
    }

    if ($action === 'reenviar_verificacao') {
        $idRec = (string) ($pixAuto['idRec'] ?? '');
        if ($idRec === '') {
            soublu_json(['ok' => false, 'error' => 'Crie a recorrência antes de reenviar a verificação.'], 400);
        }
        if (!pix_auto_can_verificar_conta($ctx)) {
            soublu_json(['ok' => false, 'error' => 'Corrija banco, agência e conta na proposta antes de reenviar.'], 400);
        }
        $recStatus = strtoupper((string) ($pixAuto['status'] ?? ''));
        if ($recStatus === 'APROVADA') {
            soublu_json(['ok' => false, 'error' => 'Recorrência já aprovada — não é necessário reenviar.'], 409);
        }

        $oldSolic = (string) ($pixAuto['idSolicRec'] ?? '');
        if ($oldSolic !== '') {
            try {
                $service->cancelSolicRec($oldSolic);
            } catch (Throwable $cancelErr) {
                pix_auto_dbg_log('credito_pix_auto_api.php:reenviar_verificacao', 'cancel solicrec', [
                    'idSolicRec' => $oldSolic,
                    'error' => $cancelErr->getMessage(),
                ], 'reenviar-solic', 'post-fix');
            }
            unset($pixAuto['idSolicRec'], $pixAuto['solic_status']);
        }

        $solic = pix_auto_verificar_conta_apply($service, $ctx, $pixAuto);
        pix_auto_consultar_apply($service, $pixAuto);
        $est['pix_automatico'] = $pixAuto;
        pix_auto_save_esteira($repo, $proposalId, $est);
        $fase = pix_auto_fluxo_fase($pixAuto, (int) ($pixAuto['parcelas'] ?? $ctx['parcelas'] ?? 0));

        soublu_json([
            'ok' => true,
            'pix_automatico' => $pixAuto,
            'solicrec' => $solic,
            'fase' => $fase,
            'polling' => true,
            'message' => 'Nova verificação enviada ao banco'
                . ' (Ag ' . $ctx['agencia'] . ', conta ' . ($ctx['conta_raw'] ?: $ctx['conta']) . ').'
                . ' Peça ao funcionário abrir o painel SOU+BLU → Autorizar Pix no celular.',
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
