<?php
declare(strict_types=1);

/**
 * Cliente WhaTicket Community — https://github.com/canove/whaticket
 * Interface compatível com EvolutionClient para whatsapp_api.php.
 */
final class WhaticketClient
{
    private string $baseUrl;
    private string $apiToken;
    private string $whatsappId;
    private string $bridgeUrl;

    public function __construct(
        ?string $baseUrl = null,
        ?string $apiToken = null,
        ?string $whatsappId = null,
        ?string $bridgeUrl = null
    ) {
        $this->baseUrl = rtrim($baseUrl ?? (defined('WHATICKET_API_URL') ? (string) WHATICKET_API_URL : ''), '/');
        $this->apiToken = $apiToken ?? (defined('WHATICKET_API_TOKEN') ? (string) WHATICKET_API_TOKEN : '');
        $this->whatsappId = trim($whatsappId ?? (defined('WHATICKET_WHATSAPP_ID') ? (string) WHATICKET_WHATSAPP_ID : '1'));
        $this->bridgeUrl = rtrim($bridgeUrl ?? (defined('WHATICKET_BRIDGE_URL') ? (string) WHATICKET_BRIDGE_URL : ''), '/');
    }

    public static function isConfigured(): bool
    {
        if (defined('WHATICKET_ENABLED') && WHATICKET_ENABLED === false) {
            return false;
        }
        $url = defined('WHATICKET_API_URL') ? trim((string) WHATICKET_API_URL) : '';
        $tok = defined('WHATICKET_API_TOKEN') ? trim((string) WHATICKET_API_TOKEN) : '';
        if ($url === '' || $tok === '') {
            return false;
        }
        foreach (['SEU_SERVIDOR', 'seudominio', 'change_me', 'COLE_AQUI'] as $needle) {
            if (stripos($url . $tok, $needle) !== false) {
                return false;
            }
        }
        return true;
    }

