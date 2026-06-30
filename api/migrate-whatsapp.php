<?php
/**
 * Migração: tabelas WhatsApp (Evolution API) — MySQL Locaweb.
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

    $tables = [
        'whatsapp_instances' => "CREATE TABLE IF NOT EXISTS `whatsapp_instances` (
            `id` VARCHAR(64) NOT NULL,
            `user_id` VARCHAR(64) NOT NULL,
            `instance_name` VARCHAR(128) NOT NULL,
            `phone` VARCHAR(32) NULL DEFAULT NULL,
            `status` VARCHAR(32) NOT NULL DEFAULT 'close',
            `created_at` DATETIME NULL DEFAULT NULL,
            `updated_at` DATETIME NULL DEFAULT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_wa_user` (`user_id`),
            UNIQUE KEY `uq_wa_instance` (`instance_name`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        'whatsapp_chats' => "CREATE TABLE IF NOT EXISTS `whatsapp_chats` (
            `id` VARCHAR(64) NOT NULL,
            `instance_id` VARCHAR(64) NOT NULL,
            `user_id` VARCHAR(64) NOT NULL,
            `remote_jid` VARCHAR(128) NOT NULL,
            `contact_phone` VARCHAR(32) NOT NULL,
            `contact_name` VARCHAR(255) NULL DEFAULT NULL,
            `last_message_at` DATETIME NULL DEFAULT NULL,
            `last_message_preview` TEXT NULL DEFAULT NULL,
            `unread_count` INT NOT NULL DEFAULT 0,
            `kanban_stage` VARCHAR(64) NOT NULL DEFAULT 'novo',
            `created_at` DATETIME NULL DEFAULT NULL,
            `updated_at` DATETIME NULL DEFAULT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_wa_chat_jid` (`instance_id`, `remote_jid`),
            KEY `idx_wa_chats_user` (`user_id`, `last_message_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        'whatsapp_messages' => "CREATE TABLE IF NOT EXISTS `whatsapp_messages` (
            `id` VARCHAR(64) NOT NULL,
            `chat_id` VARCHAR(64) NOT NULL,
            `instance_id` VARCHAR(64) NOT NULL,
            `user_id` VARCHAR(64) NOT NULL,
            `remote_jid` VARCHAR(128) NOT NULL,
            `direction` ENUM('in','out') NOT NULL DEFAULT 'in',
            `message_type` VARCHAR(32) NOT NULL DEFAULT 'text',
            `body` TEXT NULL DEFAULT NULL,
            `media_url` TEXT NULL DEFAULT NULL,
            `wa_message_id` VARCHAR(128) NULL DEFAULT NULL,
            `status` VARCHAR(32) NULL DEFAULT NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_wa_msg_chat` (`chat_id`, `created_at`),
            KEY `idx_wa_msg_wa_id` (`wa_message_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];

    foreach ($tables as $name => $sql) {
        $pdo->exec($sql);
        $applied[] = $name;
    }

    // Coluna kanban_stage em instalações antigas
    $cols = $pdo->query("SHOW COLUMNS FROM whatsapp_chats LIKE 'kanban_stage'")->fetchAll();
    if (!$cols) {
        $pdo->exec("ALTER TABLE whatsapp_chats ADD COLUMN kanban_stage VARCHAR(64) NOT NULL DEFAULT 'novo' AFTER unread_count");
        $applied[] = 'whatsapp_chats.kanban_stage';
    }

    $avatarCol = $pdo->query("SHOW COLUMNS FROM whatsapp_chats LIKE 'contact_avatar_url'")->fetchAll();
    if (!$avatarCol) {
        $pdo->exec("ALTER TABLE whatsapp_chats ADD COLUMN contact_avatar_url TEXT NULL DEFAULT NULL AFTER contact_name");
        $applied[] = 'whatsapp_chats.contact_avatar_url';
    }

    $msgAlters = [
        'instance_id' => "ALTER TABLE whatsapp_messages ADD COLUMN instance_id VARCHAR(64) NOT NULL DEFAULT '' AFTER chat_id",
        'remote_jid' => "ALTER TABLE whatsapp_messages ADD COLUMN remote_jid VARCHAR(128) NOT NULL DEFAULT '' AFTER user_id",
        'message_type' => "ALTER TABLE whatsapp_messages ADD COLUMN message_type VARCHAR(32) NOT NULL DEFAULT 'text' AFTER direction",
        'media_url' => "ALTER TABLE whatsapp_messages ADD COLUMN media_url TEXT NULL DEFAULT NULL AFTER body",
        'wa_message_id' => "ALTER TABLE whatsapp_messages ADD COLUMN wa_message_id VARCHAR(128) NULL DEFAULT NULL AFTER media_url",
        'status' => "ALTER TABLE whatsapp_messages ADD COLUMN status VARCHAR(32) NULL DEFAULT NULL AFTER wa_message_id",
    ];
    foreach ($msgAlters as $col => $sql) {
        $exists = $pdo->query("SHOW COLUMNS FROM whatsapp_messages LIKE " . $pdo->quote($col))->fetchAll();
        if (!$exists) {
            $pdo->exec($sql);
            $applied[] = 'whatsapp_messages.' . $col;
        }
    }

    echo json_encode(['ok' => true, 'applied' => $applied], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
