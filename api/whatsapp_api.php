<?php
/**
 * SOU+BLU — WhatsApp via Evolution API ou Z-API (1 número por perfil).
 *
 * Actions: config | status | connect | disconnect | chats | sync_contacts | messages |
 *          send | open_chat | update_stage | repair_media | sync_avatars | simulate_scan | webhook | delete_message
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/EvolutionClient.php';
require_once __DIR__ . '/lib/ZApiClient.php';
require_once __DIR__ . '/lib/WhatsAppClientFactory.php';
require_once __DIR__ . '/lib/WhatsAppRepository.php';
require_once __DIR__ . '/lib/FileStorage.php';

$evoConfig = dirname(__DIR__) . '/config.evolution.local.php';
if (is_file($evoConfig)) {
    require_once $evoConfig;
}
$zapiConfig = dirname(__DIR__) . '/config.zapi.local.php';
if (is_file($zapiConfig)) {
    require_once $zapiConfig;
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey, X-Webhook-Secret');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function wa_debug_log(string $message, array $data = [], string $hypothesisId = 'A'): void
{
    if (!defined('WA_DEBUG') || WA_DEBUG !== true) {
        return;
    }
    $logFile = defined('WA_DEBUG_LOG') && (string) WA_DEBUG_LOG !== ''
        ? (string) WA_DEBUG_LOG
        : dirname(__DIR__) . '/debug-wa.log';
    $entry = json_encode([
        'hypothesisId' => $hypothesisId,
        'location' => 'whatsapp_api.php',
        'message' => $message,
        'data' => $data,
        'timestamp' => (int) (microtime(true) * 1000),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    @file_put_contents($logFile, $entry . PHP_EOL, FILE_APPEND);
}

function wa_agent_debug(string $location, string $message, array $data = [], string $hypothesisId = 'A'): void
{
    if (!defined('WA_DEBUG') || WA_DEBUG !== true) {
        return;
    }
    $logFile = defined('WA_DEBUG_LOG') && (string) WA_DEBUG_LOG !== ''
        ? (string) WA_DEBUG_LOG
        : dirname(__DIR__) . '/debug-wa.log';
    $entry = json_encode([
        'hypothesisId' => $hypothesisId,
        'location' => $location,
        'message' => $message,
        'data' => $data,
        'timestamp' => (int) (microtime(true) * 1000),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    @file_put_contents($logFile, $entry . PHP_EOL, FILE_APPEND);
}

/** Debug session NDJSON (sempre grava — investigação status conectado falso). */
function wa_session_debug(string $location, string $message, array $data = [], string $hypothesisId = 'A'): void
{
    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $dir = rtrim((string) $base, '/\\') . '/.debug-sessions';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $entry = json_encode([
        'sessionId' => '5ec660',
        'hypothesisId' => $hypothesisId,
        'location' => $location,
        'message' => $message,
        'data' => $data,
        'timestamp' => (int) (microtime(true) * 1000),
        'runId' => 'pre-fix',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    @file_put_contents($dir . '/5ec660.ndjson', $entry . PHP_EOL, FILE_APPEND);
}

/** Estado Evolution com fallback fetchInstances (Evolution v2 alterna open/connecting). */
function wa_probe_evo_connection(EvolutionClient|ZApiClient|WhaticketClient $evo, string $instanceName): array
{
    $stateResp = [];
    $status = 'close';
    $phone = '';
    try {
        $stateResp = $evo->connectionState($instanceName);
        $status = soublu_whatsapp_parse_connection_state($stateResp);
        $owner = (string) (
            $stateResp['instance']['owner']
            ?? $stateResp['instance']['wuid']
            ?? $stateResp['owner']
            ?? $stateResp['wuid']
            ?? ''
        );
        $phone = wa_phone_digits(explode('@', $owner)[0] ?: $owner);
        if ($status === 'close' || $status === 'connecting') {
            try {
                $listResp = $evo->fetchInstances();
                $listState = soublu_whatsapp_parse_instance_list_state($listResp, $instanceName);
                if ($listState === 'open') {
                    $status = 'open';
                } elseif ($listState === 'connecting' && $status === 'close') {
                    $status = 'connecting';
                }
            } catch (Throwable $e) {
                /* noop */
            }
        }
    } catch (Throwable $e) {
        return ['status' => 'close', 'phone' => '', 'stateResp' => [], 'error' => $e->getMessage()];
    }
    return ['status' => $status, 'phone' => $phone, 'stateResp' => $stateResp, 'error' => ''];
}

/**
 * Evolution/Z-API às vezes reporta close enquanto findChats/DB ainda têm sessão ativa.
 * Evita painel vazio com "Conectado" mas sem conversas.
 */
function wa_count_user_chats_fast(WhatsAppRepository $repo, string $userId): int
{
    return $repo->countChats($userId, wa_mirror_mode());
}

/** URL do proxy de foto do perfil (sem chamar Evolution — a imagem é buscada no profile_image). */
function wa_profile_pic_proxy_url(string $userId): string
{
    $apiKey = trim((string) (
        $_GET['apikey']
        ?? $_SERVER['HTTP_X_API_KEY']
        ?? $_SERVER['HTTP_APIKEY']
        ?? ''
    ));
    return wa_site_url()
        . '/api/whatsapp_api.php?action=profile_image'
        . '&user_id=' . rawurlencode($userId)
        . ($apiKey !== '' ? '&apikey=' . rawurlencode($apiKey) : '');
}

function wa_status_fast_json(
    WhatsAppRepository $repo,
    string $userId,
    array $inst,
    string $status,
    ?string $phone = null,
    ?int $chatCount = null,
    bool $includeProfilePic = false
): void {
    // Se sessão foi encerrada/resetada, nunca reportar open/live no fast-path.
    if (wa_session_locked($repo, $userId, $inst)) {
wa_json_session_locked();
    }
    $phoneFast = wa_phone_digits((string) ($phone ?? $inst['phone'] ?? ''));
    $count = $chatCount ?? ($status === 'open'
        ? wa_count_user_chats_fast($repo, $userId)
        : 0);
    $profilePic = ($includeProfilePic && $status === 'open') ? wa_profile_pic_proxy_url($userId) : null;
soublu_json([
        'ok' => true,
        'user_id' => $userId,
        'configured' => soublu_whatsapp_configured(),
        'status' => $status,
        'phone' => $phoneFast !== '' ? $phoneFast : ($inst['phone'] ?? null),
        'qr' => null,
        'session_live' => $status === 'open',
        'chats_count' => $count,
        'profile_pic' => $profilePic,
        'rebind_required' => false,
        'disconnected' => false,
        'fast_path' => true,
    ]);
}

function wa_infer_open_if_stale_close(
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    WhatsAppRepository $repo,
    string $instanceName,
    array $inst,
    string $currentStatus
): array {
    $userId = (string) ($inst['user_id'] ?? '');
    if ($currentStatus === 'open' || $userId === '' || $instanceName === '') {
        return ['status' => $currentStatus, 'phone' => wa_phone_digits((string) ($inst['phone'] ?? ''))];
    }
    if (wa_rebind_required($userId) || wa_user_disconnected($userId) || $repo->isSessionRevoked($userId)) {
        return ['status' => $currentStatus, 'phone' => wa_phone_digits((string) ($inst['phone'] ?? ''))];
    }
    $phone = wa_phone_digits((string) ($inst['phone'] ?? ''));
    try {
        $rows = wa_fetch_chat_rows_from_evolution($evo, $instanceName, 2);
        if (count($rows) > 0) {
            return ['status' => 'open', 'phone' => $phone, 'reason' => 'evo_chats'];
        }
    } catch (Throwable $e) {
        wa_debug_log('infer open probe failed', ['error' => $e->getMessage()], 'recover');
    }
    return ['status' => $currentStatus, 'phone' => $phone];
}

/** Sessão Evolution realmente ativa (findChats responde). */
function wa_evo_has_live_chats(EvolutionClient|ZApiClient|WhaticketClient $evo, string $instanceName): bool
{
    if ($instanceName === '') {
        return false;
    }
    try {
        return count(wa_fetch_chat_rows_from_evolution($evo, $instanceName, 1)) > 0;
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * Conectado de verdade: Evolution open + (telefone do owner OU chats acessíveis).
 * Não exige chats — logo após o QR o findChats pode vir vazio e ainda assim a sessão é válida.
 */
function wa_session_is_live(EvolutionClient|ZApiClient|WhaticketClient $evo, string $instanceName): bool
{
    if ($instanceName === '') {
        return false;
    }
    $probe = wa_probe_evo_connection($evo, $instanceName);
    if (($probe['status'] ?? '') !== 'open') {
        return false;
    }
    $phone = wa_phone_digits((string) ($probe['phone'] ?? ''));
    if (wa_is_plausible_wa_phone($phone)) {
        return true;
    }
    return wa_evo_has_live_chats($evo, $instanceName);
}

function wa_new_id(): string
{
    return bin2hex(random_bytes(16));
}

function wa_json_body(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function wa_site_url(): string
{
    if (defined('SITE_URL') && trim((string) SITE_URL) !== '') {
        return rtrim((string) SITE_URL, '/');
    }
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . $host;
}

function wa_webhook_url(): string
{
    if (soublu_whatsapp_provider() === 'whaticket') {
        return wa_whaticket_webhook_url();
    }
    $secret = defined('EVOLUTION_WEBHOOK_SECRET') ? (string) EVOLUTION_WEBHOOK_SECRET : '';
    $q = 'action=webhook';
    if ($secret !== '') {
        $q .= '&secret=' . rawurlencode($secret);
    }
    return wa_site_url() . '/api/whatsapp_api.php?' . $q;
}

function wa_whaticket_webhook_url(): string
{
    $secret = defined('WHATICKET_WEBHOOK_SECRET') ? (string) WHATICKET_WEBHOOK_SECRET : '';
    $q = 'action=webhook_wt';
    if ($secret !== '') {
        $q .= '&secret=' . rawurlencode($secret);
    }
    return wa_site_url() . '/api/whatsapp_api.php?' . $q;
}

function wa_instance_name(string $userId): string
{
    $safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $userId) ?? '';
    $safe = substr($safe, 0, 40);
    return 'soublu_u_' . ($safe !== '' ? $safe : wa_new_id());
}

/** Novo nome quando a instância Evolution antiga fica impossível de deletar. */
function wa_fresh_instance_name(string $userId): string
{
    $base = wa_instance_name($userId);
    $suffix = substr(bin2hex(random_bytes(3)), 0, 6);
    // Evolution costuma limitar o tamanho do nome.
    return substr($base, 0, 40) . '_r' . $suffix;
}

/**
 * Abandona instância Evolution travada e cria outra com nome novo.
 * @return array{instance: array, name: string, qr: ?string, created: bool}
 */
function wa_rebind_fresh_evolution_instance(
    WhatsAppRepository $repo,
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    string $userId,
    ?array $inst = null
): array {
    $inst = $inst ?? $repo->getInstance($userId);
    if (!$inst) {
        $inst = $repo->ensureInstance($userId, wa_instance_name($userId));
    }
    $oldName = (string) ($inst['instance_name'] ?? '');
    if ($oldName !== '') {
        try {
            wa_destroy_evolution_instance($evo, $oldName);
        } catch (Throwable $e) {
            /* noop — rebind mesmo se destroy falhar */
        }
        wa_qr_meta_write($oldName, null, 'close');
    }
    $newName = wa_fresh_instance_name($userId);
    $repo->renameInstance((string) $inst['id'], $newName);
    $inst = $repo->getInstance($userId) ?? $inst;
    $inst['instance_name'] = $newName;
    $qr = null;
    $created = false;
    $webhook = wa_webhook_url();
    try {
        $conn = $evo->createInstance($newName, $webhook);
        $created = true;
        $qr = soublu_whatsapp_extract_qr($conn);
    } catch (Throwable $eCreate) {
throw $eCreate;
    }
    try {
        $evo->setWebhook($newName, $webhook);
    } catch (Throwable $eHook) {
        /* noop */
    }
    if ($qr === null || $qr === '') {
        $qr = wa_fetch_qr($evo, $newName, 0, true);
    }
return ['instance' => $inst, 'name' => $newName, 'qr' => $qr, 'created' => $created];
}

function wa_phone_digits(string $input): string
{
    return preg_replace('/\D+/', '', $input) ?? '';
}

/** Telefone BR/WhatsApp válido para exibição e envio (10–13 dígitos). */
function wa_is_plausible_wa_phone(string $digits): bool
{
    $d = wa_phone_digits($digits);
    $len = strlen($d);
    return $len >= 10 && $len <= 13;
}

function wa_remote_jid(string $phoneDigits): string
{
    $d = wa_phone_digits($phoneDigits);
    if (!wa_is_plausible_wa_phone($d)) {
        return '';
    }
    return $d . '@s.whatsapp.net';
}

function wa_jid_phone(string $jid): string
{
    return wa_phone_digits(explode('@', $jid)[0] ?? $jid);
}

/** Assinatura estável da foto de perfil (path da URL, sem query) para casar contatos. */
function wa_avatar_signature(string $url): string
{
    $url = trim($url);
    if ($url === '') {
        return '';
    }
    $path = parse_url($url, PHP_URL_PATH);
    if (!is_string($path) || $path === '') {
        return '';
    }
    $base = basename($path);
    return $base !== '' ? strtolower($base) : '';
}

/** Número ou JID completo para envio via Evolution (suporta @lid quando não há telefone). */
function wa_resolve_send_target(array $chat): string
{
    $phone = wa_phone_digits((string) ($chat['contact_phone'] ?? ''));
    if (wa_is_plausible_wa_phone($phone)) {
        return $phone;
    }
    $jid = trim((string) ($chat['remote_jid'] ?? ''));
    if ($jid !== '' && str_contains($jid, '@')) {
        return $jid;
    }
    $fromJid = wa_jid_phone($jid);
    return $fromJid !== '' ? $fromJid : '';
}

function wa_contacts_sync_enabled(): bool
{
    return !defined('WA_CONTACTS_SYNC') || WA_CONTACTS_SYNC !== false;
}

/** Espelho do WhatsApp: só conversas (findChats), sem importar agenda do celular. */
function wa_mirror_mode(): bool
{
    return !defined('WA_MIRROR_MODE') || WA_MIRROR_MODE !== false;
}

function wa_contacts_max(): int
{
    if (wa_mirror_mode()) {
        return defined('WA_CONTACTS_MAX') ? max(1, (int) WA_CONTACTS_MAX) : 60;
    }
    return defined('WA_CONTACTS_MAX') ? max(1, (int) WA_CONTACTS_MAX) : 500;
}

function wa_contacts_cooldown_sec(): int
{
    if (wa_mirror_mode()) {
        return defined('WA_CONTACTS_COOLDOWN_SEC') ? max(120, (int) WA_CONTACTS_COOLDOWN_SEC) : 240;
    }
    return defined('WA_CONTACTS_COOLDOWN_SEC') ? max(0, (int) WA_CONTACTS_COOLDOWN_SEC) : 3600;
}

/** Cooldown do espelho leve (poll silencioso) — evita findChats a cada poucos segundos. */
function wa_mirror_poll_cooldown_sec(): int
{
    return defined('WA_MIRROR_POLL_COOLDOWN_SEC') ? max(60, (int) WA_MIRROR_POLL_COOLDOWN_SEC) : 180;
}

function wa_target_user_id(string $userId, array $body = []): string
{
    $monitor = trim((string) ($_GET['monitor_user_id'] ?? $body['monitor_user_id'] ?? ''));
    return $monitor !== '' ? $monitor : $userId;
}

/** Impede ler/enviar dados de outro perfil (monitoria desativada por padrão). */
function wa_assert_same_user(string $requestUserId, string $targetUserId): void
{
    if ($targetUserId !== $requestUserId) {
        wa_debug_log('cross-user blocked', [
            'req_tail' => substr($requestUserId, -8),
            'target_tail' => substr($targetUserId, -8),
        ], 'isolate');
        soublu_json(['ok' => false, 'error' => 'Não é permitido acessar o WhatsApp de outro usuário.'], 403);
    }
}

function wa_assert_user_id(string $userId): void
{
    if (trim($userId) === '') {
        soublu_json(['ok' => false, 'error' => 'user_id obrigatório.'], 400);
    }
}

/** Garante linha em whatsapp_instances e instância no provider (Evolution ou Z-API). */
function wa_ensure_evolution_ready(WhatsAppRepository $repo, EvolutionClient|ZApiClient|WhaticketClient $evo, string $userId): array
{
    $provider = soublu_whatsapp_provider();
    if ($provider === 'whaticket') {
        $wtId = defined('WHATICKET_WHATSAPP_ID') ? trim((string) WHATICKET_WHATSAPP_ID) : '1';
        $inst = $repo->ensureInstance($userId, $wtId !== '' ? $wtId : wa_instance_name($userId));
        $name = (string) $inst['instance_name'];
        return ['instance' => $inst, 'name' => $name, 'created' => false];
    }
    if ($provider === 'zapi') {
        $zapiId = defined('Z_API_INSTANCE_ID') ? trim((string) Z_API_INSTANCE_ID) : '';
        $inst = $repo->ensureInstance($userId, $zapiId !== '' ? $zapiId : wa_instance_name($userId));
        $name = (string) $inst['instance_name'];
        try {
            $evo->setWebhook($name, wa_webhook_url());
        } catch (Throwable $e) {
            wa_debug_log('zapi setWebhook', ['error' => $e->getMessage()], 'zapi');
        }
        return ['instance' => $inst, 'name' => $name, 'created' => false];
    }
    $inst = $repo->ensureInstance($userId, wa_instance_name($userId));
    $name = (string) $inst['instance_name'];
    $webhook = wa_webhook_url();
    $created = false;
    $present = false;
    try {
        $evo->connectionState($name);
        $present = true;
    } catch (Throwable $e) {
        $present = false;
        wa_debug_log('connectionState missing instance', ['name' => $name, 'error' => $e->getMessage()], 'C');
    }
    if (!$present) {
        try {
            $evo->createInstance($name, $webhook);
            $created = true;
        } catch (Throwable $e2) {
            $msg = $e2->getMessage();
            if (stripos($msg, 'already') !== false || stripos($msg, 'exist') !== false) {
                /* fall through to setWebhook below */
            } else {
                wa_debug_log('createInstance failed', ['name' => $name, 'error' => $msg], 'C');
                throw $e2;
            }
        }
    }
    // Sempre reafirmar webhook (instância existente pode ter URL/secret antigo após redeploy).
    try {
        $evo->setWebhook($name, $webhook);
    } catch (Throwable $eHook) {
        wa_debug_log('setWebhook failed', ['name' => $name, 'error' => $eHook->getMessage()], 'C');
    }
    return ['instance' => $inst, 'name' => $name, 'created' => $created];
}

function wa_fetch_qr(EvolutionClient|ZApiClient|WhaticketClient $evo, string $instanceName, int $attempt = 0, bool $force = false): ?string
{
    $probe = wa_probe_evo_connection($evo, $instanceName);
    $hasLive = false;
    if (($probe['status'] ?? '') === 'open') {
        $hasLive = wa_evo_has_live_chats($evo, $instanceName);
if ($hasLive && !$force) {
            /** #region agent log */
            wa_agent_debug('whatsapp_api.php:wa_fetch_qr', 'skip connect — already open', [
                'instance' => $instanceName,
            ], 'B');
            /** #endregion */
            return null;
        }
        wa_debug_log('QR open session, logout before connect', ['name' => $instanceName, 'force' => $force, 'has_live' => $hasLive], 'L');
        try {
            $evo->logout($instanceName);
        } catch (Throwable $e) {
            /* instância pode já estar limpa */
        }
        usleep(250000);
        if ($force && $hasLive) {
            try {
                $evo->deleteInstance($instanceName);
            } catch (Throwable $eDel) {
                /* recreate below on 404 */
            }
            usleep(250000);
            try {
                $evo->createInstance($instanceName, wa_webhook_url());
            } catch (Throwable $eCreate) {
                /* may already exist */
            }
            usleep(200000);
        }
    } else {
        /** #region agent log */
        wa_agent_debug('whatsapp_api.php:wa_fetch_qr', 'probe before connect', [
            'instance' => $instanceName,
            'status' => $probe['status'],
            'phone_tail' => $probe['phone'] !== '' ? substr($probe['phone'], -4) : '',
            'attempt' => $attempt,
            'error' => $probe['error'] ?? '',
        ], 'B');
        /** #endregion */
}

    $qr = null;
    $conn = [];
    $lastConnKeys = [];
    for ($try = 0; $try < 3; $try++) {
        try {
            $conn = $evo->connect($instanceName);
        } catch (Throwable $eConn) {
            if ($try < 2 && (str_contains($eConn->getMessage(), '404') || str_contains($eConn->getMessage(), 'Not Found'))) {
                wa_debug_log('connect 404, recreating instance', ['name' => $instanceName], 'L');
                try {
                    $conn = $evo->createInstance($instanceName, wa_webhook_url());
                } catch (Throwable $eCreate) {
                    if ($try < 1) {
                        usleep(200000);
                        continue;
                    }
                    throw $eConn;
                }
            } else {
                throw $eConn;
            }
        }
        $lastConnKeys = array_keys($conn);
        $qr = soublu_whatsapp_extract_qr($conn);
        if ($qr !== null) {
            break;
        }
        if ($try < 2) {
            usleep(300000);
        }
    }
    if ($qr === null && $attempt < 1) {
        wa_debug_log('QR empty, logout retry', ['name' => $instanceName], 'L');
        try {
            $evo->logout($instanceName);
        } catch (Throwable $e) {
            /* instância pode já estar limpa */
        }
        usleep(250000);
        return wa_fetch_qr($evo, $instanceName, 1, $force);
    }
wa_debug_log('QR extraction', [
        'qr_present' => $qr !== null,
        'conn_keys' => array_keys($conn),
        'attempt' => $attempt,
    ], 'D');
    if ($qr === null && soublu_whatsapp_provider() === 'whaticket' && $evo instanceof WhaticketClient) {
        for ($i = 0; $i < 8; $i++) {
            usleep(400000);
            try {
                $conn = $evo->connect($instanceName);
                $qr = soublu_whatsapp_extract_qr($conn);
                if ($qr !== null) {
                    break;
                }
            } catch (Throwable $e) {
                /* bridge pode demorar */
            }
        }
    }
    if ($qr !== null) {
        wa_qr_meta_write($instanceName, $qr, 'connecting');
    }
    return $qr;
}

function wa_qr_meta_path(string $instanceName): string
{
    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $dir = rtrim($base, '/\\') . '/.wa_qr';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $instanceName) ?: 'unknown';
    return $dir . '/' . $safe . '.json';
}

/** @return array{ts:int,qr:?string,connecting_since:int,recovery_count:int,last_recovery_at:int} */
function wa_qr_meta_read(string $instanceName): array
{
    $path = wa_qr_meta_path($instanceName);
    if (!is_file($path)) {
        return ['ts' => 0, 'qr' => null, 'connecting_since' => 0, 'recovery_count' => 0, 'last_recovery_at' => 0];
    }
    $data = json_decode((string) file_get_contents($path), true);
    if (!is_array($data)) {
        return ['ts' => 0, 'qr' => null, 'connecting_since' => 0, 'recovery_count' => 0, 'last_recovery_at' => 0];
    }
    return [
        'ts' => (int) ($data['ts'] ?? 0),
        'qr' => isset($data['qr']) && is_string($data['qr']) ? $data['qr'] : null,
        'connecting_since' => (int) ($data['connecting_since'] ?? 0),
        'recovery_count' => (int) ($data['recovery_count'] ?? 0),
        'last_recovery_at' => (int) ($data['last_recovery_at'] ?? 0),
    ];
}

/** @param array{reset_connecting_since?:bool,recovery_count?:int,clear_qr?:bool,last_recovery_at?:int} $opts */
function wa_qr_meta_write(string $instanceName, ?string $qr, string $status, array $opts = []): void
{
    $meta = wa_qr_meta_read($instanceName);
    $now = time();
    if (!empty($opts['reset_connecting_since'])) {
        $meta['connecting_since'] = $now;
    } elseif ($status === 'connecting' && ($meta['connecting_since'] ?? 0) <= 0) {
        $meta['connecting_since'] = $now;
    }
    if (isset($opts['recovery_count'])) {
        $meta['recovery_count'] = max(0, (int) $opts['recovery_count']);
    }
    if (isset($opts['last_recovery_at'])) {
        $meta['last_recovery_at'] = (int) $opts['last_recovery_at'];
    }
    if ($status === 'open' || $status === 'close') {
        $meta['connecting_since'] = 0;
        $meta['qr'] = null;
        $meta['ts'] = 0;
        $meta['recovery_count'] = 0;
        $meta['last_recovery_at'] = 0;
        @file_put_contents(wa_qr_meta_path($instanceName), json_encode($meta));
        return;
    }
    if (!empty($opts['clear_qr'])) {
        $meta['qr'] = null;
        $meta['ts'] = 0;
    }
    if ($qr) {
        $meta['qr'] = $qr;
        $meta['ts'] = $now;
    }
    @file_put_contents(wa_qr_meta_path($instanceName), json_encode($meta));
}

function wa_recover_stuck_instance(
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    string $instanceName,
    array $qrMeta,
    int $stuckSec
): array {
    $qrAge = ($qrMeta['ts'] ?? 0) > 0 ? time() - (int) $qrMeta['ts'] : 9999;
    $hasFreshQr = !empty($qrMeta['qr']) && $qrAge < 55;
    if ($hasFreshQr) {
        wa_debug_log('stuck skip — fresh QR', [
            'stuck_sec' => $stuckSec,
            'qr_age' => $qrAge,
            'name' => $instanceName,
        ], 'L');
        return $qrMeta;
    }
    $recoveryCount = (int) ($qrMeta['recovery_count'] ?? 0);
    $lastRecovery = (int) ($qrMeta['last_recovery_at'] ?? 0);
    if ($lastRecovery > 0 && time() - $lastRecovery < 45) {
        return $qrMeta;
    }
    if ($stuckSec < 90) {
        return $qrMeta;
    }
    if ($recoveryCount >= 3) {
        wa_debug_log('stuck connecting, delete+recreate instance', [
            'stuck_sec' => $stuckSec,
            'name' => $instanceName,
            'recovery_count' => $recoveryCount,
        ], 'L');
        try {
            $evo->deleteInstance($instanceName);
        } catch (Throwable $e) {
            /* pode não existir */
        }
        try {
            $evo->createInstance($instanceName, wa_webhook_url());
        } catch (Throwable $e) {
            try {
                $evo->setWebhook($instanceName, wa_webhook_url());
            } catch (Throwable $e2) {
                /* noop */
            }
        }
        $qrMeta['recovery_count'] = 0;
    } else {
        wa_debug_log('stuck connecting, logout before QR', [
            'stuck_sec' => $stuckSec,
            'name' => $instanceName,
            'qr_age' => $qrAge,
            'recovery_count' => $recoveryCount + 1,
        ], 'L');
        try {
            $evo->logout($instanceName);
        } catch (Throwable $e) {
            /* noop */
        }
        $qrMeta['recovery_count'] = $recoveryCount + 1;
    }
    $qrMeta['connecting_since'] = time();
    $qrMeta['last_recovery_at'] = time();
    $qrMeta['qr'] = null;
    $qrMeta['ts'] = 0;
    wa_qr_meta_write($instanceName, null, 'connecting', [
        'reset_connecting_since' => true,
        'recovery_count' => (int) $qrMeta['recovery_count'],
        'clear_qr' => true,
        'last_recovery_at' => (int) $qrMeta['last_recovery_at'],
    ]);
    return wa_qr_meta_read($instanceName);
}

function wa_should_fetch_qr_server(string $instanceName, bool $skipQr, bool $refreshQr, string $status): bool
{
    if ($status !== 'connecting' && $status !== 'close') {
        return false;
    }
    if ($refreshQr) {
        return true;
    }
    // skip_qr=1: nunca regerar QR no servidor (evita interromper leitura do celular).
    if ($skipQr) {
        return false;
    }
    $meta = wa_qr_meta_read($instanceName);
    if (($meta['qr'] ?? null) === null) {
        return true;
    }
    return time() - (int) ($meta['ts'] ?? 0) > 55;
}

function wa_sync_marker_path(string $userId): string
{
    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $dir = rtrim($base, '/\\') . '/.wa_sync';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $userId) ?: 'unknown';
    return $dir . '/' . $safe . '.ts';
}

function wa_sync_recently(string $userId): bool
{
    $path = wa_sync_marker_path($userId);
    if (!is_file($path)) {
        return false;
    }
    $ts = (int) trim((string) file_get_contents($path));
    return $ts > 0 && (time() - $ts) < wa_contacts_cooldown_sec();
}

function wa_mark_sync(string $userId): void
{
    @file_put_contents(wa_sync_marker_path($userId), (string) time());
}

function wa_mirror_poll_marker_path(string $userId): string
{
    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $dir = rtrim($base, '/\\') . '/.wa_sync';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $userId) ?: 'unknown';
    return $dir . '/' . $safe . '.mirror.ts';
}

function wa_mirror_poll_recently(string $userId): bool
{
    $path = wa_mirror_poll_marker_path($userId);
    if (!is_file($path)) {
        return false;
    }
    $ts = (int) trim((string) file_get_contents($path));
    return $ts > 0 && (time() - $ts) < wa_mirror_poll_cooldown_sec();
}

function wa_mark_mirror_poll(string $userId): void
{
    @file_put_contents(wa_mirror_poll_marker_path($userId), (string) time());
}

function wa_clear_user_sync_markers(string $userId): void
{
    @unlink(wa_sync_marker_path($userId));
    @unlink(wa_mirror_poll_marker_path($userId));
    @unlink(wa_lid_resolve_marker_path($userId));
    @unlink(wa_events_marker_path($userId));
}

function wa_events_marker_path(string $userId): string
{
    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $dir = rtrim($base, '/\\') . '/.wa_sync';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $userId) ?: 'unknown';
    return $dir . '/' . $safe . '.events.ts';
}

