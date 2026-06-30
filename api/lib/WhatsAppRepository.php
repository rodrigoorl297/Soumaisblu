<?php
declare(strict_types=1);

require_once __DIR__ . '/SupabaseClient.php';
require_once __DIR__ . '/SupabaseV2.php';

interface WhatsAppRepository
{
    public function getInstance(string $userId): ?array;

    public function getInstanceByName(string $instanceName): ?array;

    public function ensureInstance(string $userId, string $instanceName): array;

    public function updateInstanceStatus(string $instanceId, string $status, ?string $phone = null): void;

    public function getOrCreateChat(array $instance, string $remoteJid, ?string $contactName = null): array;

    public function insertMessage(
        array $chat,
        array $instance,
        string $direction,
        string $body,
        ?string $waMessageId = null,
        string $messageType = 'text',
        ?string $mediaUrl = null
    ): array;

    public function messageExistsByWaId(string $waMessageId): bool;

    public function getMessageByWaId(string $waMessageId): ?array;

    public function updateMessageDirection(string $messageId, string $direction): void;

    public function listChats(string $userId, bool $activeOnly = false): array;

    public function getChatByJid(string $instanceId, string $remoteJid): ?array;

    public function pruneEmptyChats(string $userId): int;

    public function pruneInvalidChats(string $userId): int;

    public function deleteAllChatsForUser(string $userId): int;

    public function getChatForUser(string $chatId, string $userId): ?array;

    public function clearUnread(string $chatId): void;

    public function listMessages(string $chatId): array;

    public function getMessageForUser(string $messageId, string $userId): ?array;

    public function updateMessageMediaUrl(string $messageId, string $mediaUrl): void;

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

