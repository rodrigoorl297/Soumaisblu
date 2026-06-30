<?php
/**
 * SOU+BLU — WhatsApp via Evolution API (1 número por perfil).
 *
 * Actions: config | status | connect | disconnect | chats | sync_contacts | messages |
 *          send | open_chat | update_stage | repair_media | sync_avatars | simulate_scan | webhook
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/EvolutionClient.php';
require_once __DIR__ . '/lib/WhatsAppRepository.php';
require_once __DIR__ . '/lib/FileStorage.php';

$evoConfig = dirname(__DIR__) . '/config.evolution.local.php';
if (is_file($evoConfig)) {
    require_once $evoConfig;
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
    $logFile = dirname(__DIR__) . '/debug-97c411.log';
    $entry = json_encode([
        'sessionId' => '97c411',
        'hypothesisId' => $hypothesisId,
        'location' => 'whatsapp_api.php',
        'message' => $message,
        'data' => $data,
        'timestamp' => (int) (microtime(true) * 1000),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    @file_put_contents($logFile, $entry . PHP_EOL, FILE_APPEND);
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
    $secret = defined('EVOLUTION_WEBHOOK_SECRET') ? (string) EVOLUTION_WEBHOOK_SECRET : '';
    $q = 'action=webhook';
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
        return defined('WA_CONTACTS_MAX') ? max(1, (int) WA_CONTACTS_MAX) : 150;
    }
    return defined('WA_CONTACTS_MAX') ? max(1, (int) WA_CONTACTS_MAX) : 500;
}

function wa_contacts_cooldown_sec(): int
{
    if (wa_mirror_mode()) {
        return defined('WA_CONTACTS_COOLDOWN_SEC') ? max(10, (int) WA_CONTACTS_COOLDOWN_SEC) : 30;
    }
    return defined('WA_CONTACTS_COOLDOWN_SEC') ? max(0, (int) WA_CONTACTS_COOLDOWN_SEC) : 3600;
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

/** Garante linha em whatsapp_instances e instância na Evolution (mesma lógica do connect). */
function wa_ensure_evolution_ready(WhatsAppRepository $repo, EvolutionClient $evo, string $userId): array
{
    $inst = $repo->ensureInstance($userId, wa_instance_name($userId));
    $name = (string) $inst['instance_name'];
    $created = false;
    try {
        $evo->connectionState($name);
    } catch (Throwable $e) {
        try {
            $evo->createInstance($name, wa_webhook_url());
            $created = true;
        } catch (Throwable $e2) {
            try {
                $evo->setWebhook($name, wa_webhook_url());
            } catch (Throwable $e3) {
                /* já existe */
            }
        }
    }
    return ['instance' => $inst, 'name' => $name, 'created' => $created];
}

function wa_fetch_qr(EvolutionClient $evo, string $instanceName, int $attempt = 0): ?string
{
    $conn = $evo->connect($instanceName);
    $qr = EvolutionClient::extractQr($conn);
    if ($qr === null && $attempt < 1) {
        wa_debug_log('QR empty, logout retry', ['name' => $instanceName], 'L');
        try {
            $evo->logout($instanceName);
        } catch (Throwable $e) {
            /* instância pode já estar limpa */
        }
        return wa_fetch_qr($evo, $instanceName, 1);
    }
    wa_debug_log('QR extraction', [
        'qr_present' => $qr !== null,
        'conn_keys' => array_keys($conn),
        'attempt' => $attempt,
    ], 'D');
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
    EvolutionClient $evo,
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
    if (!$skipQr || $refreshQr) {
        return true;
    }
    $meta = wa_qr_meta_read($instanceName);
    if (($meta['qr'] ?? null) === null) {
        return true;
    }
    return time() - (int) ($meta['ts'] ?? 0) > 25;
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
    return $ts > 0 && (time() - $ts) < 8;
}

function wa_mark_mirror_poll(string $userId): void
{
    @file_put_contents(wa_mirror_poll_marker_path($userId), (string) time());
}

