<?php
declare(strict_types=1);

/**
 * Webhook / API — Boleto Validado → Hyper (n8n) + consulta.
 *
 * Auth: header X-API-Key = BOLETO_WEBHOOK_TOKEN (ou API_INTERNAL_KEY).
 *
 * Ações:
 *  POST ?action=notify  — dispara para BOLETO_WEBHOOK_URL (payload da proposta)
 *  GET  ?action=list    — lista eventos recentes (log local)
 *  GET  ?action=ping    — health
 */
require_once __DIR__ . '/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function boleto_webhook_token_ok(): bool
{
    $expected = '';
    if (defined('BOLETO_WEBHOOK_TOKEN') && (string) BOLETO_WEBHOOK_TOKEN !== '') {
        $expected = (string) BOLETO_WEBHOOK_TOKEN;
    } elseif (defined('API_INTERNAL_KEY')) {
        $expected = (string) API_INTERNAL_KEY;
    }
    if ($expected === '') {
        return false;
    }
    $token = (string) ($_SERVER['HTTP_X_API_KEY'] ?? '');
    if ($token === '' && isset($_GET['apikey'])) {
        $token = (string) $_GET['apikey'];
    }
    if ($token === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strtolower((string) $k) === 'x-api-key') {
                $token = (string) $v;
                break;
            }
        }
    }
    return $token !== '' && hash_equals($expected, $token);
}

function boleto_webhook_url(): string
{
    if (defined('BOLETO_WEBHOOK_URL')) {
        return trim((string) BOLETO_WEBHOOK_URL);
    }
    return '';
}

function boleto_hyperflow_client_id(): string
{
    if (defined('BOLETO_HYPERFLOW_CLIENT_ID')) {
        return trim((string) BOLETO_HYPERFLOW_CLIENT_ID);
    }
    return '';
}

function boleto_webhook_log_path(): string
{
    $dir = dirname(__DIR__) . '/data';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir . '/boleto_webhook_log.json';
}

