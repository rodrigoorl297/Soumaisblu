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

    public function request(string $method, string $path, ?array $body = null, int $timeoutSec = 0): array
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
        // Timeouts curtos: Evolution lenta satura o pool PHP da Locaweb e derruba login/propostas.
        $isMediaFetch = str_contains($path, 'getBase64') || str_contains($path, 'downloadMedia');
        $isMediaSend = str_contains($path, 'sendMedia')
            || str_contains($path, 'sendWhatsAppAudio')
            || str_contains($path, 'sendSticker');
        $isProfileOp = str_contains($path, 'updateProfile') || str_contains($path, 'fetchPrivacySettings');
        $isProfileFetch = str_contains($path, 'fetchProfile') || str_contains($path, 'fetchProfilePictureUrl');
        $isFindChats = str_contains($path, 'findChats') || str_contains($path, 'findContacts');
        $isConnProbe = str_contains($path, 'connectionState') || str_contains($path, 'fetchInstances');
        $timeout = $timeoutSec > 0
            ? $timeoutSec
            : ($isMediaFetch || $isMediaSend || $isProfileOp
                ? 20
                : ($isFindChats ? 8 : ($isProfileFetch || $isConnProbe ? 5 : 8)));
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_TCP_KEEPALIVE => 1,                  // reaproveita conexão TLS
            CURLOPT_TCP_NODELAY => true,
            CURLOPT_FORBID_REUSE => false,
            CURLOPT_FRESH_CONNECT => false,
            CURLOPT_ENCODING => '',                      // aceita gzip (resposta menor)
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
            $msg = $decoded['message']
                ?? $decoded['error']
                ?? ($decoded['response']['message'] ?? null)
                ?? ($decoded['response']['error'] ?? null)
                ?? $raw;
            if (is_array($msg)) {
                $msg = json_encode($msg, JSON_UNESCAPED_UNICODE);
            }
            $msg = trim((string) $msg);
            if ($msg === '' || stripos($msg, 'internal server error') !== false) {
                $msg = 'Falha na Evolution API (HTTP ' . $code . '). Reconecte o WhatsApp e tente novamente.';
            }
            throw new RuntimeException('Evolution HTTP ' . $code . ': ' . $msg);
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
                'enabled' => true,
                'url' => $webhookUrl,
                'byEvents' => false,
                'base64' => true,
                'events' => [
                    'MESSAGES_UPSERT',
                    'CONNECTION_UPDATE',
                    'QRCODE_UPDATED',
                    'CONTACTS_UPDATE',
                    'CONTACTS_UPSERT',
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
                    'CONTACTS_UPDATE',
                    'CONTACTS_UPSERT',
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

    public function fetchProfilePictureUrl(string $instanceName, string $numberOrJid): array
    {
        $raw = trim($numberOrJid);
        if ($raw === '') {
            throw new InvalidArgumentException('Número ou JID inválido.');
        }
        $payloads = [];
        if (str_contains($raw, '@')) {
            $payloads[] = ['number' => $raw];
            $local = strtok($raw, '@') ?: '';
            $digits = preg_replace('/\D+/', '', $local) ?? '';
            if (strlen($digits) >= 10 && strlen($digits) <= 13) {
                $payloads[] = ['number' => $digits];
                $payloads[] = ['number' => $digits . '@s.whatsapp.net'];
            }
        } else {
            $digits = preg_replace('/\D+/', '', $raw) ?? '';
            if ($digits === '') {
                throw new InvalidArgumentException('Número inválido.');
            }
            $payloads[] = ['number' => $digits];
            $payloads[] = ['number' => $digits . '@s.whatsapp.net'];
        }
        $last = null;
        foreach ($payloads as $body) {
            try {
                return $this->request('POST', '/chat/fetchProfilePictureUrl/' . rawurlencode($instanceName), $body);
            } catch (Throwable $e) {
                $last = $e;
            }
        }
        throw $last ?? new RuntimeException('Falha ao buscar foto de perfil.');
    }

    /** Perfil completo do contato (nome, wid, foto) — funciona com @lid em Evolution recente. */
    public function fetchProfile(string $instanceName, string $numberOrJid, int $timeoutSec = 0): array
    {
        $raw = trim($numberOrJid);
        if ($raw === '') {
            throw new InvalidArgumentException('Número ou JID inválido.');
        }
        $payloads = [['number' => $raw]];
        if (str_contains($raw, '@')) {
            $local = strtok($raw, '@') ?: '';
            $digits = preg_replace('/\D+/', '', $local) ?? '';
            if (strlen($digits) >= 10 && strlen($digits) <= 13) {
                $payloads[] = ['number' => $digits];
            }
        } else {
            $payloads[] = ['number' => $raw . '@s.whatsapp.net'];
        }
        $last = null;
        foreach ($payloads as $body) {
            try {
                return $this->request(
                    'POST',
                    '/chat/fetchProfile/' . rawurlencode($instanceName),
                    $body,
                    $timeoutSec > 0 ? $timeoutSec : 0
                );
            } catch (Throwable $e) {
                $last = $e;
            }
        }
        throw $last ?? new RuntimeException('Falha ao buscar perfil.');
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

    /** @return list<string> Número E.164 ou JID completo (@lid / @s.whatsapp.net). */
    private static function sendTargetVariants(string $numberOrJid): array
    {
        $raw = trim($numberOrJid);
        if ($raw === '') {
            throw new InvalidArgumentException('Número inválido.');
        }
        $variants = [];
        if (str_contains($raw, '@')) {
            $variants[] = $raw;
            $local = strtok($raw, '@') ?: '';
            $digits = preg_replace('/\D+/', '', $local) ?? '';
            if (strlen($digits) >= 10 && strlen($digits) <= 13) {
                $variants[] = $digits;
                $variants[] = $digits . '@s.whatsapp.net';
            }
        } else {
            $digits = preg_replace('/\D+/', '', $raw) ?? '';
            if ($digits === '') {
                throw new InvalidArgumentException('Número inválido.');
            }
            $variants[] = $digits;
            $variants[] = $digits . '@s.whatsapp.net';
        }
        return array_values(array_unique($variants));
    }

    public function sendText(string $instanceName, string $number, string $text): array
    {
        $last = null;
        foreach (self::sendTargetVariants($number) as $target) {
            foreach ([
                ['number' => $target, 'text' => $text],
                ['number' => $target, 'textMessage' => ['text' => $text]],
            ] as $body) {
                try {
                    return $this->request('POST', '/message/sendText/' . rawurlencode($instanceName), $body);
                } catch (Throwable $e) {
                    $last = $e;
                }
            }
        }
        throw $last ?? new RuntimeException('Falha ao enviar mensagem.');
    }

    /** Apaga mensagem para todos no WhatsApp (requer wa_message_id). */
    public function deleteMessageForEveryone(
        string $instanceName,
        string $waMessageId,
        string $remoteJid,
        bool $fromMe = true
    ): array {
        if ($waMessageId === '' || $remoteJid === '') {
            throw new InvalidArgumentException('ID da mensagem ou JID inválido.');
        }
        return $this->request('DELETE', '/chat/deleteMessageForEveryone/' . rawurlencode($instanceName), [
            'id' => $waMessageId,
            'remoteJid' => $remoteJid,
            'fromMe' => $fromMe,
        ]);
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
        $last = null;
        foreach (self::sendTargetVariants($number) as $target) {
            $body = [
                'number' => $target,
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
            try {
                return $this->request('POST', '/message/sendMedia/' . rawurlencode($instanceName), $body);
            } catch (Throwable $e) {
                $last = $e;
            }
        }
        throw $last ?? new RuntimeException('Falha ao enviar mídia.');
    }

    /**
     * Envia mensagem de voz / PTT (Evolution v2 — POST /message/sendWhatsAppAudio/{instance}).
     * O body usa o campo "audio" (URL ou base64), não "media"/"mediatype".
     */
    public function sendWhatsAppAudio(string $instanceName, string $number, string $audio, ?string $mimetype = null): array
    {
        if (trim($audio) === '') {
            throw new InvalidArgumentException('Áudio vazio.');
        }
        $last = null;
        $encodingTries = [true, false];
        foreach (self::sendTargetVariants($number) as $target) {
            foreach ($encodingTries as $encoding) {
                $body = [
                    'number' => $target,
                    'audio' => $audio,
                    'encoding' => $encoding,
                ];
                if ($mimetype !== null && $mimetype !== '') {
                    $body['mimetype'] = $mimetype;
                }
                try {
                    return $this->request('POST', '/message/sendWhatsAppAudio/' . rawurlencode($instanceName), $body);
                } catch (Throwable $e) {
                    $last = $e;
                }
            }
        }
        throw $last ?? new RuntimeException('Falha ao enviar áudio.');
    }

    /** Envia figurinha (Evolution v2 — POST /message/sendSticker/{instance}). */
    public function sendSticker(string $instanceName, string $number, string $sticker): array
    {
        $last = null;
        foreach (self::sendTargetVariants($number) as $target) {
            try {
                return $this->request('POST', '/message/sendSticker/' . rawurlencode($instanceName), [
                    'number' => $target,
                    'sticker' => $sticker,
                ]);
            } catch (Throwable $e) {
                $last = $e;
            }
        }
        throw $last ?? new RuntimeException('Falha ao enviar figurinha.');
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

    /** Garante instância realmente conectada antes de alterar perfil. */
    public function requireOpenInstance(string $instanceName): array
    {
        $stateResp = $this->connectionState($instanceName);
        $status = self::parseConnectionState($stateResp);
        if ($status !== 'open') {
            throw new RuntimeException('WhatsApp não está conectado. Escaneie o QR Code novamente.');
        }
        $owner = (string) (
            $stateResp['instance']['owner']
            ?? $stateResp['instance']['wuid']
            ?? $stateResp['owner']
            ?? $stateResp['wuid']
            ?? ''
        );
        if ($owner === '') {
            throw new RuntimeException('Sessão WhatsApp incompleta. Use "Reiniciar meu WhatsApp" e escaneie o QR de novo.');
        }
        return $stateResp;
    }

    public function updateProfileName(string $instanceName, string $name): array
    {
        $path = '/chat/updateProfileName/' . rawurlencode($instanceName);
        $last = null;
        foreach ([['name' => $name]] as $body) {
            for ($try = 0; $try < 2; $try++) {
                try {
                    return $this->request('POST', $path, $body, 30);
                } catch (Throwable $e) {
                    $last = $e;
                    if ($try === 0) {
                        usleep(600000);
                    }
                }
            }
        }
        throw $last ?? new RuntimeException('Falha ao atualizar nome do perfil.');
    }

    public function updateProfileStatus(string $instanceName, string $status): array
    {
        $path = '/chat/updateProfileStatus/' . rawurlencode($instanceName);
        $last = null;
        for ($try = 0; $try < 2; $try++) {
            try {
                return $this->request('POST', $path, ['status' => $status], 30);
            } catch (Throwable $e) {
                $last = $e;
                if ($try === 0) {
                    usleep(600000);
                }
            }
        }
        throw $last ?? new RuntimeException('Falha ao atualizar recado do perfil.');
    }

    public function updateProfilePicture(string $instanceName, string $picture): array
    {
        $path = '/chat/updateProfilePicture/' . rawurlencode($instanceName);
        $payloads = [['picture' => $picture]];
        if (str_starts_with($picture, 'data:image')) {
            $payloads[] = ['picture' => preg_replace('/^data:image\/[^;]+;base64,/', '', $picture) ?? $picture];
        }
        $last = null;
        foreach ($payloads as $body) {
            try {
                return $this->request('POST', $path, $body, 60);
            } catch (Throwable $e) {
                $last = $e;
            }
        }
        throw $last ?? new RuntimeException('Falha ao atualizar foto do perfil.');
    }
}
