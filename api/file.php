<?php
/**
 * Serve arquivos: 1) disco Locaweb (/uploads)  2) Supabase Storage (legado + v2).
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/FileStorage.php';

$path = trim((string) ($_GET['path'] ?? ''));
$path = str_replace('\\', '/', $path);
$path = ltrim($path, '/');
$checkOnly = isset($_GET['check']) && (string) $_GET['check'] === '1';
$fetchUrl = trim((string) ($_GET['fetch_url'] ?? ''));

$allowedBuckets = [
    'proposal-attachments', 'tim-docs', 'contestacao-docs', 'finance-docs',
    'ticket-docs', 'partner-docs', 'profile-photos', 'product-images',
    'rh-demissao', 'rh-docs', 'monitoria-atendimento', 'partner-nf', 'sonhos', 'mural', 'misc',
    'whatsapp-media', 'docs',
];

$bucket = '';
$object = '';

if ($fetchUrl !== '') {
    if (!preg_match('~^https://[a-z0-9.-]+\.supabase\.co/storage/v1/object/~i', $fetchUrl)) {
        soublu_file_fail('URL Supabase inválida.', 400, $checkOnly);
    }
    if (!preg_match('~/storage/v1/object/(?:public|sign|authenticated)/([^/]+)/(.+)$~i', $fetchUrl, $fm)) {
        soublu_file_fail('Caminho Supabase inválido.', 400, $checkOnly);
    }
    $bucket = $fm[1];
    $object = rawurldecode($fm[2]);
    $path = $bucket . '/' . $object;
} else {
    $path = rawurldecode($path);
    if ($path === '' || str_contains($path, '..') || preg_match('/[\x00-\x1f]/', $path)) {
        soublu_file_fail('Caminho inválido.', 400, $checkOnly);
    }
    $parts = explode('/', $path, 2);
    $bucket = preg_replace('/[^a-z0-9_-]/i', '', $parts[0] ?? '');
    $object = $parts[1] ?? '';
}

if ($bucket === 'propostas') {
    $bucket = 'proposal-attachments';
    $path = $bucket . '/' . $object;
}

if (!in_array($bucket, $allowedBuckets, true) || $object === '') {
    soublu_file_fail('Bucket ou arquivo inválido.', 400, $checkOnly);
}

$uploadDir = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
$resolved = soublu_file_resolve($uploadDir, $bucket, $object);
$keys = soublu_file_supabase_keys();
$debugDiag = [
    'code_version' => 'file-v20260622',
    'has_service_key' => $keys['service'] !== '',
    'has_anon_key' => $keys['anon'] !== '',
    'variant_count' => count(soublu_file_object_variants($object)),
    'sanitized_object' => soublu_file_sanitize_object_path($object),
];

if ($checkOnly) {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    http_response_code($resolved['ok'] ? 200 : 404);
    echo json_encode($resolved + ['diagnostic' => $debugDiag], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($resolved['ok']) {
    $resolvedParts = explode('/', (string) ($resolved['path'] ?? ''), 2);
    $objHit = $resolvedParts[1] ?? $object;
    if ($resolved['source'] === 'local') {
        $local = soublu_file_find_local($uploadDir, $bucket, $objHit);
        if ($local) {
            soublu_file_serve_local($local, 'local');
        }
    } else {
        $remote = soublu_file_fetch_supabase($bucket, $objHit);
        if ($remote) {
            soublu_file_serve_bytes($remote['body'], $remote['mime'], 'supabase');
        }
    }
}

foreach (soublu_file_object_variants($object) as $objTry) {
    $remote = soublu_file_fetch_supabase($bucket, $objTry);
    if (!$remote) {
        $remote = soublu_file_search_supabase_list($bucket, $objTry);
    }
    if ($remote) {
        soublu_file_serve_bytes($remote['body'], $remote['mime'], 'supabase-variant');
    }
}

$localRepair = soublu_file_find_local($uploadDir, $bucket, $object);
if ($localRepair) {
    $pushed = soublu_file_push_local_to_supabase($uploadDir, $bucket, $object);
    if ($pushed) {
        $remote = soublu_file_fetch_supabase($bucket, $object);
        if ($remote) {
            soublu_file_serve_bytes($remote['body'], $remote['mime'], 'migrated-supabase');
        }
    }
    soublu_file_serve_local($localRepair, 'local-repair');
}

$located = soublu_file_locate_public_url($bucket, $object);
if ($located) {
    $locParts = explode('/', (string) ($located['caminho'] ?? ''), 2);
    $objTry = $locParts[1] ?? $object;
    $remote = soublu_file_fetch_supabase($bucket, $objTry);
    if ($remote) {
        soublu_file_serve_bytes($remote['body'], $remote['mime'], 'supabase-located');
    }
}

$hasKey = soublu_file_supabase_keys()['service'] !== '' || soublu_file_supabase_keys()['anon'] !== '';
$hint = $hasKey ? '' : ' Configure SUPABASE_SERVICE_KEY em config.supabase.local.php na Locaweb.';
soublu_file_fail('Arquivo não encontrado no Supabase nem em /uploads/.' . $hint, 404, false);

