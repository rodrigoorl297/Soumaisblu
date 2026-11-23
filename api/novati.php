<?php
/**
 * Proxy Nova TI (Nova Vida — NVCHECKJson).
 * GET ?cpf=... — consulta cadastral PF para preenchimento do cliente.
 * Header interno: X-NovaTi-Token (mesmo token do PIX / FonteData).
 */
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-NovaTi-Token, Authorization');
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
require_once __DIR__ . '/lib/HttpClient.php';

$internal = defined('NOVA_TI_INTERNAL_TOKEN') && trim((string) NOVA_TI_INTERNAL_TOKEN) !== ''
    ? (string) NOVA_TI_INTERNAL_TOKEN
    : (defined('FONTE_DATA_INTERNAL_TOKEN') && trim((string) FONTE_DATA_INTERNAL_TOKEN) !== ''
        ? (string) FONTE_DATA_INTERNAL_TOKEN
        : (defined('PIX_INTERNAL_TOKEN') ? (string) PIX_INTERNAL_TOKEN : ''));

$hdr = $_SERVER['HTTP_X_NOVATI_TOKEN'] ?? '';
if ($internal === '' || !hash_equals($internal, $hdr)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Token inválido'], JSON_UNESCAPED_UNICODE);
    exit;
}

$usuario = defined('NOVA_TI_USUARIO') ? trim((string) NOVA_TI_USUARIO) : '';
$senha = defined('NOVA_TI_SENHA') ? trim((string) NOVA_TI_SENHA) : '';
$cliente = defined('NOVA_TI_CLIENTE') ? trim((string) NOVA_TI_CLIENTE) : '';
if ($usuario === '' || $senha === '' || $cliente === '') {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'NOVA_TI_USUARIO/SENHA/CLIENTE não configurados em config.pix.local.php'], JSON_UNESCAPED_UNICODE);
    exit;
}

$cpf = preg_replace('/\D/', '', (string) ($_GET['cpf'] ?? ''));
if (strlen($cpf) !== 11) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'CPF inválido (11 dígitos)'], JSON_UNESCAPED_UNICODE);
    exit;
}

$tokenBase = defined('NOVA_TI_API_BASE') && trim((string) NOVA_TI_API_BASE) !== ''
    ? rtrim((string) NOVA_TI_API_BASE, '/')
    : 'https://wsnv.novavidati.com.br/WSLocalizador.asmx';

/**
 * novati_first_str — primeiro valor não vazio entre candidatos.
 */
function novati_first_str(...$vals): string
{
    foreach ($vals as $v) {
        $s = $v === null ? '' : trim((string) $v);
        if ($s !== '') {
            return $s;
        }
    }
    return '';
}

/**
 * novati_pick_vinculo — nome em PESSOASLIGADAS pelo grau (MAE, PAI…).
 */
function novati_pick_vinculo(array $lista, string $pattern): string
{
    foreach ($lista as $item) {
        if (!is_array($item)) {
            continue;
        }
        $vinculo = strtoupper(novati_first_str($item['VINCULO'] ?? '', $item['vinculo'] ?? ''));
        if ($vinculo !== '' && preg_match('/' . $pattern . '/i', $vinculo)) {
            return novati_first_str($item['NOME'] ?? '', $item['nome'] ?? '');
        }
    }
    return '';
}

/**
 * novati_format_address — monta endereço legível a partir de ENDERECOS[0].
 */
function novati_format_address(array $enderecos): string
{
    if (!$enderecos) {
        return '';
    }
    $e = $enderecos[0];
    if (!is_array($e)) {
        return is_string($e) ? trim($e) : '';
    }
    $logra = trim(implode(' ', array_filter([
        novati_first_str($e['TIPO'] ?? '', $e['tipo'] ?? ''),
        novati_first_str($e['TITULO'] ?? '', $e['titulo'] ?? ''),
        novati_first_str($e['LOGRADOURO'] ?? '', $e['logradouro'] ?? ''),
    ])));
    $parts = array_filter([
        $logra,
        novati_first_str($e['NUMERO'] ?? '', $e['numero'] ?? ''),
        novati_first_str($e['COMPLEMENTO'] ?? '', $e['complemento'] ?? ''),
        novati_first_str($e['BAIRRO'] ?? '', $e['bairro'] ?? ''),
        novati_first_str($e['CIDADE'] ?? '', $e['cidade'] ?? ''),
        novati_first_str($e['UF'] ?? '', $e['uf'] ?? ''),
        ($cep = preg_replace('/\D/', '', novati_first_str($e['CEP'] ?? '', $e['cep'] ?? ''))) !== ''
            ? 'CEP ' . $cep
            : '',
    ], static fn($v) => $v !== null && trim((string) $v) !== '');
    return implode(', ', $parts);
}

/**
 * novati_pick_phones — DDD+telefone das posições retornadas pela Nova Vida.
 */
function novati_pick_phones(array $telefones): array
{
    $out = [];
    foreach ($telefones as $t) {
        if (!is_array($t)) {
            continue;
        }
        $ddd = preg_replace('/\D/', '', novati_first_str($t['DDD'] ?? '', $t['ddd'] ?? ''));
        $num = preg_replace('/\D/', '', novati_first_str($t['TELEFONE'] ?? '', $t['telefone'] ?? ''));
        if ($ddd === '' && $num === '') {
            continue;
        }
        $full = $ddd . $num;
        if (strlen($full) >= 10) {
            $out[] = $full;
        }
    }
    return array_values(array_unique($out));
}

/**
 * novati_map_client — normaliza CONSULTA → campos do formulário de cliente.
 */
