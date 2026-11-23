<?php
/**
 * Migração: colunas extras em users (CPF, telefone, parceiro, permissões).
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

    $columns = [
        'cpf' => "ALTER TABLE `users` ADD COLUMN `cpf` VARCHAR(20) NULL DEFAULT NULL AFTER `email`",
        'phone' => "ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(32) NULL DEFAULT NULL AFTER `cpf`",
        'partner_root_id' => "ALTER TABLE `users` ADD COLUMN `partner_root_id` VARCHAR(64) NULL DEFAULT NULL AFTER `admin_id`",
        'permissions' => "ALTER TABLE `users` ADD COLUMN `permissions` JSON NULL DEFAULT NULL AFTER `role`",
        'withdrawal_irpf_next' => "ALTER TABLE `users` ADD COLUMN `withdrawal_irpf_next` TINYINT(1) NOT NULL DEFAULT 0 AFTER `doc_verified`",
        'wallet_unit' => "ALTER TABLE `users` ADD COLUMN `wallet_unit` VARCHAR(16) NULL DEFAULT NULL AFTER `points`",
    ];

    $colCheck = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );

    foreach ($columns as $col => $sql) {
        $colCheck->execute(['users', $col]);
        if ((int) $colCheck->fetchColumn() > 0) {
            continue;
        }
        try {
            $pdo->exec($sql);
            $applied[] = 'users.' . $col;
        } catch (Throwable $e) {
            if ($col === 'permissions') {
                $pdo->exec(str_replace(' JSON NULL', ' LONGTEXT NULL', $sql));
                $applied[] = 'users.permissions:longtext';
            } else {
                throw $e;
            }
        }
    }

    echo json_encode([
        'ok' => true,
        'applied' => $applied,
        'message' => $applied ? 'Colunas users aplicadas.' : 'Colunas users já existem.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
