<?php
/**
 * Migração: tabelas finance_adiantamento e finance_reembolso.
 * GET com header X-API-Key (API_INTERNAL_KEY) ou apikey.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/FinanceMysqlSchema.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Não autorizado'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = soublu_pdo();
    $existsBefore = soublu_finance_modulos_tables_exist($pdo);
    $applied = soublu_ensure_finance_modulos_tables($pdo);

    echo json_encode([
        'ok' => true,
        'applied' => $applied,
        'tables_exist' => soublu_finance_modulos_tables_exist($pdo),
        'message' => $existsBefore
            ? 'Nada a migrar — tabelas finance_adiantamento e finance_reembolso já existem.'
            : 'Tabelas finance_adiantamento e finance_reembolso criadas no MySQL.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
