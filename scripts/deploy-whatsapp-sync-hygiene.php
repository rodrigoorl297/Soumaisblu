<?php
declare(strict_types=1);
/** Deploy fix 97c411wa16 — paginated findChats, recent conversations like WA Web */
$root = dirname(__DIR__);
$cacheVer = '97c411wa16';
$site = 'https://www.soumaisblu.com.br';
$key = getenv('SOUBLU_API_KEY') ?: 'soublu_api_52e8c7a6b3df4019';
foreach ([
    'api/whatsapp_api.php',
    'api/lib/EvolutionClient.php',
    'api/lib/WhatsAppRepository.php',
    'js/whatsapp-chat.js',
    'js/whatsapp-kanban.js',
    'css/whatsapp-chat.css',
    'pages/whatsapp.html',
] as $rel) {
    $payload = json_encode(['path' => $rel, 'content_base64' => base64_encode((string) file_get_contents("$root/$rel"))]);
    $ch = curl_init("$site/api/remote-deploy.php");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', "X-API-Key: $key"],
        CURLOPT_TIMEOUT => 120,
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    echo "$rel HTTP $code $resp\n";
    curl_close($ch);
}