    public function getOrCreateChat(array $instance, string $remoteJid, ?string $contactName = null): array
    {
        $st = $this->pdo->prepare('SELECT * FROM whatsapp_chats WHERE instance_id = ? AND remote_jid = ? LIMIT 1');
        $st->execute([$instance['id'], $remoteJid]);
        $chat = $st->fetch();
        if ($chat) {
            return $chat;
        }
        $id = bin2hex(random_bytes(16));
        $phone = preg_replace('/\D+/', '', explode('@', $remoteJid)[0] ?? $remoteJid) ?? '';
        $now = gmdate('Y-m-d H:i:s');
        $st = $this->pdo->prepare(
            'INSERT INTO whatsapp_chats
             (id, instance_id, user_id, remote_jid, contact_phone, contact_name, last_message_at, last_message_preview, unread_count, kanban_stage, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, ?)'
        );
        $st->execute([
            $id, $instance['id'], $instance['user_id'], $remoteJid, $phone, $contactName, 'novo', $now, $now,
        ]);
        $st = $this->pdo->prepare('SELECT * FROM whatsapp_chats WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        return $st->fetch() ?: [];
    }

    public function insertMessage(
        array $chat,
        array $instance,
        string $direction,
        string $body,
        ?string $waMessageId = null,
        string $messageType = 'text',
        ?string $mediaUrl = null
    ): array {
        $id = bin2hex(random_bytes(16));
        $now = gmdate('Y-m-d H:i:s');
        $preview = mb_substr(trim(strip_tags($body)), 0, 240);
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
        $unreadAdd = $direction === 'in' ? 1 : 0;
        $st = $this->pdo->prepare(
            'UPDATE whatsapp_chats SET last_message_at = ?, last_message_preview = ?, unread_count = unread_count + ?, updated_at = ? WHERE id = ?'
        );
        $st->execute([$now, $preview, $unreadAdd, $now, $chat['id']]);
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

    public function listChats(string $userId, bool $activeOnly = false): array
    {
        $sql = 'SELECT id, contact_phone, contact_name, contact_avatar_url, remote_jid, kanban_stage, last_message_at, last_message_preview, unread_count
             FROM whatsapp_chats WHERE user_id = ?';
        if ($activeOnly) {
            $sql .= ' AND (last_message_at IS NOT NULL OR EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.chat_id = whatsapp_chats.id LIMIT 1))';
        }
        $sql .= ' ORDER BY last_message_at DESC, contact_name ASC LIMIT 200';
        $st = $this->pdo->prepare($sql);
        $st->execute([$userId]);
        return $st->fetchAll() ?: [];
    }

    public function getChatByJid(string $instanceId, string $remoteJid): ?array
    {
        $st = $this->pdo->prepare('SELECT * FROM whatsapp_chats WHERE instance_id = ? AND remote_jid = ? LIMIT 1');
        $st->execute([$instanceId, $remoteJid]);
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
        $st = $this->pdo->prepare(
            "DELETE FROM whatsapp_chats
             WHERE user_id = ?
             AND (
               remote_jid LIKE '%@lid%'
               OR remote_jid LIKE '%@broadcast%'
               OR remote_jid LIKE '%@newsletter%'
               OR (
                 (CHAR_LENGTH(contact_phone) < 10 OR CHAR_LENGTH(contact_phone) > 13)
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

    public function updateChatMeta(string $chatId, array $fields): void
    {
        $allowed = ['contact_name', 'contact_phone', 'contact_avatar_url', 'last_message_at', 'last_message_preview', 'unread_count', 'kanban_stage'];
        $sets = [];
        $vals = [];
        foreach ($allowed as $k) {
            if (!array_key_exists($k, $fields)) {
                continue;
            }
            $sets[] = $k . ' = ?';
            $vals[] = $fields[$k];
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

    public function getOrCreateChat(array $instance, string $remoteJid, ?string $contactName = null): array
    {
        $existing = $this->sb->selectOne(
            'whatsapp_chats',
            'instance_id=eq.' . rawurlencode((string) $instance['id'])
            . '&remote_jid=eq.' . rawurlencode($remoteJid)
            . '&select=*'
        );
        if ($existing) {
            return $existing;
        }
        $id = bin2hex(random_bytes(16));
        $phone = preg_replace('/\D+/', '', explode('@', $remoteJid)[0] ?? $remoteJid) ?? '';
        $now = $this->now();
        $rows = $this->sb->rest('POST', 'whatsapp_chats', [
            'id' => $id,
            'instance_id' => $instance['id'],
            'user_id' => $instance['user_id'],
            'remote_jid' => $remoteJid,
            'contact_phone' => $phone,
            'contact_name' => $contactName,
            'last_message_at' => null,
            'last_message_preview' => null,
            'unread_count' => 0,
            'kanban_stage' => 'novo',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        return $rows[0] ?? [];
    }

    public function insertMessage(
        array $chat,
        array $instance,
        string $direction,
        string $body,
        ?string $waMessageId = null,
        string $messageType = 'text',
        ?string $mediaUrl = null
    ): array {
        $id = bin2hex(random_bytes(16));
        $now = $this->now();
        $preview = mb_substr(trim(strip_tags($body)), 0, 240);
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
            'created_at' => $now,
        ]);
        $unread = (int) ($chat['unread_count'] ?? 0) + ($direction === 'in' ? 1 : 0);
        $this->sb->rest('PATCH', 'whatsapp_chats', [
            'last_message_at' => $now,
            'last_message_preview' => $preview,
            'unread_count' => $unread,
            'updated_at' => $now,
        ], '?id=eq.' . rawurlencode((string) $chat['id']));
        return $rows[0] ?? [];
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

    public function getChatByJid(string $instanceId, string $remoteJid): ?array
    {
        return $this->sb->selectOne(
            'whatsapp_chats',
            'instance_id=eq.' . rawurlencode($instanceId) . '&remote_jid=eq.' . rawurlencode($remoteJid) . '&select=*'
        );
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
            $badJid = str_contains($jid, '@lid') || str_contains($jid, '@broadcast') || str_contains($jid, '@newsletter');
            $badPhone = strlen($phone) < 10 || strlen($phone) > 13;
            $badName = $name !== '' && preg_match('/^\d{14,}$/', $phone) && preg_match('/^\d+$/', preg_replace('/\D+/', '', $name) ?? '');
            if ($badName) {
                $this->sb->rest('PATCH', 'whatsapp_chats', ['contact_name' => null], '?id=eq.' . rawurlencode((string) $row['id']));
            }
            if ($badJid || ($badPhone && $name === '')) {
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

    public function updateChatMeta(string $chatId, array $fields): void
    {
        $allowed = ['contact_name', 'contact_phone', 'contact_avatar_url', 'last_message_at', 'last_message_preview', 'unread_count', 'kanban_stage'];
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
