<?php
declare(strict_types=1);

/**
 * migrate-locaweb-cutover — copia o que ainda está no Supabase para MySQL/disco Locaweb.
 *
 * GET  ?action=inventory
 * POST ?action=backup
 * POST ?action=sync_credit
 * POST ?action=sync_withdrawals
 * POST ?action=sync_whatsapp
 * POST ?action=sync_proposals          (reusa recover-dismissed sync_all)
 * POST ?action=copy_from_db            (anexos citados em proposals/credit)
 * POST ?action=copy_storage&bucket=&prefix=&offset=
 * POST ?action=rewrite_attachments
 *
 * Só insere o que falta. Nunca sobrescreve linha MySQL existente.
 */
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/FileStorage.php';
require_once __DIR__ . '/lib/SupabaseLegacy.php';
require_once __DIR__ . '/lib/CreditProposalRepository.php';

@set_time_limit(120);
ini_set('memory_limit', '512M');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$action = strtolower(trim((string) ($_GET['action'] ?? $_POST['action'] ?? 'inventory')));

const CUTOVER_BUCKETS = [
    'proposal-attachments', 'profile-photos', 'rh-docs', 'rh-demissao',
    'finance-docs', 'whatsapp-media', 'ticket-docs', 'partner-docs',
    'tim-docs', 'contestacao-docs', 'product-images', 'trainings',
    'trainings-media', 'mural', 'sonhos', 'misc', 'docs',
    'monitoria-atendimento', 'partner-nf',
];

function cutover_upload_dir(): string
{
    return defined('UPLOAD_DIR') ? rtrim((string) UPLOAD_DIR, '/\\') : (dirname(__DIR__) . '/uploads');
}

function cutover_backup_dir(): string
{
    $dir = dirname(__DIR__) . '/storage/cutover-backup';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    return $dir;
}

/** Converte ISO/PG timestamp para DATETIME MySQL. */
function cutover_mysql_dt(mixed $v): ?string
{
    $s = trim((string) $v);
    if ($s === '' || str_starts_with($s, '0000')) {
        return null;
    }
    $t = strtotime($s);
    return $t ? date('Y-m-d H:i:s', $t) : $s;
}

function cutover_table_exists(PDO $pdo, string $table): bool
{
    $st = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
    );
    $st->execute([$table]);
    return (int) $st->fetchColumn() > 0;
}

function cutover_table_count(PDO $pdo, string $table): ?int
{
    if (!cutover_table_exists($pdo, $table)) {
        return null;
    }
    try {
        return (int) $pdo->query('SELECT COUNT(*) FROM `' . str_replace('`', '', $table) . '`')->fetchColumn();
    } catch (Throwable $e) {
        return null;
    }
}

function cutover_mysql_columns(PDO $pdo, string $table): array
{
    $st = $pdo->query('SHOW COLUMNS FROM `' . str_replace('`', '', $table) . '`');
    $cols = [];
    foreach ($st ? $st->fetchAll(PDO::FETCH_ASSOC) : [] as $c) {
        $cols[(string) $c['Field']] = true;
    }
    return $cols;
}

/**
 * cutover_insert_missing — INSERT de uma linha se o id ainda não existe.
 * Mapeia só colunas que já existem no MySQL. JSON vira string.
 */
function cutover_insert_missing(PDO $pdo, string $table, array $row, array $cols): array
{
    $id = (string) ($row['id'] ?? '');
    if ($id === '') {
        return ['ok' => false, 'error' => 'sem id'];
    }
    $chk = $pdo->prepare('SELECT id FROM `' . $table . '` WHERE id = ? LIMIT 1');
    $chk->execute([$id]);
    if ($chk->fetch()) {
        return ['ok' => true, 'skipped' => true, 'id' => $id];
    }
    $data = [];
    foreach ($row as $k => $v) {
        if (!isset($cols[$k])) {
            continue;
        }
        if (is_array($v) || is_object($v)) {
            $data[$k] = json_encode($v, JSON_UNESCAPED_UNICODE);
        } elseif (in_array($k, ['created_at', 'updated_at', 'processed_at', 'pix_paid_at'], true)) {
            $data[$k] = cutover_mysql_dt($v);
        } elseif (is_bool($v)) {
            $data[$k] = $v ? 1 : 0;
        } else {
            $data[$k] = $v;
        }
    }
    if (!isset($data['id'])) {
        $data['id'] = $id;
    }
    if (!$data) {
        return ['ok' => false, 'error' => 'nenhuma coluna mapeada', 'id' => $id];
    }
    $fields = array_keys($data);
    $place = array_map(static fn ($f) => ':' . $f, $fields);
    $sql = 'INSERT INTO `' . $table . '` (`' . implode('`,`', $fields) . '`) VALUES (' . implode(',', $place) . ')';
    $ins = $pdo->prepare($sql);
    foreach ($data as $k => $v) {
        $ins->bindValue(':' . $k, $v);
    }
    $ins->execute();
    return ['ok' => true, 'inserted' => true, 'id' => $id];
}

