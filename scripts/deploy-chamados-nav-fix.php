<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$site = 'https://www.soumaisblu.com.br';
$key = getenv('SOUBLU_API_KEY') ?: 'soublu_api_52e8c7a6b3df4019';
$files = ['pages/employee.html', 'js/employee.js', 'js/tickets.js'];
foreach ($files as $rel) {
    $local = $root . '/' . $rel;
    $payload = json_encode([
        'path' => $rel,
        'content_base64' => base64_encode((string) file_get_contents($local)),
    ]);
    $ch = curl_init($site . '/api/remote-deploy.php');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: ' . $key],
        CURLOPT_TIMEOUT => 120,
    ]);
    $out = (string) curl_exec($ch);
    echo "$rel HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . " $out\n";
    curl_close($ch);
}
