<?php
$site = 'https://www.soumaisblu.com.br';
$key = 'soublu_api_52e8c7a6b3df4019';
$row = [
    'id' => 'bp_testverify_m01',
    'campaign_id' => 'album-copa-2026',
    'user_id' => 'test-user-verify',
    'user_name' => 'Teste Verify',
    'match_id' => 'm01',
    'pick' => '2-1',
    'created_at' => date('Y-m-d H:i:s'),
    'updated_at' => date('Y-m-d H:i:s'),
];
$payload = json_encode($row);
$ch = curl_init($site . '/api/rest/v1/bolao_copa_picks?on_conflict=id');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'X-API-Key: ' . $key,
        'Prefer: return=representation',
    ],
]);
$out = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
echo "POST HTTP $code\n$out\n\n";

$ch2 = curl_init($site . '/api/rest/v1/bolao_copa_picks?campaign_id=eq.album-copa-2026&user_id=eq.test-user-verify&select=*');
curl_setopt_array($ch2, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['X-API-Key: ' . $key],
]);
$out2 = curl_exec($ch2);
$code2 = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
curl_close($ch2);
echo "GET HTTP $code2\n$out2\n";
