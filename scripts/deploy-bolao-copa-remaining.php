<?php
$root = dirname(__DIR__);
$site = 'https://www.soumaisblu.com.br';
$key = 'soublu_api_52e8c7a6b3df4019';
$files = [
    'api/remote-deploy.php',
    'css/bolao-copa.css',
    'js/painel-sonhos.js',
    'js/employee.js',
    'js/admin.js',
    'js/db.js',
    'pages/admin.html',
    'admin.html',
    'pages/employee.html',
    'employee.html',
];

foreach ($files as $rel) {
    $local = $root . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    if (!is_file($local)) {
        echo "$rel MISSING\n";
        continue;
    }
    $payload = json_encode([
        'path' => $rel,
        'content_base64' => base64_encode(file_get_contents($local)),
    ]);
    $ch = curl_init($site . '/api/remote-deploy.php');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: ' . $key],
        CURLOPT_TIMEOUT => 180,
    ]);
    $out = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    echo "$rel HTTP $code $out\n";
    if ($code !== 200) {
        exit(1);
    }
}
echo "OK remaining deploy\n";
