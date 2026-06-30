<?php
/**
 * Migração: tabela credit_proposals + colunas JSON (meta, history, etc.).
 * GET com header X-API-Key.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/CreditProposalMysqlSchema.php';

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
    $applied = soublu_ensure_credit_proposals_table(soublu_pdo());
    echo json_encode([
        'ok' => true,
        'applied' => $applied,
        'message' => $applied
            ? 'Migração credit_proposals: ' . implode(', ', $applied)
            : 'Tabela credit_proposals já está atualizada.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
