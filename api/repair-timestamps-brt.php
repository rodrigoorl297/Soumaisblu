<?php
/**
 * repair-timestamps-brt — corrige registros legados gravados em UTC (toISOString)
 * para horário de parede de Brasília (−3 h nas colunas DATETIME).
 *
 * GET/POST ?dry_run=1 (padrão) — só conta o que seria alterado.
 * POST ?dry_run=0 — aplica (uma vez por tabela genérica; propostas usa heurística idempotente).
 * POST ?force=1 — ignora flag de já executado nas tabelas genéricas.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

$dryRaw = null;
if (array_key_exists('dry_run', $_GET)) {
    $dryRaw = $_GET['dry_run'];
} elseif (array_key_exists('dry_run', $_POST)) {
    $dryRaw = $_POST['dry_run'];
}
$dryRun = $dryRaw === null || (string) $dryRaw !== '0';
$force = ((string) ($_GET['force'] ?? $_POST['force'] ?? '0')) === '1';

/** Tabelas que já gravavam em BRT (PHP/servidor) — não alterar. */
const SOUBLU_BRT_SKIP_TABLES = [
    'transactions',
    'meetings',
    'schema_repairs',
    'account_block_events',
    'proposal_archive',
    'internal_chat_threads',
    'internal_chat_messages',
    'whatsapp_chats',
    'whatsapp_messages',
    'whatsapp_instances',
    'wa_chats',
    'wa_messages',
    'fontedata_cnpj_cache',
    'fontedata_consulta_cache',
];

/**
 * Tabelas preenchidas pelo front com toISOString() (UTC) — correção −3 h.
 * Demais tabelas com datetime são ignoradas por segurança.
 */
const SOUBLU_BRT_GENERIC_TABLES = [
    'users', 'partners', 'products', 'orders', 'withdrawals', 'clients', 'tickets',
    'trainings', 'training_attempts', 'training_mural', 'training_mural_reads',
    'training_mural_likes', 'training_mural_comments', 'training_tracks', 'training_track_completions',
    'lead_batches', 'leads', 'lead_weekly_assignments', 'lead_daily_progress', 'lead_unlock_requests',
    'tim_referrals', 'contestations', 'partner_fiscal',
    'marketplace_services', 'marketplace_orders',
    'finance_suppliers', 'finance_expenses', 'finance_adiantamento', 'finance_reembolso', 'finance_proposta_ops',
    'rh_companies', 'rh_resumes', 'rh_jobs', 'rh_employees', 'rh_absence_justifications',
    'rh_punishments', 'rh_dismissals', 'rh_vagas', 'rh_vaga_candidatos', 'rh_trilhas_cargos',
    'monitoria_atendimento', 'bolao_copa_picks', 'bolao_copa_results',
    'beneficios_limites', 'beneficios_prestadores', 'beneficios_produtos', 'beneficios_vouchers', 'beneficios_fechamentos',
    'credit_proposals',
];

const SOUBLU_BRT_REPAIR_KEY = 'timestamps_brt_v1';

/**
 * Lista colunas DATETIME/TIMESTAMP de uma tabela no schema atual.
 *
 * @return list<string>
 */
function soublu_brt_datetime_columns(PDO $pdo, string $table): array
{
    $st = $pdo->prepare(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
           AND DATA_TYPE IN (\'datetime\', \'timestamp\')
         ORDER BY ORDINAL_POSITION'
    );
    $st->execute([$table]);
    $cols = [];
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $cols[] = (string) $row['COLUMN_NAME'];
    }
    return $cols;
}

/**
 * Corrige proposals: created_at/updated_at/createdAt/updatedAt quando
 * divergem ~3 h do timestamp embutido no id PROP-{ms}.
 *
 * @return array{would:int,updated:int,samples:list<array<string,mixed>>}
 */
function soublu_brt_repair_proposals(PDO $pdo, bool $dryRun): array
{
    $cols = array_values(array_intersect(
        soublu_brt_datetime_columns($pdo, 'proposals'),
        ['created_at', 'updated_at', 'createdAt', 'updatedAt']
    ));
    if ($cols === []) {
        return ['would' => 0, 'updated' => 0, 'samples' => []];
    }

    $setParts = [];
    foreach ($cols as $c) {
        $setParts[] = '`' . str_replace('`', '``', $c) . '` = DATE_SUB(`' . str_replace('`', '``', $c) . '`, INTERVAL 3 HOUR)';
    }
    $setSql = implode(', ', $setParts);

    // Só linhas PROP-* com ~180 min de diferença entre id (ms) e created_at.
    $where = "WHERE `id` LIKE 'PROP-%'
        AND `created_at` IS NOT NULL
        AND CAST(SUBSTRING(`id`, 6) AS UNSIGNED) > 0
        AND ABS(TIMESTAMPDIFF(MINUTE, `created_at`, FROM_UNIXTIME(CAST(SUBSTRING(`id`, 6) AS UNSIGNED) / 1000))) BETWEEN 170 AND 190";

    $countSt = $pdo->query("SELECT COUNT(*) FROM `proposals` {$where}");
    $would = (int) $countSt->fetchColumn();

    $sampleSt = $pdo->query(
        "SELECT `id`, `created_at`, `updated_at`,
                FROM_UNIXTIME(CAST(SUBSTRING(`id`, 6) AS UNSIGNED) / 1000) AS id_brt,
                DATE_SUB(`created_at`, INTERVAL 3 HOUR) AS created_at_novo
         FROM `proposals` {$where}
         ORDER BY `created_at` DESC LIMIT 8"
    );
    $samples = $sampleSt ? $sampleSt->fetchAll(PDO::FETCH_ASSOC) : [];

    $updated = 0;
    if (!$dryRun && $would > 0) {
        $updated = $pdo->exec("UPDATE `proposals` SET {$setSql} {$where}");
        if ($updated === false) {
            $updated = 0;
        }
    }

    return ['would' => $would, 'updated' => (int) $updated, 'samples' => $samples];
}

