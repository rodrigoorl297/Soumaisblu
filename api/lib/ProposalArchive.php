<?php
declare(strict_types=1);

/**
 * Arquivo: api/lib/ProposalArchive.php
 * O que é: lixeira/backup de propostas no servidor Localweb.
 * O que faz: quando alguém tenta DELETE, grava cópia em disco (uploads/proposal-archive)
 *            e na tabela proposal_archive; a ficha viva vira Cancelado (paga não mexe).
 * Por quê: DELETE antigo não deixava rastro (Leonardo BTW / Raphaell).
 */

/**
 * soublu_request_actor_name — lê quem clicou na exclusão (header X-Soublu-Actor).
 * Sem isso a API só vê a chave compartilhada e não sabe o usuário.
 */
function soublu_request_actor_name(): string
{
    $raw = (string) ($_SERVER['HTTP_X_SOUBLU_ACTOR'] ?? '');
    if ($raw === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strtolower((string) $k) === 'x-soublu-actor') {
                $raw = (string) $v;
                break;
            }
        }
    }
    $name = trim(preg_replace('/[\x00-\x1F\x7F]/', '', $raw) ?? '');
    return $name !== '' ? substr($name, 0, 120) : 'api';
}

/**
 * soublu_proposal_row_is_paid — mesma regra do front (status/fase com PAGO, não cancelada).
 */
function soublu_proposal_row_is_paid(array $row): bool
{
    $st = soublu_proposal_status_norm($row['status'] ?? '');
    $fase = soublu_proposal_status_norm($row['statusOp'] ?? $row['status_op'] ?? '');
    if (str_contains($st, 'CANCEL') || str_contains($fase, 'CANCEL')) {
        return false;
    }
    $isPago = static function (string $v): bool {
        return $v === 'PAGO' || (bool) preg_match('/(^|[^A-Z])PAGO([^A-Z]|$)/', $v);
    };
    return $isPago($st) || $isPago($fase);
}

/** Normaliza status para comparar (sem acento, maiúsculo). */
function soublu_proposal_status_norm(mixed $s): string
{
    $t = strtoupper(trim((string) $s));
    if (class_exists('Normalizer')) {
        $n = \Normalizer::normalize($t, \Normalizer::FORM_D);
        if (is_string($n)) {
            $t = $n;
        }
    }
    $t = preg_replace('/\p{Mn}/u', '', $t) ?? $t;
    return $t;
}

/**
 * Pasta na Localweb: {UPLOAD_DIR}/proposal-archive/AAAA/MM/
 * .htaccess impede download público do JSON.
 */
function soublu_proposal_archive_dir(): string
{
    $siteRoot = dirname(__DIR__, 2);
    $base = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : ($siteRoot . '/uploads');
    $base = rtrim(str_replace('\\', '/', $base), '/');
    if ($base === '' || $base === '.' || !preg_match('#^(/|[a-zA-Z]:/)#', $base)) {
        $base = $siteRoot . '/uploads';
    }
    $dir = $base . '/proposal-archive/' . date('Y') . '/' . date('m');
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Não foi possível criar pasta de arquivo na Localweb.', 500);
    }
    $ht = $base . '/proposal-archive/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "Require all denied\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\nDeny from all\n");
    }
    return $dir;
}

/**
 * Cria a tabela proposal_archive se ainda não existir (MySQL Localweb).
 */
