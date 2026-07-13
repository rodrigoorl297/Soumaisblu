<?php
/**
 * SOU+BLU — Propostas de Crédito (PostgreSQL Supabase original + fallback MySQL).
 *
 * Actions:
 *   GET  ?action=health
 *   GET  ?action=list[&employee_id=]
 *   GET  ?action=get&id=
 *   POST ?action=create
 *   POST ?action=update
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/CreditProposalRepository.php';
require_once __DIR__ . '/lib/FileStorage.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

function credito_json_body(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function credito_to_proposal_shape(array $row): array
{
    $esteira = is_array($row['esteira'] ?? null) ? $row['esteira'] : [];
    $retorno = is_array($row['retorno'] ?? null) ? $row['retorno'] : [];
    $meta = is_array($row['meta'] ?? null) ? $row['meta'] : [];
    $esteiraMeta = is_array($esteira['_meta'] ?? null) ? $esteira['_meta'] : [];
    if ($esteiraMeta !== []) {
        $meta = $meta === [] ? $esteiraMeta : array_merge($esteiraMeta, $meta);
    }
    $meta['credito'] = true;
    $meta['opcao_credito'] = true;
    $meta['credit_table'] = 'credit_proposals';
    $attachments = is_array($row['attachments'] ?? null) ? $row['attachments'] : [];
    $uploadDir = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $attachments = soublu_attachments_normalize_for_api($attachments, $uploadDir, false);

    return [
        'id' => $row['id'] ?? '',
        'numero' => $row['protocolo'] ?? '',
        'protocolo' => $row['protocolo'] ?? '',
        'employee_id' => $row['employee_id'] ?? '',
        'vendorId' => $row['vendor_id'] ?? $row['employee_id'] ?? '',
        'vendor_id' => $row['vendor_id'] ?? $row['employee_id'] ?? '',
        'vendorName' => $row['vendor_name'] ?? $row['employee_name'] ?? '',
        'vendor_name' => $row['vendor_name'] ?? $row['employee_name'] ?? '',
        'clientCpf' => $row['cpf'] ?? '',
        'client_cpf' => $row['cpf'] ?? '',
        'clientName' => $row['nome'] ?? '',
        'client_name' => $row['nome'] ?? '',
        'product' => 'CRÉDITO',
        'convenio' => 'INTERNO',
        'entidade' => 'FUNCIONÁRIO',
        'valor' => (float) ($row['valor_solicitado'] ?? 0),
        'valorFinal' => (float) ($row['valor_final'] ?? $row['valor_solicitado'] ?? 0),
        'valor_final' => (float) ($row['valor_final'] ?? $row['valor_solicitado'] ?? 0),
        'status' => $row['status'] ?? 'AG. ANÁLISE',
        'statusOp' => $row['status'] ?? 'AG. ANÁLISE',
        'status_op' => $row['status'] ?? 'AG. ANÁLISE',
        'obs' => $row['observacao'] ?? '',
        'creditoEsteira' => $esteira,
        'credito_esteira' => $esteira,
        'creditoRetorno' => $retorno,
        'credito_retorno' => $retorno,
        'attachments' => $attachments,
        'history' => is_array($row['history'] ?? null) ? $row['history'] : [],
        'meta' => $meta,
        'createdAt' => $row['created_at'] ?? null,
        'created_at' => $row['created_at'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
    ];
}

$action = strtolower(trim((string) ($_GET['action'] ?? 'health')));

try {
    soublu_ensure_credit_proposals_table(soublu_pdo());
    $repo = soublu_credit_proposal_repository();

    if ($action === 'health') {
        $backend = soublu_credit_proposal_backend();
        $exists = false;
        try {
            $exists = $repo->tableExists();
        } catch (Throwable $tableErr) {
            $exists = false;
        }
        $health = [
            'ok' => true,
            'table' => 'credit_proposals',
            'exists' => $exists,
            'backend' => $backend,
            'supabase_url' => function_exists('soublu_supabase_legacy_url') ? soublu_supabase_legacy_url() : '',
            'note' => 'Crédito em credit_proposals (PostgreSQL Supabase original). proposals MySQL = propostas normais.',
        ];
        // #region agent log — diagnóstico coluna meta (hipóteses A/B/C)
        if ($backend === 'mysql-credit_proposals') {
            $pdo = soublu_pdo();
            $colSt = $pdo->prepare(
                'SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
            );
            $colSt->execute(['credit_proposals', 'meta']);
            $health['meta_column_exists'] = (int) $colSt->fetchColumn() > 0;
            $logPath = dirname(__DIR__) . '/debug-97c411.log';
            @file_put_contents($logPath, json_encode([
                'sessionId' => '97c411',
                'timestamp' => (int) round(microtime(true) * 1000),
                'location' => 'credito_api.php:health',
                'message' => 'mysql health check',
                'data' => [
                    'meta_column_exists' => $health['meta_column_exists'],
                    'table_exists' => $health['exists'],
                ],
                'hypothesisId' => 'A,B',
                'runId' => 'pre-fix',
            ], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
        }
        // #endregion
        soublu_json($health);
    }

    if ($action === 'list') {
        $employeeId = trim((string) ($_GET['employee_id'] ?? ''));
        $rows = $employeeId !== '' ? $repo->listByEmployee($employeeId) : $repo->listAll();
        soublu_json([
            'ok' => true,
            'items' => array_map('credito_to_proposal_shape', $rows),
            'count' => count($rows),
        ]);
    }

    if ($action === 'get') {
        $id = trim((string) ($_GET['id'] ?? ''));
        if ($id === '') {
            soublu_json(['ok' => false, 'error' => 'id obrigatório.'], 400);
        }
        $row = $repo->getById($id);
        if (!$row) {
            soublu_json(['ok' => false, 'error' => 'Proposta não encontrada.'], 404);
        }
        soublu_json(['ok' => true, 'item' => credito_to_proposal_shape($row)]);
    }

    if ($action === 'create') {
        $body = credito_json_body();
        if (soublu_credit_proposal_backend() === 'mysql-credit_proposals') {
            soublu_ensure_credit_proposals_table(soublu_pdo());
        }
        if (isset($body['attachments']) && is_array($body['attachments'])) {
            $uploadDir = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
            $body['attachments'] = soublu_attachments_normalize_for_api($body['attachments'], $uploadDir, true);
        }
        $saved = $repo->create($body);
        soublu_json(['ok' => true, 'item' => credito_to_proposal_shape($saved)]);
    }

    if ($action === 'update') {
        $body = credito_json_body();
        $id = trim((string) ($body['id'] ?? $_GET['id'] ?? ''));
        if ($id === '') {
            soublu_json(['ok' => false, 'error' => 'id obrigatório.'], 400);
        }
        unset($body['id']);
        if (isset($body['attachments']) && is_array($body['attachments'])) {
            $uploadDir = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
            $body['attachments'] = soublu_attachments_normalize_for_api($body['attachments'], $uploadDir, true);
        }
        $saved = $repo->update($id, $body);
        soublu_json(['ok' => true, 'item' => credito_to_proposal_shape($saved)]);
    }

    if ($action === 'client_log') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST'], 405);
        }
        $body = credito_json_body();
        if (($body['sessionId'] ?? '') === '97c411') {
            $logPath = dirname(__DIR__) . '/debug-97c411.log';
            @file_put_contents($logPath, json_encode($body, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
        }
        soublu_json(['ok' => true]);
    }

    soublu_json(['ok' => false, 'error' => 'Ação inválida.'], 400);
} catch (Throwable $e) {
soublu_json(['ok' => false, 'error' => $e->getMessage(), 'debug' => $debug], 500);
}
