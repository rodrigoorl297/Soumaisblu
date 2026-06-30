<?php
$root = dirname(__DIR__);
$site = 'https://www.soumaisblu.com.br';
$key = 'soublu_api_52e8c7a6b3df4019';
foreach ([
    'api/migrate-bolao-copa.php',
    'api/lib/PostgRestCompat.php',
    'js/bolao-copa.js',
    'js/employee.js',
    'css/bolao-copa.css',
    'employee.html',
    'admin.html',
] as $rel) {
    $local = $root . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    $payload = json_encode(['path' => $rel, 'content_base64' => base64_encode(file_get_contents($local))]);
    $ch = curl_init($site . '/api/remote-deploy.php');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: ' . $key], CURLOPT_TIMEOUT => 180]);
    $out = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    echo "$rel HTTP $code $out\n";
    if ($code !== 200) exit(1);
}
$ch = curl_init($site . '/api/migrate-bolao-copa.php');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['X-API-Key: ' . $key]]);
echo "migrate " . curl_exec($ch) . "\n";
curl_close($ch);
echo "OK partner bolao deploy\n";