    public function request(string $method, string $path, ?array $body = null, int $timeoutSec = 15): array
    {
        if (!$this->isConfigured()) {
            throw new RuntimeException('WhaTicket não configurado (config.whaticket.local.php).');
        }
        $url = str_starts_with($path, 'http') ? $path : $this->baseUrl . '/' . ltrim($path, '/');
        $ch = curl_init($url);
        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->apiToken,
        ];
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => max(5, $timeoutSec),
            CURLOPT_ENCODING => '',
        ];
        if (defined('WHATICKET_SSL_VERIFY') && WHATICKET_SSL_VERIFY === false) {
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
            throw new RuntimeException('WhaTicket: ' . ($err ?: 'falha na requisição'));
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
            throw new RuntimeException('WhaTicket HTTP ' . $code . ': ' . (string) $msg);
        }
        return $decoded;
    }

    private function bridgeGet(string $path): ?array
    {
        if ($this->bridgeUrl === '') {
            return null;
        }
        $ch = curl_init($this->bridgeUrl . $path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 8,
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($raw === false || $code >= 400) {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    public static function parseConnectionState(array $resp): string
    {
        $status = strtolower((string) (
            $resp['status']
            ?? $resp['state']
            ?? $resp['connectionStatus']
            ?? ($resp['whatsapp']['status'] ?? '')
            ?? ''
        ));
        if (in_array($status, ['open', 'connected', 'online', 'authenticated'], true)) {
            return 'open';
        }
        if (in_array($status, ['connecting', 'qrcode', 'qr', 'pairing'], true)) {
            return 'connecting';
        }
        return 'close';
    }

    public static function parseInstanceListState(array $resp, string $instanceName): ?string
    {
        $list = $resp['whatsapps'] ?? $resp['instances'] ?? $resp;
        if (!is_array($list)) {
            return null;
        }
        foreach ($list as $row) {
            if (!is_array($row)) {
                continue;
            }
            $id = (string) ($row['id'] ?? $row['name'] ?? '');
            if ($id === $instanceName || $id === '') {
                return self::parseConnectionState($row);
            }
        }
        if (isset($list[0]) && is_array($list[0])) {
            return self::parseConnectionState($list[0]);
        }
        return null;
    }

    public static function extractQr(array $resp): ?string
    {
        $candidates = [
            $resp['qrcode'] ?? null,
            $resp['qr'] ?? null,
            $resp['base64'] ?? null,
            $resp['pairingCode'] ?? null,
            $resp['code'] ?? null,
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
        }
        return null;
    }

    public function createInstance(string $instanceName, string $webhookUrl): array
    {
        return ['instanceName' => $this->whatsappId, 'instance' => ['instanceName' => $this->whatsappId]];
    }

    public function setWebhook(string $instanceName, string $webhookUrl): array
    {
        return ['ok' => true];
    }

    public function connect(string $instanceName): array
    {
        try {
            $this->request('POST', '/whatsappsession/' . rawurlencode($this->whatsappId));
        } catch (Throwable $e) {
            /* sessão pode já existir */
        }
        $bridge = $this->bridgeGet('/qr');
        if ($bridge && !empty($bridge['qr'])) {
            return ['qrcode' => $bridge['qr'], 'status' => 'connecting'];
        }
        return ['status' => 'connecting'];
    }

    public function connectionState(string $instanceName): array
    {
        try {
            $resp = $this->request('GET', '/whatsapp/');
            $list = $resp['whatsapps'] ?? $resp;
            if (is_array($list)) {
                foreach ($list as $row) {
                    if (!is_array($row)) {
                        continue;
                    }
                    if ((string) ($row['id'] ?? '') === $this->whatsappId || count($list) === 1) {
                        return [
                            'state' => self::parseConnectionState($row),
                            'instance' => [
                                'state' => self::parseConnectionState($row),
                                'owner' => ($row['number'] ?? '') . '@s.whatsapp.net',
                            ],
                        ];
                    }
                }
            }
            return ['state' => self::parseConnectionState($resp), 'instance' => ['state' => self::parseConnectionState($resp)]];
        } catch (Throwable $e) {
            return ['state' => 'close', 'instance' => ['state' => 'close']];
        }
    }

    public function fetchInstances(): array
    {
        try {
            $resp = $this->request('GET', '/whatsapp/');
            $rows = $resp['whatsapps'] ?? (is_array($resp) ? $resp : []);
            if (!is_array($rows)) {
                $rows = [];
            }
            $out = [];
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $id = (string) ($row['id'] ?? $this->whatsappId);
                $out[] = [
                    'instanceName' => $id,
                    'name' => $id,
                    'connectionStatus' => self::parseConnectionState($row),
                ];
            }
            if ($out === []) {
                $out[] = [
                    'instanceName' => $this->whatsappId,
                    'name' => $this->whatsappId,
                    'connectionStatus' => 'close',
                ];
            }
            return $out;
        } catch (Throwable $e) {
            return [[
                'instanceName' => $this->whatsappId,
                'name' => $this->whatsappId,
                'connectionStatus' => 'close',
            ]];
        }
    }

    public function logout(string $instanceName): array
    {
        return $this->request('DELETE', '/whatsappsession/' . rawurlencode($this->whatsappId));
    }

    public function deleteInstance(string $instanceName): array
    {
        return $this->logout($instanceName);
    }

    /** @return array<int, array<string, mixed>> */
    public function findTickets(int $page = 1): array
    {
        $resp = $this->request('GET', '/tickets?pageNumber=' . max(1, $page));
        return $resp['tickets'] ?? $resp['data'] ?? (is_array($resp) ? $resp : []);
    }

    public function findContacts(string $instanceName): array
    {
        $resp = $this->request('GET', '/contacts');
        return $resp['contacts'] ?? $resp['data'] ?? (is_array($resp) ? $resp : []);
    }

    public function findChats(string $instanceName, ?int $limit = null, ?int $offset = null): array
    {
        $tickets = $this->findTickets(1);
        $out = [];
        foreach ($tickets as $t) {
            if (!is_array($t)) {
                continue;
            }
            $contact = is_array($t['contact'] ?? null) ? $t['contact'] : [];
            $number = preg_replace('/\D+/', '', (string) ($contact['number'] ?? $t['number'] ?? '')) ?? '';
            $jid = $number !== '' ? $number . '@s.whatsapp.net' : '';
            $lastMsg = is_array($t['lastMessage'] ?? null) ? $t['lastMessage'] : [];
            $out[] = [
                'id' => $jid,
                'remoteJid' => $jid,
                'whaticket_ticket_id' => (int) ($t['id'] ?? 0),
                'whaticket_contact_id' => (int) ($contact['id'] ?? $t['contactId'] ?? 0),
                'pushName' => (string) ($contact['name'] ?? $t['contact']['name'] ?? ''),
                'name' => (string) ($contact['name'] ?? ''),
                'lastMessage' => [
                    'message' => (string) ($lastMsg['body'] ?? $t['lastMessage'] ?? ''),
                    'fromMe' => (bool) ($lastMsg['fromMe'] ?? false),
                ],
                'updatedAt' => $t['updatedAt'] ?? $t['updated_at'] ?? null,
                'unreadMessages' => (int) ($t['unreadMessages'] ?? 0),
            ];
        }
        if ($limit !== null && $limit > 0) {
            $off = max(0, (int) $offset);
            $out = array_slice($out, $off, $limit);
        }
        return $out;
    }

    public function findMessages(string $instanceName, string $remoteJid, int $limit = 40): array
    {
        $ticketId = $this->resolveTicketIdFromJid($remoteJid);
        if ($ticketId <= 0) {
            return [];
        }
        $resp = $this->request('GET', '/messages/' . $ticketId);
        $msgs = $resp['messages'] ?? $resp['data'] ?? (is_array($resp) ? $resp : []);
        if (!is_array($msgs)) {
            return [];
        }
        $out = [];
        foreach (array_slice($msgs, -$limit) as $m) {
            if (!is_array($m)) {
                continue;
            }
            $out[] = $this->normalizeMessageRow($m, $remoteJid);
        }
        return $out;
    }

    private function resolveTicketIdFromJid(string $remoteJid): int
    {
        $phone = preg_replace('/\D+/', '', explode('@', $remoteJid)[0] ?? $remoteJid) ?? '';
        foreach ($this->findTickets(1) as $t) {
            if (!is_array($t)) {
                continue;
            }
            $contact = is_array($t['contact'] ?? null) ? $t['contact'] : [];
            $num = preg_replace('/\D+/', '', (string) ($contact['number'] ?? '')) ?? '';
            if ($num !== '' && ($num === $phone || str_ends_with($num, substr($phone, -11)))) {
                return (int) ($t['id'] ?? 0);
            }
        }
        return 0;
    }

    private function normalizeMessageRow(array $m, string $remoteJid): array
    {
        $body = (string) ($m['body'] ?? $m['message'] ?? '');
        $fromMe = (bool) ($m['fromMe'] ?? $m['from_me'] ?? false);
        $type = strtolower((string) ($m['mediaType'] ?? $m['type'] ?? 'text'));
        $mediaUrl = (string) ($m['mediaUrl'] ?? $m['media_url'] ?? '');
        $msg = ['conversation' => $body];
        if ($type === 'audio' || str_contains($type, 'audio')) {
            $msg = ['audioMessage' => ['url' => $mediaUrl]];
        } elseif ($type === 'image' || str_contains($type, 'image')) {
            $msg = ['imageMessage' => ['url' => $mediaUrl, 'caption' => $body]];
        }
        return [
            'key' => [
                'remoteJid' => $remoteJid,
                'fromMe' => $fromMe,
                'id' => (string) ($m['id'] ?? $m['wid'] ?? uniqid('wt_', true)),
            ],
            'message' => $msg,
            'messageTimestamp' => strtotime((string) ($m['createdAt'] ?? $m['created_at'] ?? 'now')) ?: time(),
            'pushName' => (string) ($m['contact']['name'] ?? ''),
        ];
    }

    public function fetchProfile(string $instanceName, string $numberOrJid, int $timeoutSec = 0): array
    {
        $digits = preg_replace('/\D+/', '', explode('@', $numberOrJid)[0] ?? $numberOrJid) ?? '';
        try {
            $resp = $this->request('GET', '/contacts/' . rawurlencode($digits), null, $timeoutSec > 0 ? $timeoutSec : 12);
            return [
                'name' => $resp['name'] ?? '',
                'status' => $resp['status'] ?? $resp['about'] ?? '',
                'pictureUrl' => $resp['profilePicUrl'] ?? $resp['url'] ?? '',
            ];
        } catch (Throwable $e) {
            return ['name' => '', 'status' => '', 'pictureUrl' => ''];
        }
    }

    public function fetchProfilePictureUrl(string $instanceName, string $numberOrJid): array
    {
        $prof = $this->fetchProfile($instanceName, $numberOrJid, 10);
        $url = trim((string) ($prof['pictureUrl'] ?? ''));
        return $url !== '' ? ['profilePictureUrl' => $url, 'url' => $url] : [];
    }

    public function sendText(string $instanceName, string $number, string $text): array
    {
        $digits = preg_replace('/\D+/', '', $number) ?? '';
        $resp = $this->request('POST', '/api/messages/send', [
            'whatsappId' => (int) $this->whatsappId,
            'number' => $digits,
            'body' => $text,
        ]);
        return $this->wrapSendResponse($resp);
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
        return $this->sendMediaPayload($number, $media, $mimetype, $caption, false);
    }

    public function sendWhatsAppAudio(string $instanceName, string $number, string $audio, ?string $mimetype = null): array
    {
        return $this->sendMediaPayload($number, $audio, $mimetype ?: 'audio/ogg', null, true);
    }

    public function sendSticker(string $instanceName, string $number, string $sticker): array
    {
        return $this->sendMediaPayload($number, $sticker, 'image/webp', null, false);
    }

    private function sendMediaPayload(string $number, string $media, ?string $mimetype, ?string $caption, bool $isPtt): array
    {
        $digits = preg_replace('/\D+/', '', $number) ?? '';
        if (str_starts_with($media, 'data:')) {
            $resp = $this->request('POST', '/api/messages/send', [
                'whatsappId' => (int) $this->whatsappId,
                'number' => $digits,
                'body' => $caption ?? '',
                'medias' => [
                    [
                        'mimetype' => $mimetype ?? 'application/octet-stream',
                        'data' => $media,
                    ],
                ],
            ]);
            return $this->wrapSendResponse($resp);
        }
        $resp = $this->request('POST', '/api/messages/send', [
            'whatsappId' => (int) $this->whatsappId,
            'number' => $digits,
            'body' => $caption ?? ($isPtt ? '' : '[Mídia]'),
            'mediaUrl' => $media,
        ]);
        return $this->wrapSendResponse($resp);
    }

    private function wrapSendResponse(array $resp): array
    {
        $id = (string) ($resp['id'] ?? $resp['messageId'] ?? $resp['wid'] ?? uniqid('wt_', true));
        return [
            'key' => ['id' => $id],
            'messageId' => $id,
        ];
    }

    public function deleteMessageForEveryone(string $instanceName, string $waId, string $remoteJid, bool $fromMe = true): array
    {
        try {
            return $this->request('DELETE', '/messages/' . rawurlencode($waId));
        } catch (Throwable $e) {
            return ['ok' => false];
        }
    }

    public function getBase64FromMediaMessage(string $instanceName, array $payload, bool $isVideo = false): ?array
    {
        $url = '';
        $msg = $payload['message'] ?? [];
        if (is_array($msg)) {
            foreach (['imageMessage', 'audioMessage', 'videoMessage', 'stickerMessage', 'documentMessage'] as $k) {
                if (!empty($msg[$k]['url'])) {
                    $url = (string) $msg[$k]['url'];
                    break;
                }
            }
        }
        if ($url === '') {
            return null;
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_FOLLOWLOCATION => true]);
        $bin = curl_exec($ch);
        curl_close($ch);
        if ($bin === false || $bin === '') {
            return null;
        }
        return ['base64' => base64_encode($bin), 'mimetype' => 'application/octet-stream'];
    }

    public function requireOpenInstance(string $instanceName): array
    {
        $st = $this->connectionState($instanceName);
        if (self::parseConnectionState($st) !== 'open') {
            throw new RuntimeException('WhaTicket desconectado. Escaneie o QR Code.');
        }
        return $st;
    }

    public function updateProfileName(string $instanceName, string $name): array
    {
        return $this->request('PUT', '/whatsapp/' . rawurlencode($this->whatsappId), ['name' => $name]);
    }

    public function updateProfileStatus(string $instanceName, string $status): array
    {
        return $this->request('PUT', '/whatsapp/' . rawurlencode($this->whatsappId), ['status' => $status]);
    }

    public function updateProfilePicture(string $instanceName, string $picture): array
    {
        return $this->request('PUT', '/whatsapp/' . rawurlencode($this->whatsappId), ['picture' => $picture]);
    }
}
