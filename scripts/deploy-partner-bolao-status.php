<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$site = rtrim((string) ($argv[1] ?? 'https://www.soumaisblu.com.br'), '/');
$apiKey = (string) ($argv[2] ?? getenv('SOUBLU_API_KEY') ?: 'soublu_api_52e8c7a6b3df4019');
$files = [
    'api/remote-deploy.php',
    'js/proposals.js',
    'js/bolao-copa.js',
    'js/admin.js',
    'js/employee.js',
    'js/profile.js',
    'js/withdrawal-flow.js',
    'js/withdrawal-rules.js',
    'js/db.js',
    'api/upload.php',
    'financeiro.html',
    'pages/financeiro.html',
    'employee.html',
    'pages/employee.html',
    'admin.html',
    'pages/admin.html',
    'financeiro-sections.html',
    'pages/financeiro-sections.html',
];
foreach ($files as $rel) {
    $local = $root . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    if (!is_file($local)) { fwrite(STDERR, "SKIP $rel\n"); continue; }
    $payload = json_encode(['path' => $rel, 'content_base64' => base64_encode((string) file_get_contents($local))], JSON_UNESCAPED_SLASHES);
    $ch = curl_init($site . '/api/remote-deploy.php');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: ' . $apiKey], CURLOPT_TIMEOUT => 300]);
    $out = (string) curl_exec($ch);
    echo "$rel HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . " $out\n";
    curl_close($ch);
}
echo "OK deploy-partner-bolao-status\n";
