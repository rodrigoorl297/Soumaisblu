<?php
declare(strict_types=1);
/**
 * Temp debug — remove after.
 * GET with X-API-Key → picks user with phone and runs click2call to dst=
 */
require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado'], 401);
}

$dst = preg_replace('/\D+/', '', (string) ($_GET['dst'] ?? '62992743408')) ?? '';
$srcOverride = preg_replace('/\D+/', '', (string) ($_GET['src'] ?? '')) ?? '';

try {
    $pdo = soublu_pdo();
    $stmt = $pdo->query("SELECT id, name, phone, role FROM users WHERE phone IS NOT NULL AND phone <> '' ORDER BY updated_at DESC LIMIT 30");
    $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
    $pick = null;
    foreach ($rows as $u) {
        if (stripos((string) ($u['name'] ?? ''), 'marilia') !== false) {
            $pick = $u;
            break;
        }
    }
    if (!$pick && $rows) {
        $pick = $rows[0];
    }
    if (!$pick) {
        soublu_json(['ok' => false, 'error' => 'Nenhum user com telefone', 'sample' => $rows], 404);
    }

    $src = $srcOverride !== '' ? $srcOverride : preg_replace('/\D+/', '', (string) ($pick['phone'] ?? ''));

    // Call NextBilling directly from production host
    $server = '';
    if (function_exists('nb_server')) {
        // not loaded
    }
    if (defined('NEXTBILLING_SERVER')) {
        $server = rtrim((string) NEXTBILLING_SERVER, '/');
    }
    $settingsPath = soublu_config_root() . '/config.nextbilling.settings.json';
    if (is_file($settingsPath)) {
        $st = json_decode((string) file_get_contents($settingsPath), true);
        if (!empty($st['server'])) {
            $server = rtrim((string) $st['server'], '/');
        }
    }
    $deviceId = defined('NEXTBILLING_DEVICE_ID') ? (int) NEXTBILLING_DEVICE_ID : 0;
    if (is_file($settingsPath)) {
        $st = json_decode((string) @file_get_contents($settingsPath), true);
        if (!empty($st['device_id'])) {
            $deviceId = (int) $st['device_id'];
        }
    }

    $url = $server . '/api/click2Call/' . rawurlencode((string) NEXTBILLING_API_TOKEN) . '/' . rawurlencode((string) NEXTBILLING_API_KEY);
    $payload = json_encode(['device_id' => $deviceId, 'src' => $src, 'dst' => $dst], JSON_UNESCAPED_UNICODE);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $raw = curl_exec($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    // Also via our proxy using same user
    $proxyPayload = json_encode([
        'user_id' => $pick['id'],
        'src' => $src,
        'dst' => $dst,
    ], JSON_UNESCAPED_UNICODE);
    $ch = curl_init('https://www.soumaisblu.com.br/api/nextbilling.php?action=click2call');
    // actually call local include path - use internal request simulation
    // Better: just report direct result + invoke local functions if available

    soublu_json([
        'ok' => true,
        'user' => [
            'id' => $pick['id'],
            'name' => $pick['name'],
            'phone' => $pick['phone'],
            'role' => $pick['role'],
        ],
        'call' => [
            'server' => $server,
            'device_id' => $deviceId,
            'src' => $src,
            'dst' => $dst,
            'url_host' => parse_url($url, PHP_URL_HOST),
        ],
        'nextbilling_http' => $http,
        'nextbilling_curl_err' => $cerr ?: null,
        'nextbilling_body' => json_decode((string) $raw, true) ?: $raw,
        'users_with_phone_sample' => array_map(static function ($u) {
            return [
                'id' => $u['id'] ?? null,
                'name' => $u['name'] ?? null,
                'phone' => $u['phone'] ?? null,
            ];
        }, array_slice($rows, 0, 8)),
    ]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
