<?php
declare(strict_types=1);

/**
 * Cliente Z-API — https://developer.z-api.io
 * Espelha a superfície usada por whatsapp_api.php (compatível com EvolutionClient).
 */
final class ZApiClient
{
    private string $baseUrl;
    private string $instanceId;
    private string $token;
    private string $clientToken;

    public function __construct(?string $instanceId = null, ?string $token = null)
    {
        $this->baseUrl = rtrim(
            defined('Z_API_BASE_URL') && trim((string) Z_API_BASE_URL) !== ''
                ? (string) Z_API_BASE_URL
                : 'https://api.z-api.io',
            '/'
        );
        $this->instanceId = trim($instanceId ?? (defined('Z_API_INSTANCE_ID') ? (string) Z_API_INSTANCE_ID : ''));
        $this->token = trim($token ?? (defined('Z_API_TOKEN') ? (string) Z_API_TOKEN : ''));
        $this->clientToken = defined('Z_API_CLIENT_TOKEN') ? trim((string) Z_API_CLIENT_TOKEN) : '';
    }

    public static function fromInstanceRow(?array $row): self
    {
        $id = trim((string) ($row['provider_instance_id'] ?? $row['instance_name'] ?? ''));
        $tok = trim((string) ($row['provider_token'] ?? ''));
        if ($id === '' && defined('Z_API_INSTANCE_ID')) {
            $id = (string) Z_API_INSTANCE_ID;
        }
        if ($tok === '' && defined('Z_API_TOKEN')) {
            $tok = (string) Z_API_TOKEN;
        }
        return new self($id, $tok);
    }

    public static function isConfigured(): bool
    {
        if (defined('Z_API_ENABLED') && Z_API_ENABLED === false) {
            return false;
        }
        $id = defined('Z_API_INSTANCE_ID') ? trim((string) Z_API_INSTANCE_ID) : '';
        $tok = defined('Z_API_TOKEN') ? trim((string) Z_API_TOKEN) : '';
        if ($id === '' || $tok === '') {
            return false;
        }
        foreach (['SUA_INSTANCIA', 'SEU_TOKEN', 'COLE_AQUI', 'change_me', 'example'] as $needle) {
            if (stripos($id . $tok, $needle) !== false) {
                return false;
            }
        }
        return true;
    }

    private function endpoint(string $action): string
    {
        if ($this->instanceId === '' || $this->token === '') {
            throw new RuntimeException('Z-API não configurada (config.zapi.local.php).');
        }
        return $this->baseUrl . '/instances/' . rawurlencode($this->instanceId)
            . '/token/' . rawurlencode($this->token) . '/' . ltrim($action, '/');
    }

