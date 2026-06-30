<?php
/**
 * Proxy FonteData — CPF (cliente/funcionário) e CNPJ (parceiro).
 * GET ?cpf=... | ?cnpj=...&consulta=... | ?consulta=tj-certidao&cpf_cnpj=...
 * Certidão TJ: {FONTE_DATA_API_BASE}/tj-certidao?cpf_cnpj=
 * Header: X-FonteData-Token
 */
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-FonteData-Token, Authorization');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Use GET'], JSON_UNESCAPED_UNICODE);
    exit;
}

$configPath = dirname(__DIR__) . '/config.pix.local.php';
if (!is_file($configPath)) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'config.pix.local.php não encontrado.'], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once $configPath;

$internal = defined('FONTE_DATA_INTERNAL_TOKEN') && trim((string) FONTE_DATA_INTERNAL_TOKEN) !== ''
    ? (string) FONTE_DATA_INTERNAL_TOKEN
    : (defined('PIX_INTERNAL_TOKEN') ? (string) PIX_INTERNAL_TOKEN : '');

$hdr = $_SERVER['HTTP_X_FONTEDATA_TOKEN'] ?? '';
if ($internal === '' || !hash_equals($internal, $hdr)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Token inválido'], JSON_UNESCAPED_UNICODE);
    exit;
}

$apiKey = defined('FONTE_DATA_API_KEY') ? trim((string) FONTE_DATA_API_KEY) : '';
if ($apiKey === '' || $apiKey === 'SUA-CHAVE-FONTEDATA') {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'FONTE_DATA_API_KEY não configurada'], JSON_UNESCAPED_UNICODE);
    exit;
}

$base = defined('FONTE_DATA_API_BASE') && trim((string) FONTE_DATA_API_BASE) !== ''
    ? rtrim((string) FONTE_DATA_API_BASE, '/')
    : 'https://app.fontedata.com/api/v1/consulta';

$cpf = preg_replace('/\D/', '', (string) ($_GET['cpf'] ?? ''));
$cnpj = preg_replace('/\D/', '', (string) ($_GET['cnpj'] ?? ''));
$cpfCnpj = preg_replace('/\D/', '', (string) ($_GET['cpf_cnpj'] ?? ''));
if ($cnpj === '' && strlen($cpfCnpj) === 14) {
    $cnpj = $cpfCnpj;
}
if ($cnpj === '' && strlen($cpf) === 14) {
    $cnpj = $cpf;
    $cpf = '';
}
$consultaParam = trim((string) ($_GET['consulta'] ?? ''));

$cnpjEndpoints = [
    'consulta-cnpj-receita',
    'score-credito-quod',
];

$cpfEndpoints = [
    'dados-cadastrais-basicos',
    'cadastro-pf-basica',
    'receita-federal-pf',
    'pis-trabalho',
    'cadastro-rf-pf',
];

$dataNascimento = trim((string) ($_GET['data_nascimento'] ?? $_GET['dataNascimento'] ?? ''));

function fontedata_append_cpf_query(string $url, string $dataNascimento): string
{
    if ($dataNascimento === '') {
        return $url;
    }
    $dn = rawurlencode($dataNascimento);
    return $url . '&data_nascimento=' . $dn . '&dataNascimento=' . $dn;
}

