<?php
/**
 * Verifica / prepara credit_proposals no Supabase original (PostgreSQL).
 * GET com header X-API-Key.
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
    $backend = soublu_credit_proposal_backend();
    $repo = soublu_credit_proposal_repository();
    $exists = $repo->tableExists();

    $message = $exists
        ? "Tabela credit_proposals OK ({$backend})."
        : ($backend === 'supabase-legacy-pg'
            ? 'Rode supabase/migrations/20260622_credit_proposals.sql no projeto original sou+blu (dqptnlywbarvznpzgtuj).'
            : 'Fallback MySQL: tabela credit_proposals será criada automaticamente.');

    echo json_encode([
        'ok' => $exists,
        'table' => 'credit_proposals',
        'backend' => $backend,
        'supabase_url' => soublu_supabase_legacy_url(),
        'legacy_key_configured' => soublu_supabase_legacy_configured(),
        'message' => $message,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
