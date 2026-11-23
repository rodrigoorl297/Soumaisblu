<?php
declare(strict_types=1);
/**
 * Corrige registros benefícios com id vazio no MySQL.
 * GET ?dry_run=1  |  GET ?apply=1
 */
require_once __DIR__ . '/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

$apply = isset($_GET['apply']) && $_GET['apply'] === '1';

$tables = [
    'beneficios_limites' => 'ben_lim_',
    'beneficios_prestadores' => 'ben_pre_',
    'beneficios_produtos' => 'ben_prd_',
    'beneficios_vouchers' => 'ben_vou_',
    'beneficios_fechamentos' => 'ben_fec_',
];

$pdo = soublu_pdo();
$report = [];

foreach ($tables as $table => $prefix) {
    try {
        $rows = $pdo->query("SELECT * FROM `{$table}` WHERE `id` IS NULL OR `id` = ''")->fetchAll(PDO::FETCH_ASSOC);
        $fixed = 0;
        if ($apply) {
            $upd = $pdo->prepare("UPDATE `{$table}` SET `id` = ? WHERE `id` IS NULL OR `id` = '' LIMIT 1");
            foreach ($rows as $row) {
                $newId = $prefix . bin2hex(random_bytes(6));
                $upd->execute([$newId]);
                $fixed++;
            }
        }
        $report[$table] = ['empty_id' => count($rows), 'fixed' => $fixed];
    } catch (Throwable $e) {
        $report[$table] = ['error' => $e->getMessage()];
    }
}

soublu_json([
    'ok' => true,
    'dry_run' => !$apply,
    'applied' => $apply,
    'report' => $report,
]);
