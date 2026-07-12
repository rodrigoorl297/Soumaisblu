<?php
/**
 * API interna PIX — saques SOU + BLU
 * Ações: pay | status | webhook (stub)
 *
 * Autenticação: header X-PIX-Token = PIX_INTERNAL_TOKEN (config.pix.local.php)
 */
declare(strict_types=1);

$pixCli = defined('PIX_API_CLI') && PIX_API_CLI;

function pix_send_cors_headers(): void
{
    if (defined('PIX_API_CLI') && PIX_API_CLI) {
        return;
    }
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-PIX-Token, Authorization');
}

if (!$pixCli) {
    pix_send_cors_headers();
    header('Content-Type: application/json; charset=utf-8');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$configPath = dirname(__DIR__) . '/config.pix.local.php';
if (!is_file($configPath)) {
    http_response_code(503);
    echo json_encode([
        'ok' => false,
        'error' => 'config.pix.local.php não encontrado na raiz do site (mesma pasta que api/).',
        'hint' => 'Copie config.pix.local.php.example → config.pix.local.php e preencha SUPABASE_SERVICE_KEY + PIX_INTERNAL_TOKEN.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once $configPath;

/* config.db.local.php só para MySQL (PIX_DB_BACKEND=mysql). Modo Supabase não carrega MySQL. */
$__pixDbBackendEarly = defined('PIX_DB_BACKEND') && trim((string) PIX_DB_BACKEND) !== ''
    ? strtolower(trim((string) PIX_DB_BACKEND))
    : 'supabase';
if ($__pixDbBackendEarly === 'mysql') {
    $dbConfigPath = dirname(__DIR__) . '/config.db.local.php';
    if (is_file($dbConfigPath)) {
        require_once $dbConfigPath;
    }
}

/** Mesmo projeto do painel (js/db-connect.js) quando não definido no PHP. */
if (!defined('SUPABASE_URL') || trim((string) SUPABASE_URL) === '') {
    define('SUPABASE_URL', 'https://dqptnlywbarvznpzgtuj.supabase.co');
}

function pix_service_key_configured(): bool
{
    return defined('SUPABASE_SERVICE_KEY')
        && trim((string) SUPABASE_SERVICE_KEY) !== ''
        && (string) SUPABASE_SERVICE_KEY !== 'SUA-SERVICE-ROLE-KEY';
}

function pix_resolve_ca_bundle(): ?string
{
    $candidates = [];
    if (defined('EFI_CAINFO_PATH') && (string) EFI_CAINFO_PATH !== '') {
        $candidates[] = (string) EFI_CAINFO_PATH;
    }
    $candidates[] = dirname(__DIR__) . '/certs/cacert.pem';
    $iniCa = ini_get('curl.cainfo');
    if (is_string($iniCa) && $iniCa !== '') {
        $candidates[] = $iniCa;
    }
    $iniSsl = ini_get('openssl.cafile');
    if (is_string($iniSsl) && $iniSsl !== '') {
        $candidates[] = $iniSsl;
    }
    foreach ($candidates as $path) {
        if (is_string($path) && $path !== '' && is_file($path)) {
            return $path;
        }
    }
    return null;
}

final class PixKeyNormalizer
{
    public static function formatUuid(string $key): string
    {
        $k = trim($key);
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $k)) {
            return strtolower($k);
        }
        $hex = preg_replace('/[^0-9a-f]/i', '', $k) ?? '';
        if (strlen($hex) !== 32) {
            return $k;
        }
        return strtolower(substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4)
            . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12));
    }

    public static function inferType(string $key): string
    {
        $k = trim($key);
        if ($k === '') {
            return 'random';
        }
        if (str_contains($k, '@')) {
            return 'email';
        }
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $k)) {
            return 'random';
        }
        $hexOnly = preg_replace('/[^0-9a-f]/i', '', $k) ?? '';
        if (preg_match('/^[0-9a-f]{32}$/i', $hexOnly)) {
            return 'random';
        }
        $digits = preg_replace('/\D+/', '', $k) ?? '';
        if (strlen($digits) === 14) {
            return 'cnpj';
        }
        if (strlen($digits) === 11) {
            if (preg_match('/^\+?55|\(\d{2}\)/', str_replace(' ', '', $k))) {
                return 'phone';
            }
            return 'cpf';
        }
        if (strlen($digits) === 10 || strlen($digits) === 11 || strlen($digits) === 12 || strlen($digits) === 13) {
            return 'phone';
        }
        return 'random';
    }

    public static function normalize(string $type, string $key): string
    {
        $type = strtolower(trim($type));
        $key = trim($key);

        if (in_array($type, ['celular', 'telefone'], true)) {
            $type = 'phone';
        }
        if (in_array($type, ['e-mail', 'mail'], true)) {
            $type = 'email';
        }
        if (in_array($type, ['aleatoria', 'chave_aleatoria', 'evp', 'random'], true)) {
            return self::formatUuid($key);
        }

        switch ($type) {
            case 'cpf':
            case 'cnpj':
                return preg_replace('/\D+/', '', $key) ?? $key;
            case 'phone':
                $digits = preg_replace('/\D+/', '', $key) ?? '';
                if ($digits === '') return $key;
                if (str_starts_with($digits, '55') && strlen($digits) >= 12) return '+' . $digits;
                if (strlen($digits) === 11 || strlen($digits) === 10) return '+55' . $digits;
                return '+' . $digits;
            case 'email':
                return strtolower($key);
            case 'random':
                return self::formatUuid($key);
            default:
                return $key;
        }
    }

    public static function isValid(string $type, string $key): bool
    {
        $type = strtolower(trim($type));
        $key = trim($key);
        if ($key === '') {
            return false;
        }
        switch ($type) {
            case 'cpf':
                return (bool) preg_match('/^\d{11}$/', $key);
            case 'cnpj':
                return (bool) preg_match('/^\d{14}$/', $key);
            case 'email':
                return (bool) filter_var($key, FILTER_VALIDATE_EMAIL);
            case 'phone':
                return (bool) preg_match('/^\+55\d{10,11}$/', $key);
            case 'random':
                return (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $key);
            default:
                return strlen($key) >= 3;
        }
    }

    public static function forEfiPay(string $pixKeyType, string $pixKey): string
    {
        $key = trim($pixKey);
        if ($key === '') {
            return '';
        }
        $hint = strtolower(trim($pixKeyType));
        if ($hint === '' || $hint === 'pix') {
            $hint = self::inferType($key);
        }
        if (in_array($hint, ['celular', 'telefone'], true)) {
            $hint = 'phone';
        }
        if (in_array($hint, ['e-mail', 'mail'], true)) {
            $hint = 'email';
        }
        if (in_array($hint, ['aleatoria', 'chave_aleatoria', 'evp'], true)) {
            $hint = 'random';
        }

        $tryTypes = array_values(array_unique(array_filter([
            $hint,
            self::inferType($key),
            'email',
            'random',
            'cnpj',
            'cpf',
            'phone',
        ])));

        foreach ($tryTypes as $type) {
            $normalized = self::normalize($type, $key);
            if (self::isValid($type, $normalized)) {
                return $normalized;
            }
        }

        return '';
    }
}

