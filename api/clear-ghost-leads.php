<?php
declare(strict_types=1);

/**
 * Limpa atribuições fantasmas de leads (PDO direto).
 * GET/POST ?key=...&confirm=1
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

$batchIds = ['lbmpwlwzf2meozi', 'lbmpwm1by2w2lyy'];
$pdo = soublu_pdo();

$cleared = 0;
$placeholders = implode(',', array_fill(0, count($batchIds), '?'));
$stmt = $pdo->prepare(
    "UPDATE `leads`
     SET `assigned_to` = NULL,
         `assigned_date` = NULL,
         `assigned_week` = NULL,
         `assigned_year` = NULL
     WHERE `batch_id` IN ($placeholders)
       AND `assigned_to` IS NOT NULL"
);
$stmt->execute($batchIds);
$cleared += (int) $stmt->rowCount();

// Qualquer lead ainda na Marília (segurança)
$stmt2 = $pdo->prepare(
    "UPDATE `leads`
     SET `assigned_to` = NULL,
         `assigned_date` = NULL,
         `assigned_week` = NULL,
         `assigned_year` = NULL
     WHERE `assigned_to` = ?"
);
$stmt2->execute(['vnd_417ab6516b7c']);
$cleared += (int) $stmt2->rowCount();

$stmt3 = $pdo->prepare(
    "UPDATE `lead_batches`
     SET `status` = 'uploaded', `distributed_records` = 0
     WHERE `id` IN ($placeholders)"
);
$stmt3->execute($batchIds);

$stmt4 = $pdo->prepare(
    "UPDATE `lead_daily_progress`
     SET `target` = 0, `completed` = 0, `met_target` = 0
     WHERE `user_id` = ?"
);
$stmt4->execute(['vnd_417ab6516b7c']);

$left = (int) $pdo->query(
    "SELECT COUNT(*) FROM `leads` WHERE `assigned_to` = 'vnd_417ab6516b7c'"
)->fetchColumn();

soublu_json([
    'ok' => true,
    'cleared_rows' => $cleared,
    'marilia_left' => $left,
]);
