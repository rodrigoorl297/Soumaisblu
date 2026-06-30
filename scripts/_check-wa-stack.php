<?php
$ch = curl_init('https://www.soumaisblu.com.br/api/setup-stack.php?action=status');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['X-API-Key: soublu_api_52e8c7a6b3df4019'],
    CURLOPT_TIMEOUT => 30,
]);
echo curl_exec($ch);