final class EfiPayClient
{
    private string $baseUrl;
    private string $clientId;
    private string $clientSecret;
    private string $certPath;
    private string $certPassword;
    private ?string $accessToken = null;
    private ?int $tokenExpiresAt = null;

    public function __construct(
        string $clientId,
        string $clientSecret,
        string $certPath,
        string $certPassword = '',
        bool $sandbox = true
    ) {
        $this->clientId = $clientId;
        $this->clientSecret = $clientSecret;
        $this->certPath = $certPath;
        $this->certPassword = $certPassword;
        $this->baseUrl = $sandbox
            ? 'https://pix-h.api.efipay.com.br'
            : 'https://pix.api.efipay.com.br';
    }

    public function getAccessToken(bool $forceRefresh = false): string
    {
        if (
            !$forceRefresh
            && $this->accessToken !== null
            && $this->tokenExpiresAt !== null
            && time() < $this->tokenExpiresAt - 60
        ) {
            return $this->accessToken;
        }

        $auth = base64_encode($this->clientId . ':' . $this->clientSecret);
        $response = $this->curlRequest(
            'POST',
            '/oauth/token',
            '{"grant_type":"client_credentials"}',
            ['Authorization: Basic ' . $auth, 'Content-Type: application/json'],
            false
        );

        if ($response['http_code'] < 200 || $response['http_code'] >= 300) {
            throw new RuntimeException(
                'EfiPay OAuth falhou (HTTP ' . $response['http_code'] . '): ' . ($response['body'] ?? '')
            );
        }

        $data = json_decode($response['body'], true);
        if (empty($data['access_token'])) {
            throw new RuntimeException('EfiPay OAuth: access_token ausente na resposta.');
        }

        $this->accessToken = $data['access_token'];
        $this->tokenExpiresAt = time() + (int) ($data['expires_in'] ?? 3600);
        return $this->accessToken;
    }

    public function sendPix(
        string $idEnvio,
        string $valor,
        string $payerPixKey,
        string $recipientPixKey,
        string $infoPagador = ''
    ): array {
        $body = [
            'valor' => $valor,
            'pagador' => [
                'chave' => $payerPixKey,
                'infoPagador' => $infoPagador !== '' ? $infoPagador : 'Saque SOU+BLU',
            ],
            'favorecido' => ['chave' => $recipientPixKey],
        ];

        $response = $this->request('PUT', '/v3/gn/pix/' . rawurlencode($idEnvio), $body);
        if ($response['http_code'] === 201 || $response['http_code'] === 200) {
            $decoded = json_decode($response['body'], true);
            return is_array($decoded) ? $decoded : ['raw' => $response['body']];
        }

        $err = json_decode($response['body'], true);
        $msg = is_array($err)
            ? ($err['mensagem'] ?? $err['message'] ?? json_encode($err, JSON_UNESCAPED_UNICODE))
            : ($response['body'] ?? 'Erro desconhecido');
        throw new RuntimeException('EfiPay sendPix HTTP ' . $response['http_code'] . ': ' . $msg, (int) $response['http_code']);
    }

    public function getStatusByIdEnvio(string $idEnvio): ?array
    {
        $response = $this->request('GET', '/v2/gn/pix/enviados/id-envio/' . rawurlencode($idEnvio));
        if ($response['http_code'] === 404) return null;
        if ($response['http_code'] >= 200 && $response['http_code'] < 300) {
            $decoded = json_decode($response['body'], true);
            return is_array($decoded) ? $decoded : null;
        }
        throw new RuntimeException('EfiPay status HTTP ' . $response['http_code'] . ': ' . ($response['body'] ?? ''));
    }

    /** GET /v2/webhook/:chave — null se não cadastrado. */
    public function getWebhook(string $pixKey): ?array
    {
        $response = $this->request('GET', '/v2/webhook/' . rawurlencode($pixKey));
        if ($response['http_code'] === 404) {
            return null;
        }
        if ($response['http_code'] === 400) {
            $decoded = json_decode($response['body'], true);
            if (is_array($decoded) && ($decoded['nome'] ?? '') === 'webhook_nao_encontrado') {
                return null;
            }
        }
        if ($response['http_code'] >= 200 && $response['http_code'] < 300) {
            $decoded = json_decode($response['body'], true);
            return is_array($decoded) ? $decoded : null;
        }
        throw new RuntimeException('EfiPay getWebhook HTTP ' . $response['http_code'] . ': ' . ($response['body'] ?? ''));
    }

