<?php
declare(strict_types=1);

/** Adiciona coluna se ainda não existir. Retorna nome da coluna adicionada ou null. */
function soublu_rh_add_column(PDO $pdo, string $table, string $column, string $definition): ?string
{
    $check = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $check->execute([$table, $column]);
    if ((int) $check->fetchColumn() > 0) {
        return null;
    }
    $pdo->exec(sprintf('ALTER TABLE `%s` ADD COLUMN `%s` %s', $table, $column, $definition));
    return $column;
}

function soublu_ensure_rh_core_schema(?PDO $pdo = null): array
{
    $pdo = $pdo ?? soublu_pdo();
    $added = [];

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `rh_employees` (
            `id` VARCHAR(64) NOT NULL,
            `cpf` VARCHAR(14) NULL,
            `nome` VARCHAR(255) NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_rh_emp_cpf` (`cpf`),
            KEY `idx_rh_emp_nome` (`nome`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $employeeCols = [
        'user_id' => 'VARCHAR(64) NULL',
        'matricula' => 'VARCHAR(64) NULL',
        'cracha_codigo' => 'VARCHAR(64) NULL',
        'contato' => 'VARCHAR(32) NULL',
        'email' => 'VARCHAR(255) NULL',
        'email_pessoal' => 'VARCHAR(255) NULL',
        'cnpj_registro' => 'VARCHAR(14) NULL',
        'protocolo_entrevista' => 'VARCHAR(64) NULL',
        'data_admissao' => 'DATE NULL',
        'departamento' => 'VARCHAR(128) NULL',
        'chave_pix' => 'VARCHAR(255) NULL',
        'cargo_id' => 'VARCHAR(64) NULL',
        'cargo' => 'VARCHAR(255) NULL',
        'cbo_cod' => 'VARCHAR(32) NULL',
        'cbo_descricao' => 'VARCHAR(255) NULL',
        'cargo_confianca' => 'VARCHAR(16) NULL',
        'qualidade_monitoria' => 'VARCHAR(32) NULL',
        'advertencias' => 'INT NOT NULL DEFAULT 0',
        'suspensoes' => 'INT NOT NULL DEFAULT 0',
        'nome_emergencia_1' => 'VARCHAR(255) NULL',
        'contato_emergencia_1' => 'VARCHAR(32) NULL',
        'nome_emergencia_2' => 'VARCHAR(255) NULL',
        'contato_emergencia_2' => 'VARCHAR(32) NULL',
        'data_nascimento' => 'DATE NULL',
        'pis' => 'VARCHAR(14) NULL',
        'situacao_cadastral' => 'VARCHAR(64) NULL',
        'system_role' => 'VARCHAR(32) NULL',
        'role' => 'VARCHAR(32) NULL',
        'demitido' => 'TINYINT(1) NOT NULL DEFAULT 0',
        'status' => 'VARCHAR(32) NULL',
        'fontedata_meta' => 'JSON NULL',
        'attachments' => 'JSON NULL',
        'permissions' => 'JSON NULL',
        'audit_log' => 'JSON NULL',
        'change_history' => 'JSON NULL',
    ];
    foreach ($employeeCols as $col => $def) {
        $hit = soublu_rh_add_column($pdo, 'rh_employees', $col, $def);
        if ($hit) {
            $added[] = "rh_employees.{$hit}";
        }
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `rh_jobs` (
            `id` VARCHAR(64) NOT NULL,
            `cargo` VARCHAR(255) NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    foreach ([
        'cbo_cod' => 'VARCHAR(32) NULL',
        'cbo_descricao' => 'VARCHAR(255) NULL',
        'cbo_codigo' => 'VARCHAR(32) NULL',
        'titulo' => 'VARCHAR(255) NULL',
        'protocolo' => 'VARCHAR(64) NULL',
    ] as $col => $def) {
        $hit = soublu_rh_add_column($pdo, 'rh_jobs', $col, $def);
        if ($hit) {
            $added[] = "rh_jobs.{$hit}";
        }
    }

    return ['ok' => true, 'added' => $added];
}

function soublu_ensure_rh_hierarchy_schema(?PDO $pdo = null): array
{
    $pdo = $pdo ?? soublu_pdo();
    $added = [];
    foreach ([
        'supervisor_id' => 'VARCHAR(64) NULL',
        'supervisor' => 'VARCHAR(255) NULL',
        'responsavel_dpto_id' => 'VARCHAR(64) NULL',
        'responsavel_dpto' => 'VARCHAR(255) NULL',
        'diretor_dpto_id' => 'VARCHAR(64) NULL',
        'diretor_dpto' => 'VARCHAR(255) NULL',
    ] as $col => $def) {
        $hit = soublu_rh_add_column($pdo, 'rh_employees', $col, $def);
        if ($hit) {
            $added[] = "rh_employees.{$hit}";
        }
    }
    return ['ok' => true, 'added' => $added];
}

function soublu_ensure_rh_justif_hours_schema(?PDO $pdo = null): array
{
    $pdo = $pdo ?? soublu_pdo();
    $added = [];
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `rh_absence_justifications` (
            `id` VARCHAR(64) NOT NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    foreach ([
        'horas' => 'DECIMAL(6,2) NULL',
        'horas_atestado' => 'DECIMAL(6,2) NULL',
    ] as $col => $def) {
        $hit = soublu_rh_add_column($pdo, 'rh_absence_justifications', $col, $def);
        if ($hit) {
            $added[] = "rh_absence_justifications.{$hit}";
        }
    }
    return ['ok' => true, 'added' => $added];
}

function soublu_ensure_rh_cbo_schema(?PDO $pdo = null): array
{
    $pdo = $pdo ?? soublu_pdo();
    $added = [];

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `rh_cbo` (
            `codigo` VARCHAR(16) NOT NULL,
            `titulo` VARCHAR(255) NOT NULL,
            PRIMARY KEY (`codigo`),
            KEY `idx_rh_cbo_titulo` (`titulo`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $added[] = 'rh_cbo';

    foreach ([
        'rh_employees' => ['cbo_cod' => 'VARCHAR(32) NULL', 'cbo_descricao' => 'VARCHAR(255) NULL'],
        'rh_jobs' => ['cbo_cod' => 'VARCHAR(32) NULL', 'cbo_descricao' => 'VARCHAR(255) NULL'],
    ] as $table => $cols) {
        foreach ($cols as $col => $def) {
            $hit = soublu_rh_add_column($pdo, $table, $col, $def);
            if ($hit) {
                $added[] = "{$table}.{$hit}";
            }
        }
    }

    return ['ok' => true, 'added' => $added];
}

function soublu_ensure_rh_resume_avaliacao_schema(?PDO $pdo = null): array
{
    $pdo = $pdo ?? soublu_pdo();
    $added = [];
    $hit = soublu_rh_add_column($pdo, 'rh_resumes', 'avaliacao', 'LONGTEXT NULL');
    if ($hit) {
        $added[] = "rh_resumes.{$hit}";
    }
    return ['ok' => true, 'added' => $added];
}

function soublu_ensure_rh_vagas_schema(?PDO $pdo = null): array
{
    static $done = false;
    static $applied = [];

    if ($done) {
        return $applied;
    }

    $pdo = $pdo ?? soublu_pdo();
    $added = [];

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `rh_vagas` (
            `id` VARCHAR(64) NOT NULL,
            `titulo` VARCHAR(255) NOT NULL,
            `departamento` VARCHAR(128) NULL,
            `cargo` VARCHAR(255) NULL,
            `cargo_id` VARCHAR(64) NULL,
            `quantidade` INT NOT NULL DEFAULT 1,
            `tipo` VARCHAR(32) NOT NULL,
            `justificativa` TEXT NOT NULL,
            `prioridade` VARCHAR(16) NOT NULL DEFAULT \'normal\',
            `status` VARCHAR(48) NOT NULL DEFAULT \'aguardando_aprovacao\',
            `solicitante_id` VARCHAR(64) NULL,
            `solicitante_nome` VARCHAR(255) NULL,
            `responsavel_id` VARCHAR(64) NULL,
            `responsavel_nome` VARCHAR(255) NULL,
            `aprovado_por_id` VARCHAR(64) NULL,
            `aprovado_por_nome` VARCHAR(255) NULL,
            `aprovado_em` DATETIME NULL,
            `reprovado_motivo` TEXT NULL,
            `history` JSON NULL,
            `active` TINYINT(1) NOT NULL DEFAULT 1,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_rh_vagas_status` (`status`),
            KEY `idx_rh_vagas_solicitante` (`solicitante_id`),
            KEY `idx_rh_vagas_prioridade` (`prioridade`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $added[] = 'rh_vagas';

    foreach ([
        'titulo' => 'VARCHAR(255) NULL',
        'departamento' => 'VARCHAR(128) NULL',
        'cargo' => 'VARCHAR(255) NULL',
        'cargo_id' => 'VARCHAR(64) NULL',
        'quantidade' => 'INT NOT NULL DEFAULT 1',
        'tipo' => 'VARCHAR(32) NULL',
        'justificativa' => 'TEXT NULL',
        'prioridade' => 'VARCHAR(16) NULL DEFAULT \'normal\'',
        'status' => 'VARCHAR(48) NULL DEFAULT \'aguardando_aprovacao\'',
        'solicitante_id' => 'VARCHAR(64) NULL',
        'solicitante_nome' => 'VARCHAR(255) NULL',
        'responsavel_id' => 'VARCHAR(64) NULL',
        'responsavel_nome' => 'VARCHAR(255) NULL',
        'aprovado_por_id' => 'VARCHAR(64) NULL',
        'aprovado_por_nome' => 'VARCHAR(255) NULL',
        'aprovado_em' => 'DATETIME NULL',
        'reprovado_motivo' => 'TEXT NULL',
        'history' => 'JSON NULL',
        'active' => 'TINYINT(1) NOT NULL DEFAULT 1',
    ] as $col => $def) {
        $hit = soublu_rh_add_column($pdo, 'rh_vagas', $col, $def);
        if ($hit) {
            $added[] = "rh_vagas.{$hit}";
        }
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `rh_vaga_candidatos` (
            `id` VARCHAR(64) NOT NULL,
            `vaga_id` VARCHAR(64) NOT NULL,
            `nome` VARCHAR(255) NOT NULL,
            `contato` VARCHAR(128) NULL,
            `curriculo_url` VARCHAR(512) NULL,
            `resume_id` VARCHAR(64) NULL,
            `data_candidatura` DATETIME NULL,
            `status` VARCHAR(48) NOT NULL DEFAULT \'triagem\',
            `obs_rh` TEXT NULL,
            `history` JSON NULL,
            `created_by` VARCHAR(64) NULL,
            `active` TINYINT(1) NOT NULL DEFAULT 1,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_rh_vaga_cand_vaga` (`vaga_id`),
            KEY `idx_rh_vaga_cand_status` (`status`),
            KEY `idx_rh_vaga_cand_resume` (`resume_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $added[] = 'rh_vaga_candidatos';

    foreach ([
        'vaga_id' => 'VARCHAR(64) NULL',
        'nome' => 'VARCHAR(255) NULL',
        'contato' => 'VARCHAR(128) NULL',
        'curriculo_url' => 'VARCHAR(512) NULL',
        'resume_id' => 'VARCHAR(64) NULL',
        'data_candidatura' => 'DATETIME NULL',
        'status' => 'VARCHAR(48) NULL DEFAULT \'triagem\'',
        'obs_rh' => 'TEXT NULL',
        'history' => 'JSON NULL',
        'created_by' => 'VARCHAR(64) NULL',
        'active' => 'TINYINT(1) NOT NULL DEFAULT 1',
    ] as $col => $def) {
        $hit = soublu_rh_add_column($pdo, 'rh_vaga_candidatos', $col, $def);
        if ($hit) {
            $added[] = "rh_vaga_candidatos.{$hit}";
        }
    }

    $applied = ['ok' => true, 'added' => $added];
    $done = true;
    return $applied;
}

function soublu_rh_vagas_tables_exist(?PDO $pdo = null): bool
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
    foreach (['rh_vagas', 'rh_vaga_candidatos'] as $table) {
        $st->execute([$table]);
        if ((int) $st->fetchColumn() === 0) {
            $cached = false;
            return false;
        }
    }
    $cached = true;
    return true;
}

function soublu_ensure_rh_carreira_schema(?PDO $pdo = null): array
{
    $pdo = $pdo ?? soublu_pdo();
    $added = [];

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `rh_trilhas_cargos` (
            `id` VARCHAR(64) NOT NULL,
            `titulo` VARCHAR(255) NOT NULL,
            `icone` VARCHAR(64) NOT NULL DEFAULT \'target\',
            `descricao` TEXT NULL,
            `niveis` JSON NOT NULL,
            `sort_order` INT NOT NULL DEFAULT 0,
            `active` TINYINT(1) NOT NULL DEFAULT 1,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_rh_trilhas_sort` (`sort_order`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $added[] = 'rh_trilhas_cargos';

    foreach ([
        'icone' => "VARCHAR(64) NOT NULL DEFAULT 'target'",
        'descricao' => 'TEXT NULL',
        'niveis' => "JSON NULL",
        'sort_order' => 'INT NOT NULL DEFAULT 0',
        'active' => 'TINYINT(1) NOT NULL DEFAULT 1',
    ] as $col => $def) {
        $hit = soublu_rh_add_column($pdo, 'rh_trilhas_cargos', $col, $def);
        if ($hit) {
            $added[] = "rh_trilhas_cargos.{$hit}";
        }
    }

    $count = (int) $pdo->query('SELECT COUNT(*) FROM `rh_trilhas_cargos`')->fetchColumn();
    if ($count === 0) {
        $seed = [
            [
                'consultor',
                'Consultor de Vendas',
                'target',
                'Atuação comercial focada em prospecção, atendimento ao cliente e fechamento de contratos de crédito.',
                [
                    ['name' => 'Nível I', 'desc' => 'Atendimento inicial, prospecção básica e aprendizado das linhas de crédito.'],
                    ['name' => 'Nível II', 'desc' => 'Domínio das linhas de crédito, meta contínua atingida e suporte a novos consultores.'],
                    ['name' => 'Nível III', 'desc' => 'Alta performance de vendas, liderança técnica comercial e parcerias estratégicas.'],
                ],
                10,
            ],
            [
                'dev',
                'Assistente de Desenvolvimento de Sistemas',
                'code',
                'Desenvolvimento e manutenção de software, automações e sistemas internos.',
                [
                    ['name' => 'Nível I', 'desc' => 'Suporte a código existente, correção de bugs simples e testes de qualidade.'],
                    ['name' => 'Nível II', 'desc' => 'Desenvolvimento de novas funcionalidades, APIs e integração com parceiros.'],
                ],
                20,
            ],
            [
                'supervisor',
                'Supervisor de Teleatendimento',
                'headset',
                'Supervisão de equipe de atendimento remoto, monitoramento de métricas e qualidade de operação.',
                [
                    ['name' => 'Nível I', 'desc' => 'Gestão direta de equipe de teleatendimento e acompanhamento de metas diárias.'],
                    ['name' => 'Nível II', 'desc' => 'Gestão sênior da operação de atendimento, otimização de scripts e treinamento avançado.'],
                ],
                30,
            ],
            [
                'rh',
                'Analista de Recursos Humanos',
                'users',
                'Gestão de pessoas, recrutamento, treinamento, clima organizacional e avaliação de desempenho.',
                [
                    ['name' => 'Nível I', 'desc' => 'Execução de processos seletivos, integração de novos colaboradores e suporte a RH.'],
                    ['name' => 'Nível II', 'desc' => 'Gestão de programas de desenvolvimento, avaliação de desempenho e subsistemas de RH.'],
                ],
                40,
            ],
            [
                'backoffice',
                'Analista de Backoffice',
                'file',
                'Conferência documental, digitação de propostas de crédito e esteira operacional de contratação.',
                [
                    ['name' => 'Nível I', 'desc' => 'Análise de documentos básicos e digitação de propostas de menor complexidade.'],
                    ['name' => 'Nível II', 'desc' => 'Análise avançada de risco documental, tratamento de pendências complexas e esteira.'],
                ],
                50,
            ],
        ];
        $ins = $pdo->prepare(
            'INSERT INTO `rh_trilhas_cargos` (`id`, `titulo`, `icone`, `descricao`, `niveis`, `sort_order`, `active`)
             VALUES (?, ?, ?, ?, ?, ?, 1)'
        );
        foreach ($seed as $row) {
            $ins->execute([
                $row[0],
                $row[1],
                $row[2],
                $row[3],
                json_encode($row[4], JSON_UNESCAPED_UNICODE),
                $row[5],
            ]);
        }
        $added[] = 'rh_trilhas_cargos.seed';
    }

    return $added;
}

function soublu_rh_carreira_tables_exist(?PDO $pdo = null): bool
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
    $st->execute(['rh_trilhas_cargos']);
    $cached = ((int) $st->fetchColumn()) > 0;
    return $cached;
}
