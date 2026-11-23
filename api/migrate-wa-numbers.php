<?php
/**
 * Migração: tabela wa_numbers (estoque de chips WhatsApp) — MySQL Locaweb.
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

    $sql = "CREATE TABLE IF NOT EXISTS `wa_numbers` (
        `id` VARCHAR(64) NOT NULL,
        `number` VARCHAR(32) NOT NULL,
        `status` VARCHAR(32) NOT NULL DEFAULT 'disponivel',
        `assigned_to` VARCHAR(64) NULL DEFAULT '',
        `assigned_to_name` VARCHAR(255) NULL DEFAULT '',
        `assigned_at` DATETIME NULL DEFAULT NULL,
        `blocked_reason` TEXT NULL DEFAULT NULL,
        `note` TEXT NULL DEFAULT NULL,
        `created_by` VARCHAR(64) NULL DEFAULT '',
        `created_by_name` VARCHAR(255) NULL DEFAULT '',
        `last_sms` TEXT NULL DEFAULT NULL,
        `last_sms_code` VARCHAR(32) NULL DEFAULT NULL,
        `last_sms_at` DATETIME NULL DEFAULT NULL,
        `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uq_wa_numbers_number` (`number`),
        KEY `idx_wa_numbers_status` (`status`),
        KEY `idx_wa_numbers_assigned` (`assigned_to`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    $pdo->exec($sql);
    $applied[] = 'wa_numbers';

    // Colunas do ultimo SMS/codigo recebido na linha (feature "codigo no painel
    // do vendedor") — ADD COLUMN idempotente para bases que ja tinham a tabela
    // antes dessas colunas existirem (o CREATE TABLE IF NOT EXISTS acima nao
    // altera uma tabela ja criada).
    $existingCols = [];
    foreach ($pdo->query('SHOW COLUMNS FROM `wa_numbers`') as $c) {
        $existingCols[(string) ($c['Field'] ?? '')] = true;
    }
    $smsCols = [
        'last_sms' => 'TEXT NULL DEFAULT NULL',
        'last_sms_code' => 'VARCHAR(32) NULL DEFAULT NULL',
        'last_sms_at' => 'DATETIME NULL DEFAULT NULL',
    ];
    foreach ($smsCols as $col => $ddl) {
        if (!isset($existingCols[$col])) {
            $pdo->exec('ALTER TABLE `wa_numbers` ADD COLUMN `' . $col . '` ' . $ddl);
            $applied[] = 'wa_numbers.' . $col;
        }
    }

    echo json_encode(['ok' => true, 'applied' => $applied], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
