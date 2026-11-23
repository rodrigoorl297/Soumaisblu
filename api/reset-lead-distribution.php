<?php
declare(strict_types=1);

/**
 * reset-lead-distribution — zera atribuições de leads para redistribuir do zero.
 * Libera assigned_* de todos os leads, apaga cotas semanais e zera contadores dos lotes.
 * Não apaga leads nem histórico de status (pendente/trabalhado permanece).
 *
 * GET/POST ?confirm=1  (header X-API-Key)
 */
require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado'], 401);
}

$confirm = (string) ($_GET['confirm'] ?? $_POST['confirm'] ?? '') === '1';
if (!$confirm) {
    soublu_json(['ok' => false, 'error' => 'Passe confirm=1'], 400);
}

$pdo = soublu_pdo();

$beforeAssigned = (int) $pdo->query(
    "SELECT COUNT(*) FROM `leads`
     WHERE `assigned_to` IS NOT NULL AND TRIM(`assigned_to`) <> ''"
)->fetchColumn();

$stmtLeads = $pdo->exec(
    "UPDATE `leads`
     SET `assigned_to` = NULL,
         `assigned_date` = NULL,
         `assigned_week` = NULL,
         `assigned_year` = NULL
     WHERE `assigned_to` IS NOT NULL AND TRIM(`assigned_to`) <> ''"
);
$clearedLeads = is_int($stmtLeads) ? $stmtLeads : (int) $pdo->query('SELECT ROW_COUNT()')->fetchColumn();

$weeklyBefore = (int) $pdo->query('SELECT COUNT(*) FROM `lead_weekly_assignments`')->fetchColumn();
$pdo->exec('DELETE FROM `lead_weekly_assignments`');
$weeklyDeleted = $weeklyBefore;

$batchesUpdated = (int) $pdo->exec(
    "UPDATE `lead_batches`
     SET `distributed_records` = 0,
         `status` = CASE
           WHEN `status` IN ('active', 'distributed', 'distributing') THEN 'uploaded'
           ELSE `status`
         END
     WHERE `distributed_records` <> 0
        OR `status` IN ('active', 'distributed', 'distributing')"
);

$progressReset = (int) $pdo->exec(
    "UPDATE `lead_daily_progress`
     SET `target` = 0, `completed` = 0, `met_target` = 0
     WHERE `target` <> 0 OR `completed` <> 0 OR `met_target` <> 0"
);

$leftAssigned = (int) $pdo->query(
    "SELECT COUNT(*) FROM `leads`
     WHERE `assigned_to` IS NOT NULL AND TRIM(`assigned_to`) <> ''"
)->fetchColumn();

$pendingFree = (int) $pdo->query(
    "SELECT COUNT(*) FROM `leads`
     WHERE (`status` IS NULL OR `status` = '' OR `status` = 'pending')
       AND (`assigned_to` IS NULL OR TRIM(`assigned_to`) = '')"
)->fetchColumn();

soublu_json([
    'ok' => true,
    'before_assigned' => $beforeAssigned,
    'cleared_leads' => $clearedLeads,
    'weekly_assignments_deleted' => $weeklyDeleted,
    'batches_reset' => $batchesUpdated,
    'daily_progress_reset' => $progressReset,
    'left_assigned' => $leftAssigned,
    'pending_available' => $pendingFree,
]);
