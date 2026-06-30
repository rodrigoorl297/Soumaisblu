<?php
declare(strict_types=1);

final class EvolutionClient
{
    private string $baseUrl;
    private string $apiKey;

    public function __construct(?string $baseUrl = null, ?string $apiKey = null)
    {
        $this->baseUrl = rtrim($baseUrl ?? (defined('EVOLUTION_API_URL') ? (string) EVOLUTION_API_URL : ''), '/');
        $this->apiKey = $apiKey ?? (defined('EVOLUTION_API_KEY') ? (string) EVOLUTION_API_KEY : '');
    }

    public static function isConfigured(): bool
    {
        if (function_exists('soublu_evolution_is_configured')) {
            return soublu_evolution_is_configured();
        }
        if (defined('EVOLUTION_ENABLED') && EVOLUTION_ENABLED === false) {
            return false;
        }
        $url = defined('EVOLUTION_API_URL') ? trim((string) EVOLUTION_API_URL) : '';
        $key = defined('EVOLUTION_API_KEY') ? trim((string) EVOLUTION_API_KEY) : '';
        if ($url === '' || $key === '') {
            return false;
        }
        foreach (['SEU_SERVIDOR', 'SEU_SERVIDOR_EVOLUTION', 'seudominio'] as $needle) {
            if (stripos($url, $needle) !== false) {
                return false;
            }
        }
        foreach (['SUA_EVOLUTION', 'troque_esta', 'COLE_A_CHAVE', 'change_me'] as $needle) {
            if (stripos($key, $needle) !== false) {
                return false;
            }
        }
        return true;
    }

