<?php
declare(strict_types=1);
require dirname(__DIR__) . '/api/bootstrap.php';
require dirname(__DIR__) . '/config.evolution.local.php';
require dirname(__DIR__) . '/api/lib/EvolutionClient.php';

$name = $argv[1] ?? 'soublu_u_master01';
$evo = new EvolutionClient();
$resp = $evo->connectionState($name);
echo json_encode([
    'raw' => $resp,
    'parsed' => EvolutionClient::parseConnectionState($resp),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
