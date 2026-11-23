<?php
declare(strict_types=1);

/**
 * fintech-corban.php — proxy da Partners API (Fintech do Corban).
 * Consulta por CPF (benefícios INSS / dados trabalhador) sem expor a API Key no browser.
 * Auth externa: header Subscription + Bearer do /Api/V1/User/Login.
 */
require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$action = (string) ($_GET['action'] ?? '');
if ($action === '' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $raw = file_get_contents('php://input') ?: '';
    $body = json_decode($raw, true);
    if (is_array($body)) {
        $action = (string) ($body['action'] ?? '');
    }
} else {
    $body = [];
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $raw = file_get_contents('php://input') ?: '';
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $body = $decoded;
        }
    }
}

/**
 * fintech_corban_cfg — lê constantes do config.fintech-corban.local.php.
 */
function fintech_corban_cfg(): array
{
    return [
        'key' => defined('FINTECH_CORBAN_SUBSCRIPTION_KEY') ? trim((string) FINTECH_CORBAN_SUBSCRIPTION_KEY) : '',
        'login' => defined('FINTECH_CORBAN_LOGIN') ? trim((string) FINTECH_CORBAN_LOGIN) : '',
        'password' => defined('FINTECH_CORBAN_PASSWORD') ? (string) FINTECH_CORBAN_PASSWORD : '',
        'base' => defined('FINTECH_CORBAN_API_BASE') && trim((string) FINTECH_CORBAN_API_BASE) !== ''
            ? rtrim((string) FINTECH_CORBAN_API_BASE, '/')
            : 'https://api.fintechdocorban.com.br/super-simples',
    ];
}

/**
 * fintech_corban_http — GET/POST na API com Subscription + Bearer opcional.
 */
function fintech_corban_http(string $method, string $path, ?array $payload, string $bearer): array
{
    $cfg = fintech_corban_cfg();
    $url = $cfg['base'] . $path;
    $headers = [
        'Accept: application/json',
        'Content-Type: application/json',
        'Subscription: ' . $cfg['key'],
    ];
    if ($bearer !== '') {
        $headers[] = 'Authorization: Bearer ' . $bearer;
    }

    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
    ];
    if ($payload !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE);
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $errno = curl_errno($ch);
    $err = curl_error($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($errno) {
        return ['ok' => false, 'status' => 0, 'error' => 'cURL: ' . $err, 'data' => null];
    }
    $json = null;
    if (is_string($raw) && $raw !== '') {
        $json = json_decode($raw, true);
        if (!is_array($json)) {
            $json = ['raw' => $raw];
        }
    }
    return [
        'ok' => $code >= 200 && $code < 300,
        'status' => $code,
        'error' => null,
        'data' => $json,
        'raw' => is_string($raw) ? $raw : '',
    ];
}

/**
 * fintech_corban_token_cache_path — arquivo temporário do JWT (por login).
 */
function fintech_corban_token_cache_path(string $login): string
{
    $safe = preg_replace('/[^a-zA-Z0-9._@-]/', '_', $login) ?: 'user';
    return sys_get_temp_dir() . '/soublu_fintech_corban_token_' . $safe . '.json';
}

/**
 * fintech_corban_get_token — login + cache do access_token até perto do expires_in.
 */
function fintech_corban_get_token(bool $force = false): array
{
    $cfg = fintech_corban_cfg();
    if ($cfg['key'] === '') {
        return ['ok' => false, 'error' => 'FINTECH_CORBAN_SUBSCRIPTION_KEY não configurada.'];
    }
    if ($cfg['login'] === '' || $cfg['password'] === '') {
        return [
            'ok' => false,
            'error' => 'Configure FINTECH_CORBAN_LOGIN e FINTECH_CORBAN_PASSWORD no config.fintech-corban.local.php (usuário/senha do portal parceiro). A API Key sozinha passa no gateway, mas as rotas exigem Bearer JWT.',
            'needs_login' => true,
        ];
    }

    $cacheFile = fintech_corban_token_cache_path($cfg['login']);
    if (!$force && is_file($cacheFile)) {
        $cached = json_decode((string) file_get_contents($cacheFile), true);
        if (is_array($cached) && !empty($cached['access_token']) && !empty($cached['exp']) && (int) $cached['exp'] > time() + 60) {
            return ['ok' => true, 'token' => (string) $cached['access_token']];
        }
    }

    $loginRes = fintech_corban_http('POST', '/Api/V1/User/Login', [
        'login' => $cfg['login'],
        'password' => $cfg['password'],
    ], '');

    if (!$loginRes['ok']) {
        $msg = is_array($loginRes['data'])
            ? (string) ($loginRes['data']['message'] ?? $loginRes['data']['title'] ?? 'Falha no login Fintech do Corban')
            : 'Falha no login Fintech do Corban';
        return ['ok' => false, 'error' => $msg, 'status' => $loginRes['status'], 'data' => $loginRes['data']];
    }

    $data = is_array($loginRes['data']) ? $loginRes['data'] : [];
    $token = (string) ($data['access_token'] ?? $data['token_bearer'] ?? $data['jwt_token'] ?? '');
    if ($token === '') {
        return ['ok' => false, 'error' => 'Login sem access_token.', 'data' => $data];
    }
    $expires = (int) ($data['expires_in'] ?? 3600);
    if ($expires < 60) {
        $expires = 3600;
    }
    @file_put_contents($cacheFile, json_encode([
        'access_token' => $token,
        'exp' => time() + $expires,
    ], JSON_UNESCAPED_UNICODE));

    return ['ok' => true, 'token' => $token];
}

