<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/RhMysqlSchema.php';
header('Content-Type: application/json; charset=utf-8');
if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}
try {
    $result = soublu_ensure_rh_vagas_schema(soublu_pdo());
    soublu_json(['ok' => true, 'applied' => $result]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