function soublu_proposal_archive_ensure_table(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS `proposal_archive` (
            `id` VARCHAR(96) NOT NULL,
            `proposal_id` VARCHAR(80) NOT NULL,
            `client_cpf` VARCHAR(20) NULL,
            `client_name` VARCHAR(255) NULL,
            `numero` VARCHAR(64) NULL,
            `product` VARCHAR(128) NULL,
            `status` VARCHAR(64) NULL,
            `archived_at` DATETIME NOT NULL,
            `archive_reason` VARCHAR(64) NOT NULL DEFAULT 'api_delete',
            `archived_by` VARCHAR(120) NULL,
            `file_path` VARCHAR(512) NULL,
            `snapshot` LONGTEXT NOT NULL,
            PRIMARY KEY (`id`),
            KEY `idx_pa_proposal` (`proposal_id`),
            KEY `idx_pa_cpf` (`client_cpf`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $done = true;
}

/**
 * Grava a ficha em JSON na Localweb + uma linha em proposal_archive.
 * Não apaga a proposta viva. Retorna o id do arquivo (ARC-...).
 */
function soublu_archive_proposal(PDO $pdo, array $row, string $reason = 'api_delete', string $actor = 'api'): array
{
    soublu_proposal_archive_ensure_table($pdo);
    $proposalId = trim((string) ($row['id'] ?? ''));
    if ($proposalId === '') {
        throw new RuntimeException('Proposta sem id para arquivar.', 400);
    }
    $stamp = date('Ymd-His');
    $archId = 'ARC-' . preg_replace('/[^A-Za-z0-9_-]/', '', $proposalId) . '-' . $stamp;
    $payload = [
        'archived_at' => date('c'),
        'archived_by' => $actor,
        'archive_reason' => $reason,
        'proposal' => $row,
    ];
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Falha ao serializar proposta para arquivo.', 500);
    }
    $dir = soublu_proposal_archive_dir();
    $safeFile = preg_replace('/[^A-Za-z0-9._-]/', '_', $archId) . '.json';
    $abs = $dir . '/' . $safeFile;
    if (file_put_contents($abs, $json) === false) {
        throw new RuntimeException('Falha ao gravar JSON na Localweb (proposal-archive).', 500);
    }
    $rel = 'proposal-archive/' . date('Y') . '/' . date('m') . '/' . $safeFile;
    $cpf = preg_replace('/\D/', '', (string) ($row['clientCpf'] ?? $row['client_cpf'] ?? '')) ?: null;
    $st = $pdo->prepare(
        'INSERT INTO `proposal_archive`
         (id, proposal_id, client_cpf, client_name, numero, product, status, archived_at, archive_reason, archived_by, file_path, snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)'
    );
    $st->execute([
        $archId,
        $proposalId,
        $cpf,
        (string) ($row['clientName'] ?? $row['client_name'] ?? ''),
        (string) ($row['numero'] ?? ''),
        (string) ($row['product'] ?? ''),
        (string) ($row['status'] ?? ''),
        $reason,
        $actor,
        $rel,
        $json,
    ]);
    return ['archive_id' => $archId, 'file_path' => $rel];
}

/**
 * soublu_retire_proposal_to_cancelled — tira da esteira ativa SEM DELETE.
 * Marca Cancelado e anota no histórico que a cópia está na Localweb.
 */
function soublu_retire_proposal_to_cancelled(PDO $pdo, array $row, string $actor): void
{
    $id = trim((string) ($row['id'] ?? ''));
    if ($id === '') {
        return;
    }
    $history = $row['history'] ?? [];
    if (is_string($history)) {
        $decoded = json_decode($history, true);
        $history = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($history)) {
        $history = [];
    }
    $history[] = [
        'date' => date('c'),
        'actorName' => $actor,
        'action' => 'Arquivada na Localweb (não apagada)',
        'note' => 'Cópia em uploads/proposal-archive e tabela proposal_archive. Status Cancelado.',
    ];
    $histJson = json_encode($history, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $sets = ['`status` = :st', '`updated_at` = NOW()'];
    $bind = ['st' => 'Cancelado', 'id' => $id, 'hist' => $histJson];
    $cols = [];
    try {
        $q = $pdo->query('SHOW COLUMNS FROM `proposals`');
        $cols = $q ? array_map(static fn ($c) => (string) $c['Field'], $q->fetchAll(PDO::FETCH_ASSOC)) : [];
    } catch (Throwable $e) {
        $cols = [];
    }
    $has = static fn (string $c) => in_array($c, $cols, true);
    if ($has('statusOp')) {
        $sets[] = '`statusOp` = :st';
    }
    if ($has('status_op')) {
        $sets[] = '`status_op` = :st';
    }
    if ($has('history')) {
        $sets[] = '`history` = :hist';
    }
    if ($has('updatedAt')) {
        $sets[] = '`updatedAt` = NOW()';
    }
    if ($has('lastUpdatedBy')) {
        $sets[] = '`lastUpdatedBy` = :actor';
        $bind['actor'] = $actor;
    }
    $sql = 'UPDATE `proposals` SET ' . implode(', ', $sets) . ' WHERE `id` = :id LIMIT 1';
    $st = $pdo->prepare($sql);
    $st->execute($bind);
}

/**
 * Busca o snapshot mais recente de uma proposta (para restaurar se a linha viva sumiu).
 */
function soublu_proposal_archive_latest(PDO $pdo, string $proposalId): ?array
{
    soublu_proposal_archive_ensure_table($pdo);
    $st = $pdo->prepare(
        'SELECT * FROM `proposal_archive` WHERE `proposal_id` = ? ORDER BY `archived_at` DESC LIMIT 1'
    );
    $st->execute([$proposalId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}
