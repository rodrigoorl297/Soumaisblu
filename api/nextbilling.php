<?php
declare(strict_types=1);

/**
 * Proxy NextBilling (Click2Call) — tokens nunca vão ao browser.
 *
 * GET  ?action=status
 * POST ?action=click2call  JSON { lead_id, phone_field?: "phone"|"phone2", user_id }
 * POST ?action=click2call  JSON { src, dst, user_id }  (teste manual)
 * POST ?action=save_config JSON { server?, device_id?, call_mode?, src_ramal?, user_id }
 *
 * Modo softphone (MicroSIP): abre a discagem no softphone (URI sip:) — áudio no headset.
 * Modo cellphone: Click2Call clássico (toca celular → depois destino).
 *
 * Auth: header X-API-Key = API_INTERNAL_KEY
 */
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization, apikey');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function nb_settings_path(): string
{
    return soublu_config_root() . '/config.nextbilling.settings.json';
}

function nb_read_settings(): array
{
    $path = nb_settings_path();
    if (!is_file($path)) {
        return [];
    }
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function nb_write_settings(array $data): bool
{
    $path = nb_settings_path();
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    return $json !== false && @file_put_contents($path, $json) !== false;
}

function nb_server(): string
{
    $settings = nb_read_settings();
    $fromSettings = trim((string) ($settings['server'] ?? ''));
    if ($fromSettings !== '' && !preg_match('/seudominio|exemplo|example/i', $fromSettings)) {
        return rtrim($fromSettings, '/');
    }
    $fromConfig = defined('NEXTBILLING_SERVER') ? trim((string) NEXTBILLING_SERVER) : '';
    if ($fromConfig !== '' && !preg_match('/seudominio|exemplo|example/i', $fromConfig)) {
        return rtrim($fromConfig, '/');
    }
    return '';
}

function nb_has_tokens(): bool
{
    $token = defined('NEXTBILLING_API_TOKEN') ? trim((string) NEXTBILLING_API_TOKEN) : '';
    $key = defined('NEXTBILLING_API_KEY') ? trim((string) NEXTBILLING_API_KEY) : '';
    return $token !== '' && $key !== '';
}

function nb_configured(): bool
{
    return nb_server() !== '' && nb_has_tokens();
}

function nb_device_id(): int
{
    $settings = nb_read_settings();
    if (isset($settings['device_id']) && (int) $settings['device_id'] > 0) {
        return (int) $settings['device_id'];
    }
    return defined('NEXTBILLING_DEVICE_ID') ? (int) NEXTBILLING_DEVICE_ID : 0;
}

/** softphone (MicroSIP/ramal) | cellphone (celular do perfil). */
function nb_call_mode(): string
{
    $settings = nb_read_settings();
    $fromSettings = strtolower(trim((string) ($settings['call_mode'] ?? '')));
    if (in_array($fromSettings, ['softphone', 'cellphone', 'mobile'], true)) {
        return $fromSettings === 'mobile' ? 'cellphone' : $fromSettings;
    }
    $fromConfig = defined('NEXTBILLING_CALL_MODE') ? strtolower(trim((string) NEXTBILLING_CALL_MODE)) : '';
    if (in_array($fromConfig, ['softphone', 'cellphone', 'mobile'], true)) {
        return $fromConfig === 'mobile' ? 'cellphone' : $fromConfig;
    }
    return 'softphone';
}

function nb_default_ramal(): string
{
    $settings = nb_read_settings();
    $fromSettings = nb_digits((string) ($settings['src_ramal'] ?? ''));
    if ($fromSettings !== '' && strlen($fromSettings) >= 2 && strlen($fromSettings) <= 6) {
        return $fromSettings;
    }
    $fromConfig = defined('NEXTBILLING_SRC_RAMAL') ? nb_digits((string) NEXTBILLING_SRC_RAMAL) : '';
    if ($fromConfig !== '' && strlen($fromConfig) >= 2 && strlen($fromConfig) <= 6) {
        return $fromConfig;
    }
    return '';
}

function nb_digits(string $v): string
{
    return preg_replace('/\D+/', '', $v) ?? '';
}

/** Normaliza telefone BR para Click2Call (DDD + número, 10–11 dígitos). */
function nb_normalize_phone(string $raw): string
{
    $d = nb_digits($raw);
    if ($d === '') {
        return '';
    }
    if (strlen($d) >= 12 && str_starts_with($d, '55')) {
        $d = substr($d, 2);
    }
    if (strlen($d) >= 11 && $d[0] === '0') {
        $d = substr($d, 1);
    }
    if (strlen($d) < 10 || strlen($d) > 11) {
        return '';
    }
    return $d;
}

/**
 * Origem do Click2Call:
 * - softphone: ramal SIP (2–6 dígitos), ex. 209
 * - cellphone: DDD+número
 */
function nb_normalize_src(string $raw, string $mode = ''): string
{
    $mode = $mode !== '' ? $mode : nb_call_mode();
    $d = nb_digits($raw);
    if ($d === '') {
        return '';
    }
    if ($mode === 'softphone') {
        if (strlen($d) >= 2 && strlen($d) <= 6) {
            return $d;
        }
        // Aceita também número completo se alguém colar celular por engano
        return nb_normalize_phone($raw);
    }
    return nb_normalize_phone($raw);
}

/**
 * Resolve src do vendedor.
 * Softphone: body.src → ramal no perfil (2–6 dig) → mapeamento → ramal padrão.
 */
function nb_resolve_src(?array $user, string $bodySrc = ''): string
{
    $mode = nb_call_mode();
    $explicit = nb_normalize_src($bodySrc, $mode);
    if ($explicit !== '') {
        return $explicit;
    }
    if ($mode === 'softphone') {
        $profile = nb_digits((string) ($user['phone'] ?? ''));
        if (strlen($profile) >= 2 && strlen($profile) <= 6) {
            return $profile;
        }
        $settings = nb_read_settings();
        $map = $settings['user_extensions'] ?? [];
        $uid = (string) ($user['id'] ?? '');
        if ($uid !== '' && is_array($map) && isset($map[$uid])) {
            $ext = is_array($map[$uid])
                ? nb_normalize_src((string) ($map[$uid]['ramal'] ?? ''), 'softphone')
                : nb_normalize_src((string) $map[$uid], 'softphone');
            if ($ext !== '') {
                return $ext;
            }
        }
        return nb_default_ramal();
    }
    return nb_normalize_phone((string) ($user['phone'] ?? ''));
}

function nb_fetch_user(PDO $pdo, string $userId): ?array
{
    $stmt = $pdo->prepare('SELECT `id`, `name`, `phone`, `role`, `active` FROM `users` WHERE `id` = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function nb_fetch_lead(PDO $pdo, string $leadId): ?array
{
    $cols = [];
    try {
        $stmtCols = $pdo->query('SHOW COLUMNS FROM `leads`');
        foreach ($stmtCols ? $stmtCols->fetchAll(PDO::FETCH_ASSOC) : [] as $r) {
            $f = (string) ($r['Field'] ?? '');
            if ($f !== '') {
                $cols[$f] = true;
            }
        }
    } catch (Throwable $e) {
        $cols = ['id' => true, 'name' => true, 'phone' => true, 'assigned_to' => true, 'status' => true];
    }
    $select = ['`id`'];
    foreach (['name', 'phone', 'phone2', 'assigned_to', 'status'] as $c) {
        if (isset($cols[$c])) {
            $select[] = '`' . $c . '`';
        }
    }
    $sql = 'SELECT ' . implode(', ', $select) . ' FROM `leads` WHERE `id` = ? LIMIT 1';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$leadId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && !isset($row['phone2'])) {
        $row['phone2'] = '';
    }
    return $row ?: null;
}

function nb_click2call(string $src, string $dst, int $deviceId): array
{
    $server = nb_server();
    if ($server === '') {
        return ['ok' => false, 'http' => 0, 'error' => 'NEXTBILLING_SERVER vazio', 'data' => null];
    }
    $token = rawurlencode((string) NEXTBILLING_API_TOKEN);
    $key = rawurlencode((string) NEXTBILLING_API_KEY);
    $url = $server . '/api/click2Call/' . $token . '/' . $key;

    $payload = json_encode([
        'device_id' => $deviceId,
        'src' => $src,
        'dst' => $dst,
    ], JSON_UNESCAPED_UNICODE);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_CONNECTTIMEOUT => 15,
        // Painel em IP com certificado não padronizado
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) {
        return ['ok' => false, 'http' => $status, 'error' => $err, 'data' => null];
    }
    $data = json_decode((string) $raw, true);
    if (!is_array($data)) {
        $data = ['raw' => (string) $raw];
    }
    $apiErr = isset($data['error']) ? (int) $data['error'] : (($status >= 200 && $status < 300) ? 0 : 1);
    $ok = $status >= 200 && $status < 300 && $apiErr === 0;
    return [
        'ok' => $ok,
        'http' => $status,
        'error' => $ok ? null : (string) ($data['reason'] ?? $data['message'] ?? 'Falha no Click2Call'),
        'data' => $data,
    ];
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.', 'hint' => 'Header X-API-Key'], 401);
}

$action = strtolower(trim((string) ($_GET['action'] ?? $_POST['action'] ?? 'status')));
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$body = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $body = $decoded;
        }
    }
    if (!$body) {
        $body = $_POST;
    }
}

