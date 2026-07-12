<?php
declare(strict_types=1);

require_once __DIR__ . '/SupabaseClient.php';
require_once __DIR__ . '/SupabaseV2.php';

/** Extrai telefone E.164 válido de um remote_jid (ignora @lid, grupos, sufixo :device). */
function wa_repo_phone_from_jid(string $remoteJid): string
{
    $jid = strtolower(trim($remoteJid));
    if ($jid === '' || str_contains($jid, '@lid') || str_contains($jid, '@g.us')
        || str_contains($jid, '@broadcast') || str_contains($jid, '@newsletter')) {
        return '';
    }
    $local = explode('@', $jid)[0] ?? $jid;
    $digits = preg_replace('/\D+/', '', strtok($local, ':') ?: $local) ?? '';
    $len = strlen($digits);
    return ($len >= 10 && $len <= 13) ? $digits : '';
}

/** Últimos 11 dígitos BR (55 opcional) — une 629… com 55629…. */
function wa_repo_phone_tail(string $digits): string
{
    $d = preg_replace('/\D+/', '', $digits) ?? '';
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

/** Formato canônico para persistência (BR mobile → 55 + 11 dígitos). */
function wa_repo_canonical_phone(string $digits): string
{
    $d = preg_replace('/\D+/', '', $digits) ?? '';
    if ($d === '') {
        return '';
    }
    $tail = wa_repo_phone_tail($d);
    if ($tail !== '' && strlen($tail) === 11) {
        return '55' . $tail;
    }
    return $d;
}

/** Preferir JID @s.whatsapp.net sobre @lid ao fundir conversas. */
function wa_repo_prefer_remote_jid(string $storedJid, string $incomingJid): string
{
    $old = strtolower(trim($storedJid));
    $new = strtolower(trim($incomingJid));
    if ($new === '' || $old === $new) {
        return $old !== '' ? $old : $new;
    }
    if (str_ends_with($new, '@lid')) {
        return $old;
    }
    if (str_ends_with($old, '@lid')) {
        return $new;
    }
    return $new;
}

function wa_repo_session_log(string $location, string $message, array $data = [], string $hypothesisId = 'H-dedupe'): void
{
    $base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__, 2) . '/uploads');
    $dir = rtrim((string) $base, '/\\') . '/.debug-sessions';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $line = json_encode([
        'ts' => gmdate('c'),
        'sessionId' => '5ec660',
        'location' => $location,
        'message' => $message,
        'hypothesisId' => $hypothesisId,
        'runId' => 'wa108-dedupe',
        'data' => $data,
    ], JSON_UNESCAPED_UNICODE);
    @file_put_contents($dir . '/5ec660.ndjson', $line . "\n", FILE_APPEND | LOCK_EX);
}

/** Nome de exibição plausível (não preview de mídia nem só dígitos). */
function wa_repo_is_plausible_display_name(string $name): bool
{
    $name = trim($name);
    if ($name === '' || mb_strlen($name) < 3) {
        return false;
    }
    if (preg_match('/^[\p{So}\p{Sk}\p{Sc}]/u', $name)) {
        return false;
    }
    foreach (['📷', '🎤', '🎬', '🎭', '📄', '[Imagem]', '[Áudio]', '[Audio]', '[Vídeo]', '[Documento]'] as $bad) {
        if (str_contains($name, $bad)) {
            return false;
        }
    }
    if (preg_match('/^\+?\d[\d\s()-]{8,}$/', $name)) {
        return false;
    }
    return true;
}

function wa_repo_should_update_contact_name(string $existing, string $new): bool
{
    if ($new === '' || !wa_repo_is_plausible_display_name($new)) {
        return false;
    }
    $existing = trim($existing);
    if ($existing === '') {
        return true;
    }
    if (preg_match('/^\+?\d[\d\s()-]{8,}$/', $existing)) {
        return true;
    }
    if (!wa_repo_is_plausible_display_name($existing)) {
        return true;
    }
    if ($new !== $existing && mb_strlen($new) >= mb_strlen($existing)) {
        return true;
    }
    return false;
}

/** Preview da lista lateral — nunca vira contact_name, só last_message_preview. */
function wa_repo_message_preview(string $messageType, string $body): string
{
    $type = strtolower(trim($messageType));
    $text = trim(strip_tags($body));
    if ($type === 'image') {
        return ($text !== '' && !preg_match('/^\[[\p{L}]/u', $text)) ? mb_substr($text, 0, 240) : '📷 Foto';
    }
    return match ($type) {
        'audio' => '🎤 Áudio',
        'video' => '🎬 Vídeo',
        'sticker' => '🎭 Figurinha',
        'document' => '📄 Documento',
        default => mb_substr($text, 0, 240),
    };
}

interface WhatsAppRepository
{
    public function getInstance(string $userId): ?array;

    public function getInstanceByName(string $instanceName): ?array;

    public function ensureInstance(string $userId, string $instanceName): array;

    public function updateInstanceStatus(string $instanceId, string $status, ?string $phone = null): void;

    /** Troca o nome da instância Evolution (rebind quando a antiga fica travada). */
    public function renameInstance(string $instanceId, string $newInstanceName): void;

    public function isSessionRevoked(string $userId): bool;

    public function markSessionRevoked(string $userId): void;

    public function clearSessionRevoked(string $userId): void;

    public function getOrCreateChat(array $instance, string $remoteJid, ?string $contactName = null): array;

    public function insertMessage(
        array $chat,
        array $instance,
        string $direction,
        string $body,
        ?string $waMessageId = null,
        string $messageType = 'text',
        ?string $mediaUrl = null,
        ?string $createdAt = null,
        ?string $rawPayload = null
    ): array;

    public function messageExistsByWaId(string $waMessageId): bool;

    public function getMessageByWaId(string $waMessageId): ?array;

    public function updateMessageDirection(string $messageId, string $direction): void;

    /** Re-vincula uma mensagem existente a outro chat (cura órfãs após recriação de chat). */
    public function updateMessageChat(string $messageId, string $chatId, string $remoteJid): void;

    public function listChats(string $userId, bool $activeOnly = false): array;

    public function countChats(string $userId, bool $activeOnly = false): int;

    public function getChatByJid(string $instanceId, string $remoteJid): ?array;

    public function getChatByPhone(string $instanceId, string $phone): ?array;

    public function pruneEmptyChats(string $userId): int;

    public function pruneInvalidChats(string $userId): int;

    public function deleteAllChatsForUser(string $userId): int;

    public function getChatForUser(string $chatId, string $userId): ?array;

    public function clearUnread(string $chatId): void;

    public function listMessages(string $chatId): array;

    public function getMessageForUser(string $messageId, string $userId): ?array;

    public function updateMessageMediaUrl(string $messageId, string $mediaUrl): void;

