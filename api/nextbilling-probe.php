<?php
declare(strict_types=1);
/**
 * Probe temporário NextBilling — remover após uso.
 * GET ?action=probe  Header X-API-Key
 */
require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado'], 401);
}

$token = defined('NEXTBILLING_API_TOKEN') ? (string) NEXTBILLING_API_TOKEN : '';
$key = defined('NEXTBILLING_API_KEY') ? (string) NEXTBILLING_API_KEY : '';
$cfgServer = defined('NEXTBILLING_SERVER') ? trim((string) NEXTBILLING_SERVER) : '';

$servers = array_values(array_unique(array_filter([
    $cfgServer,
    'https://sip.nextbilling.com.br',
    'http://sip.nextbilling.com.br',
    'https://app.nextbilling.com.br',
    'https://painel.nextbilling.com.br',
])));

$out = [
    'ok' => true,
    'has_token' => $token !== '',
    'has_key' => $key !== '',
    'cfg_server' => $cfgServer,
    'probes' => [],
];

foreach ($servers as $server) {
    $host = parse_url($server, PHP_URL_HOST) ?: $server;
    $ip = @gethostbyname($host);
    $dnsOk = $ip && $ip !== $host;

    $helpUrl = rtrim($server, '/') . '/api/help';
    $ch = curl_init($helpUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    $entry = [
        'server' => $server,
        'dns_ip' => $dnsOk ? $ip : null,
        'help_http' => $code,
        'help_err' => $err ?: null,
        'help_snippet' => is_string($body) ? substr(preg_replace('/\s+/', ' ', $body) ?? '', 0, 160) : '',
        'devices' => [],
    ];

    if ($token !== '' && $key !== '' && $dnsOk) {
        foreach ([4689, 1784, 1, 2, 3, 4, 5, 10, 100] as $cid) {
            $url = rtrim($server, '/') . '/api/listDevices/' . rawurlencode($token) . '/' . rawurlencode($key) . '/' . $cid;
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_HTTPHEADER => ['Accept: application/json'],
            ]);
            $raw = curl_exec($ch);
            $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            $data = json_decode((string) $raw, true);
            $devices = [];
            if (is_array($data)) {
                $rows = $data[0]['data'] ?? $data['data'] ?? null;
                if (is_array($rows)) {
                    foreach ($rows as $row) {
                        if (!is_array($row)) continue;
                        $devices[] = [
                            'id' => $row['id'] ?? null,
                            'linha_ip' => $row['linha_ip'] ?? null,
                            'username' => $row['username'] ?? null,
                            'id_cliente' => $row['id_cliente'] ?? null,
                            'status' => $row['status'] ?? null,
                        ];
                    }
                }
            }
            $entry['devices'][] = [
                'customer_id' => $cid,
                'http' => $http,
                'count' => count($devices),
                'items' => array_slice($devices, 0, 30),
                'error' => is_array($data) ? ($data['reason'] ?? $data['error'] ?? null) : substr((string) $raw, 0, 120),
            ];
            if ($devices) {
                break;
            }
        }
    }

    $out['probes'][] = $entry;
}

soublu_json($out);