/**
 * fintech_corban_digits — só números do CPF.
 */
function fintech_corban_digits(string $cpf): string
{
    return preg_replace('/\D/', '', $cpf) ?? '';
}

if ($action === 'status') {
    $cfg = fintech_corban_cfg();
    soublu_json([
        'ok' => true,
        'configured_key' => $cfg['key'] !== '',
        'configured_login' => $cfg['login'] !== '' && $cfg['password'] !== '',
        'base' => $cfg['base'],
    ]);
}

if ($action === 'consult') {
    $cpf = fintech_corban_digits((string) ($body['cpf'] ?? $_GET['cpf'] ?? ''));
    $kind = strtolower(trim((string) ($body['kind'] ?? $_GET['kind'] ?? 'benefits')));
    if (strlen($cpf) !== 11) {
        soublu_json(['ok' => false, 'error' => 'Informe um CPF com 11 dígitos.'], 400);
    }

    $tok = fintech_corban_get_token(false);
    if (empty($tok['ok'])) {
        soublu_json([
            'ok' => false,
            'error' => $tok['error'] ?? 'Sem token',
            'needs_login' => !empty($tok['needs_login']),
            'data' => $tok['data'] ?? null,
        ], !empty($tok['needs_login']) ? 503 : 502);
    }

    $pathMap = [
        'benefits' => '/Api/V1/Qi/Get-All-Benefits-By-Cpf/' . $cpf,
        'worker' => '/Api/V1/Qi/Get-All-Consult-Data-Worker-By-Cpf/' . $cpf,
        'celcoin' => '/Api/V1/Celcoin/Get-All-Consult-Data-Worker-By-Cpf/' . $cpf,
        'operations' => '/Api/V1/Operation/Get-By-Cpf-Partner-Integration/' . $cpf,
    ];
    if (!isset($pathMap[$kind])) {
        soublu_json(['ok' => false, 'error' => 'kind inválido. Use: benefits, worker, celcoin, operations.'], 400);
    }

    $res = fintech_corban_http('GET', $pathMap[$kind], null, (string) $tok['token']);
    if ($res['status'] === 401) {
        $tok = fintech_corban_get_token(true);
        if (!empty($tok['ok'])) {
            $res = fintech_corban_http('GET', $pathMap[$kind], null, (string) $tok['token']);
        }
    }

    /* Extrai Message/Error do JSON da Fintech (404/403/409) para mostrar na tela. */
    $apiMsg = null;
    if (is_array($res['data'])) {
        $apiMsg = $res['data']['Message'] ?? $res['data']['message']
            ?? $res['data']['Error'] ?? $res['data']['error'] ?? null;
        if (is_array($apiMsg)) {
            $apiMsg = json_encode($apiMsg, JSON_UNESCAPED_UNICODE);
        }
    }
    $emptyOk = $res['ok'] && is_array($res['data']) && $res['data'] === [];
    $error = null;
    if (!$res['ok']) {
        $error = $apiMsg ?: ($res['error'] ?: ('API retornou HTTP ' . $res['status']));
    } elseif ($emptyOk) {
        $error = null;
        $apiMsg = 'Consulta OK, mas a API não trouxe registros para este CPF.';
    }

    soublu_json([
        'ok' => $res['ok'],
        'status' => $res['status'],
        'kind' => $kind,
        'cpf' => $cpf,
        'data' => $res['data'],
        'message' => $apiMsg,
        'error' => $error,
    ], $res['ok'] ? 200 : 200); /* sempre 200 no proxy — o front usa ok/status/error */
}

soublu_json(['ok' => false, 'error' => 'action inválida. Use status ou consult.'], 400);