function cutover_sb_count(SupabaseClient $client, string $table): ?int
{
    try {
        $total = 0;
        $offset = 0;
        $page = 200;
        while ($offset < 4000) {
            $batch = $client->rest('GET', $table, null, 'select=id&limit=' . $page . '&offset=' . $offset);
            if (!is_array($batch) || !$batch) {
                break;
            }
            $total += count($batch);
            if (count($batch) < $page) {
                break;
            }
            $offset += $page;
        }
        return $total;
    } catch (Throwable $e) {
        return null;
    }
}

function cutover_sb_page(SupabaseClient $client, string $table, int $limit, int $offset): array
{
    return $client->rest(
        'GET',
        $table,
        null,
        'select=*&order=id.asc&limit=' . max(1, min($limit, 200)) . '&offset=' . max(0, $offset)
    );
}

function cutover_extract_rel(mixed $val): string
{
    if (function_exists('soublu_attach_extract_rel')) {
        return soublu_attach_extract_rel($val);
    }
    $s = is_array($val) ? (string) ($val['url'] ?? $val['path'] ?? $val['caminho'] ?? '') : (string) $val;
    $s = trim($s);
    if (preg_match('~/storage/v1/object/(?:public|sign|authenticated)/([^?]+)~i', $s, $m)) {
        return rawurldecode($m[1]);
    }
    if (preg_match('~file\.php\?path=([^&]+)~i', $s, $m)) {
        return ltrim(rawurldecode($m[1]), '/');
    }
    if (preg_match('~/uploads/(.+)$~i', $s, $m)) {
        return ltrim($m[1], '/');
    }
    if (preg_match('~^(proposal-attachments|profile-photos|rh-docs|finance-docs|whatsapp-media|ticket-docs|partner-docs)/~i', $s)) {
        return ltrim($s, '/');
    }
    return '';
}

/**
 * cutover_save_bytes — grava no disco se ainda não existir (não sobrescreve).
 */
function cutover_save_bytes(string $bucket, string $object, string $body, string $mime): string
{
    $local = soublu_file_find_local(cutover_upload_dir(), $bucket, $object);
    if ($local && is_file($local) && filesize($local) > 0) {
        return 'exists';
    }
    $ok = soublu_file_upload_bytes_to_local($bucket, $object, $body, $mime);
    return $ok ? 'ok' : 'fail';
}

function cutover_copy_one_rel(string $rel): string
{
    $rel = ltrim(str_replace('\\', '/', $rel), '/');
    $parts = explode('/', $rel, 2);
    $bucket = $parts[0] ?? '';
    $object = $parts[1] ?? '';
    if ($bucket === '' || $object === '') {
        return 'skip';
    }
    if ($bucket === 'propostas') {
        $bucket = 'proposal-attachments';
    }
    $local = soublu_file_find_local(cutover_upload_dir(), $bucket, $object);
    if ($local && is_file($local) && filesize($local) > 200) {
        return 'exists';
    }
    $remote = soublu_file_fetch_supabase($bucket, $object);
    if (!$remote) {
        $remote = soublu_file_search_supabase_list($bucket, $object);
    }
    if (!$remote || ($remote['body'] ?? '') === '') {
        return 'missing';
    }
    return cutover_save_bytes($bucket, $object, (string) $remote['body'], (string) ($remote['mime'] ?? 'application/octet-stream'));
}

