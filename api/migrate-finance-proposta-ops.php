<?php
/**
 * Migração: finance_proposta_ops (baixa comissão, prejuízo, débito parceiro).
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

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

$applied = [];

try {
    $pdo = soublu_pdo();

    $pdo->exec("CREATE TABLE IF NOT EXISTS `finance_proposta_ops` (
        `id` VARCHAR(64) NOT NULL,
        `type` VARCHAR(64) NOT NULL,
        `proposal_id` VARCHAR(64) NULL DEFAULT NULL,
        `proposal_numero` VARCHAR(128) NULL DEFAULT NULL,
        `created_by` VARCHAR(64) NULL DEFAULT NULL,
        `data` JSON NULL,
        `created_at` DATETIME NULL DEFAULT NULL,
        `updated_at` DATETIME NULL DEFAULT NULL,
        PRIMARY KEY (`id`),
        KEY `idx_fpo_type` (`type`),
        KEY `idx_fpo_proposal` (`proposal_id`),
        KEY `idx_fpo_created` (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $applied[] = 'finance_proposta_ops';

    $colCheck = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $colCheck->execute(['finance_proposta_ops', 'data']);
    if ((int) $colCheck->fetchColumn() === 0) {
        try {
            $pdo->exec('ALTER TABLE `finance_proposta_ops` ADD COLUMN `data` JSON NULL AFTER `created_by`');
        } catch (Throwable $e) {
            $pdo->exec('ALTER TABLE `finance_proposta_ops` ADD COLUMN `data` LONGTEXT NULL AFTER `created_by`');
        }
        $applied[] = 'finance_proposta_ops.data';
    }

    echo json_encode([
        'ok' => true,
        'applied' => $applied,
        'message' => 'Tabela finance_proposta_ops pronta.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
