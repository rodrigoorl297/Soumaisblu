<?php
/**
 * Migração: colunas JSON em proposals (meta, history, attachments, crédito).
 * GET com header X-API-Key.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/ProposalMysqlSchema.php';

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
    $applied = soublu_ensure_proposals_json_columns(soublu_pdo());
    echo json_encode([
        'ok' => true,
        'applied' => $applied,
        'message' => $applied
            ? 'Colunas adicionadas em proposals: ' . implode(', ', $applied)
            : 'Colunas JSON de proposals já existem.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
