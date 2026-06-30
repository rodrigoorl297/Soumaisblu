<?php
declare(strict_types=1);

function soublu_ensure_finance_modulos_tables(?PDO $pdo = null): array
{
    static $done = false;
    static $applied = [];

    if ($done) {
        return $applied;
    }

    $pdo = $pdo ?? soublu_pdo();

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `finance_adiantamento` (
            `id` VARCHAR(64) NOT NULL,
            `cpf` VARCHAR(11) NOT NULL,
            `employee_id` VARCHAR(64) NULL,
            `employee_name` VARCHAR(255) NULL,
            `valor` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `status` VARCHAR(32) NOT NULL DEFAULT \'pendente\',
            `month_key` VARCHAR(7) NULL,
            `notes` TEXT NULL,
            `decided_by` VARCHAR(64) NULL,
            `decided_by_name` VARCHAR(255) NULL,
            `decided_at` DATETIME NULL,
            `attachments` JSON NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_fin_adv_cpf` (`cpf`, `month_key`),
            KEY `idx_fin_adv_status` (`status`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'finance_adiantamento';

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `finance_reembolso` (
            `id` VARCHAR(64) NOT NULL,
            `motivo` VARCHAR(64) NOT NULL,
            `motivo_label` VARCHAR(255) NULL,
            `cnpj` VARCHAR(14) NOT NULL,
            `estabelecimento_nome` VARCHAR(255) NULL,
            `valor` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `km_inicial` VARCHAR(32) NULL,
            `km_final` VARCHAR(32) NULL,
            `bebida_alcoolica` VARCHAR(16) NULL,
            `valor_liquido_sem_bebida` DECIMAL(12,2) NULL,
            `solicitante_id` VARCHAR(64) NULL,
            `solicitante_nome` VARCHAR(255) NULL,
            `solicitante_login` VARCHAR(128) NULL,
            `status` VARCHAR(32) NOT NULL DEFAULT \'em_analise\',
            `submitted_at` DATETIME NULL,
            `attachments` JSON NULL,
            `notes` TEXT NULL,
            `decided_by` VARCHAR(64) NULL,
            `decided_by_name` VARCHAR(255) NULL,
            `decided_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_fin_reemb_cnpj` (`cnpj`),
            KEY `idx_fin_reemb_status` (`status`, `submitted_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'finance_reembolso';

    $done = true;
    return $applied;
}

function soublu_finance_modulos_tables_exist(?PDO $pdo = null): bool
{
    $pdo = $pdo ?? soublu_pdo();
    $st = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
    );
    foreach (['finance_adiantamento', 'finance_reembolso'] as $table) {
        $st->execute([$table]);
        if ((int) $st->fetchColumn() === 0) {
            return false;
        }
    }
    return true;
}
