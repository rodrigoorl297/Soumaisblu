<?php
declare(strict_types=1);

/**
 * API Hyperflow ← SOU+BLU
 *
 * A Hyperflow chama esta API (com X-API-Key) e puxa da base:
 * propostas com BOLETO VALIDADO + telefones do cliente.
 *
 * GET/POST ?action=
 *   ping              — health
 *   list              — todos boletos validados (limit)
 *   due               — validados há >= N dias (padrão 3) e ainda sem follow-up
 *   mark_sent         — POST { id } marca follow-up enviado (meta)
 *
 * Auth: header X-API-Key = BOLETO_WEBHOOK_TOKEN ou API_INTERNAL_KEY
 *
 * Exemplo Hyperflow (HTTP Request no fluxo / Schedule diário):
 *   GET https://www.soumaisblu.com.br/api/hyperflow-boleto.php?action=due&days=3
 *   Header: X-API-Key: <token>
 */
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization, client_id');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function hf_boleto_token_ok(): bool
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

function hf_digits(string $v): string
{
    return preg_replace('/\D+/', '', $v) ?? '';
}

function hf_norm(string $s): string
{
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = preg_replace('/\s+/', ' ', $s) ?? $s;
    return $s;
}

function hf_is_boleto_validado(array $row): bool
{
    $st = hf_norm((string) ($row['status'] ?? ''));
    $op = hf_norm((string) ($row['status_op'] ?? $row['statusOp'] ?? ''));
    return str_contains($st, 'boleto validado') || str_contains($op, 'boleto validado');
}

/** Data em que virou BOLETO VALIDADO (history) ou updated_at/created_at. */
function hf_validated_at(array $row): ?string
{
    $hist = $row['history'] ?? null;
    if (is_string($hist) && $hist !== '') {
        $decoded = json_decode($hist, true);
        if (is_array($decoded)) {
            $hist = $decoded;
        }
    }
    if (is_array($hist)) {
        for ($i = count($hist) - 1; $i >= 0; $i--) {
            $h = $hist[$i];
            if (!is_array($h)) {
                continue;
            }
            $action = hf_norm((string) ($h['action'] ?? ''));
            if (str_contains($action, 'boleto validado')) {
                $d = (string) ($h['date'] ?? '');
                if ($d !== '') {
                    return $d;
                }
            }
        }
    }
    $fallback = (string) ($row['updated_at'] ?? $row['updatedAt'] ?? $row['created_at'] ?? $row['createdAt'] ?? '');
    return $fallback !== '' ? $fallback : null;
}

function hf_meta(array $row): array
{
    $m = $row['meta'] ?? null;
    if (is_string($m) && $m !== '') {
        $d = json_decode($m, true);
        return is_array($d) ? $d : [];
    }
    return is_array($m) ? $m : [];
}

/**
 * @param array<string,mixed> $row proposal
 * @param array<string,mixed>|null $client
 * @return array<string,mixed>
 */