/** @return list<array<string,mixed>> */
function boleto_webhook_read_log(): array
{
    $path = boleto_webhook_log_path();
    if (!is_file($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    $j = json_decode((string) $raw, true);
    return is_array($j) ? $j : [];
}

/** @param array<string,mixed> $entry */
function boleto_webhook_append_log(array $entry): void
{
    $list = boleto_webhook_read_log();
    array_unshift($list, $entry);
    $list = array_slice($list, 0, 500);
    file_put_contents(
        boleto_webhook_log_path(),
        json_encode($list, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        LOCK_EX
    );
}

function boleto_norm_status(string $s): string
{
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = preg_replace('/\s+/', ' ', $s) ?? $s;
    return $s;
}

function boleto_is_validado(array $p): bool
{
    $st = boleto_norm_status((string) ($p['status'] ?? ''));
    $op = boleto_norm_status((string) ($p['statusOp'] ?? $p['status_op'] ?? ''));
    $needle = 'boleto validado';
    return str_contains($st, $needle) || str_contains($op, $needle);
}

/**
 * @param array<string,mixed> $proposal
 * @param array<string,mixed>|null $client
 * @return array<string,mixed>
 */
function boleto_build_payload(array $proposal, ?array $client = null): array
{
    $phone1 = '';
    $phone2 = '';
    if (is_array($client)) {
        $phone1 = (string) ($client['phone1'] ?? $client['telefone'] ?? '');
        $phone2 = (string) ($client['phone2'] ?? '');
    }
    if ($phone1 === '') {
        $phone1 = (string) ($proposal['client_phone'] ?? $proposal['clientPhone'] ?? $proposal['phone1'] ?? '');
    }
    if ($phone2 === '' && isset($proposal['phone2'])) {
        $phone2 = (string) $proposal['phone2'];
    }

    $digits = static function (string $v): string {
        return preg_replace('/\D+/', '', $v) ?? '';
    };

    $p1 = $digits($phone1);
    $p2 = $digits($phone2);
    $nome = (string) ($proposal['clientName'] ?? $proposal['client_name'] ?? ($client['name'] ?? ''));
    $cpf = (string) ($proposal['clientCpf'] ?? $proposal['client_cpf'] ?? ($client['cpf'] ?? ''));
    $numero = (string) ($proposal['numero'] ?? '');
    $protocolo = (string) ($proposal['protocolo'] ?? '');
    $valorFinal = isset($proposal['valorFinal'])
        ? (float) $proposal['valorFinal']
        : (isset($proposal['valor_final']) ? (float) $proposal['valor_final'] : null);
    $valor = isset($proposal['valor']) ? (float) $proposal['valor'] : null;

    /* Campos flat no topo = {{input.telefone}} no Hyperflow API Gateway */
    return [
        'event' => 'boleto_validado',
        'at' => date('c'),
        'follow_up_at' => date('c', time() + 3 * 86400),
        'follow_up_days' => 3,
        'source' => 'soumaisblu',
        'hyperflow_app' => defined('BOLETO_HYPERFLOW_APP') ? (string) BOLETO_HYPERFLOW_APP : 'cs-call-1',
        'hyperflow_flow' => defined('BOLETO_HYPERFLOW_FLOW') ? (string) BOLETO_HYPERFLOW_FLOW : 'fluxo-flow-1',
        /* aliases usados no Builder */
        'telefone' => $p1 !== '' ? $p1 : $p2,
        'phone1' => $p1,
        'phone2' => $p2,
        'nome' => $nome,
        'cpf' => preg_replace('/\D+/', '', $cpf) ?? '',
        'numero' => $numero,
        'protocolo' => $protocolo,
        'valor' => $valor,
        'valorFinal' => $valorFinal,
        'vendedor' => (string) ($proposal['vendorName'] ?? $proposal['vendor_name'] ?? ''),
        'mensagem' => trim(sprintf(
            'Olá %s! Passaram 3 dias desde a validação do boleto da proposta %s. Podemos te ajudar com a próxima etapa?',
            $nome !== '' ? explode(' ', $nome)[0] : 'cliente',
            $numero !== '' ? $numero : 'informada'
        )),
        'proposal' => [
            'id' => (string) ($proposal['id'] ?? ''),
            'numero' => $numero,
            'protocolo' => $protocolo,
            'status' => (string) ($proposal['status'] ?? ''),
            'statusOp' => (string) ($proposal['statusOp'] ?? $proposal['status_op'] ?? ''),
            'valor' => $valor,
            'valorFinal' => $valorFinal,
            'product' => (string) ($proposal['product'] ?? ''),
            'convenio' => (string) ($proposal['convenio'] ?? ''),
            'cliente' => [
                'nome' => $nome,
                'cpf' => $cpf,
                'phone1' => $phone1,
                'phone1_digits' => $p1,
                'phone2' => $phone2,
                'phone2_digits' => $p2,
            ],
            'vendedor' => [
                'id' => (string) ($proposal['vendorId'] ?? $proposal['vendor_id'] ?? $proposal['employee_id'] ?? ''),
                'nome' => (string) ($proposal['vendorName'] ?? $proposal['vendor_name'] ?? ''),
            ],
        ],
    ];
}

/**
 * @param array<string,mixed> $payload
 * @return array{ok:bool,http?:int,body?:string,error?:string,skipped?:bool}
 */
function boleto_dispatch_to_hyper(array $payload): array
{
    $url = boleto_webhook_url();
    if ($url === '') {
        return ['ok' => false, 'skipped' => true, 'error' => 'BOLETO_WEBHOOK_URL não configurada (cole a URL do API Gateway Hyperflow)'];
    }

    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
        'X-Soublu-Event: boleto_validado',
    ];
    $clientId = boleto_hyperflow_client_id();
    if ($clientId !== '') {
        $headers[] = 'client_id: ' . $clientId;
    }

    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 8,
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err !== '') {
        return ['ok' => false, 'http' => $code, 'error' => $err, 'body' => (string) $resp];
    }
    if ($code < 200 || $code >= 300) {
        return ['ok' => false, 'http' => $code, 'error' => 'HTTP ' . $code, 'body' => (string) $resp];
    }
    return ['ok' => true, 'http' => $code, 'body' => (string) $resp];
}

if (!boleto_webhook_token_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.', 'hint' => 'Header X-API-Key'], 401);
}

$action = strtolower(trim((string) ($_GET['action'] ?? $_POST['action'] ?? 'ping')));
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($action === 'ping') {
    soublu_json([
        'ok' => true,
        'service' => 'boleto-webhook',
        'has_url' => boleto_webhook_url() !== '',
        'url_host' => (($u = boleto_webhook_url()) !== '' ? (parse_url($u, PHP_URL_HOST) ?: '') : ''),
    ]);
}

if ($action === 'list') {
    $limit = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
    $rows = array_slice(boleto_webhook_read_log(), 0, $limit);
    soublu_json(['ok' => true, 'count' => count($rows), 'items' => $rows]);
}

/** Eventos validados há N dias (padrão 3) — útil para cron no Hyper. */
if ($action === 'due') {
    $days = max(1, min(30, (int) ($_GET['days'] ?? 3)));
    $cutoff = time() - ($days * 86400);
    $due = [];
    foreach (boleto_webhook_read_log() as $row) {
        if (empty($row['ok']) || ($row['event'] ?? '') !== 'boleto_validado') {
            continue;
        }
        if (!empty($row['follow_up_done'])) {
            continue;
        }
        $ts = strtotime((string) ($row['at'] ?? ''));
        if ($ts === false || $ts > $cutoff) {
            continue;
        }
        $due[] = $row + [
            'age_days' => (int) floor((time() - $ts) / 86400),
            'follow_up_at' => date('c', $ts + ($days * 86400)),
        ];
    }
    soublu_json([
        'ok' => true,
        'days' => $days,
        'count' => count($due),
        'items' => array_slice($due, 0, 100),
    ]);
}

if ($action === 'notify') {
    if ($method !== 'POST') {
        soublu_json(['ok' => false, 'error' => 'Use POST'], 405);
    }
    $raw = file_get_contents('php://input') ?: '';
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        soublu_json(['ok' => false, 'error' => 'JSON inválido'], 400);
    }

    $proposal = $body['proposal'] ?? $body;
    if (!is_array($proposal) || empty($proposal['id'])) {
        soublu_json(['ok' => false, 'error' => 'proposal.id obrigatório'], 400);
    }

    $force = !empty($body['force']);
    $oldStatus = (string) ($body['old_status'] ?? $body['oldStatus'] ?? '');
    $oldOp = (string) ($body['old_status_op'] ?? $body['oldStatusOp'] ?? '');
    $client = isset($body['client']) && is_array($body['client']) ? $body['client'] : null;

    if (!$force && !boleto_is_validado($proposal)) {
        soublu_json(['ok' => true, 'skipped' => true, 'reason' => 'status_nao_boleto_validado']);
    }

    $wasAlready = boleto_is_validado([
        'status' => $oldStatus,
        'statusOp' => $op = $oldOp,
        'status_op' => $op,
    ]);
    if (!$force && $wasAlready) {
        soublu_json(['ok' => true, 'skipped' => true, 'reason' => 'ja_estava_validado']);
    }

    $payload = boleto_build_payload($proposal, $client);
    $pid = (string) $payload['proposal']['id'];

    /* Dedup: mesmo id nos últimos eventos com ok */
    if (!$force) {
        foreach (boleto_webhook_read_log() as $row) {
            if (($row['proposal_id'] ?? '') === $pid && !empty($row['ok']) && ($row['event'] ?? '') === 'boleto_validado') {
                soublu_json(['ok' => true, 'skipped' => true, 'reason' => 'ja_enviado', 'at' => $row['at'] ?? null]);
            }
        }
    }

    $result = boleto_dispatch_to_hyper($payload);
    $log = [
        'event' => 'boleto_validado',
        'at' => date('c'),
        'follow_up_at' => $payload['follow_up_at'] ?? date('c', time() + 3 * 86400),
        'proposal_id' => $pid,
        'numero' => $payload['proposal']['numero'],
        'cliente_nome' => $payload['proposal']['cliente']['nome'] ?? '',
        'phones' => [
            $payload['proposal']['cliente']['phone1_digits'],
            $payload['proposal']['cliente']['phone2_digits'],
        ],
        'payload' => $payload,
        'ok' => !empty($result['ok']),
        'http' => $result['http'] ?? null,
        'error' => $result['error'] ?? null,
        'skipped' => !empty($result['skipped']),
        'follow_up_done' => false,
    ];
    boleto_webhook_append_log($log);

    soublu_json([
        'ok' => !empty($result['ok']),
        'dispatched' => !empty($result['ok']),
        'skipped' => !empty($result['skipped']),
        'http' => $result['http'] ?? null,
        'error' => $result['error'] ?? null,
        'payload' => $payload,
    ], !empty($result['ok']) || !empty($result['skipped']) ? 200 : 502);
}

soublu_json(['ok' => false, 'error' => 'Ação inválida. Use ping|list|notify'], 400);
