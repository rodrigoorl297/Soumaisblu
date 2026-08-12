<?php
declare(strict_types=1);

/**
 * Schema das tabelas de leads (unlock etc.).
 * A tabela lead_unlock_requests em produção estava só com `id` — sem user_id.
 */
function soublu_leads_unlock_schema_ok(?PDO $pdo = null): bool
{
    $pdo = $pdo ?? soublu_pdo();
    try {
        $st = $pdo->query("SHOW COLUMNS FROM `lead_unlock_requests` LIKE 'user_id'");
        return (bool) ($st && $st->fetch());
    } catch (Throwable $e) {
        return false;
    }
}

function soublu_ensure_leads_tables(?PDO $pdo = null): array
{
    static $done = false;
    static $applied = [];
    if ($done) {
        return $applied;
    }

    $pdo = $pdo ?? soublu_pdo();

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `lead_unlock_requests` (
            `id` VARCHAR(64) NOT NULL,
            `user_id` VARCHAR(64) NOT NULL,
            `status` VARCHAR(32) NOT NULL DEFAULT \'pending\',
            `reason` TEXT NULL,
            `lock_date` VARCHAR(32) NULL,
            `deficit` INT NULL DEFAULT 0,
            `approved_by` VARCHAR(64) NULL,
            `requested_at` DATETIME NULL,
            `resolved_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_lur_user` (`user_id`),
            KEY `idx_lur_status` (`status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'lead_unlock_requests';

    $cols = [
        'user_id' => "ADD COLUMN `user_id` VARCHAR(64) NULL AFTER `id`",
        'status' => "ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'pending'",
        'reason' => "ADD COLUMN `reason` TEXT NULL",
        'lock_date' => "ADD COLUMN `lock_date` VARCHAR(32) NULL",
        'deficit' => "ADD COLUMN `deficit` INT NULL DEFAULT 0",
        'approved_by' => "ADD COLUMN `approved_by` VARCHAR(64) NULL",
        'requested_at' => "ADD COLUMN `requested_at` DATETIME NULL",
        'resolved_at' => "ADD COLUMN `resolved_at` DATETIME NULL",
        'created_at' => "ADD COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    ];

    foreach ($cols as $name => $ddl) {
        try {
            $st = $pdo->query("SHOW COLUMNS FROM `lead_unlock_requests` LIKE " . $pdo->quote($name));
            if ($st && $st->fetch()) {
                continue;
            }
            $pdo->exec('ALTER TABLE `lead_unlock_requests` ' . $ddl);
            $applied[] = 'lead_unlock_requests.' . $name;
        } catch (Throwable $e) {
            /* best-effort — coluna pode já existir sob outro nome */
        }
    }

    try {
        $idx = $pdo->query("SHOW INDEX FROM `lead_unlock_requests` WHERE Key_name = 'idx_lur_user'")->fetch();
        if (!$idx) {
            $pdo->exec('ALTER TABLE `lead_unlock_requests` ADD KEY `idx_lur_user` (`user_id`)');
            $applied[] = 'lead_unlock_requests.idx_user';
        }
    } catch (Throwable $e) {
        /* ignore */
    }

    $done = true;
    return $applied;
}

function soublu_ensure_leads_indexes(?PDO $pdo = null): void
{
    static $done = false;
    if ($done) return;
    $pdo = $pdo ?? soublu_pdo();
    $indexes = [
        'idx_leads_batch' => 'ADD KEY `idx_leads_batch` (`batch_id`)',
        'idx_leads_assigned' => 'ADD KEY `idx_leads_assigned` (`assigned_to`)',
        'idx_leads_status' => 'ADD KEY `idx_leads_status` (`status`)',
    ];
    foreach ($indexes as $name => $ddl) {
        try {
            $st = $pdo->query("SHOW INDEX FROM `leads` WHERE Key_name = " . $pdo->quote($name));
            if (!$st || !$st->fetch()) {
                $pdo->exec('ALTER TABLE `leads` ' . $ddl);
            }
        } catch (Throwable $e) {
            /* best effort */
        }
    }
    $done = true;
}