function hf_item(array $row, ?array $client, int $followUpDays = 3): array
{
    $phone1 = '';
    $phone2 = '';
    if ($client) {
        $phone1 = (string) ($client['phone1'] ?? $client['telefone'] ?? '');
        $phone2 = (string) ($client['phone2'] ?? '');
    }
    $meta = hf_meta($row);
    if ($phone1 === '') {
        $phone1 = (string) ($meta['phone1'] ?? $meta['client_phone'] ?? $row['client_phone'] ?? '');
    }

    $p1 = hf_digits($phone1);
    $p2 = hf_digits($phone2);
    $nome = (string) ($row['client_name'] ?? $row['clientName'] ?? ($client['name'] ?? ''));
    $cpf = hf_digits((string) ($row['client_cpf'] ?? $row['clientCpf'] ?? ($client['cpf'] ?? '')));
    $numero = (string) ($row['numero'] ?? '');
    $validatedAt = hf_validated_at($row) ?: date('c');
    $ts = strtotime($validatedAt) ?: time();
    $followAt = date('c', $ts + ($followUpDays * 86400));
    $ageDays = (int) floor((time() - $ts) / 86400);
    $firstName = $nome !== '' ? explode(' ', trim($nome))[0] : 'cliente';

    return [
        'id' => (string) ($row['id'] ?? ''),
        'event' => 'boleto_validado',
        'numero' => $numero,
        'protocolo' => (string) ($row['protocolo'] ?? ''),
        'status' => (string) ($row['status'] ?? ''),
        'statusOp' => (string) ($row['status_op'] ?? $row['statusOp'] ?? ''),
        'nome' => $nome,
        'cpf' => $cpf,
        'telefone' => $p1 !== '' ? $p1 : $p2,
        'phone1' => $p1,
        'phone2' => $p2,
        'vendedor' => (string) ($row['vendor_name'] ?? $row['vendorName'] ?? ''),
        'vendedor_id' => (string) ($row['vendor_id'] ?? $row['vendorId'] ?? $row['employee_id'] ?? ''),
        'valor' => isset($row['valor']) ? (float) $row['valor'] : null,
        'valorFinal' => isset($row['valor_final'])
            ? (float) $row['valor_final']
            : (isset($row['valorFinal']) ? (float) $row['valorFinal'] : null),
        'validated_at' => $validatedAt,
        'follow_up_at' => $followAt,
        'follow_up_days' => $followUpDays,
        'age_days' => $ageDays,
        'follow_up_done' => !empty($meta['boleto_follow_up_done']),
        'mensagem' => sprintf(
            'Olá %s! Passaram %d dias desde a validação do boleto da proposta %s. Podemos te ajudar com a próxima etapa?',
            $firstName,
            $followUpDays,
            $numero !== '' ? $numero : 'informada'
        ),
        'hyperflow_app' => defined('BOLETO_HYPERFLOW_APP') ? (string) BOLETO_HYPERFLOW_APP : 'cs-call-1',
        'hyperflow_flow' => defined('BOLETO_HYPERFLOW_FLOW') ? (string) BOLETO_HYPERFLOW_FLOW : 'fluxo-flow-1',
    ];
}

function hf_table_has(PDO $pdo, string $table, string $col): bool
{
    static $cache = [];
    $key = $table;
    if (!isset($cache[$key])) {
        $stmt = $pdo->query('SHOW COLUMNS FROM `' . str_replace('`', '', $table) . '`');
        $cols = [];
        foreach ($stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [] as $r) {
            $cols[(string) ($r['Field'] ?? '')] = true;
        }
        $cache[$key] = $cols;
    }
    return isset($cache[$key][$col]);
}

/**
 * @return list<array<string,mixed>>
 */