    /**
     * PUT /v2/webhook/:chave — obrigatório antes de enviar PIX (chave pagadora).
     * Hostinger: use skipMtlsChecking=true (header x-skip-mtls-checking).
     */
    public function putWebhook(string $pixKey, string $webhookUrl, bool $skipMtlsChecking = true): array
    {
        $headers = [
            'Authorization: Bearer ' . $this->getAccessToken(),
            'Content-Type: application/json',
        ];
        if ($skipMtlsChecking) {
            $headers[] = 'x-skip-mtls-checking: true';
        }
        $body = json_encode(['webhookUrl' => $webhookUrl], JSON_UNESCAPED_UNICODE);
        $response = $this->curlRequest(
            'PUT',
            '/v2/webhook/' . rawurlencode($pixKey),
            $body,
            $headers,
            true
        );
        if ($response['http_code'] === 201 || $response['http_code'] === 200) {
            $decoded = json_decode($response['body'], true);
            return is_array($decoded) ? $decoded : ['ok' => true];
        }
        $err = json_decode($response['body'], true);
        $msg = is_array($err)
            ? ($err['mensagem'] ?? $err['message'] ?? json_encode($err, JSON_UNESCAPED_UNICODE))
            : ($response['body'] ?? 'Erro desconhecido');
        throw new RuntimeException('EfiPay putWebhook HTTP ' . $response['http_code'] . ': ' . $msg, (int) $response['http_code']);
    }

    public function request(string $method, string $path, ?array $body = null): array
    {
        $payload = $body !== null ? json_encode($body, JSON_UNESCAPED_UNICODE) : null;
        return $this->curlRequest(
            $method,
            $path,
            $payload,
            ['Authorization: Bearer ' . $this->getAccessToken(), 'Content-Type: application/json'],
            true
        );
    }

    private function curlRequest(string $method, string $path, ?string $body, array $headers, bool $useBearer): array
    {
        if (!is_file($this->certPath)) {
            throw new RuntimeException('Certificado P12 não encontrado: ' . $this->certPath);
        }

        $ch = curl_init();
        $opts = [
            CURLOPT_URL => $this->baseUrl . $path,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_SSLCERT => $this->certPath,
            CURLOPT_SSLCERTTYPE => 'P12',
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_HEADER => true,
        ];
        if ($this->certPassword !== '') $opts[CURLOPT_SSLCERTPASSWD] = $this->certPassword;
        if ($body !== null && $body !== '') $opts[CURLOPT_POSTFIELDS] = $body;
        $caFile = pix_resolve_ca_bundle();
        if ($caFile !== null) {
            $opts[CURLOPT_SSL_VERIFYPEER] = true;
            $opts[CURLOPT_CAINFO] = $caFile;
        }
        curl_setopt_array($ch, $opts);

        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        if ($errno) throw new RuntimeException('cURL EfiPay: ' . $error, $errno);
        return [
            'http_code' => $httpCode,
            'body' => is_string($raw) ? substr($raw, $headerSize) : '',
        ];
    }

    public static function sanitizeIdEnvio(string $withdrawalId): string
    {
        $id = preg_replace('/[^a-zA-Z0-9]/', '', $withdrawalId) ?? $withdrawalId;
        if ($id === '') $id = 'wd' . bin2hex(random_bytes(8));
        return substr($id, 0, 35);
    }
}

final class MockProvider
{
    public function sendPix(string $idEnvio, string $valor, string $recipientPixKey, string $infoPagador = ''): array
    {
        return [
            'idEnvio' => $idEnvio,
            'e2eId' => 'MOCK' . strtoupper(substr(md5($idEnvio . $valor), 0, 28)),
            'valor' => $valor,
            'status' => 'REALIZADO',
            'favorecido' => ['chave' => $recipientPixKey],
            'mock' => true,
        ];
    }

    public function getStatusByIdEnvio(string $idEnvio): array
    {
        return [
            'idEnvio' => $idEnvio,
            'status' => 'REALIZADO',
            'endToEndId' => 'MOCK' . strtoupper(substr(md5($idEnvio), 0, 28)),
            'mock' => true,
        ];
    }
}

final class WithdrawalRepository
{
    private string $url;
    private string $serviceKey;
    private static ?bool $hasPixColumns = null;

    public function __construct(string $supabaseUrl, string $serviceKey)
    {
        $this->url = rtrim($supabaseUrl, '/');
        $this->serviceKey = $serviceKey;
    }

    public function find(string $id): ?array
    {
        $rows = $this->rest('GET', 'withdrawals', null, '?id=eq.' . rawurlencode($id) . '&select=*&limit=1');
        return $rows[0] ?? null;
    }

    public function update(string $id, array $fields): ?array
    {
        if (self::$hasPixColumns === false) {
            return $this->updateWithAdminNoteFallback($id, $fields);
        }
        try {
            $rows = $this->rest('PATCH', 'withdrawals', $fields, '?id=eq.' . rawurlencode($id));
            self::$hasPixColumns = true;
            return $rows[0] ?? null;
        } catch (RuntimeException $e) {
            if (self::isMissingColumnError($e)) {
                self::$hasPixColumns = false;
                return $this->updateWithAdminNoteFallback($id, $fields);
            }
            throw $e;
        }
    }

