<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
if (!soublu_api_auth_ok()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'step' => 'auth']);
    exit;
}
try {
    require_once __DIR__ . '/lib/FinanceMysqlSchema.php';
    require_once __DIR__ . '/lib/PostgRestCompat.php';
    soublu_ensure_finance_modulos_tables(soublu_pdo());
    $api = new PostgRestCompat(soublu_pdo());
    $rows = $api->handle('users', 'GET', null, 'select=id&limit=1');
    echo json_encode(['ok' => true, 'count' => count($rows)], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => $e->getMessage(),
        'file' => basename((string) $e->getFile()),
        'line' => $e->getLine(),
    ], JSON_UNESCAPED_UNICODE);
}