function wa_bump_events(string $userId): void
{
    if ($userId === '') {
        return;
    }
    @file_put_contents(wa_events_marker_path($userId), (string) (int) (microtime(true) * 1000));
}

function wa_events_ts(string $userId): int
{
    $path = wa_events_marker_path($userId);
    if (!is_file($path)) {
        return 0;
    }
    return (int) trim((string) file_get_contents($path));
}

function wa_lid_resolve_marker_path(string $userId): string
{
    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $dir = rtrim($base, '/\\') . '/.wa_sync';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $userId) ?: 'unknown';
    return $dir . '/' . $safe . '.lidresolve.ts';
}

function wa_lid_resolve_recently(string $userId): bool
{
    $path = wa_lid_resolve_marker_path($userId);
    if (!is_file($path)) {
        return false;
    }
    $ts = (int) trim((string) file_get_contents($path));
    return $ts > 0 && (time() - $ts) < 120;
}

function wa_mark_lid_resolve(string $userId): void
{
    @file_put_contents(wa_lid_resolve_marker_path($userId), (string) time());
}

function wa_disconnect_marker_path(string $userId): string
{
    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $dir = rtrim($base, '/\\') . '/.wa_sync';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $userId) ?: 'unknown';
    return $dir . '/' . $safe . '.disconnected';
}

function wa_mark_user_disconnected(string $userId): void
{
    @file_put_contents(wa_disconnect_marker_path($userId), (string) time());
}

function wa_user_disconnected(string $userId): bool
{
    return is_file(wa_disconnect_marker_path($userId));
}

function wa_clear_user_disconnected(string $userId): void
{
    @unlink(wa_disconnect_marker_path($userId));
}

/** Sessão encerrada pelo usuário — não reabrir via Evolution até novo connect. */
function wa_session_locked(WhatsAppRepository $repo, string $userId, ?array $inst = null): bool
{
    if ($repo->isSessionRevoked($userId)) {
        return true;
    }
    if (wa_rebind_required($userId) || wa_user_disconnected($userId)) {
        return true;
    }
    return $inst !== null && (string) ($inst['status'] ?? '') === 'revoked';
}

function wa_lock_user_session(WhatsAppRepository $repo, string $userId): void
{
    wa_mark_user_disconnected($userId);
    wa_mark_rebind_required($userId);
    $repo->markSessionRevoked($userId);
}

function wa_unlock_user_session(WhatsAppRepository $repo, string $userId): void
{
    wa_clear_user_disconnected($userId);
    wa_clear_rebind_required($userId);
    $repo->clearSessionRevoked($userId);
}

function wa_json_session_locked(): void
{
    global $userId;
    soublu_json([
        'ok' => true,
        'user_id' => is_string($userId ?? null) ? $userId : '',
        'configured' => soublu_whatsapp_configured(),
        'status' => 'close',
        'phone' => null,
        'qr' => null,
        'rebind_required' => true,
        'disconnected' => true,
        'session_locked' => true,
    ]);
}

/** Instância pronta para enviar/espelhar (DB open ou Evolution open, sem sessão revogada). */
function wa_instance_ready_for_action(
    WhatsAppRepository $repo,
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    ?array $inst,
    string $userId
): ?array {
    if (wa_user_disconnected($userId)) {
        return null;
    }
    if (!$inst) {
        return null;
    }
    if ($repo->isSessionRevoked($userId) && soublu_whatsapp_configured()) {
        wa_recover_live_session($evo, $repo, $userId);
        $inst = $repo->getInstance($userId) ?? $inst;
        if ($repo->isSessionRevoked($userId)) {
            return null;
        }
    }
    if (($inst['status'] ?? '') === 'open') {
        return $inst;
    }
    if (!soublu_whatsapp_configured()) {
        return null;
    }
    $name = (string) ($inst['instance_name'] ?? '');
    if ($name === '') {
        return null;
    }
    try {
        $state = soublu_whatsapp_parse_connection_state($evo->connectionState($name));
        if ($state === 'open') {
            $repo->updateInstanceStatus((string) $inst['id'], 'open');
            $repo->clearSessionRevoked($userId);
            wa_unlock_user_session($repo, $userId);
            return $repo->getInstance($userId) ?? $inst;
        }
        $infer = wa_infer_open_if_stale_close($evo, $repo, $name, $inst, $state);
        if (($infer['status'] ?? '') === 'open') {
            $repo->updateInstanceStatus((string) $inst['id'], 'open', ($infer['phone'] ?? '') !== '' ? (string) $infer['phone'] : null);
            $repo->clearSessionRevoked($userId);
            wa_unlock_user_session($repo, $userId);
            return $repo->getInstance($userId) ?? $inst;
        }
    } catch (Throwable $e) {
        wa_debug_log('instance ready probe failed', ['error' => $e->getMessage()], 'isolate');
    }
    return null;
}

function wa_chats_max_age_days(): int
{
    return defined('WA_CHATS_MAX_AGE_DAYS') ? max(7, (int) WA_CHATS_MAX_AGE_DAYS) : 60;
}

function wa_chat_cutoff_ts(): int
{
    return time() - wa_chats_max_age_days() * 86400;
}

function wa_row_ts_recent_enough(array $row): bool
{
    $ts = wa_row_conversation_timestamp($row);
    if ($ts <= 0) {
        if (wa_row_last_preview($row) !== '') {
            return true;
        }
        // findChats pode omitir timestamp/preview logo após conectar
        $jid = wa_contact_jid_from_row($row);
        return $jid !== '' && wa_is_valid_contact_jid($jid);
    }
    return $ts >= wa_chat_cutoff_ts();
}

function wa_chat_db_ts_recent_enough(array $chat): bool
{
    $at = trim((string) ($chat['last_message_at'] ?? ''));
    if ($at === '') {
        return true;
    }
    $t = strtotime($at . ' UTC');
    if (!$t) {
        return true;
    }
    return $t >= wa_chat_cutoff_ts();
}

function wa_rebind_marker_path(string $userId): string
{
    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $dir = rtrim($base, '/\\') . '/.wa_sync';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $userId) ?: 'unknown';
    return $dir . '/' . $safe . '.rebind';
}

function wa_mark_rebind_required(string $userId): void
{
    @file_put_contents(wa_rebind_marker_path($userId), (string) time());
}

function wa_rebind_required(string $userId): bool
{
    return is_file(wa_rebind_marker_path($userId));
}

function wa_clear_rebind_required(string $userId): void
{
    @unlink(wa_rebind_marker_path($userId));
}

/** Evolution ainda conectada mas CRM marcou revogada/rebind (F5, webhook perdido). */
function wa_recover_live_session(EvolutionClient|ZApiClient|WhaticketClient $evo, WhatsAppRepository $repo, string $userId): bool
{
    if ($userId === '' || wa_user_disconnected($userId) || !soublu_whatsapp_configured()) {
        return false;
    }
    $instance = $repo->getInstance($userId);
    if (!$instance) {
        return false;
    }
    $stale = wa_rebind_required($userId)
        || $repo->isSessionRevoked($userId)
        || (string) ($instance['status'] ?? '') !== 'open';
    if (!$stale) {
        return false;
    }
    $name = (string) ($instance['instance_name'] ?? '');
    if ($name === '') {
        return false;
    }
    try {
        $stateResp = $evo->connectionState($name);
        $status = soublu_whatsapp_parse_connection_state($stateResp);
        if ($status === 'close') {
            try {
                $listResp = $evo->fetchInstances();
                $listState = soublu_whatsapp_parse_instance_list_state($listResp, $name);
                if ($listState === 'open') {
                    $status = 'open';
                }
            } catch (Throwable $e) {
                /* noop */
            }
        }
        if ($status !== 'open') {
            return false;
        }
        $phone = wa_phone_digits((string) ($instance['phone'] ?? ''));
        if (is_array($stateResp)) {
            $wuid = wa_phone_digits((string) ($stateResp['instance']['wuid'] ?? $stateResp['wuid'] ?? ''));
            if ($wuid !== '') {
                $phone = $wuid;
            }
        }
        wa_clear_rebind_required($userId);
        $repo->clearSessionRevoked($userId);
        $repo->updateInstanceStatus((string) $instance['id'], 'open', $phone !== '' ? $phone : null);
        wa_qr_meta_write($name, null, 'open');
        wa_debug_log('session recovered evo open', [
            'user_tail' => substr($userId, -8),
            'instance_name' => $name,
            'phone_tail' => $phone !== '' ? substr($phone, -4) : '',
        ], 'recover');
        return true;
    } catch (Throwable $e) {
        wa_debug_log('session recover probe failed', ['error' => $e->getMessage()], 'recover');
        return false;
    }
}

function wa_recover_throttle_path(string $userId): string
{
    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $dir = rtrim($base, '/\\') . '/.wa_sync';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $userId) ?: 'unknown';
    return $dir . '/' . $safe . '.recover.ts';
}

function wa_maybe_recover_session(WhatsAppRepository $repo, EvolutionClient|ZApiClient|WhaticketClient $evo, string $userId): void
{
    if ($userId === '' || !soublu_whatsapp_configured()) {
        return;
    }
    // Throttle: recover falava Evolution em quase todo poll e esgotava workers PHP.
    $path = wa_recover_throttle_path($userId);
    if (is_file($path)) {
        $ts = (int) trim((string) @file_get_contents($path));
        if ($ts > 0 && (time() - $ts) < 90) {
            return;
        }
    }
    @file_put_contents($path, (string) time());
    wa_recover_live_session($evo, $repo, $userId);
}

function wa_try_clear_rebind_if_evo_open(EvolutionClient|ZApiClient|WhaticketClient $evo, WhatsAppRepository $repo, array $instance): bool
{
    return wa_recover_live_session($evo, $repo, (string) ($instance['user_id'] ?? ''));
}

function wa_destroy_evolution_instance(EvolutionClient|ZApiClient|WhaticketClient $evo, string $instanceName): bool
{
    $logoutOk = true;
    $deleteOk = true;
    $logoutErr = '';
    $deleteErr = '';
    try {
        $evo->logout($instanceName);
    } catch (Throwable $e) {
        $logoutOk = false;
        $logoutErr = $e->getMessage();
        wa_debug_log('destroy logout failed', ['name' => $instanceName, 'err' => $logoutErr], 'isolate');
    }
    usleep(150000);
    try {
        $evo->deleteInstance($instanceName);
    } catch (Throwable $e) {
        $deleteOk = false;
        $deleteErr = $e->getMessage();
        wa_debug_log('destroy deleteInstance failed', ['name' => $instanceName, 'err' => $deleteErr], 'isolate');
    }
    // Logout pode falhar se já estiver fechada — delete é o que importa.
    $ok = $deleteOk;
wa_debug_log('destroy evolution instance', ['name' => $instanceName, 'ok' => $ok, 'logout_ok' => $logoutOk], 'isolate');
    return $ok;
}

function wa_evolution_rows(array $resp): array
{
    foreach (['data', 'contacts', 'chats', 'response'] as $k) {
        if (isset($resp[$k]) && is_array($resp[$k]) && array_is_list($resp[$k])) {
            return $resp[$k];
        }
    }
    if (array_is_list($resp)) {
        return $resp;
    }
    return [];
}

function wa_is_valid_contact_jid(string $jid): bool
{
    $jid = strtolower(trim($jid));
    if ($jid === '') {
        return false;
    }
    if (str_contains($jid, '@g.us')
        || str_contains($jid, '@broadcast')
        || str_contains($jid, '@newsletter')
        || str_starts_with($jid, 'status@')) {
        return false;
    }
    if (str_ends_with($jid, '@lid')) {
        return strlen(strtok($jid, '@') ?: '') >= 4;
    }
    return str_ends_with($jid, '@s.whatsapp.net') || str_ends_with($jid, '@c.us');
}

function wa_phone_from_remote_jid(string $remoteJid): string
{
    $jid = strtolower(trim($remoteJid));
    if ($jid === '' || str_ends_with($jid, '@lid') || str_contains($jid, '@g.us')) {
        return '';
    }
    $phone = wa_jid_phone($jid);
    return wa_is_plausible_wa_phone($phone) ? $phone : '';
}

function wa_row_profile_pic_url(array $row): string
{
    foreach (['profilePictureUrl', 'profilePicUrl', 'imgUrl', 'profilePicture', 'pictureUrl', 'picture', 'url', 'link'] as $k) {
        if (!empty($row[$k]) && is_string($row[$k])) {
            $v = trim($row[$k]);
            if ($v !== '' && preg_match('#^https?://#i', $v)) {
                return $v;
            }
        }
    }
    if (isset($row['contact']) && is_array($row['contact'])) {
        foreach (['profilePictureUrl', 'profilePicUrl', 'imgUrl', 'pictureUrl', 'url'] as $k) {
            if (!empty($row['contact'][$k]) && is_string($row['contact'][$k])) {
                $v = trim($row['contact'][$k]);
                if ($v !== '' && preg_match('#^https?://#i', $v)) {
                    return $v;
                }
            }
        }
    }
    return '';
}

/** Extrai texto de campos Evolution (string, about/status aninhado ou array). */
function wa_parse_profile_text(mixed $value): string
{
    if (is_string($value)) {
        return trim($value);
    }
    if (!is_array($value)) {
        return '';
    }
    foreach (['status', 'about', 'text', 'name', 'value', 'content'] as $k) {
        if (!array_key_exists($k, $value)) {
            continue;
        }
        $parsed = wa_parse_profile_text($value[$k]);
        if ($parsed !== '') {
            return $parsed;
        }
    }
    return '';
}

/** Desembrulha payload Evolution (response/data/instance). */
function wa_unwrap_evolution_payload(array $resp): array
{
    foreach (['response', 'data', 'result', 'profile'] as $k) {
        if (isset($resp[$k]) && is_array($resp[$k]) && $resp[$k] !== []) {
            $inner = $resp[$k];
            if (isset($inner[0]) && is_array($inner[0])) {
                return $inner[0];
            }
            return $inner;
        }
    }
    return $resp;
}

/** Nome do próprio perfil via findContacts (pushName do número conectado). */
function wa_own_name_from_contacts(EvolutionClient|ZApiClient|WhaticketClient $evo, string $instanceName, string $myNumber, string $myJid): string
{
    if ($instanceName === '' || ($myNumber === '' && $myJid === '')) {
        return '';
    }
    try {
        $resp = $evo->findContacts($instanceName);
    } catch (Throwable $e) {
        wa_debug_log('own findContacts failed', ['error' => $e->getMessage()], 'profile');
        return '';
    }
    $want = array_filter([
        strtolower($myJid),
        strtolower($myNumber . '@s.whatsapp.net'),
        strtolower($myNumber . '@c.us'),
        $myNumber,
    ]);
    foreach (wa_evolution_rows($resp) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $keys = array_map('strtolower', wa_row_lookup_keys($row));
        if ($want !== [] && array_intersect($want, $keys) === []) {
            continue;
        }
        $name = wa_parse_profile_text($row['pushName'] ?? $row['name'] ?? $row['notifyName'] ?? '');
        if ($name !== '' && wa_is_plausible_display_name($name)) {
            return $name;
        }
    }
    return '';
}

/** Perfil do próprio WhatsApp conectado (nome, recado, foto). */
function wa_fetch_own_whatsapp_profile(EvolutionClient|ZApiClient|WhaticketClient $evo, array $inst, bool $quick = false): array
{
    $instanceName = (string) ($inst['instance_name'] ?? '');
    $myNumber = wa_phone_digits((string) ($inst['phone'] ?? ''));
    $name = '';
    $statusText = '';
    $pictureUrl = '';
    if ($quick && $instanceName !== '') {
        try {
            $state = $evo->connectionState($instanceName);
            if ($myNumber === '') {
                $owner = (string) (
                    $state['instance']['owner']
                    ?? $state['instance']['wuid']
                    ?? $state['owner']
                    ?? $state['wuid']
                    ?? ''
                );
                $myNumber = wa_phone_digits(explode('@', $owner)[0] ?: $owner);
            }
            $connName = wa_parse_profile_text(
                $state['instance']['profileName']
                ?? $state['instance']['pushName']
                ?? $state['profileName']
                ?? $state['pushName']
                ?? ''
            );
            if ($connName !== '') {
                $name = $connName;
            }
        } catch (Throwable $e) {
            /* noop */
        }
        if ($myNumber !== '') {
            $myJid = wa_remote_jid($myNumber);
            if ($myJid !== '') {
                try {
                    $picResp = $evo->fetchProfilePictureUrl($instanceName, $myJid);
                    $pictureUrl = wa_row_profile_pic_url($picResp);
                } catch (Throwable $e) {
                    wa_debug_log('own quick fetchProfilePictureUrl failed', ['error' => $e->getMessage()], 'profile');
                }
            }
        }
        return [
            'name' => $name,
            'status' => $statusText,
            'pictureUrl' => $pictureUrl,
            'phone' => $myNumber,
        ];
    }
    if ($myNumber === '' && $instanceName !== '') {
        try {
            $state = $evo->connectionState($instanceName);
            $owner = (string) (
                $state['instance']['owner']
                ?? $state['instance']['wuid']
                ?? $state['owner']
                ?? $state['wuid']
                ?? ''
            );
            $myNumber = wa_phone_digits(explode('@', $owner)[0] ?: $owner);
            $connName = wa_parse_profile_text(
                $state['instance']['profileName']
                ?? $state['instance']['pushName']
                ?? $state['profileName']
                ?? $state['pushName']
                ?? ''
            );
            if ($connName !== '') {
                $name = $connName;
            }
        } catch (Throwable $e) {
            /* noop */
        }
    }
    if ($statusText === '' && $instanceName !== '') {
        try {
            $state = $evo->connectionState($instanceName);
            $owner = strtolower(trim((string) (
                $state['instance']['owner']
                ?? $state['instance']['wuid']
                ?? $state['owner']
                ?? $state['wuid']
                ?? ''
            )));
            if ($owner !== '' && str_contains($owner, '@')) {
                $ownProf = $evo instanceof EvolutionClient
                    ? $evo->fetchProfile($instanceName, $owner, 12)
                    : $evo->fetchProfile($instanceName, $owner);
                $ownProf = wa_unwrap_evolution_payload($ownProf);
                $ownerStatus = wa_parse_profile_text($ownProf['status'] ?? $ownProf['about'] ?? '');
                if ($ownerStatus !== '') {
                    $statusText = $ownerStatus;
                }
                if ($name === '') {
                    $ownerName = wa_parse_profile_text($ownProf['name'] ?? $ownProf['pushName'] ?? '');
                    if ($ownerName !== '') {
                        $name = $ownerName;
                    }
                }
            }
        } catch (Throwable $eOwn) {
            wa_debug_log('own fetchProfile owner jid failed', ['error' => $eOwn->getMessage()], 'profile');
        }
    }
    if ($instanceName !== '' && $myNumber !== '') {
        $myJid = wa_remote_jid($myNumber);
        if ($myJid !== '') {
            // Foto: endpoint dedicado primeiro (mais estável que fetchProfile).
            try {
                $picResp = $evo->fetchProfilePictureUrl($instanceName, $myJid);
                $pictureUrl = wa_row_profile_pic_url($picResp);
            } catch (Throwable $e) {
                wa_debug_log('own fetchProfilePictureUrl failed', ['error' => $e->getMessage()], 'profile');
            }
            try {
                $profileRaw = $evo instanceof EvolutionClient
                    ? $evo->fetchProfile($instanceName, $myJid, 15)
                    : $evo->fetchProfile($instanceName, $myJid);
                $profile = wa_unwrap_evolution_payload($profileRaw);

                $n = $profile['name']
                    ?? $profile['pushname']
                    ?? $profile['pushName']
                    ?? $profile['profileName']
                    ?? ($profile['profile']['name'] ?? null);
                $parsedName = wa_parse_profile_text($n);
                if ($parsedName !== '') {
                    $name = $parsedName;
                }

                $s = $profile['status']
                    ?? $profile['about']
                    ?? $profile['recado']
                    ?? ($profile['profile']['status'] ?? null);
                $parsedStatus = wa_parse_profile_text($s);
                if ($parsedStatus !== '') {
                    $statusText = $parsedStatus;
                }

                if ($pictureUrl === '') {
                    $pictureUrl = wa_row_profile_pic_url($profile);
                }
            } catch (Throwable $e) {
                wa_debug_log('own fetchProfile failed', ['error' => $e->getMessage()], 'profile');
            }
            if ($statusText === '' && $evo instanceof EvolutionClient) {
                foreach ([$myNumber, $myJid] as $probe) {
                    if ($probe === '') {
                        continue;
                    }
                    try {
                        $altRaw = $evo->fetchProfile($instanceName, (string) $probe, 12);
                        $alt = wa_unwrap_evolution_payload($altRaw);
                        $altStatus = wa_parse_profile_text($alt['status'] ?? $alt['about'] ?? '');
                        if ($altStatus !== '') {
                            $statusText = $altStatus;
                            break;
                        }
                    } catch (Throwable $eAlt) {
                        /* noop */
                    }
                }
            }
            if ($name === '') {
                $name = wa_own_name_from_contacts($evo, $instanceName, $myNumber, $myJid);
            }
        }
    }
    return [
        'name' => $name,
        'status' => $statusText,
        'pictureUrl' => $pictureUrl,
        'phone' => $myNumber,
    ];
}

function wa_is_plausible_display_name(string $name): bool
{
    $name = trim($name);
    if ($name === '') {
        return false;
    }
    if (preg_match('/^\+?\d[\d\s()-]{8,}$/', $name)) {
        return false;
    }
    $digits = preg_replace('/\D+/', '', $name) ?? '';
    if ($digits !== '' && strlen($digits) >= 10 && strlen($digits) === strlen(preg_replace('/\D+/', '', $name) ?? '')) {
        return false;
    }
    $lower = mb_strtolower($name);
    foreach (['você', 'voce', 'you', 'contato', 'contact', 'unknown', 'desconhecido'] as $generic) {
        if ($lower === $generic) {
            return false;
        }
    }
    return mb_strlen($name) >= 3;
}

function wa_should_update_contact_name(string $existing, string $new): bool
{
    if ($new === '' || !wa_is_plausible_display_name($new)) {
        return false;
    }
    $existing = trim($existing);
    if ($existing === '') {
        return true;
    }
    if (preg_match('/^\+?\d[\d\s()-]{8,}$/', $existing)) {
        return true;
    }
    if (!wa_is_plausible_display_name($existing)) {
        return true;
    }
    if (mb_strlen($new) > mb_strlen($existing) + 2) {
        return true;
    }
    return false;
}

/**
 * Grava o nome do contato via sync SOMENTE se o usuário não tiver definido
 * um apelido manual (name_locked). Protege a edição manual de ser sobrescrita.
 */
function wa_sync_contact_name(WhatsAppRepository $repo, array $chat, string $newName, array $ownerLabels = []): bool
{
    if (!empty($chat['name_locked'])) {
        return false; // usuário renomeou manualmente — não mexer
    }
    if ($ownerLabels !== [] && wa_name_is_owner_label($newName, $ownerLabels)) {
        return false;
    }
    $old = trim((string) ($chat['contact_name'] ?? ''));
    if (!wa_should_update_contact_name($old, $newName)) {
        return false;
    }
    $repo->updateChatMeta((string) $chat['id'], ['contact_name' => $newName]);
    return true;
}

function wa_row_conversation_timestamp(array $row): int
{
    foreach (['conversationTimestamp', 't', 'lastMsgTimestamp', 'updatedAt'] as $k) {
        if (isset($row[$k]) && is_numeric($row[$k])) {
            $v = (int) $row[$k];
            return $v > 9999999999 ? (int) floor($v / 1000) : $v;
        }
    }
    $last = $row['lastMessage'] ?? $row['lastMsg'] ?? null;
    if (is_array($last) && isset($last['messageTimestamp']) && is_numeric($last['messageTimestamp'])) {
        $v = (int) $last['messageTimestamp'];
        return $v > 9999999999 ? (int) floor($v / 1000) : $v;
    }
    if (is_array($last) && isset($last['key']['messageTimestamp']) && is_numeric($last['key']['messageTimestamp'])) {
        $v = (int) $last['key']['messageTimestamp'];
        return $v > 9999999999 ? (int) floor($v / 1000) : $v;
    }
    return 0;
}

function wa_row_has_conversation(array $row): bool
{
    if (wa_row_last_preview($row) !== '') {
        return true;
    }
    if (wa_row_conversation_timestamp($row) > 0) {
        return true;
    }
    if (!empty($row['unreadCount']) || !empty($row['unread'])) {
        return true;
    }
  // findChats listou — tratar como conversa ativa (como WhatsApp Web)
    if (!empty($row['remoteJid']) || !empty($row['id'])) {
        return true;
    }
    return false;
}

