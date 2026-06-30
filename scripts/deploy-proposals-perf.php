<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$site = 'https://www.soumaisblu.com.br';
$key = getenv('SOUBLU_API_KEY') ?: 'soublu_api_52e8c7a6b3df4019';
$files = ['api/remote-deploy.php', 'js/db.js', 'financeiro.html', 'pages/financeiro.html', 'admin.html', 'pages/admin.html', 'employee.html', 'pages/employee.html'];
foreach ($files as $rel) {
    $local = $root . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    if (!is_file($local)) continue;
    if (str_ends_with($rel, '.html')) {
        $c = str_replace('db.js?v=97c411irpj3', 'db.js?v=97c411perf3', file_get_contents($local));
        if ($c !== file_get_contents($local)) file_put_contents($local, $c);
    }
    $payload = json_encode(['path' => $rel, 'content_base64' => base64_encode((string) file_get_contents($local))]);
    $ch = curl_init($site . '/api/remote-deploy.php');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: ' . $key], CURLOPT_TIMEOUT => 120]);
    echo "$rel HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . " " . curl_exec($ch) . "\n";
    curl_close($ch);
}
echo "OK proposals-perf\n";