function wa_clear_user_sync_markers(string $userId): void
{
    @unlink(wa_sync_marker_path($userId));
    @unlink(wa_mirror_poll_marker_path($userId));
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

function wa_try_clear_rebind_if_evo_open(EvolutionClient $evo, WhatsAppRepository $repo, array $instance): bool
{
    $userId = (string) ($instance['user_id'] ?? '');
    if ($userId === '' || !wa_rebind_required($userId)) {
        return false;
    }
    $name = (string) ($instance['instance_name'] ?? '');
    if ($name === '') {
        return false;
    }
    try {
        $stateResp = $evo->connectionState($name);
        $status = EvolutionClient::parseConnectionState($stateResp);
        if ($status !== 'open') {
            try {
                $listResp = $evo->fetchInstances();
                $listState = EvolutionClient::parseInstanceListState($listResp, $name);
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
        $repo->updateInstanceStatus((string) $instance['id'], 'open', $phone !== '' ? $phone : null);
        wa_qr_meta_write($name, null, 'open');
        wa_debug_log('rebind cleared evo open', [
            'user_tail' => substr($userId, -8),
            'instance_name' => $name,
            'phone_tail' => $phone !== '' ? substr($phone, -4) : '',
        ], 'isolate');
        return true;
    } catch (Throwable $e) {
        wa_debug_log('rebind clear probe failed', ['error' => $e->getMessage()], 'isolate');
        return false;
    }
}

function wa_destroy_evolution_instance(EvolutionClient $evo, string $instanceName): bool
{
    $logoutOk = true;
    $deleteOk = true;
    try {
        $evo->logout($instanceName);
    } catch (Throwable $e) {
        $logoutOk = false;
        wa_debug_log('destroy logout failed', ['name' => $instanceName], 'isolate');
    }
    try {
        $evo->deleteInstance($instanceName);
    } catch (Throwable $e) {
        $deleteOk = false;
        wa_debug_log('destroy deleteInstance failed', ['name' => $instanceName], 'isolate');
    }
    $ok = $logoutOk && $deleteOk;
    wa_debug_log('destroy evolution instance', ['name' => $instanceName, 'ok' => $ok], 'isolate');
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
        || str_contains($jid, '@lid')
        || str_starts_with($jid, 'status@')) {
        return false;
    }
    return str_ends_with($jid, '@s.whatsapp.net') || str_ends_with($jid, '@c.us');
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
function wa_fetch_chat_rows_from_evolution(EvolutionClient $evo, string $instanceName, int $max): array
{
    $pageSize = min(50, max(20, $max));
    $all = [];
    $seen = [];
    for ($page = 0; $page < 8 && count($all) < $max; $page++) {
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
    foreach (['pnJid', 'remoteJid', 'jid'] as $k) {
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
    $phone = wa_contact_phone_from_row($row);
    if ($phone !== '') {
        return wa_remote_jid($phone);
    }
    foreach (['pnJid', 'remoteJid', 'jid'] as $k) {
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

/** Nome para lista de conversas (findChats): pushName alinha com foto de perfil WhatsApp. */
function wa_chat_list_name_from_row(array $row): string
{
    $candidates = [
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
    if (is_array($last)) {
        $candidates[] = $last['pushName'] ?? null;
        $candidates[] = $last['notifyName'] ?? null;
    }
    foreach ($candidates as $c) {
        $name = trim((string) $c);
        if (wa_is_plausible_display_name($name)) {
            return $name;
        }
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
function wa_item_message_push_name(array $item): string
{
    $candidates = [
        $item['pushName'] ?? null,
        $item['notifyName'] ?? null,
    ];
    foreach ($candidates as $c) {
        $name = trim((string) $c);
        if (wa_is_plausible_display_name($name)) {
            return $name;
        }
    }
    return '';
}

/** Índice jid → melhor nome (agenda findContacts) para enriquecer espelho. */
function wa_build_contact_name_index(EvolutionClient $evo, string $instanceName): array
{
    $index = [];
    try {
        $resp = $evo->findContacts($instanceName);
        $rows = wa_evolution_rows($resp);
    } catch (Throwable $e) {
        // #region agent log
        wa_debug_log('contact index fetch failed', ['error' => $e->getMessage()], 'name-enrich');
        // #endregion
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
    // #region agent log
    wa_debug_log('contact name index built', [
        'index_size' => count($index),
        'rows' => count($rows),
        'with_saved_name' => $withSaved,
        'with_push_name' => $withPush,
        'skipped_no_key' => $skippedNoKey,
        'skipped_no_label' => $skippedNoLabel,
        'index_collisions' => $indexCollisions,
    ], 'name-enrich');
    // #endregion
    return $index;
}

function wa_resolve_chat_display_name(array $row, array $contactIndex = []): string
{
    $name = wa_chat_list_name_from_row($row);
    $legacyName = wa_chat_name_from_row($row);
    $jid = wa_contact_jid_from_row($row);
    // #region agent log
    if ($legacyName !== '' && $name !== '' && $legacyName !== $name) {
        wa_debug_log('chat name legacy vs push', [
            'jid_tail' => substr($jid, -18),
            'push_name' => $name,
            'legacy_name' => $legacyName,
        ], 'H1-legacy-name');
    }
    // #endregion
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
            // #region agent log
            wa_debug_log('chat name enriched from index', [
                'jid_tail' => substr($jid, -18),
                'lookup_key_tail' => substr($key, -18),
                'from_index' => $fromContacts,
                'chat_push_name' => $name,
            ], 'H2-index-enrich');
            // #endregion
            return $fromContacts;
        }
    }
    return $name;
}

/** Mirror sync: findChats pushName prevalece sobre nome legado já gravado no CRM. */
function wa_should_sync_chat_display_name(string $existing, string $resolved, array $row): bool
{
    if ($resolved === '' || !wa_is_plausible_display_name($resolved)) {
        return false;
    }
    $existing = trim($existing);
    if ($existing === '' || $existing === $resolved) {
        return $existing === '';
    }
    $listName = wa_chat_list_name_from_row($row);
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
    return array_values(array_filter($rows, static function ($chat): bool {
        return is_array($chat) && wa_chat_row_visible($chat);
    }));
}

/** Conversa listável no espelho (exclui LID, números inválidos e lixo numérico). */
function wa_chat_row_visible(array $chat): bool
{
    $jid = strtolower((string) ($chat['remote_jid'] ?? ''));
    if ($jid !== '' && !wa_is_valid_contact_jid($jid)) {
        return false;
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
        '[Imagem]' => 'Foto',
        '[Áudio]', '[Audio]' => 'Áudio',
        '[Figurinha]' => 'Figurinha',
        '[Vídeo]', '[Video]' => 'Vídeo',
        '[Documento]' => 'Documento',
        '[Mídia]' => 'Mídia',
        default => $s,
    };
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

function wa_extract_incoming_media(array $item, string $userId, ?EvolutionClient $evo = null, ?string $instanceName = null, string $type = 'text'): ?string
{
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
    // #region agent log
    if ($saved !== null) {
        wa_debug_log('incoming media saved', [
            'type' => $type,
            'path_tail' => substr($saved, -24),
            'mime' => $mime,
            'bytes' => strlen($binary),
        ], 'media-recv');
    }
    // #endregion
    return $saved;
}

function wa_webhook_auth_ok(): bool
{
    $secret = defined('EVOLUTION_WEBHOOK_SECRET') ? (string) EVOLUTION_WEBHOOK_SECRET : '';
    if ($secret === '') {
        return true;
    }
    $q = (string) ($_GET['secret'] ?? '');
    $h = (string) ($_SERVER['HTTP_X_WEBHOOK_SECRET'] ?? '');
    return hash_equals($secret, $q) || hash_equals($secret, $h);
}

function wa_handle_webhook(WhatsAppRepository $repo, EvolutionClient $evo): void
{
    if (!wa_webhook_auth_ok()) {
        soublu_json(['ok' => false, 'error' => 'Webhook não autorizado.'], 401);
    }
    $payload = wa_json_body();
    if (!$payload) {
        soublu_json(['ok' => true, 'ignored' => true]);
    }

    $event = strtolower((string) ($payload['event'] ?? $payload['type'] ?? ''));
    $instanceName = (string) ($payload['instance'] ?? $payload['instanceName'] ?? '');

    if ($instanceName === '') {
        soublu_json(['ok' => true, 'ignored' => true]);
    }

    $instance = $repo->getInstanceByName($instanceName);
    if (!$instance) {
        soublu_json(['ok' => true, 'ignored' => true]);
    }

    if (str_contains($event, 'qrcode')) {
        $repo->updateInstanceStatus($instance['id'], 'connecting');
        soublu_json(['ok' => true]);
    }

    if (str_contains($event, 'connection')) {
        $data = $payload['data'] ?? $payload;
        $state = EvolutionClient::parseConnectionState(is_array($data) ? $data : []);
        if ($state === 'open') {
            $phone = null;
            if (is_array($data)) {
                $phone = wa_phone_digits((string) ($data['phone'] ?? $data['wid'] ?? $data['wuid'] ?? ''));
            }
            $repo->updateInstanceStatus($instance['id'], 'open', $phone ?: null);
            wa_clear_rebind_required((string) ($instance['user_id'] ?? ''));
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
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $key = $item['key'] ?? [];
        $remoteJid = (string) ($key['remoteJid'] ?? $item['remoteJid'] ?? '');
        if ($remoteJid === '' || str_contains($remoteJid, '@g.us')) {
            continue;
        }
        $fromMe = wa_item_from_me($item);
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
        $mediaUrl = wa_extract_incoming_media($item, $userId, $evo, $instanceName, $type);
        if ($text === '' && $mediaUrl === null) {
            continue;
        }
        if ($text === '' && $mediaUrl !== null) {
            $text = match ($type) {
                'image' => '[Imagem]',
                'audio' => '[Áudio]',
                'sticker' => '[Figurinha]',
                'video' => '[Vídeo]',
                default => '[Mídia]',
            };
        }
        $pushName = wa_item_message_push_name($item);
        $chat = $repo->getOrCreateChat($instance, $remoteJid, $pushName !== '' ? $pushName : null);
        if ($pushName !== '' && !$fromMe && wa_should_update_contact_name((string) ($chat['contact_name'] ?? ''), $pushName)) {
            $repo->updateChatMeta((string) $chat['id'], ['contact_name' => $pushName]);
        }
        $repo->insertMessage(
            $chat,
            $instance,
            $fromMe ? 'out' : 'in',
            $text,
            $waId !== '' ? $waId : null,
            $type,
            $mediaUrl
        );
        $saved++;
    }

    wa_debug_log('webhook messages', ['event' => $event, 'instance' => $instanceName, 'saved' => $saved], 'webhook');

    soublu_json(['ok' => true, 'saved' => $saved]);
}

/** Mapa telefone → melhor nome a partir das conversas Evolution (findChats). */
function wa_phone_name_map_from_chat_rows(array $rows): array
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
        $name = wa_chat_list_name_from_row($row);
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
            // #region agent log
            wa_debug_log('chat name repaired by phone', [
                'phone_tail' => substr($phone, -4),
                'prev' => $old,
                'next' => $newName,
            ], 'H3-sync-correct');
            // #endregion
            $fixed++;
        }
    }
    return $fixed;
}

function wa_sync_chats_from_evolution(
    WhatsAppRepository $repo,
    EvolutionClient $evo,
    array $instance,
    bool $force,
    bool $mirrorPoll = false
): array {
    $userId = (string) $instance['user_id'];
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

    if ($force) {
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
    } catch (Throwable $e) {
        wa_debug_log('findChats failed', ['error' => $e->getMessage()], 'mirror-rt');
        return ['synced' => 0, 'skipped' => false, 'skip_reason' => 'evo_error', 'chats' => wa_list_user_chats($repo, $userId), 'error' => $e->getMessage(), 'mirror' => wa_mirror_mode()];
    }

    $contactIndex = wa_mirror_mode()
        ? wa_build_contact_name_index($evo, (string) $instance['instance_name'])
        : [];

    foreach ($rows as $row) {
        if ($synced >= $max) {
            break;
        }
        if (!is_array($row)) {
            continue;
        }
        $remoteJid = wa_contact_jid_from_row($row);
        if ($remoteJid === '' || !wa_is_valid_contact_jid($remoteJid)) {
            continue;
        }
        $existingChat = $repo->getChatByJid((string) $instance['id'], $remoteJid);
        if (!$existingChat && !wa_row_has_conversation($row)) {
            $skippedGhost++;
            continue;
        }
        $nameFromChat = wa_chat_list_name_from_row($row);
        $name = wa_resolve_chat_display_name($row, $contactIndex);
        if ($name !== '' && $nameFromChat === '' && $contactIndex !== []) {
            $enrichedFromContacts++;
        }
        $chat = $existingChat ?: $repo->getOrCreateChat($instance, $remoteJid, $name !== '' ? $name : null);
        $meta = [];
        $prevName = trim((string) ($chat['contact_name'] ?? ''));
        if ($name !== '' && wa_should_sync_chat_display_name($prevName, $name, $row)) {
            $meta['contact_name'] = $name;
            // #region agent log
            if ($prevName !== '' && $prevName !== $name) {
                wa_debug_log('chat name corrected on sync', [
                    'jid_tail' => substr($remoteJid, -18),
                    'prev' => $prevName,
                    'next' => $name,
                    'push_name' => $nameFromChat,
                ], 'H3-sync-correct');
            }
            // #endregion
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
            $meta['contact_phone'] = $phone;
        }
        if ($meta) {
            $repo->updateChatMeta((string) $chat['id'], $meta);
        }
        $finalName = trim((string) ($meta['contact_name'] ?? $chat['contact_name'] ?? ''));
        if (!wa_is_plausible_display_name($finalName)) {
            $missingNameAfter++;
        }
        $synced++;
    }

    $namesRepaired = wa_repair_chat_names_by_phone($repo, $userId, wa_phone_name_map_from_chat_rows($rows));

    if ($mirrorPoll) {
        wa_mark_mirror_poll($userId);
    } elseif ($synced > 0 || $force) {
        wa_mark_sync($userId);
    }

    // #region agent log
    wa_debug_log('sync chats done', [
        'synced' => $synced,
        'skipped_ghost' => $skippedGhost,
        'rows' => count($rows),
        'force' => $force,
        'mirror_poll' => $mirrorPoll,
        'contact_index_size' => count($contactIndex),
        'enriched_from_contacts' => $enrichedFromContacts,
        'missing_name_after' => $missingNameAfter,
        'names_repaired_by_phone' => $namesRepaired,
        'today_rows' => count(array_filter($rows, static function (array $r): bool {
            $ts = wa_row_conversation_timestamp($r);
            if ($ts <= 0) {
                return false;
            }
            $startToday = gmmktime(0, 0, 0, (int) gmdate('n'), (int) gmdate('j'), (int) gmdate('Y'));
            return $ts >= $startToday;
        })),
    ], 'sync-hygiene');
    // #endregion

    return ['synced' => $synced, 'skipped' => false, 'skipped_ghost' => $skippedGhost, 'rows' => count($rows), 'skip_reason' => null, 'chats' => wa_list_user_chats($repo, $userId), 'mirror' => wa_mirror_mode()];
}

/** @deprecated alias */
function wa_sync_contacts_from_evolution(
    WhatsAppRepository $repo,
    EvolutionClient $evo,
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
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => $timeoutSec,
            CURLOPT_SSL_VERIFYPEER => !(defined('EVOLUTION_SSL_VERIFY') && EVOLUTION_SSL_VERIFY === false),
        ]);
        $body = curl_exec($ch);
        curl_close($ch);
        return is_string($body) && $body !== '' ? $body : null;
    }
    $ctx = stream_context_create(['http' => ['timeout' => $timeoutSec]]);
    $body = @file_get_contents($url, false, $ctx);
    return is_string($body) && $body !== '' ? $body : null;
}

function wa_mirror_messages_from_evolution(
    WhatsAppRepository $repo,
    EvolutionClient $evo,
    array $instance,
    array $chat,
    int $limit = 80
): int {
    if (!EvolutionClient::isConfigured()) {
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
        $mediaUrl = wa_extract_incoming_media($item, $userId, $evo, $instanceName, $type);
        if ($type === 'sticker') {
            if ($mediaUrl) {
                $stickerWithMedia++;
            } else {
                $stickerMissing++;
            }
        }
        if ($text === '' && $mediaUrl === null) {
            continue;
        }
        if ($text === '' && $mediaUrl !== null) {
            $text = match ($type) {
                'image' => '[Imagem]',
                'audio' => '[Áudio]',
                'sticker' => '[Figurinha]',
                'video' => '[Vídeo]',
                default => '[Mídia]',
            };
        }
        $pushName = wa_item_message_push_name($item);
        if ($pushName !== '' && !$fromMe && wa_should_update_contact_name((string) ($chat['contact_name'] ?? ''), $pushName)) {
            $repo->updateChatMeta((string) $chat['id'], ['contact_name' => $pushName]);
        }
        $repo->insertMessage(
            $chat,
            $instance,
            $fromMe ? 'out' : 'in',
            $text,
            $waId !== '' ? $waId : null,
            $type,
            $mediaUrl
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

function wa_fetch_chat_avatar_url(
    WhatsAppRepository $repo,
    EvolutionClient $evo,
    array $instance,
    string $chatId
): ?string {
    $userId = (string) ($instance['user_id'] ?? '');
    $chat = $repo->getChatForUser($chatId, $userId);
    if (!$chat) {
        return null;
    }
    $existing = trim((string) ($chat['contact_avatar_url'] ?? ''));
    if ($existing !== '') {
        return $existing;
    }
    if (!EvolutionClient::isConfigured()) {
        return null;
    }
    $phone = wa_phone_digits((string) ($chat['contact_phone'] ?? ''));
    if (strlen($phone) < 10) {
        return null;
    }
    try {
        $resp = $evo->fetchProfilePictureUrl((string) $instance['instance_name'], $phone);
        $picUrl = trim((string) ($resp['profilePictureUrl'] ?? $resp['profilePicture'] ?? ''));
        if ($picUrl === '') {
            return null;
        }
        // Espelho: guarda só a URL (sem baixar arquivo no servidor).
        $repo->updateChatMeta($chatId, ['contact_avatar_url' => $picUrl]);
        return $picUrl;
    } catch (Throwable $e) {
        return null;
    }
}

$action = strtolower(trim((string) ($_GET['action'] ?? $_POST['action'] ?? 'status')));
$body = wa_json_body();

wa_debug_log('action received', ['action' => $action, 'method' => $_SERVER['REQUEST_METHOD'] ?? '']);

if ($action === 'webhook') {
    try {
        wa_handle_webhook(soublu_whatsapp_repository(), new EvolutionClient());
    } catch (Throwable $e) {
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
$evo = new EvolutionClient();

if ($action === 'config') {
    $inst = $userId !== '' ? $repo->getInstance($userId) : null;
    soublu_json([
        'ok' => true,
        'configured' => EvolutionClient::isConfigured(),
        'enabled' => !defined('EVOLUTION_ENABLED') || EVOLUTION_ENABLED !== false,
        'sync_enabled' => wa_contacts_sync_enabled(),
        'contacts_max' => wa_contacts_max(),
        'mirror_mode' => wa_mirror_mode(),
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
            $inst = $repo->getInstance($userId);
            $status = 'close';
            $phone = null;
            $qr = null;
            $evoRawState = '';
            $serverAutoRefresh = false;
            $refreshQr = (string) ($_GET['refresh_qr'] ?? '') === '1';
            $rebindRequired = wa_rebind_required($userId);
            $instName = '';
            if (EvolutionClient::isConfigured()) {
                $ready = wa_ensure_evolution_ready($repo, $evo, $userId);
                $inst = $ready['instance'];
                $instName = $ready['name'];
                wa_debug_log('evolution instance ready', [
                    'created' => $ready['created'],
                    'name' => $ready['name'],
                ], 'C');
                if ($rebindRequired) {
                    if (wa_try_clear_rebind_if_evo_open($evo, $repo, $inst)) {
                        $rebindRequired = false;
                        $inst = $repo->getInstance($userId) ?? $inst;
                        $status = 'open';
                        $phone = $inst['phone'] ?? null;
                    } else {
                        $status = 'close';
                        $phone = null;
                    }
                }
                if (!$rebindRequired) {
                    try {
                        $stateResp = $evo->connectionState($ready['name']);
                        $evoRawState = (string) ($stateResp['instance']['state'] ?? $stateResp['state'] ?? '');
                        $status = EvolutionClient::parseConnectionState($stateResp);
                        if ($status !== 'open') {
                            try {
                                $listResp = $evo->fetchInstances();
                                $listState = EvolutionClient::parseInstanceListState($listResp, $ready['name']);
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
                        }
                        $repo->updateInstanceStatus($inst['id'], $status);
                    } catch (Throwable $e) {
                        $status = (string) ($inst['status'] ?? 'close');
                    }
                    $phone = $inst['phone'] ?? null;
                }
                $skipQr = (string) ($_GET['skip_qr'] ?? '') === '1';
                $qrMeta = wa_qr_meta_read($instName);
                $stuckSec = ($qrMeta['connecting_since'] ?? 0) > 0
                    ? time() - (int) $qrMeta['connecting_since']
                    : 0;
                $serverAutoRefresh = wa_should_fetch_qr_server($instName, $skipQr, $refreshQr, $status);
                if ($serverAutoRefresh && ($status === 'connecting' || $status === 'close')) {
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
                        }
                        wa_qr_meta_write($instName, $qr, $status);
                    } catch (Throwable $e) {
                        wa_debug_log('connect in status failed', ['error' => $e->getMessage()], 'D');
                    }
                } elseif ($status === 'open') {
                    wa_qr_meta_write($instName, null, 'open');
                }
                if (!$qr && $status === 'connecting') {
                    $cached = wa_qr_meta_read($instName);
                    if (!empty($cached['qr'])) {
                        $qr = $cached['qr'];
                    }
                }
                if ($serverAutoRefresh && $skipQr && !$refreshQr) {
                    $refreshQr = true;
                }
            } elseif ($inst) {
                $status = (string) ($inst['status'] ?? 'close');
                $phone = $inst['phone'] ?? null;
            }
            wa_debug_log('status response', [
                'status' => $status,
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
                'configured' => EvolutionClient::isConfigured(),
                'status' => $status,
                'phone' => $phone,
                'qr' => $qr,
                'rebind_required' => $rebindRequired,
            ]);

        case 'connect':
            if (!EvolutionClient::isConfigured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution API não configurada no servidor.'], 503);
            }
            $ready = wa_ensure_evolution_ready($repo, $evo, $userId);
            $inst = $ready['instance'];
            $name = $ready['name'];
            wa_debug_log('evolution instance ready', [
                'created' => $ready['created'],
                'name' => $name,
            ], 'C');
            try {
                $qr = wa_fetch_qr($evo, $name);
            } catch (Throwable $e) {
                wa_debug_log('connect fetch qr failed', ['error' => $e->getMessage()], 'D');
                throw $e;
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
                soublu_json(['ok' => true, 'status' => 'close']);
            }
            if (EvolutionClient::isConfigured()) {
                try {
                    $evo->logout($inst['instance_name']);
                } catch (Throwable $e) {
                    /* noop */
                }
            }
            $repo->updateInstanceStatus($inst['id'], 'close', null);
            wa_qr_meta_write((string) $inst['instance_name'], null, 'close');
            soublu_json(['ok' => true, 'status' => 'close']);

        case 'reset_session':
            $clearData = !empty($body['clear_data']) || (string) ($_GET['clear_data'] ?? '') === '1';
            $inst = $repo->getInstance($userId);
            $instanceName = $inst ? (string) $inst['instance_name'] : '';
            $destroyOk = false;
            if ($inst && EvolutionClient::isConfigured()) {
                $destroyOk = wa_destroy_evolution_instance($evo, $instanceName);
            }
            if ($inst) {
                $repo->updateInstanceStatus($inst['id'], 'close', null);
                wa_qr_meta_write($instanceName, null, 'close');
            }
            wa_mark_rebind_required($userId);
            $deleted = 0;
            if ($clearData) {
                $deleted = $repo->deleteAllChatsForUser($userId);
            }
            wa_clear_user_sync_markers($userId);
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
            ]);

        case 'simulate_scan':
            if (EvolutionClient::isConfigured()) {
                soublu_json([
                    'ok' => false,
                    'error' => 'simulate_scan desativado com Evolution API configurada. Escaneie o QR Code real.',
                ], 400);
            }
            soublu_json(['ok' => true]);

        case 'chats':
            $inst = $repo->getInstance($targetUserId);
            if (!$inst) {
                soublu_json(['ok' => true, 'chats' => []]);
            }
            $rebindRequired = wa_rebind_required($targetUserId);
            if ($rebindRequired && $inst && EvolutionClient::isConfigured()) {
                if (wa_try_clear_rebind_if_evo_open($evo, $repo, $inst)) {
                    $rebindRequired = false;
                    $inst = $repo->getInstance($targetUserId) ?? $inst;
                }
            }
            $mirrorRequested = (string) ($_GET['mirror'] ?? '') === '1';
            $forceSync = (string) ($_GET['force_sync'] ?? '') === '1' || (string) ($_GET['force'] ?? '') === '1';
            $autoMirror = wa_mirror_mode()
                && !$rebindRequired
                && ($inst['status'] ?? '') === 'open'
                && EvolutionClient::isConfigured();
            wa_debug_log('chats request', [
                'user_tail' => substr($targetUserId, -8),
                'mirror' => $mirrorRequested,
                'auto_mirror' => $autoMirror,
                'force_sync' => $forceSync,
                'rebind_required' => $rebindRequired,
                'inst_status' => (string) ($inst['status'] ?? ''),
            ], 'isolate');
            if ($autoMirror) {
                $sync = wa_sync_chats_from_evolution($repo, $evo, $inst, $forceSync, !$forceSync);
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
            } elseif ($mirrorRequested && $rebindRequired) {
                wa_debug_log('mirror chats blocked rebind', [
                    'user_tail' => substr($targetUserId, -8),
                    'instance_name' => (string) ($inst['instance_name'] ?? ''),
                ], 'isolate');
            }
            soublu_json(['ok' => true, 'user_id' => $targetUserId, 'chats' => wa_list_user_chats($repo, $targetUserId)]);

        case 'sync_contacts':
            $inst = $repo->getInstance($userId);
            if ($inst && wa_rebind_required($userId) && EvolutionClient::isConfigured()) {
                if (wa_try_clear_rebind_if_evo_open($evo, $repo, $inst)) {
                    $inst = $repo->getInstance($userId) ?? $inst;
                }
            }
            if (!$inst || ($inst['status'] ?? '') !== 'open') {
                soublu_json(['ok' => false, 'error' => 'WhatsApp desconectado.'], 400);
            }
            if (!EvolutionClient::isConfigured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution API não configurada.'], 503);
            }
            $force = !empty($body['force']);
            $result = wa_sync_contacts_from_evolution($repo, $evo, $inst, $force);
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
            $rebindRequired = wa_rebind_required($targetUserId);
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
            $phone = wa_phone_digits((string) ($body['phone'] ?? $_GET['phone'] ?? ''));
            $name = trim((string) ($body['name'] ?? $_GET['name'] ?? ''));
            if (strlen($phone) < 10) {
                soublu_json(['ok' => false, 'error' => 'Telefone inválido.'], 400);
            }
            $inst = $repo->getInstance($userId);
            if (!$inst || ($inst['status'] ?? '') !== 'open') {
                soublu_json(['ok' => false, 'error' => 'Conecte seu WhatsApp antes de abrir conversas.'], 400);
            }
            $chat = $repo->getOrCreateChat($inst, wa_remote_jid($phone), $name !== '' ? $name : null);
            soublu_json(['ok' => true, 'chat' => $chat]);

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
            soublu_json(['ok' => true, 'chat_id' => $chatId, 'stage' => $stage]);

        case 'sync_avatars':
        case 'contact_avatar':
            $inst = $repo->getInstance($userId);
            if (!$inst || ($inst['status'] ?? '') !== 'open') {
                soublu_json(['ok' => false, 'error' => 'WhatsApp desconectado.'], 400);
            }
            if (!EvolutionClient::isConfigured()) {
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
            if (!$inst || !EvolutionClient::isConfigured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution API indisponível.'], 503);
            }
            $waId = (string) ($msg['wa_message_id'] ?? '');
            if ($waId === '') {
                soublu_json(['ok' => false, 'error' => 'Mensagem sem ID Evolution.'], 400);
            }
            $payload = [
                'key' => [
                    'remoteJid' => (string) ($msg['remote_jid'] ?? ''),
                    'fromMe' => ($msg['direction'] ?? '') === 'out',
                    'id' => $waId,
                ],
                'message' => [],
            ];
            $type = (string) ($msg['message_type'] ?? 'text');
            if ($type === 'audio') {
                $payload['message']['audioMessage'] = [];
            } elseif ($type === 'image') {
                $payload['message']['imageMessage'] = [];
            } elseif ($type === 'sticker') {
                $payload['message']['stickerMessage'] = [];
            } elseif ($type === 'video') {
                $payload['message']['videoMessage'] = [];
            }
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
            if ($saved === null) {
                soublu_json(['ok' => false, 'error' => 'Falha ao salvar mídia.'], 500);
            }
            $repo->updateMessageMediaUrl($messageId, $saved);
            soublu_json(['ok' => true, 'media_url' => $saved]);

        case 'send':
            $text = trim((string) ($body['text'] ?? $body['caption'] ?? ''));
            $chatId = trim((string) ($body['chat_id'] ?? ''));
            $phone = wa_phone_digits((string) ($body['phone'] ?? ''));
            $mediaType = strtolower(trim((string) ($body['media_type'] ?? '')));
            $mediaPath = trim((string) ($body['media_url'] ?? ''));
            $mimetype = trim((string) ($body['mimetype'] ?? ''));
            $fileName = trim((string) ($body['file_name'] ?? ''));

            if ($text === '' && $mediaPath === '') {
                soublu_json(['ok' => false, 'error' => 'Mensagem vazia.'], 400);
            }
            if (!EvolutionClient::isConfigured()) {
                soublu_json(['ok' => false, 'error' => 'Evolution API não configurada.'], 503);
            }
            $inst = $repo->getInstance($userId);
            if (!$inst || ($inst['status'] ?? '') !== 'open') {
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
            $sendPhone = $chat['contact_phone'] ?? wa_jid_phone($chat['remote_jid']);
            $waId = '';
            $msgType = 'text';
            $storedMedia = null;

            if ($mediaPath !== '') {
                $local = wa_resolve_local_media($mediaPath);
                $publicUrl = wa_public_media_url($mediaPath);
                $mediaPayload = $local !== null ? base64_encode($local) : $publicUrl;
                if ($mediaType === 'sticker') {
                    $evoResp = $evo->sendSticker($inst['instance_name'], $sendPhone, $mediaPayload);
                    $msgType = 'sticker';
                    $text = $text !== '' ? $text : '[Figurinha]';
                    $storedMedia = ltrim(preg_replace('#^uploads/#', '', str_replace('\\', '/', $mediaPath)) ?? $mediaPath, '/');
                } elseif ($mediaType === 'audio') {
                    wa_debug_log('send audio', [
                        'chat_id' => $chatId,
                        'media_path' => $mediaPath,
                        'has_local' => $local !== null,
                        'mimetype' => $mimetype,
                        'payload_len' => strlen($mediaPayload),
                    ], 'audio');
                    try {
                        $evoResp = $evo->sendWhatsAppAudio(
                            $inst['instance_name'],
                            $sendPhone,
                            $mediaPayload,
                            $mimetype !== '' ? $mimetype : null
                        );
                    } catch (Throwable $audioErr) {
                        wa_debug_log('sendWhatsAppAudio failed, fallback sendMedia', [
                            'error' => $audioErr->getMessage(),
                        ], 'audio');
                        $evoResp = $evo->sendMedia(
                            $inst['instance_name'],
                            $sendPhone,
                            'audio',
                            $mediaPayload,
                            $mimetype !== '' ? $mimetype : null
                        );
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
                // #region agent log
                wa_debug_log('send media ok', [
                    'media_type' => $msgType,
                    'chat_id' => $chatId,
                    'wa_id_tail' => $waId !== '' ? substr($waId, -8) : '',
                    'has_local' => $local !== null,
                    'payload_kind' => $local !== null ? 'base64' : 'url',
                    'stored_media' => $storedMedia !== null,
                ], 'media-send');
                // #endregion
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
            soublu_json(['ok' => true, 'message' => $msg, 'chat_id' => $chat['id']]);

        case 'get_users':
            $st = $pdo->prepare(
                'SELECT u.id, u.nome, i.status
                 FROM rh_employees u
                 LEFT JOIN whatsapp_instances i ON u.id = i.user_id
                 WHERE u.status = \'ativo\' OR i.status IS NOT NULL'
            );
            $st->execute();
            soublu_json(['ok' => true, 'data' => $st->fetchAll(PDO::FETCH_ASSOC) ?: []]);

        default:
            soublu_json(['ok' => false, 'error' => 'Ação inválida.'], 400);
    }
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
