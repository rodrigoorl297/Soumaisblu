<?php
/**
 * Migração: tabelas WhatsApp (Evolution API) — MySQL Locaweb.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/WhatsAppRepository.php';

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

// Schema pesado (ALTER/índices/dedupe) não pode rodar em toda abertura do WA —
// congela o pool PHP da Locaweb e derruba login/API. Só reexecuta sob demanda.
$force = isset($_GET['force']) && (string) $_GET['force'] === '1';
$lockDir = (defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads')) . '/.wa-migrate';
$doneFlag = $lockDir . '/schema.done';
if (!$force && is_file($doneFlag)) {
    $age = time() - (int) @filemtime($doneFlag);
    if ($age >= 0 && $age < 86400) {
        echo json_encode([
            'ok' => true,
            'skipped' => true,
            'cached' => true,
            'age_s' => $age,
            'applied' => [],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
if (!is_dir($lockDir)) {
    @mkdir($lockDir, 0755, true);
}
$lockFp = @fopen($lockDir . '/schema.lock', 'c+');
if ($lockFp) {
    if (!flock($lockFp, LOCK_EX | LOCK_NB)) {
        echo json_encode([
            'ok' => true,
            'skipped' => true,
            'busy' => true,
            'applied' => [],
        ], JSON_UNESCAPED_UNICODE);
        fclose($lockFp);
        exit;
    }
}

@set_time_limit(90);
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
            `raw_payload` MEDIUMTEXT NULL DEFAULT NULL,
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

    $revokedCol = $pdo->query("SHOW COLUMNS FROM whatsapp_instances LIKE 'session_revoked_at'")->fetchAll();
    if (!$revokedCol) {
        $pdo->exec('ALTER TABLE whatsapp_instances ADD COLUMN session_revoked_at DATETIME NULL DEFAULT NULL AFTER status');
        $applied[] = 'whatsapp_instances.session_revoked_at';
    }

    $msgAlters = [
        'instance_id' => "ALTER TABLE whatsapp_messages ADD COLUMN instance_id VARCHAR(64) NOT NULL DEFAULT '' AFTER chat_id",
        'remote_jid' => "ALTER TABLE whatsapp_messages ADD COLUMN remote_jid VARCHAR(128) NOT NULL DEFAULT '' AFTER user_id",
        'message_type' => "ALTER TABLE whatsapp_messages ADD COLUMN message_type VARCHAR(32) NOT NULL DEFAULT 'text' AFTER direction",
        'media_url' => "ALTER TABLE whatsapp_messages ADD COLUMN media_url TEXT NULL DEFAULT NULL AFTER body",
        'wa_message_id' => "ALTER TABLE whatsapp_messages ADD COLUMN wa_message_id VARCHAR(128) NULL DEFAULT NULL AFTER media_url",
        'status' => "ALTER TABLE whatsapp_messages ADD COLUMN status VARCHAR(32) NULL DEFAULT NULL AFTER wa_message_id",
        // Payload Evolution (mediaKey) para repair_media sem findMessages completo.
        'raw_payload' => "ALTER TABLE whatsapp_messages ADD COLUMN raw_payload MEDIUMTEXT NULL DEFAULT NULL AFTER status",
    ];
    foreach ($msgAlters as $col => $sql) {
        $exists = $pdo->query("SHOW COLUMNS FROM whatsapp_messages LIKE " . $pdo->quote($col))->fetchAll();
        if (!$exists) {
            $pdo->exec($sql);
            $applied[] = 'whatsapp_messages.' . $col;
        }
    }

    $nameLockedCol = $pdo->query("SHOW COLUMNS FROM whatsapp_chats LIKE 'name_locked'")->fetchAll();
    if (!$nameLockedCol) {
        $pdo->exec('ALTER TABLE whatsapp_chats ADD COLUMN name_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER contact_name');
        $applied[] = 'whatsapp_chats.name_locked';
    }

    $dealCols = [
        'deal_value' => 'ALTER TABLE whatsapp_chats ADD COLUMN deal_value DECIMAL(12,2) NULL DEFAULT NULL AFTER kanban_stage',
        'deal_tags' => 'ALTER TABLE whatsapp_chats ADD COLUMN deal_tags VARCHAR(512) NULL DEFAULT NULL AFTER deal_value',
        'next_action_at' => 'ALTER TABLE whatsapp_chats ADD COLUMN next_action_at DATETIME NULL DEFAULT NULL AFTER deal_tags',
    ];
    foreach ($dealCols as $col => $sql) {
        $exists = $pdo->query('SHOW COLUMNS FROM whatsapp_chats LIKE ' . $pdo->quote($col))->fetchAll();
        if (!$exists) {
            $pdo->exec($sql);
            $applied[] = 'whatsapp_chats.' . $col;
        }
    }

    $wtTicketCol = $pdo->query("SHOW COLUMNS FROM whatsapp_chats LIKE 'whaticket_ticket_id'")->fetchAll();
    if (!$wtTicketCol) {
        $pdo->exec('ALTER TABLE whatsapp_chats ADD COLUMN whaticket_ticket_id INT NULL DEFAULT NULL AFTER remote_jid');
        $pdo->exec('CREATE INDEX idx_wa_chat_wt_ticket ON whatsapp_chats (whaticket_ticket_id)');
        $applied[] = 'whatsapp_chats.whaticket_ticket_id';
    }

    // '' no telefone quebra UNIQUE (instance_id, contact_phone) — vários @lid.
    $emptyPhones = (int) $pdo->exec(
        "UPDATE whatsapp_chats SET contact_phone = NULL
         WHERE contact_phone IS NOT NULL AND TRIM(contact_phone) = ''"
    );
    if ($emptyPhones > 0) {
        $applied[] = 'whatsapp_chats.empty_phone_to_null:' . $emptyPhones;
    }

    // Fundir duplicatas por (instance_id, remote_jid) — mesmo JID duas vezes.
    $dupJidRows = $pdo->query(
        "SELECT instance_id, remote_jid,
                GROUP_CONCAT(id ORDER BY COALESCE(last_message_at, created_at) DESC SEPARATOR ',') AS ids,
                COUNT(*) AS cnt
         FROM whatsapp_chats
         WHERE remote_jid IS NOT NULL AND TRIM(remote_jid) != ''
         GROUP BY instance_id, remote_jid
         HAVING cnt > 1"
    )->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $mergedJid = 0;
    foreach ($dupJidRows as $dup) {
        $ids = array_filter(explode(',', (string) ($dup['ids'] ?? '')));
        if (count($ids) < 2) {
            continue;
        }
        $keep = array_shift($ids);
        foreach ($ids as $dropId) {
            $pdo->prepare('UPDATE whatsapp_messages SET chat_id = ? WHERE chat_id = ?')->execute([$keep, $dropId]);
            $pdo->prepare('DELETE FROM whatsapp_chats WHERE id = ?')->execute([$dropId]);
            $mergedJid++;
        }
    }
    if ($mergedJid > 0) {
        $applied[] = 'whatsapp_chats.deduped_by_jid:' . $mergedJid;
    }

    // contact_phone NULL para @lid (vários LIDs sem telefone); telefone real = chave única.
    $pdo->exec(
        "UPDATE whatsapp_chats SET contact_phone = NULL
         WHERE contact_phone IS NULL OR TRIM(IFNULL(contact_phone, '')) = ''"
    );
    try {
        $pdo->exec('ALTER TABLE whatsapp_chats MODIFY contact_phone VARCHAR(32) NULL DEFAULT NULL');
        $applied[] = 'whatsapp_chats.contact_phone_nullable';
    } catch (Throwable $e) {
        // já aplicado
    }

    // Fundir duplicatas por (instance_id, contact_phone) antes do índice único.
    $dupRows = $pdo->query(
        "SELECT instance_id, contact_phone,
                GROUP_CONCAT(id ORDER BY COALESCE(last_message_at, created_at) DESC SEPARATOR ',') AS ids,
                COUNT(*) AS cnt
         FROM whatsapp_chats
         WHERE contact_phone IS NOT NULL AND TRIM(contact_phone) != ''
         GROUP BY instance_id, contact_phone
         HAVING cnt > 1"
    )->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $merged = 0;
    foreach ($dupRows as $dup) {
        $ids = array_filter(explode(',', (string) ($dup['ids'] ?? '')));
        if (count($ids) < 2) {
            continue;
        }
        $keep = array_shift($ids);
        foreach ($ids as $dropId) {
            $pdo->prepare('UPDATE whatsapp_messages SET chat_id = ? WHERE chat_id = ?')->execute([$keep, $dropId]);
            $pdo->prepare('DELETE FROM whatsapp_chats WHERE id = ?')->execute([$dropId]);
            $merged++;
        }
    }
    if ($merged > 0) {
        $applied[] = 'whatsapp_chats.deduped_by_phone:' . $merged;
    }

    // Normaliza telefones salvos com formatação diferente (só dígitos).
    $normalize = $pdo->query(
        "SELECT id, instance_id, contact_phone FROM whatsapp_chats
         WHERE contact_phone IS NOT NULL AND contact_phone REGEXP '[^0-9]'"
    )->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($normalize as $row) {
        $digits = preg_replace('/\D+/', '', (string) ($row['contact_phone'] ?? '')) ?? '';
        if ($digits === '' || strlen($digits) < 10) {
            $pdo->prepare('UPDATE whatsapp_chats SET contact_phone = NULL WHERE id = ?')->execute([$row['id']]);
            continue;
        }
        $pdo->prepare('UPDATE whatsapp_chats SET contact_phone = ? WHERE id = ?')->execute([$digits, $row['id']]);
    }
    if ($normalize) {
        $applied[] = 'whatsapp_chats.normalized_phone:' . count($normalize);
    }

    // Segunda passagem de dedupe após normalização.
    $dupRows2 = $pdo->query(
        "SELECT instance_id, contact_phone,
                GROUP_CONCAT(id ORDER BY COALESCE(last_message_at, created_at) DESC SEPARATOR ',') AS ids,
                COUNT(*) AS cnt
         FROM whatsapp_chats
         WHERE contact_phone IS NOT NULL AND TRIM(contact_phone) != ''
         GROUP BY instance_id, contact_phone
         HAVING cnt > 1"
    )->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($dupRows2 as $dup) {
        $ids = array_filter(explode(',', (string) ($dup['ids'] ?? '')));
        if (count($ids) < 2) {
            continue;
        }
        $keep = array_shift($ids);
        foreach ($ids as $dropId) {
            $pdo->prepare('UPDATE whatsapp_messages SET chat_id = ? WHERE chat_id = ?')->execute([$keep, $dropId]);
            $pdo->prepare('DELETE FROM whatsapp_chats WHERE id = ?')->execute([$dropId]);
            $merged++;
        }
    }
    if ($dupRows2) {
        $applied[] = 'whatsapp_chats.deduped_pass2:' . count($dupRows2);
    }

    // Coluna contact_phone_tail (últimos 11 dígitos BR) + telefone canônico 55XXXXXXXXXXX.
    $tailCol = $pdo->query("SHOW COLUMNS FROM whatsapp_chats LIKE 'contact_phone_tail'")->fetchAll();
    if (!$tailCol) {
        $pdo->exec('ALTER TABLE whatsapp_chats ADD COLUMN contact_phone_tail VARCHAR(11) NULL DEFAULT NULL AFTER contact_phone');
        $applied[] = 'whatsapp_chats.contact_phone_tail';
    }

    $canonRows = $pdo->query(
        "SELECT id, contact_phone FROM whatsapp_chats WHERE contact_phone IS NOT NULL AND TRIM(contact_phone) != ''"
    )->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $canonUpdated = 0;
    foreach ($canonRows as $row) {
        $raw = (string) ($row['contact_phone'] ?? '');
        $canon = wa_repo_canonical_phone($raw);
        $tail = wa_repo_phone_tail($canon !== '' ? $canon : $raw);
        if ($canon === '' && $tail === '') {
            continue;
        }
        $pdo->prepare(
            'UPDATE whatsapp_chats SET contact_phone = ?, contact_phone_tail = ? WHERE id = ?'
        )->execute([
            $canon !== '' ? $canon : preg_replace('/\D+/', '', $raw),
            $tail !== '' ? $tail : null,
            $row['id'],
        ]);
        $canonUpdated++;
    }
    if ($canonUpdated > 0) {
        $applied[] = 'whatsapp_chats.canon_phone_tail:' . $canonUpdated;
    }

    // Fundir duplicatas por (instance_id, contact_phone_tail) — ex.: 629… vs 55629….
    $dupTail = $pdo->query(
        "SELECT instance_id, contact_phone_tail,
                GROUP_CONCAT(id ORDER BY COALESCE(last_message_at, created_at) DESC SEPARATOR ',') AS ids,
                COUNT(*) AS cnt
         FROM whatsapp_chats
         WHERE contact_phone_tail IS NOT NULL AND TRIM(contact_phone_tail) != ''
         GROUP BY instance_id, contact_phone_tail
         HAVING cnt > 1"
    )->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $mergedTail = 0;
    foreach ($dupTail as $dup) {
        $ids = array_filter(explode(',', (string) ($dup['ids'] ?? '')));
        if (count($ids) < 2) {
            continue;
        }
        $keep = array_shift($ids);
        foreach ($ids as $dropId) {
            $pdo->prepare('UPDATE whatsapp_messages SET chat_id = ? WHERE chat_id = ?')->execute([$keep, $dropId]);
            $pdo->prepare('DELETE FROM whatsapp_chats WHERE id = ?')->execute([$dropId]);
            $mergedTail++;
        }
    }
    if ($mergedTail > 0) {
        $applied[] = 'whatsapp_chats.deduped_by_tail:' . $mergedTail;
    }

    $pdo->exec(
        "UPDATE whatsapp_chats SET contact_phone = NULL
         WHERE contact_phone IS NULL OR TRIM(IFNULL(contact_phone, '')) = ''"
    );

    $idxPhone = $pdo->query("SHOW INDEX FROM whatsapp_chats WHERE Key_name = 'uq_wa_chat_phone'")->fetchAll();
    if (!$idxPhone) {
        try {
            $pdo->exec('ALTER TABLE whatsapp_chats ADD UNIQUE KEY uq_wa_chat_phone (instance_id, contact_phone)');
            $applied[] = 'whatsapp_chats.uq_wa_chat_phone';
        } catch (Throwable $e) {
            $applied[] = 'whatsapp_chats.uq_wa_chat_phone_skipped:' . $e->getMessage();
        }
    }

    $idxTail = $pdo->query("SHOW INDEX FROM whatsapp_chats WHERE Key_name = 'uq_wa_chat_phone_tail'")->fetchAll();
    if (!$idxTail) {
        try {
            $pdo->exec('ALTER TABLE whatsapp_chats ADD UNIQUE KEY uq_wa_chat_phone_tail (instance_id, contact_phone_tail)');
            $applied[] = 'whatsapp_chats.uq_wa_chat_phone_tail';
        } catch (Throwable $e) {
            $applied[] = 'whatsapp_chats.uq_wa_chat_phone_tail_skipped:' . $e->getMessage();
        }
    }

    $idxWaMsg = $pdo->query("SHOW INDEX FROM whatsapp_messages WHERE Key_name = 'uq_wa_msg_wa_id'")->fetchAll();
    if (!$idxWaMsg) {
        $dupMsgs = $pdo->query(
            "SELECT wa_message_id,
                    GROUP_CONCAT(id ORDER BY created_at ASC SEPARATOR ',') AS ids,
                    COUNT(*) AS cnt
             FROM whatsapp_messages
             WHERE wa_message_id IS NOT NULL AND TRIM(wa_message_id) != ''
             GROUP BY wa_message_id
             HAVING cnt > 1"
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        foreach ($dupMsgs as $dup) {
            $ids = array_filter(explode(',', (string) ($dup['ids'] ?? '')));
            if (count($ids) < 2) {
                continue;
            }
            array_shift($ids);
            foreach ($ids as $dropId) {
                $pdo->prepare('DELETE FROM whatsapp_messages WHERE id = ?')->execute([$dropId]);
            }
        }
        if ($dupMsgs) {
            $applied[] = 'whatsapp_messages.deduped_wa_id:' . count($dupMsgs);
        }
        try {
            $pdo->exec('ALTER TABLE whatsapp_messages ADD UNIQUE KEY uq_wa_msg_wa_id (wa_message_id)');
            $applied[] = 'whatsapp_messages.uq_wa_msg_wa_id';
        } catch (Throwable $e) {
            $applied[] = 'whatsapp_messages.uq_wa_msg_wa_id_skipped:' . $e->getMessage();
        }
    }

    @file_put_contents($doneFlag, (string) time());
    echo json_encode(['ok' => true, 'applied' => $applied], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
} finally {
    if (!empty($lockFp)) {
        @flock($lockFp, LOCK_UN);
        @fclose($lockFp);
    }
}