function cutover_walk_attachment_map(array $att, array &$rels): void
{
    foreach ($att as $k => $v) {
        if (is_string($k) && str_ends_with($k, '_nome')) {
            continue;
        }
        if (is_array($v)) {
            $rel = cutover_extract_rel($v);
            if ($rel !== '') {
                $rels[$rel] = true;
            }
            if (isset($v['caminho'])) {
                $c = ltrim((string) $v['caminho'], '/');
                if ($c !== '') {
                    $rels[$c] = true;
                }
            }
            continue;
        }
        $rel = cutover_extract_rel($v);
        if ($rel !== '') {
            $rels[$rel] = true;
        }
        $ck = is_string($k) ? $k . '_caminho' : '';
        if ($ck !== '' && !empty($att[$ck])) {
            $c = ltrim((string) $att[$ck], '/');
            if ($c !== '') {
                $rels[$c] = true;
            }
        }
    }
}

function cutover_list_storage(string $bucket, string $prefix, int $limit, int $offset): array
{
    $legacy = function_exists('soublu_file_legacy_base') ? soublu_file_legacy_base() : '';
    if ($legacy === '') {
        return [];
    }
    $keys = soublu_file_keys_for_base($legacy);
    $auth = $keys['service'] !== '' ? $keys['service'] : $keys['anon'];
    if ($auth === '') {
        return [];
    }
    $listUrl = $legacy . '/storage/v1/object/list/' . rawurlencode($bucket);
    $ch = curl_init($listUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode([
            'prefix' => $prefix,
            'limit' => $limit,
            'offset' => $offset,
            'sortBy' => ['column' => 'name', 'order' => 'asc'],
        ]),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $auth,
            'apikey: ' . $auth,
        ],
        CURLOPT_TIMEOUT => 45,
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($raw === false || $code < 200 || $code >= 300) {
        return [];
    }
    $items = json_decode((string) $raw, true);
    return is_array($items) ? $items : [];
}

