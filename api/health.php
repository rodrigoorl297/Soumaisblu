<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

echo json_encode([
    'ok' => true,
    'php' => 'up',
    'ms' => 0,
    'ts' => time(),
], JSON_UNESCAPED_UNICODE);
