<?php
declare(strict_types=1);

function soublu_ensure_internal_chat_tables(?PDO $pdo = null): array
{
    static $done = false;
    static $applied = [];

    if ($done) {
        return $applied;
    }

    $pdo = $pdo ?? soublu_pdo();

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `internal_chat_threads` (
            `id` VARCHAR(64) NOT NULL,
            `pair_key` VARCHAR(140) NOT NULL,
            `user_a_id` VARCHAR(64) NOT NULL,
            `user_b_id` VARCHAR(64) NOT NULL,
            `user_a_name` VARCHAR(255) NULL,
            `user_b_name` VARCHAR(255) NULL,
            `last_message_at` DATETIME NULL,
            `last_preview` VARCHAR(500) NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_ichat_pair` (`pair_key`),
            KEY `idx_ichat_a` (`user_a_id`),
            KEY `idx_ichat_b` (`user_b_id`),
            KEY `idx_ichat_last` (`last_message_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'internal_chat_threads';

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `internal_chat_messages` (
            `id` VARCHAR(64) NOT NULL,
            `thread_id` VARCHAR(64) NOT NULL,
            `sender_id` VARCHAR(64) NOT NULL,
            `sender_name` VARCHAR(255) NULL,
            `body` TEXT NOT NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `read_at` DATETIME NULL,
            PRIMARY KEY (`id`),
            KEY `idx_ichat_msg_thread` (`thread_id`),
            KEY `idx_ichat_msg_created` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'internal_chat_messages';

    $done = true;
    return $applied;
}

function soublu_internal_chat_tables_exist(?PDO $pdo = null): bool
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $pdo = $pdo ?? soublu_pdo();
    $st = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
    );
    foreach (['internal_chat_threads', 'internal_chat_messages'] as $table) {
        $st->execute([$table]);
        if ((int) $st->fetchColumn() === 0) {
            $cached = false;
            return false;
        }
    }
    $cached = true;
    return true;
}
