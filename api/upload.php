<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

$bucket = preg_replace('/[^a-z0-9_-]/', '', strtolower((string) ($_GET['bucket'] ?? 'misc')));
$sub = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) ($_GET['path'] ?? ''));

if (!isset($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
    soublu_json(['ok' => false, 'error' => 'Arquivo ausente.'], 400);
}

$file = $_FILES['file'];
$maxMb = in_array($bucket, ['proposal-attachments', 'tim-docs', 'contestacao-docs', 'finance-docs', 'ticket-docs'], true) ? 25 : 5;
if ($file['size'] > $maxMb * 1024 * 1024) {
    soublu_json(['ok' => false, 'error' => "Arquivo maior que {$maxMb}MB."], 400);
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
if (!in_array($ext, $allowed, true)) {
    soublu_json(['ok' => false, 'error' => 'Tipo de arquivo não permitido.'], 400);
}

$base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
$dir = rtrim($base, '/\\') . '/' . $bucket;
if ($sub !== '') {
    $dir .= '/' . $sub;
}
if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
    soublu_json(['ok' => false, 'error' => 'Não foi possível criar pasta de upload.'], 500);
}

$name = bin2hex(random_bytes(8)) . '.' . $ext;
$dest = $dir . '/' . $name;
if (!move_uploaded_file($file['tmp_name'], $dest)) {
    soublu_json(['ok' => false, 'error' => 'Falha ao salvar arquivo.'], 500);
}

$site = defined('SITE_URL') ? rtrim((string) SITE_URL, '/') : '';
$publicPath = '/uploads/' . $bucket . ($sub !== '' ? '/' . $sub : '') . '/' . $name;
$url = $site !== '' ? $site . $publicPath : $publicPath;

soublu_json(['ok' => true, 'url' => $url, 'path' => $publicPath]);