/** Busca conversas paginadas da Evolution, ordenadas por recência (hoje primeiro). */
function wa_fetch_chat_rows_from_evolution(EvolutionClient|ZApiClient|WhaticketClient $evo, string $instanceName, int $max): array
{
    $pageSize = min(50, max(20, $max));
    $maxPages = wa_mirror_mode() ? 6 : 8;
    $all = [];
    $seen = [];
    for ($page = 0; $page < $maxPages && count($all) < $max; $page++) {
        $offset = $page * $pageSize;
        try {
            $resp = $evo->findChats($instanceName, $pageSize, $offset);
        } catch (Throwable $e) {
            if ($page === 0) {
                throw $e;
            }
            break;
        }
        $rows = wa_evolution_rows($resp);
        if ($rows === []) {
            break;
        }
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $rawJid = strtolower(trim((string) ($row['remoteJid'] ?? $row['jid'] ?? '')));
            if ($rawJid !== '' && (str_contains($rawJid, '@g.us') || str_contains($rawJid, '@newsletter'))) {
                continue;
            }
            $jid = wa_contact_jid_from_row($row);
            $key = $jid !== '' ? $jid : (string) ($row['id'] ?? '');
            if ($key === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $all[] = $row;
        }
        if (count($rows) < $pageSize) {
            break;
        }
    }
    usort($all, static function (array $a, array $b): int {
        return wa_row_conversation_timestamp($b) <=> wa_row_conversation_timestamp($a);
    });
    if (wa_mirror_mode()) {
        $all = array_values(array_filter($all, static function (array $row): bool {
            return wa_row_ts_recent_enough($row);
        }));
    }
    return array_slice($all, 0, $max);
}

function wa_row_last_preview(array $row): string
{
    $last = $row['lastMessage'] ?? $row['lastMsg'] ?? $row['message'] ?? null;
    if (is_string($last)) {
        return mb_substr(trim($last), 0, 240);
    }
    if (!is_array($last)) {
        return '';
    }
    $msg = $last['message'] ?? $last;
    if (is_string($msg)) {
        return mb_substr(trim($msg), 0, 240);
    }
    if (is_array($msg)) {
        $text = wa_extract_message_text($msg);
        return $text !== '' ? mb_substr($text, 0, 240) : '';
    }
    return '';
}

function wa_media_ext_from_mime(string $mime): string
{
    $mime = strtolower(trim(strtok($mime, ';')));
    return match ($mime) {
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        'audio/ogg', 'audio/opus' => 'ogg',
        'audio/mpeg', 'audio/mp3' => 'mp3',
        'audio/mp4', 'audio/m4a', 'audio/aac', 'audio/x-m4a' => 'm4a',
        'audio/webm' => 'webm',
        'video/mp4' => 'mp4',
        default => 'bin',
    };
}

function wa_media_ext_from_binary(string $binary): string
{
    if (strlen($binary) >= 4 && substr($binary, 0, 4) === 'OggS') {
        return 'ogg';
    }
    if (strlen($binary) >= 3 && substr($binary, 0, 3) === 'ID3') {
        return 'mp3';
    }
    if (strlen($binary) >= 8 && substr($binary, 4, 4) === 'ftyp') {
        return 'm4a';
    }
    if (strlen($binary) >= 3 && substr($binary, 0, 3) === "\xFF\xFB\x90") {
        return 'mp3';
    }
    if (strlen($binary) >= 8 && substr($binary, 0, 8) === "\x89PNG\r\n\x1a\n") {
        return 'png';
    }
    if (strlen($binary) >= 3 && substr($binary, 0, 3) === 'GIF') {
        return 'gif';
    }
    if (strlen($binary) >= 12 && substr($binary, 0, 4) === 'RIFF' && substr($binary, 8, 4) === 'WEBP') {
        return 'webp';
    }
    if (strlen($binary) >= 3 && substr($binary, 0, 3) === "\xFF\xD8\xFF") {
        return 'jpg';
    }
    return 'bin';
}

function wa_save_media_bytes(string $userId, string $binary, ?string $mime = null): ?string
{
    if ($binary === '') {
        return null;
    }
    $ext = $mime ? wa_media_ext_from_mime($mime) : wa_media_ext_from_binary($binary);
    if ($ext === 'bin') {
        $ext = wa_media_ext_from_binary($binary);
    }
    $mime = $mime ?: soublu_file_mime('file.' . $ext);
    $safeUser = preg_replace('/[^a-zA-Z0-9_-]/', '', $userId) ?: 'user';
    $object = $safeUser . '/' . bin2hex(random_bytes(8)) . '.' . $ext;

    $pushed = soublu_file_upload_bytes_to_supabase('whatsapp-media', $object, $binary, $mime);
    if ($pushed && !empty($pushed['caminho'])) {
        $parts = explode('/', (string) $pushed['caminho'], 2);
        return $parts[1] ?? $object;
    }

    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $dir = rtrim($base, '/\\') . '/whatsapp-media/' . $safeUser;
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        return null;
    }
    $file = $dir . '/' . basename($object);
    if (file_put_contents($file, $binary) === false) {
        return null;
    }
    return 'whatsapp-media/' . $safeUser . '/' . basename($object);
}

function wa_public_media_url(string $relativePath): string
{
    $path = ltrim(str_replace('\\', '/', $relativePath), '/');
    if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
        return $path;
    }
    if (str_starts_with($path, 'uploads/')) {
        return wa_site_url() . '/' . $path;
    }
    return wa_site_url() . '/api/file.php?path=' . rawurlencode($path);
}

function wa_resolve_local_media(string $mediaPath): ?string
{
    $rel = ltrim(str_replace('\\', '/', $mediaPath), '/');
    $rel = preg_replace('#^uploads/#', '', $rel) ?? $rel;
    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
    $file = rtrim($base, '/\\') . '/' . $rel;
    if (is_file($file) && is_readable($file)) {
        return (string) file_get_contents($file);
    }
    return null;
}

function wa_normalize_send_audio_mimetype(string $mimetype, string $fileName = ''): string
{
    $mime = strtolower(trim(explode(';', $mimetype, 2)[0]));
    if ($mime === '' && $fileName !== '') {
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'ogg' => 'audio/ogg',
            'webm' => 'audio/webm',
            'mp3' => 'audio/mpeg',
            'm4a', 'aac' => 'audio/mp4',
            'wav' => 'audio/wav',
            default => '',
        };
    }
    if (str_contains($mime, 'webm')) {
        return 'audio/webm';
    }
    if (str_contains($mime, 'ogg') || str_contains($mime, 'opus')) {
        return 'audio/ogg';
    }
    if (str_contains($mime, 'mpeg') || $mime === 'audio/mp3') {
        return 'audio/mpeg';
    }
    if (str_contains($mime, 'mp4') || str_contains($mime, 'm4a') || str_contains($mime, 'aac')) {
        return 'audio/mp4';
    }
    if (str_contains($mime, 'wav')) {
        return 'audio/wav';
    }
    return $mime !== '' ? $mime : 'audio/ogg';
}

function wa_parse_from_me(mixed $val): bool
{
    if (is_bool($val)) {
        return $val;
    }
    if (is_int($val)) {
        return $val !== 0;
    }
    if (is_string($val)) {
        $s = strtolower(trim($val));
        if (in_array($s, ['true', '1', 'yes'], true)) {
            return true;
        }
        if (in_array($s, ['false', '0', 'no', ''], true)) {
            return false;
        }
    }
    return (bool) $val;
}

function wa_item_from_me(array $item): bool
{
    $key = is_array($item['key'] ?? null) ? $item['key'] : [];
    if (array_key_exists('fromMe', $key)) {
        return wa_parse_from_me($key['fromMe']);
    }
    if (array_key_exists('fromMe', $item)) {
        return wa_parse_from_me($item['fromMe']);
    }
    return false;
}

/** Desembrulha message.message (Baileys/Evolution) para o objeto protobuf interno. */
function wa_unwrap_message(array $msgObj): array
{
    if (!isset($msgObj['message']) || !is_array($msgObj['message'])) {
        return $msgObj;
    }
    $inner = $msgObj['message'];
    $hasInnerPayload = isset($inner['conversation'])
        || isset($inner['extendedTextMessage'])
        || isset($inner['imageMessage'])
        || isset($inner['audioMessage'])
        || isset($inner['videoMessage'])
        || isset($inner['stickerMessage'])
        || isset($inner['documentMessage']);
    if ($hasInnerPayload) {
        return $inner;
    }
    return $msgObj;
}

function wa_looks_like_wa_jid(string $value): bool
{
    $value = strtolower(trim($value));
    if ($value === '' || !str_contains($value, '@')) {
        return false;
    }
    if (str_contains($value, '@g.us')
        || str_contains($value, '@broadcast')
        || str_contains($value, '@newsletter')
        || str_contains($value, '@lid')
        || str_starts_with($value, 'status@')) {
        return false;
    }
    return str_ends_with($value, '@s.whatsapp.net') || str_ends_with($value, '@c.us');
}

function wa_contact_phone_from_row(array $row): string
{
    foreach (['pnJid', 'remoteJidAlt', 'senderPn', 'remoteJid', 'jid'] as $k) {
        $jid = strtolower(trim((string) ($row[$k] ?? '')));
        if ($jid === '' || !str_contains($jid, '@') || str_contains($jid, '@lid')) {
            continue;
        }
        if (str_ends_with($jid, '@s.whatsapp.net') || str_ends_with($jid, '@c.us')) {
            $p = wa_jid_phone($jid);
            if (wa_is_plausible_wa_phone($p)) {
                return $p;
            }
        }
    }
    $last = $row['lastMessage'] ?? $row['lastMsg'] ?? null;
    if (is_array($last)) {
        $key = $last['key'] ?? [];
        if (is_array($key)) {
            foreach (['senderPn', 'participant'] as $k) {
                $jid = strtolower(trim((string) ($key[$k] ?? '')));
                if ($jid !== '' && str_ends_with($jid, '@s.whatsapp.net')) {
                    $p = wa_jid_phone($jid);
                    if (wa_is_plausible_wa_phone($p)) {
                        return $p;
                    }
                }
            }
        }
    }
    $id = $row['id'] ?? null;
    if (is_string($id)) {
        $idStr = strtolower(trim($id));
        if (wa_looks_like_wa_jid($idStr)) {
            $p = wa_jid_phone($idStr);
            if (wa_is_plausible_wa_phone($p)) {
                return $p;
            }
        }
    }
    if (is_array($id)) {
        $user = wa_phone_digits((string) ($id['user'] ?? $id['_serialized'] ?? ''));
        if (wa_is_plausible_wa_phone($user)) {
            return $user;
        }
    }
    $p = wa_phone_digits((string) ($row['phoneNumber'] ?? $row['number'] ?? $row['wid'] ?? ''));
    return wa_is_plausible_wa_phone($p) ? $p : '';
}

function wa_contact_jid_from_row(array $row): string
{
    $phone = wa_phone_digits((string) ($row['phone'] ?? $row['phoneNumber'] ?? ''));
    if (wa_is_plausible_wa_phone($phone)) {
        return wa_remote_jid($phone);
    }
    $phone = wa_contact_phone_from_row($row);
    if ($phone !== '') {
        return wa_remote_jid($phone);
    }
    foreach (['pnJid', 'remoteJidAlt', 'remoteJid', 'jid'] as $k) {
        $jid = strtolower(trim((string) ($row[$k] ?? '')));
        if ($jid !== '' && wa_looks_like_wa_jid($jid)) {
            return $jid;
        }
    }
    $id = strtolower(trim((string) ($row['id'] ?? '')));
    if ($id !== '' && wa_looks_like_wa_jid($id)) {
        return $id;
    }
    if ($id !== '' && wa_is_plausible_wa_phone($id)) {
        return wa_remote_jid($id);
    }
    $lid = strtolower(trim((string) ($row['remoteJid'] ?? '')));
    if ($lid !== '' && str_ends_with($lid, '@lid')) {
        return $lid;
    }
    return '';
}

/** Chaves de lookup para cruzar @s.whatsapp.net e @c.us pelo mesmo número. */
function wa_jid_lookup_keys(string $jid): array
{
    $jid = strtolower(trim($jid));
    if ($jid === '') {
        return [];
    }
    $keys = [$jid];
    $phone = wa_jid_phone($jid);
    if ($phone !== '' && wa_is_plausible_wa_phone($phone)) {
        $keys[] = $phone;
        $canonical = wa_remote_jid($phone);
        if ($canonical !== '') {
            $keys[] = $canonical;
        }
        $keys[] = $phone . '@c.us';
    }
    return array_values(array_unique(array_filter($keys)));
}

function wa_row_lookup_keys(array $row): array
{
    $jid = wa_contact_jid_from_row($row);
    $keys = $jid !== '' ? wa_jid_lookup_keys($jid) : [];
    $phone = wa_contact_phone_from_row($row);
    if ($phone !== '') {
        $keys[] = $phone;
        $keys[] = wa_remote_jid($phone);
    }
    $lid = strtolower(trim((string) ($row['remoteJid'] ?? '')));
    if ($lid !== '' && str_contains($lid, '@lid')) {
        $keys[] = $lid;
    }
    return array_values(array_unique(array_filter($keys)));
}

/** Nome salvo na agenda (prioridade sobre pushName de perfil). */
function wa_saved_contact_name_from_row(array $row): string
{
    $candidates = [
        $row['name'] ?? null,
        $row['contactName'] ?? null,
        $row['formattedName'] ?? null,
        $row['shortName'] ?? null,
        $row['notify'] ?? null,
        $row['notifyName'] ?? null,
    ];
    if (isset($row['contact']) && is_array($row['contact'])) {
        $candidates[] = $row['contact']['name'] ?? null;
        $candidates[] = $row['contact']['formattedName'] ?? null;
        $candidates[] = $row['contact']['shortName'] ?? null;
        $candidates[] = $row['contact']['notify'] ?? null;
    }
    foreach ($candidates as $c) {
        $name = trim((string) $c);
        if (wa_is_plausible_display_name($name)) {
            return $name;
        }
    }
    return '';
}

function wa_chat_name_from_row(array $row): string
{
    $saved = wa_saved_contact_name_from_row($row);
    if ($saved !== '') {
        return $saved;
    }
    $candidates = [
        $row['name'] ?? null,
        $row['formattedName'] ?? null,
        $row['pushName'] ?? null,
        $row['notifyName'] ?? null,
        $row['verifiedName'] ?? null,
        $row['verifiedBizName'] ?? null,
    ];
    if (isset($row['contact']) && is_array($row['contact'])) {
        $candidates[] = $row['contact']['pushName'] ?? null;
        $candidates[] = $row['contact']['verifiedName'] ?? null;
    }
    if (isset($row['profile']) && is_array($row['profile'])) {
        $candidates[] = $row['profile']['name'] ?? null;
    }
    foreach ($candidates as $c) {
        $name = trim((string) $c);
        if (wa_is_plausible_display_name($name)) {
            return $name;
        }
    }
    return '';
}

/** Labels do número conectado (nome + telefone) para filtrar pushName espúrio em mensagens recebidas. */
function wa_request_owner_labels(array $instance, EvolutionClient|ZApiClient|WhaticketClient|null $evo = null): array
{
    static $cache = [];
    $cacheKey = (string) ($instance['id'] ?? $instance['instance_name'] ?? '');
    if ($cacheKey !== '' && isset($cache[$cacheKey])) {
        return $cache[$cacheKey];
    }
    $labels = [];
    $phone = wa_phone_digits((string) ($instance['phone'] ?? ''));
    if ($phone !== '') {
        $labels[] = $phone;
        if (strlen($phone) >= 11) {
            $labels[] = substr($phone, -11);
        }
    }
    if ($evo !== null && soublu_whatsapp_configured()) {
        try {
            $prof = wa_fetch_own_whatsapp_profile($evo, $instance, true);
            $ownName = trim((string) ($prof['name'] ?? ''));
            if (wa_is_plausible_display_name($ownName)) {
                $labels[] = mb_strtolower($ownName);
            }
        } catch (Throwable $e) {
            /* noop */
        }
    }
    $labels = array_values(array_unique(array_filter($labels)));
    if ($cacheKey !== '') {
        $cache[$cacheKey] = $labels;
    }
    return $labels;
}

function wa_name_is_owner_label(string $name, array $ownerLabels): bool
{
    $name = mb_strtolower(trim($name));
    if ($name === '' || $ownerLabels === []) {
        return false;
    }
    foreach ($ownerLabels as $label) {
        $label = mb_strtolower(trim((string) $label));
        if ($label === '') {
            continue;
        }
        if ($name === $label) {
            return true;
        }
        if (preg_match('/^\d{10,}$/', $label) && preg_match('/^\d{10,}$/', preg_replace('/\D+/', '', $name) ?? '')) {
            $nd = preg_replace('/\D+/', '', $name) ?? '';
            if ($nd !== '' && (str_ends_with($nd, $label) || str_ends_with($label, $nd))) {
                return true;
            }
        }
    }
    return false;
}

/** JID do interlocutor 1:1 (mensagem recebida: senderPn/participant antes de @lid). */
function wa_item_peer_jid(array $item): string
{
    $key = is_array($item['key'] ?? null) ? $item['key'] : [];
    $fromMe = wa_item_from_me($item);
    $remoteJid = strtolower(trim((string) ($key['remoteJid'] ?? $item['remoteJid'] ?? '')));
    if (!$fromMe && is_array($key)) {
        foreach (['senderPn', 'participant'] as $k) {
            $jid = strtolower(trim((string) ($key[$k] ?? '')));
            if ($jid !== '' && wa_looks_like_wa_jid($jid)) {
                return $jid;
            }
        }
    }
    if ($remoteJid !== '' && !str_contains($remoteJid, '@g.us')) {
        return $remoteJid;
    }
    return '';
}

/** Nome para lista de conversas (findChats): pushName alinha com foto de perfil WhatsApp. */
function wa_chat_list_name_from_row(array $row, array $ownerLabels = []): string
{
    $candidates = [
        $row['name'] ?? null,
        $row['formattedName'] ?? null,
        $row['pushName'] ?? null,
        $row['notifyName'] ?? null,
        $row['verifiedName'] ?? null,
        $row['verifiedBizName'] ?? null,
    ];
    if (isset($row['contact']) && is_array($row['contact'])) {
        $candidates[] = $row['contact']['pushName'] ?? null;
        $candidates[] = $row['contact']['verifiedName'] ?? null;
    }
    if (isset($row['profile']) && is_array($row['profile'])) {
        $candidates[] = $row['profile']['name'] ?? null;
    }
    $last = $row['lastMessage'] ?? $row['lastMsg'] ?? null;
  // pushName em lastMessage recebida costuma ser o nome da conta conectada, não do contato.
    if (is_array($last) && wa_item_from_me($last)) {
        $candidates[] = $last['pushName'] ?? null;
        $candidates[] = $last['notifyName'] ?? null;
    }
    foreach ($candidates as $c) {
        $name = trim((string) $c);
        if (!wa_is_plausible_display_name($name)) {
            continue;
        }
        if ($ownerLabels !== [] && wa_name_is_owner_label($name, $ownerLabels)) {
            continue;
        }
        return $name;
    }
    return '';
}

function wa_item_push_name(array $item): string
{
    $saved = wa_saved_contact_name_from_row($item);
    if ($saved !== '') {
        return $saved;
    }
    $candidates = [
        $item['pushName'] ?? null,
        $item['notify'] ?? null,
        $item['notifyName'] ?? null,
        $item['verifiedBizName'] ?? null,
    ];
    foreach ($candidates as $c) {
        $name = trim((string) $c);
        if (wa_is_plausible_display_name($name)) {
            return $name;
        }
    }
    return '';
}

/** pushName em mensagens — não usar name/contactName (podem ser de vCard ou outro contato). */
function wa_item_message_push_name(array $item, bool $fromMe = false, array $ownerLabels = []): string
{
    if ($fromMe) {
        return '';
    }
    $candidates = [
        $item['pushName'] ?? null,
        $item['notifyName'] ?? null,
    ];
    foreach ($candidates as $c) {
        $name = trim((string) $c);
        if (!wa_is_plausible_display_name($name)) {
            continue;
        }
        if ($ownerLabels !== [] && wa_name_is_owner_label($name, $ownerLabels)) {
            continue;
        }
        return $name;
    }
    return '';
}

/** Índice jid → melhor nome (agenda findContacts) para enriquecer espelho. */
function wa_build_contact_name_index(EvolutionClient|ZApiClient|WhaticketClient $evo, string $instanceName, array $ownerLabels = []): array
{
    $index = [];
    try {
        $resp = $evo->findContacts($instanceName);
        $rows = wa_evolution_rows($resp);
    } catch (Throwable $e) {
return [];
    }
    $withSaved = 0;
    $withPush = 0;
    $skippedNoKey = 0;
    $skippedNoLabel = 0;
    $indexCollisions = 0;
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $keys = wa_row_lookup_keys($row);
        if ($keys === []) {
            $skippedNoKey++;
            continue;
        }
        if ($ownerLabels !== []) {
            $labelProbe = trim((string) ($row['pushName'] ?? $row['name'] ?? ''));
            $rowPhone = wa_contact_phone_from_row($row);
            $isOwnerRow = ($labelProbe !== '' && wa_name_is_owner_label($labelProbe, $ownerLabels))
                || ($rowPhone !== '' && wa_name_is_owner_label($rowPhone, $ownerLabels));
            if ($isOwnerRow) {
                continue;
            }
        }
        $saved = wa_saved_contact_name_from_row($row);
        $label = $saved;
        if ($label === '') {
            $push = trim((string) ($row['pushName'] ?? $row['notifyName'] ?? ''));
            if (wa_is_plausible_display_name($push)) {
                $label = $push;
                $withPush++;
            }
        }
        if ($label === '') {
            $skippedNoLabel++;
            continue;
        }
        if ($saved !== '') {
            $withSaved++;
        }
        foreach ($keys as $key) {
            $prev = $index[$key] ?? '';
            if ($prev !== '' && $prev !== $label) {
                $indexCollisions++;
            }
            if ($prev === '' || wa_should_update_contact_name($prev, $label)) {
                $index[$key] = $label;
            }
        }
    }
return $index;
}

function wa_resolve_chat_display_name(array $row, array $contactIndex = [], array $ownerLabels = []): string
{
    $name = wa_chat_list_name_from_row($row, $ownerLabels);
    $legacyName = wa_chat_name_from_row($row);
    $jid = wa_contact_jid_from_row($row);
if ($jid === '') {
        return $name;
    }
    if ($name !== '' && wa_is_plausible_display_name($name)) {
        return $name;
    }
    foreach (wa_row_lookup_keys($row) as $key) {
        if (!isset($contactIndex[$key])) {
            continue;
        }
        $fromContacts = trim((string) $contactIndex[$key]);
        if ($fromContacts !== '') {
return $fromContacts;
        }
    }
    return $name;
}

/** Mirror sync: findChats pushName prevalece sobre nome legado já gravado no CRM. */
function wa_should_sync_chat_display_name(string $existing, string $resolved, array $row, array $ownerLabels = []): bool
{
    if ($resolved === '' || !wa_is_plausible_display_name($resolved)) {
        return false;
    }
    if ($ownerLabels !== [] && wa_name_is_owner_label($resolved, $ownerLabels)) {
        return false;
    }
    $existing = trim($existing);
    if ($existing === '' || $existing === $resolved) {
        return $existing === '';
    }
    $listName = wa_chat_list_name_from_row($row, $ownerLabels);
    if ($listName !== '' && $listName === $resolved) {
        return true;
    }
    $legacySaved = wa_saved_contact_name_from_row($row);
    if ($legacySaved !== '' && $existing === $legacySaved && $resolved !== '' && $resolved !== $legacySaved) {
        return true;
    }
    return wa_should_update_contact_name($existing, $resolved);
}

function wa_list_user_chats(WhatsAppRepository $repo, string $userId): array
{
    $rows = $repo->listChats($userId, wa_mirror_mode());
    if (!wa_mirror_mode()) {
        return $rows;
    }
    $filtered = array_filter($rows, static function ($chat): bool {
        if (!is_array($chat) || !wa_chat_row_visible($chat)) {
            return false;
        }
        return wa_chat_db_ts_recent_enough($chat);
    });

    $sWaNames = [];
    $sWaTails = [];
    foreach ($filtered as $chat) {
        $jid = strtolower((string) ($chat['remote_jid'] ?? ''));
        $name = trim((string) ($chat['contact_name'] ?? ''));
        if (str_ends_with($jid, '@s.whatsapp.net')) {
            if ($name !== '') {
                $sWaNames[strtolower($name)] = true;
            }
            $tail = wa_chat_dedupe_phone_tail(
                (string) ($chat['contact_phone'] ?? '') !== ''
                    ? (string) $chat['contact_phone']
                    : wa_jid_phone($jid)
            );
            if ($tail !== '') {
                $sWaTails[$tail] = true;
            }
        }
    }

    $finalChats = [];
    foreach ($filtered as $chat) {
        $jid = strtolower((string) ($chat['remote_jid'] ?? ''));
        if (!str_ends_with($jid, '@lid')) {
            $finalChats[] = $chat;
            continue;
        }
        $name = trim((string) ($chat['contact_name'] ?? ''));
        if ($name !== '' && isset($sWaNames[strtolower($name)])) {
            continue;
        }
        $tail = wa_chat_dedupe_phone_tail((string) ($chat['contact_phone'] ?? ''));
        if ($tail !== '' && isset($sWaTails[$tail])) {
            continue;
        }
        $finalChats[] = $chat;
    }
    return wa_dedupe_chats_list(array_values($finalChats));
}

/** Últimos 11 dígitos BR (55 opcional) — une 629… com 55629…. */
function wa_chat_dedupe_phone_tail(string $digits): string
{
    $d = wa_phone_digits($digits);
    if ($d === '') {
        return '';
    }
    if (strlen($d) > 11 && str_starts_with($d, '55')) {
        $d = substr($d, 2);
    }
    if (strlen($d) >= 11) {
        return substr($d, -11);
    }
    return strlen($d) >= 10 ? $d : '';
}

function wa_chat_dedupe_key(array $chat): string
{
    $phone = wa_phone_digits((string) ($chat['contact_phone'] ?? ''));
    if ($phone === '') {
        $phone = wa_jid_phone((string) ($chat['remote_jid'] ?? ''));
    }
    $tail = wa_chat_dedupe_phone_tail($phone);
    if ($tail !== '') {
        return 'p:' . $tail;
    }
    $name = strtolower(trim((string) ($chat['contact_name'] ?? '')));
    if ($name !== '' && strlen($name) >= 3 && !preg_match('/^\d{10,}$/', preg_replace('/\D+/', '', $name) ?? '')) {
        return 'n:' . $name;
    }
    return 'id:' . (string) ($chat['id'] ?? '');
}

/** Chaves alternativas para fundir @lid + @s.whatsapp.net e variações de telefone. */
function wa_chat_dedupe_keys(array $chat): array
{
    $keys = [wa_chat_dedupe_key($chat)];
    $phone = wa_phone_digits((string) ($chat['contact_phone'] ?? ''));
    if ($phone === '') {
        $phone = wa_jid_phone((string) ($chat['remote_jid'] ?? ''));
    }
    $tail = wa_chat_dedupe_phone_tail($phone);
    if ($tail !== '') {
        $keys[] = 'p:' . $tail;
    }
    $name = strtolower(trim((string) ($chat['contact_name'] ?? '')));
    if ($name !== '' && strlen($name) >= 3 && !preg_match('/^\d{10,}$/', preg_replace('/\D+/', '', $name) ?? '')) {
        $keys[] = 'n:' . $name;
    }
    return array_values(array_unique($keys));
}