    /** Remove mensagem do histórico (após validação de permissão na API). */
    public function deleteMessageForUser(string $messageId, string $userId): bool;

    /** Atualiza metadados da conversa (sync Evolution). */
    public function updateChatMeta(string $chatId, array $fields): void;
}

final class WhatsAppRepositoryMysql implements WhatsAppRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function getInstance(string $userId): ?array
    {
        $st = $this->pdo->prepare('SELECT * FROM whatsapp_instances WHERE user_id = ? LIMIT 1');
        $st->execute([$userId]);
        $row = $st->fetch();
        return $row ?: null;
    }

    public function getInstanceByName(string $instanceName): ?array
    {
        $st = $this->pdo->prepare('SELECT * FROM whatsapp_instances WHERE instance_name = ? LIMIT 1');
        $st->execute([$instanceName]);
        $row = $st->fetch();
        return $row ?: null;
    }

    public function ensureInstance(string $userId, string $instanceName): array
    {
        $row = $this->getInstance($userId);
        if ($row) {
            return $row;
        }
        $id = bin2hex(random_bytes(16));
        $now = gmdate('Y-m-d H:i:s');
        $st = $this->pdo->prepare(
            'INSERT INTO whatsapp_instances (id, user_id, instance_name, phone, status, created_at, updated_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?)'
        );
        $st->execute([$id, $userId, $instanceName, 'close', $now, $now]);
        return $this->getInstance($userId) ?? [];
    }

    public function updateInstanceStatus(string $instanceId, string $status, ?string $phone = null): void
    {
        $st = $this->pdo->prepare(
            'UPDATE whatsapp_instances SET status = ?, phone = COALESCE(?, phone), updated_at = ? WHERE id = ?'
        );
        $st->execute([$status, $phone, gmdate('Y-m-d H:i:s'), $instanceId]);
    }

    public function renameInstance(string $instanceId, string $newInstanceName): void
    {
        $st = $this->pdo->prepare(
            'UPDATE whatsapp_instances SET instance_name = ?, phone = NULL, status = ?, updated_at = ? WHERE id = ?'
        );
        $st->execute([$newInstanceName, 'close', gmdate('Y-m-d H:i:s'), $instanceId]);
    }

    public function isSessionRevoked(string $userId): bool
    {
        $st = $this->pdo->prepare(
            'SELECT session_revoked_at, status FROM whatsapp_instances WHERE user_id = ? LIMIT 1'
        );
        $st->execute([$userId]);
        $row = $st->fetch();
        if (!$row) {
            return false;
        }
        return !empty($row['session_revoked_at']) || (string) ($row['status'] ?? '') === 'revoked';
    }

    public function markSessionRevoked(string $userId): void
    {
        $now = gmdate('Y-m-d H:i:s');
        $st = $this->pdo->prepare(
            'UPDATE whatsapp_instances
             SET session_revoked_at = ?, status = ?, phone = NULL, updated_at = ?
             WHERE user_id = ?'
        );
        $st->execute([$now, 'revoked', $now, $userId]);
    }

    public function clearSessionRevoked(string $userId): void
    {
        $now = gmdate('Y-m-d H:i:s');
        $st = $this->pdo->prepare(
            'UPDATE whatsapp_instances SET session_revoked_at = NULL, updated_at = ? WHERE user_id = ?'
        );
        $st->execute([$now, $userId]);
    }

    public function getOrCreateChat(array $instance, string $remoteJid, ?string $contactName = null): array
    {
        $instanceId = (string) $instance['id'];
        $remoteJid = strtolower(trim($remoteJid));
        $phone = wa_repo_phone_from_jid($remoteJid);
        $now = gmdate('Y-m-d H:i:s');

        // Upsert: telefone canônico (tail) primeiro, remote_jid depois — nunca INSERT sem lookup.
        $existing = null;
        if ($phone !== '') {
            $existing = $this->getChatByPhone($instanceId, $phone);
        }
        if (!$existing) {
            $existing = $this->getChatByJid($instanceId, $remoteJid);
        }
        if ($existing) {
            wa_repo_session_log('WhatsAppRepository::getOrCreateChat', 'upsert update', [
                'chat_id' => $existing['id'] ?? '',
                'remote_jid' => $remoteJid,
                'phone_tail' => $phone !== '' ? wa_repo_phone_tail($phone) : '',
            ]);
            return $this->mergeChatRow($existing, $remoteJid, $phone, $contactName);
        }

        $id = bin2hex(random_bytes(16));
        $phoneCanon = $phone !== '' ? wa_repo_canonical_phone($phone) : '';
        $phoneForDb = $phoneCanon !== '' ? $phoneCanon : null;
        $phoneTail = $phoneCanon !== '' ? wa_repo_phone_tail($phoneCanon) : null;
        $nameVal = $contactName !== null && trim($contactName) !== '' ? trim($contactName) : null;
        $hasTailCol = $this->hasPhoneTailColumn();

        wa_repo_session_log('WhatsAppRepository::getOrCreateChat', 'upsert insert', [
            'remote_jid' => $remoteJid,
            'phone_tail' => $phoneTail,
        ]);

        $cols = 'id, instance_id, user_id, remote_jid, contact_phone, contact_name, last_message_at, last_message_preview, unread_count, kanban_stage, created_at, updated_at';
        $vals = '?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, ?';
        $params = [$id, $instanceId, $instance['user_id'], $remoteJid, $phoneForDb, $nameVal, 'novo', $now, $now];
        if ($hasTailCol && $phoneTail !== null && $phoneTail !== '') {
            $cols .= ', contact_phone_tail';
            $vals .= ', ?';
            $params[] = $phoneTail;
        }
        $onDup = "ON DUPLICATE KEY UPDATE
            remote_jid = IF(VALUES(remote_jid) LIKE '%@lid', remote_jid, VALUES(remote_jid)),
            contact_phone = COALESCE(VALUES(contact_phone), contact_phone),
            contact_phone_tail = COALESCE(VALUES(contact_phone_tail), contact_phone_tail),
            contact_name = IF(
              (contact_name IS NULL OR TRIM(contact_name) = '')
              AND VALUES(contact_name) IS NOT NULL AND TRIM(VALUES(contact_name)) != '',
              VALUES(contact_name), contact_name
            ),
            updated_at = VALUES(updated_at)";
        try {
            $this->pdo->prepare("INSERT INTO whatsapp_chats ($cols) VALUES ($vals) $onDup")->execute($params);
        } catch (Throwable $e) {
            $retry = $phone !== '' ? $this->getChatByPhone($instanceId, $phone) : null;
            if (!$retry) {
                $retry = $this->getChatByJid($instanceId, $remoteJid);
            }
            if ($retry) {
                return $this->mergeChatRow($retry, $remoteJid, $phone, $contactName);
            }
            throw $e;
        }

        if ($phoneForDb !== null) {
            $row = $this->getChatByPhone($instanceId, $phoneForDb);
            if ($row) {
                return $this->mergeChatRow($row, $remoteJid, $phone, $contactName);
            }
        }
        $row = $this->getChatByJid($instanceId, $remoteJid);
        return $row ? $this->mergeChatRow($row, $remoteJid, $phone, $contactName) : [];
    }

    /** Atualiza jid/nome/telefone sem criar registro novo. */
    private function mergeChatRow(array $chat, string $remoteJid, string $phone, ?string $contactName): array
    {
        $chatId = (string) ($chat['id'] ?? '');
        if ($chatId === '') {
            return $chat;
        }
        $patch = [];
        $preferredJid = wa_repo_prefer_remote_jid((string) ($chat['remote_jid'] ?? ''), $remoteJid);
        if (strtolower(trim((string) ($chat['remote_jid'] ?? ''))) !== $preferredJid) {
            $patch['remote_jid'] = $preferredJid;
        }
        if ($phone !== '') {
            $canon = wa_repo_canonical_phone($phone);
            $tail = wa_repo_phone_tail($canon);
            $storedPhone = preg_replace('/\D+/', '', (string) ($chat['contact_phone'] ?? '')) ?? '';
            $storedTail = wa_repo_phone_tail($storedPhone);
            if ($canon !== '' && ($storedPhone === '' || $storedTail !== $tail)) {
                $patch['contact_phone'] = $canon;
            }
            if ($this->hasPhoneTailColumn() && $tail !== '' && $storedTail !== $tail) {
                $patch['contact_phone_tail'] = $tail;
            }
        }
        $oldName = trim((string) ($chat['contact_name'] ?? ''));
        $newName = trim((string) ($contactName ?? ''));
        if (empty($chat['name_locked']) && wa_repo_should_update_contact_name($oldName, $newName)) {
            $patch['contact_name'] = $newName;
        }
        if ($patch !== []) {
            $this->updateChatMeta($chatId, $patch);
            return array_merge($chat, $patch);
        }
        return $chat;
    }

    private ?bool $hasPhoneTailCol = null;

    private function hasPhoneTailColumn(): bool
    {
        if ($this->hasPhoneTailCol !== null) {
            return $this->hasPhoneTailCol;
        }
        try {
            $row = $this->pdo->query("SHOW COLUMNS FROM whatsapp_chats LIKE 'contact_phone_tail'")->fetch();
            $this->hasPhoneTailCol = (bool) $row;
        } catch (Throwable $e) {
            $this->hasPhoneTailCol = false;
        }
        return $this->hasPhoneTailCol;
    }

    private ?bool $hasRawPayloadCol = null;

    private function messagesHaveRawPayload(): bool
    {
        if ($this->hasRawPayloadCol !== null) {
            return $this->hasRawPayloadCol;
        }
        try {
            $row = $this->pdo->query("SHOW COLUMNS FROM whatsapp_messages LIKE 'raw_payload'")->fetch();
            $this->hasRawPayloadCol = (bool) $row;
        } catch (Throwable $e) {
            $this->hasRawPayloadCol = false;
        }
        return $this->hasRawPayloadCol;
    }

    public function insertMessage(
        array $chat,
        array $instance,
        string $direction,
        string $body,
        ?string $waMessageId = null,
        string $messageType = 'text',
        ?string $mediaUrl = null,
        ?string $createdAt = null,
        ?string $rawPayload = null
    ): array {
        if ($waMessageId !== null && $waMessageId !== '') {
            $existing = $this->getMessageByWaId($waMessageId);
            if ($existing) {
                if ((string) ($existing['chat_id'] ?? '') !== (string) ($chat['id'] ?? '')) {
                    $this->updateMessageChat(
                        (string) $existing['id'],
                        (string) $chat['id'],
                        (string) ($chat['remote_jid'] ?? '')
                    );
                }
                return $existing;
            }
        }
        $id = bin2hex(random_bytes(16));
        $now = $createdAt && preg_match('/^\d{4}-\d{2}-\d{2}/', $createdAt) ? $createdAt : gmdate('Y-m-d H:i:s');
        $preview = wa_repo_message_preview($messageType, $body);
        $withRaw = $this->messagesHaveRawPayload() && $rawPayload !== null && $rawPayload !== '';
        try {
            if ($withRaw) {
                $st = $this->pdo->prepare(
                    'INSERT INTO whatsapp_messages
                     (id, chat_id, instance_id, user_id, remote_jid, direction, message_type, body, media_url, wa_message_id, status, created_at, raw_payload)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $st->execute([
                    $id, $chat['id'], $instance['id'], $instance['user_id'], $chat['remote_jid'],
                    $direction, $messageType, $body, $mediaUrl, $waMessageId,
                    $direction === 'out' ? 'sent' : 'received', $now, $rawPayload,
                ]);
            } else {
                $st = $this->pdo->prepare(
                    'INSERT INTO whatsapp_messages
                     (id, chat_id, instance_id, user_id, remote_jid, direction, message_type, body, media_url, wa_message_id, status, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $st->execute([
                    $id, $chat['id'], $instance['id'], $instance['user_id'], $chat['remote_jid'],
                    $direction, $messageType, $body, $mediaUrl, $waMessageId,
                    $direction === 'out' ? 'sent' : 'received', $now,
                ]);
            }
        } catch (PDOException $e) {
            if ($waMessageId !== null && $waMessageId !== '' && str_contains($e->getMessage(), 'Duplicate')) {
                $dup = $this->getMessageByWaId($waMessageId);
                if ($dup) {
                    return $dup;
                }
            }
            throw $e;
        }
        $unreadAdd = $direction === 'in' ? 1 : 0;
        $st = $this->pdo->prepare(
            'UPDATE whatsapp_chats SET last_message_at = ?, last_message_preview = ?, unread_count = unread_count + ?, updated_at = ? WHERE id = ?'
        );
        $st->execute([gmdate('Y-m-d H:i:s'), $preview, $unreadAdd, gmdate('Y-m-d H:i:s'), $chat['id']]);
        $st = $this->pdo->prepare('SELECT * FROM whatsapp_messages WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        return $st->fetch() ?: [];
    }

    public function messageExistsByWaId(string $waMessageId): bool
    {
        if ($waMessageId === '') {
            return false;
        }
        $st = $this->pdo->prepare('SELECT id FROM whatsapp_messages WHERE wa_message_id = ? LIMIT 1');
        $st->execute([$waMessageId]);
        return (bool) $st->fetch();
    }

    public function getMessageByWaId(string $waMessageId): ?array
    {
        if ($waMessageId === '') {
            return null;
        }
        $st = $this->pdo->prepare('SELECT * FROM whatsapp_messages WHERE wa_message_id = ? LIMIT 1');
        $st->execute([$waMessageId]);
        $row = $st->fetch();
        return $row ?: null;
    }

    public function updateMessageDirection(string $messageId, string $direction): void
    {
        $dir = $direction === 'out' ? 'out' : 'in';
        $st = $this->pdo->prepare(
            'UPDATE whatsapp_messages SET direction = ?, status = ? WHERE id = ?'
        );
        $st->execute([$dir, $dir === 'out' ? 'sent' : 'received', $messageId]);
    }

    public function updateMessageChat(string $messageId, string $chatId, string $remoteJid): void
    {
        $this->pdo->prepare(
            'UPDATE whatsapp_messages SET chat_id = ?, remote_jid = ? WHERE id = ?'
        )->execute([$chatId, $remoteJid, $messageId]);
    }

    public function listChats(string $userId, bool $activeOnly = false): array
    {
        $select = $this->chatListSelectColumns();
        $sql = "SELECT {$select} FROM whatsapp_chats WHERE user_id = ?";
        if ($activeOnly) {
            $sql .= ' AND (last_message_at IS NOT NULL OR EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.chat_id = whatsapp_chats.id LIMIT 1))';
        }
        $sql .= ' ORDER BY last_message_at DESC, contact_name ASC LIMIT 200';
        $st = $this->pdo->prepare($sql);
        $st->execute([$userId]);
        return $st->fetchAll() ?: [];
    }

    public function countChats(string $userId, bool $activeOnly = false): int
    {
        $sql = 'SELECT COUNT(*) FROM whatsapp_chats WHERE user_id = ?';
        if ($activeOnly) {
            $sql .= ' AND (last_message_at IS NOT NULL OR EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.chat_id = whatsapp_chats.id LIMIT 1))';
        }
        $st = $this->pdo->prepare($sql);
        $st->execute([$userId]);
        return (int) $st->fetchColumn();
    }

    /** Colunas existentes no schema (instalações antigas podem faltar deal_* ou avatar). */
    private function chatListSelectColumns(): string
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        $want = [
            'id', 'contact_phone', 'contact_name', 'contact_avatar_url', 'remote_jid',
            'kanban_stage', 'last_message_at', 'last_message_preview', 'unread_count',
            'deal_value', 'deal_tags', 'next_action_at',
        ];
        $present = [];
        try {
            $st = $this->pdo->query('SHOW COLUMNS FROM whatsapp_chats');
            while ($st && ($row = $st->fetch(PDO::FETCH_ASSOC))) {
                $field = (string) ($row['Field'] ?? '');
                if ($field !== '') {
                    $present[$field] = true;
                }
            }
        } catch (Throwable $e) {
            $present = array_fill_keys(['id', 'contact_phone', 'contact_name', 'remote_jid', 'kanban_stage', 'last_message_at', 'last_message_preview', 'unread_count'], true);
        }
        $cols = [];
        foreach ($want as $col) {
            if (isset($present[$col])) {
                $cols[] = $col;
            }
        }
        $cached = $cols !== [] ? implode(', ', $cols) : 'id, contact_phone, contact_name, remote_jid, kanban_stage, last_message_at, last_message_preview, unread_count';
        return $cached;
    }

    public function getChatByJid(string $instanceId, string $remoteJid): ?array
    {
        $st = $this->pdo->prepare('SELECT * FROM whatsapp_chats WHERE instance_id = ? AND remote_jid = ? LIMIT 1');
        $st->execute([$instanceId, strtolower(trim($remoteJid))]);
        $row = $st->fetch();
        return $row ?: null;
    }

    public function getChatByPhone(string $instanceId, string $phone): ?array
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if ($digits === '' || strlen($digits) < 10 || strlen($digits) > 13) {
            return null;
        }
        $st = $this->pdo->prepare(
            'SELECT * FROM whatsapp_chats WHERE instance_id = ? AND contact_phone = ?
             ORDER BY last_message_at DESC LIMIT 1'
        );
        $st->execute([$instanceId, $digits]);
        $row = $st->fetch();
        if ($row) {
            return $row;
        }

        $canon = wa_repo_canonical_phone($digits);
        if ($canon !== '' && $canon !== $digits) {
            $st->execute([$instanceId, $canon]);
            $row = $st->fetch();
            if ($row) {
                return $row;
            }
        }

        $tail = wa_repo_phone_tail($digits);
        if ($tail === '') {
            return null;
        }

        if ($this->hasPhoneTailColumn()) {
            $st = $this->pdo->prepare(
                'SELECT * FROM whatsapp_chats WHERE instance_id = ? AND contact_phone_tail = ?
                 ORDER BY last_message_at DESC LIMIT 1'
            );
            $st->execute([$instanceId, $tail]);
            $row = $st->fetch();
            if ($row) {
                return $row;
            }
        }

        $tailLen = strlen($tail);
        $st = $this->pdo->prepare(
            'SELECT * FROM whatsapp_chats WHERE instance_id = ? AND contact_phone IS NOT NULL
             AND RIGHT(contact_phone, ?) = ?
             ORDER BY last_message_at DESC LIMIT 1'
        );
        $st->execute([$instanceId, $tailLen, $tail]);
        $row = $st->fetch();
        return $row ?: null;
    }

    public function pruneEmptyChats(string $userId): int
    {
        $st = $this->pdo->prepare(
            'DELETE c FROM whatsapp_chats c
             WHERE c.user_id = ?
             AND c.last_message_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.chat_id = c.id LIMIT 1)'
        );
        $st->execute([$userId]);
        return $st->rowCount();
    }

    public function pruneInvalidChats(string $userId): int
    {
        $this->pdo->prepare(
            "UPDATE whatsapp_chats SET contact_name = NULL, updated_at = ?
             WHERE user_id = ? AND contact_name REGEXP '^[0-9]{14,}$'"
        )->execute([gmdate('Y-m-d H:i:s'), $userId]);
        // @lid é conversa válida (WhatsApp LID) — não deletar, senão o id do chat
        // muda a cada sync (getOrCreateChat recria) e o front recebe 404 em messages.
        $st = $this->pdo->prepare(
            "DELETE FROM whatsapp_chats
             WHERE user_id = ?
             AND (
               remote_jid LIKE '%@broadcast%'
               OR remote_jid LIKE '%@newsletter%'
               OR (
                 remote_jid NOT LIKE '%@lid%'
                 AND (CHAR_LENGTH(contact_phone) < 10 OR CHAR_LENGTH(contact_phone) > 13)
                 AND (contact_name IS NULL OR TRIM(contact_name) = '')
               )
             )"
        );
        $st->execute([$userId]);
        return $st->rowCount();
    }

    public function deleteAllChatsForUser(string $userId): int
    {
        $this->pdo->prepare(
            'DELETE m FROM whatsapp_messages m
             INNER JOIN whatsapp_chats c ON c.id = m.chat_id
             WHERE c.user_id = ?'
        )->execute([$userId]);
        $st = $this->pdo->prepare('DELETE FROM whatsapp_chats WHERE user_id = ?');
        $st->execute([$userId]);
        return $st->rowCount();
    }

    public function getChatForUser(string $chatId, string $userId): ?array
    {
        $st = $this->pdo->prepare('SELECT * FROM whatsapp_chats WHERE id = ? AND user_id = ? LIMIT 1');
        $st->execute([$chatId, $userId]);
        $row = $st->fetch();
        return $row ?: null;
    }

    public function clearUnread(string $chatId): void
    {
        $this->pdo->prepare('UPDATE whatsapp_chats SET unread_count = 0, updated_at = ? WHERE id = ?')
            ->execute([gmdate('Y-m-d H:i:s'), $chatId]);
    }

    public function listMessages(string $chatId): array
    {
        $st = $this->pdo->prepare(
            'SELECT id, direction, body, message_type, media_url, status, created_at
             FROM whatsapp_messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 500'
        );
        $st->execute([$chatId]);
        return $st->fetchAll() ?: [];
    }

    public function getMessageForUser(string $messageId, string $userId): ?array
    {
        $st = $this->pdo->prepare(
            'SELECT m.* FROM whatsapp_messages m
             INNER JOIN whatsapp_chats c ON c.id = m.chat_id
             WHERE m.id = ? AND c.user_id = ? LIMIT 1'
        );
        $st->execute([$messageId, $userId]);
        $row = $st->fetch();
        return $row ?: null;
    }

    public function updateMessageMediaUrl(string $messageId, string $mediaUrl): void
    {
        $this->pdo->prepare('UPDATE whatsapp_messages SET media_url = ? WHERE id = ?')
            ->execute([$mediaUrl, $messageId]);
    }

    public function deleteMessageForUser(string $messageId, string $userId): bool
    {
        $msg = $this->getMessageForUser($messageId, $userId);
        if (!$msg) {
            return false;
        }
        $chatId = (string) ($msg['chat_id'] ?? '');
        $this->pdo->prepare('DELETE FROM whatsapp_messages WHERE id = ?')->execute([$messageId]);
        if ($chatId !== '') {
            $this->refreshChatPreview($chatId);
        }
        return true;
    }

    private function refreshChatPreview(string $chatId): void
    {
        $st = $this->pdo->prepare(
            'SELECT body, message_type, created_at FROM whatsapp_messages
             WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1'
        );
        $st->execute([$chatId]);
        $last = $st->fetch();
        $now = gmdate('Y-m-d H:i:s');
        if ($last) {
            $preview = wa_repo_message_preview(
                (string) ($last['message_type'] ?? 'text'),
                (string) ($last['body'] ?? '')
            );
            $this->pdo->prepare(
                'UPDATE whatsapp_chats SET last_message_at = ?, last_message_preview = ?, updated_at = ? WHERE id = ?'
            )->execute([$last['created_at'], $preview, $now, $chatId]);
            return;
        }
        $this->pdo->prepare(
            'UPDATE whatsapp_chats SET last_message_at = NULL, last_message_preview = ?, updated_at = ? WHERE id = ?'
        )->execute(['', $now, $chatId]);
    }

    public function updateChatMeta(string $chatId, array $fields): void
    {
        $allowed = ['contact_name', 'contact_phone', 'contact_phone_tail', 'contact_avatar_url', 'last_message_at', 'last_message_preview', 'unread_count', 'kanban_stage', 'name_locked', 'remote_jid', 'whaticket_ticket_id'];
        $existing = $this->existingChatColumns();
        $sets = [];
        $vals = [];
        foreach ($allowed as $k) {
            if (!array_key_exists($k, $fields)) {
                continue;
            }
            if ($existing !== [] && !isset($existing[$k])) {
                continue;
            }
            $val = $fields[$k];
            // Telefone vazio → NULL (UNIQUE permite vários NULL, não vários '').
            if ($k === 'contact_phone' && ($val === '' || $val === null)) {
                $val = null;
            }
            $sets[] = $k . ' = ?';
            $vals[] = $val;
        }
        if (array_key_exists('contact_phone', $fields)
            && !array_key_exists('contact_phone_tail', $fields)
            && ($existing === [] || isset($existing['contact_phone_tail']))) {
            $rawPhone = $fields['contact_phone'];
            if ($rawPhone !== '' && $rawPhone !== null) {
                $canon = wa_repo_canonical_phone((string) $rawPhone);
                $tail = wa_repo_phone_tail($canon !== '' ? $canon : (string) $rawPhone);
                if ($tail !== '') {
                    $sets[] = 'contact_phone_tail = ?';
                    $vals[] = $tail;
                }
            }
        }
        if (!$sets) {
            return;
        }
        $sets[] = 'updated_at = ?';
        $vals[] = gmdate('Y-m-d H:i:s');
        $vals[] = $chatId;
        $this->pdo->prepare('UPDATE whatsapp_chats SET ' . implode(', ', $sets) . ' WHERE id = ?')
            ->execute($vals);
    }

    /** @return array<string, true> */
    private function existingChatColumns(): array
    {
        static $map = null;
        if ($map !== null) {
            return $map;
        }
        $map = [];
        try {
            $st = $this->pdo->query('SHOW COLUMNS FROM whatsapp_chats');
            while ($st && ($row = $st->fetch(PDO::FETCH_ASSOC))) {
                $field = (string) ($row['Field'] ?? '');
                if ($field !== '') {
                    $map[$field] = true;
                }
            }
        } catch (Throwable $e) {
            $map = [];
        }
        return $map;
    }
}