/**
 * Corrige tabela genérica (−3 h em todas as colunas datetime).
 *
 * @return array{table:string,columns:list<string>,would:int,updated:int}
 */
function soublu_brt_repair_table(PDO $pdo, string $table, bool $dryRun): array
{
    $cols = soublu_brt_datetime_columns($pdo, $table);
    if ($cols === []) {
        return ['table' => $table, 'columns' => [], 'would' => 0, 'updated' => 0];
    }

    $setParts = [];
    foreach ($cols as $c) {
        $setParts[] = '`' . str_replace('`', '``', $c) . '` = DATE_SUB(`' . str_replace('`', '``', $c) . '`, INTERVAL 3 HOUR)';
    }
    $where = 'WHERE ' . implode(' OR ', array_map(
        static fn (string $c) => '`' . str_replace('`', '``', $c) . '` IS NOT NULL',
        $cols
    ));

    $countSt = $pdo->query("SELECT COUNT(*) FROM `{$table}` {$where}");
    $would = (int) $countSt->fetchColumn();

    $updated = 0;
    if (!$dryRun && $would > 0) {
        $updated = $pdo->exec("UPDATE `{$table}` SET " . implode(', ', $setParts) . " {$where}");
        if ($updated === false) {
            $updated = 0;
        }
    }

    return ['table' => $table, 'columns' => $cols, 'would' => $would, 'updated' => (int) $updated];
}

/**
 * Garante tabela de controle de migrações one-shot.
 */
function soublu_brt_ensure_repair_log(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `schema_repairs` (
            `repair_key` VARCHAR(64) NOT NULL PRIMARY KEY,
            `applied_at` DATETIME NOT NULL,
            `details` JSON NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
}

function soublu_brt_repair_was_applied(PDO $pdo, string $key): bool
{
    soublu_brt_ensure_repair_log($pdo);
    $st = $pdo->prepare('SELECT 1 FROM `schema_repairs` WHERE `repair_key` = ? LIMIT 1');
    $st->execute([$key]);
    return (bool) $st->fetchColumn();
}

function soublu_brt_mark_repair_applied(PDO $pdo, string $key, array $details): void
{
    soublu_brt_ensure_repair_log($pdo);
    $st = $pdo->prepare(
        'INSERT INTO `schema_repairs` (`repair_key`, `applied_at`, `details`)
         VALUES (?, NOW(), ?)
         ON DUPLICATE KEY UPDATE `applied_at` = VALUES(`applied_at`), `details` = VALUES(`details`)'
    );
    $st->execute([$key, json_encode($details, JSON_UNESCAPED_UNICODE)]);
}

try {
    $pdo = soublu_pdo();
    $out = [
        'ok' => true,
        'dry_run' => $dryRun,
        'force' => $force,
        'repair_key' => SOUBLU_BRT_REPAIR_KEY,
        'timezone' => 'America/Sao_Paulo',
        'offset_hours' => -3,
        'proposals' => null,
        'tables' => [],
        'skipped_tables' => SOUBLU_BRT_SKIP_TABLES,
    ];

    $out['proposals'] = soublu_brt_repair_proposals($pdo, $dryRun);

    $tablesSt = $pdo->query(
        'SELECT TABLE_NAME FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = \'BASE TABLE\'
         ORDER BY TABLE_NAME'
    );
    $allTables = [];
    while ($row = $tablesSt->fetch(PDO::FETCH_ASSOC)) {
        $allTables[] = (string) $row['TABLE_NAME'];
    }

    $genericAlready = soublu_brt_repair_was_applied($pdo, SOUBLU_BRT_REPAIR_KEY);
    $out['generic_already_applied'] = $genericAlready;
    $out['generic_whitelist'] = SOUBLU_BRT_GENERIC_TABLES;

    if ($genericAlready && !$force && !$dryRun) {
        $out['generic_message'] = 'Correção genérica já aplicada. Use force=1 para repetir (não recomendado).';
    } else {
        foreach ($allTables as $table) {
            if ($table === 'proposals' || in_array($table, SOUBLU_BRT_SKIP_TABLES, true)) {
                continue;
            }
            if (!in_array($table, SOUBLU_BRT_GENERIC_TABLES, true)) {
                continue;
            }
            $cols = soublu_brt_datetime_columns($pdo, $table);
            if ($cols === []) {
                continue;
            }
            $res = soublu_brt_repair_table($pdo, $table, $dryRun);
            if ($res['would'] > 0) {
                $out['tables'][] = $res;
            }
        }

        if (!$dryRun && !$genericAlready) {
            soublu_brt_mark_repair_applied($pdo, SOUBLU_BRT_REPAIR_KEY, [
                'tables' => $out['tables'],
                'proposals' => $out['proposals'],
            ]);
        } elseif (!$dryRun && $force) {
            soublu_brt_mark_repair_applied($pdo, SOUBLU_BRT_REPAIR_KEY . '_force_' . date('YmdHis'), [
                'tables' => $out['tables'],
                'proposals' => $out['proposals'],
            ]);
        }
    }

    $out['total_would'] = (int) $out['proposals']['would']
        + array_sum(array_column($out['tables'], 'would'));
    $out['total_updated'] = (int) $out['proposals']['updated']
        + array_sum(array_column($out['tables'], 'updated'));

    soublu_json($out);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