function wa_chat_dedupe_score(array $chat): float
{
    $score = 0.0;
    if (wa_phone_digits((string) ($chat['contact_phone'] ?? '')) !== '') {
        $score += 8;
    }
    $jid = strtolower((string) ($chat['remote_jid'] ?? ''));
    if ($jid !== '' && !str_ends_with($jid, '@lid')) {
        $score += 4;
    }
    $name = trim((string) ($chat['contact_name'] ?? ''));
    if ($name !== '' && strlen($name) >= 3 && !preg_match('/^\d{10,}$/', preg_replace('/\D+/', '', $name) ?? '')) {
        $score += 2;
    }
    $ts = strtotime((string) ($chat['last_message_at'] ?? $chat['created_at'] ?? ''));
    if ($ts !== false && $ts > 0) {
        $score += $ts / 1e12;
    }
    return $score;
}

function wa_dedupe_chats_list(array $chats): array
{
    $byCanon = [];
    $keyToCanon = [];
    foreach ($chats as $chat) {
        if (!is_array($chat)) {
            continue;
        }
        $keys = wa_chat_dedupe_keys($chat);
        $canon = null;
        foreach ($keys as $k) {
            if (isset($keyToCanon[$k])) {
                $canon = $keyToCanon[$k];
                break;
            }
        }
        if ($canon === null) {
            $canon = $keys[0];
        }
        foreach ($keys as $k) {
            $keyToCanon[$k] = $canon;
        }
        $prev = $byCanon[$canon] ?? null;
        if ($prev === null || wa_chat_dedupe_score($chat) >= wa_chat_dedupe_score($prev)) {
            $byCanon[$canon] = $chat;
        }
    }
    return array_values($byCanon);
}

/** Lista conversas com fallback se o espelho filtrar tudo (protege inbox após sync pesado). */
function wa_list_user_chats_safe(WhatsAppRepository $repo, string $userId): array
{
    $listed = wa_dedupe_chats_list(wa_list_user_chats($repo, $userId));
    if ($listed !== []) {
        return $listed;
    }
    $raw = $repo->listChats($userId, false);
    if ($raw === []) {
        return [];
    }
    $fallback = array_values(array_filter($raw, static function ($chat): bool {
        return is_array($chat) && wa_chat_row_visible($chat);
    }));
    if ($fallback !== []) {
        wa_debug_log('chats safe fallback', [
            'user_tail' => substr($userId, -8),
            'raw' => count($raw),
            'visible' => count($fallback),
        ], 'mirror-rt');
    }
    return wa_dedupe_chats_list($fallback);
}

/** Conversa listável no espelho (exclui grupos; @lid sempre visível se sincronizado). */
function wa_chat_row_visible(array $chat): bool
{
    $jid = strtolower((string) ($chat['remote_jid'] ?? ''));
    if ($jid !== '' && !wa_is_valid_contact_jid($jid)) {
        return false;
    }
    if (str_ends_with($jid, '@lid')) {
        return true;
    }
    $name = trim((string) ($chat['contact_name'] ?? ''));
    if (wa_is_plausible_display_name($name)) {
        return true;
    }
    if ($name !== '' && preg_match('/^\d{10,}$/', preg_replace('/\D+/', '', $name) ?? '')) {
        return false;
    }
    return wa_is_plausible_wa_phone((string) ($chat['contact_phone'] ?? ''));
}

function wa_human_preview(string $preview): string
{
    $s = trim($preview);
    return match ($s) {
        '[Imagem]', '📷 Foto', 'Foto' => '📷 Foto',
        '[Áudio]', '[Audio]', '🎤 Áudio', 'Áudio' => '🎤 Áudio',
        '[Figurinha]', '🎭 Figurinha', 'Figurinha' => '🎭 Figurinha',
        '[Vídeo]', '[Video]', '🎬 Vídeo', 'Vídeo' => '🎬 Vídeo',
        '[Documento]', '📄 Documento', 'Documento' => '📄 Documento',
        '[Mídia]', 'Mídia' => 'Mídia',
        default => $s,
    };
}

/** Localiza chat existente: telefone canônico (tail) primeiro, remote_jid depois. */
function wa_find_existing_chat(WhatsAppRepository $repo, array $instance, string $remoteJid): ?array
{
    $instanceId = (string) ($instance['id'] ?? '');
    if ($instanceId === '') {
        return null;
    }
    $remoteJid = strtolower(trim($remoteJid));
    $phone = wa_repo_phone_from_jid($remoteJid);
    if ($phone !== '') {
        $byPhone = $repo->getChatByPhone($instanceId, $phone);
        if ($byPhone) {
            return $byPhone;
        }
    }
    $byJid = $repo->getChatByJid($instanceId, $remoteJid);
    if ($byJid) {
        return $byJid;
    }
    return null;
}

function wa_detect_message_type(array $msg): string
{
    if (isset($msg['stickerMessage'])) {
        return 'sticker';
    }
    if (isset($msg['imageMessage'])) {
        return 'image';
    }
    if (isset($msg['audioMessage'])) {
        return 'audio';
    }
    if (isset($msg['videoMessage'])) {
        return 'video';
    }
    if (isset($msg['documentMessage'])) {
        return 'document';
    }
    return 'text';
}

function wa_extract_message_text(array $msg): string
{
    if (!empty($msg['conversation'])) {
        return (string) $msg['conversation'];
    }
    if (!empty($msg['extendedTextMessage']['text'])) {
        return (string) $msg['extendedTextMessage']['text'];
    }
    if (!empty($msg['imageMessage']['caption'])) {
        return (string) $msg['imageMessage']['caption'];
    }
    if (isset($msg['imageMessage'])) {
        return '[Imagem]';
    }
    if (!empty($msg['videoMessage']['caption'])) {
        return (string) $msg['videoMessage']['caption'];
    }
    if (isset($msg['videoMessage'])) {
        return '[Vídeo]';
    }
    if (!empty($msg['documentMessage']['caption'])) {
        return (string) $msg['documentMessage']['caption'];
    }
    if (isset($msg['documentMessage'])) {
        return '[Documento]';
    }
    if (isset($msg['audioMessage'])) {
        return '[Áudio]';
    }
    if (isset($msg['stickerMessage'])) {
        return '[Figurinha]';
    }
    return '';
}

function wa_media_mime_from_message(array $msg, string $type): ?string
{
    $key = match ($type) {
        'sticker' => 'stickerMessage',
        'image' => 'imageMessage',
        'audio' => 'audioMessage',
        'video' => 'videoMessage',
        'document' => 'documentMessage',
        default => null,
    };
    if ($key === null || !isset($msg[$key]) || !is_array($msg[$key])) {
        return null;
    }
    $mime = (string) ($msg[$key]['mimetype'] ?? $msg[$key]['mimeType'] ?? '');
    return $mime !== '' ? $mime : null;
}

function wa_extract_incoming_media(array $item, string $userId, EvolutionClient|ZApiClient|WhaticketClient|null $evo = null, ?string $instanceName = null, string $type = 'text'): ?string
{
    $mediaUrl = ZApiClient::mediaUrlFromPayload($item);
    if ($mediaUrl !== '' && str_starts_with($mediaUrl, 'http')) {
        $ch = curl_init($mediaUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 45,
        ]);
        $binary = curl_exec($ch);
        $mime = (string) (curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: '');
        curl_close($ch);
        if (is_string($binary) && $binary !== '') {
            return wa_save_media_bytes($userId, $binary, $mime !== '' ? $mime : null);
        }
    }
    $b64 = null;
    $mime = null;
    foreach (['base64', 'media', 'file'] as $k) {
        if (!empty($item[$k]) && is_string($item[$k])) {
            $b64 = $item[$k];
            break;
        }
    }
    $msg = wa_unwrap_message(is_array($item['message'] ?? null) ? $item['message'] : []);
    if ($mime === null) {
        $mime = wa_media_mime_from_message($msg, $type);
    }
    if ($b64 === null && $evo !== null && $instanceName !== null && in_array($type, ['image', 'audio', 'video', 'sticker', 'document'], true)) {
        try {
            $dl = $evo->getBase64FromMediaMessage($instanceName, $item, $type === 'video');
            if ($dl && !empty($dl['base64'])) {
                $b64 = (string) $dl['base64'];
                $mime = $mime ?? ($dl['mimetype'] ?? null);
            }
        } catch (Throwable $e) {
            wa_debug_log('evo media fetch failed', ['type' => $type, 'error' => $e->getMessage()], 'sticker-media');
        }
    }
    if ($b64 === null) {
        return null;
    }
    if (str_contains($b64, 'base64,')) {
        $b64 = substr($b64, (int) strpos($b64, 'base64,') + 7);
    }
    $binary = base64_decode($b64, true);
    if ($binary === false || $binary === '') {
        return null;
    }
    $saved = wa_save_media_bytes($userId, $binary, $mime);
return $saved;
}

function wa_is_zapi_webhook_payload(array $payload): bool
{
    $type = (string) ($payload['type'] ?? '');
    if ($type !== '' && str_contains($type, 'Callback')) {
        return true;
    }
    return isset($payload['messageId']) && (isset($payload['phone']) || isset($payload['senderLid']));
}

function wa_zapi_remote_jid(array $item): string
{
    $lid = strtolower(trim((string) ($item['senderLid'] ?? $item['participantLid'] ?? '')));
    if ($lid !== '' && str_contains($lid, '@lid')) {
        return $lid;
    }
    $phone = wa_phone_digits((string) ($item['phone'] ?? $item['participantPhone'] ?? ''));
    if (wa_is_plausible_wa_phone($phone)) {
        return wa_remote_jid($phone);
    }
    return '';
}

function wa_zapi_detect_message_type(array $item): string
{
    if (isset($item['sticker'])) {
        return 'sticker';
    }
    if (isset($item['image'])) {
        return 'image';
    }
    if (isset($item['audio'])) {
        return 'audio';
    }
    if (isset($item['video'])) {
        return 'video';
    }
    if (isset($item['document'])) {
        return 'document';
    }
    return 'text';
}

function wa_zapi_extract_message_text(array $item): string
{
    if (!empty($item['text']['message'])) {
        return (string) $item['text']['message'];
    }
    if (!empty($item['image']['caption'])) {
        return (string) $item['image']['caption'];
    }
    if (!empty($item['video']['caption'])) {
        return (string) $item['video']['caption'];
    }
    if (!empty($item['document']['caption'])) {
        return (string) $item['document']['caption'];
    }
    return '';
}

function wa_zapi_item_push_name(array $item): string
{
    foreach (['pushName', 'senderName', 'chatName', 'name'] as $k) {
        $n = trim((string) ($item[$k] ?? $item['message'][$k] ?? $item['data'][$k] ?? ''));
        if ($n !== '' && wa_is_plausible_display_name($n)) {
            return $n;
        }
    }
    return '';
}

function wa_handle_zapi_webhook(WhatsAppRepository $repo, EvolutionClient|ZApiClient|WhaticketClient $evo, array $instance, array $payload): void
{
    $type = (string) ($payload['type'] ?? '');
    $typeLower = strtolower($type);
    $instanceName = (string) ($instance['instance_name'] ?? '');

    if (str_contains($typeLower, 'disconnect')) {
        $repo->updateInstanceStatus((string) $instance['id'], 'close');
        soublu_json(['ok' => true]);
    }

    if (str_contains($typeLower, 'connected') && !str_contains($typeLower, 'disconnect')) {
        $userId = (string) ($instance['user_id'] ?? '');
        if ($userId !== '' && wa_session_locked($repo, $userId, $instance)) {
            if (soublu_whatsapp_configured()) {
                try {
                    $evo->logout($instanceName);
                } catch (Throwable $e) {
                    /* noop */
                }
            }
            $repo->updateInstanceStatus((string) $instance['id'], 'revoked', null);
            soublu_json(['ok' => true, 'ignored' => 'session_locked']);
        }
        $phone = wa_phone_digits((string) ($payload['phone'] ?? $payload['connectedPhone'] ?? ''));
        $repo->updateInstanceStatus((string) $instance['id'], 'open', $phone !== '' ? $phone : null);
        wa_clear_rebind_required($userId);
        $repo->clearSessionRevoked($userId);
        if ($userId !== '') {
            wa_bump_events($userId);
        }
        soublu_json(['ok' => true]);
    }

    if ($type !== 'ReceivedCallback' && $type !== 'SendCallback') {
        soublu_json(['ok' => true, 'ignored' => true]);
    }

    $userId = (string) ($instance['user_id'] ?? '');
    $remoteJid = wa_zapi_remote_jid($payload);
    if ($remoteJid === '' || str_contains($remoteJid, '@g.us')) {
        soublu_json(['ok' => true, 'ignored' => true]);
    }
    $fromMe = !empty($payload['fromMe']);
    $waId = (string) ($payload['messageId'] ?? '');
    if ($waId !== '' && $repo->messageExistsByWaId($waId)) {
        soublu_json(['ok' => true, 'duplicate' => true]);
    }
    $msgType = wa_zapi_detect_message_type($payload);
    $text = wa_zapi_extract_message_text($payload);
    $mediaUrl = wa_extract_incoming_media($payload, $userId, $evo, $instanceName, $msgType);
    if ($text === '' && $mediaUrl === null) {
        soublu_json(['ok' => true, 'ignored' => true]);
    }
    if ($text === '' && $mediaUrl !== null) {
        $text = match ($msgType) {
            'image' => '[Imagem]',
            'audio' => '[Áudio]',
            'sticker' => '[Figurinha]',
            'video' => '[Vídeo]',
            default => '[Mídia]',
        };
    }
    $pushName = wa_zapi_item_push_name($payload);
    $ownerLabels = wa_request_owner_labels($instance, $evo);
    if ($pushName !== '' && !$fromMe && wa_name_is_owner_label($pushName, $ownerLabels)) {
        $pushName = '';
    }
    $chat = $repo->getOrCreateChat($instance, $remoteJid, $pushName !== '' ? $pushName : null);
    if ($pushName !== '' && !$fromMe) {
        wa_sync_contact_name($repo, $chat, $pushName, $ownerLabels);
    }
    $repo->insertMessage(
        $chat,
        $instance,
        $fromMe ? 'out' : 'in',
        $text,
        $waId !== '' ? $waId : null,
        $msgType,
        $mediaUrl
    );
    wa_debug_log('zapi webhook message', ['wa_id' => $waId, 'jid' => $remoteJid], 'zapi');
    if ($userId !== '') {
        wa_bump_events($userId);
    }
    soublu_json(['ok' => true, 'saved' => 1]);
}

function wa_webhook_auth_ok(): bool
{
    $secret = '';
    if (soublu_whatsapp_provider() === 'whaticket' || (string) ($_GET['action'] ?? '') === 'webhook_wt') {
        $secret = defined('WHATICKET_WEBHOOK_SECRET') && (string) WHATICKET_WEBHOOK_SECRET !== ''
            ? (string) WHATICKET_WEBHOOK_SECRET
            : '';
    }
    if ($secret === '') {
        $secret = defined('Z_API_WEBHOOK_SECRET') && (string) Z_API_WEBHOOK_SECRET !== ''
            ? (string) Z_API_WEBHOOK_SECRET
            : (defined('EVOLUTION_WEBHOOK_SECRET') ? (string) EVOLUTION_WEBHOOK_SECRET : '');
    }
    if ($secret === '') {
        return true;
    }
    $q = (string) ($_GET['secret'] ?? '');
    $h = (string) ($_SERVER['HTTP_X_WEBHOOK_SECRET'] ?? '');
    return hash_equals($secret, $q) || hash_equals($secret, $h);
}

function wa_whaticket_remote_jid_from_payload(array $payload): string
{
    $data = is_array($payload['data'] ?? null) ? $payload['data'] : $payload;
    $contact = is_array($data['contact'] ?? null) ? $data['contact'] : [];
    $number = wa_phone_digits((string) (
        $contact['number']
        ?? $data['number']
        ?? $data['phone']
        ?? ''
    ));
    if ($number === '') {
        $jid = (string) ($data['remoteJid'] ?? $data['remote_jid'] ?? '');
        if ($jid !== '' && !str_contains($jid, '@g.us')) {
            return strtolower($jid);
        }
        return '';
    }
    return wa_remote_jid($number);
}

function wa_handle_whaticket_webhook(WhatsAppRepository $repo, EvolutionClient|ZApiClient|WhaticketClient $evo, array $payload): void
{
    $event = strtolower((string) ($payload['event'] ?? ''));
    $data = is_array($payload['data'] ?? null) ? $payload['data'] : $payload;

    $wtId = defined('WHATICKET_WHATSAPP_ID') ? trim((string) WHATICKET_WHATSAPP_ID) : '1';
    $instance = $repo->getInstanceByName($wtId);
    if (!$instance) {
        soublu_json(['ok' => true, 'ignored' => 'no_instance']);
    }

    $userId = (string) ($instance['user_id'] ?? '');
    $instanceName = (string) ($instance['instance_name'] ?? $wtId);

    if ($event === 'ticket' || isset($data['status'])) {
        $st = strtolower((string) ($data['status'] ?? ''));
        if (in_array($st, ['open', 'pending', 'closed'], true)) {
            $ticketId = (int) ($data['id'] ?? 0);
            if ($ticketId > 0) {
                $remoteJid = wa_whaticket_remote_jid_from_payload(['data' => $data]);
                if ($remoteJid !== '') {
                    $chat = $repo->getOrCreateChat($instance, $remoteJid, null);
                    $repo->updateChatMeta((string) $chat['id'], ['whaticket_ticket_id' => $ticketId]);
                }
            }
        }
    }

    if ($event === 'whatsapp' || str_contains($event, 'connection')) {
        $st = soublu_whatsapp_parse_connection_state(is_array($data) ? $data : []);
        if ($st === 'open') {
            $phone = wa_phone_digits((string) ($data['number'] ?? $data['phone'] ?? ''));
            $repo->updateInstanceStatus((string) $instance['id'], 'open', $phone !== '' ? $phone : null);
            if ($userId !== '') {
                wa_clear_rebind_required($userId);
                $repo->clearSessionRevoked($userId);
                wa_bump_events($userId);
            }
        } elseif ($st === 'connecting') {
            $repo->updateInstanceStatus((string) $instance['id'], 'connecting');
        } else {
            $repo->updateInstanceStatus((string) $instance['id'], 'close');
        }
        soublu_json(['ok' => true]);
    }

    if ($event !== 'appmessage' && $event !== 'message' && $event !== 'appMessage') {
        soublu_json(['ok' => true, 'ignored' => true]);
    }

    $remoteJid = wa_whaticket_remote_jid_from_payload(['data' => $data]);
    if ($remoteJid === '' || str_contains($remoteJid, '@g.us')) {
        soublu_json(['ok' => true, 'ignored' => true]);
    }

    $fromMe = !empty($data['fromMe']) || !empty($data['from_me']);
    $waId = (string) ($data['id'] ?? $data['wid'] ?? $data['messageId'] ?? '');
    if ($waId !== '' && $repo->messageExistsByWaId($waId)) {
        soublu_json(['ok' => true, 'duplicate' => true]);
    }

    $msgType = strtolower((string) ($data['mediaType'] ?? $data['type'] ?? 'text'));
    $text = trim((string) ($data['body'] ?? $data['message'] ?? ''));
    $mediaUrl = trim((string) ($data['mediaUrl'] ?? $data['media_url'] ?? ''));
    if ($text === '' && $mediaUrl === '') {
        soublu_json(['ok' => true, 'ignored' => true]);
    }
    if ($text === '' && $mediaUrl !== '') {
        $text = match (true) {
            str_contains($msgType, 'image') => '[Imagem]',
            str_contains($msgType, 'audio') => '[Áudio]',
            str_contains($msgType, 'video') => '[Vídeo]',
            str_contains($msgType, 'sticker') => '[Figurinha]',
            default => '[Mídia]',
        };
    }

    $pushName = trim((string) ($data['contact']['name'] ?? $data['pushName'] ?? ''));
    $ownerLabels = wa_request_owner_labels($instance, $evo);
    if ($pushName !== '' && !$fromMe && wa_name_is_owner_label($pushName, $ownerLabels)) {
        $pushName = '';
    }

    $chat = $repo->getOrCreateChat($instance, $remoteJid, $pushName !== '' ? $pushName : null);
    $ticketId = (int) ($data['ticketId'] ?? $data['ticket']['id'] ?? $data['ticket_id'] ?? 0);
    if ($ticketId > 0) {
        $repo->updateChatMeta((string) $chat['id'], ['whaticket_ticket_id' => $ticketId]);
    }
    if ($pushName !== '' && !$fromMe) {
        wa_sync_contact_name($repo, $chat, $pushName, $ownerLabels);
    }

    $repo->insertMessage(
        $chat,
        $instance,
        $fromMe ? 'out' : 'in',
        $text,
        $waId !== '' ? $waId : null,
        str_contains($msgType, 'audio') ? 'audio' : (str_contains($msgType, 'image') ? 'image' : 'text'),
        $mediaUrl !== '' ? $mediaUrl : null
    );
    wa_debug_log('whaticket webhook message', ['wa_id' => $waId, 'jid' => $remoteJid], 'whaticket');
    if ($userId !== '') {
        wa_bump_events($userId);
    }
    soublu_json(['ok' => true, 'saved' => 1]);
}

function wa_handle_webhook(WhatsAppRepository $repo, EvolutionClient|ZApiClient|WhaticketClient $evo): void
{
    if (!wa_webhook_auth_ok()) {
        soublu_json(['ok' => false, 'error' => 'Webhook não autorizado.'], 401);
    }
    $payload = wa_json_body();
    if (!$payload) {
        soublu_json(['ok' => true, 'ignored' => true]);
    }

    $event = strtolower((string) ($payload['event'] ?? $payload['type'] ?? ''));
    $instanceName = (string) ($payload['instance'] ?? $payload['instanceName'] ?? $payload['instanceId'] ?? '');

    if ($instanceName === '' && soublu_whatsapp_provider() === 'zapi' && defined('Z_API_INSTANCE_ID')) {
        $instanceName = (string) Z_API_INSTANCE_ID;
    }

    if ($instanceName === '') {
        soublu_json(['ok' => true, 'ignored' => true]);
    }

    $instance = $repo->getInstanceByName($instanceName);
    if (!$instance) {
        soublu_json(['ok' => true, 'ignored' => true]);
    }

    if (wa_is_zapi_webhook_payload($payload)) {
        wa_handle_zapi_webhook($repo, $evo, $instance, $payload);
    }

    if (str_contains($event, 'qrcode')) {
        $repo->updateInstanceStatus($instance['id'], 'connecting');
        soublu_json(['ok' => true]);
    }

    if (str_contains($event, 'connection')) {
        $data = $payload['data'] ?? $payload;
        $state = soublu_whatsapp_parse_connection_state(is_array($data) ? $data : []);
        if ($state === 'open') {
            $userId = (string) ($instance['user_id'] ?? '');
            if ($userId !== '' && wa_session_locked($repo, $userId, $instance)) {
                wa_debug_log('webhook open ignored session locked', ['user_tail' => substr($userId, -8)], 'isolate');
                if (soublu_whatsapp_configured()) {
                    try {
                        $evo->logout((string) $instance['instance_name']);
                    } catch (Throwable $e) {
                        /* noop */
                    }
                }
                $repo->updateInstanceStatus($instance['id'], 'revoked', null);
                soublu_json(['ok' => true, 'ignored' => 'session_locked']);
            }
            $phone = null;
            if (is_array($data)) {
                $phone = wa_phone_digits((string) ($data['phone'] ?? $data['wid'] ?? $data['wuid'] ?? ''));
            }
            $repo->updateInstanceStatus($instance['id'], 'open', $phone ?: null);
            wa_clear_rebind_required((string) ($instance['user_id'] ?? ''));
            $repo->clearSessionRevoked((string) ($instance['user_id'] ?? ''));
            wa_bump_events((string) ($instance['user_id'] ?? ''));
        } else {
            $repo->updateInstanceStatus($instance['id'], $state);
        }
        soublu_json(['ok' => true]);
    }

    if (!str_contains($event, 'message')) {
        soublu_json(['ok' => true, 'ignored' => true]);
    }

    $items = $payload['data'] ?? [];
    if (isset($items['key']) || isset($items['message'])) {
        $items = [$items];
    }
    if (!is_array($items)) {
        soublu_json(['ok' => true]);
    }

    $saved = 0;
    $userId = (string) ($instance['user_id'] ?? '');
    $ownerLabels = wa_request_owner_labels($instance, $evo);
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $fromMe = wa_item_from_me($item);
        $remoteJid = wa_item_peer_jid($item);
        if ($remoteJid === '' || str_contains($remoteJid, '@g.us')) {
            continue;
        }
        $key = $item['key'] ?? [];
        $waId = (string) ($key['id'] ?? $item['id'] ?? '');
        if ($waId !== '' && $repo->messageExistsByWaId($waId)) {
            continue;
        }
        $msgObj = wa_unwrap_message(is_array($item['message'] ?? null) ? $item['message'] : (is_array($item) ? $item : []));
        if (!is_array($msgObj) || $msgObj === []) {
            continue;
        }
        $text = wa_extract_message_text($msgObj);
        $type = wa_detect_message_type($msgObj);
        $isMedia = in_array($type, ['image', 'audio', 'video', 'sticker', 'document'], true);
        // Webhook: tenta baixar mídia; se Evolution falhar, ainda salva o stub + raw_payload
        // para repair_media sob demanda (evita perder figurinha/áudio/foto).
        $mediaUrl = $isMedia
            ? wa_extract_incoming_media($item, $userId, $evo, $instanceName, $type)
            : null;
        if ($text === '' && !$isMedia && $mediaUrl === null) {
            continue;
        }
        if ($text === '' && ($mediaUrl !== null || $isMedia)) {
            $text = match ($type) {
                'image' => '[Imagem]',
                'audio' => '[Áudio]',
                'sticker' => '[Figurinha]',
                'video' => '[Vídeo]',
                default => '[Mídia]',
            };
        }
        $pushName = wa_item_message_push_name($item, $fromMe, $ownerLabels);
        $chat = $repo->getOrCreateChat($instance, $remoteJid, $pushName !== '' ? $pushName : null);
        if ($pushName !== '' && !$fromMe) {
            wa_sync_contact_name($repo, $chat, $pushName, $ownerLabels);
        }
        $rawPayload = json_encode(
            is_array($item['message'] ?? null) ? $item['message'] : $msgObj,
            JSON_UNESCAPED_UNICODE
        );
        $repo->insertMessage(
            $chat,
            $instance,
            $fromMe ? 'out' : 'in',
            $text,
            $waId !== '' ? $waId : null,
            $type,
            $mediaUrl,
            null,
            $rawPayload !== false ? $rawPayload : null
        );
        $saved++;
    }

    wa_debug_log('webhook messages', ['event' => $event, 'instance' => $instanceName, 'saved' => $saved], 'webhook');

    if ($saved > 0 && $userId !== '') {
        wa_bump_events($userId);
    }

    soublu_json(['ok' => true, 'saved' => $saved]);
}

/** Mapa telefone → melhor nome a partir das conversas Evolution (findChats). */
function wa_phone_name_map_from_chat_rows(array $rows, array $ownerLabels = []): array
{
    $map = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $phone = wa_contact_phone_from_row($row);
        if (!wa_is_plausible_wa_phone($phone)) {
            continue;
        }
        $name = wa_chat_list_name_from_row($row, $ownerLabels);
        if ($name === '') {
            continue;
        }
        if (!isset($map[$phone]) || wa_should_update_contact_name($map[$phone], $name)) {
            $map[$phone] = $name;
        }
    }
    return $map;
}

