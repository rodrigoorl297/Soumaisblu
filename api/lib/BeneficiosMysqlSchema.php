<?php
declare(strict_types=1);

function soublu_ensure_beneficios_tables(?PDO $pdo = null): array
{
    static $done = false;
    static $applied = [];

    if ($done) {
        return $applied;
    }

    $pdo = $pdo ?? soublu_pdo();

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `beneficios_limites` (
            `id` VARCHAR(64) NOT NULL,
            `employee_id` VARCHAR(64) NOT NULL,
            `employee_name` VARCHAR(255) NULL,
            `limite_aprovado` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `limite_utilizado` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `limite_disponivel` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `contato1` VARCHAR(32) NULL,
            `contato2` VARCHAR(32) NULL,
            `forma_pagamento` VARCHAR(64) NULL,
            `documento_url` VARCHAR(255) NULL,
            `contrato_url` VARCHAR(255) NULL,
            `promissoria_url` VARCHAR(255) NULL,
            `status` VARCHAR(32) NOT NULL DEFAULT \'solicitado\',
            `protocolo` VARCHAR(64) NULL,
            `distribuicao` JSON NULL,
            `last_distribution_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_ben_lim_emp` (`employee_id`),
            KEY `idx_ben_lim_status` (`status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'beneficios_limites';

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `beneficios_prestadores` (
            `id` VARCHAR(64) NOT NULL,
            `codigo_parceiro` VARCHAR(32) NOT NULL,
            `nome_fantasia` VARCHAR(255) NOT NULL,
            `cnpj_cpf` VARCHAR(14) NOT NULL,
            `chave_pix` VARCHAR(255) NULL,
            `dia_pagamento` INT NOT NULL DEFAULT 5,
            `categoria` VARCHAR(64) NULL,
            `pagamento_automatico` VARCHAR(16) NOT NULL DEFAULT \'NÃO\',
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_ben_pres_cod` (`codigo_parceiro`),
            KEY `idx_ben_pres_cnpj` (`cnpj_cpf`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'beneficios_prestadores';

    try {
        $col = $pdo->query("SHOW COLUMNS FROM `beneficios_prestadores` LIKE 'whatsapp'")->fetch();
        if (!$col) {
            $pdo->exec('ALTER TABLE `beneficios_prestadores` ADD COLUMN `whatsapp` VARCHAR(32) NULL AFTER `categoria`');
            $applied[] = 'beneficios_prestadores.whatsapp';
        }
    } catch (Throwable $e) {
        /* coluna opcional — pedido WA usa fallback de config se ausente */
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `beneficios_produtos` (
            `id` VARCHAR(64) NOT NULL,
            `codigo_produto` VARCHAR(32) NOT NULL,
            `categoria` VARCHAR(64) NULL,
            `nome` VARCHAR(255) NOT NULL,
            `foto_url` VARCHAR(255) NULL,
            `prestador_id` VARCHAR(64) NOT NULL,
            `prestador_name` VARCHAR(255) NULL,
            `descricao` TEXT NULL,
            `valor` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_ben_prod_cod` (`codigo_produto`),
            KEY `idx_ben_prod_pres` (`prestador_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'beneficios_produtos';

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `beneficios_vouchers` (
            `id` VARCHAR(64) NOT NULL,
            `voucher_no` VARCHAR(64) NOT NULL,
            `employee_id` VARCHAR(64) NOT NULL,
            `employee_name` VARCHAR(255) NULL,
            `prestador_id` VARCHAR(64) NOT NULL,
            `prestador_name` VARCHAR(255) NULL,
            `categoria` VARCHAR(64) NULL,
            `valor` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `status` VARCHAR(32) NOT NULL DEFAULT \'em_analise\',
            `fechamento_protocolo` VARCHAR(64) NULL,
            `detalhes_pedido` JSON NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_ben_vouch_no` (`voucher_no`),
            KEY `idx_ben_vouch_emp` (`employee_id`),
            KEY `idx_ben_vouch_pres` (`prestador_id`),
            KEY `idx_ben_vouch_prot` (`fechamento_protocolo`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'beneficios_vouchers';

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `beneficios_fechamentos` (
            `id` VARCHAR(64) NOT NULL,
            `protocolo` VARCHAR(64) NOT NULL,
            `prestador_id` VARCHAR(64) NOT NULL,
            `prestador_name` VARCHAR(255) NULL,
            `data_inicial` DATE NOT NULL,
            `data_final` DATE NOT NULL,
            `valor_total` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `status` VARCHAR(32) NOT NULL DEFAULT \'pendente\',
            `voucher_ids` JSON NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_ben_fech_prot` (`protocolo`),
            KEY `idx_ben_fech_pres` (`prestador_id`),
            KEY `idx_ben_fech_status` (`status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'beneficios_fechamentos';

    $done = true;
    return $applied;
}

function soublu_beneficios_tables_exist(?PDO $pdo = null): bool
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
    foreach ([
        'beneficios_limites',
        'beneficios_prestadores',
        'beneficios_produtos',
        'beneficios_vouchers',
        'beneficios_fechamentos',
    ] as $table) {
        $st->execute([$table]);
        if ((int) $st->fetchColumn() === 0) {
            $cached = false;
            return false;
        }
    }
    $cached = true;
    return true;
}