    public function request(string $method, string $path, ?array $body = null): array
    {
        if (!$this->isConfigured()) {
            throw new RuntimeException('Evolution API não configurada (config.evolution.local.php).');
        }
        $url = $this->baseUrl . '/' . ltrim($path, '/');
        $ch = curl_init($url);
        $headers = [
            'Content-Type: application/json',
            'apikey: ' . $this->apiKey,
        ];
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 45,
        ];
        if (defined('EVOLUTION_SSL_VERIFY') && EVOLUTION_SSL_VERIFY === false) {
            $opts[CURLOPT_SSL_VERIFYPEER] = false;
            $opts[CURLOPT_SSL_VERIFYHOST] = 0;
        }
        if ($body !== null) {
            if ($body instanceof \stdClass) {
                $body = json_decode(json_encode($body), true) ?: [];
            }
            $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
        }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            throw new RuntimeException('Evolution: ' . ($err ?: 'falha na requisição'));
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            $decoded = ['raw' => $raw];
        }
        if ($code >= 400) {
            $msg = $decoded['message'] ?? $decoded['error'] ?? $raw;
            if (is_array($msg)) {
                $msg = json_encode($msg, JSON_UNESCAPED_UNICODE);
            }
            throw new RuntimeException('Evolution HTTP ' . $code . ': ' . (string) $msg);
        }
        return $decoded;
    }

    public function createInstance(string $instanceName, string $webhookUrl): array
    {
        return $this->request('POST', '/instance/create', [
            'instanceName' => $instanceName,
            'qrcode' => true,
            'integration' => 'WHATSAPP-BAILEYS',
            'webhook' => [
                'url' => $webhookUrl,
                'byEvents' => false,
                'base64' => true,
                'events' => [
                    'MESSAGES_UPSERT',
                    'CONNECTION_UPDATE',
                    'QRCODE_UPDATED',
                ],
            ],
        ]);
    }

    public function connect(string $instanceName): array
    {
        return $this->request('GET', '/instance/connect/' . rawurlencode($instanceName));
    }

    public function connectionState(string $instanceName): array
    {
        return $this->request('GET', '/instance/connectionState/' . rawurlencode($instanceName));
    }

    /** Lista instâncias (Evolution v2) — connectionStatus pode divergir de connectionState. */
    public function fetchInstances(): array
    {
        return $this->request('GET', '/instance/fetchInstances');
    }

    public function logout(string $instanceName): array
    {
        return $this->request('DELETE', '/instance/logout/' . rawurlencode($instanceName));
    }

    public function deleteInstance(string $instanceName): array
    {
        return $this->request('DELETE', '/instance/delete/' . rawurlencode($instanceName));
    }

    /** Atualiza webhook da instância (base64 para mídia no payload). */
    public function setWebhook(string $instanceName, string $webhookUrl): array
    {
        return $this->request('POST', '/webhook/set/' . rawurlencode($instanceName), [
            'webhook' => [
                'enabled' => true,
                'url' => $webhookUrl,
                'byEvents' => false,
                'base64' => true,
                'events' => [
                    'MESSAGES_UPSERT',
                    'CONNECTION_UPDATE',
                    'QRCODE_UPDATED',
                ],
            ],
        ]);
    }

    /** Lista contatos da agenda WhatsApp (Evolution v2) — leve, sem mensagens. */
    public function findContacts(string $instanceName): array
    {
        $payloads = [
            ['where' => []],
            [],
        ];
        $last = null;
        foreach ($payloads as $body) {
            try {
                return $this->request('POST', '/chat/findContacts/' . rawurlencode($instanceName), $body);
            } catch (Throwable $e) {
                $last = $e;
            }
        }
        throw $last ?? new RuntimeException('Falha ao buscar contatos.');
    }

    /** Conversas recentes (espelho WhatsApp Web). Suporta paginação limit/offset. */
    public function findChats(string $instanceName, ?int $limit = null, ?int $offset = null): array
    {
        $payloads = [];
        if ($limit !== null || $offset !== null) {
            $body = [];
            if ($limit !== null) {
                $body['limit'] = max(1, $limit);
            }
            if ($offset !== null) {
                $body['offset'] = max(0, $offset);
            }
            $payloads[] = $body;
            $payloads[] = ['page' => (int) floor(($offset ?? 0) / max(1, $limit ?? 50)) + 1, 'offset' => $limit ?? 50];
        }
        $payloads[] = [];
        $last = null;
        foreach ($payloads as $body) {
            try {
                return $this->request('POST', '/chat/findChats/' . rawurlencode($instanceName), $body);
            } catch (Throwable $e) {
                $last = $e;
            }
        }
        throw $last ?? new RuntimeException('Falha ao buscar conversas.');
    }

    public function fetchProfilePictureUrl(string $instanceName, string $number): array
    {
        $digits = preg_replace('/\D+/', '', $number) ?? '';
        if ($digits === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        return $this->request('POST', '/chat/fetchProfilePictureUrl/' . rawurlencode($instanceName), [
            'number' => $digits,
        ]);
    }

    /** Mensagens recentes de uma conversa (espelho Evolution → CRM). */
    public function findMessages(string $instanceName, string $remoteJid, int $limit = 40): array
    {
        $jid = trim($remoteJid);
        if ($jid === '') {
            throw new InvalidArgumentException('remoteJid obrigatório.');
        }
        if (!str_contains($jid, '@')) {
            $digits = preg_replace('/\D+/', '', $jid) ?? '';
            $jid = $digits !== '' ? $digits . '@s.whatsapp.net' : $jid;
        }
        $body = [
            'where' => ['key' => ['remoteJid' => $jid]],
            'page' => 1,
            'offset' => max(5, min(80, $limit)),
        ];
        return $this->request('POST', '/chat/findMessages/' . rawurlencode($instanceName), $body);
    }

    public function sendText(string $instanceName, string $number, string $text): array
    {
        $digits = preg_replace('/\D+/', '', $number) ?? '';
        if ($digits === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        $payloads = [
            ['number' => $digits, 'text' => $text],
            ['number' => $digits, 'textMessage' => ['text' => $text]],
        ];
        $last = null;
        foreach ($payloads as $body) {
            try {
                return $this->request('POST', '/message/sendText/' . rawurlencode($instanceName), $body);
            } catch (Throwable $e) {
                $last = $e;
            }
        }
        throw $last ?? new RuntimeException('Falha ao enviar mensagem.');
    }

    /**
     * Envia imagem, áudio ou documento (Evolution v2 — POST /message/sendMedia/{instance}).
     *
     * @param string $mediatype image|audio|document|video
     * @param string $media URL pública ou base64
     */
    public function sendMedia(
        string $instanceName,
        string $number,
        string $mediatype,
        string $media,
        ?string $mimetype = null,
        ?string $caption = null,
        ?string $fileName = null
    ): array {
        $digits = preg_replace('/\D+/', '', $number) ?? '';
        if ($digits === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        $body = [
            'number' => $digits,
            'mediatype' => $mediatype,
            'media' => $media,
        ];
        if ($mimetype !== null && $mimetype !== '') {
            $body['mimetype'] = $mimetype;
        }
        if ($caption !== null && $caption !== '') {
            $body['caption'] = $caption;
        }
        if ($fileName !== null && $fileName !== '') {
            $body['fileName'] = $fileName;
        }
        return $this->request('POST', '/message/sendMedia/' . rawurlencode($instanceName), $body);
    }

    /**
     * Envia mensagem de voz / PTT (Evolution v2 — POST /message/sendWhatsAppAudio/{instance}).
     * O body usa o campo "audio" (URL ou base64), não "media"/"mediatype".
     */
    public function sendWhatsAppAudio(string $instanceName, string $number, string $audio, ?string $mimetype = null): array
    {
        $digits = preg_replace('/\D+/', '', $number) ?? '';
        if ($digits === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        if (trim($audio) === '') {
            throw new InvalidArgumentException('Áudio vazio.');
        }
        $body = [
            'number' => $digits,
            'audio' => $audio,
            'encoding' => true,
        ];
        if ($mimetype !== null && $mimetype !== '') {
            $body['mimetype'] = $mimetype;
        }
        return $this->request('POST', '/message/sendWhatsAppAudio/' . rawurlencode($instanceName), $body);
    }

    /** Envia figurinha (Evolution v2 — POST /message/sendSticker/{instance}). */
    public function sendSticker(string $instanceName, string $number, string $sticker): array
    {
        $digits = preg_replace('/\D+/', '', $number) ?? '';
        if ($digits === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        return $this->request('POST', '/message/sendSticker/' . rawurlencode($instanceName), [
            'number' => $digits,
            'sticker' => $sticker,
        ]);
    }

    /** Baixa mídia recebida (Evolution v2 — POST /chat/getBase64FromMediaMessage/{instance}). */
    public function getBase64FromMediaMessage(
        string $instanceName,
        array $messagePayload,
        bool $convertToMp4 = false
    ): ?array {
        $body = [
            'message' => $messagePayload,
            'convertToMp4' => $convertToMp4,
        ];
        $resp = $this->request('POST', '/chat/getBase64FromMediaMessage/' . rawurlencode($instanceName), $body);

        $b64 = null;
        foreach (['base64', 'data', 'media'] as $k) {
            if (!empty($resp[$k]) && is_string($resp[$k])) {
                $b64 = self::stripDataUriPrefix($resp[$k]);
                break;
            }
        }
        if ($b64 === null && isset($resp['response']) && is_string($resp['response'])) {
            $b64 = self::stripDataUriPrefix($resp['response']);
        }
        if ($b64 === null || $b64 === '') {
            return null;
        }

        $mimetype = null;
        foreach (['mimetype', 'mimeType', 'contentType', 'content_type'] as $k) {
            if (!empty($resp[$k]) && is_string($resp[$k])) {
                $mimetype = $resp[$k];
                break;
            }
        }

        return ['base64' => $b64, 'mimetype' => $mimetype];
    }

    private static function stripDataUriPrefix(string $b64): string
    {
        if (str_contains($b64, 'base64,')) {
            return substr($b64, (int) strpos($b64, 'base64,') + 7);
        }
        return $b64;
    }

    /** Extrai state open|close|connecting da resposta Evolution. */
    public static function parseConnectionState(array $resp): string
    {
        $state = $resp['instance']['state']
            ?? $resp['instance']['status']
            ?? $resp['state']
            ?? $resp['status']
            ?? $resp['connectionStatus']
            ?? '';
        $state = strtolower((string) $state);
        if (in_array($state, ['open', 'connected', 'online'], true)) {
            return 'open';
        }
        if (in_array($state, ['connecting', 'qrcode', 'pairing'], true)) {
            return 'connecting';
        }
        return 'close';
    }

    /** Estado da instância em fetchInstances (fallback quando connectionState trava). */
    public static function parseInstanceListState(array $resp, string $instanceName): ?string
    {
        $rows = $resp;
        foreach (['data', 'instances', 'response'] as $k) {
            if (isset($resp[$k]) && is_array($resp[$k])) {
                $rows = $resp[$k];
                break;
            }
        }
        if (!is_array($rows)) {
            return null;
        }
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $name = (string) ($row['name'] ?? $row['instanceName'] ?? $row['instance']['instanceName'] ?? '');
            if ($name !== $instanceName) {
                continue;
            }
            $state = strtolower((string) (
                $row['connectionStatus']
                ?? $row['status']
                ?? $row['state']
                ?? $row['instance']['state']
                ?? ''
            ));
            if (in_array($state, ['open', 'connected', 'online'], true)) {
                return 'open';
            }
            if (in_array($state, ['connecting', 'qrcode', 'pairing'], true)) {
                return 'connecting';
            }
            if (in_array($state, ['close', 'closed', 'offline', 'disconnected'], true)) {
                return 'close';
            }
            return null;
        }
        return null;
    }

    /** QR base64 ou pairing code da resposta connect/create (Evolution v2.x). */
    public static function extractQr(array $resp): ?string
    {
        $flat = self::flattenForQr($resp);
        $candidates = [
            $flat['base64'] ?? null,
            $flat['qrcode.base64'] ?? null,
            $flat['qrcode'] ?? null,
            $flat['code'] ?? null,
            $flat['pairingCode'] ?? null,
            $resp['base64'] ?? null,
            $resp['qrcode']['base64'] ?? null,
            $resp['qrcode'] ?? null,
            is_array($resp['qrcode'] ?? null) ? ($resp['qrcode']['base64'] ?? null) : null,
            $resp['response']['qrcode']['base64'] ?? null,
            $resp['response']['base64'] ?? null,
        ];
        foreach ($candidates as $c) {
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

    /** Achata array aninhado para achar chaves de QR (1 nível). */
    private static function flattenForQr(array $resp, string $prefix = ''): array
    {
        $out = [];
        foreach ($resp as $k => $v) {
            $key = $prefix === '' ? (string) $k : $prefix . '.' . $k;
            if (is_array($v)) {
                foreach ($v as $k2 => $v2) {
                    if (!is_array($v2)) {
                        $out[$key . '.' . $k2] = $v2;
                    }
                }
                if (isset($v['base64']) && is_string($v['base64'])) {
                    $out[$key . '.base64'] = $v['base64'];
                }
            } else {
                $out[$key] = $v;
            }
        }
        return $out;
    }
}
