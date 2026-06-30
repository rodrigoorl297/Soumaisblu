<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$site = 'https://www.soumaisblu.com.br';
$key = getenv('SOUBLU_API_KEY') ?: 'soublu_api_52e8c7a6b3df4019';
$htmlFiles = ['employee.html', 'pages/employee.html', 'admin.html', 'pages/admin.html', 'financeiro.html', 'pages/financeiro.html', 'index.html'];
foreach ($htmlFiles as $rel) {
    $local = $root . '/' . $rel;
    if (!is_file($local)) continue;
    $c = file_get_contents($local);
    $n = str_replace(
        ['db.js?v=97c411perf1', 'db.js?v=97c411dbstable2', 'db.js?v=97c411dbstable4', 'db.js?v=97c411rh2'],
        'db.js?v=97c411irpj3',
        $c
    );
    if ($n !== $c) file_put_contents($local, $n);
}
$files = array_merge(['js/db.js'], $htmlFiles);
foreach ($files as $rel) {
    $local = $root . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    if (!is_file($local)) { echo "SKIP $rel\n"; continue; }
    $payload = json_encode(['path' => $rel, 'content_base64' => base64_encode((string) file_get_contents($local))]);
    $ch = curl_init($site . '/api/remote-deploy.php');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: ' . $key], CURLOPT_TIMEOUT => 120]);
    $out = (string) curl_exec($ch);
    echo "$rel HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . " $out\n";
    curl_close($ch);
}
echo "OK irpj fix deploy\n";