function hf_fetch_boleto_rows(PDO $pdo, int $limit = 200): array
{
    $limit = max(1, min(500, $limit));
    $cols = [];
    $stmtCols = $pdo->query('SHOW COLUMNS FROM `proposals`');
    foreach ($stmtCols ? $stmtCols->fetchAll(PDO::FETCH_ASSOC) : [] as $r) {
        $f = (string) ($r['Field'] ?? '');
        if ($f !== '') {
            $cols[$f] = true;
        }
    }
    $has = static fn (string $c): bool => isset($cols[$c]);

    $statusOpCol = $has('status_op') ? 'status_op' : ($has('statusOp') ? 'statusOp' : null);
    $pick = static function (array $names) use ($has): ?string {
        foreach ($names as $n) {
            if ($has($n)) {
                return $n;
            }
        }
        return null;
    };

    $select = ['`id`'];
    foreach (['numero', 'protocolo', 'status', 'history', 'meta', 'valor', 'employee_id'] as $c) {
        if ($has($c)) {
            $select[] = '`' . $c . '`';
        }
    }
    if ($statusOpCol) {
        $select[] = '`' . $statusOpCol . '` AS `status_op`';
    }
    $mapAlias = [
        'client_cpf' => ['client_cpf', 'clientCpf'],
        'client_name' => ['client_name', 'clientName'],
        'vendor_name' => ['vendor_name', 'vendorName'],
        'vendor_id' => ['vendor_id', 'vendorId'],
        'valor_final' => ['valor_final', 'valorFinal'],
        'updated_at' => ['updated_at', 'updatedAt'],
        'created_at' => ['created_at', 'createdAt'],
    ];
    foreach ($mapAlias as $alias => $cands) {
        $col = $pick($cands);
        if ($col) {
            $select[] = '`' . $col . '` AS `' . $alias . '`';
        }
    }

    $where = ["LOWER(COALESCE(`status`,'')) LIKE :q1"];
    if ($statusOpCol) {
        $where[] = 'LOWER(COALESCE(`' . $statusOpCol . '`,\'\')) LIKE :q2';
    }
    $orderCol = $pick(['updated_at', 'updatedAt', 'created_at', 'createdAt', 'id']) ?: 'id';

    $sql = 'SELECT ' . implode(', ', $select)
        . ' FROM `proposals` WHERE (' . implode(' OR ', $where) . ')'
        . ' ORDER BY `' . $orderCol . '` DESC LIMIT ' . (int) $limit;

    $stmt = $pdo->prepare($sql);
    $params = ['q1' => '%boleto validado%'];
    if ($statusOpCol) {
        $params['q2'] = '%boleto validado%';
    }
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    return array_values(array_filter($rows, static fn ($r) => hf_is_boleto_validado($r)));
}

/**
 * @param list<string> $cpfs
 * @return array<string,array<string,mixed>>
 */
function hf_clients_by_cpf(PDO $pdo, array $cpfs): array
{
    $cpfs = array_values(array_unique(array_filter(array_map('hf_digits', $cpfs))));
    if ($cpfs === []) {
        return [];
    }
    $map = [];
    $chunkSize = 50;
    for ($i = 0; $i < count($cpfs); $i += $chunkSize) {
        $chunk = array_slice($cpfs, $i, $chunkSize);
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        try {
            $stmt = $pdo->prepare("SELECT * FROM `clients` WHERE `cpf` IN ({$ph}) OR `id` IN ({$ph})");
            $stmt->execute(array_merge($chunk, $chunk));
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $c) {
                $k = hf_digits((string) ($c['cpf'] ?? $c['id'] ?? ''));
                if ($k !== '') {
                    $map[$k] = $c;
                }
            }
        } catch (Throwable $e) {
            try {
                $stmt = $pdo->prepare("SELECT * FROM `clients` WHERE `cpf` IN ({$ph})");
                $stmt->execute($chunk);
                foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $c) {
                    $k = hf_digits((string) ($c['cpf'] ?? ''));
                    if ($k !== '') {
                        $map[$k] = $c;
                    }
                }
            } catch (Throwable $e2) {
                /* ignore */
            }
        }
    }
    /* match digit-only even if DB stores formatted CPF */
    if ($map === [] && $cpfs !== []) {
        try {
            $all = $pdo->query('SELECT * FROM `clients` LIMIT 5000');
            foreach ($all ? $all->fetchAll(PDO::FETCH_ASSOC) : [] as $c) {
                $k = hf_digits((string) ($c['cpf'] ?? $c['id'] ?? ''));
                if ($k !== '' && in_array($k, $cpfs, true)) {
                    $map[$k] = $c;
                }
            }
        } catch (Throwable $e) {
            /* ignore */
        }
    }
    return $map;
}

if (!hf_boleto_token_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.', 'hint' => 'Header X-API-Key'], 401);
}

$action = strtolower(trim((string) ($_GET['action'] ?? '')));
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$rawBody = file_get_contents('php://input') ?: '';
$jsonBody = $rawBody !== '' ? json_decode($rawBody, true) : null;
if (is_array($jsonBody) && $action === '' && isset($jsonBody['action'])) {
    $action = strtolower(trim((string) $jsonBody['action']));
}
if ($action === '') {
    $action = 'ping';
}

