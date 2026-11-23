<?php
declare(strict_types=1);

/**
 * migrate-vendor-pendencias — DDL da esteira de pendências do vendedor.
 * Cria vendor_pendencias, proposal_reminders e flags users.pendency_block_*.
 * Bloqueio independente do saque (account_block_*).
 */
require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

try {
    $pdo = soublu_pdo();
    $applied = [];

    $hasCol = static function (PDO $pdo, string $table, string $col): bool {
        $stmt = $pdo->prepare(
            'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
             LIMIT 1'
        );
        $stmt->execute([$table, $col]);
        return (bool) $stmt->fetchColumn();
    };

    $hasTable = static function (PDO $pdo, string $table): bool {
        $stmt = $pdo->prepare(
            'SELECT 1 FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
             LIMIT 1'
        );
        $stmt->execute([$table]);
        return (bool) $stmt->fetchColumn();
    };

    $userCols = [
        'pendency_block_active' => "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=bloqueado por pendencia vencida (nao cadastra proposta)'",
        'pendency_block_at' => 'DATETIME NULL',
        'pendency_block_by' => 'VARCHAR(64) NULL',
        'pendency_block_pendencia_id' => 'VARCHAR(64) NULL',
    ];

    foreach ($userCols as $col => $ddl) {
        if (!$hasCol($pdo, 'users', $col)) {
            $pdo->exec('ALTER TABLE `users` ADD COLUMN `' . $col . '` ' . $ddl);
            $applied[] = 'users.' . $col;
        } else {
            $applied[] = 'users.' . $col . '_exists';
        }
    }

    if (!$hasTable($pdo, 'vendor_pendencias')) {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `vendor_pendencias` (
              `id` VARCHAR(64) NOT NULL,
              `vendor_id` VARCHAR(64) NOT NULL,
              `vendor_name` VARCHAR(180) NULL,
              `supervisor_id` VARCHAR(64) NULL,
              `opened_by` VARCHAR(64) NULL,
              `opened_by_name` VARCHAR(180) NULL,
              `opened_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `due_at` DATETIME NOT NULL,
              `title` VARCHAR(255) NOT NULL,
              `description` TEXT NULL,
              `proposal_id` VARCHAR(64) NULL,
              `status` VARCHAR(24) NOT NULL DEFAULT \'aberta\',
              `resolved_at` DATETIME NULL,
              `resolved_by` VARCHAR(64) NULL,
              `resolved_note` TEXT NULL,
              `blocked_at` DATETIME NULL,
              `block_reason` VARCHAR(255) NULL,
              `unlocked_at` DATETIME NULL,
              `unlocked_by` VARCHAR(64) NULL,
              `unlock_note` TEXT NULL,
              `history` LONGTEXT NULL,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              KEY `idx_vp_vendor` (`vendor_id`),
              KEY `idx_vp_sup` (`supervisor_id`),
              KEY `idx_vp_status` (`status`),
              KEY `idx_vp_due` (`due_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $applied[] = 'vendor_pendencias';
    } else {
        $applied[] = 'vendor_pendencias_exists';
    }

    if (!$hasTable($pdo, 'proposal_reminders')) {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `proposal_reminders` (
              `id` VARCHAR(64) NOT NULL,
              `proposal_id` VARCHAR(64) NOT NULL,
              `vendor_id` VARCHAR(64) NOT NULL,
              `kind` VARCHAR(40) NOT NULL DEFAULT \'boleto_validado\',
              `client_name` VARCHAR(180) NULL,
              `active` TINYINT(1) NOT NULL DEFAULT 1,
              `last_reminded_at` DATETIME NULL,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              KEY `idx_pr_vendor` (`vendor_id`),
              KEY `idx_pr_prop` (`proposal_id`),
              KEY `idx_pr_active` (`active`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $applied[] = 'proposal_reminders';
    } else {
        $applied[] = 'proposal_reminders_exists';
    }

    soublu_json(['ok' => true, 'applied' => $applied]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
