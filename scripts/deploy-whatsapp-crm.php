<?php
declare(strict_types=1);
/**
 * Deploy WhatsApp CRM — SOMENTE quando o usuário pedir explicitamente.
 * Uso local: php scripts/deploy-whatsapp-crm.php
 */
$root = dirname(__DIR__);
$site = rtrim((string) ($argv[1] ?? 'https://www.soumaisblu.com.br'), '/');
$apiKey = (string) ($argv[2] ?? 'soublu_api_52e8c7a6b3df4019');
$files = [
    'api/remote-deploy.php',
    'js/whatsapp-chat.js',
    'js/whatsapp-page.js',
    'css/whatsapp-chat.css',
    'pages/whatsapp.html',
    'whatsapp.html',
];
foreach ($files as $rel) {
    $local = $root . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    if (!is_file($local)) {
        fwrite(STDERR, "SKIP $rel\n");
        continue;
    }
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
    $out = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    echo "$rel HTTP $code $out\n";
    if ($code < 200 || $code >= 300) {
        exit(1);
    }
}
