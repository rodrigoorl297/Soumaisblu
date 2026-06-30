<?php
declare(strict_types=1);

/**
 * Fallback MySQL — só usado se Supabase original estiver indisponível.
 * Primário: credit_proposals no PostgreSQL (Supabase sou+blu).
 */
function soublu_ensure_credit_proposals_table(?PDO $pdo = null): array
{
    static $tableReady = false;
    static $applied = [];

    $pdo = $pdo ?? soublu_pdo();

    if (!$tableReady) {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `credit_proposals` (
            `id` VARCHAR(64) NOT NULL,
            `protocolo` VARCHAR(32) NOT NULL,
            `employee_id` VARCHAR(64) NOT NULL,
            `employee_name` VARCHAR(255) NULL,
            `vendor_id` VARCHAR(64) NULL,
            `vendor_name` VARCHAR(255) NULL,
            `cpf` VARCHAR(11) NOT NULL,
            `nome` VARCHAR(255) NOT NULL,
            `valor_solicitado` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `valor_aprovado` DECIMAL(12,2) NULL,
            `valor_parcela` DECIMAL(12,2) NULL,
            `valor_final` DECIMAL(12,2) NULL,
            `conta_santander` VARCHAR(8) NULL,
            `forma_pagamento` VARCHAR(64) NULL,
            `banco` VARCHAR(128) NULL,
            `agencia` VARCHAR(32) NULL,
            `conta_corrente` VARCHAR(32) NULL,
            `contato1` VARCHAR(32) NULL,
            `contato2` VARCHAR(32) NULL,
            `observacao` TEXT NULL,
            `avalista_cpf` VARCHAR(11) NULL,
            `avalista_nome` VARCHAR(255) NULL,
            `avalista_telefone` VARCHAR(32) NULL,
            `status` VARCHAR(64) NOT NULL DEFAULT \'AG. ANÁLISE\',
            `esteira` JSON NULL,
            `retorno` JSON NULL,
            `attachments` JSON NULL,
            `history` JSON NULL,
            `meta` JSON NULL,
            `legacy_proposal_id` VARCHAR(64) NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_credit_protocolo` (`protocolo`),
            KEY `idx_credit_employee` (`employee_id`, `created_at`),
            KEY `idx_credit_status` (`status`, `updated_at`),
            KEY `idx_credit_cpf` (`cpf`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $applied[] = 'credit_proposals';
        $tableReady = true;
    }

    // Sempre verifica colunas ausentes — CREATE IF NOT EXISTS não altera tabelas antigas.
    $colApplied = soublu_ensure_credit_proposals_columns($pdo);
    if ($colApplied) {
        $applied = array_values(array_unique(array_merge($applied, $colApplied)));
    }

    return $applied;
}

/** Adiciona colunas ausentes em credit_proposals já existente (CREATE IF NOT EXISTS não altera). */
function soublu_ensure_credit_proposals_columns(?PDO $pdo = null): array
{
    $pdo = $pdo ?? soublu_pdo();
    if (!soublu_credit_proposals_table_exists($pdo)) {
        return [];
    }

    $columns = [
        'employee_name' => "ALTER TABLE `credit_proposals` ADD COLUMN `employee_name` VARCHAR(255) NULL",
        'vendor_id' => "ALTER TABLE `credit_proposals` ADD COLUMN `vendor_id` VARCHAR(64) NULL",
        'vendor_name' => "ALTER TABLE `credit_proposals` ADD COLUMN `vendor_name` VARCHAR(255) NULL",
        'valor_aprovado' => "ALTER TABLE `credit_proposals` ADD COLUMN `valor_aprovado` DECIMAL(12,2) NULL",
        'valor_parcela' => "ALTER TABLE `credit_proposals` ADD COLUMN `valor_parcela` DECIMAL(12,2) NULL",
        'valor_final' => "ALTER TABLE `credit_proposals` ADD COLUMN `valor_final` DECIMAL(12,2) NULL",
        'conta_santander' => "ALTER TABLE `credit_proposals` ADD COLUMN `conta_santander` VARCHAR(8) NULL",
        'forma_pagamento' => "ALTER TABLE `credit_proposals` ADD COLUMN `forma_pagamento` VARCHAR(64) NULL",
        'banco' => "ALTER TABLE `credit_proposals` ADD COLUMN `banco` VARCHAR(128) NULL",
        'agencia' => "ALTER TABLE `credit_proposals` ADD COLUMN `agencia` VARCHAR(32) NULL",
        'conta_corrente' => "ALTER TABLE `credit_proposals` ADD COLUMN `conta_corrente` VARCHAR(32) NULL",
        'contato1' => "ALTER TABLE `credit_proposals` ADD COLUMN `contato1` VARCHAR(32) NULL",
        'contato2' => "ALTER TABLE `credit_proposals` ADD COLUMN `contato2` VARCHAR(32) NULL",
        'observacao' => "ALTER TABLE `credit_proposals` ADD COLUMN `observacao` TEXT NULL",
        'avalista_cpf' => "ALTER TABLE `credit_proposals` ADD COLUMN `avalista_cpf` VARCHAR(11) NULL",
        'avalista_nome' => "ALTER TABLE `credit_proposals` ADD COLUMN `avalista_nome` VARCHAR(255) NULL",
        'avalista_telefone' => "ALTER TABLE `credit_proposals` ADD COLUMN `avalista_telefone` VARCHAR(32) NULL",
        'esteira' => "ALTER TABLE `credit_proposals` ADD COLUMN `esteira` JSON NULL",
        'retorno' => "ALTER TABLE `credit_proposals` ADD COLUMN `retorno` JSON NULL",
        'attachments' => "ALTER TABLE `credit_proposals` ADD COLUMN `attachments` JSON NULL",
        'history' => "ALTER TABLE `credit_proposals` ADD COLUMN `history` JSON NULL",
        'meta' => "ALTER TABLE `credit_proposals` ADD COLUMN `meta` JSON NULL",
        'legacy_proposal_id' => "ALTER TABLE `credit_proposals` ADD COLUMN `legacy_proposal_id` VARCHAR(64) NULL",
    ];

    $check = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );

    $applied = [];
    foreach ($columns as $col => $sql) {
        $check->execute(['credit_proposals', $col]);
        if ((int) $check->fetchColumn() > 0) {
            continue;
        }
        try {
            $pdo->exec($sql);
            $applied[] = $col;
        } catch (Throwable $e) {
            if (in_array($col, ['esteira', 'retorno', 'attachments', 'history', 'meta'], true)) {
                $fallback = str_replace(' JSON NULL', ' LONGTEXT NULL', $sql);
                $pdo->exec($fallback);
                $applied[] = $col . ':longtext';
            } else {
                throw $e;
            }
        }
    }

    return $applied;
}

function soublu_credit_proposals_table_exists(?PDO $pdo = null): bool
{
    $pdo = $pdo ?? soublu_pdo();
    $st = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
    );
    $st->execute(['credit_proposals']);
    return (int) $st->fetchColumn() > 0;
}