try {
    $pdo = soublu_pdo();

    if ($action === 'inventory') {
        $mysql = [
            'proposals' => cutover_table_count($pdo, 'proposals'),
            'clients' => cutover_table_count($pdo, 'clients'),
            'users' => cutover_table_count($pdo, 'users'),
            'credit_proposals' => cutover_table_count($pdo, 'credit_proposals'),
            'withdrawals' => cutover_table_count($pdo, 'withdrawals'),
            'whatsapp_instances' => cutover_table_count($pdo, 'whatsapp_instances'),
            'whatsapp_chats' => cutover_table_count($pdo, 'whatsapp_chats'),
            'whatsapp_messages' => cutover_table_count($pdo, 'whatsapp_messages'),
        ];
        $sb = [
            'legacy_configured' => soublu_supabase_legacy_configured(),
            'proposals' => null,
            'credit_proposals' => null,
            'withdrawals' => null,
            'clients' => null,
            'users' => null,
        ];
        if (soublu_supabase_legacy_configured()) {
            try {
                $client = soublu_supabase_legacy_client();
                foreach (['proposals', 'credit_proposals', 'withdrawals', 'clients', 'users'] as $t) {
                    try {
                        $sb[$t] = cutover_sb_count($client, $t);
                    } catch (Throwable $e) {
                        $sb[$t] = ['error' => $e->getMessage()];
                    }
                }
            } catch (Throwable $e) {
                $sb['error'] = $e->getMessage();
            }
        }
        $wa = [
            'backend' => function_exists('soublu_wa_db_backend') ? soublu_wa_db_backend() : 'unknown',
            'v2_configured' => function_exists('soublu_supabase_v2_configured') && soublu_supabase_v2_configured(),
        ];
        $uploads = cutover_upload_dir();
        $disk = [
            'upload_dir' => $uploads,
            'upload_dir_exists' => is_dir($uploads),
            'free_bytes' => is_dir($uploads) ? @disk_free_space($uploads) : @disk_free_space(dirname(__DIR__)),
        ];
        soublu_json([
            'ok' => true,
            'action' => 'inventory',
            'mysql' => $mysql,
            'supabase_legacy' => $sb,
            'whatsapp' => $wa,
            'credit_backend' => function_exists('soublu_credit_proposal_backend') ? soublu_credit_proposal_backend() : null,
            'pix_backend' => function_exists('pix_db_backend') ? pix_db_backend() : (defined('PIX_DB_BACKEND') ? PIX_DB_BACKEND : null),
            'storage_write' => function_exists('soublu_storage_write_backend') ? soublu_storage_write_backend() : (defined('STORAGE_WRITE_BACKEND') ? STORAGE_WRITE_BACKEND : 'unset'),
            'disk' => $disk,
            'note' => 'MySQL e a fonte da verdade do CRM. Copiar so linhas/arquivos ausentes.',
        ]);
    }

    if ($action === 'backup') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST para backup'], 405);
        }
        $dir = cutover_backup_dir();
        $stamp = date('Ymd-His');
        $tables = ['credit_proposals', 'withdrawals', 'users', 'whatsapp_instances'];
        $written = [];
        foreach ($tables as $table) {
            if (!cutover_table_exists($pdo, $table)) {
                $written[$table] = ['skipped' => true, 'reason' => 'tabela ausente'];
                continue;
            }
            $rows = $pdo->query('SELECT * FROM `' . $table . '`')->fetchAll(PDO::FETCH_ASSOC);
            $path = $dir . '/' . $table . '-' . $stamp . '.json';
            $ok = file_put_contents($path, json_encode($rows, JSON_UNESCAPED_UNICODE));
            $written[$table] = [
                'ok' => $ok !== false,
                'rows' => count($rows),
                'file' => basename($path),
                'bytes' => $ok === false ? 0 : $ok,
            ];
        }
        // Propostas: só id/numero/attachments (JSON leve) — o dump completo estoura memória.
        if (cutover_table_exists($pdo, 'proposals')) {
            $rows = $pdo->query(
                'SELECT id, numero, clientName, vendorName, status, statusOp, attachments FROM proposals'
            )->fetchAll(PDO::FETCH_ASSOC);
            $path = $dir . '/proposals-lite-' . $stamp . '.json';
            $ok = file_put_contents($path, json_encode($rows, JSON_UNESCAPED_UNICODE));
            $written['proposals_lite'] = [
                'ok' => $ok !== false,
                'rows' => count($rows),
                'file' => basename($path),
                'bytes' => $ok === false ? 0 : $ok,
            ];
        }
        soublu_json([
            'ok' => true,
            'action' => 'backup',
            'dir' => 'storage/cutover-backup',
            'stamp' => $stamp,
            'written' => $written,
        ]);
    }

    if ($action === 'sync_credit') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST para sync_credit'], 405);
        }
        if (!soublu_supabase_legacy_configured()) {
            soublu_json(['ok' => false, 'error' => 'Supabase legado sem service_key'], 400);
        }
        soublu_ensure_credit_proposals_table($pdo);
        $mysqlRepo = new CreditProposalMysqlRepository($pdo);
        $client = soublu_supabase_legacy_client();
        $offset = (int) ($_GET['offset'] ?? $_POST['offset'] ?? 0);
        $limit = (int) ($_GET['limit'] ?? $_POST['limit'] ?? 80);
        $rows = cutover_sb_page($client, 'credit_proposals', $limit, $offset);
        $inserted = 0;
        $skipped = 0;
        $failed = [];
        foreach ($rows as $row) {
            if (!is_array($row) || empty($row['id'])) {
                continue;
            }
            try {
                if ($mysqlRepo->getById((string) $row['id'])) {
                    $skipped++;
                    continue;
                }
                if (isset($row['created_at'])) {
                    $row['created_at'] = cutover_mysql_dt($row['created_at']);
                }
                if (isset($row['updated_at'])) {
                    $row['updated_at'] = cutover_mysql_dt($row['updated_at']);
                }
                $mysqlRepo->create($row);
                $inserted++;
            } catch (Throwable $e) {
                $failed[] = ['id' => $row['id'] ?? null, 'error' => $e->getMessage()];
            }
        }
        soublu_json([
            'ok' => true,
            'action' => 'sync_credit',
            'offset' => $offset,
            'fetched' => count($rows),
            'inserted' => $inserted,
            'skipped' => $skipped,
            'failed' => $failed,
            'next_offset' => count($rows) < $limit ? null : $offset + count($rows),
            'mysql_total' => cutover_table_count($pdo, 'credit_proposals'),
        ]);
    }

    if ($action === 'sync_withdrawals') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST para sync_withdrawals'], 405);
        }
        if (!cutover_table_exists($pdo, 'withdrawals')) {
            soublu_json(['ok' => false, 'error' => 'Tabela withdrawals ausente no MySQL'], 400);
        }
        if (!soublu_supabase_legacy_configured()) {
            soublu_json(['ok' => true, 'action' => 'sync_withdrawals', 'skipped' => true, 'reason' => 'sem service_key']);
        }
        $client = soublu_supabase_legacy_client();
        $cols = cutover_mysql_columns($pdo, 'withdrawals');
        $offset = (int) ($_GET['offset'] ?? 0);
        $limit = (int) ($_GET['limit'] ?? 100);
        try {
            $rows = cutover_sb_page($client, 'withdrawals', $limit, $offset);
        } catch (Throwable $e) {
            soublu_json(['ok' => true, 'action' => 'sync_withdrawals', 'skipped' => true, 'reason' => $e->getMessage()]);
        }
        $inserted = 0;
        $skipped = 0;
        $failed = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            try {
                $res = cutover_insert_missing($pdo, 'withdrawals', $row, $cols);
                if (!empty($res['inserted'])) {
                    $inserted++;
                } elseif (!empty($res['skipped'])) {
                    $skipped++;
                } else {
                    $failed[] = $res;
                }
            } catch (Throwable $e) {
                $failed[] = ['id' => $row['id'] ?? null, 'error' => $e->getMessage()];
            }
        }
        soublu_json([
            'ok' => true,
            'action' => 'sync_withdrawals',
            'offset' => $offset,
            'fetched' => count($rows),
            'inserted' => $inserted,
            'skipped' => $skipped,
            'failed' => $failed,
            'next_offset' => count($rows) < $limit ? null : $offset + count($rows),
            'mysql_total' => cutover_table_count($pdo, 'withdrawals'),
        ]);
    }

    if ($action === 'sync_whatsapp') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST para sync_whatsapp'], 405);
        }
        if (!function_exists('soublu_supabase_v2_configured') || !soublu_supabase_v2_configured()) {
            soublu_json([
                'ok' => true,
                'action' => 'sync_whatsapp',
                'skipped' => true,
                'reason' => 'v2 nao configurado — WhatsApp ja usa MySQL',
                'wa_backend' => function_exists('soublu_wa_db_backend') ? soublu_wa_db_backend() : null,
                'mysql' => [
                    'instances' => cutover_table_count($pdo, 'whatsapp_instances'),
                    'chats' => cutover_table_count($pdo, 'whatsapp_chats'),
                    'messages' => cutover_table_count($pdo, 'whatsapp_messages'),
                ],
            ]);
        }
        require_once __DIR__ . '/lib/SupabaseV2.php';
        $client = soublu_supabase_v2_client();
        $table = (string) ($_GET['table'] ?? 'whatsapp_instances');
        $allowedWa = ['whatsapp_instances', 'whatsapp_chats', 'whatsapp_messages'];
        if (!in_array($table, $allowedWa, true) || !cutover_table_exists($pdo, $table)) {
            soublu_json(['ok' => false, 'error' => 'Tabela WhatsApp invalida ou ausente no MySQL: ' . $table], 400);
        }
        $cols = cutover_mysql_columns($pdo, $table);
        $offset = (int) ($_GET['offset'] ?? 0);
        $limit = (int) ($_GET['limit'] ?? 80);
        $rows = cutover_sb_page($client, $table, $limit, $offset);
        $inserted = 0;
        $skipped = 0;
        $failed = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            try {
                $res = cutover_insert_missing($pdo, $table, $row, $cols);
                if (!empty($res['inserted'])) {
                    $inserted++;
                } elseif (!empty($res['skipped'])) {
                    $skipped++;
                } else {
                    $failed[] = $res;
                }
            } catch (Throwable $e) {
                $failed[] = ['id' => $row['id'] ?? null, 'error' => $e->getMessage()];
            }
        }
        soublu_json([
            'ok' => true,
            'action' => 'sync_whatsapp',
            'table' => $table,
            'offset' => $offset,
            'fetched' => count($rows),
            'inserted' => $inserted,
            'skipped' => $skipped,
            'failed' => $failed,
            'next_offset' => count($rows) < $limit ? null : $offset + count($rows),
        ]);
    }

    if ($action === 'sync_proposals') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST para sync_proposals'], 405);
        }
        if (!soublu_supabase_legacy_configured()) {
            soublu_json(['ok' => true, 'action' => 'sync_proposals', 'skipped' => true, 'reason' => 'sem service_key']);
        }
        $client = soublu_supabase_legacy_client();
        $cols = cutover_mysql_columns($pdo, 'proposals');
        $offset = (int) ($_GET['offset'] ?? 0);
        $limit = (int) ($_GET['limit'] ?? 80);
        $rows = cutover_sb_page($client, 'proposals', $limit, $offset);
        $inserted = 0;
        $skipped = 0;
        $failed = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            try {
                $res = cutover_insert_missing($pdo, 'proposals', $row, $cols);
                if (!empty($res['inserted'])) {
                    $inserted++;
                } elseif (!empty($res['skipped'])) {
                    $skipped++;
                } else {
                    $failed[] = $res;
                }
            } catch (Throwable $e) {
                $failed[] = ['id' => $row['id'] ?? null, 'error' => $e->getMessage()];
            }
        }
        soublu_json([
            'ok' => true,
            'action' => 'sync_proposals',
            'offset' => $offset,
            'fetched' => count($rows),
            'inserted' => $inserted,
            'skipped' => $skipped,
            'failed' => $failed,
            'next_offset' => count($rows) < $limit ? null : $offset + count($rows),
            'mysql_total' => cutover_table_count($pdo, 'proposals'),
        ]);
    }

    if ($action === 'copy_from_db') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST para copy_from_db'], 405);
        }
        $offset = (int) ($_GET['offset'] ?? 0);
        $limit = (int) ($_GET['limit'] ?? 8);
        $maxFiles = (int) ($_GET['max_files'] ?? 12);
        if ($maxFiles < 1) {
            $maxFiles = 12;
        }
        $st = $pdo->prepare(
            'SELECT id, attachments FROM proposals
             WHERE attachments IS NOT NULL AND attachments <> "" AND attachments <> "[]" AND attachments <> "{}"
             ORDER BY id ASC LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset
        );
        $st->execute();
        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $stats = ['ok' => 0, 'exists' => 0, 'missing' => 0, 'fail' => 0, 'skip' => 0];
        $missing = [];
        $failed = [];
        $filesDone = 0;
        $stoppedEarly = false;
        foreach ($rows as $row) {
            $att = $row['attachments'];
            if (is_string($att)) {
                $decoded = json_decode($att, true);
                $att = is_array($decoded) ? $decoded : [];
            }
            if (!is_array($att)) {
                continue;
            }
            $rels = [];
            cutover_walk_attachment_map($att, $rels);
            foreach (array_keys($rels) as $rel) {
                if ($filesDone >= $maxFiles) {
                    $stoppedEarly = true;
                    break 2;
                }
                $res = cutover_copy_one_rel($rel);
                $stats[$res] = ($stats[$res] ?? 0) + 1;
                $filesDone++;
                if ($res === 'missing') {
                    $missing[] = ['proposal' => $row['id'], 'rel' => $rel];
                }
                if ($res === 'fail') {
                    $failed[] = ['proposal' => $row['id'], 'rel' => $rel];
                }
            }
        }
        $creditCopied = ['ok' => 0, 'exists' => 0, 'missing' => 0];
        if ($offset === 0 && isset($_GET['credit']) && cutover_table_exists($pdo, 'credit_proposals')) {
            $cr = $pdo->query('SELECT id, attachments FROM credit_proposals WHERE attachments IS NOT NULL')->fetchAll(PDO::FETCH_ASSOC) ?: [];
            foreach ($cr as $row) {
                $att = $row['attachments'];
                if (is_string($att)) {
                    $att = json_decode($att, true) ?: [];
                }
                if (!is_array($att)) {
                    continue;
                }
                $rels = [];
                cutover_walk_attachment_map($att, $rels);
                foreach (array_keys($rels) as $rel) {
                    $res = cutover_copy_one_rel($rel);
                    $creditCopied[$res] = ($creditCopied[$res] ?? 0) + 1;
                }
            }
        }
        soublu_json([
            'ok' => true,
            'action' => 'copy_from_db',
            'offset' => $offset,
            'rows' => count($rows),
            'stats' => $stats,
            'credit' => $creditCopied,
            'missing_sample' => array_slice($missing, 0, 20),
            'failed_sample' => array_slice($failed, 0, 20),
            'files_done' => $filesDone,
            'next_offset' => count($rows) === 0 ? null : ($offset + count($rows)),
        ]);
    }

    if ($action === 'copy_storage') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST para copy_storage'], 405);
        }
        $bucket = preg_replace('/[^a-z0-9_-]/i', '', (string) ($_GET['bucket'] ?? 'proposal-attachments')) ?: 'proposal-attachments';
        if (!in_array($bucket, CUTOVER_BUCKETS, true)) {
            soublu_json(['ok' => false, 'error' => 'Bucket nao permitido'], 400);
        }
        $prefix = (string) ($_GET['prefix'] ?? '');
        $offset = (int) ($_GET['offset'] ?? 0);
        $limit = (int) ($_GET['limit'] ?? 40);
        $items = cutover_list_storage($bucket, $prefix, $limit, $offset);
        $stats = ['ok' => 0, 'exists' => 0, 'missing' => 0, 'fail' => 0, 'folder' => 0];
        $folders = [];
        $failed = [];
        foreach ($items as $item) {
            if (!is_array($item) || empty($item['name'])) {
                continue;
            }
            $name = (string) $item['name'];
            $isFolder = empty($item['id']) && empty($item['metadata']['size']);
            $relPrefix = $prefix !== '' ? rtrim($prefix, '/') . '/' : '';
            if ($isFolder) {
                $stats['folder']++;
                $folders[] = $relPrefix . $name . '/';
                continue;
            }
            $object = $relPrefix . $name;
            $res = cutover_copy_one_rel($bucket . '/' . $object);
            $stats[$res] = ($stats[$res] ?? 0) + 1;
            if ($res === 'fail' || $res === 'missing') {
                $failed[] = ['object' => $object, 'result' => $res];
            }
        }
        soublu_json([
            'ok' => true,
            'action' => 'copy_storage',
            'bucket' => $bucket,
            'prefix' => $prefix,
            'offset' => $offset,
            'fetched' => count($items),
            'stats' => $stats,
            'folders' => $folders,
            'failed_sample' => array_slice($failed, 0, 20),
            'next_offset' => count($items) < $limit ? null : $offset + count($items),
        ]);
    }

    if ($action === 'rewrite_attachments') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST para rewrite_attachments'], 405);
        }
        $offset = (int) ($_GET['offset'] ?? 0);
        $limit = (int) ($_GET['limit'] ?? 50);
        $st = $pdo->prepare(
            'SELECT id, attachments FROM proposals
             WHERE attachments IS NOT NULL AND attachments <> "" AND attachments <> "{}" AND attachments <> "[]"
             ORDER BY id ASC LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset
        );
        $st->execute();
        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $upd = $pdo->prepare('UPDATE proposals SET attachments = ? WHERE id = ?');
        $changed = 0;
        $unchanged = 0;
        foreach ($rows as $row) {
            $att = $row['attachments'];
            if (is_string($att)) {
                $att = json_decode($att, true);
            }
            if (!is_array($att)) {
                $unchanged++;
                continue;
            }
            $dirty = false;
            foreach ($att as $k => $v) {
                if (!is_string($v) || $v === '') {
                    continue;
                }
                if (!preg_match('/supabase\.co\/storage/i', $v)) {
                    continue;
                }
                $rel = cutover_extract_rel($v);
                if ($rel === '') {
                    continue;
                }
                $parts = explode('/', $rel, 2);
                $bucket = $parts[0] ?? '';
                $object = $parts[1] ?? '';
                $local = ($bucket && $object) ? soublu_file_find_local(cutover_upload_dir(), $bucket, $object) : null;
                if (!$local) {
                    continue;
                }
                $att[$k] = soublu_file_serve_url($rel);
                $ck = $k . '_caminho';
                if (empty($att[$ck])) {
                    $att[$ck] = $rel;
                }
                $dirty = true;
            }
            if ($dirty) {
                $upd->execute([json_encode($att, JSON_UNESCAPED_UNICODE), $row['id']]);
                $changed++;
            } else {
                $unchanged++;
            }
        }
        soublu_json([
            'ok' => true,
            'action' => 'rewrite_attachments',
            'offset' => $offset,
            'rows' => count($rows),
            'changed' => $changed,
            'unchanged' => $unchanged,
            'next_offset' => count($rows) < $limit ? null : $offset + count($rows),
        ]);
    }

    soublu_json(['ok' => false, 'error' => 'action invalida'], 400);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