    private function updateWithAdminNoteFallback(string $id, array $fields): ?array
    {
        $wd = $this->find($id);
        if (!$wd) return null;

        $meta = [];
        $note = (string) ($wd['admin_note'] ?? '');
        if (preg_match('/<!--PIX_META:(.*?)-->/s', $note, $m)) {
            $decoded = json_decode($m[1], true);
            if (is_array($decoded)) $meta = $decoded;
        }

        foreach (['pix_status', 'pix_id_envio', 'pix_e2e_id', 'pix_error', 'pix_paid_at', 'status', 'processed_at'] as $k) {
            if (array_key_exists($k, $fields)) $meta[$k] = $fields[$k];
        }

        $json = json_encode($meta, JSON_UNESCAPED_UNICODE);
        $cleanNote = preg_replace('/\s*<!--PIX_META:.*?-->\s*/s', '', $note) ?? $note;
        $patch = ['admin_note' => trim($cleanNote) . "\n<!--PIX_META:" . $json . '-->'];
        if (isset($fields['status'])) $patch['status'] = $fields['status'];
        if (isset($fields['processed_at'])) $patch['processed_at'] = $fields['processed_at'];

        $rows = $this->rest('PATCH', 'withdrawals', $patch, '?id=eq.' . rawurlencode($id));
        $row = $rows[0] ?? $wd;
        foreach ($meta as $k => $v) $row[$k] = $v;
        return $row;
    }

    private static function isMissingColumnError(RuntimeException $e): bool
    {
        $msg = $e->getMessage();
        return str_contains($msg, '42703')
            || (stripos($msg, 'column') !== false && stripos($msg, 'does not exist') !== false)
            || stripos($msg, 'pix_status') !== false;
    }

    private function rest(string $method, string $table, ?array $body, string $query = ''): array
    {
        $ch = curl_init($this->url . '/rest/v1/' . $table . $query);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => [
                'apikey: ' . $this->serviceKey,
                'Authorization: Bearer ' . $this->serviceKey,
                'Content-Type: application/json',
                'Prefer: return=representation',
            ],
            CURLOPT_TIMEOUT => 30,
        ]);
        if ($body !== null && in_array($method, ['POST', 'PATCH', 'PUT'], true)) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
        }

        $response = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($response === false) throw new RuntimeException('Supabase request failed: ' . $err);
        if ($http >= 400) throw new RuntimeException('Supabase HTTP ' . $http . ': ' . $response, $http);
        if ($response === '' || $response === 'null') return [];
        $decoded = json_decode($response, true);
        return is_array($decoded) ? $decoded : [];
    }
}

function pix_json_response(array $data, int $code = 200): void
{
    if (defined('PIX_API_CLI') && PIX_API_CLI) {
        $GLOBALS['PIX_API_CLI_RESULT'] = ['code' => $code, 'data' => $data];
        return;
    }
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function pix_auth_ok(): bool
{
    $token = '';
    if (!empty($_SERVER['HTTP_X_PIX_TOKEN'])) {
        $token = (string) $_SERVER['HTTP_X_PIX_TOKEN'];
    } elseif (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $k => $v) {
                if (strtolower((string) $k) === 'x-pix-token') {
                    $token = (string) $v;
                    break;
                }
            }
        }
    }
    $expected = defined('PIX_INTERNAL_TOKEN') ? PIX_INTERNAL_TOKEN : '';
    return $expected !== '' && $token !== '' && hash_equals($expected, $token);
}

function pix_input(): array
{
    $raw = file_get_contents('php://input');
    $json = $raw ? json_decode($raw, true) : null;
    if (!is_array($json)) {
        $json = [];
    }
    return array_merge($_GET, $_POST, $json);
}

function pix_map_efi_status(string $efiStatus): string
{
    $s = strtoupper($efiStatus);
    if (in_array($s, ['REALIZADO', 'CONCLUIDO', 'CONCLUÍDO'], true)) {
        return 'pago';
    }
    if (in_array($s, ['EM_PROCESSAMENTO', 'PROCESSANDO'], true)) {
        return 'processando';
    }
    if (in_array($s, ['NAO_REALIZADO', 'REJEITADO', 'CANCELADO'], true)) {
        return 'erro';
    }
    if (in_array($s, ['DEVOLVIDO', 'ESTORNADO', 'DEVOLUCAO', 'DEVOLUÇÃO'], true)) {
        return 'estornado';
    }
    return 'processando';
}

/** Extrai motivo legível de resposta Efi (envio ou consulta). */
function pix_extract_efi_error_detail(?array $remote): string
{
    if (!$remote || !is_array($remote)) {
        return '';
    }
    $parts = [];
    $status = strtoupper((string) ($remote['status'] ?? ''));
    if ($status !== '' && $status !== 'REALIZADO' && $status !== 'EM_PROCESSAMENTO') {
        $parts[] = $status;
    }
    foreach (['motivo', 'mensagem', 'message', 'descricao', 'detail'] as $k) {
        $v = trim((string) ($remote[$k] ?? ''));
        if ($v !== '' && !in_array($v, $parts, true)) {
            $parts[] = $v;
        }
    }
    $gn = $remote['gnExtras'] ?? $remote['gn_extras'] ?? null;
    if (is_array($gn)) {
        foreach (['erro', 'motivo', 'mensagem', 'codigo'] as $k) {
            $v = trim((string) ($gn[$k] ?? ''));
            if ($v !== '' && !in_array($v, $parts, true)) {
                $parts[] = $v;
            }
        }
    }
    $pix = $remote['pix'] ?? null;
    if (is_array($pix)) {
        foreach (['status', 'motivo', 'mensagem'] as $k) {
            $v = trim((string) ($pix[$k] ?? ''));
            if ($v !== '' && !in_array($v, $parts, true)) {
                $parts[] = $v;
            }
        }
    }
    return implode(' — ', $parts);
}

