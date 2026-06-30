<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$site = rtrim((string) ($argv[1] ?? 'https://www.soumaisblu.com.br'), '/');
$apiKey = (string) ($argv[2] ?? getenv('SOUBLU_API_KEY') ?: 'soublu_api_52e8c7a6b3df4019');
$files = [
    'api/remote-deploy.php',
    'js/financeiro-credito.js',
    'js/esteira-credito.js',
    'financeiro.html',
    'pages/financeiro.html',
];
foreach ($files as $rel) {
    $local = $root . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    $payload = json_encode([
        'path' => $rel,
        'content_base64' => base64_encode((string) file_get_contents($local)),
    ], JSON_UNESCAPED_SLASHES);
    $ch = curl_init($site . '/api/remote-deploy.php');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: ' . $apiKey],
        CURLOPT_TIMEOUT => 120,
    ]);
    echo $rel . ' ' . curl_exec($ch) . PHP_EOL;
    curl_close($ch);
}