/** Corrige nomes gravados no CRM cruzando pelo telefone (avatar usa o mesmo número). */
function wa_repair_chat_names_by_phone(WhatsAppRepository $repo, string $userId, array $phoneNameMap): int
{
    if ($phoneNameMap === []) {
        return 0;
    }
    $fixed = 0;
    foreach ($repo->listChats($userId) as $chat) {
        if (!is_array($chat)) {
            continue;
        }
        $phone = wa_phone_digits((string) ($chat['contact_phone'] ?? ''));
        if (!wa_is_plausible_wa_phone($phone) || !isset($phoneNameMap[$phone])) {
            continue;
        }
        $newName = $phoneNameMap[$phone];
        $old = trim((string) ($chat['contact_name'] ?? ''));
        if ($old === $newName || !wa_is_plausible_display_name($newName)) {
            continue;
        }
        if ($old === '' || $old !== $newName) {
            $repo->updateChatMeta((string) $chat['id'], ['contact_name' => $newName]);
$fixed++;
        }
    }
    return $fixed;
}

function wa_sync_chats_from_evolution(
    WhatsAppRepository $repo,
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    array $instance,
    bool $force,
    bool $mirrorPoll = false,
    bool $allowPrune = false
): array {
    $userId = (string) $instance['user_id'];
    wa_recover_live_session($evo, $repo, $userId);
    if (wa_rebind_required($userId)) {
        wa_debug_log('sync chats skipped rebind', ['user_tail' => substr($userId, -8)], 'isolate');
        return ['synced' => 0, 'skipped' => true, 'skip_reason' => 'rebind', 'chats' => wa_list_user_chats($repo, $userId), 'mirror' => wa_mirror_mode(), 'rebind_blocked' => true];
    }
    if (!wa_contacts_sync_enabled()) {
        return ['synced' => 0, 'skipped' => true, 'skip_reason' => 'sync_disabled', 'chats' => wa_list_user_chats($repo, $userId), 'mirror' => wa_mirror_mode()];
    }
    if ($mirrorPoll) {
        if (wa_mirror_poll_recently($userId)) {
            wa_debug_log('sync chats skipped poll', ['user_tail' => substr($userId, -8)], 'mirror-rt');
            return ['synced' => 0, 'skipped' => true, 'skip_reason' => 'mirror_poll', 'chats' => wa_list_user_chats($repo, $userId), 'mirror' => wa_mirror_mode(), 'mirror_poll' => true];
        }
    } elseif (!$force && wa_sync_recently($userId)) {
        wa_debug_log('sync chats skipped cooldown', ['user_tail' => substr($userId, -8)], 'mirror-rt');
        return ['synced' => 0, 'skipped' => true, 'skip_reason' => 'sync_cooldown', 'chats' => wa_list_user_chats($repo, $userId), 'mirror' => wa_mirror_mode()];
    }

    if ($allowPrune && $force) {
        $pruned = $repo->pruneEmptyChats($userId);
        $invalid = $repo->pruneInvalidChats($userId);
        wa_debug_log('prune empty chats', ['user_id' => $userId, 'pruned' => $pruned, 'invalid' => $invalid], 'sync-hygiene');
    }

    $max = wa_contacts_max();
    $synced = 0;
    $skippedGhost = 0;
    $enrichedFromContacts = 0;
    $missingNameAfter = 0;
    $rows = [];
    try {
        // Espelho: conversas recentes paginadas (lista lateral do WhatsApp Web).
        $rows = wa_fetch_chat_rows_from_evolution($evo, (string) $instance['instance_name'], $max);
        if ($rows === [] && wa_mirror_mode()) {
            try {
                $contactResp = $evo->findContacts((string) $instance['instance_name']);
                $contactRows = wa_evolution_rows($contactResp);
                wa_debug_log('findChats empty, findContacts fallback', [
                    'user_tail' => substr($userId, -8),
                    'contacts' => count($contactRows),
                ], 'mirror-rt');
                foreach ($contactRows as $crow) {
                    if (!is_array($crow)) {
                        continue;
                    }
                    $jid = wa_contact_jid_from_row($crow);
                    if ($jid === '' || !wa_is_valid_contact_jid($jid)) {
                        continue;
                    }
                    $rows[] = $crow;
                    if (count($rows) >= $max) {
                        break;
                    }
                }
            } catch (Throwable $eContacts) {
                wa_debug_log('findContacts fallback failed', ['error' => $eContacts->getMessage()], 'mirror-rt');
            }
        }
    } catch (Throwable $e) {
        wa_debug_log('findChats failed', ['error' => $e->getMessage()], 'mirror-rt');
        return ['synced' => 0, 'skipped' => false, 'skip_reason' => 'evo_error', 'chats' => wa_list_user_chats($repo, $userId), 'error' => $e->getMessage(), 'mirror' => wa_mirror_mode()];
    }

    $ownerLabels = wa_request_owner_labels($instance, $evo);
    $contactIndex = wa_mirror_mode()
        ? wa_build_contact_name_index($evo, (string) $instance['instance_name'], $ownerLabels)
        : [];

    foreach ($rows as $row) {
        if ($synced >= $max) {
            break;
        }
        if (!is_array($row)) {
            continue;
        }
        try {
            $remoteJid = wa_contact_jid_from_row($row);
            if ($remoteJid === '' || !wa_is_valid_contact_jid($remoteJid)) {
                continue;
            }
            $existingChat = wa_find_existing_chat($repo, $instance, $remoteJid);
            if (!$existingChat && !wa_row_ts_recent_enough($row)) {
                $skippedGhost++;
                continue;
            }
            if (!$existingChat && !wa_row_has_conversation($row)) {
                $skippedGhost++;
                continue;
            }
            $nameFromChat = wa_chat_list_name_from_row($row, $ownerLabels);
            $name = wa_resolve_chat_display_name($row, $contactIndex, $ownerLabels);
            if ($name !== '' && $nameFromChat === '' && $contactIndex !== []) {
                $enrichedFromContacts++;
            }
            // Sempre via getOrCreateChat (upsert): atualiza se existir, cria se não.
            $chat = $repo->getOrCreateChat($instance, $remoteJid, $name !== '' ? $name : null);
            if (!$chat || empty($chat['id'])) {
                continue;
            }
            $meta = [];
            $prevName = trim((string) ($chat['contact_name'] ?? ''));
            // Apelido manual (name_locked) nunca é sobrescrito pelo espelho.
            if (empty($chat['name_locked'])
                && $prevName !== ''
                && wa_name_is_owner_label($prevName, $ownerLabels)
                && $name !== ''
                && !wa_name_is_owner_label($name, $ownerLabels)) {
                $meta['contact_name'] = $name;
                wa_debug_log('chat name owner-label corrected', [
                    'jid_tail' => substr($remoteJid, -18),
                    'prev' => $prevName,
                    'next' => $name,
                ], 'H4-owner-name-fix');
            } elseif (empty($chat['name_locked'])
                && $name !== ''
                && wa_should_sync_chat_display_name($prevName, $name, $row, $ownerLabels)) {
                $meta['contact_name'] = $name;
                if ($prevName !== '' && $prevName !== $name) {
                    wa_debug_log('chat name corrected on sync', [
                        'jid_tail' => substr($remoteJid, -18),
                        'prev' => $prevName,
                        'next' => $name,
                        'push_name' => $nameFromChat,
                    ], 'H3-sync-correct');
                }
            }
            $preview = wa_row_last_preview($row);
            if ($preview !== '') {
                $meta['last_message_preview'] = wa_human_preview($preview);
            }
            $ts = wa_row_conversation_timestamp($row);
            if ($ts > 0) {
                $meta['last_message_at'] = gmdate('Y-m-d H:i:s', $ts);
            }
            $phone = wa_contact_phone_from_row($row);
            if ($phone !== '' && wa_is_plausible_wa_phone($phone)) {
                $meta['contact_phone'] = wa_repo_canonical_phone($phone);
                $tail = wa_repo_phone_tail($phone);
                if ($tail !== '') {
                    $meta['contact_phone_tail'] = $tail;
                }
            } elseif (str_ends_with($remoteJid, '@lid')) {
                // NULL (não '') — índice único uq_wa_chat_phone quebra com vários ''.
                $meta['contact_phone'] = null;
            }
            $picUrl = wa_row_profile_pic_url($row);
            if ($picUrl !== '') {
                $meta['contact_avatar_url'] = $picUrl;
            }
            $wtTicketId = (int) ($row['whaticket_ticket_id'] ?? 0);
            if ($wtTicketId > 0) {
                $meta['whaticket_ticket_id'] = $wtTicketId;
            }
            if ($meta) {
                $repo->updateChatMeta((string) $chat['id'], $meta);
            }
            $finalName = trim((string) ($meta['contact_name'] ?? $chat['contact_name'] ?? ''));
            if (!wa_is_plausible_display_name($finalName)) {
                $missingNameAfter++;
            }
            $synced++;
        } catch (Throwable $eChat) {
            wa_debug_log('sync chat row failed', [
                'error' => $eChat->getMessage(),
            ], 'mirror-rt');
        }
    }

    $namesRepaired = wa_repair_chat_names_by_phone($repo, $userId, wa_phone_name_map_from_chat_rows($rows, $ownerLabels));

    if ($force || $synced > 0) {
        // Limites conservadores pós-outage: avatares extras vão no warm throttle do front.
        wa_enrich_user_chats_metadata($repo, $evo, $instance, $force ? 12 : 6);
    }
    if ($force) {
        wa_resolve_lid_chats_by_avatar($repo, $evo, $instance, 30);
    }

    if ($mirrorPoll) {
        wa_mark_mirror_poll($userId);
    } elseif ($synced > 0 || $force) {
        wa_mark_sync($userId);
    }
return ['synced' => $synced, 'skipped' => false, 'skipped_ghost' => $skippedGhost, 'rows' => count($rows), 'skip_reason' => null, 'chats' => wa_list_user_chats($repo, $userId), 'mirror' => wa_mirror_mode()];
}

/** @deprecated alias */
function wa_sync_contacts_from_evolution(
    WhatsAppRepository $repo,
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    array $instance,
    bool $force
): array {
    return wa_sync_chats_from_evolution($repo, $evo, $instance, $force, false);
}

function wa_http_get_bytes(string $url, int $timeoutSec = 15): ?string
{
    if ($url === '' || !preg_match('#^https?://#i', $url)) {
        return null;
    }
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $headers = [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer: https://web.whatsapp.com/',
        ];
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => $timeoutSec,
            CURLOPT_CONNECTTIMEOUT => min(5, $timeoutSec),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_SSL_VERIFYPEER => !(defined('EVOLUTION_SSL_VERIFY') && EVOLUTION_SSL_VERIFY === false),
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!is_string($body) || $body === '' || ($code > 0 && $code >= 400)) {
            return null;
        }
        return $body;
    }
    $ctx = stream_context_create(['http' => ['timeout' => $timeoutSec]]);
    $body = @file_get_contents($url, false, $ctx);
    return is_string($body) && $body !== '' ? $body : null;
}

function wa_mirror_messages_from_evolution(
    WhatsAppRepository $repo,
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    array $instance,
    array $chat,
    int $limit = 40
): int {
    if (!soublu_whatsapp_configured()) {
        return 0;
    }
    $remoteJid = (string) ($chat['remote_jid'] ?? '');
    if ($remoteJid === '') {
        return 0;
    }
    try {
        $resp = $evo->findMessages((string) $instance['instance_name'], $remoteJid, $limit);
    } catch (Throwable $e) {
        wa_debug_log('mirror messages failed', ['error' => $e->getMessage(), 'chat_id' => $chat['id'] ?? ''], 'mirror');
        return 0;
    }
    $rows = $resp['messages']['records'] ?? $resp['records'] ?? wa_evolution_rows($resp);
    if (!is_array($rows)) {
        return 0;
    }
    $imported = 0;
    $directionFixed = 0;
    $userId = (string) ($instance['user_id'] ?? '');
    $instanceName = (string) ($instance['instance_name'] ?? '');
    $outCount = 0;
    $inCount = 0;
    $stickerWithMedia = 0;
    $stickerMissing = 0;
    $ownerLabels = wa_request_owner_labels($instance, $evo);
    foreach ($rows as $item) {
        if (!is_array($item)) {
            continue;
        }
        $key = $item['key'] ?? [];
        $fromMe = wa_item_from_me($item);
        if ($fromMe) {
            $outCount++;
        } else {
            $inCount++;
        }
        $waId = (string) ($key['id'] ?? $item['id'] ?? '');
        $wantDir = $fromMe ? 'out' : 'in';
        if ($waId !== '') {
            $existing = $repo->getMessageByWaId($waId);
            if ($existing) {
                // Re-vincula mensagens órfãs cujo chat foi recriado (id novo).
                if ((string) ($existing['chat_id'] ?? '') !== (string) ($chat['id'] ?? '')) {
                    $repo->updateMessageChat((string) $existing['id'], (string) $chat['id'], $remoteJid);
                    $imported++;
                }
                if (($existing['direction'] ?? '') !== $wantDir) {
                    $repo->updateMessageDirection((string) $existing['id'], $wantDir);
                    $directionFixed++;
                }
                continue;
            }
        }
        $msgObj = wa_unwrap_message(is_array($item['message'] ?? null) ? $item['message'] : (is_array($item) ? $item : []));
        if (!is_array($msgObj) || $msgObj === []) {
            continue;
        }
        $text = wa_extract_message_text($msgObj);
        $type = wa_detect_message_type($msgObj);
        // Espelho (findChats): só baixa mídia inline se JÁ veio o base64 no payload.
        // Download pesado fica para repair_media sob demanda (ao abrir a conversa),
        // evitando dezenas de downloads síncronos que travam o carregamento da lista.
        $hasInlineB64 = !empty($item['base64']) || !empty($item['media']) || !empty($item['file']);
        $isMedia = in_array($type, ['image', 'audio', 'video', 'sticker', 'document'], true);
        if ($isMedia && $hasInlineB64) {
            $mediaUrl = wa_extract_incoming_media($item, $userId, null, null, $type);
        } elseif ($isMedia) {
            $mediaUrl = null; // será reparado sob demanda no frontend
        } else {
            $mediaUrl = null;
        }
        if ($type === 'sticker') {
            if ($mediaUrl) {
                $stickerWithMedia++;
            } else {
                $stickerMissing++;
            }
        }
        // Mensagem de mídia sem texto ainda é válida (o media vem depois via repair).
        if ($text === '' && !$isMedia && $mediaUrl === null) {
            continue;
        }
        if ($text === '' && ($mediaUrl !== null || $isMedia)) {
            $text = match ($type) {
                'image' => '[Imagem]',
                'audio' => '[Áudio]',
                'sticker' => '[Figurinha]',
                'video' => '[Vídeo]',
                default => '[Mídia]',
            };
        }
        $pushName = wa_item_message_push_name($item, $fromMe, $ownerLabels);
        if ($pushName !== '' && !$fromMe) {
            wa_sync_contact_name($repo, $chat, $pushName, $ownerLabels);
        }
        $rawPayload = json_encode(is_array($item['message'] ?? null) ? $item['message'] : $msgObj, JSON_UNESCAPED_UNICODE);
        $msgDate = null;
        if (!empty($item['messageTimestamp'])) {
            $msgDate = gmdate('Y-m-d H:i:s', (int) $item['messageTimestamp']);
        }
        
        $repo->insertMessage(
            $chat,
            $instance,
            $fromMe ? 'out' : 'in',
            $text,
            $waId !== '' ? $waId : null,
            $type,
            $mediaUrl,
            $msgDate,
            $rawPayload
        );
        $imported++;
    }
    wa_debug_log('mirror messages detail', [
        'chat_id' => $chat['id'] ?? '',
        'imported' => $imported,
        'direction_fixed' => $directionFixed,
        'in' => $inCount,
        'out' => $outCount,
        'sticker_with_media' => $stickerWithMedia,
        'sticker_missing' => $stickerMissing,
        'rows' => count($rows),
    ], 'fromMe-mirror');
    return $imported;
}

/** Tenta obter nome/foto/telefone via fetchProfile (útil para @lid). */
function wa_enrich_chat_from_profile(
    WhatsAppRepository $repo,
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    array $instance,
    array $chat
): bool {
    $jid = strtolower(trim((string) ($chat['remote_jid'] ?? '')));
    if ($jid === '') {
        return false;
    }
    try {
        $resp = $evo->fetchProfile((string) $instance['instance_name'], $jid);
    } catch (Throwable $e) {
        wa_debug_log('fetchProfile failed', ['jid_tail' => substr($jid, -18), 'error' => $e->getMessage()], 'avatar-enrich');
        return false;
    }
    $meta = [];
    $wuid = strtolower(trim((string) ($resp['wuid'] ?? $resp['wid'] ?? '')));
    if ($wuid !== '' && str_contains($wuid, '@s.whatsapp.net')) {
        $realPhone = wa_jid_phone($wuid);
        if (wa_is_plausible_wa_phone($realPhone)) {
            $meta['contact_phone'] = $realPhone;
        }
    }
    $name = trim((string) ($resp['name'] ?? $resp['pushname'] ?? $resp['notify'] ?? ''));
    if (wa_is_plausible_display_name($name)) {
        $meta['contact_name'] = $name;
    }
    $pic = trim((string) ($resp['picture'] ?? $resp['profilePictureUrl'] ?? $resp['profilePicUrl'] ?? ''));
    if ($pic !== '' && preg_match('#^https?://#i', $pic)) {
        $meta['contact_avatar_url'] = $pic;
    }
    if ($meta === []) {
        return false;
    }
    $repo->updateChatMeta((string) $chat['id'], $meta);
    return true;
}

/** Tenta obter nome do contato via pushName nas mensagens (necessário para @lid). */
function wa_enrich_chat_name_from_messages(
    WhatsAppRepository $repo,
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    array $instance,
    array $chat,
    int $limit = 25
): bool {
    $name = trim((string) ($chat['contact_name'] ?? ''));
    if (wa_is_plausible_display_name($name)) {
        return false;
    }
    $remoteJid = (string) ($chat['remote_jid'] ?? '');
    if ($remoteJid === '') {
        return false;
    }
    try {
        $resp = $evo->findMessages((string) $instance['instance_name'], $remoteJid, $limit);
    } catch (Throwable $e) {
        return false;
    }
    $rows = $resp['messages']['records'] ?? $resp['records'] ?? wa_evolution_rows($resp);
    if (!is_array($rows)) {
        return false;
    }
    $bestName = '';
    $bestPhone = '';
    $ownerLabels = wa_request_owner_labels($instance, $evo);
    foreach ($rows as $item) {
        if (!is_array($item)) {
            continue;
        }
        $fromMe = wa_item_from_me($item);
        if (!$fromMe) {
            $push = wa_item_message_push_name($item, false, $ownerLabels);
            if ($push !== '' && wa_is_plausible_display_name($push)) {
                $bestName = $push;
            }
        }
        $key = $item['key'] ?? [];
        if (is_array($key)) {
            foreach (['senderPn', 'participant'] as $k) {
                $jid = strtolower(trim((string) ($key[$k] ?? '')));
                if ($jid !== '' && str_ends_with($jid, '@s.whatsapp.net')) {
                    $p = wa_jid_phone($jid);
                    if (wa_is_plausible_wa_phone($p)) {
                        $bestPhone = $p;
                    }
                }
            }
        }
        if ($bestName !== '' && $bestPhone !== '') {
            break;
        }
    }
    $meta = [];
    if ($bestName !== '') {
        $meta['contact_name'] = $bestName;
    }
    if ($bestPhone !== '') {
        $meta['contact_phone'] = $bestPhone;
    }
    if ($meta === []) {
        return false;
    }
    $repo->updateChatMeta((string) $chat['id'], $meta);
    return true;
}

function wa_fetch_chat_avatar_url(
    WhatsAppRepository $repo,
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    array $instance,
    string $chatId
): ?string {
    $userId = (string) ($instance['user_id'] ?? '');
    $chat = $repo->getChatForUser($chatId, $userId);
    if (!$chat) {
        return null;
    }
    $existing = trim((string) ($chat['contact_avatar_url'] ?? ''));
    $storedPhone = wa_phone_digits((string) ($chat['contact_phone'] ?? ''));
    $needsPhone = !wa_is_plausible_wa_phone($storedPhone);
    if ($existing !== '' && !$needsPhone) {
        return $existing;
    }
    if (!soublu_whatsapp_configured()) {
        return null;
    }
    $jid = strtolower(trim((string) ($chat['remote_jid'] ?? '')));
    $phone = wa_phone_digits((string) ($chat['contact_phone'] ?? ''));
    $lookup = '';
    if ($jid !== '' && str_contains($jid, '@')) {
        $lookup = $jid;
    } elseif (wa_is_plausible_wa_phone($phone)) {
        $lookup = $phone;
    }
    if ($lookup === '') {
        return null;
    }
    try {
        $resp = $evo->fetchProfilePictureUrl((string) $instance['instance_name'], $lookup);
        $picUrl = trim((string) ($resp['profilePictureUrl'] ?? $resp['profilePicture'] ?? ''));
        $meta = [];
        if ($picUrl !== '') {
            $meta['contact_avatar_url'] = $picUrl;
        }
        $wuid = strtolower(trim((string) ($resp['wuid'] ?? '')));
        if ($wuid !== '' && str_contains($wuid, '@s.whatsapp.net')) {
            $realPhone = wa_jid_phone($wuid);
            if (wa_is_plausible_wa_phone($realPhone)) {
                $meta['contact_phone'] = $realPhone;
            }
        }
        if ($meta === []) {
            return $existing !== '' ? $existing : null;
        }
        $repo->updateChatMeta($chatId, $meta);
        return $picUrl !== '' ? $picUrl : null;
    } catch (Throwable $e) {
        wa_debug_log('avatar fetch failed', [
            'chat_tail' => substr($chatId, -8),
            'jid_tail' => substr($jid, -18),
            'error' => $e->getMessage(),
        ], 'avatar-enrich');
        return null;
    }
}

/** Enriquece nomes (findContacts) e fotos (fetchProfilePictureUrl) após espelho. */
function wa_enrich_user_chats_metadata(
    WhatsAppRepository $repo,
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    array $instance,
    int $avatarLimit = 20
): array {
    if (!soublu_whatsapp_configured()) {
        return ['names' => 0, 'avatars' => 0, 'phones_cleared' => 0];
    }
    $userId = (string) ($instance['user_id'] ?? '');
    $instName = (string) ($instance['instance_name'] ?? '');
    $ownerLabels = wa_request_owner_labels($instance, $evo);
    $index = wa_build_contact_name_index($evo, $instName, $ownerLabels);
    $chats = $repo->listChats($userId, false);
    $namesFixed = 0;
    $avatarsFixed = 0;
    $phonesCleared = 0;
    $namesFromMessages = 0;
    $avatarTries = 0;
    $nameMessageTries = 0;
    foreach ($chats as $chat) {
        if (!is_array($chat)) {
            continue;
        }
        $chatId = (string) ($chat['id'] ?? '');
        $jid = strtolower(trim((string) ($chat['remote_jid'] ?? '')));
        $meta = [];
        $storedPhone = wa_phone_digits((string) ($chat['contact_phone'] ?? ''));
        if ($storedPhone !== '' && !wa_is_plausible_wa_phone($storedPhone)) {
            $meta['contact_phone'] = '';
            $phonesCleared++;
        }
        $prevName = trim((string) ($chat['contact_name'] ?? ''));
        $nameLocked = !empty($chat['name_locked']);
        $resolved = '';
        foreach (wa_jid_lookup_keys($jid) as $key) {
            if (isset($index[$key])) {
                $resolved = trim((string) $index[$key]);
                break;
            }
        }
        if (!$nameLocked && $resolved !== '' && !wa_name_is_owner_label($resolved, $ownerLabels)
            && wa_should_update_contact_name($prevName, $resolved)) {
            $meta['contact_name'] = $resolved;
            $namesFixed++;
        } elseif (!$nameLocked && !wa_is_plausible_display_name($prevName) && $prevName !== '') {
            $meta['contact_name'] = '';
            $namesFixed++;
        } elseif (!$nameLocked && $prevName !== '' && wa_name_is_owner_label($prevName, $ownerLabels)) {
            $meta['contact_name'] = '';
            $namesFixed++;
        }
        if ($meta !== []) {
            $repo->updateChatMeta($chatId, $meta);
        }
        $chat = array_merge($chat, $meta);
        if ($avatarTries < $avatarLimit) {
            $needsAvatar = trim((string) ($chat['contact_avatar_url'] ?? '')) === '';
            $needsPhone = !wa_is_plausible_wa_phone(wa_phone_digits((string) ($chat['contact_phone'] ?? '')));
            if ($needsAvatar || $needsPhone) {
                $avatarTries++;
                if (wa_fetch_chat_avatar_url($repo, $evo, $instance, $chatId)) {
                    $avatarsFixed++;
                }
                $chat = $repo->getChatForUser($chatId, $userId) ?? $chat;
            }
        }
        $prevName = trim((string) ($chat['contact_name'] ?? ''));
        if (!$nameLocked && !wa_is_plausible_display_name($prevName)) {
            if (wa_enrich_chat_from_profile($repo, $evo, $instance, $chat)) {
                $namesFromMessages++;
                $chat = $repo->getChatForUser($chatId, $userId) ?? $chat;
            }
        }
        $prevName = trim((string) ($chat['contact_name'] ?? ''));
        if (!$nameLocked && !wa_is_plausible_display_name($prevName)) {
            $phone = wa_phone_digits((string) ($chat['contact_phone'] ?? ''));
            if (wa_is_plausible_wa_phone($phone)) {
                foreach (wa_jid_lookup_keys(wa_remote_jid($phone)) as $key) {
                    if (!isset($index[$key])) {
                        continue;
                    }
                    $fromIndex = trim((string) $index[$key]);
                    if ($fromIndex !== '' && wa_should_update_contact_name($prevName, $fromIndex)) {
                        $repo->updateChatMeta($chatId, ['contact_name' => $fromIndex]);
                        $namesFixed++;
                        $chat['contact_name'] = $fromIndex;
                        break;
                    }
                }
            }
        }
        if (!$nameLocked && !wa_is_plausible_display_name(trim((string) ($chat['contact_name'] ?? ''))) && $nameMessageTries < 12) {
            $nameMessageTries++;
            if (wa_enrich_chat_name_from_messages($repo, $evo, $instance, $chat, 20)) {
                $namesFromMessages++;
            }
        }
    }
    wa_debug_log('chats metadata enriched', [
        'user_tail' => substr($userId, -8),
        'names' => $namesFixed,
        'names_from_messages' => $namesFromMessages,
        'avatars' => $avatarsFixed,
        'phones_cleared' => $phonesCleared,
        'index_size' => count($index),
    ], 'avatar-enrich');
    return ['names' => $namesFixed + $namesFromMessages, 'avatars' => $avatarsFixed, 'phones_cleared' => $phonesCleared];
}

/**
 * Resolve conversas @lid (sem nome/telefone) casando a FOTO de perfil com os
 * contatos da agenda (findContacts). A foto do WhatsApp tem um id de mídia único
 * por pessoa, então foto igual = mesma pessoa. Grava nome + telefone reais no chat.
 * Pesado (busca foto de vários contatos) — rodar só em force/connect, com cooldown.
 */