/** Aplica patch de status Efi no saque (pago, erro ou processando). */
function pix_apply_efi_status_patch(array $remote, array $wd): array
{
    $mapped = pix_map_efi_status((string) ($remote['status'] ?? ''));
    $e2e = (string) ($remote['endToEndId'] ?? $remote['e2eId'] ?? '');
    $patch = [
        'pix_status' => $mapped,
        'pix_e2e_id' => $e2e !== '' ? $e2e : ($wd['pix_e2e_id'] ?? null),
    ];
    if ($mapped === 'pago') {
        $patch['status'] = 'pago';
        $patch['processed_at'] = gmdate('c');
        $patch['pix_paid_at'] = gmdate('c');
        $patch['pix_error'] = null;
    } elseif ($mapped === 'erro') {
        $detail = pix_extract_efi_error_detail($remote);
        $patch['status'] = 'erro';
        $patch['pix_error'] = $detail !== '' ? $detail : (string) ($remote['status'] ?? 'Rejeitado pelo banco');
    } elseif ($mapped === 'estornado') {
        $patch['status'] = 'erro';
        $patch['pix_error'] = pix_extract_efi_error_detail($remote) ?: 'PIX estornado/devolvido';
    } else {
        $patch['status'] = 'processando';
        $patch['pix_error'] = null;
    }
    return $patch;
}

function pix_format_brl(float $amountPoints, float $pointsToBrl): string
{
    $brl = round($amountPoints * $pointsToBrl, 2);
    return number_format($brl, 2, '.', '');
}

function pix_webhook_url(): string
{
    if (defined('EFI_WEBHOOK_URL') && (string) EFI_WEBHOOK_URL !== '') {
        return (string) EFI_WEBHOOK_URL;
    }
    return '';
}

function pix_is_insufficient_scope(Throwable $e): bool
{
    $msg = $e->getMessage();
    if (stripos($msg, 'insufficient_scope') !== false) {
        return true;
    }
    return stripos($msg, 'webhook.read') !== false
        || stripos($msg, 'webhook.write') !== false
        || (stripos($msg, 'getWebhook HTTP 403') !== false)
        || (stripos($msg, 'putWebhook HTTP 403') !== false);
}

function pix_webhook_scope_help(string $url): string
{
    return 'Escopos de webhook faltando na app Efi soublu-pix-saques. '
        . 'Painel → Aplicações → soublu-pix-saques → Configurações → Escopos: '
        . 'marque "Alterar Webhooks" e "Consultar Webhooks", salve e aguarde 2 min. '
        . 'Depois: api/pix_api.php?action=setup_webhook. URL do webhook: ' . $url;
}

function pix_humanize_efipay_error(string $msg): string
{
    if (defined('EFI_SANDBOX') && EFI_SANDBOX) {
        if (
            stripos($msg, 'chave do favorecido') !== false
            || stripos($msg, 'chave inválida') !== false
            || stripos($msg, 'nao foi encontrada') !== false
            || stripos($msg, 'não foi encontrada') !== false
        ) {
            return $msg . ' Em homologação a Efi só aceita a chave de teste '
                . 'efipay@sejaefi.com.br (tipo e-mail). Chaves reais de colaboradores '
                . 'só funcionam com EFI_SANDBOX=false (produção).';
        }
    }
    return $msg;
}

function pix_efipay_client(): EfiPayClient
{
    return new EfiPayClient(
        EFI_CLIENT_ID,
        EFI_CLIENT_SECRET,
        EFI_CERT_PATH,
        defined('EFI_CERT_PASSWORD') ? (string) EFI_CERT_PASSWORD : '',
        defined('EFI_SANDBOX') ? (bool) EFI_SANDBOX : true
    );
}

/** Cadastra webhook na chave PIX pagadora (exigência Efi para envio PIX). */
function pix_ensure_efi_webhook(EfiPayClient $client, bool $force = false): array
{
    if (!defined('EFI_PAYER_PIX_KEY') || (string) EFI_PAYER_PIX_KEY === '') {
        throw new RuntimeException('EFI_PAYER_PIX_KEY não configurada.');
    }
    $key = (string) EFI_PAYER_PIX_KEY;
    $url = pix_webhook_url();
    if ($url === '') {
        throw new RuntimeException(
            'EFI_WEBHOOK_URL não configurada em config.pix.local.php. ' .
            'Use: https://www.soumaisblu.com.br/api/pix_api.php?action=webhook&ignorar='
        );
    }
    $skip = !defined('EFI_WEBHOOK_SKIP_MTLS') || (bool) EFI_WEBHOOK_SKIP_MTLS;

    if (!$force) {
        try {
            $info = $client->getWebhook($key);
            if ($info !== null) {
                $current = (string) ($info['webhookUrl'] ?? $info['url'] ?? '');
                if ($current === $url) {
                    return ['ok' => true, 'already' => true, 'webhookUrl' => $current];
                }
            }
        } catch (RuntimeException $e) {
            if (!pix_is_insufficient_scope($e)) {
                throw $e;
            }
        }
    }

    try {
        $result = $client->putWebhook($key, $url, $skip);
        return ['ok' => true, 'registered' => true, 'webhookUrl' => $url, 'efi' => $result];
    } catch (RuntimeException $e) {
        if (pix_is_insufficient_scope($e)) {
            return [
                'ok' => false,
                'skipped' => true,
                'reason' => 'insufficient_scope',
                'hint' => pix_webhook_scope_help($url),
            ];
        }
        throw $e;
    }
}

