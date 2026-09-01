<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$t0 = microtime(true);
$out = [
    'ok' => true,
    'php' => 'up',
    'ts' => time(),
];

try {
    require_once __DIR__ . '/bootstrap.php';
    $pdo = soublu_pdo();
    $out['pdo'] = 'ok';
    $st = $pdo->query('SELECT 1');
    $out['db_ping'] = $st ? 'ok' : 'fail';
} catch (Throwable $e) {
    $out['ok'] = false;
    $out['pdo'] = 'fail';
    $out['error'] = $e->getMessage();
}

$out['ms'] = (int) round((microtime(true) - $t0) * 1000);

/** Ping rápido no REST Supabase legado (só monitoramento; dados já estão no MySQL Localweb). */
try {
    if (!function_exists('soublu_file_legacy_base')) {
        require_once __DIR__ . '/lib/FileStorage.php';
    }
    $legacy = soublu_file_legacy_base();
    $keys = soublu_file_keys_for_base($legacy);
    $authKey = $keys['service'] !== '' ? $keys['service'] : ($keys['anon'] ?? '');
    if ($legacy !== '' && $authKey !== '') {
        $ch = curl_init(rtrim($legacy, '/') . '/rest/v1/');
        curl_setopt_array($ch, [
            CURLOPT_NOBODY => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 4,
            CURLOPT_HTTPHEADER => [
                'apikey: ' . $authKey,
                'Authorization: Bearer ' . $authKey,
            ],
        ]);
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $out['supabase_rest'] = ($code >= 200 && $code < 500) ? 'ok' : 'fail';
        $out['supabase_http'] = $code;
    } else {
        $out['supabase_rest'] = 'not_configured';
    }
} catch (Throwable $e) {
    $out['supabase_rest'] = 'fail';
    $out['supabase_error'] = $e->getMessage();
}

$out['db_backend'] = 'localweb-mysql';
echo json_encode($out, JSON_UNESCAPED_UNICODE);
