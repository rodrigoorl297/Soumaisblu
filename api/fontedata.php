<?php
/**
 * Proxy FonteData — CPF/CNPJ e consultas (path-style, conforme https://fontedata.com/docs).
 * GET ?cpf=... | ?cnpj=...&consulta=... | ?consulta=ccd-pf&cpf=...
 * Ex.: GET /api/v1/consulta/ccd-pf/{cpf} — Certidão negativa civil (PF)
 * Header interno: X-FonteData-Token
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
    'ccd-pj',
];

$cpfEndpoints = [
    'dados-cadastrais-basicos',
    'cadastro-pf-basica',
    'receita-federal-pf',
    'pis-trabalho',
    'cadastro-rf-pf',
    'ccd-pf',
];

$docConsultas = [
    'tj-certidao',
    'trf-certidao',
    'ccd-pf',
    'ccd-pj',
    'mpf-certidao',
];

$consultaAliases = [
    'certidao-civil' => 'ccd-pf',
    'certidao_civil' => 'ccd-pf',
    'certidao-civil-pj' => 'ccd-pj',
];

$dataNascimento = trim((string) ($_GET['data_nascimento'] ?? $_GET['dataNascimento'] ?? ''));

if (isset($consultaAliases[$consultaParam])) {
    $consultaParam = $consultaAliases[$consultaParam];
}

/** Monta URL FonteData — query (?cpf=) ou path (/endpoint/doc) conforme o endpoint. */
function fontedata_query_param_for(string $endpoint): ?string
{
    static $map = [
        'ccd-pf' => 'cpf',
        'ccd-pj' => 'cnpj',
        'cadastro-rf-pf' => 'cpf',
        'dados-cadastrais-basicos' => 'cpf',
        'cadastro-pf-basica' => 'cpf',
        'receita-federal-pf' => 'cpf',
        'pis-trabalho' => 'cpf',
        'tj-certidao' => 'cpf_cnpj',
        'trf-certidao' => 'cpf_cnpj',
        'mpf-certidao' => 'cpf_cnpj',
    ];
    return $map[$endpoint] ?? null;
}

function fontedata_build_url(string $base, string $endpoint, string $doc, string $dataNascimento = ''): string
{
    $param = fontedata_query_param_for($endpoint);
    if ($param !== null) {
        $url = rtrim($base, '/') . '/' . rawurlencode($endpoint) . '?' . $param . '=' . rawurlencode($doc);
        if ($dataNascimento !== '') {
            $url .= '&' . http_build_query([
                'data_nascimento' => $dataNascimento,
                'dataNascimento' => $dataNascimento,
            ]);
        }
        return $url;
    }
    $url = rtrim($base, '/') . '/' . rawurlencode($endpoint) . '/' . rawurlencode($doc);
    if ($dataNascimento !== '') {
        $url .= '?' . http_build_query([
            'data_nascimento' => $dataNascimento,
            'dataNascimento' => $dataNascimento,
        ]);
    }
    return $url;
}

$doc = '';
$consulta = '';
$endpoint = '';

if ($consultaParam !== '' && in_array($consultaParam, $docConsultas, true)) {
    $doc = $cpfCnpj !== '' ? $cpfCnpj : ($cpf !== '' ? $cpf : $cnpj);
    if ($consultaParam === 'ccd-pf' && strlen($doc) !== 11) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Informe CPF (11 dígitos) para certidão civil (ccd-pf).'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($consultaParam === 'ccd-pj' && strlen($doc) !== 14) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Informe CNPJ (14 dígitos) para certidão civil (ccd-pj).'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (strlen($doc) !== 11 && strlen($doc) !== 14) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Informe CPF (11) ou CNPJ (14) para esta consulta.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $consulta = $consultaParam;
    $url = fontedata_build_url($base, $consultaParam, $doc, $dataNascimento);
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
    $endpoint = $consulta;
    $doc = $cnpj;
    $url = fontedata_build_url($base, $consulta, $cnpj);
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
    $doc = $cpf;
    $url = fontedata_build_url($base, $consulta, $cpf, $dataNascimento);
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
if ($doc !== '' && $consulta !== '') {
    $cacheKey = $consulta . '_' . $doc . ($dataNascimento !== '' ? '_' . preg_replace('/\D/', '', $dataNascimento) : '');
} elseif ($cnpj !== '') {
    $cacheKey = 'cnpj_' . ($consulta ?: 'consulta-cnpj-receita') . '_' . $cnpj;
} elseif ($cpf !== '') {
    $ep = $endpoint ?: $consulta ?: 'dados-cadastrais-basicos';
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
                $out = ['ok' => true, 'data' => $decoded, 'consulta' => $consulta ?: $endpoint];
                if ($doc !== '') {
                    $out['cpf_cnpj'] = $doc;
                    if (strlen($doc) === 11) $out['cpf'] = $doc;
                    if (strlen($doc) === 14) $out['cnpj'] = $doc;
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

$slowConsultas = ['ccd-pf', 'ccd-pj', 'tj-certidao', 'trf-certidao', 'mpf-certidao'];
$curlTimeout = in_array($consulta ?: $endpoint, $slowConsultas, true) ? 120 : 60;

$ch = curl_init($url);
// #region agent log
@file_put_contents(dirname(__DIR__) . '/debug-97c411.log', json_encode([
    'sessionId' => '97c411',
    'location' => 'fontedata.php:request',
    'message' => 'fontedata upstream url',
    'data' => [
        'consulta' => $consulta ?: $endpoint,
        'url_pattern' => fontedata_query_param_for($consulta ?: $endpoint) ? 'query' : 'path',
        'host' => parse_url($url, PHP_URL_HOST) ?: 'unknown',
    ],
    'timestamp' => (int) round(microtime(true) * 1000),
    'hypothesisId' => 'H1-ccd-query',
    'runId' => 'ccd-query-fix',
], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
// #endregion
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 30,
    CURLOPT_TIMEOUT => $curlTimeout,
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
    $isTimeout = stripos($err, 'timed out') !== false || stripos($err, 'timeout') !== false;
    $msg = $isTimeout
        ? 'A consulta demorou demais. Certidões podem levar até 2 minutos — tente novamente.'
        : 'Falha ao contactar FonteData: ' . $err;
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
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

if (!empty($decoded['mensagem']) && ($code < 200 || $code >= 300)) {
    http_response_code($code >= 400 ? $code : 502);
    echo json_encode(['ok' => false, 'error' => (string) $decoded['mensagem'], 'raw' => $decoded], JSON_UNESCAPED_UNICODE);
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

$out = ['ok' => true, 'data' => $decoded, 'consulta' => $consulta ?: $endpoint];
if ($doc !== '') {
    $out['cpf_cnpj'] = $doc;
    if (strlen($doc) === 11) $out['cpf'] = $doc;
    if (strlen($doc) === 14) $out['cnpj'] = $doc;
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