function pix_can_pay_withdrawal(array $wd): bool
{
    $status = (string) ($wd['status'] ?? '');
    $pixStatus = (string) ($wd['pix_status'] ?? '');

    if (in_array($pixStatus, ['pago', 'REALIZADO'], true)) {
        return false;
    }
    if (!empty($wd['pix_e2e_id']) && $pixStatus === 'pago') {
        return false;
    }

    $blocked = ['rejeitado', 'cancelado'];
    if (in_array($status, $blocked, true)) {
        return false;
    }

    if (defined('PIX_AUTO_ON_APPROVAL') && PIX_AUTO_ON_APPROVAL) {
        $master = !empty($wd['approved_by_master']);
        $financial = !empty($wd['approved_by_financial']);
        return $master && $financial;
    }

    return in_array($status, ['solicitado', 'aprovado_master', 'aprovado_financeiro', 'processando', 'pago'], true);
}

/** @return array{ok: bool, provider: string, data?: array, error?: string} */
function pix_send_payment(
    object $repo,
    array $wd,
    string $provider
): array {
    $id = (string) $wd['id'];
    $baseIdEnvio = EfiPayClient::sanitizeIdEnvio($id);
    $priorPix = strtolower((string) ($wd['pix_status'] ?? ''));
    $priorFailed = in_array($priorPix, ['erro', 'nao_realizado', 'rejeitado', 'cancelado', 'estornado'], true)
        || ((string) ($wd['status'] ?? '') === 'erro');
    $storedEnvio = trim((string) ($wd['pix_id_envio'] ?? ''));
    if ($priorFailed || $storedEnvio === '') {
        $idEnvio = substr($baseIdEnvio . 'r' . dechex(time() % 0xfffff), 0, 35);
    } else {
        $idEnvio = $storedEnvio;
    }
    $pointsToBrl = defined('POINTS_TO_BRL') ? (float) POINTS_TO_BRL : 1.0;
    $valor = pix_format_brl((float) ($wd['amount'] ?? 0), $pointsToBrl);

    if ((float) $valor <= 0) {
        return ['ok' => false, 'provider' => $provider, 'error' => 'Valor do saque inválido.'];
    }

    $recipient = PixKeyNormalizer::forEfiPay(
        (string) ($wd['pix_key_type'] ?? 'random'),
        (string) ($wd['pix_key'] ?? '')
    );

    if ($recipient === '') {
        $type = (string) ($wd['pix_key_type'] ?? '');
        return [
            'ok' => false,
            'provider' => $provider,
            'error' => 'Chave PIX inválida'
                . ($type !== '' ? " (tipo: {$type})" : '')
                . '. Confira e-mail, celular (+55), CNPJ ou chave aleatória.',
        ];
    }

    $holder = (string) ($wd['holder_name'] ?? '');
    $infoPagador = 'Saque SOU+BLU #' . $id . ($holder !== '' ? ' — ' . $holder : '');

    $repo->update($id, [
        'pix_status' => 'processando',
        'pix_id_envio' => $idEnvio,
        'pix_error' => null,
        'status' => 'processando',
    ]);

    try {
        if ($provider === 'efipay') {
            if (
                !defined('EFI_CLIENT_ID') || !defined('EFI_CLIENT_SECRET')
                || !defined('EFI_CERT_PATH') || !defined('EFI_PAYER_PIX_KEY')
            ) {
                throw new RuntimeException('Credenciais EfiPay incompletas em config.pix.local.php');
            }

            $client = pix_efipay_client();
            $whResult = pix_ensure_efi_webhook($client);
            if (!empty($whResult['skipped'])) {
                /* Sem escopo webhook: tenta enviar se webhook já foi cadastrado no painel Efi. */
            }

            $result = $client->sendPix(
                $idEnvio,
                $valor,
                EFI_PAYER_PIX_KEY,
                $recipient,
                $infoPagador
            );

            // #region agent log
            @file_put_contents(dirname(__DIR__) . '/debug-97c411.log', json_encode([
                'sessionId' => '97c411', 'hypothesisId' => 'H2', 'runId' => 'pix-send',
                'location' => 'pix_api.php:pix_send_payment:efi-result',
                'message' => 'Efi sendPix response',
                'data' => [
                    'withdrawal_id' => $id,
                    'status' => $result['status'] ?? null,
                    'recipient_type' => (string) ($wd['pix_key_type'] ?? ''),
                    'recipient_masked' => substr((string) ($wd['pix_key'] ?? ''), 0, 6) . '…',
                    'valor' => $valor,
                    'detail' => pix_extract_efi_error_detail($result),
                ],
                'timestamp' => (int) round(microtime(true) * 1000),
            ], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
            // #endregion

            $update = pix_apply_efi_status_patch($result, $wd);
            $update['pix_id_envio'] = $idEnvio;

            $repo->update($id, $update);

            $pixErr = (string) ($update['pix_error'] ?? '');
            $isErr = ($update['pix_status'] ?? '') === 'erro';

            return [
                'ok' => !$isErr,
                'provider' => 'efipay',
                'data' => $result,
                'pix_status' => $update['pix_status'],
                'withdrawal_id' => $id,
                'error' => $isErr ? ($pixErr !== '' ? $pixErr : 'PIX recusado pelo banco') : null,
            ];
        }

        if ($provider !== 'mock') {
            throw new RuntimeException('Provedor PIX inválido: ' . $provider);
        }

        /* Mock: apenas desenvolvimento local — nunca credita banco real. */
        $mock = new MockProvider();
        $result = $mock->sendPix($idEnvio, $valor, $recipient, $infoPagador);
        $e2e = 'MOCK' . strtoupper(substr(md5($idEnvio . $valor), 0, 28));

        $repo->update($id, [
            'pix_status' => 'pago',
            'pix_id_envio' => $idEnvio,
            'pix_e2e_id' => $e2e,
            'pix_error' => null,
            'status' => 'pago',
            'processed_at' => gmdate('c'),
            'pix_paid_at' => gmdate('c'),
        ]);

        return [
            'ok' => true,
            'provider' => 'mock',
            'data' => $result,
            'pix_status' => 'pago',
            'withdrawal_id' => $id,
            'warning' => 'Modo mock — sem transferência bancária real.',
        ];
    } catch (Throwable $e) {
        $errMsg = pix_humanize_efipay_error($e->getMessage());
        if (pix_is_insufficient_scope($e)) {
            $errMsg = pix_webhook_scope_help(pix_webhook_url());
        } elseif (
            stripos($errMsg, 'webhook cadastrado') !== false
            || (stripos($errMsg, 'webhook') !== false && stripos($errMsg, 'chave') !== false)
        ) {
            $errMsg .= ' Cadastre o webhook via escopos Efi (Alterar/Consultar Webhooks) e setup_webhook.';
        }

        $repo->update($id, [
            'pix_status' => 'erro',
            'pix_id_envio' => $idEnvio,
            'pix_error' => $errMsg,
            'status' => 'erro',
        ]);

        return [
            'ok' => false,
            'provider' => $provider,
            'error' => $errMsg,
            'withdrawal_id' => $id,
        ];
    }
}

$action = strtolower((string) ($_GET['action'] ?? ''));
$input = pix_input();

if ($action === 'webhook') {
    // Stub: registra payload; em produção validar assinatura EfiPay e atualizar status.
    $payload = $input;
    if (empty($payload)) {
        $raw = file_get_contents('php://input');
        $payload = $raw ? (json_decode($raw, true) ?: ['raw' => $raw]) : [];
    }

    $logDir = dirname(__DIR__) . '/storage';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0750, true);
    }
    @file_put_contents(
        $logDir . '/pix_webhook.log',
        gmdate('c') . ' ' . json_encode($payload, JSON_UNESCAPED_UNICODE) . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );

    pix_json_response(['ok' => true, 'message' => 'Webhook recebido (stub).']);
}

