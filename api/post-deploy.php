<?php
/**
 * Pós-deploy: repara anexos de propostas (Locaweb → Supabase + URLs no MySQL).
 *
 * GET  — status e instruções
 * POST — executa um lote (body JSON opcional: limit, offset, dry_run, only_locaweb, from_date, to_date)
 * Header obrigatório: X-API-Key (API_INTERNAL_KEY em config.db.local.php)
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado. Envie header X-API-Key.'], 401);
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'GET') {
    soublu_json([
        'ok' => true,
        'message' => 'POST com X-API-Key para reparar anexos. Depois Ctrl+F5 no painel.',
        'repair_url' => '/api/repair-proposal-attachments.php',
        'example_curl' => 'curl -s -X POST "https://www.soumaisblu.com.br/api/post-deploy.php" -H "X-API-Key: SEU_API_INTERNAL_KEY" -H "Content-Type: application/json" -d "{\"limit\":100,\"offset\":0}"',
        'configs_required' => [
            'config.db.local.php' => ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'API_INTERNAL_KEY', 'SITE_URL', 'UPLOAD_DIR'],
            'config.supabase.local.php' => ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_ANON_KEY'],
        ],
    ]);
}

$body = [];
$raw = file_get_contents('php://input');
if (is_string($raw) && trim($raw) !== '') {
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        $body = $decoded;
    }
}

$params = [
    'limit' => max(1, min(500, (int) ($body['limit'] ?? $_GET['limit'] ?? 100))),
    'offset' => max(0, (int) ($body['offset'] ?? $_GET['offset'] ?? 0)),
];
if (!empty($body['dry_run']) || (isset($_GET['dry_run']) && (string) $_GET['dry_run'] === '1')) {
    $params['dry_run'] = '1';
}
if (!empty($body['only_locaweb']) || (isset($_GET['only_locaweb']) && (string) $_GET['only_locaweb'] === '1')) {
    $params['only_locaweb'] = '1';
}
foreach (['from_date', 'to_date'] as $dk) {
    $v = trim((string) ($body[$dk] ?? $_GET[$dk] ?? ''));
    if ($v !== '') {
        $params[$dk] = $v;
    }
}

$qs = http_build_query($params);
$repairScript = __DIR__ . '/repair-proposal-attachments.php';
if (!is_file($repairScript)) {
    soublu_json(['ok' => false, 'error' => 'repair-proposal-attachments.php ausente.'], 500);
}

$_GET = array_merge($_GET, $params);
$_SERVER['REQUEST_METHOD'] = 'GET';
require $repairScript;