final class WhatsAppRepositorySupabase implements WhatsAppRepository
{
    public function __construct(private SupabaseClient $sb)
    {
    }

    private function now(): string
    {
        return gmdate('Y-m-d\TH:i:s\Z');
    }

    public function getInstance(string $userId): ?array
    {
        return $this->sb->selectOne('whatsapp_instances', 'user_id=eq.' . rawurlencode($userId) . '&select=*');
    }

    public function getInstanceByName(string $instanceName): ?array
    {
        return $this->sb->selectOne('whatsapp_instances', 'instance_name=eq.' . rawurlencode($instanceName) . '&select=*');
    }

    public function ensureInstance(string $userId, string $instanceName): array
    {
        $row = $this->getInstance($userId);
        if ($row) {
            return $row;
        }
        $id = bin2hex(random_bytes(16));
        $now = $this->now();
        $rows = $this->sb->rest('POST', 'whatsapp_instances', [
            'id' => $id,
            'user_id' => $userId,
            'instance_name' => $instanceName,
            'phone' => null,
            'status' => 'close',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        return $rows[0] ?? $this->getInstance($userId) ?? [];
    }

    public function updateInstanceStatus(string $instanceId, string $status, ?string $phone = null): void
    {
        $patch = ['status' => $status, 'updated_at' => $this->now()];
        if ($phone !== null) {
            $patch['phone'] = $phone;
        }
        $this->sb->rest('PATCH', 'whatsapp_instances', $patch, '?id=eq.' . rawurlencode($instanceId));
    }

    public function renameInstance(string $instanceId, string $newInstanceName): void
    {
        $this->sb->rest('PATCH', 'whatsapp_instances', [
            'instance_name' => $newInstanceName,
            'phone' => null,
            'status' => 'close',
            'updated_at' => $this->now(),
        ], '?id=eq.' . rawurlencode($instanceId));
    }

    public function isSessionRevoked(string $userId): bool
    {
        $row = $this->sb->selectOne(
            'whatsapp_instances',
            'user_id=eq.' . rawurlencode($userId) . '&select=session_revoked_at,status'
        );
        if (!$row) {
            return false;
        }
        return !empty($row['session_revoked_at']) || (string) ($row['status'] ?? '') === 'revoked';
    }

    public function markSessionRevoked(string $userId): void
    {
        $now = $this->now();
        $this->sb->rest('PATCH', 'whatsapp_instances', [
            'session_revoked_at' => $now,
            'status' => 'revoked',
            'phone' => null,
            'updated_at' => $now,
        ], '?user_id=eq.' . rawurlencode($userId));
    }

    public function clearSessionRevoked(string $userId): void
    {
        $this->sb->rest('PATCH', 'whatsapp_instances', [
            'session_revoked_at' => null,
            'updated_at' => $this->now(),
        ], '?user_id=eq.' . rawurlencode($userId));
    }

    public function getOrCreateChat(array $instance, string $remoteJid, ?string $contactName = null): array
    {
        $instanceId = (string) $instance['id'];
        $remoteJid = strtolower(trim($remoteJid));
        $phone = wa_repo_phone_from_jid($remoteJid);

        $existing = null;
        if ($phone !== '') {
            $existing = $this->getChatByPhone($instanceId, $phone);
        }
        if (!$existing) {
            $existing = $this->getChatByJid($instanceId, $remoteJid);
        }
        if ($existing) {
            wa_repo_session_log('WhatsAppRepositorySupabase::getOrCreateChat', 'upsert update', [
                'chat_id' => $existing['id'] ?? '',
                'remote_jid' => $remoteJid,
                'phone_tail' => $phone !== '' ? wa_repo_phone_tail($phone) : '',
            ]);
            return $this->mergeChatRowSupabase($existing, $remoteJid, $phone, $contactName);
        }

        $id = bin2hex(random_bytes(16));
        $now = $this->now();
        $phoneCanon = $phone !== '' ? wa_repo_canonical_phone($phone) : '';
        $phoneVal = $phoneCanon !== '' ? $phoneCanon : null;
        $phoneTail = $phoneCanon !== '' ? wa_repo_phone_tail($phoneCanon) : null;
        $nameVal = $contactName !== null && trim($contactName) !== '' ? trim($contactName) : null;

        wa_repo_session_log('WhatsAppRepositorySupabase::getOrCreateChat', 'upsert insert', [
            'remote_jid' => $remoteJid,
            'phone_tail' => $phoneTail,
        ]);

        $payload = [
            'id' => $id,
            'instance_id' => $instance['id'],
            'user_id' => $instance['user_id'],
            'remote_jid' => $remoteJid,
            'contact_phone' => $phoneVal,
            'contact_name' => $nameVal,
            'last_message_at' => null,
            'last_message_preview' => null,
            'unread_count' => 0,
            'kanban_stage' => 'novo',
            'created_at' => $now,
            'updated_at' => $now,
        ];
        if ($phoneTail !== null && $phoneTail !== '') {
            $payload['contact_phone_tail'] = $phoneTail;
        }
        try {
            $rows = $this->sb->rest('POST', 'whatsapp_chats', $payload);
        } catch (Throwable $e) {
            $rows = [];
        }
        if ($rows[0] ?? null) {
            return $rows[0];
        }
        $retry = $phone !== '' ? $this->getChatByPhone($instanceId, $phone) : null;
        if (!$retry) {
            $retry = $this->getChatByJid($instanceId, $remoteJid);
        }
        if ($retry) {
            return $this->mergeChatRowSupabase($retry, $remoteJid, $phone, $contactName);
        }
        return [];
    }

    private function mergeChatRowSupabase(array $chat, string $remoteJid, string $phone, ?string $contactName): array
    {
        $chatId = (string) ($chat['id'] ?? '');
        if ($chatId === '') {
            return $chat;
        }
        $patch = ['updated_at' => $this->now()];
        $preferredJid = wa_repo_prefer_remote_jid((string) ($chat['remote_jid'] ?? ''), $remoteJid);
        if (strtolower(trim((string) ($chat['remote_jid'] ?? ''))) !== $preferredJid) {
            $patch['remote_jid'] = $preferredJid;
        }
        if ($phone !== '') {
            $canon = wa_repo_canonical_phone($phone);
            $storedPhone = preg_replace('/\D+/', '', (string) ($chat['contact_phone'] ?? '')) ?? '';
            $storedTail = wa_repo_phone_tail($storedPhone);
            $tail = wa_repo_phone_tail($canon);
            if ($canon !== '' && ($storedPhone === '' || $storedTail !== $tail)) {
                $patch['contact_phone'] = $canon;
            }
            if ($tail !== '' && $storedTail !== $tail) {
                $patch['contact_phone_tail'] = $tail;
            }
        }
        $oldName = trim((string) ($chat['contact_name'] ?? ''));
        $newName = trim((string) ($contactName ?? ''));
        if (empty($chat['name_locked']) && wa_repo_should_update_contact_name($oldName, $newName)) {
            $patch['contact_name'] = $newName;
        }
        if (count($patch) > 1) {
            $this->sb->rest('PATCH', 'whatsapp_chats', $patch, '?id=eq.' . rawurlencode($chatId));
            return array_merge($chat, $patch);
        }
        return $chat;
    }

    public function insertMessage(
        array $chat,
        array $instance,
        string $direction,
        string $body,
        ?string $waMessageId = null,
        string $messageType = 'text',
        ?string $mediaUrl = null,
        ?string $createdAt = null,
        ?string $rawPayload = null
    ): array {
        if ($waMessageId !== null && $waMessageId !== '') {
            $existing = $this->getMessageByWaId($waMessageId);
            if ($existing) {
                if ((string) ($existing['chat_id'] ?? '') !== (string) ($chat['id'] ?? '')) {
                    $this->updateMessageChat(
                        (string) $existing['id'],
                        (string) $chat['id'],
                        (string) ($chat['remote_jid'] ?? '')
                    );
                }
                return $existing;
            }
        }
        $id = bin2hex(random_bytes(16));
        $now = $this->now();
        $preview = wa_repo_message_preview($messageType, $body);
        $rows = $this->sb->rest('POST', 'whatsapp_messages', [
            'id' => $id,
            'chat_id' => $chat['id'],
            'instance_id' => $instance['id'],
            'user_id' => $instance['user_id'],
            'remote_jid' => $chat['remote_jid'],
            'direction' => $direction,
            'message_type' => $messageType,
            'body' => $body,
            'media_url' => $mediaUrl,
            'wa_message_id' => $waMessageId,
            'status' => $direction === 'out' ? 'sent' : 'received',
            'created_at' => $createdAt ?? $now,
            'raw_payload' => $rawPayload,
        ]);
        if (!$rows && $waMessageId !== null && $waMessageId !== '') {
            $dup = $this->getMessageByWaId($waMessageId);
            if ($dup) {
                return $dup;
            }
        }
        $unread = (int) ($chat['unread_count'] ?? 0) + ($direction === 'in' ? 1 : 0);
        $this->sb->rest('PATCH', 'whatsapp_chats', [
            'last_message_at' => $now,
            'last_message_preview' => $preview,
            'unread_count' => $unread,
            'updated_at' => $now,
        ], '?id=eq.' . rawurlencode((string) $chat['id']));
        return $rows[0] ?? $this->getMessageByWaId((string) $waMessageId) ?? [];
    }

    public function messageExistsByWaId(string $waMessageId): bool
    {
        if ($waMessageId === '') {
            return false;
        }
        return $this->sb->selectOne('whatsapp_messages', 'wa_message_id=eq.' . rawurlencode($waMessageId) . '&select=id') !== null;
    }

    public function getMessageByWaId(string $waMessageId): ?array
    {
        if ($waMessageId === '') {
            return null;
        }
        return $this->sb->selectOne('whatsapp_messages', 'wa_message_id=eq.' . rawurlencode($waMessageId) . '&select=*');
    }

    public function updateMessageDirection(string $messageId, string $direction): void
    {
        $dir = $direction === 'out' ? 'out' : 'in';
        $this->sb->rest('PATCH', 'whatsapp_messages', [
            'direction' => $dir,
            'status' => $dir === 'out' ? 'sent' : 'received',
        ], '?id=eq.' . rawurlencode($messageId));
    }

    public function updateMessageChat(string $messageId, string $chatId, string $remoteJid): void
    {
        $this->sb->rest('PATCH', 'whatsapp_messages', [
            'chat_id' => $chatId,
            'remote_jid' => $remoteJid,
        ], '?id=eq.' . rawurlencode($messageId));
    }

    public function listChats(string $userId, bool $activeOnly = false): array
    {
        $q = '?user_id=eq.' . rawurlencode($userId)
            . '&select=id,contact_phone,contact_name,contact_avatar_url,remote_jid,kanban_stage,last_message_at,last_message_preview,unread_count'
            . '&order=last_message_at.desc.nullslast&limit=200';
        $rows = $this->sb->rest('GET', 'whatsapp_chats', null, $q);
        if (!$activeOnly || !is_array($rows)) {
            return is_array($rows) ? $rows : [];
        }
        $out = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            if (!empty($row['last_message_at'])) {
                $out[] = $row;
                continue;
            }
            $cid = (string) ($row['id'] ?? '');
            if ($cid === '') {
                continue;
            }
            $msgs = $this->sb->rest('GET', 'whatsapp_messages', null, '?chat_id=eq.' . rawurlencode($cid) . '&select=id&limit=1');
            if (is_array($msgs) && $msgs !== []) {
                $out[] = $row;
            }
        }
        return $out;
    }

    public function countChats(string $userId, bool $activeOnly = false): int
    {
        return count($this->listChats($userId, $activeOnly));
    }

    public function getChatByJid(string $instanceId, string $remoteJid): ?array
    {
        return $this->sb->selectOne(
            'whatsapp_chats',
            'instance_id=eq.' . rawurlencode($instanceId)
            . '&remote_jid=eq.' . rawurlencode(strtolower(trim($remoteJid)))
            . '&select=*'
        );
    }

    public function getChatByPhone(string $instanceId, string $phone): ?array
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if ($digits === '' || strlen($digits) < 10 || strlen($digits) > 13) {
            return null;
        }
        $variants = array_values(array_unique(array_filter([
            $digits,
            wa_repo_canonical_phone($digits),
            wa_repo_phone_tail($digits),
        ])));
        foreach ($variants as $v) {
            if ($v === '' || strlen($v) < 10) {
                continue;
            }
            $row = $this->sb->selectOne(
                'whatsapp_chats',
                'instance_id=eq.' . rawurlencode($instanceId)
                . '&contact_phone=eq.' . rawurlencode($v)
                . '&order=last_message_at.desc&select=*'
            );
            if ($row) {
                return $row;
            }
        }
        $tail = wa_repo_phone_tail($digits);
        if ($tail === '') {
            return null;
        }
        $byTail = $this->sb->selectOne(
            'whatsapp_chats',
            'instance_id=eq.' . rawurlencode($instanceId)
            . '&contact_phone_tail=eq.' . rawurlencode($tail)
            . '&order=last_message_at.desc&select=*'
        );
        if ($byTail) {
            return $byTail;
        }
        $rows = $this->sb->rest(
            'GET',
            'whatsapp_chats',
            null,
            '?instance_id=eq.' . rawurlencode($instanceId)
            . '&contact_phone=not.is.null&select=*&order=last_message_at.desc&limit=300'
        );
        if (!is_array($rows)) {
            return null;
        }
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            if (wa_repo_phone_tail((string) ($row['contact_phone'] ?? '')) === $tail) {
                return $row;
            }
        }
        return null;
    }

    public function pruneEmptyChats(string $userId): int
    {
        $rows = $this->sb->rest('GET', 'whatsapp_chats', null, '?user_id=eq.' . rawurlencode($userId) . '&last_message_at=is.null&select=id');
        if (!is_array($rows)) {
            return 0;
        }
        $pruned = 0;
        foreach ($rows as $row) {
            $cid = (string) ($row['id'] ?? '');
            if ($cid === '') {
                continue;
            }
            $msgs = $this->sb->rest('GET', 'whatsapp_messages', null, '?chat_id=eq.' . rawurlencode($cid) . '&select=id&limit=1');
            if (is_array($msgs) && $msgs !== []) {
                continue;
            }
            $this->sb->rest('DELETE', 'whatsapp_chats', null, '?id=eq.' . rawurlencode($cid));
            $pruned++;
        }
        return $pruned;
    }

    public function pruneInvalidChats(string $userId): int
    {
        $rows = $this->sb->rest('GET', 'whatsapp_chats', null, '?user_id=eq.' . rawurlencode($userId) . '&select=id,remote_jid,contact_phone,contact_name');
        if (!is_array($rows)) {
            return 0;
        }
        $pruned = 0;
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $jid = strtolower((string) ($row['remote_jid'] ?? ''));
            $name = trim((string) ($row['contact_name'] ?? ''));
            $phone = preg_replace('/\D+/', '', (string) ($row['contact_phone'] ?? '')) ?? '';
            $isLid = str_contains($jid, '@lid');
            // @lid é conversa válida (WhatsApp LID) — não deletar, senão o id do chat
            // muda a cada sync (getOrCreateChat recria) e o front recebe 404 em messages.
            $badJid = str_contains($jid, '@broadcast') || str_contains($jid, '@newsletter');
            $badPhone = strlen($phone) < 10 || strlen($phone) > 13;
            $badName = $name !== '' && preg_match('/^\d{14,}$/', $phone) && preg_match('/^\d+$/', preg_replace('/\D+/', '', $name) ?? '');
            if ($badName) {
                $this->sb->rest('PATCH', 'whatsapp_chats', ['contact_name' => null], '?id=eq.' . rawurlencode((string) $row['id']));
            }
            if ($badJid || (!$isLid && $badPhone && $name === '')) {
                $this->sb->rest('DELETE', 'whatsapp_chats', null, '?id=eq.' . rawurlencode((string) $row['id']));
                $pruned++;
            }
        }
        return $pruned;
    }

    public function deleteAllChatsForUser(string $userId): int
    {
        $rows = $this->sb->rest('GET', 'whatsapp_chats', null, '?user_id=eq.' . rawurlencode($userId) . '&select=id');
        if (!is_array($rows)) {
            return 0;
        }
        $deleted = 0;
        foreach ($rows as $row) {
            $cid = (string) ($row['id'] ?? '');
            if ($cid === '') {
                continue;
            }
            $this->sb->rest('DELETE', 'whatsapp_messages', null, '?chat_id=eq.' . rawurlencode($cid));
            $this->sb->rest('DELETE', 'whatsapp_chats', null, '?id=eq.' . rawurlencode($cid));
            $deleted++;
        }
        return $deleted;
    }

    public function getChatForUser(string $chatId, string $userId): ?array
    {
        return $this->sb->selectOne(
            'whatsapp_chats',
            'id=eq.' . rawurlencode($chatId) . '&user_id=eq.' . rawurlencode($userId) . '&select=*'
        );
    }

    public function clearUnread(string $chatId): void
    {
        $this->sb->rest('PATCH', 'whatsapp_chats', [
            'unread_count' => 0,
            'updated_at' => $this->now(),
        ], '?id=eq.' . rawurlencode($chatId));
    }

    public function listMessages(string $chatId): array
    {
        return $this->sb->rest(
            'GET',
            'whatsapp_messages',
            null,
            '?chat_id=eq.' . rawurlencode($chatId)
            . '&select=id,direction,body,message_type,media_url,status,created_at'
            . '&order=created_at.asc&limit=500'
        );
    }

    public function getMessageForUser(string $messageId, string $userId): ?array
    {
        $msg = $this->sb->selectOne(
            'whatsapp_messages',
            'id=eq.' . rawurlencode($messageId) . '&select=*'
        );
        if (!$msg) {
            return null;
        }
        $chat = $this->getChatForUser((string) ($msg['chat_id'] ?? ''), $userId);
        return $chat ? $msg : null;
    }

    public function updateMessageMediaUrl(string $messageId, string $mediaUrl): void
    {
        $this->sb->rest('PATCH', 'whatsapp_messages', [
            'media_url' => $mediaUrl,
        ], '?id=eq.' . rawurlencode($messageId));
    }

    public function deleteMessageForUser(string $messageId, string $userId): bool
    {
        $msg = $this->getMessageForUser($messageId, $userId);
        if (!$msg) {
            return false;
        }
        $chatId = (string) ($msg['chat_id'] ?? '');
        $this->sb->rest('DELETE', 'whatsapp_messages', null, '?id=eq.' . rawurlencode($messageId));
        if ($chatId !== '') {
            $this->refreshChatPreview($chatId);
        }
        return true;
    }

    private function refreshChatPreview(string $chatId): void
    {
        $rows = $this->sb->rest(
            'GET',
            'whatsapp_messages',
            null,
            '?chat_id=eq.' . rawurlencode($chatId)
            . '&select=body,message_type,created_at&order=created_at.desc&limit=1'
        );
        $last = is_array($rows) ? ($rows[0] ?? null) : null;
        $patch = ['updated_at' => $this->now()];
        if ($last) {
            $patch['last_message_at'] = $last['created_at'] ?? null;
            $patch['last_message_preview'] = wa_repo_message_preview(
                (string) ($last['message_type'] ?? 'text'),
                (string) ($last['body'] ?? '')
            );
        } else {
            $patch['last_message_at'] = null;
            $patch['last_message_preview'] = '';
        }
        $this->sb->rest('PATCH', 'whatsapp_chats', $patch, '?id=eq.' . rawurlencode($chatId));
    }

    public function updateChatMeta(string $chatId, array $fields): void
    {
        $allowed = ['contact_name', 'contact_phone', 'contact_phone_tail', 'contact_avatar_url', 'last_message_at', 'last_message_preview', 'unread_count', 'kanban_stage', 'name_locked', 'remote_jid', 'whaticket_ticket_id'];
        $patch = ['updated_at' => $this->now()];
        foreach ($allowed as $k) {
            if (array_key_exists($k, $fields)) {
                $patch[$k] = $fields[$k];
            }
        }
        if (count($patch) <= 1) {
            return;
        }
        $this->sb->rest('PATCH', 'whatsapp_chats', $patch, '?id=eq.' . rawurlencode($chatId));
    }
}

function soublu_whatsapp_repository(): WhatsAppRepository
{
    static $repo = null;
    if ($repo instanceof WhatsAppRepository) {
        return $repo;
    }
    $backend = soublu_wa_db_backend();
    if ($backend === 'supabase') {
        $repo = new WhatsAppRepositorySupabase(soublu_supabase_v2_client());
        return $repo;
    }
    $repo = new WhatsAppRepositoryMysql(soublu_pdo());
    return $repo;
}

function soublu_wa_db_backend(): string
{
    if (defined('WA_DB_BACKEND')) {
        $b = strtolower(trim((string) WA_DB_BACKEND));
        if ($b === 'supabase' && soublu_supabase_v2_configured()) {
            return 'supabase';
        }
    }
    return 'mysql';
}

/** @deprecated Use soublu_supabase_v2_client() — legado apontava para o projeto original. */
function soublu_supabase_client(): SupabaseClient
{
    return soublu_supabase_v2_client();
}