function wa_resolve_lid_chats_by_avatar(
    WhatsAppRepository $repo,
    EvolutionClient|ZApiClient|WhaticketClient $evo,
    array $instance,
    int $maxContacts = 30
): array {
    if (!soublu_whatsapp_configured()) {
        return ['resolved' => 0, 'skipped' => 'not_configured'];
    }
    $userId = (string) ($instance['user_id'] ?? '');
    $instName = (string) ($instance['instance_name'] ?? '');
    if ($userId === '' || $instName === '') {
        return ['resolved' => 0, 'skipped' => 'no_instance'];
    }

    $chats = $repo->listChats($userId, false);
    $pending = [];
    foreach ($chats as $chat) {
        if (!is_array($chat)) {
            continue;
        }
        $jid = strtolower(trim((string) ($chat['remote_jid'] ?? '')));
        if (!str_ends_with($jid, '@lid')) {
            continue;
        }
        $nameOk = wa_is_plausible_display_name(trim((string) ($chat['contact_name'] ?? '')));
        if (!$nameOk) {
            $pending[] = $chat;
        }
    }
    if ($pending === []) {
        return ['resolved' => 0, 'skipped' => 'none_pending'];
    }
    if (wa_lid_resolve_recently($userId)) {
        return ['resolved' => 0, 'skipped' => 'cooldown', 'pending' => count($pending)];
    }
    wa_mark_lid_resolve($userId);

    // Índice assinatura-da-foto => {phone, name} a partir da agenda.
    $sigIndex = [];
    $fetched = 0;
    try {
        $crows = wa_evolution_rows($evo->findContacts($instName));
    } catch (Throwable $e) {
        return ['resolved' => 0, 'skipped' => 'find_contacts_failed'];
    }
    $seenPhones = [];
    foreach ($crows as $crow) {
        if ($fetched >= $maxContacts) {
            break;
        }
        if (!is_array($crow)) {
            continue;
        }
        $cphone = wa_jid_phone((string) ($crow['remoteJid'] ?? ''));
        if (!wa_is_plausible_wa_phone($cphone) || isset($seenPhones[$cphone])) {
            continue;
        }
        $seenPhones[$cphone] = true;
        $cname = trim((string) ($crow['pushName'] ?? $crow['name'] ?? ''));
        $fetched++;
        try {
            $r = $evo->fetchProfilePictureUrl($instName, $cphone . '@s.whatsapp.net');
            $sig = wa_avatar_signature((string) ($r['profilePictureUrl'] ?? ''));
        } catch (Throwable $e) {
            $sig = '';
        }
        if ($sig !== '' && !isset($sigIndex[$sig])) {
            $sigIndex[$sig] = ['phone' => $cphone, 'name' => $cname];
        }
    }
    if ($sigIndex === []) {
        return ['resolved' => 0, 'skipped' => 'no_contact_avatars', 'pending' => count($pending)];
    }

    $resolved = 0;
    foreach ($pending as $chat) {
        $chatId = (string) ($chat['id'] ?? '');
        $sig = wa_avatar_signature((string) ($chat['contact_avatar_url'] ?? ''));
        if ($sig === '') {
            try {
                $r = $evo->fetchProfilePictureUrl($instName, (string) ($chat['remote_jid'] ?? ''));
                $sig = wa_avatar_signature((string) ($r['profilePictureUrl'] ?? ''));
            } catch (Throwable $e) {
                $sig = '';
            }
        }
        if ($sig === '' || !isset($sigIndex[$sig])) {
            continue;
        }
        $hit = $sigIndex[$sig];
        // Só o NOME é gravado. Gravar contact_phone num chat @lid dispara a
        // máquina de sync a criar chats @s.whatsapp.net derivados (duplicatas),
        // então o telefone real fica apenas no índice, não no chat @lid.
        $prevName = trim((string) ($chat['contact_name'] ?? ''));
        if (!wa_is_plausible_display_name($prevName) && wa_is_plausible_display_name((string) $hit['name'])) {
            $repo->updateChatMeta($chatId, ['contact_name' => (string) $hit['name']]);
            $resolved++;
        }
    }
    wa_debug_log('lid resolve by avatar', [
        'user_tail' => substr($userId, -8),
        'pending' => count($pending),
        'contacts_fetched' => $fetched,
        'sig_index' => count($sigIndex),
        'resolved' => $resolved,
    ], 'lid-avatar');
    return ['resolved' => $resolved, 'pending' => count($pending), 'sig_index' => count($sigIndex)];
}

$action = strtolower(trim((string) ($_GET['action'] ?? $_POST['action'] ?? 'status')));
$body = wa_json_body();

wa_debug_log('action received', ['action' => $action, 'method' => $_SERVER['REQUEST_METHOD'] ?? '']);

if ($action === 'webhook') {
    try {
        $repo = soublu_whatsapp_repository();
        $payload = wa_json_body();
        $instName = (string) ($payload['instance'] ?? $payload['instanceName'] ?? $payload['instanceId'] ?? '');
        $inst = $instName !== '' ? $repo->getInstanceByName($instName) : null;
        wa_handle_webhook($repo, soublu_whatsapp_client($inst));
    } catch (PDOException $e) {
        wa_debug_log('Webhook PDOException', ['error' => $e->getMessage()], 'fatal');
        soublu_json(['ok' => false, 'error' => 'Erro interno de banco de dados.'], 500);
    } catch (Throwable $e) {
        wa_debug_log('Webhook Throwable', ['error' => $e->getMessage()], 'fatal');
        soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
    }
}

if ($action === 'webhook_wt') {
    try {
        if (!wa_webhook_auth_ok()) {
            soublu_json(['ok' => false, 'error' => 'Webhook não autorizado.'], 401);
        }
        $repo = soublu_whatsapp_repository();
        $payload = wa_json_body();
        if (!$payload) {
            soublu_json(['ok' => true, 'ignored' => true]);
        }
        wa_handle_whaticket_webhook($repo, soublu_whatsapp_client(), $payload);
    } catch (PDOException $e) {
        wa_debug_log('Webhook WT PDOException', ['error' => $e->getMessage()], 'fatal');
        soublu_json(['ok' => false, 'error' => 'Erro interno de banco de dados.'], 500);
    } catch (Throwable $e) {
        wa_debug_log('Webhook WT Throwable', ['error' => $e->getMessage()], 'fatal');
        soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
    }
}

