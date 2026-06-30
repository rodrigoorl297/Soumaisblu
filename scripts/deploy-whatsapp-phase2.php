<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$site = 'https://www.soumaisblu.com.br';
$key = getenv('SOUBLU_API_KEY') ?: 'soublu_api_52e8c7a6b3df4019';
$files = [
    'api/migrate-whatsapp.php',
    'api/whatsapp_api.php',
    'api/lib/EvolutionClient.php',
    'api/lib/WhatsAppRepository.php',
    'js/whatsapp-chat.js',
    'js/whatsapp-kanban.js',
    'css/whatsapp-chat.css',
    'pages/whatsapp.html',
];
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

// Run migration for contact_avatar_url column
$ch = curl_init($site . '/api/migrate-whatsapp.php');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['X-API-Key: ' . $key],
    CURLOPT_TIMEOUT => 60,
]);
echo "migrate-whatsapp GET " . curl_exec($ch) . "\n";
curl_close($ch);
