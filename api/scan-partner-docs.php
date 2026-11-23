<?php
/**
 * Scan partner-docs on production and list partners with broken attachments ([]).
 * Deploy via remote-deploy then run: GET /api/scan-partner-docs.php?partner_id=prtmpyb0qr6gjsbm
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/FileStorage.php';

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

$partnerId = trim((string) ($_GET['partner_id'] ?? ''));
$uploadDir = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
$docsRoot = rtrim($uploadDir, '/\\') . '/partner-docs';

$files = [];
if (is_dir($docsRoot)) {
    foreach (scandir($docsRoot) ?: [] as $folder) {
        if ($folder === '.' || $folder === '..') continue;
        $folderPath = $docsRoot . '/' . $folder;
        if (!is_dir($folderPath)) continue;
        $mtime = filemtime($folderPath) ?: 0;
        foreach (scandir($folderPath) ?: [] as $f) {
            if ($f === '.' || $f === '..') continue;
            $full = $folderPath . '/' . $f;
            if (!is_file($full) || filesize($full) < 100) continue;
            $rel = 'partner-docs/' . $folder . '/' . $f;
            $files[] = [
                'folder' => $folder,
                'file' => $f,
                'size' => filesize($full),
                'mtime' => date('c', $mtime),
                'caminho' => $rel,
                'url' => soublu_file_serve_url($rel),
            ];
        }
    }
}
usort($files, static fn ($a, $b) => strcmp($b['mtime'], $a['mtime']));

try {
    $pdo = soublu_pdo();
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'DB: ' . $e->getMessage()], 500);
}

$sql = 'SELECT id, razao_social, cnpj, created_at, meta FROM partners';
$params = [];
if ($partnerId !== '') {
    $sql .= ' WHERE id = :id';
    $params['id'] = $partnerId;
}
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$partners = [];
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $meta = json_decode((string) ($row['meta'] ?? '{}'), true);
    if (!is_array($meta)) $meta = [];
    $att = $meta['attachments'] ?? null;
    $attKeys = [];
    if (is_array($att) && $att !== []) {
        foreach ($att as $k => $v) {
            if (is_string($k) && $k !== '_consultas' && is_string($v) && $v !== '') {
                $attKeys[$k] = $v;
            }
        }
    }
    $partners[] = [
        'id' => $row['id'],
        'razao_social' => $row['razao_social'] ?? '',
        'cnpj' => $row['cnpj'] ?? '',
        'created_at' => $row['created_at'] ?? '',
        'attachments_type' => gettype($att),
        'attachments_is_list' => is_array($att) && array_is_list($att),
        'attachments_keys' => array_keys($attKeys),
        'attachments' => $attKeys,
        'raw_attachments' => $att,
    ];
}

soublu_json([
    'ok' => true,
    'docs_root' => $docsRoot,
    'docs_root_exists' => is_dir($docsRoot),
    'file_count' => count($files),
    'files' => $files,
    'partners' => $partners,
]);