    public function request(string $method, string $path, ?array $body = null): array
    {
        $url = str_starts_with($path, 'http') ? $path : $this->endpoint($path);
        $ch = curl_init($url);
        $headers = ['Content-Type: application/json'];
        if ($this->clientToken !== '') {
            $headers[] = 'Client-Token: ' . $this->clientToken;
        }
        $isMediaFetch = str_contains($path, 'download') || str_contains($path, 'base64');
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => $isMediaFetch ? 45 : 15,
            CURLOPT_ENCODING => '',
        ];
        if (defined('Z_API_SSL_VERIFY') && Z_API_SSL_VERIFY === false) {
            $opts[CURLOPT_SSL_VERIFYPEER] = false;
            $opts[CURLOPT_SSL_VERIFYHOST] = 0;
        }
        if ($body !== null) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
        }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            throw new RuntimeException('Z-API: ' . ($err ?: 'falha na requisição'));
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            if (is_string($raw) && preg_match('/^[A-Za-z0-9+/=]{80,}$/', trim($raw))) {
                return ['value' => 'data:image/png;base64,' . trim($raw)];
            }
            $decoded = ['raw' => $raw];
        }
        if ($code >= 400) {
            $msg = $decoded['message'] ?? $decoded['error'] ?? $raw;
            if (is_array($msg)) {
                $msg = json_encode($msg, JSON_UNESCAPED_UNICODE);
            }
            throw new RuntimeException('Z-API HTTP ' . $code . ': ' . (string) $msg);
        }
        return $decoded;
    }

    public function createInstance(string $instanceName, string $webhookUrl): array
    {
        $this->setWebhook($instanceName, $webhookUrl);
        return ['instanceName' => $this->instanceId, 'instance' => ['instanceName' => $this->instanceId]];
    }

    public function connect(string $instanceName): array
    {
        foreach (['qr-code/image', 'qrcode-image', 'qr-code'] as $path) {
            try {
                return $this->request('GET', $path);
            } catch (Throwable $e) {
                $last = $e;
            }
        }
        throw $last ?? new RuntimeException('Falha ao obter QR Code Z-API.');
    }

    public function connectionState(string $instanceName): array
    {
        return $this->request('GET', 'status');
    }

    public function fetchInstances(): array
    {
        return [
            [
                'instanceName' => $this->instanceId,
                'name' => $this->instanceId,
                'connectionStatus' => self::parseConnectionState($this->connectionState($this->instanceId)),
            ],
        ];
    }

    public function logout(string $instanceName): array
    {
        return $this->request('GET', 'disconnect');
    }

    public function deleteInstance(string $instanceName): array
    {
        return $this->logout($instanceName);
    }

    public function setWebhook(string $instanceName, string $webhookUrl): array
    {
        foreach (['PUT', 'POST'] as $method) {
            try {
                return $this->request($method, 'update-every-webhooks', [
                    'value' => $webhookUrl,
                    'notifySentByMe' => true,
                ]);
            } catch (Throwable $e) {
                $last = $e;
            }
        }
        throw $last ?? new RuntimeException('Falha ao configurar webhooks Z-API.');
    }

    public function findContacts(string $instanceName): array
    {
        $resp = $this->request('GET', 'contacts');
        return self::normalizeListResponse($resp);
    }

    public function findChats(string $instanceName, ?int $limit = null, ?int $offset = null): array
    {
        $page = $offset !== null && $limit !== null && $limit > 0
            ? (int) floor($offset / $limit) + 1
            : 1;
        $pageSize = $limit !== null ? max(1, min(100, $limit)) : 100;
        $qs = '?page=' . $page . '&pageSize=' . $pageSize;
        $resp = $this->request('GET', 'chats' . $qs);
        $rows = self::normalizeListResponse($resp);
        return array_map(static fn (array $row) => self::normalizeChatRow($row), $rows);
    }

    public function fetchProfilePictureUrl(string $instanceName, string $numberOrJid): array
    {
        $phone = self::digitsFromTarget($numberOrJid);
        if ($phone === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        foreach (['profile-picture/' . $phone, 'contacts/' . $phone . '/profile-picture'] as $path) {
            try {
                $resp = $this->request('GET', $path);
                $url = (string) ($resp['link'] ?? $resp['profilePictureUrl'] ?? $resp['imgUrl'] ?? $resp['value'] ?? '');
                if ($url !== '') {
                    return ['profilePictureUrl' => $url];
                }
            } catch (Throwable $e) {
                $last = $e;
            }
        }
        try {
            $meta = $this->fetchProfile($instanceName, $numberOrJid);
            $url = (string) ($meta['imgUrl'] ?? $meta['profilePictureUrl'] ?? '');
            if ($url !== '') {
                return ['profilePictureUrl' => $url];
            }
        } catch (Throwable $e) {
            $last = $e;
        }
        throw $last ?? new RuntimeException('Falha ao buscar foto de perfil.');
    }

    public function fetchProfile(string $instanceName, string $numberOrJid): array
    {
        $phone = self::digitsFromTarget($numberOrJid);
        if ($phone === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        return $this->request('GET', 'contacts/' . $phone);
    }

    /** Z-API não expõe histórico completo — mensagens vêm via webhook. */
    public function findMessages(string $instanceName, string $remoteJid, int $limit = 40): array
    {
        return ['messages' => ['records' => []], 'data' => []];
    }

    public function sendText(string $instanceName, string $number, string $text): array
    {
        $phone = self::digitsFromTarget($number);
        if ($phone === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        $resp = $this->request('POST', 'send-text', [
            'phone' => $phone,
            'message' => $text,
        ]);
        return self::normalizeSendResponse($resp);
    }

    public function deleteMessageForEveryone(
        string $instanceName,
        string $waMessageId,
        string $remoteJid,
        bool $fromMe = true
    ): array {
        $phone = self::digitsFromTarget($remoteJid);
        if ($phone === '' || $waMessageId === '') {
            throw new InvalidArgumentException('ID da mensagem ou telefone inválido.');
        }
        return $this->request('DELETE', 'messages?messageId=' . rawurlencode($waMessageId)
            . '&phone=' . rawurlencode($phone) . '&owner=' . ($fromMe ? 'true' : 'false'));
    }

    public function sendMedia(
        string $instanceName,
        string $number,
        string $mediatype,
        string $media,
        ?string $mimetype = null,
        ?string $caption = null,
        ?string $fileName = null
    ): array {
        $phone = self::digitsFromTarget($number);
        if ($phone === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        $payload = self::prepareMediaPayload($media, $mimetype);
        $body = ['phone' => $phone];
        $action = match ($mediatype) {
            'video' => 'send-video',
            'document' => 'send-document',
            default => 'send-image',
        };
        $field = match ($mediatype) {
            'video' => 'video',
            'document' => 'document',
            default => 'image',
        };
        $body[$field] = $payload;
        if ($caption !== null && $caption !== '' && $mediatype !== 'document') {
            $body['caption'] = $caption;
        }
        if ($fileName !== null && $fileName !== '' && $mediatype === 'document') {
            $body['fileName'] = $fileName;
        }
        return self::normalizeSendResponse($this->request('POST', $action, $body));
    }

    public function sendWhatsAppAudio(string $instanceName, string $number, string $audio, ?string $mimetype = null): array
    {
        $phone = self::digitsFromTarget($number);
        if ($phone === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        $body = [
            'phone' => $phone,
            'audio' => self::prepareMediaPayload($audio, $mimetype ?: 'audio/ogg'),
        ];
        return self::normalizeSendResponse($this->request('POST', 'send-audio', $body));
    }

    public function sendSticker(string $instanceName, string $number, string $sticker): array
    {
        $phone = self::digitsFromTarget($number);
        if ($phone === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        return self::normalizeSendResponse($this->request('POST', 'send-sticker', [
            'phone' => $phone,
            'sticker' => self::prepareMediaPayload($sticker, 'image/webp'),
        ]));
    }

    public function getBase64FromMediaMessage(
        string $instanceName,
        array $messagePayload,
        bool $convertToMp4 = false
    ): ?array {
        $url = self::mediaUrlFromPayload($messagePayload);
        if ($url === '') {
            return null;
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 45,
        ]);
        $binary = curl_exec($ch);
        curl_close($ch);
        if (!is_string($binary) || $binary === '') {
            return null;
        }
        $mime = (string) ($messagePayload['mimetype'] ?? $messagePayload['mimeType'] ?? 'application/octet-stream');
        return ['base64' => base64_encode($binary), 'mimetype' => $mime];
    }

    public static function parseConnectionState(array $resp): string
    {
        foreach (['connected', 'smartphoneConnected', 'isConnected'] as $k) {
            if (!empty($resp[$k])) {
                return 'open';
            }
        }
        $state = strtolower((string) (
            $resp['status']
            ?? $resp['session']
            ?? $resp['value']
            ?? $resp['state']
            ?? ''
        ));
        if (in_array($state, ['true', 'connected', 'open', 'online', '1'], true)) {
            return 'open';
        }
        if (in_array($state, ['connecting', 'qrcode', 'pairing', 'loading'], true)) {
            return 'connecting';
        }
        return 'close';
    }

    public static function parseInstanceListState(array $resp, string $instanceName): ?string
    {
        $rows = $resp;
        if (isset($resp[0]) && is_array($resp[0])) {
            $rows = $resp;
        }
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $name = (string) ($row['name'] ?? $row['instanceName'] ?? '');
            if ($name !== '' && $name !== $instanceName) {
                continue;
            }
            return self::parseConnectionState($row);
        }
        return null;
    }

    public static function extractQr(array $resp): ?string
    {
        foreach (['value', 'qrcode', 'base64', 'qrCode'] as $k) {
            $c = $resp[$k] ?? null;
            if (!is_string($c) || $c === '') {
                continue;
            }
            if (str_starts_with($c, 'data:image')) {
                return $c;
            }
            if (preg_match('/^[A-Za-z0-9+/=]{80,}$/', $c)) {
                return 'data:image/png;base64,' . $c;
            }
            return $c;
        }
        return null;
    }

  /** Converte linha de chat Z-API para formato compatível com wa_contact_jid_from_row. */
    public static function normalizeChatRow(array $row): array
    {
        $phone = preg_replace('/\D+/', '', (string) ($row['phone'] ?? '')) ?? '';
        if ($phone !== '') {
            $row['remoteJid'] = $phone . '@s.whatsapp.net';
            $row['id'] = $row['remoteJid'];
        }
        if (!empty($row['name']) && empty($row['pushName'])) {
            $row['pushName'] = $row['name'];
        }
        return $row;
    }

    private static function normalizeListResponse(array $resp): array
    {
        if (array_is_list($resp)) {
            return $resp;
        }
        foreach (['data', 'contacts', 'chats', 'response', 'value'] as $k) {
            if (isset($resp[$k]) && is_array($resp[$k]) && array_is_list($resp[$k])) {
                return $resp[$k];
            }
        }
        return [];
    }

    private static function normalizeSendResponse(array $resp): array
    {
        $id = (string) ($resp['messageId'] ?? $resp['id'] ?? $resp['zaapId'] ?? '');
        return array_merge($resp, [
            'messageId' => $id,
            'key' => ['id' => $id],
        ]);
    }

    private static function digitsFromTarget(string $numberOrJid): string
    {
        $raw = trim($numberOrJid);
        if ($raw === '') {
            return '';
        }
        if (str_contains($raw, '@lid')) {
            $local = explode('@', strtolower($raw))[0] ?? '';
            $digits = preg_replace('/\D+/', '', strtok($local, ':') ?: $local) ?? '';
            return (strlen($digits) >= 10 && strlen($digits) <= 13) ? $digits : '';
        }
        if (str_contains($raw, '@')) {
            $local = explode('@', $raw)[0] ?? '';
            $digits = preg_replace('/\D+/', '', strtok($local, ':') ?: $local) ?? '';
            return (strlen($digits) >= 10 && strlen($digits) <= 13) ? $digits : '';
        }
        $digits = preg_replace('/\D+/', '', $raw) ?? '';
        return (strlen($digits) >= 10 && strlen($digits) <= 13) ? $digits : '';
    }

    private static function prepareMediaPayload(string $media, ?string $mimetype = null): string
    {
        if (str_starts_with($media, 'http://') || str_starts_with($media, 'https://')) {
            return $media;
        }
        if (str_contains($media, 'base64,')) {
            return $media;
        }
        $mime = $mimetype ?: 'application/octet-stream';
        return 'data:' . $mime . ';base64,' . $media;
    }

    public static function mediaUrlFromPayload(array $payload): string
    {
        foreach (['imageUrl', 'audioUrl', 'videoUrl', 'documentUrl', 'stickerUrl', 'url'] as $k) {
            if (!empty($payload[$k]) && is_string($payload[$k])) {
                return trim($payload[$k]);
            }
        }
        foreach (['image', 'audio', 'video', 'document', 'sticker'] as $block) {
            if (!isset($payload[$block]) || !is_array($payload[$block])) {
                continue;
            }
            foreach (['imageUrl', 'audioUrl', 'videoUrl', 'documentUrl', 'url'] as $k) {
                if (!empty($payload[$block][$k]) && is_string($payload[$block][$k])) {
                    return trim($payload[$block][$k]);
                }
            }
        }
        return '';
    }
}