if ($action === 'ping') {
    soublu_json([
        'ok' => true,
        'service' => 'hyperflow-boleto',
        'base' => 'soumaisblu',
        'flow' => defined('BOLETO_HYPERFLOW_FLOW_URL')
            ? (string) BOLETO_HYPERFLOW_FLOW_URL
            : 'https://integracoes.hyperflow.global/apps/cs-call-1/flows/fluxo-flow-1',
        'endpoints' => [
            'list' => '/api/hyperflow-boleto.php?action=list',
            'due' => '/api/hyperflow-boleto.php?action=due&days=3',
            'mark_sent' => 'POST /api/hyperflow-boleto.php?action=mark_sent',
        ],
    ]);
}

try {
    $pdo = soublu_pdo();
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'Falha DB: ' . $e->getMessage()], 500);
}

if ($action === 'list' || $action === 'due') {
    try {
        /* days=0 liberado para teste imediato do pós-venda */
        $days = max(0, min(30, (int) ($_GET['days'] ?? ($jsonBody['days'] ?? 3))));
        $limit = max(1, min(500, (int) ($_GET['limit'] ?? ($jsonBody['limit'] ?? 200))));
        $onlyWithPhone = !isset($_GET['require_phone']) || (string) $_GET['require_phone'] !== '0';

        $rows = hf_fetch_boleto_rows($pdo, $limit);
        $cpfs = [];
        foreach ($rows as $r) {
            $cpfs[] = (string) ($r['client_cpf'] ?? '');
        }
        $clients = hf_clients_by_cpf($pdo, $cpfs);

        $items = [];
        $now = time();
        foreach ($rows as $r) {
            $cpf = hf_digits((string) ($r['client_cpf'] ?? ''));
            $item = hf_item($r, $clients[$cpf] ?? null, $days);
            if ($onlyWithPhone && $item['telefone'] === '') {
                continue;
            }
            if ($action === 'due') {
                if (!empty($item['follow_up_done'])) {
                    continue;
                }
                $ts = strtotime((string) $item['validated_at']);
                if ($ts === false || ($now - $ts) < ($days * 86400)) {
                    continue;
                }
            }
            $items[] = $item;
        }

        soublu_json([
            'ok' => true,
            'action' => $action,
            'days' => $days,
            'count' => count($items),
            'items' => $items,
        ]);
    } catch (Throwable $e) {
        soublu_json([
            'ok' => false,
            'error' => $e->getMessage(),
            'file' => basename($e->getFile()),
            'line' => $e->getLine(),
        ], 500);
    }
}

if ($action === 'mark_sent') {
    if ($method !== 'POST') {
        soublu_json(['ok' => false, 'error' => 'Use POST { id }'], 405);
    }
    $id = trim((string) ($jsonBody['id'] ?? $_GET['id'] ?? ''));
    if ($id === '') {
        soublu_json(['ok' => false, 'error' => 'id obrigatório'], 400);
    }
    $stmt = $pdo->prepare('SELECT id, meta FROM `proposals` WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        soublu_json(['ok' => false, 'error' => 'Proposta não encontrada'], 404);
    }
    $meta = hf_meta($row);
    $meta['boleto_follow_up_done'] = true;
    $meta['boleto_follow_up_at'] = date('c');
    $metaJson = json_encode($meta, JSON_UNESCAPED_UNICODE);
    $upd = $pdo->prepare('UPDATE `proposals` SET `meta` = ? WHERE `id` = ?');
    $upd->execute([$metaJson, $id]);
    soublu_json(['ok' => true, 'id' => $id, 'follow_up_done' => true]);
}

soublu_json(['ok' => false, 'error' => 'Ação inválida. Use ping|list|due|mark_sent'], 400);
