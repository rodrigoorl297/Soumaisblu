<?php
/**
 * Migração: tabelas base do módulo RH (empresas, currículos, cargos, funcionários, etc.).
 * GET com header X-API-Key (API_INTERNAL_KEY) ou apikey.
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
        'rh_companies' => "CREATE TABLE IF NOT EXISTS `rh_companies` (
            `id` VARCHAR(64) NOT NULL,
            `cnpj` VARCHAR(20) NOT NULL,
            `razao_social` VARCHAR(512) NOT NULL,
            `created_at` DATETIME NULL DEFAULT NULL,
            `updated_at` DATETIME NULL DEFAULT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uk_rh_companies_cnpj` (`cnpj`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        'rh_resumes' => "CREATE TABLE IF NOT EXISTS `rh_resumes` (
            `id` VARCHAR(64) NOT NULL,
            `protocolo` VARCHAR(64) NULL DEFAULT NULL,
            `cpf` VARCHAR(20) NULL DEFAULT NULL,
            `nome` VARCHAR(255) NULL DEFAULT NULL,
            `vaga` VARCHAR(255) NULL DEFAULT NULL,
            `unidade` VARCHAR(255) NULL DEFAULT NULL,
            `email` VARCHAR(255) NULL DEFAULT NULL,
            `contato` VARCHAR(64) NULL DEFAULT NULL,
            `contato_terceiros` VARCHAR(64) NULL DEFAULT NULL,
            `nome_terceiros` VARCHAR(255) NULL DEFAULT NULL,
            `data_entrevista` DATE NULL DEFAULT NULL,
            `stage` VARCHAR(32) NULL DEFAULT 'triagem',
            `attachments` JSON NULL,
            `created_at` DATETIME NULL DEFAULT NULL,
            `updated_at` DATETIME NULL DEFAULT NULL,
            PRIMARY KEY (`id`),
            KEY `idx_rh_resumes_cpf` (`cpf`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        'rh_jobs' => "CREATE TABLE IF NOT EXISTS `rh_jobs` (
            `id` VARCHAR(64) NOT NULL,
            `protocolo` VARCHAR(64) NULL DEFAULT NULL,
            `cargo` VARCHAR(255) NULL DEFAULT NULL,
            `hierarquia` VARCHAR(255) NULL DEFAULT NULL,
            `departamento` VARCHAR(255) NULL DEFAULT NULL,
            `cbo_cod` VARCHAR(16) NULL DEFAULT NULL,
            `cbo_descricao` VARCHAR(255) NULL DEFAULT NULL,
            `trabalho_insalubre` VARCHAR(8) NULL DEFAULT 'NÃO',
            `pop` VARCHAR(255) NULL DEFAULT NULL,
            `created_at` DATETIME NULL DEFAULT NULL,
            `updated_at` DATETIME NULL DEFAULT NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        'rh_employees' => "CREATE TABLE IF NOT EXISTS `rh_employees` (
            `id` VARCHAR(64) NOT NULL,
            `cpf` VARCHAR(20) NULL DEFAULT NULL,
            `nome` VARCHAR(255) NULL DEFAULT NULL,
            `cnpj_registro` VARCHAR(20) NULL DEFAULT NULL,
            `matricula` VARCHAR(64) NULL DEFAULT NULL,
            `contato` VARCHAR(64) NULL DEFAULT NULL,
            `email` VARCHAR(255) NULL DEFAULT NULL,
            `protocolo_entrevista` VARCHAR(64) NULL DEFAULT NULL,
            `data_admissao` DATE NULL DEFAULT NULL,
            `departamento` VARCHAR(255) NULL DEFAULT NULL,
            `chave_pix` VARCHAR(255) NULL DEFAULT NULL,
            `cargo` VARCHAR(255) NULL DEFAULT NULL,
            `cbo_cod` VARCHAR(16) NULL DEFAULT NULL,
            `cbo_descricao` VARCHAR(255) NULL DEFAULT NULL,
            `supervisor` VARCHAR(255) NULL DEFAULT NULL,
            `responsavel_dpto` VARCHAR(255) NULL DEFAULT NULL,
            `diretor_dpto` VARCHAR(255) NULL DEFAULT NULL,
            `cargo_confianca` VARCHAR(16) NULL DEFAULT NULL,
            `qualidade_monitoria` VARCHAR(32) NULL DEFAULT NULL,
            `advertencias` INT NULL DEFAULT 0,
            `suspensoes` INT NULL DEFAULT 0,
            `contato_emergencia_1` VARCHAR(64) NULL DEFAULT NULL,
            `nome_emergencia_1` VARCHAR(255) NULL DEFAULT NULL,
            `contato_emergencia_2` VARCHAR(64) NULL DEFAULT NULL,
            `nome_emergencia_2` VARCHAR(255) NULL DEFAULT NULL,
            `status` VARCHAR(32) NULL DEFAULT NULL,
            `demitido` TINYINT(1) NULL DEFAULT 0,
            `change_history` JSON NULL,
            `created_at` DATETIME NULL DEFAULT NULL,
            `updated_at` DATETIME NULL DEFAULT NULL,
            PRIMARY KEY (`id`),
            KEY `idx_rh_employees_cpf` (`cpf`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        'rh_absence_justifications' => "CREATE TABLE IF NOT EXISTS `rh_absence_justifications` (
            `id` VARCHAR(64) NOT NULL,
            `protocolo` VARCHAR(64) NULL DEFAULT NULL,
            `employee_id` VARCHAR(64) NULL DEFAULT NULL,
            `employee_nome` VARCHAR(255) NULL DEFAULT NULL,
            `employee_cpf` VARCHAR(20) NULL DEFAULT NULL,
            `situacao` VARCHAR(32) NULL DEFAULT NULL,
            `status` VARCHAR(32) NULL DEFAULT NULL,
            `tipo` VARCHAR(32) NULL DEFAULT NULL,
            `dias` INT NULL DEFAULT NULL,
            `motivo` TEXT NULL,
            `justificativa` TEXT NULL,
            `data_falta` DATE NULL DEFAULT NULL,
            `data_afastamento` DATE NULL DEFAULT NULL,
            `data_retorno` DATE NULL DEFAULT NULL,
            `data_termino` DATE NULL DEFAULT NULL,
            `protocolo_inss` VARCHAR(64) NULL DEFAULT NULL,
            `protocolo_inss_atestado` VARCHAR(64) NULL DEFAULT NULL,
            `cbo_cod` VARCHAR(16) NULL DEFAULT NULL,
            `cbo_descricao` VARCHAR(255) NULL DEFAULT NULL,
            `dias_atestado` INT NULL DEFAULT NULL,
            `atestado_intercalado` TINYINT(1) NULL DEFAULT 0,
            `excecao_abono` TINYINT(1) NULL DEFAULT 0,
            `gerou_advertencia` TINYINT(1) NULL DEFAULT 0,
            `diretoria` VARCHAR(255) NULL DEFAULT NULL,
            `atestado_anexo_url` VARCHAR(512) NULL DEFAULT NULL,
            `atestado_anexo_nome` VARCHAR(255) NULL DEFAULT NULL,
            `created_at` DATETIME NULL DEFAULT NULL,
            `updated_at` DATETIME NULL DEFAULT NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        'rh_punishments' => "CREATE TABLE IF NOT EXISTS `rh_punishments` (
            `id` VARCHAR(64) NOT NULL,
            `protocolo` VARCHAR(64) NULL DEFAULT NULL,
            `employee_id` VARCHAR(64) NULL DEFAULT NULL,
            `employee_cpf` VARCHAR(20) NULL DEFAULT NULL,
            `employee_nome` VARCHAR(255) NULL DEFAULT NULL,
            `tipo` VARCHAR(32) NULL DEFAULT NULL,
            `motivo_codigo` VARCHAR(64) NULL DEFAULT NULL,
            `titulo` VARCHAR(255) NULL DEFAULT NULL,
            `sub_motivo` VARCHAR(255) NULL DEFAULT NULL,
            `descricao` TEXT NULL,
            `data_ocorrencia` DATE NULL DEFAULT NULL,
            `dias_suspensao` INT NULL DEFAULT 0,
            `desconto_pontos` INT NULL DEFAULT 0,
            `desconto_percentual` DECIMAL(5,2) NULL DEFAULT 0,
            `saldo_pontos_antes` INT NULL DEFAULT 0,
            `status` VARCHAR(32) NULL DEFAULT NULL,
            `registrado_por` VARCHAR(255) NULL DEFAULT NULL,
            `origem` VARCHAR(64) NULL DEFAULT NULL,
            `created_at` DATETIME NULL DEFAULT NULL,
            `updated_at` DATETIME NULL DEFAULT NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        'rh_dismissals' => "CREATE TABLE IF NOT EXISTS `rh_dismissals` (
            `id` VARCHAR(64) NOT NULL,
            `protocolo` VARCHAR(64) NULL DEFAULT NULL,
            `employee_id` VARCHAR(64) NULL DEFAULT NULL,
            `employee_nome` VARCHAR(255) NULL DEFAULT NULL,
            `employee_cpf` VARCHAR(20) NULL DEFAULT NULL,
            `tipo_demissao` VARCHAR(64) NULL DEFAULT NULL,
            `aviso_previo` VARCHAR(64) NULL DEFAULT NULL,
            `motivo` TEXT NULL,
            `data_solicitacao` DATE NULL DEFAULT NULL,
            `solicitante` VARCHAR(255) NULL DEFAULT NULL,
            `checklist` JSON NULL,
            `created_at` DATETIME NULL DEFAULT NULL,
            `updated_at` DATETIME NULL DEFAULT NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];

    foreach ($tables as $name => $sql) {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
        );
        $stmt->execute([$name]);
        if ((int) $stmt->fetchColumn() === 0) {
            $pdo->exec($sql);
            $applied[] = $name;
        }
    }

    $columnMigrations = [
        'rh_jobs' => [
            'trabalho_insalubre' => 'ALTER TABLE `rh_jobs` ADD COLUMN `trabalho_insalubre` VARCHAR(8) NULL DEFAULT \'NÃO\'',
        ],
        'rh_resumes' => [
            'data_nascimento' => 'ALTER TABLE `rh_resumes` ADD COLUMN `data_nascimento` DATE NULL',
            'pis' => 'ALTER TABLE `rh_resumes` ADD COLUMN `pis` VARCHAR(20) NULL',
            'situacao_cadastral' => 'ALTER TABLE `rh_resumes` ADD COLUMN `situacao_cadastral` VARCHAR(64) NULL',
            'fontedata_meta' => 'ALTER TABLE `rh_resumes` ADD COLUMN `fontedata_meta` JSON NULL',
        ],
        'rh_employees' => [
            'data_nascimento' => 'ALTER TABLE `rh_employees` ADD COLUMN `data_nascimento` DATE NULL',
            'pis' => 'ALTER TABLE `rh_employees` ADD COLUMN `pis` VARCHAR(20) NULL',
            'situacao_cadastral' => 'ALTER TABLE `rh_employees` ADD COLUMN `situacao_cadastral` VARCHAR(64) NULL',
            'fontedata_meta' => 'ALTER TABLE `rh_employees` ADD COLUMN `fontedata_meta` JSON NULL',
        ],
    ];

    $colCheck = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );

    foreach ($columnMigrations as $table => $cols) {
        foreach ($cols as $col => $sql) {
            $colCheck->execute([$table, $col]);
            if ((int) $colCheck->fetchColumn() > 0) {
                continue;
            }
            try {
                $pdo->exec($sql);
                $applied[] = "{$table}.{$col}";
            } catch (Throwable $e) {
                if ($col === 'fontedata_meta') {
                    $pdo->exec(str_replace(' JSON NULL', ' LONGTEXT NULL', $sql));
                    $applied[] = "{$table}.{$col}:longtext";
                } else {
                    throw $e;
                }
            }
        }
    }

    echo json_encode([
        'ok' => true,
        'applied' => $applied,
        'message' => $applied
            ? 'Tabelas RH criadas no MySQL.'
            : 'Nada a migrar — tabelas RH já existem.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
