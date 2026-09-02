<?php
declare(strict_types=1);

/**
 * Arquivo: api/restore-archived-proposal.php
 * O que é: recoloca no MySQL uma proposta que sumiu, a partir da cópia Localweb.
 * O que faz: POST { proposal_id: "PROP-..." } lê proposal_archive (ou o JSON em disco)
 *            e dá INSERT se a linha viva não existir.
 * Auth: mesmo X-API-Key da API.
 */
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/ProposalArchive.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Soublu-Actor');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$pdo = soublu_pdo();
soublu_proposal_archive_ensure_table($pdo);

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$raw = file_get_contents('php://input') ?: '';
$body = $raw !== '' ? json_decode($raw, true) : [];
if (!is_array($body)) {
    $body = [];
}

$proposalId = trim((string) ($body['proposal_id'] ?? $_GET['proposal_id'] ?? ''));
$cpf = preg_replace('/\D/', '', (string) ($body['cpf'] ?? $_GET['cpf'] ?? '')) ?: '';

if ($method === 'GET') {
    if ($proposalId !== '') {
        $row = soublu_proposal_archive_latest($pdo, $proposalId);
        soublu_json(['ok' => true, 'archive' => $row ? archive_public($row) : null]);
    }
    if (strlen($cpf) === 11) {
        $st = $pdo->prepare(
            'SELECT id, proposal_id, client_cpf, client_name, numero, product, status, archived_at, archived_by, file_path
             FROM proposal_archive WHERE client_cpf = ? ORDER BY archived_at DESC LIMIT 40'
        );
        $st->execute([$cpf]);
        soublu_json(['ok' => true, 'archives' => $st->fetchAll(PDO::FETCH_ASSOC)]);
    }
    soublu_json(['ok' => false, 'error' => 'Informe proposal_id ou cpf.'], 400);
}

if ($method !== 'POST') {
    soublu_json(['ok' => false, 'error' => 'Use GET (consulta) ou POST (restaurar).'], 405);
}

if ($proposalId === '') {
    soublu_json(['ok' => false, 'error' => 'proposal_id obrigatorio.'], 400);
}

$chk = $pdo->prepare('SELECT id, status FROM proposals WHERE id = ? LIMIT 1');
$chk->execute([$proposalId]);
$live = $chk->fetch(PDO::FETCH_ASSOC);
if ($live) {
    soublu_json([
        'ok' => true,
        'restored' => false,
        'message' => 'A proposta ainda existe no banco (nao sumiu). Status: ' . ($live['status'] ?? ''),
        'id' => $live['id'],
    ]);
}

$arch = soublu_proposal_archive_latest($pdo, $proposalId);
if (!$arch) {
    soublu_json(['ok' => false, 'error' => 'Nenhuma copia na Localweb para este id.'], 404);
}

$snap = json_decode((string) ($arch['snapshot'] ?? ''), true);
$prop = is_array($snap['proposal'] ?? null) ? $snap['proposal'] : null;
if (!is_array($prop) || empty($prop['id'])) {
    soublu_json(['ok' => false, 'error' => 'Snapshot invalido no arquivo.'], 500);
}

$colsStmt = $pdo->query('SHOW COLUMNS FROM `proposals`');
$allowed = $colsStmt ? array_map(static fn ($c) => (string) $c['Field'], $colsStmt->fetchAll(PDO::FETCH_ASSOC)) : [];
$insert = [];
foreach ($prop as $k => $v) {
    if (!in_array($k, $allowed, true)) {
        continue;
    }
    if (is_array($v) || is_object($v)) {
        $insert[$k] = json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } else {
        $insert[$k] = $v;
    }
}
$insert['id'] = $proposalId;
if (in_array('status', $allowed, true) && empty($insert['status'])) {
    $insert['status'] = 'Cancelado';
}

$fields = array_keys($insert);
$place = implode(',', array_fill(0, count($fields), '?'));
$sql = 'INSERT INTO `proposals` (`' . implode('`,`', $fields) . '`) VALUES (' . $place . ')';
$pdo->prepare($sql)->execute(array_values($insert));

soublu_json([
    'ok' => true,
    'restored' => true,
    'id' => $proposalId,
    'from_archive' => $arch['id'],
    'file_path' => $arch['file_path'],
]);

function archive_public(array $row): array
{
    unset($row['snapshot']);
    return $row;
}
