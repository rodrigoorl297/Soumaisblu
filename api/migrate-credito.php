<?php
/**
 * Verifica backend de propostas de crédito (MySQL Locaweb).
 * GET com header X-API-Key (API_INTERNAL_KEY).
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/CreditProposalRepository.php';

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
    $repo = soublu_credit_proposal_repository();
    $backend = soublu_credit_proposal_backend();
    echo json_encode([
        'ok' => $repo->tableExists(),
        'table' => 'proposals',
        'backend' => $backend,
        'message' => $repo->tableExists()
            ? 'Propostas de crédito OK no MySQL (proposals). Supabase v2 é exclusivo WhatsApp.'
            : 'MySQL indisponível — verifique config.db.local.php.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
