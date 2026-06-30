<?php
$root = dirname(__DIR__);
$rel = 'js/whatsapp-chat.js';
$payload = json_encode([
    'path' => $rel,
    'content_base64' => base64_encode((string) file_get_contents($root . '/' . $rel)),
]);
$ch = curl_init('https://www.soumaisblu.com.br/api/remote-deploy.php');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: soublu_api_52e8c7a6b3df4019'],
]);
echo curl_exec($ch);
