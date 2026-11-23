<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/RhMysqlSchema.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

try {
    $result = soublu_ensure_rh_cbo_schema();
    soublu_json(['ok' => true, 'migration' => 'rh-cbo', 'added' => $result['added'] ?? []]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'migration' => 'rh-cbo', 'error' => $e->getMessage()], 500);
}
