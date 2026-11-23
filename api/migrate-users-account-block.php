<?php
declare(strict_types=1);

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

    $cols = [
        'account_block_active' => "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=conta bloqueada (nao cadastra proposta)'",
        'account_block_code' => "VARCHAR(8) NULL COMMENT 'codigo motivo bloqueio 001-005'",
        'account_block_at' => 'DATETIME NULL',
        'account_block_by' => 'VARCHAR(64) NULL',
    ];

    foreach ($cols as $col => $ddl) {
        if (!$hasCol($pdo, 'users', $col)) {
            $pdo->exec('ALTER TABLE `users` ADD COLUMN `' . $col . '` ' . $ddl);
            $applied[] = 'users.' . $col;
        } else {
            $applied[] = 'users.' . $col . '_exists';
        }
    }

    if (!$hasTable($pdo, 'account_block_events')) {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `account_block_events` (
              `id` VARCHAR(64) NOT NULL,
              `user_id` VARCHAR(64) NOT NULL,
              `action` VARCHAR(16) NOT NULL COMMENT \'block|unblock\',
              `code` VARCHAR(8) NOT NULL,
              `label` VARCHAR(255) NOT NULL,
              `by_user_id` VARCHAR(64) NULL,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              KEY `idx_abe_user` (`user_id`),
              KEY `idx_abe_created` (`created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $applied[] = 'account_block_events';
    } else {
        $applied[] = 'account_block_events_exists';
    }

    /* Backfill: training_block legado → bloqueio estruturado 001 */
    if ($hasCol($pdo, 'users', 'training_block') && $hasCol($pdo, 'users', 'account_block_active')) {
        $n = $pdo->exec(
            "UPDATE `users`
             SET `account_block_active` = 1,
                 `account_block_code` = '001',
                 `account_block_at` = COALESCE(`account_block_at`, NOW())
             WHERE (`training_block` = 1 OR `training_block` = '1')
               AND (`account_block_active` = 0 OR `account_block_active` IS NULL
                    OR `account_block_code` IS NULL OR `account_block_code` = '')"
        );
        $applied[] = 'backfill_training_block_to_001:' . (int) $n;
    }

    soublu_json(['ok' => true, 'applied' => $applied]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
