<?php
/**
 * Migração: tabelas do Bolão Copa (Álbum Premiado).
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS `bolao_copa_picks` (
        `id` VARCHAR(96) NOT NULL,
        `campaign_id` VARCHAR(64) NOT NULL DEFAULT 'album-copa-2026',
        `user_id` VARCHAR(64) NOT NULL,
        `user_name` VARCHAR(255) NULL,
        `match_id` VARCHAR(32) NOT NULL,
        `pick` VARCHAR(16) NOT NULL,
        `created_at` DATETIME NULL,
        `updated_at` DATETIME NULL,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_bolao_pick_user_match` (`campaign_id`, `user_id`, `match_id`),
        KEY `idx_bolao_pick_match` (`match_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $applied[] = 'bolao_copa_picks';

    $pdo->exec("CREATE TABLE IF NOT EXISTS `bolao_copa_results` (
        `id` VARCHAR(96) NOT NULL,
        `campaign_id` VARCHAR(64) NOT NULL DEFAULT 'album-copa-2026',
        `match_id` VARCHAR(32) NOT NULL,
        `result` VARCHAR(16) NOT NULL,
        `set_by` VARCHAR(64) NULL,
        `set_at` DATETIME NULL,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_bolao_result_match` (`campaign_id`, `match_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $applied[] = 'bolao_copa_results';

    try {
        $pdo->exec('ALTER TABLE `bolao_copa_picks` ADD COLUMN `is_partner` TINYINT(1) NOT NULL DEFAULT 0');
        $applied[] = 'bolao_copa_picks.is_partner';
    } catch (Throwable $e) {
        if (stripos($e->getMessage(), 'Duplicate column') === false) {
            throw $e;
        }
    }

    echo json_encode(['ok' => true, 'applied' => $applied], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage(), 'applied' => $applied], JSON_UNESCAPED_UNICODE);
}
