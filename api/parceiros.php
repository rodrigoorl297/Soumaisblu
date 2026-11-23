<?php
declare(strict_types=1);

/**
 * parceiros.php — cadastros da landing /cadastro (tabela lp_parceiros).
 * POST público grava pendente. GET/PATCH do kanban (adminLP) exigem token.
 * Situações: pendente | em_negociacao | aprovado | recusado (+ arquivar/restaurar).
 * Portado/atualizado a partir de plim7plim/landingPageBlu.
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/lp-mailer.php';
require_once __DIR__ . '/lib/lp-soublu.php';
require_once __DIR__ . '/lib/lp-admin.php';
require_once __DIR__ . '/lib/lp-admin-actions.php';
require_once __DIR__ . '/lib/lp-partner-archive.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token, X-API-Key, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const LP_STATUSES = ['pendente', 'em_negociacao', 'aprovado', 'recusado'];

$method = $_SERVER['REQUEST_METHOD'] ?? '';

try {
    $pdo = soublu_pdo();
    lpEnsureTable($pdo);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'Serviço indisponível.'], 503);
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode((string) $raw, true);
    if (!is_array($data)) {
        soublu_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
    }

    $name = lpStr($data['name'] ?? '', 255);
    $document = lpStr($data['document'] ?? '', 32);
    $commercialPhone = lpStr($data['commercialPhone'] ?? '', 32);
    $commercialEmail = strtolower(lpStr($data['commercialEmail'] ?? '', 255));

    if ($name === '' || $document === '' || $commercialPhone === '' || $commercialEmail === '') {
        soublu_json(['ok' => false, 'error' => 'Dados obrigatórios ausentes.'], 400);
    }
    if (!filter_var($commercialEmail, FILTER_VALIDATE_EMAIL)) {
        soublu_json(['ok' => false, 'error' => 'E-mail comercial inválido.'], 400);
    }

    $docDigits = preg_replace('/\D/', '', $document) ?? '';
    if (strlen($docDigits) !== 11 && strlen($docDigits) !== 14) {
        soublu_json(['ok' => false, 'error' => 'Informe um CPF (11) ou CNPJ (14) válido.'], 400);
    }

    $stRecent = $pdo->prepare(
        'SELECT id FROM lp_parceiros WHERE document = ? AND created_at >= ? ORDER BY id DESC LIMIT 1'
    );
    $stRecent->execute([$document, date('c', time() - 120)]);
    if ($stRecent->fetch()) {
        soublu_json(['ok' => false, 'error' => 'Cadastro já enviado há pouco. Aguarde alguns minutos.'], 429);
    }

    try {
        $id = lpNewId($pdo);
        $ins = $pdo->prepare(
            'INSERT INTO lp_parceiros
              (id, created_at, name, document, commercial_phone, whatsapp_phone, commercial_email, financial_email, city, contact_time, works_commercial, has_address, credit_experience, message, status, status_updated_at)
             VALUES
              (:id, :created_at, :name, :document, :commercial_phone, :whatsapp_phone, :commercial_email, :financial_email, :city, :contact_time, :works_commercial, :has_address, :credit_experience, :message, \'pendente\', :status_updated_at)'
        );
        $now = date('c');
        $ins->execute([
            ':id' => $id,
            ':created_at' => $now,
            ':name' => $name,
            ':document' => $document,
            ':commercial_phone' => $commercialPhone,
            ':whatsapp_phone' => lpStr($data['whatsappPhone'] ?? '', 32),
            ':commercial_email' => $commercialEmail,
            ':financial_email' => strtolower(lpStr($data['financialEmail'] ?? '', 255)),
            ':city' => lpStr($data['city'] ?? '', 255),
            ':contact_time' => lpStr($data['contactTime'] ?? '', 64),
            ':works_commercial' => lpStr($data['worksCommercial'] ?? '', 16),
            ':has_address' => lpStr($data['hasAddress'] ?? '', 16),
            ':credit_experience' => lpStr($data['creditExperience'] ?? '', 16),
            ':message' => lpStr($data['message'] ?? '', 2000),
            ':status_updated_at' => $now,
        ]);
        soublu_json(['ok' => true, 'id' => $id], 201);
    } catch (Throwable $e) {
        error_log('lp_parceiros INSERT: ' . $e->getMessage());
        soublu_json(['ok' => false, 'error' => 'Não foi possível gravar o cadastro.'], 500);
    }
}

if ($method === 'GET') {
    lpRequireAdmin();
    header('Cache-Control: no-store');

    if (($_GET['action'] ?? '') === 'approval-challenge') {
        $id = $_GET['id'] ?? '';
        if (!is_string($id) || !ctype_digit($id)) {
            soublu_json(['ok' => false, 'error' => 'Cadastro inválido.'], 400);
        }
        try {
            $stmt = $pdo->prepare('SELECT * FROM lp_parceiros WHERE id = :id');
            $stmt->execute(['id' => $id]);
            $record = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$record) {
                soublu_json(['ok' => false, 'error' => 'Cadastro não encontrado.'], 404);
            }
            if (!empty($record['archived_at']) || !empty($record['soublu_user_id'])) {
                soublu_json(['ok' => false, 'error' => 'Atualize a lista: este cadastro está arquivado ou já possui acesso.'], 409);
            }
            soublu_json(['ok' => true, 'challenge' => issueApprovalChallenge($record)]);
        } catch (Throwable $e) {
            error_log('approval-challenge: ' . $e->getMessage());
            soublu_json(['ok' => false, 'error' => 'Não foi possível gerar a confirmação.'], 500);
        }
    }

    try {
        archiveExpiredPartners($pdo);
        $rows = $pdo->query('SELECT * FROM lp_parceiros ORDER BY id DESC')->fetchAll(PDO::FETCH_ASSOC);
        soublu_json([
            'ok' => true,
            'records' => array_map('lpRecordFromRow', $rows ?: []),
            'loginUrl' => lpLoginUrl(),
        ]);
    } catch (Throwable $e) {
        error_log('lp_parceiros LIST: ' . $e->getMessage());
        soublu_json(['ok' => false, 'error' => 'Falha ao listar cadastros.'], 500);
    }
}

if ($method === 'PATCH') {
    lpRequireAdmin();
    $raw = file_get_contents('php://input');
    $data = json_decode((string) $raw, true);
    if (!is_array($data)) {
        soublu_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
    }
    $id = $data['id'] ?? null;

    if (($data['action'] ?? null) === 'resend-email') {
        if ($id === null || $id === '') {
            soublu_json(['ok' => false, 'error' => 'id é obrigatório.'], 400);
        }
        $stmt = $pdo->prepare('SELECT * FROM lp_parceiros WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$record) {
            soublu_json(['ok' => false, 'error' => 'Cadastro não encontrado.'], 404);
        }
        if (empty($record['soublu_user_id']) || empty($record['soublu_temp_password'])) {
            soublu_json(['ok' => false, 'error' => 'Este cadastro ainda não tem acesso criado na Sou+Blu.'], 409);
        }
        $email = strtolower(trim((string) $record['commercial_email']));
        $sent = lpSendApprovalEmail($record, $email, (string) $record['soublu_temp_password']);
        soublu_json(['ok' => true, 'emailSent' => $sent]);
    }

    $action = $data['action'] ?? 'status';
    $status = $data['status'] ?? null;
    if (
        !is_scalar($id) || !ctype_digit((string) $id)
        || !in_array($action, ['status', 'archive', 'restore', 'delete'], true)
        || ($action === 'status' && !in_array($status, LP_STATUSES, true))
    ) {
        soublu_json(['ok' => false, 'error' => 'Cadastro ou ação inválidos.'], 400);
    }

    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT * FROM lp_parceiros WHERE id = :id FOR UPDATE');
        $stmt->execute(['id' => $id]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$record) {
            $pdo->rollBack();
            soublu_json(['ok' => false, 'error' => 'Cadastro não encontrado.'], 404);
        }

        // Optimistic lock — lista desatualizada.
        if (
            !array_key_exists('expectedStatus', $data)
            || !array_key_exists('expectedArchivedAt', $data)
            || !array_key_exists('expectedUpdatedAt', $data)
            || $data['expectedStatus'] !== $record['status']
            || $data['expectedArchivedAt'] !== ($record['archived_at'] ?? null)
            || $data['expectedUpdatedAt'] !== ($record['status_updated_at'] ?? null)
        ) {
            $pdo->rollBack();
            soublu_json(['ok' => false, 'error' => 'O cadastro foi atualizado. Recarregue a lista antes de continuar.'], 409);
        }

        if ($action === 'delete') {
            if ($record['status'] !== 'recusado' || ($data['confirmDelete'] ?? false) !== true) {
                $pdo->rollBack();
                soublu_json(['ok' => false, 'error' => 'A exclusão definitiva exige confirmação e só está disponível em Excluídos.'], 409);
            }
            $del = $pdo->prepare('DELETE FROM lp_parceiros WHERE id = :id');
            $del->execute(['id' => $id]);
            $pdo->commit();
            soublu_json(['ok' => true, 'deletedId' => (string) $id]);
        }

        $soublu = null;
        if ($action !== 'status') {
            if (!array_key_exists('archived_at', $record)) {
                $pdo->rollBack();
                soublu_json(['ok' => false, 'error' => 'Arquivamento indisponível: coluna archived_at ausente.'], 503);
            }
            $upd = $pdo->prepare(
                'UPDATE lp_parceiros SET archived_at = :archived, status_updated_at = :updated WHERE id = :id'
            );
            $upd->execute([
                'id' => $id,
                'archived' => $action === 'archive' ? date('c') : null,
                'updated' => $action === 'restore' ? date('c') : $record['status_updated_at'],
            ]);
        } else {
            if (!empty($record['archived_at'])) {
                $pdo->rollBack();
                soublu_json(['ok' => false, 'error' => 'Restaure o cadastro antes de alterar a situação.'], 409);
            }
            if ($status === 'aprovado' && empty($record['soublu_user_id']) && !consumeApprovalChallenge($record, $data)) {
                $pdo->rollBack();
                soublu_json(['ok' => false, 'error' => 'Confirmação inválida ou expirada. Abra uma nova confirmação.'], 409);
            }
            $upd = $pdo->prepare(
                'UPDATE lp_parceiros SET status = :status, status_updated_at = :updated WHERE id = :id'
            );
            $upd->execute(['status' => $status, 'updated' => date('c'), 'id' => $id]);
            if ($status === 'aprovado') {
                $soublu = lpSyncParceiroToSoublu($pdo, (string) $id);
            }
        }

        $stmt = $pdo->prepare('SELECT * FROM lp_parceiros WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $updated = $stmt->fetch(PDO::FETCH_ASSOC);
        $pdo->commit();
        soublu_json(['ok' => true, 'record' => lpRecordFromRow($updated ?: []), 'soublu' => $soublu]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('lp_parceiros PATCH: ' . $e->getMessage());
        soublu_json(['ok' => false, 'error' => 'Não foi possível salvar a alteração. Atualize a lista antes de tentar novamente.'], 500);
    }
}

soublu_json(['ok' => false, 'error' => 'Método não permitido.'], 405);