function novati_map_client(array $consulta, string $cpfDigits): array
{
    $cad = is_array($consulta['CADASTRAIS'] ?? null) ? $consulta['CADASTRAIS'] : [];
    $ligadas = is_array($consulta['PESSOASLIGADAS'] ?? null) ? $consulta['PESSOASLIGADAS'] : [];
    $phones = novati_pick_phones(is_array($consulta['TELEFONES'] ?? null) ? $consulta['TELEFONES'] : []);
    $emails = is_array($consulta['EMAILS'] ?? null) ? $consulta['EMAILS'] : [];
    $email = '';
    foreach ($emails as $em) {
        if (is_array($em)) {
            $email = novati_first_str($em['EMAIL'] ?? '', $em['email'] ?? '');
        } elseif (is_string($em)) {
            $email = trim($em);
        }
        if ($email !== '') {
            break;
        }
    }

    $situacao = is_array($consulta['SITUACAOCADASTRAL'] ?? null)
        ? novati_first_str($consulta['SITUACAOCADASTRAL']['DESCRICAO'] ?? '', $consulta['SITUACAOCADASTRAL']['descricao'] ?? '')
        : '';

    return [
        'cpf' => preg_replace('/\D/', '', novati_first_str($cad['CPF'] ?? '', $cpfDigits)),
        'name' => novati_first_str($cad['NOME'] ?? '', $cad['nome'] ?? ''),
        'rg' => novati_first_str($cad['RG'] ?? '', $cad['rg'] ?? ''),
        'phone1' => $phones[0] ?? '',
        'phone2' => $phones[1] ?? '',
        'email' => $email,
        'motherName' => novati_pick_vinculo($ligadas, 'MAE'),
        'fatherName' => novati_pick_vinculo($ligadas, 'PAI'),
        'address' => novati_format_address(is_array($consulta['ENDERECOS'] ?? null) ? $consulta['ENDERECOS'] : []),
        'civilState' => novati_first_str($cad['ESTADOCIVIL'] ?? '', $cad['estadoCivil'] ?? '', $cad['estadocivil'] ?? ''),
        'birthDate' => novati_first_str($cad['NASC'] ?? '', $cad['nasc'] ?? '', $cad['DATA_NASCIMENTO'] ?? ''),
        'situacao_cadastral' => $situacao,
    ];
}

/**
 * novati_load_token — token em cache (válido ~24h na Nova Vida).
 */
function novati_load_token(string $cacheFile, string $tokenUrl, string $usuario, string $senha, string $cliente): string
{
    if (is_file($cacheFile)) {
        $raw = @file_get_contents($cacheFile);
        $cached = $raw ? json_decode($raw, true) : null;
        if (is_array($cached)) {
            $tok = trim((string) ($cached['token'] ?? ''));
            $exp = (int) ($cached['expires_at'] ?? 0);
            if ($tok !== '' && $exp > time() + 60) {
                return $tok;
            }
        }
    }

    $res = HttpClient::request('POST', $tokenUrl, [
        'credencial' => [
            'usuario' => $usuario,
            'senha' => $senha,
            'cliente' => $cliente,
        ],
    ], ['Content-Type: application/json'], 30, 10);

    if ($res['code'] < 200 || $res['code'] >= 300) {
        throw new RuntimeException('Falha ao gerar token Nova TI (HTTP ' . $res['code'] . ').');
    }

    $body = $res['json'] ?? [];
    $token = trim((string) ($body['d'] ?? ''));
    if ($token === '') {
        throw new RuntimeException('Token Nova TI vazio — verifique usuário/senha/cliente.');
    }

    $cacheDir = dirname($cacheFile);
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0755, true);
    }
    @file_put_contents($cacheFile, json_encode([
        'token' => $token,
        'expires_at' => time() + 23 * 3600,
    ], JSON_UNESCAPED_UNICODE));

    return $token;
}

$cacheDir = dirname(__DIR__) . '/storage/novati_cache';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}

$respCache = $cacheDir . '/cpf_' . $cpf . '.json';
if (is_file($respCache) && (time() - (int) filemtime($respCache)) < 86400) {
    $cached = json_decode((string) file_get_contents($respCache), true);
    if (is_array($cached) && !empty($cached['ok'])) {
        echo json_encode($cached, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

try {
    $token = novati_load_token(
        $cacheDir . '/token.json',
        $tokenBase . '/GerarTokenJson',
        $usuario,
        $senha,
        $cliente
    );

    $check = HttpClient::request(
        'POST',
        $tokenBase . '/NVCHECKJson',
        ['nvcheck' => ['Documento' => $cpf]],
        ['Content-Type: application/json', 'Token: ' . $token],
        45,
        10
    );

    if ($check['code'] < 200 || $check['code'] >= 300) {
        throw new RuntimeException('Consulta Nova TI falhou (HTTP ' . $check['code'] . ').');
    }

    $payload = $check['json'] ?? [];
    $d = $payload['d'] ?? null;

    if (is_string($d)) {
        $msg = trim($d);
        if ($msg !== '') {
            throw new RuntimeException($msg);
        }
        throw new RuntimeException('Resposta vazia da Nova TI.');
    }

    if (!is_array($d)) {
        throw new RuntimeException('Formato inesperado da Nova TI.');
    }

    $consulta = is_array($d['CONSULTA'] ?? null) ? $d['CONSULTA'] : $d;
    $client = novati_map_client($consulta, $cpf);

    if ($client['name'] === '') {
        echo json_encode([
            'ok' => false,
            'error' => 'Nenhum dado encontrado para este CPF.',
            'raw' => $d,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $out = ['ok' => true, 'client' => $client, 'data' => $d];
    @file_put_contents($respCache, json_encode($out, JSON_UNESCAPED_UNICODE));
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