try {
    if ($action === 'status' || $action === 'ping') {
        $deviceId = nb_device_id();
        $server = nb_server();
        $mode = nb_call_mode();
        soublu_json([
            'ok' => true,
            'configured' => nb_configured(),
            'has_tokens' => nb_has_tokens(),
            'device_id' => $deviceId,
            'has_device' => $deviceId > 0,
            'server' => $server,
            'server_host' => $server !== '' ? (parse_url($server, PHP_URL_HOST) ?: $server) : '',
            'call_mode' => $mode,
            'src_ramal' => nb_default_ramal(),
            'dial_method' => $mode === 'softphone' ? 'sip' : 'click2call',
            'setup_hint' => nb_configured()
                ? null
                : (!nb_has_tokens()
                    ? 'Faltam API Token/Key em config.nextbilling.local.php'
                    : 'Informe a URL do painel NextBilling (ex.: https://sip.seudominio.com.br) e o device_id no modal Telefonia.'),
        ]);
    }

    if ($action === 'save_config' || $action === 'save_device') {
        if ($method !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST'], 405);
        }
        $settings = nb_read_settings();
        $serverIn = trim((string) ($body['server'] ?? ''));
        if ($serverIn !== '') {
            $serverIn = preg_replace('#/$#', '', $serverIn) ?? $serverIn;
            if (!preg_match('#^https?://#i', $serverIn)) {
                $serverIn = 'https://' . $serverIn;
            }
            if (preg_match('/seudominio|exemplo|example/i', $serverIn)) {
                soublu_json(['ok' => false, 'error' => 'URL de servidor inválida'], 422);
            }
            $settings['server'] = $serverIn;
        }
        if (array_key_exists('device_id', $body)) {
            $deviceId = (int) ($body['device_id'] ?? 0);
            if ($deviceId <= 0) {
                soublu_json(['ok' => false, 'error' => 'device_id inválido'], 422);
            }
            $settings['device_id'] = $deviceId;
        }
        if (array_key_exists('customer_id', $body)) {
            $settings['customer_id'] = (int) $body['customer_id'];
        }
        if (array_key_exists('call_mode', $body)) {
            $modeIn = strtolower(trim((string) $body['call_mode']));
            if ($modeIn === 'mobile') {
                $modeIn = 'cellphone';
            }
            if (!in_array($modeIn, ['softphone', 'cellphone'], true)) {
                soublu_json(['ok' => false, 'error' => 'call_mode inválido (softphone|cellphone)'], 422);
            }
            $settings['call_mode'] = $modeIn;
        }
        if (array_key_exists('src_ramal', $body)) {
            $ramal = nb_digits((string) $body['src_ramal']);
            if ($ramal !== '' && (strlen($ramal) < 2 || strlen($ramal) > 6)) {
                soublu_json(['ok' => false, 'error' => 'src_ramal inválido (use 2–6 dígitos, ex.: 209)'], 422);
            }
            $settings['src_ramal'] = $ramal;
        }
        if (empty($settings['server']) && empty($settings['device_id']) && empty($settings['call_mode']) && !array_key_exists('src_ramal', $settings)) {
            soublu_json(['ok' => false, 'error' => 'Informe server, device_id, call_mode e/ou src_ramal'], 422);
        }
        $settings['updated_at'] = date('c');
        if (!nb_write_settings($settings)) {
            soublu_json(['ok' => false, 'error' => 'Não foi possível salvar no servidor'], 500);
        }
        soublu_json([
            'ok' => true,
            'server' => nb_server(),
            'device_id' => nb_device_id(),
            'call_mode' => nb_call_mode(),
            'src_ramal' => nb_default_ramal(),
            'configured' => nb_configured(),
        ]);
    }

    if ($action === 'click2call') {
        if ($method !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST'], 405);
        }

        $pdo = soublu_pdo();
        $userId = trim((string) ($body['user_id'] ?? ''));
        if ($userId === '') {
            soublu_json(['ok' => false, 'error' => 'user_id obrigatório'], 422);
        }
        $user = nb_fetch_user($pdo, $userId);
        if (!$user) {
            soublu_json(['ok' => false, 'error' => 'Usuário não encontrado'], 404);
        }

        $src = '';
        $dst = '';
        $leadId = trim((string) ($body['lead_id'] ?? ''));
        $mode = nb_call_mode();

        if ($leadId !== '') {
            $lead = nb_fetch_lead($pdo, $leadId);
            if (!$lead) {
                soublu_json(['ok' => false, 'error' => 'Lead não encontrado'], 404);
            }
            $assigned = trim((string) ($lead['assigned_to'] ?? ''));
            $role = strtolower((string) ($user['role'] ?? ''));
            $isManager = in_array($role, [
                'master', 'fundador', 'gerente', 'gerencia', 'supervisor',
                'desenvolvedor', 'admin', 'sup_backoffice',
            ], true);
            if (!$isManager && $assigned !== '' && $assigned !== $userId) {
                soublu_json(['ok' => false, 'error' => 'Lead não está atribuído a você'], 403);
            }
            $field = strtolower(trim((string) ($body['phone_field'] ?? 'phone')));
            if ($field !== 'phone2') {
                $field = 'phone';
            }
            $dstRaw = (string) ($lead[$field] ?? '');
            if ($dstRaw === '' && $field === 'phone2') {
                $dstRaw = (string) ($lead['phone'] ?? '');
            }
            $dst = nb_normalize_phone($dstRaw);
            if ($dst === '') {
                soublu_json(['ok' => false, 'error' => 'Lead sem telefone válido'], 422);
            }
        } else {
            $dst = nb_normalize_phone((string) ($body['dst'] ?? ''));
            if ($dst === '') {
                soublu_json(['ok' => false, 'error' => 'dst inválido — informe o número de destino com DDD'], 422);
            }
        }

        // MicroSIP: discagem direta no softphone (áudio no headset).
        if ($mode === 'softphone') {
            $host = nb_server() !== '' ? (parse_url(nb_server(), PHP_URL_HOST) ?: '') : '';
            // sip:NUMERO — MicroSIP usa a conta Online (ex.: blu-209)
            $dialUri = 'sip:' . $dst;
            $dialUriHost = ($host !== '') ? ('sip:' . $dst . '@' . $host) : $dialUri;
            soublu_json([
                'ok' => true,
                'message' => 'Abrindo discagem no MicroSIP. Confirme/atenda no softphone.',
                'method' => 'sip',
                'dial_uri' => $dialUri,
                'dial_uri_host' => $dialUriHost,
                'dst' => $dst,
                'src' => nb_default_ramal() ?: null,
                'call_mode' => $mode,
                'device_id' => nb_device_id() ?: null,
                'lead_id' => $leadId !== '' ? $leadId : null,
            ]);
        }

        // Celular: Click2Call clássico (2 pernas).
        if (!nb_configured()) {
            soublu_json([
                'ok' => false,
                'error' => 'NextBilling não configurado.',
                'hint' => 'Preencha config.nextbilling.local.php no servidor.',
            ], 503);
        }
        $deviceId = nb_device_id();
        if ($deviceId <= 0) {
            soublu_json(['ok' => false, 'error' => 'device_id não configurado.'], 422);
        }
        $src = nb_resolve_src($user, (string) ($body['src'] ?? ''));
        if ($src === '') {
            soublu_json([
                'ok' => false,
                'error' => 'Cadastre seu telefone no perfil para usar o Click2Call.',
            ], 422);
        }

        $result = nb_click2call($src, $dst, $deviceId);
        if (!$result['ok']) {
            soublu_json([
                'ok' => false,
                'error' => $result['error'] ?: 'Falha ao originar ligação',
                'http' => $result['http'],
                'nextbilling' => $result['data'],
            ], 502);
        }
        soublu_json([
            'ok' => true,
            'message' => 'Ligação iniciada. Atenda seu telefone; em seguida o destino será chamado.',
            'method' => 'click2call',
            'src' => $src,
            'dst' => $dst,
            'call_mode' => $mode,
            'device_id' => $deviceId,
            'lead_id' => $leadId !== '' ? $leadId : null,
            'nextbilling' => $result['data'],
        ]);
    }

    soublu_json(['ok' => false, 'error' => 'Ação inválida', 'action' => $action], 400);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
