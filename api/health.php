<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$t0 = microtime(true);
$out = [
    'ok' => true,
    'php' => 'up',
    'ts' => time(),
];

try {
    require_once __DIR__ . '/bootstrap.php';
    $pdo = soublu_pdo();
    $out['pdo'] = 'ok';
    $st = $pdo->query('SELECT 1');
    $out['db_ping'] = $st ? 'ok' : 'fail';
} catch (Throwable $e) {
    $out['ok'] = false;
    $out['pdo'] = 'fail';
    $out['error'] = $e->getMessage();
}

$out['ms'] = (int) round((microtime(true) - $t0) * 1000);
echo json_encode($out, JSON_UNESCAPED_UNICODE);