/** Certidão TJ — usa FONTE_DATA_API_BASE (mesmo host das demais consultas). */
if ($consultaParam === 'tj-certidao') {
    $doc = $cpfCnpj !== '' ? $cpfCnpj : ($cnpj !== '' ? $cnpj : $cpf);
    if (strlen($doc) !== 11 && strlen($doc) !== 14) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Informe CPF (11) ou CNPJ (14) para Certidão TJ'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $url = $base . '/tj-certidao?cpf_cnpj=' . rawurlencode($doc);
    $consulta = 'tj-certidao';
    // #region agent log
    $logPath = dirname(__DIR__) . '/debug-97c411.log';
    $logHost = parse_url($url, PHP_URL_HOST) ?: 'unknown';
    @file_put_contents($logPath, json_encode([
        'sessionId' => '97c411',
        'location' => 'fontedata.php:tj-certidao',
        'message' => 'tj-certidao request',
        'data' => ['host' => $logHost],
        'timestamp' => (int) round(microtime(true) * 1000),
        'hypothesisId' => 'certidao-host',
        'runId' => 'calc-fix',
    ], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
    // #endregion
} elseif ($cnpj !== '') {
    if (strlen($cnpj) !== 14) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'CNPJ inválido (14 dígitos)'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $consulta = trim((string) ($_GET['consulta'] ?? 'consulta-cnpj-receita'));
    if (!in_array($consulta, $cnpjEndpoints, true)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Consulta CNPJ não permitida'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $url = $base . '/' . rawurlencode($consulta) . '?cnpj=' . rawurlencode($cnpj);
} elseif ($cpf !== '') {
    if (strlen($cpf) !== 11) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'CPF inválido (11 dígitos)'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($consultaParam !== '' && in_array($consultaParam, $cpfEndpoints, true)) {
        $endpoint = $consultaParam;
        $consulta = $consultaParam;
    } else {
        $endpoint = defined('FONTE_DATA_ENDPOINT') && trim((string) FONTE_DATA_ENDPOINT) !== ''
            ? trim((string) FONTE_DATA_ENDPOINT)
            : 'dados-cadastrais-basicos';
        if (!in_array($endpoint, $cpfEndpoints, true)) {
            $endpoint = 'dados-cadastrais-basicos';
        }
        $consulta = $endpoint;
    }
    $url = fontedata_append_cpf_query(
        $base . '/' . rawurlencode($endpoint) . '?cpf=' . rawurlencode($cpf),
        $dataNascimento
    );
} else {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Informe cpf ou cnpj'], JSON_UNESCAPED_UNICODE);
    exit;
}

$cacheDir = dirname(__DIR__) . '/storage/fontedata_cache';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}

$cacheKey = '';
if (($consulta ?? '') === 'tj-certidao') {
    $cacheKey = 'tj-certidao_' . ($doc ?? '');
} elseif ($cnpj !== '') {
    $cacheKey = 'cnpj_' . ($consulta ?? 'consulta-cnpj-receita') . '_' . $cnpj;
} elseif ($cpf !== '') {
    $ep = $endpoint ?? $consulta ?? 'dados-cadastrais-basicos';
    $cacheKey = 'cpf_' . $ep . '_' . $cpf . ($dataNascimento !== '' ? '_' . preg_replace('/\D/', '', $dataNascimento) : '');
}

if ($cacheKey !== '') {
    $cacheFile = $cacheDir . '/' . $cacheKey . '.json';
    if (is_file($cacheFile)) {
        $cachedData = @file_get_contents($cacheFile);
        if ($cachedData !== false) {
            $decoded = json_decode($cachedData, true);
            if (is_array($decoded) && empty($decoded['error'])) {
                header('X-FonteData-Cache: HIT');
                $out = ['ok' => true, 'data' => $decoded, 'consulta' => $consulta ?? $endpoint ?? ''];
                if (($consulta ?? '') === 'tj-certidao') {
                    $out['cpf_cnpj'] = $doc ?? null;
                } elseif ($cnpj !== '') {
                    $out['cnpj'] = $cnpj;
                } else {
                    $out['cpf'] = $cpf;
                }
                echo json_encode($out, JSON_UNESCAPED_UNICODE);
                exit;
            }
        }
    }
}

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 60,
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
        'X-API-Key: ' . $apiKey,
    ],
]);
$body = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($body === false || $err !== '') {
    // #region agent log
    $logPath = dirname(__DIR__) . '/debug-97c411.log';
    @file_put_contents($logPath, json_encode([
        'sessionId' => '97c411',
        'location' => 'fontedata.php:curl_error',
        'message' => 'fontedata curl failed',
        'data' => [
            'consulta' => $consulta ?? $endpoint ?? '',
            'host' => parse_url($url, PHP_URL_HOST) ?: 'unknown',
            'error' => $err !== '' ? $err : 'empty body',
        ],
        'timestamp' => (int) round(microtime(true) * 1000),
        'hypothesisId' => 'certidao-host',
        'runId' => 'calc-fix-v2',
    ], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
    // #endregion
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Falha ao contactar FonteData: ' . $err], JSON_UNESCAPED_UNICODE);
    exit;
}

$decoded = json_decode((string) $body, true);
if (!is_array($decoded)) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Resposta inválida da FonteData'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (isset($decoded['error'])) {
    $msg = is_array($decoded['error'])
        ? (string) ($decoded['error']['message'] ?? $decoded['error']['code'] ?? 'Consulta não encontrada')
        : (string) $decoded['error'];
    http_response_code($code >= 400 ? $code : 404);
    echo json_encode(['ok' => false, 'error' => $msg, 'raw' => $decoded], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($code < 200 || $code >= 300) {
    http_response_code($code ?: 502);
    echo json_encode(['ok' => false, 'error' => 'FonteData HTTP ' . $code], JSON_UNESCAPED_UNICODE);
    exit;
}

if (isset($cacheFile) && is_array($decoded) && empty($decoded['error'])) {
    @file_put_contents($cacheFile, json_encode($decoded, JSON_UNESCAPED_UNICODE));
}

$out = ['ok' => true, 'data' => $decoded, 'consulta' => $consulta ?? $endpoint ?? ''];
if (($consulta ?? '') === 'tj-certidao') {
    $out['cpf_cnpj'] = $doc ?? null;
} elseif ($cnpj !== '') {
    $out['cnpj'] = $cnpj;
} else {
    $out['cpf'] = $cpf;
}
// #region agent log
$logPath = dirname(__DIR__) . '/debug-97c411.log';
@file_put_contents($logPath, json_encode([
    'sessionId' => '97c411',
    'location' => 'fontedata.php:success',
    'message' => 'fontedata ok',
    'data' => [
        'consulta' => $consulta ?? $endpoint ?? '',
        'host' => parse_url($url, PHP_URL_HOST) ?: 'unknown',
        'http' => $code,
        'has_data' => is_array($decoded) && $decoded !== [],
    ],
    'timestamp' => (int) round(microtime(true) * 1000),
    'hypothesisId' => 'analise-api,certidao-host',
    'runId' => 'calc-fix-v2',
], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
// #endregion
echo json_encode($out, JSON_UNESCAPED_UNICODE);