if (!soublu_api_auth_ok()) {
    wa_debug_log('auth failed', ['action' => $action], 'H');
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

$userId = trim((string) ($_GET['user_id'] ?? $body['user_id'] ?? ''));
$pdo = soublu_pdo();
$repo = soublu_whatsapp_repository();
$evo = soublu_whatsapp_client($inst ?? null);

if ($action === 'client_log') {
    if (defined('WA_DEBUG') && WA_DEBUG === true && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $logBody = wa_json_body();
        wa_agent_debug(
            (string) ($logBody['location'] ?? 'client'),
            (string) ($logBody['message'] ?? ''),
            is_array($logBody['data'] ?? null) ? $logBody['data'] : [],
            (string) ($logBody['hypothesisId'] ?? 'A')
        );
    }
    soublu_json(['ok' => true]);
}

if ($action === 'config') {
    $inst = $userId !== '' ? $repo->getInstance($userId) : null;
    soublu_json([
        'ok' => true,
        'configured' => soublu_whatsapp_configured(),
        'provider' => soublu_whatsapp_provider($inst),
        'enabled' => match (soublu_whatsapp_provider($inst)) {
            'zapi' => !defined('Z_API_ENABLED') || Z_API_ENABLED !== false,
            'whaticket' => !defined('WHATICKET_ENABLED') || WHATICKET_ENABLED !== false,
            default => !defined('EVOLUTION_ENABLED') || EVOLUTION_ENABLED !== false,
        },
        'sync_enabled' => wa_contacts_sync_enabled(),
        'contacts_max' => wa_contacts_max(),
        'mirror_mode' => wa_mirror_mode(),
        'chats_max_age_days' => wa_chats_max_age_days(),
        'sync_cooldown_sec' => wa_contacts_cooldown_sec(),
        'wa_db_backend' => soublu_wa_db_backend(),
        'status' => $inst['status'] ?? 'close',
    ]);
}

wa_assert_user_id($userId);
$targetUserId = wa_target_user_id($userId, $body);
wa_assert_same_user($userId, $targetUserId);

if ($action === 'connect') {
    wa_debug_log('connect body parse', [
        'user_id' => $userId,
        'from_get' => $_GET['user_id'] ?? null,
        'from_body' => $body['user_id'] ?? null,
        'body_keys' => array_keys($body),
        'method' => $_SERVER['REQUEST_METHOD'] ?? '',
    ], 'B');
}

try {
    switch ($action) {
        case 'status':
            $skipQrFast = (string) ($_GET['skip_qr'] ?? '') === '1';
            $refreshQr = (string) ($_GET['refresh_qr'] ?? '') === '1';
            $wantProfile = (string) ($_GET['profile_pic'] ?? '') === '1';
            $inst = $repo->getInstance($userId);
            if ($repo->isSessionRevoked($userId) || wa_session_locked($repo, $userId, $inst)) {
                wa_debug_log('status locked session', [
                    'user_tail' => substr($userId, -8),
                    'db_revoked' => $repo->isSessionRevoked($userId),
                    'rebind' => wa_rebind_required($userId),
                    'disconnected' => wa_user_disconnected($userId),
                    'inst_status' => (string) ($inst['status'] ?? ''),
                ], 'isolate');
                wa_json_session_locked();
            }
            $rebindRequired = wa_rebind_required($userId);
            // Fast-path: poll silencioso — só MySQL, zero Evolution (evita saturar pool PHP).
            // profile_pic=1 devolve URL do proxy sem fetchProfile (imagem carrega via profile_image).
            if ($skipQrFast && !$refreshQr && !$rebindRequired && is_array($inst)) {
                $dbStatus = (string) ($inst['status'] ?? 'close');
                if (in_array($dbStatus, ['open', 'connecting', 'close'], true)) {
                    wa_status_fast_json(
                        $repo,
                        $userId,
                        $inst,
                        $dbStatus,
                        (string) ($inst['phone'] ?? ''),
                        null,
                        $wantProfile
                    );
                }
            }
            if (!$skipQrFast) {
                wa_maybe_recover_session($repo, $evo, $userId);
            }
            $inst = $repo->getInstance($userId) ?? $inst;
            $status = 'close';
            $phone = null;
            $qr = null;
            $evoRawState = '';
            $serverAutoRefresh = false;
            $instName = '';
            if (soublu_whatsapp_configured()) {
                $ready = wa_ensure_evolution_ready($repo, $evo, $userId);
                $inst = $ready['instance'];
                $instName = $ready['name'];
                wa_debug_log('evolution instance ready', [
                    'created' => $ready['created'],
                    'name' => $ready['name'],
                ], 'C');
                if ($rebindRequired) {
                    $status = 'close';
                    $phone = null;
                }
                if (!$rebindRequired) {
                    try {
                        $stateResp = $evo->connectionState($ready['name']);
                        $evoRawState = (string) ($stateResp['instance']['state'] ?? $stateResp['state'] ?? '');
                        $status = soublu_whatsapp_parse_connection_state($stateResp);
                        if ($status === 'close') {
                            try {
                                $listResp = $evo->fetchInstances();
                                $listState = soublu_whatsapp_parse_instance_list_state($listResp, $ready['name']);
                                wa_debug_log('fetchInstances check', [
                                    'list_state' => $listState,
                                    'status_before' => $status,
                                ], 'K');
                                if ($listState === 'open') {
                                    $status = 'open';
                                }
                            } catch (Throwable $eList) {
                                wa_debug_log('fetchInstances failed', ['error' => $eList->getMessage()], 'K');
                            }
                        } elseif ($status === 'connecting') {
                            try {
                                $listResp = $evo->fetchInstances();
                                $listState = soublu_whatsapp_parse_instance_list_state($listResp, $ready['name']);
                                if ($listState === 'open') {
                                    $status = 'open';
                                    $owner = (string) (
                                        $stateResp['instance']['owner']
                                        ?? $stateResp['instance']['wuid']
                                        ?? $stateResp['owner']
                                        ?? $stateResp['wuid']
                                        ?? ''
                                    );
                                    $wuidPhone = wa_phone_digits(explode('@', $owner)[0] ?: $owner);
                                    if ($wuidPhone !== '') {
                                        $phone = $wuidPhone;
                                    }
                                    wa_debug_log('connecting promoted to open via fetchInstances', [
                                        'instance' => $ready['name'],
                                    ], 'K');
                                }
                            } catch (Throwable $eList) {
                                wa_debug_log('fetchInstances connecting check failed', ['error' => $eList->getMessage()], 'K');
                            }
                        }
                        $repo->updateInstanceStatus($inst['id'], $status, $phone ?: null);
                    } catch (Throwable $e) {
                        $status = (string) ($inst['status'] ?? 'close');
                    }
                    if ($status === 'open' && $repo->isSessionRevoked($userId)) {
                        wa_debug_log('evo open blocked db revoked on status', ['user_tail' => substr($userId, -8)], 'isolate');
                        if ($instName !== '') {
                            wa_destroy_evolution_instance($evo, $instName);
                        }
                        $repo->markSessionRevoked($userId);
                        wa_json_session_locked();
                    }
                    $phone = $phone ?: ($inst['phone'] ?? null);
                }
                if ($status !== 'open' && !$refreshQr && !$skipQrFast && isset($inst) && is_array($inst) && $instName !== '') {
                    $infer = wa_infer_open_if_stale_close($evo, $repo, $instName, $inst, $status);
                    if (($infer['status'] ?? '') === 'open') {
                        $status = 'open';
                        if (!empty($infer['phone'])) {
                            $phone = wa_phone_digits((string) $infer['phone']);
                        }
                        $repo->updateInstanceStatus((string) $inst['id'], 'open', $phone ?: null);
                        wa_clear_rebind_required($userId);
                        wa_debug_log('status promoted stale close', [
                            'user_tail' => substr($userId, -8),
                            'reason' => $infer['reason'] ?? null,
                        ], 'recover');
                    }
                }
                $skipQr = (string) ($_GET['skip_qr'] ?? '') === '1';
                $qrMeta = wa_qr_meta_read($instName);
                $stuckSec = ($qrMeta['connecting_since'] ?? 0) > 0
                    ? time() - (int) $qrMeta['connecting_since']
                    : 0;
                $serverAutoRefresh = wa_should_fetch_qr_server($instName, $skipQr, $refreshQr, $status);
                if ($refreshQr && $status === 'open' && $instName !== '' && !wa_evo_has_live_chats($evo, $instName)) {
                    $status = 'close';
                }
                if ($serverAutoRefresh && ($status === 'connecting' || $status === 'close' || $refreshQr)) {
                    if ($status === 'connecting') {
                        $qrMeta = wa_recover_stuck_instance($evo, $instName, $qrMeta, $stuckSec);
                        $stuckSec = ($qrMeta['connecting_since'] ?? 0) > 0
                            ? time() - (int) $qrMeta['connecting_since']
                            : 0;
                    }
                    try {
                        $qr = wa_fetch_qr($evo, $instName);
                        if ($qr) {
                            $status = 'connecting';
                            $repo->updateInstanceStatus($inst['id'], 'connecting');
                        } else {
                            $reProbe = wa_probe_evo_connection($evo, $instName);
                            /** #region agent log */
                            wa_agent_debug('whatsapp_api.php:status', 're-probe after empty qr', [
                                'instance' => $instName,
                                'status' => $reProbe['status'],
                            ], 'C');
                            /** #endregion */
                            if (($reProbe['status'] ?? '') === 'open' && wa_evo_has_live_chats($evo, $instName)) {
                                $status = 'open';
                                $probePhone = (string) ($reProbe['phone'] ?? '');
                                if ($probePhone !== '') {
                                    $phone = $probePhone;
                                }
                                $repo->updateInstanceStatus($inst['id'], 'open', $phone ?: null);
                            }
                        }
                        wa_qr_meta_write($instName, $qr, $status);
                    } catch (Throwable $e) {
                        wa_debug_log('connect in status failed', ['error' => $e->getMessage()], 'D');
                    }
                } elseif ($status === 'open') {
                    wa_qr_meta_write($instName, null, 'open');
                }
                // Com skip_qr=1 não devolver QR em cache (polls silenciosos não devem carregar PNG).
                if (!$qr && $status === 'connecting' && !$skipQr) {
                    $cached = wa_qr_meta_read($instName);
                    if (!empty($cached['qr'])) {
                        $qr = $cached['qr'];
                    }
                }
            } elseif ($inst) {
                $status = (string) ($inst['status'] ?? 'close');
                $phone = $inst['phone'] ?? null;
            }
            // Foto do próprio perfil é buscada via fetch_profile / profile_image — não bloquear status
            // com Evolution (fetchProfile pode demorar dezenas de segundos e derrubar o painel).
            $profilePic = null;
            $wantProfile = (string) ($_GET['profile_pic'] ?? '') === '1';
            if ($wantProfile && $status === 'open' && !$rebindRequired && soublu_whatsapp_configured() && isset($inst) && is_array($inst)) {
                try {
                    $ownProf = wa_fetch_own_whatsapp_profile($evo, $inst);
                    $rawPic = trim((string) ($ownProf['pictureUrl'] ?? ''));
                    if ($rawPic !== '' && preg_match('#^https?://#i', $rawPic)) {
                        $profilePic = wa_profile_pic_proxy_url($userId);
                    } elseif ($rawPic !== '') {
                        $profilePic = $rawPic;
                    }
                    if (($phone === null || $phone === '') && ($ownProf['phone'] ?? '') !== '') {
                        $phone = $ownProf['phone'];
                    }
                } catch (Throwable $eProf) {
                    wa_debug_log('status profile_pic failed', ['error' => $eProf->getMessage()], 'profile');
                }
            }
            $dbChatCount = (!$rebindRequired && ($phone ?? '') !== '')
                ? count(wa_list_user_chats($repo, $userId))
                : 0;
            $sessionLive = false;
            $dbPhoneForLive = wa_phone_digits((string) ($phone ?? ($inst['phone'] ?? '')));
            // Preferir sinal do MySQL: evita findChats/connectionState em todo poll de status.
            if (!$rebindRequired && $status === 'open' && (wa_is_plausible_wa_phone($dbPhoneForLive) || $dbChatCount > 0)) {
                $sessionLive = true;
            } elseif (!$rebindRequired && soublu_whatsapp_configured() && isset($instName) && $instName !== ''
                && (string) ($_GET['skip_qr'] ?? '') !== '1') {
                $sessionLive = wa_session_is_live($evo, $instName);
            }
            // Só rebaixa open→close se Evolution não está open de verdade (sem phone e sem chats).
            // Evita derrubar sessão recém-pareada quando findChats ainda está vazio.
            if ($status === 'open' && !$rebindRequired && !$sessionLive) {
                if (wa_is_plausible_wa_phone($dbPhoneForLive) || $dbChatCount > 0) {
                    $sessionLive = true;
                } else {
                    wa_debug_log('status downgraded false open', [
                        'user_tail' => substr($userId, -8),
                        'instance_name' => $instName,
                        'chats_count' => $dbChatCount,
                    ], 'recover');
                    /** #region agent log */
                    wa_agent_debug('whatsapp_api.php:status', 'downgraded false open', [
                        'user_tail' => substr($userId, -8),
                        'instance' => $instName,
                    ], 'H-wa-login');
                    /** #endregion */
                    $status = 'close';
                }
            }
            wa_debug_log('status response', [
                'status' => $status,
                'session_live' => $sessionLive,
                'chats_count' => $dbChatCount,
                'qr_len' => $qr ? strlen($qr) : 0,
                'skip_qr' => (string) ($_GET['skip_qr'] ?? '') === '1',
                'refresh_qr' => $refreshQr,
                'server_auto_refresh' => !empty($serverAutoRefresh),
                'evo_raw_state' => $evoRawState,
                'user_tail' => substr($userId, -8),
                'instance_name' => $instName,
                'rebind_required' => $rebindRequired,
            ], 'G');
soublu_json([
                'ok' => true,
                'user_id' => $userId,
                'configured' => soublu_whatsapp_configured(),
                'status' => $status,
                'phone' => $phone,
                'qr' => $qr,
                'profile_pic' => $profilePic,
                'rebind_required' => $rebindRequired,
                'session_live' => $sessionLive,
                'chats_count' => $dbChatCount,
            ]);

        case 'qr':
            if (!soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution API não configurada no servidor.'], 503);
            }
            $instPre = $repo->getInstance($userId);
            $wasLocked = wa_session_locked($repo, $userId, $instPre);
            $forceQr = !empty($body['force_qr']) || (string) ($_GET['force_qr'] ?? '') === '1';
            $needFreshQr = $wasLocked || $forceQr;
            wa_unlock_user_session($repo, $userId);
            if ($needFreshQr && $instPre && soublu_whatsapp_configured()) {
                $oldName = (string) ($instPre['instance_name'] ?? '');
                if ($oldName !== '') {
                    try {
                        wa_destroy_evolution_instance($evo, $oldName);
                    } catch (Throwable $eDes) {
                        /* noop */
                    }
                    wa_qr_meta_write($oldName, null, 'close');
                }
            }
            $ready = wa_ensure_evolution_ready($repo, $evo, $userId);
            $name = $ready['name'];
            $inst = $ready['instance'];
            if (wa_session_is_live($evo, $name) && !$needFreshQr) {
                $probe = wa_probe_evo_connection($evo, $name);
                $phone = wa_phone_digits((string) ($probe['phone'] ?? ($inst['phone'] ?? '')));
                soublu_json([
                    'ok' => true,
                    'status' => 'open',
                    'phone' => $phone !== '' ? $phone : null,
                    'qr' => null,
                    'session_live' => true,
                ]);
            }
            $cached = wa_qr_meta_read($name);
            if (!$needFreshQr && !empty($cached['qr'])) {
                soublu_json([
                    'ok' => true,
                    'status' => 'connecting',
                    'qr' => $cached['qr'],
                    'cached' => true,
                ]);
            }
            if ($needFreshQr) {
                $probe = wa_probe_evo_connection($evo, $name);
                if (($probe['status'] ?? '') === 'open') {
                    try {
                        $evo->logout($name);
                    } catch (Throwable $e) {
                        /* noop */
                    }
                    usleep(200000);
                    try {
                        wa_destroy_evolution_instance($evo, $name);
                    } catch (Throwable $e2) {
                        /* noop */
                    }
                    $ready = wa_ensure_evolution_ready($repo, $evo, $userId);
                    $name = $ready['name'];
                    $inst = $ready['instance'];
                }
            }
            $repo->updateInstanceStatus((string) $inst['id'], 'connecting', null);
            try {
                $qr = wa_fetch_qr($evo, $name, 0, $needFreshQr);
            } catch (Throwable $e) {
                soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
            }
            if (($qr === null || $qr === '') && $needFreshQr) {
                $rebind = wa_rebind_fresh_evolution_instance($repo, $evo, $userId, $inst);
                $inst = $rebind['instance'];
                $name = $rebind['name'];
                $qr = $rebind['qr'];
                $repo->updateInstanceStatus((string) $inst['id'], 'connecting', null);
            }
soublu_json([
                'ok' => true,
                'status' => 'connecting',
                'qr' => $qr,
                'cached' => false,
            ]);

        case 'connect':
            if (!soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution API não configurada no servidor.'], 503);
            }
            $instPre = $repo->getInstance($userId);
            $wasLocked = wa_session_locked($repo, $userId, $instPre);
            $forceQr = !empty($body['force_qr']) || (string) ($_GET['force_qr'] ?? '') === '1';
            // Após reset/disconnect, sempre QR limpo — não reaproveitar sessão Evolution fantasma.
            $needFreshQr = $wasLocked || $forceQr;
            wa_unlock_user_session($repo, $userId);
            if ($needFreshQr && $instPre && soublu_whatsapp_configured()) {
                $oldName = (string) ($instPre['instance_name'] ?? '');
                if ($oldName !== '') {
                    try {
                        wa_destroy_evolution_instance($evo, $oldName);
                    } catch (Throwable $eDes) {
                        /* noop */
                    }
                    wa_qr_meta_write($oldName, null, 'close');
                }
            }
            $ready = wa_ensure_evolution_ready($repo, $evo, $userId);
            $inst = $ready['instance'];
            $name = $ready['name'];
            wa_debug_log('evolution instance ready', [
                'created' => $ready['created'],
                'name' => $name,
                'force_qr' => $forceQr,
                'was_locked' => $wasLocked,
                'need_fresh_qr' => $needFreshQr,
            ], 'C');
$probe = wa_probe_evo_connection($evo, $name);
            /** #region agent log */
            wa_agent_debug('whatsapp_api.php:connect', 'probe on connect', [
                'instance' => $name,
                'status' => $probe['status'],
                'force_qr' => $forceQr,
                'phone_tail' => ($probe['phone'] ?? '') !== '' ? substr((string) $probe['phone'], -4) : '',
            ], 'B');
            /** #endregion */
            if ($needFreshQr && ($probe['status'] ?? '') === 'open') {
                try {
                    $evo->logout($name);
                } catch (Throwable $e) {
                    /* noop */
                }
                usleep(200000);
                try {
                    wa_destroy_evolution_instance($evo, $name);
                } catch (Throwable $e2) {
                    /* noop */
                }
                $ready = wa_ensure_evolution_ready($repo, $evo, $userId);
                $inst = $ready['instance'];
                $name = $ready['name'];
            } elseif (!$needFreshQr && wa_session_is_live($evo, $name)) {
                $phone = (string) ($probe['phone'] ?? '');
                if ($phone === '') {
                    $phone = wa_phone_digits((string) ($inst['phone'] ?? ''));
                }
                $repo->updateInstanceStatus((string) $inst['id'], 'open', $phone !== '' ? $phone : null);
                wa_qr_meta_write($name, null, 'open');
                soublu_json([
                    'ok' => true,
                    'status' => 'open',
                    'phone' => $phone !== '' ? $phone : ($inst['phone'] ?? null),
                    'qr' => null,
                    'instance_name' => $name,
                ]);
            }
            $repo->updateInstanceStatus((string) $inst['id'], 'connecting', null);
            try {
                $qr = wa_fetch_qr($evo, $name, 0, $needFreshQr);
            } catch (Throwable $e) {
                wa_debug_log('connect fetch qr failed', ['error' => $e->getMessage()], 'D');
                /** #region agent log */
                wa_agent_debug('whatsapp_api.php:connect', 'fetch qr failed', [
                    'instance' => $name,
                    'error' => $e->getMessage(),
                ], 'D');
                /** #endregion */
                throw $e;
            }
            if (($qr === null || $qr === '') && $needFreshQr) {
                // Instância Evolution travada (logout 500 / delete 400) → nome novo + create.
                $rebind = wa_rebind_fresh_evolution_instance($repo, $evo, $userId, $inst);
                $inst = $rebind['instance'];
                $name = $rebind['name'];
                $qr = $rebind['qr'];
                $repo->updateInstanceStatus((string) $inst['id'], 'connecting', null);
            }
$repo->updateInstanceStatus($inst['id'], 'connecting');
            soublu_json([
                'ok' => true,
                'status' => 'connecting',
                'qr' => $qr,
                'instance_name' => $name,
            ]);

        case 'disconnect':
            $inst = $repo->getInstance($userId);
            if (!$inst) {
                wa_lock_user_session($repo, $userId);
                soublu_json(['ok' => true, 'status' => 'close']);
            }
            wa_lock_user_session($repo, $userId);
            if (soublu_whatsapp_configured()) {
                try {
                    $evo->logout($inst['instance_name']);
                } catch (Throwable $e) {
                    /* noop */
                }
                wa_destroy_evolution_instance($evo, (string) $inst['instance_name']);
            }
            wa_qr_meta_write((string) $inst['instance_name'], null, 'close');
            soublu_json(['ok' => true, 'status' => 'close']);

        case 'reset_session':
            $clearData = !empty($body['clear_data']) || (string) ($_GET['clear_data'] ?? '') === '1';
            $inst = $repo->getInstance($userId);
            $instanceName = $inst ? (string) $inst['instance_name'] : '';
            $destroyOk = false;
            if ($inst && soublu_whatsapp_configured()) {
                try {
                    $evo->logout($instanceName);
                } catch (Throwable $eLogout) {
                    /* noop */
                }
                $destroyOk = wa_destroy_evolution_instance($evo, $instanceName);
            }
            if ($inst) {
                wa_qr_meta_write($instanceName, null, 'close');
            }
            // Mantém lock até o usuário clicar Conectar de novo (NÃO unlock aqui).
            wa_lock_user_session($repo, $userId);
            $deleted = 0;
            if ($clearData) {
                $deleted = $repo->deleteAllChatsForUser($userId);
            }
            wa_clear_user_sync_markers($userId);
            if ($inst) {
                $repo->updateInstanceStatus((string) $inst['id'], 'close', null);
            }
wa_debug_log('reset_session', [
                'user_tail' => substr($userId, -8),
                'instance_name' => $instanceName,
                'clear_data' => $clearData,
                'deleted_chats' => $deleted,
                'rebind_required' => true,
                'destroy_ok' => $destroyOk,
            ], 'isolate');
            soublu_json([
                'ok' => true,
                'status' => 'close',
                'cleared' => $clearData,
                'deleted_chats' => $deleted,
                'rebind_required' => true,
                'session_locked' => true,
            ]);

        case 'simulate_scan':
            if (soublu_whatsapp_configured()) {
                soublu_json([
                    'ok' => false,
                    'error' => 'simulate_scan desativado com Evolution API configurada. Escaneie o QR Code real.',
                ], 400);
            }
            soublu_json(['ok' => true]);

        case 'diag_profile':
            if (!soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution não configurada.'], 503);
            }
            $inst = $repo->getInstance($userId);
            if (!$inst) {
                soublu_json(['ok' => false, 'error' => 'Sem instância.'], 404);
            }
            $chatId = trim((string) ($_GET['chat_id'] ?? $body['chat_id'] ?? ''));
            $chat = $chatId !== '' ? $repo->getChatForUser($chatId, $userId) : null;
            if (!$chat) {
                $all = wa_list_user_chats($repo, $userId);
                $chat = $all[0] ?? null;
            }
            if (!$chat) {
                soublu_json(['ok' => false, 'error' => 'Sem conversas.'], 404);
            }
            $jid = (string) ($chat['remote_jid'] ?? '');
            try {
                $resp = $evo->fetchProfile((string) $inst['instance_name'], $jid);
            } catch (Throwable $e) {
                soublu_json(['ok' => false, 'error' => $e->getMessage(), 'jid' => $jid]);
            }
            soublu_json([
                'ok' => true,
                'jid' => $jid,
                'name' => $resp['name'] ?? null,
                'wuid' => $resp['wuid'] ?? $resp['wid'] ?? null,
                'picture' => isset($resp['picture']) || isset($resp['profilePictureUrl']) ? 'yes' : null,
                'resp_keys' => array_keys($resp),
            ]);

        case 'diag_avatar':
            if (!soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution não configurada.'], 503);
            }
            $inst = $repo->getInstance($userId);
            if (!$inst) {
                soublu_json(['ok' => false, 'error' => 'Sem instância.'], 404);
            }
            $chatId = trim((string) ($_GET['chat_id'] ?? $body['chat_id'] ?? ''));
            $chat = $chatId !== '' ? $repo->getChatForUser($chatId, $userId) : null;
            if (!$chat) {
                $all = wa_list_user_chats($repo, $userId);
                $chat = $all[0] ?? null;
            }
            if (!$chat) {
                soublu_json(['ok' => false, 'error' => 'Sem conversas.'], 404);
            }
            $jid = (string) ($chat['remote_jid'] ?? '');
            try {
                $resp = $evo->fetchProfilePictureUrl((string) $inst['instance_name'], $jid);
            } catch (Throwable $e) {
                soublu_json(['ok' => false, 'error' => $e->getMessage(), 'jid' => $jid]);
            }
            soublu_json([
                'ok' => true,
                'jid' => $jid,
                'wuid' => $resp['wuid'] ?? null,
                'profilePictureUrl' => isset($resp['profilePictureUrl']) ? 'yes' : null,
                'resp_keys' => array_keys($resp),
            ]);

        case 'diag_log':
            $logFile = dirname(__DIR__) . '/debug-97c411.log';
            if (!is_file($logFile)) {
                soublu_json(['ok' => true, 'lines' => [], 'note' => 'no log file']);
            }
            $needle = trim((string) ($_GET['grep'] ?? ''));
            $all = @file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            if ($needle !== '') {
                $all = array_values(array_filter($all, static fn($l) => stripos((string) $l, $needle) !== false));
            }
            soublu_json(['ok' => true, 'lines' => array_slice($all, -40)]);

        case 'diag_lid_match':
            if (!soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution não configurada.'], 503);
            }
            $inst = $repo->getInstance($userId);
            if (!$inst) {
                soublu_json(['ok' => false, 'error' => 'Sem instância.'], 404);
            }
            $name = (string) ($inst['instance_name'] ?? '');
            $chats = wa_list_user_chats($repo, $userId);
            $contacts = [];
            try {
                $crows = wa_evolution_rows($evo->findContacts($name));
                foreach ($crows as $crow) {
                    if (!is_array($crow)) {
                        continue;
                    }
                    $cjid = (string) ($crow['remoteJid'] ?? '');
                    $cphone = wa_jid_phone($cjid);
                    if (!wa_is_plausible_wa_phone($cphone)) {
                        continue;
                    }
                    $cname = trim((string) ($crow['pushName'] ?? $crow['name'] ?? ''));
                    if (!isset($contacts[$cphone])) {
                        $contacts[$cphone] = $cname;
                    }
                }
            } catch (Throwable $e) {
                soublu_json(['ok' => false, 'error' => 'findContacts: ' . $e->getMessage()]);
            }
            $sigIndex = [];
            $avatarsFetched = 0;
            foreach ($contacts as $cphone => $cname) {
                if ($avatarsFetched >= 40) {
                    break;
                }
                $avatarsFetched++;
                try {
                    $r = $evo->fetchProfilePictureUrl($name, $cphone . '@s.whatsapp.net');
                    $sig = wa_avatar_signature((string) ($r['profilePictureUrl'] ?? ''));
                    if ($sig !== '' && !isset($sigIndex[$sig])) {
                        $sigIndex[$sig] = ['phone' => $cphone, 'name' => $cname];
                    }
                } catch (Throwable $e) {
                    // sem foto / privado — ignora
                }
            }
            $matches = [];
            foreach ($chats as $c) {
                $sig = wa_avatar_signature((string) ($c['contact_avatar_url'] ?? ''));
                if ($sig === '') {
                    $jid = (string) ($c['remote_jid'] ?? '');
                    try {
                        $r = $evo->fetchProfilePictureUrl($name, $jid);
                        $sig = wa_avatar_signature((string) ($r['profilePictureUrl'] ?? ''));
                    } catch (Throwable $e) {
                        $sig = '';
                    }
                }
                $hit = $sig !== '' ? ($sigIndex[$sig] ?? null) : null;
                $matches[] = [
                    'remote_jid' => $c['remote_jid'] ?? '',
                    'stored_name' => $c['contact_name'] ?? null,
                    'stored_phone' => $c['contact_phone'] ?? null,
                    'chat_sig' => $sig,
                    'matched_phone' => $hit['phone'] ?? null,
                    'matched_name' => $hit['name'] ?? null,
                    'phone_plausible' => isset($hit['phone']) ? wa_is_plausible_wa_phone((string) $hit['phone']) : null,
                ];
            }
            soublu_json([
                'ok' => true,
                'contacts_count' => count($contacts),
                'avatars_fetched' => $avatarsFetched,
                'sig_index_size' => count($sigIndex),
                'matches' => $matches,
            ]);

        case 'diag_messages':
            if (!soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution não configurada.'], 503);
            }
            $inst = $repo->getInstance($userId);
            if (!$inst) {
                soublu_json(['ok' => false, 'error' => 'Sem instância.'], 404);
            }
            $chatId = trim((string) ($_GET['chat_id'] ?? $body['chat_id'] ?? ''));
            $chat = $chatId !== '' ? $repo->getChatForUser($chatId, $userId) : null;
            if (!$chat) {
                $all = wa_list_user_chats($repo, $userId);
                $chat = $all[0] ?? null;
            }
            if (!$chat) {
                soublu_json(['ok' => false, 'error' => 'Sem conversas.'], 404);
            }
            $jid = (string) ($chat['remote_jid'] ?? '');
            $resp = $evo->findMessages((string) $inst['instance_name'], $jid, 10);
            $rows = $resp['messages']['records'] ?? $resp['records'] ?? wa_evolution_rows($resp);
            $msgSample = [];
            if (is_array($rows)) {
                foreach (array_slice($rows, 0, 5) as $item) {
                    if (!is_array($item)) {
                        continue;
                    }
                    $key = $item['key'] ?? [];
                    $msgSample[] = [
                        'fromMe' => wa_item_from_me($item),
                        'pushName' => $item['pushName'] ?? null,
                        'msg_push' => wa_item_message_push_name($item),
                        'remoteJid' => is_array($key) ? ($key['remoteJid'] ?? null) : null,
                        'senderPn' => is_array($key) ? ($key['senderPn'] ?? null) : null,
                    ];
                }
            }
            soublu_json([
                'ok' => true,
                'chat_id' => $chat['id'] ?? null,
                'remote_jid' => $jid,
                'msg_count' => is_array($rows) ? count($rows) : 0,
                'msg_sample' => $msgSample,
            ]);

        case 'diag_mirror':
            if (!soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution não configurada.'], 503);
            }
            $inst = $repo->getInstance($userId);
            if (!$inst) {
                soublu_json(['ok' => false, 'error' => 'Sem instância.'], 404);
            }
            $name = (string) ($inst['instance_name'] ?? '');
            $rawResp = $evo->findChats($name);
            $rows = wa_evolution_rows($rawResp);
            $sample = [];
            foreach (array_slice($rows, 0, 5) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $resolved = wa_contact_jid_from_row($row);
                $sample[] = [
                    'remoteJid' => $row['remoteJid'] ?? null,
                    'pnJid' => $row['pnJid'] ?? null,
                    'remoteJidAlt' => $row['remoteJidAlt'] ?? null,
                    'pushName' => $row['pushName'] ?? null,
                    'name' => $row['name'] ?? null,
                    'notifyName' => $row['notifyName'] ?? null,
                    'resolved_name' => wa_resolve_chat_display_name($row, []),
                    'resolved_jid' => $resolved,
                    'valid' => $resolved !== '' && wa_is_valid_contact_jid($resolved),
                    'ts_recent' => wa_row_ts_recent_enough($row),
                ];
            }
            $fetched = wa_fetch_chat_rows_from_evolution($evo, $name, wa_contacts_max());
            $index = wa_build_contact_name_index($evo, $name);
            $indexSample = [];
            $n = 0;
            foreach ($index as $k => $v) {
                if ($n++ >= 8) {
                    break;
                }
                $indexSample[] = ['key' => $k, 'name' => $v];
            }
            $contactsSample = [];
            try {
                $crows = wa_evolution_rows($evo->findContacts($name));
                foreach (array_slice($crows, 0, 8) as $crow) {
                    if (!is_array($crow)) {
                        continue;
                    }
                    $contactsSample[] = [
                        'remoteJid' => $crow['remoteJid'] ?? null,
                        'id' => $crow['id'] ?? null,
                        'pnJid' => $crow['pnJid'] ?? null,
                        'pushName' => $crow['pushName'] ?? null,
                        'name' => $crow['name'] ?? null,
                        'lookup_keys' => wa_row_lookup_keys($crow),
                    ];
                }
            } catch (Throwable $e) {
                $contactsSample = ['error' => $e->getMessage()];
            }
            soublu_json([
                'ok' => true,
                'instance_name' => $name,
                'inst_status' => $inst['status'] ?? null,
                'session_locked' => wa_session_locked($repo, $userId, $inst),
                'raw_count' => count($rows),
                'fetched_count' => count($fetched),
                'db_chats' => count(wa_list_user_chats($repo, $userId)),
                'contact_index_size' => count($index),
                'contact_index_sample' => $indexSample,
                'contacts_sample' => $contactsSample,
                'sample' => $sample,
            ]);

        case 'chats':
            $mirrorRequested = (string) ($_GET['mirror'] ?? '') === '1';
            $forceSync = (string) ($_GET['force_sync'] ?? '') === '1' || (string) ($_GET['force'] ?? '') === '1';
            $enrichMeta = (string) ($_GET['enrich'] ?? '') === '1' || $forceSync;
            $wantEvo = $mirrorRequested || $forceSync || $enrichMeta;
            if ($wantEvo) {
                wa_maybe_recover_session($repo, $evo, $targetUserId);
            }
            $inst = $repo->getInstance($targetUserId);
            if (!$inst) {
                soublu_json(['ok' => true, 'chats' => []]);
            }
            if (wa_session_locked($repo, $targetUserId, $inst)) {
                wa_debug_log('chats blocked session locked', ['user_tail' => substr($targetUserId, -8)], 'isolate');
                soublu_json([
                    'ok' => true,
                    'user_id' => $targetUserId,
                    'chats' => [],
                    'rebind_required' => true,
                    'disconnected' => true,
                ]);
            }
            $rebindRequired = wa_rebind_required($targetUserId);
            $instReady = ($inst['status'] ?? '') === 'open';
            if ($wantEvo && !$instReady) {
                $instReady = wa_instance_ready_for_action($repo, $evo, $inst, $targetUserId) !== null;
            }
            // Só espelha Evolution se o cliente pediu mirror/force — poll silencioso lê MySQL.
            $autoMirror = false;
            wa_debug_log('chats request', [
                'user_tail' => substr($targetUserId, -8),
                'mirror' => $mirrorRequested,
                'auto_mirror' => $autoMirror,
                'inst_ready' => $instReady,
                'force_sync' => $forceSync,
                'rebind_required' => $rebindRequired,
                'inst_status' => (string) ($inst['status'] ?? ''),
            ], 'isolate');
            if ($mirrorRequested && !$rebindRequired && $instReady && soublu_whatsapp_configured()) {
                try {
                    $syncInst = $repo->getInstance($targetUserId) ?? $inst;
                    $allowPrune = (string) ($_GET['prune'] ?? '') === '1';
                    $sync = wa_sync_chats_from_evolution($repo, $evo, $syncInst, $forceSync, !$forceSync, $allowPrune);
                    wa_debug_log('mirror chats pull', [
                        'user_tail' => substr($targetUserId, -8),
                        'synced' => $sync['synced'] ?? 0,
                        'skipped' => $sync['skipped'] ?? false,
                        'skip_reason' => $sync['skip_reason'] ?? null,
                        'mirror_poll' => $sync['mirror_poll'] ?? false,
                        'skipped_ghost' => $sync['skipped_ghost'] ?? 0,
                        'rows' => $sync['rows'] ?? null,
                        'total' => count($sync['chats'] ?? []),
                        'trigger' => $mirrorRequested ? 'mirror_param' : 'auto_open',
                    ], 'mirror-rt');
                } catch (Throwable $syncErr) {
                    wa_debug_log('mirror chats pull failed', [
                        'user_tail' => substr($targetUserId, -8),
                        'error' => $syncErr->getMessage(),
                    ], 'mirror-rt');
                }
            } elseif ($mirrorRequested && $rebindRequired) {
                wa_debug_log('mirror chats blocked rebind', [
                    'user_tail' => substr($targetUserId, -8),
                    'instance_name' => (string) ($inst['instance_name'] ?? ''),
                ], 'isolate');
            }
            if ($enrichMeta && $instReady && !$rebindRequired && soublu_whatsapp_configured()) {
                try {
                    $enrichInst = $repo->getInstance($targetUserId) ?? $inst;
                    // Limites conservadores: enrich em force pode saturar PHP se buscar muitas fotos.
                    wa_enrich_user_chats_metadata($repo, $evo, $enrichInst, $forceSync ? 15 : 8);
                    if ($forceSync) {
                        wa_resolve_lid_chats_by_avatar($repo, $evo, $enrichInst, 20);
                    }
                } catch (Throwable $enrichErr) {
                    wa_debug_log('chats enrich failed', [
                        'user_tail' => substr($targetUserId, -8),
                        'error' => $enrichErr->getMessage(),
                    ], 'avatar-enrich');
                }
            }
            soublu_json(['ok' => true, 'user_id' => $targetUserId, 'chats' => wa_list_user_chats_safe($repo, $targetUserId)]);

        case 'events':
            // Cursor leve: só lê marker em disco — sem MySQL/Evolution (poll ~3s no cliente).
            $since = (int) ($_GET['since'] ?? $body['since'] ?? 0);
            $ts = wa_events_ts($targetUserId);
            soublu_json([
                'ok' => true,
                'ts' => $ts,
                'changed' => $ts > $since,
            ]);

        case 'sync_contacts':
            $inst = $repo->getInstance($userId);
            if (!$inst || wa_session_locked($repo, $userId, $inst)) {
                soublu_json([
                    'ok' => true,
                    'synced' => 0,
                    'skipped' => true,
                    'skip_reason' => 'session_locked',
                    'chats' => [],
                    'rebind_required' => true,
                ]);
            }
            if (!soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution API não configurada.'], 503);
            }
            wa_recover_live_session($evo, $repo, $userId);
            $inst = $repo->getInstance($userId) ?? $inst;
            $instName = (string) ($inst['instance_name'] ?? '');
            $live = $instName !== '' && wa_session_is_live($evo, $instName);
            if (!$live && ($inst['status'] ?? '') !== 'open') {
                $existing = wa_list_user_chats($repo, $userId);
                soublu_json([
                    'ok' => true,
                    'synced' => 0,
                    'skipped' => true,
                    'skip_reason' => 'not_connected',
                    'chats' => $existing,
                    'status' => (string) ($inst['status'] ?? 'close'),
                ]);
            }
            if ($live && ($inst['status'] ?? '') !== 'open') {
                $repo->updateInstanceStatus((string) $inst['id'], 'open', $inst['phone'] ?? null);
                $inst['status'] = 'open';
            }
            $force = !empty($body['force']);
            try {
                $result = wa_sync_contacts_from_evolution($repo, $evo, $inst, $force);
            } catch (Throwable $syncErr) {
                wa_debug_log('sync_contacts failed', ['error' => $syncErr->getMessage()], 'mirror-rt');
                soublu_json([
                    'ok' => true,
                    'synced' => 0,
                    'skipped' => false,
                    'error' => $syncErr->getMessage(),
                    'chats' => wa_list_user_chats($repo, $userId),
                ]);
            }
            soublu_json([
                'ok' => true,
                'synced' => $result['synced'],
                'skipped' => $result['skipped'] ?? false,
                'chats' => $result['chats'],
            ]);

        case 'messages':
            $chatId = trim((string) ($_GET['chat_id'] ?? $body['chat_id'] ?? ''));
            if ($chatId === '') {
                soublu_json(['ok' => false, 'error' => 'chat_id obrigatório.'], 400);
            }
            $chat = $repo->getChatForUser($chatId, $targetUserId);
            if (!$chat) {
                soublu_json(['ok' => false, 'error' => 'Conversa não encontrada.'], 404);
            }
            $inst = $repo->getInstance($targetUserId);
            $rebindRequired = wa_session_locked($repo, $targetUserId, $inst);
            if ((string) ($_GET['mirror'] ?? '') === '1' && !$rebindRequired && $inst && ($inst['status'] ?? '') === 'open') {
                $pulled = wa_mirror_messages_from_evolution($repo, $evo, $inst, $chat);
                wa_debug_log('mirror messages pull', ['chat_id' => $chatId, 'imported' => $pulled], 'mirror');
                $chat = $repo->getChatForUser($chatId, $targetUserId) ?? $chat;
            }
            $repo->clearUnread($chatId);
            soublu_json([
                'ok' => true,
                'messages' => $repo->listMessages($chatId),
                'chat' => $chat,
            ]);

        case 'open_chat':
            wa_maybe_recover_session($repo, $evo, $userId);
            $phone = wa_phone_digits((string) ($body['phone'] ?? $_GET['phone'] ?? ''));
            $name = trim((string) ($body['name'] ?? $_GET['name'] ?? ''));
            if (strlen($phone) < 10) {
                soublu_json(['ok' => false, 'error' => 'Telefone inválido.'], 400);
            }
            if (!soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution API não configurada.'], 503);
            }
            $inst = $repo->getInstance($userId);
            $inst = wa_instance_ready_for_action($repo, $evo, $inst, $userId);
            if (!$inst) {
                soublu_json(['ok' => false, 'error' => 'Conecte seu WhatsApp antes de abrir conversas.'], 400);
            }
            $chat = $repo->getOrCreateChat($inst, wa_remote_jid($phone), $name !== '' ? $name : null);
            // Enrich leve e pontual (1 contato): nome/foto quando possível — sem saturar poll.
            if (is_array($chat) && !empty($chat['id'])) {
                $needsName = !wa_is_plausible_display_name(trim((string) ($chat['contact_name'] ?? '')));
                $needsPic = trim((string) ($chat['contact_avatar_url'] ?? '')) === '';
                if ($needsName || $needsPic) {
                    try {
                        wa_enrich_chat_from_profile($repo, $evo, $inst, $chat);
                        $chat = $repo->getChatForUser((string) $chat['id'], $userId) ?? $chat;
                    } catch (Throwable $eOpen) {
                        wa_debug_log('open_chat enrich failed', ['error' => $eOpen->getMessage()], 'open-chat');
                    }
                    if ($needsPic && trim((string) ($chat['contact_avatar_url'] ?? '')) === '') {
                        try {
                            wa_fetch_chat_avatar_url($repo, $evo, $inst, (string) $chat['id']);
                            $chat = $repo->getChatForUser((string) $chat['id'], $userId) ?? $chat;
                        } catch (Throwable $eAv) {
                            /* foto opcional */
                        }
                    }
                }
            }
            soublu_json(['ok' => true, 'chat' => $chat]);

        case 'fetch_profile':
            $inst = $repo->getInstance($userId);
            if (!$inst) {
                soublu_json(['ok' => false, 'error' => 'Conecte seu WhatsApp antes de carregar o perfil.'], 400);
            }
            $instOpen = (string) ($inst['status'] ?? '') === 'open';
            if (!$instOpen) {
                wa_recover_live_session($evo, $repo, $userId);
                $inst = $repo->getInstance($userId) ?? $inst;
                $instOpen = (string) ($inst['status'] ?? '') === 'open';
            }
            if (!$instOpen) {
                $instName = (string) ($inst['instance_name'] ?? '');
                $live = $instName !== '' && wa_session_is_live($evo, $instName);
                if (!$live) {
                    $ready = wa_instance_ready_for_action($repo, $evo, $inst, $userId);
                    if (!$ready) {
                        soublu_json(['ok' => false, 'error' => 'Conecte seu WhatsApp antes de carregar o perfil.'], 400);
                    }
                    $inst = $ready;
                } elseif (($inst['status'] ?? '') !== 'open') {
                    $repo->updateInstanceStatus((string) $inst['id'], 'open', $inst['phone'] ?? null);
                    $inst['status'] = 'open';
                }
            }
            try {
                $parsed = wa_fetch_own_whatsapp_profile($evo, $inst, true);
                if (($parsed['name'] ?? '') === '') {
                    try {
                        $pdo = soublu_pdo();
                        $uSt = $pdo->prepare('SELECT name FROM users WHERE id = ? LIMIT 1');
                        $uSt->execute([$userId]);
                        $uRow = $uSt->fetch(PDO::FETCH_ASSOC);
                        $crmName = trim((string) ($uRow['name'] ?? ''));
                        if ($crmName !== '') {
                            $parsed['name'] = $crmName;
                        }
                    } catch (Throwable $eUser) {
                        /* noop */
                    }
                }
                // Proxy da foto via nosso domínio — CDN WhatsApp costuma bloquear hotlink no browser.
                if (!empty($parsed['pictureUrl']) && preg_match('#^https?://#i', (string) $parsed['pictureUrl'])) {
                    $parsed['pictureUrl'] = wa_profile_pic_proxy_url($userId);
                }
                soublu_json(['ok' => true, 'profile' => $parsed]);
            } catch (Throwable $e) {
                soublu_json(['ok' => true, 'profile' => ['name' => '', 'status' => '', 'pictureUrl' => '', 'error' => $e->getMessage()]]);
            }

        case 'profile_image':
            $inst = $repo->getInstance($userId);
            if (!$inst) {
                http_response_code(404);
                exit('offline');
            }
            // Só recupera sessão se DB disser close — evita latência extra em cada <img>.
            if ((string) ($inst['status'] ?? '') !== 'open') {
                wa_recover_live_session($evo, $repo, $userId);
                $inst = $repo->getInstance($userId) ?? $inst;
            }
            try {
                $parsed = wa_fetch_own_whatsapp_profile($evo, $inst);
            } catch (Throwable $e) {
                http_response_code(502);
                exit('profile fail');
            }
            $url = trim((string) ($parsed['pictureUrl'] ?? ''));
            if ($url === '' || !preg_match('#^https?://#i', $url)) {
                http_response_code(404);
                exit('no avatar');
            }
            $bytes = wa_http_get_bytes($url, 12);
            if ($bytes === null || $bytes === '') {
                http_response_code(502);
                exit('fetch failed');
            }
            if (!headers_sent()) {
                $ctype = 'image/jpeg';
                if (str_starts_with($bytes, "\x89PNG")) {
                    $ctype = 'image/png';
                } elseif (str_starts_with($bytes, 'RIFF') && str_contains(substr($bytes, 0, 16), 'WEBP')) {
                    $ctype = 'image/webp';
                }
                header('Content-Type: ' . $ctype);
                header('Cache-Control: public, max-age=3600');
            }
            echo $bytes;
            exit;

        case 'update_profile':
            $name = trim((string) ($body['name'] ?? ''));
            $status = trim((string) ($body['status'] ?? ''));
            $picture = trim((string) ($body['picture'] ?? ''));

            $inst = $repo->getInstance($userId);
            if (!$inst || ($inst['status'] ?? '') !== 'open') {
                soublu_json(['ok' => false, 'error' => 'Conecte seu WhatsApp antes de atualizar o perfil.'], 400);
            }
            $inst = wa_instance_ready_for_action($repo, $evo, $inst, $userId);
            $instanceName = $inst['instance_name'];

            $success = false;
            $results = [];

            if ($name !== '') {
                try {
                    $evo->request('POST', '/chat/updateProfileName/' . rawurlencode($instanceName), ['name' => $name]);
                    $results['name'] = true;
                    $success = true;
                } catch (Throwable $e) {
                    $results['name'] = $e->getMessage();
                }
            }

            if ($status !== '') {
                try {
                    $evo->request('POST', '/chat/updateProfileStatus/' . rawurlencode($instanceName), ['status' => $status]);
                    $results['status'] = true;
                    $success = true;
                } catch (Throwable $e) {
                    $results['status'] = $e->getMessage();
                }
            }

            if ($picture !== '') {
                try {
                    // Remove data:image/... prefix if it exists
                    if (strpos($picture, 'base64,') !== false) {
                        $picture = substr($picture, strpos($picture, 'base64,') + 7);
                    }
                    $evo->request('POST', '/chat/updateProfilePicture/' . rawurlencode($instanceName), ['picture' => $picture]);
                    $results['picture'] = true;
                    $success = true;
                } catch (Throwable $e) {
                    $results['picture'] = $e->getMessage();
                }
            }

            if (!$success && ($name !== '' || $status !== '' || $picture !== '')) {
                soublu_json(['ok' => false, 'error' => 'Não foi possível atualizar as informações. Detalhes: ' . json_encode($results)], 400);
            }

            soublu_json(['ok' => true, 'results' => $results]);

        case 'update_contact':
            // Renomeia o contato localmente (apelido no CRM). Não altera o WhatsApp do contato.
            $chatId = trim((string) ($body['chat_id'] ?? ''));
            $newName = trim((string) ($body['name'] ?? ''));
            if ($chatId === '') {
                soublu_json(['ok' => false, 'error' => 'chat_id obrigatório.'], 400);
            }
            if ($newName === '') {
                soublu_json(['ok' => false, 'error' => 'Informe um nome para o contato.'], 400);
            }
            if (mb_strlen($newName) > 80) {
                $newName = mb_substr($newName, 0, 80);
            }
            $chat = $repo->getChatForUser($chatId, $targetUserId);
            if (!$chat) {
                soublu_json(['ok' => false, 'error' => 'Conversa não encontrada.'], 404);
            }
            // name_locked é opcional: se a coluna não existir no schema, o rename
            // ainda funciona (só perde a proteção contra sobrescrita pelo sync).
            try {
                $repo->updateChatMeta($chatId, [
                    'contact_name' => $newName,
                    'name_locked' => 1,
                ]);
            } catch (Throwable $e) {
                $repo->updateChatMeta($chatId, ['contact_name' => $newName]);
            }
            wa_debug_log('contact renamed', [
                'chat_id' => $chatId,
                'new_name' => $newName,
            ], 'rename');
            soublu_json([
                'ok' => true,
                'chat_id' => $chatId,
                'contact_name' => $newName,
                'chats' => $repo->listChats($targetUserId),
            ]);

        case 'update_stage':
            $chatId = trim((string) ($body['chat_id'] ?? ''));
            $stage = trim((string) ($body['stage'] ?? ''));
            if ($chatId === '' || $stage === '') {
                soublu_json(['ok' => false, 'error' => 'chat_id e stage obrigatórios.'], 400);
            }
            $chat = $repo->getChatForUser($chatId, $targetUserId);
            if (!$chat) {
                soublu_json(['ok' => false, 'error' => 'Conversa não encontrada.'], 404);
            }
            $repo->updateChatMeta($chatId, ['kanban_stage' => $stage]);
            wa_bump_events($targetUserId);
            $updated = $repo->getChatForUser($chatId, $targetUserId);
            soublu_json([
                'ok' => true,
                'chat_id' => $chatId,
                'stage' => $stage,
                'kanban_stage' => (string) ($updated['kanban_stage'] ?? $stage),
            ]);

        case 'update_deal_info':
            $chatId = $_POST['chat_id'] ?? $body['chat_id'] ?? '';
            $dealValue = $_POST['deal_value'] ?? $body['deal_value'] ?? null;
            $dealTags = $_POST['deal_tags'] ?? $body['deal_tags'] ?? null;
            $nextActionAt = $_POST['next_action_at'] ?? $body['next_action_at'] ?? null;
            
            if ($chatId === '') {
                echo json_encode(['ok' => false, 'error' => 'Missing chat_id']);
                exit;
            }
            
            $sql = 'UPDATE whatsapp_chats SET updated_at = NOW()';
            $params = [];
            if ($dealValue !== null) {
                $sql .= ', deal_value = ?';
                $params[] = $dealValue === '' ? null : $dealValue;
            }
            if ($dealTags !== null) {
                $sql .= ', deal_tags = ?';
                $params[] = $dealTags;
                // Stage só muda por update_stage (drag/select manual) — tags não auto-movem kanban.
            }
            if ($nextActionAt !== null) {
                $sql .= ', next_action_at = ?';
                $params[] = $nextActionAt === '' ? null : $nextActionAt;
            }
            $sql .= ' WHERE id = ? AND user_id = ?';
            $params[] = $chatId;
            $params[] = $userId;
            
            $st = $pdo->prepare($sql);
            $st->execute($params);
            
            echo json_encode(['ok' => true]);
            exit;

        case 'sync_avatars':
        case 'avatar_image':
            $chatId = trim((string) ($_GET['chat_id'] ?? ''));
            if ($chatId === '') {
                http_response_code(400);
                exit('chat_id obrigatório');
            }
            $inst = $repo->getInstance($userId);
            $inst = wa_instance_ready_for_action($repo, $evo, $inst, $userId);
            if (!$inst) {
                http_response_code(404);
                exit('offline');
            }
            $chat = $repo->getChatForUser($chatId, $userId);
            if (!$chat) {
                http_response_code(404);
                exit('not found');
            }
            $url = trim((string) ($chat['contact_avatar_url'] ?? ''));
            if ($url === '') {
                $url = (string) (wa_fetch_chat_avatar_url($repo, $evo, $inst, $chatId) ?? '');
            }
            if ($url === '') {
                try {
                    $prof = $evo->fetchProfile((string) $inst['instance_name'], (string) ($chat['remote_jid'] ?? ''));
                    $url = trim((string) ($prof['picture'] ?? $prof['profilePictureUrl'] ?? ''));
                    if ($url !== '') {
                        $repo->updateChatMeta($chatId, ['contact_avatar_url' => $url]);
                    }
                } catch (Throwable $e) {
                    /* noop */
                }
            }
            if ($url === '') {
                // Evita 404 no console do browser: PNG 1x1 transparente + cache curto.
                $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', true);
                if (!headers_sent()) {
                    header('Content-Type: image/png');
                    header('Cache-Control: private, max-age=3600');
                    header('X-WA-Avatar: none');
                }
                echo is_string($png) ? $png : '';
                exit;
            }
            $bytes = wa_http_get_bytes($url, 20);
            if ($bytes === null || $bytes === '') {
                http_response_code(502);
                exit('fetch failed');
            }
            if (!headers_sent()) {
                header('Content-Type: image/jpeg');
                header('Cache-Control: public, max-age=86400');
            }
            echo $bytes;
            exit;

        case 'contact_avatar':
            $inst = $repo->getInstance($userId);
            $inst = wa_instance_ready_for_action($repo, $evo, $inst, $userId);
            if (!$inst) {
                soublu_json(['ok' => false, 'error' => 'WhatsApp desconectado.'], 400);
            }
            if (!soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution API não configurada.'], 503);
            }
            $chatId = trim((string) ($body['chat_id'] ?? $_GET['chat_id'] ?? ''));
            if ($chatId === '') {
                soublu_json([
                    'ok' => true,
                    'synced' => 0,
                    'mirror' => wa_mirror_mode(),
                    'message' => 'Modo espelho: foto só ao abrir a conversa.',
                    'chats' => $repo->listChats($userId),
                ]);
            }
            $avatarUrl = wa_fetch_chat_avatar_url($repo, $evo, $inst, $chatId);
            soublu_json([
                'ok' => true,
                'synced' => $avatarUrl ? 1 : 0,
                'avatar_url' => $avatarUrl,
                'chat_id' => $chatId,
                'chats' => $repo->listChats($userId),
            ]);

        case 'repair_media':
            $messageId = trim((string) ($body['message_id'] ?? ''));
            if ($messageId === '') {
                soublu_json(['ok' => false, 'error' => 'message_id obrigatório.'], 400);
            }
            $msg = $repo->getMessageForUser($messageId, $userId);
            if (!$msg) {
                soublu_json(['ok' => false, 'error' => 'Mensagem não encontrada.'], 404);
            }
            if (!empty($msg['media_url'])) {
                soublu_json(['ok' => true, 'media_url' => $msg['media_url']]);
            }
            $inst = $repo->getInstance($userId);
            if (!$inst || !soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution API indisponível.'], 503);
            }
            wa_recover_live_session($evo, $repo, $userId);
            $inst = $repo->getInstance($userId) ?? $inst;
            $waId = (string) ($msg['wa_message_id'] ?? '');
            if ($waId === '') {
                soublu_json(['ok' => false, 'error' => 'Mensagem sem ID Evolution.'], 400);
            }
            $type = (string) ($msg['message_type'] ?? 'text');
            $remoteJid = (string) ($msg['remote_jid'] ?? '');
            $fullItem = null;
            $payload = [];

            // Preferir raw_payload salvo (webhook/espelho) — evita findMessages pesado.
            if (!empty($msg['raw_payload'])) {
                $decoded = json_decode((string) $msg['raw_payload'], true);
                if (is_array($decoded)) {
                    $decoded = wa_unwrap_message($decoded);
                    $payload = [
                        'key' => [
                            'remoteJid' => $remoteJid,
                            'fromMe' => ($msg['direction'] ?? '') === 'out',
                            'id' => $waId,
                        ],
                        'message' => $decoded,
                    ];
                }
            }

            // Sem payload útil: busca seletiva na Evolution (limit curto — pool PHP).
            $needsFind = empty($payload)
                || empty($payload['message'])
                || !is_array($payload['message'])
                || $payload['message'] === [];
            if ($needsFind && $remoteJid !== '') {
                try {
                    $resp = $evo->findMessages((string) $inst['instance_name'], $remoteJid, 40);
                    $rows = $resp['messages']['records'] ?? $resp['records'] ?? wa_evolution_rows($resp);
                    if (is_array($rows)) {
                        foreach ($rows as $item) {
                            if (!is_array($item)) {
                                continue;
                            }
                            $id = (string) (($item['key']['id'] ?? null) ?? ($item['id'] ?? ''));
                            if ($id !== '' && hash_equals($waId, $id)) {
                                $fullItem = $item;
                                break;
                            }
                        }
                    }
                } catch (Throwable $eFind) {
                    wa_debug_log('repair_media findMessages failed', ['error' => $eFind->getMessage()], 'sticker-media');
                }
            }
            if ($fullItem) {
                $payload = $fullItem;
            }
            if (empty($payload)) {
                $payload = [
                    'key' => [
                        'remoteJid' => $remoteJid,
                        'fromMe' => ($msg['direction'] ?? '') === 'out',
                        'id' => $waId,
                    ],
                    'message' => [],
                ];
            }
            if (empty($payload['message']) || !is_array($payload['message'])) {
                $payload['message'] = [];
                if ($type === 'audio') {
                    $payload['message']['audioMessage'] = [];
                } elseif ($type === 'image') {
                    $payload['message']['imageMessage'] = [];
                } elseif ($type === 'sticker') {
                    $payload['message']['stickerMessage'] = [];
                } elseif ($type === 'video') {
                    $payload['message']['videoMessage'] = [];
                }
            }
            $saved = null;
            $hasUsefulPayload = $fullItem || (!empty($msg['raw_payload']) && !empty($payload['message']));
            if ($hasUsefulPayload) {
                $saved = wa_extract_incoming_media($payload, $userId, $evo, (string) $inst['instance_name'], $type);
            }
            if ($saved === null) {
                $dl = null;
                foreach ([($msg['direction'] ?? '') === 'out', ($msg['direction'] ?? '') !== 'out'] as $fromMeTry) {
                    $payload['key']['fromMe'] = $fromMeTry;
                    try {
                        $dl = $evo->getBase64FromMediaMessage($inst['instance_name'], $payload, $type === 'video');
                        if ($dl && !empty($dl['base64'])) {
                            break;
                        }
                    } catch (Throwable $e) {
                        $dl = null;
                    }
                }
                if (!$dl || empty($dl['base64'])) {
                    soublu_json(['ok' => false, 'error' => 'Não foi possível baixar a mídia.'], 404);
                }
                $binary = base64_decode((string) $dl['base64'], true);
                if ($binary === false || $binary === '') {
                    soublu_json(['ok' => false, 'error' => 'Mídia inválida.'], 500);
                }
                $saved = wa_save_media_bytes($userId, $binary, $dl['mimetype'] ?? null);
            }
            if ($saved === null) {
                soublu_json(['ok' => false, 'error' => 'Falha ao salvar mídia.'], 500);
            }
            $repo->updateMessageMediaUrl($messageId, $saved);
            soublu_json(['ok' => true, 'media_url' => $saved]);

        case 'send':
            $instPre = $repo->getInstance($userId);
            if (!$instPre || ($instPre['status'] ?? '') !== 'open') {
                wa_maybe_recover_session($repo, $evo, $userId);
            }
            $text = trim((string) ($body['text'] ?? $body['caption'] ?? ''));
            $chatId = trim((string) ($body['chat_id'] ?? ''));
            $phone = wa_phone_digits((string) ($body['phone'] ?? ''));
            $mediaType = strtolower(trim((string) ($body['media_type'] ?? '')));
            $mediaPath = trim((string) ($body['media_url'] ?? ''));
            $mimetype = trim((string) ($body['mimetype'] ?? ''));
            $fileName = trim((string) ($body['file_name'] ?? ''));
            if ($mimetype !== '' && str_contains($mimetype, ';')) {
                $mimetype = trim(explode(';', $mimetype, 2)[0]);
            }

            if ($text === '' && $mediaPath === '') {
                soublu_json(['ok' => false, 'error' => 'Mensagem vazia.'], 400);
            }
            if (!soublu_whatsapp_configured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution API não configurada.'], 503);
            }
            $inst = $repo->getInstance($userId);
            $inst = wa_instance_ready_for_action($repo, $evo, $inst, $userId);
            if (!$inst) {
                soublu_json(['ok' => false, 'error' => 'WhatsApp desconectado. Gere um novo QR Code.'], 400);
            }
            $chat = null;
            if ($chatId !== '') {
                $chat = $repo->getChatForUser($chatId, $userId);
            } elseif ($phone !== '') {
                $chat = $repo->getOrCreateChat($inst, wa_remote_jid($phone), null);
            }
            if (!$chat) {
                soublu_json(['ok' => false, 'error' => 'Conversa não encontrada.'], 404);
            }
            $sendPhone = wa_resolve_send_target($chat);
            if ($sendPhone === '') {
                soublu_json(['ok' => false, 'error' => 'Destino da conversa inválido.'], 400);
            }
$waId = '';
            $msgType = 'text';
            $storedMedia = null;

            if ($mediaPath !== '') {
                $local = wa_resolve_local_media($mediaPath);
                $publicUrl = wa_public_media_url($mediaPath);
                $mediaPayload = $local !== null ? 'data:' . ($mimetype !== '' ? $mimetype : 'application/octet-stream') . ';base64,' . base64_encode($local) : $publicUrl;
                if ($mediaType === 'sticker') {
                    $evoResp = $evo->sendSticker($inst['instance_name'], $sendPhone, $mediaPayload);
                    $msgType = 'sticker';
                    $text = $text !== '' ? $text : '[Figurinha]';
                    $storedMedia = ltrim(preg_replace('#^uploads/#', '', str_replace('\\', '/', $mediaPath)) ?? $mediaPath, '/');
                } elseif ($mediaType === 'audio') {
                    $audioMime = wa_normalize_send_audio_mimetype($mimetype, $fileName);
                    $publicUrl = wa_public_media_url($mediaPath);
                    // Base64 primeiro: URL pública na Locaweb às vezes não é alcançável pela Evolution.
                    $payloads = [];
                    if ($local !== null && $local !== '') {
                        $payloads[] = 'data:' . $audioMime . ';base64,' . base64_encode($local);
                    }
                    if ($publicUrl !== '') {
                        $payloads[] = $publicUrl;
                    }
                    if ($payloads === []) {
                        soublu_json(['ok' => false, 'error' => 'Arquivo de áudio não encontrado no servidor.'], 400);
                    }
                    wa_debug_log('send audio', [
                        'chat_id' => $chatId,
                        'media_path' => $mediaPath,
                        'has_local' => $local !== null,
                        'mimetype' => $audioMime,
                        'bytes' => $local !== null ? strlen($local) : 0,
                        'payload_kinds' => array_map(static fn (string $p): string => str_starts_with($p, 'data:') ? 'base64' : 'url', $payloads),
                    ], 'audio');
                    $evoResp = null;
                    $audioErr = null;
                    foreach ($payloads as $mediaPayload) {
                        try {
                            $evoResp = $evo->sendWhatsAppAudio(
                                $inst['instance_name'],
                                $sendPhone,
                                $mediaPayload,
                                $audioMime
                            );
                            break;
                        } catch (Throwable $e) {
                            $audioErr = $e;
                            wa_debug_log('sendWhatsAppAudio failed', [
                                'error' => $e->getMessage(),
                                'payload_kind' => str_starts_with($mediaPayload, 'data:') ? 'base64' : 'url',
                                'mimetype' => $audioMime,
                            ], 'audio');
                        }
                    }
                    // Retry PTT sem mimetype (algumas builds Evolution rejeitam webm explícito).
                    if ($evoResp === null && $audioMime !== '') {
                        foreach ($payloads as $mediaPayload) {
                            try {
                                $evoResp = $evo->sendWhatsAppAudio(
                                    $inst['instance_name'],
                                    $sendPhone,
                                    $mediaPayload,
                                    null
                                );
                                break;
                            } catch (Throwable $e) {
                                $audioErr = $e;
                            }
                        }
                    }
                    if ($evoResp === null) {
                        try {
                            $fallbackPayload = $payloads[0];
                            $fallbackName = $fileName !== '' ? $fileName : ('audio.' . (str_contains($audioMime, 'ogg') ? 'ogg' : (str_contains($audioMime, 'webm') ? 'webm' : 'ogg')));
                            $evoResp = $evo->sendMedia(
                                $inst['instance_name'],
                                $sendPhone,
                                'audio',
                                $fallbackPayload,
                                $audioMime,
                                null,
                                $fallbackName
                            );
                        } catch (Throwable $mediaErr) {
                            $msg = $audioErr?->getMessage() ?: $mediaErr->getMessage();
                            wa_debug_log('send audio all failed', ['error' => $msg], 'audio');
                            soublu_json(['ok' => false, 'error' => 'Falha ao enviar áudio: ' . $msg], 502);
                        }
                    }
                    $msgType = 'audio';
                    if ($text === '') {
                        $text = '[Áudio]';
                    }
                    $storedMedia = ltrim(preg_replace('#^uploads/#', '', str_replace('\\', '/', $mediaPath)) ?? $mediaPath, '/');
                } else {
                    $mediatype = match ($mediaType) {
                        'video' => 'video',
                        default => 'image',
                    };
                    $evoResp = $evo->sendMedia(
                        $inst['instance_name'],
                        $sendPhone,
                        $mediatype,
                        $mediaPayload,
                        $mimetype !== '' ? $mimetype : null,
                        $text !== '' ? $text : null,
                        $fileName !== '' ? $fileName : null
                    );
                    $msgType = $mediatype;
                    if ($text === '') {
                        $text = $mediatype === 'video' ? '[Vídeo]' : '[Imagem]';
                    }
                    $storedMedia = ltrim(preg_replace('#^uploads/#', '', str_replace('\\', '/', $mediaPath)) ?? $mediaPath, '/');
                }
                $waId = (string) ($evoResp['key']['id'] ?? $evoResp['messageId'] ?? '');
} else {
                $evoResp = $evo->sendText($inst['instance_name'], $sendPhone, $text);
                $waId = (string) ($evoResp['key']['id'] ?? $evoResp['messageId'] ?? '');
            }

            $msg = $repo->insertMessage(
                $chat,
                $inst,
                'out',
                $text,
                $waId !== '' ? $waId : null,
                $msgType,
                $storedMedia
            );
            wa_bump_events($userId);
            soublu_json(['ok' => true, 'message' => $msg, 'chat_id' => $chat['id']]);

        case 'delete_message':
            $messageId = trim((string) ($body['message_id'] ?? $_GET['message_id'] ?? ''));
            if ($messageId === '') {
                soublu_json(['ok' => false, 'error' => 'message_id obrigatório.'], 400);
            }
            $msg = $repo->getMessageForUser($messageId, $userId);
            if (!$msg) {
                soublu_json(['ok' => false, 'error' => 'Mensagem não encontrada.'], 404);
            }
            if (($msg['direction'] ?? '') !== 'out') {
                soublu_json(['ok' => false, 'error' => 'Só é possível apagar mensagens enviadas por você.'], 403);
            }
            $evoRevoked = false;
            $waId = trim((string) ($msg['wa_message_id'] ?? ''));
            $remoteJid = trim((string) ($msg['remote_jid'] ?? ''));
            if ($waId !== '' && $remoteJid !== '' && soublu_whatsapp_configured()) {
                $inst = $repo->getInstance($userId);
                if ($inst && ($inst['status'] ?? '') === 'open') {
                    try {
                        $evo->deleteMessageForEveryone($inst['instance_name'], $waId, $remoteJid, true);
                        $evoRevoked = true;
                    } catch (Throwable $delErr) {
                        wa_debug_log('delete message evolution failed', [
                            'error' => $delErr->getMessage(),
                            'message_id' => $messageId,
                        ], 'delete-msg');
                    }
                }
            }
            if (!$repo->deleteMessageForUser($messageId, $userId)) {
                soublu_json(['ok' => false, 'error' => 'Não foi possível apagar a mensagem.'], 500);
            }
            wa_debug_log('delete message ok', [
                'message_id' => $messageId,
                'chat_id' => $msg['chat_id'] ?? null,
                'evo_revoked' => $evoRevoked,
            ], 'delete-msg');
            wa_bump_events($userId);
            soublu_json([
                'ok' => true,
                'deleted' => true,
                'revoked_whatsapp' => $evoRevoked,
                'chat_id' => $msg['chat_id'] ?? null,
            ]);

        case 'get_users':
            $st = $pdo->prepare(
                'SELECT u.id, u.nome, i.status
                 FROM rh_employees u
                 LEFT JOIN whatsapp_instances i ON u.id = i.user_id
                 WHERE u.status = \'ativo\' OR i.status IS NOT NULL'
            );
            $st->execute();
            soublu_json(['ok' => true, 'data' => $st->fetchAll(PDO::FETCH_ASSOC) ?: []]);

        /** One-shot: desconecta TODAS as instâncias e apaga chats do CRM. Requer confirm=1. */
        case 'admin_reset_all_wa':
            $confirm = (string) ($_GET['confirm'] ?? $body['confirm'] ?? '') === '1';
            if (!$confirm) {
                soublu_json(['ok' => false, 'error' => 'Passe confirm=1 para executar.'], 400);
            }
            $rows = [];
            try {
                $st = $pdo->query('SELECT id, user_id, instance_name, status, phone FROM whatsapp_instances ORDER BY updated_at DESC');
                $rows = $st ? ($st->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
            } catch (Throwable $eList) {
                soublu_json(['ok' => false, 'error' => 'Falha ao listar instâncias: ' . $eList->getMessage()], 500);
            }
            $results = [];
            $totalDeleted = 0;
            foreach ($rows as $row) {
                $uid = trim((string) ($row['user_id'] ?? ''));
                if ($uid === '') {
                    continue;
                }
                $instanceName = (string) ($row['instance_name'] ?? '');
                $destroyOk = false;
                if ($instanceName !== '' && soublu_whatsapp_configured()) {
                    try {
                        $destroyOk = wa_destroy_evolution_instance($evo, $instanceName);
                    } catch (Throwable $eDes) {
                        $destroyOk = false;
                    }
                    try {
                        wa_qr_meta_write($instanceName, null, 'close');
                    } catch (Throwable $eQr) {
                        /* noop */
                    }
                }
                wa_lock_user_session($repo, $uid);
                $deleted = 0;
                try {
                    $deleted = $repo->deleteAllChatsForUser($uid);
                } catch (Throwable $eDel) {
                    $deleted = 0;
                }
                $totalDeleted += $deleted;
                try {
                    wa_clear_user_sync_markers($uid);
                } catch (Throwable $eMk) {
                    /* noop */
                }
                try {
                    $instId = (string) ($row['id'] ?? '');
                    if ($instId !== '') {
                        $repo->updateInstanceStatus($instId, 'close', null);
                    }
                } catch (Throwable $eUp) {
                    /* noop */
                }
                // Mantém lock — não unlock (evita reabrir sozinho via Evolution).
                $results[] = [
                    'user_id' => $uid,
                    'instance_name' => $instanceName,
                    'prev_status' => (string) ($row['status'] ?? ''),
                    'deleted_chats' => $deleted,
                    'destroy_ok' => $destroyOk,
                    'locked' => true,
                ];
            }
            wa_debug_log('admin_reset_all_wa', [
                'count' => count($results),
                'deleted_chats_total' => $totalDeleted,
                'by' => substr($userId, -8),
            ], 'isolate');
            soublu_json([
                'ok' => true,
                'reset_count' => count($results),
                'deleted_chats_total' => $totalDeleted,
                'results' => $results,
            ]);

        /** Lista instâncias WA + nome do usuário (debug isolamento). */
        case 'admin_list_wa_instances':
            $out = [];
            try {
                $st = $pdo->query('SELECT id, user_id, instance_name, phone, status, updated_at FROM whatsapp_instances ORDER BY updated_at DESC');
                $rows = $st ? ($st->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
            } catch (Throwable $e) {
                soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
            }
            $nameById = [];
            try {
                $ust = $pdo->query('SELECT id, name, email, role FROM users');
                foreach (($ust ? $ust->fetchAll(PDO::FETCH_ASSOC) : []) as $u) {
                    $nameById[(string) ($u['id'] ?? '')] = $u;
                }
            } catch (Throwable $eUsers) {
                /* users table may differ */
            }
            foreach ($rows as $row) {
                $uid = (string) ($row['user_id'] ?? '');
                $u = $nameById[$uid] ?? null;
                $chats = 0;
                try {
                    $chats = $repo->countChats($uid, false);
                } catch (Throwable $eC) {
                    $chats = -1;
                }
                $out[] = [
                    'user_id' => $uid,
                    'name' => $u['name'] ?? null,
                    'email' => $u['email'] ?? null,
                    'role' => $u['role'] ?? null,
                    'instance_name' => $row['instance_name'] ?? null,
                    'phone' => $row['phone'] ?? null,
                    'status' => $row['status'] ?? null,
                    'chats_count' => $chats,
                    'updated_at' => $row['updated_at'] ?? null,
                    'rebind' => wa_rebind_required($uid),
                    'disconnected' => wa_user_disconnected($uid),
                    'revoked' => $repo->isSessionRevoked($uid),
                ];
            }
            soublu_json(['ok' => true, 'instances' => $out]);

        default:
            soublu_json(['ok' => false, 'error' => 'Ação inválida.'], 400);
    }
} catch (PDOException $e) {
    wa_debug_log('Global PDOException', ['error' => $e->getMessage()], 'fatal');
    soublu_json(['ok' => false, 'error' => 'Erro interno de banco de dados.'], 500);
} catch (Throwable $e) {
    wa_debug_log('Global Throwable', ['error' => $e->getMessage()], 'fatal');
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