if (!pix_auth_ok()) {
    pix_json_response(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

if ($action === 'health') {
    $dbOk = pix_db_backend() === 'mysql'
        ? (defined('DB_HOST') && DB_HOST !== '')
        : pix_service_key_configured();
    $out = [
        'ok' => true,
        'provider' => defined('PIX_PROVIDER') ? PIX_PROVIDER : 'mock',
        'has_database' => $dbOk,
        'has_supabase' => pix_db_backend() === 'supabase' ? $dbOk : null,
        'has_pix_token' => defined('PIX_INTERNAL_TOKEN') && PIX_INTERNAL_TOKEN !== '',
        'supabase_url' => defined('SUPABASE_URL') ? SUPABASE_URL : null,
        'db_backend' => pix_db_backend(),
        'has_payer_key' => defined('EFI_PAYER_PIX_KEY') && EFI_PAYER_PIX_KEY !== '',
        'cert_exists' => defined('EFI_CERT_PATH') && is_file(EFI_CERT_PATH),
        'cert_bytes' => (defined('EFI_CERT_PATH') && is_file(EFI_CERT_PATH)) ? filesize(EFI_CERT_PATH) : null,
        'sandbox' => defined('EFI_SANDBOX') ? (bool) EFI_SANDBOX : null,
    ];
    if (defined('EFI_CLIENT_ID') && EFI_CLIENT_ID !== '') {
        $cid = (string) EFI_CLIENT_ID;
        $out['efi_client_suffix'] = substr($cid, -12);
        $out['efi_app_hint'] = str_contains($cid, '267999cac98e')
            ? 'soublu-pix-saques (homolog)'
            : (str_contains($cid, '99ecba264a02')
                ? 'soublu-pix-saques (produção antiga)'
                : (str_contains($cid, '1741ef428be7') ? 'API Pix K PROMOTORA (produção)' : 'outra app — confira config.pix.local.php'));
    }
    $provider = strtolower((string) ($out['provider'] ?? 'mock'));
    if ($provider === 'efipay') {
        try {
            $client = pix_efipay_client();
            $client->getAccessToken();
            $out['efi_oauth'] = true;
            $whUrl = pix_webhook_url();
            $out['webhook_url'] = $whUrl !== '' ? $whUrl : null;
            if ($whUrl !== '' && defined('EFI_PAYER_PIX_KEY') && EFI_PAYER_PIX_KEY !== '') {
                try {
                    $wh = $client->getWebhook((string) EFI_PAYER_PIX_KEY);
                    $registered = $wh !== null ? (string) ($wh['webhookUrl'] ?? $wh['url'] ?? '') : '';
                    $out['webhook_registered'] = $registered === $whUrl;
                    $out['webhook_current'] = $registered !== '' ? $registered : null;
                } catch (Throwable $whEx) {
                    $out['webhook_registered'] = false;
                    $out['webhook_error'] = $whEx->getMessage();
                    if (pix_is_insufficient_scope($whEx)) {
                        $out['webhook_hint'] = pix_webhook_scope_help($whUrl);
                    }
                }
            }
        } catch (Throwable $e) {
            $out['ok'] = false;
            $out['efi_oauth'] = false;
            $out['error'] = $e->getMessage();
        }
    }
    $out['pix_payment_endpoint'] = 'PUT /v3/gn/pix/{idEnvio}';
    $out['note'] = 'GET /v2/webhook/* (Sucesso no painel Efi) só consulta o webhook cadastrado — não envia dinheiro. '
        . 'Pagamento real só após PUT /v3/gn/pix/... na aprovação do saque ou botão Reenviar PIX.';
    pix_json_response($out, $out['ok'] ? 200 : 503);
}

if ($action === 'setup_webhook') {
    if (!defined('EFI_PAYER_PIX_KEY') || EFI_PAYER_PIX_KEY === '') {
        pix_json_response(['ok' => false, 'error' => 'EFI_PAYER_PIX_KEY não configurada.'], 503);
    }
    try {
        $client = pix_efipay_client();
        $force = !empty($input['force']);
        $result = pix_ensure_efi_webhook($client, $force);
        if (!empty($result['skipped'])) {
            pix_json_response([
                'ok' => false,
                'error' => $result['hint'] ?? 'Escopos de webhook insuficientes na app Efi.',
            ], 403);
        }
        pix_json_response($result);
    } catch (Throwable $e) {
        $msg = $e->getMessage();
        if (pix_is_insufficient_scope($e)) {
            $msg = pix_webhook_scope_help(pix_webhook_url());
        }
        pix_json_response(['ok' => false, 'error' => $msg], 502);
    }
}

function pix_db_backend(): string
{
    if (defined('PIX_DB_BACKEND') && trim((string) PIX_DB_BACKEND) !== '') {
        return strtolower(trim((string) PIX_DB_BACKEND));
    }
    /* Padrão do projeto: saques e PIX gravam no Supabase (mesmo banco do painel). */
    return 'supabase';
}

function pix_withdrawal_repository(): object
{
    $backend = pix_db_backend();
    if ($backend === 'mysql') {
        if (!defined('DB_HOST') || DB_HOST === '' || !defined('DB_NAME')) {
            throw new RuntimeException('PIX_DB_BACKEND=mysql mas config.db.local.php incompleto.');
        }
        require_once __DIR__ . '/lib/WithdrawalRepositoryMysql.php';
        return new WithdrawalRepositoryMysql();
    }
    if (!pix_service_key_configured()) {
        throw new RuntimeException(
            'SUPABASE_SERVICE_KEY ausente em config.pix.local.php. '
            . 'Use a chave service_role do Supabase (Settings → API), não a anon key do navegador.'
        );
    }
    return new WithdrawalRepository((string) SUPABASE_URL, (string) SUPABASE_SERVICE_KEY);
}

try {
    $repo = pix_withdrawal_repository();
} catch (RuntimeException $e) {
    pix_json_response(['ok' => false, 'error' => $e->getMessage()], 503);
}
$provider = defined('PIX_PROVIDER') ? strtolower((string) PIX_PROVIDER) : 'mock';

$withdrawalId = (string) ($input['withdrawal_id'] ?? $input['id'] ?? '');

if ($action === 'pay') {
    if ($withdrawalId === '') {
        pix_json_response(['ok' => false, 'error' => 'withdrawal_id obrigatório.'], 400);
    }

    $wd = $repo->find($withdrawalId);
    if (!$wd) {
        pix_json_response(['ok' => false, 'error' => 'Saque não encontrado.'], 404);
    }

    if (!pix_can_pay_withdrawal($wd)) {
        pix_json_response([
            'ok' => false,
            'error' => 'Saque não elegível para pagamento PIX.',
            'status' => $wd['status'] ?? null,
            'pix_status' => $wd['pix_status'] ?? null,
        ], 409);
    }

    $result = pix_send_payment($repo, $wd, $provider);
    pix_json_response($result, $result['ok'] ? 200 : 502);
}

if ($action === 'status') {
    if ($withdrawalId === '') {
        pix_json_response(['ok' => false, 'error' => 'withdrawal_id obrigatório.'], 400);
    }

    $wd = $repo->find($withdrawalId);
    if (!$wd) {
        pix_json_response(['ok' => false, 'error' => 'Saque não encontrado.'], 404);
    }

    $idEnvio = (string) ($wd['pix_id_envio'] ?? EfiPayClient::sanitizeIdEnvio($withdrawalId));

    if ($provider === 'efipay' && $idEnvio !== '') {
        try {
            $client = new EfiPayClient(
                EFI_CLIENT_ID,
                EFI_CLIENT_SECRET,
                EFI_CERT_PATH,
                defined('EFI_CERT_PASSWORD') ? (string) EFI_CERT_PASSWORD : '',
                defined('EFI_SANDBOX') ? (bool) EFI_SANDBOX : true
            );
            $remote = $client->getStatusByIdEnvio($idEnvio);
            if ($remote) {
                // #region agent log
                @file_put_contents(dirname(__DIR__) . '/debug-97c411.log', json_encode([
                    'sessionId' => '97c411', 'hypothesisId' => 'H3', 'runId' => 'pix-status',
                    'location' => 'pix_api.php:status:efi-remote',
                    'message' => 'Efi status poll',
                    'data' => [
                        'withdrawal_id' => $withdrawalId,
                        'status' => $remote['status'] ?? null,
                        'detail' => pix_extract_efi_error_detail($remote),
                    ],
                    'timestamp' => (int) round(microtime(true) * 1000),
                ], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
                // #endregion
                $patch = pix_apply_efi_status_patch($remote, $wd);
                $wd = $repo->update($withdrawalId, $patch) ?? $wd;
            }
        } catch (Throwable $e) {
            pix_json_response([
                'ok' => false,
                'error' => $e->getMessage(),
                'withdrawal' => $wd,
            ], 502);
        }
    } elseif ($provider === 'mock') {
        $mock = new MockProvider();
        $remote = $mock->getStatusByIdEnvio($idEnvio);
        $wd = $repo->update($withdrawalId, [
            'pix_status' => 'pago',
            'status' => 'pago',
            'pix_e2e_id' => $remote['endToEndId'] ?? null,
        ]) ?? $wd;
    }

    pix_json_response([
        'ok' => true,
        'withdrawal' => $wd,
        'pix_status' => $wd['pix_status'] ?? null,
    ]);
}

if (defined('PIX_API_CLI') && PIX_API_CLI && isset($GLOBALS['PIX_API_CLI_RESULT'])) {
    return;
}

pix_json_response(['ok' => false, 'error' => 'Ação inválida. Use action=pay|status|webhook|health|setup_webhook'], 400);
