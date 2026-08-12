<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/FileStorage.php';

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
if ($bucket === '') {
    $bucket = 'misc';
}
$rawPath = (string) ($_GET['path'] ?? '');

/** Normaliza path de subpasta: \ → /, remove .., tira nome de arquivo no final. */
function soublu_upload_normalize_subpath(string $rawPath): string
{
    $sub = trim(str_replace('\\', '/', $rawPath), '/');
    if ($sub === '') {
        return '';
    }
    if (str_contains($sub, '..') || !preg_match('#^[a-zA-Z0-9_./-]+$#', $sub)) {
        soublu_json(['ok' => false, 'error' => 'Caminho inválido.'], 400);
    }
    $parts = array_values(array_filter(explode('/', $sub), static fn ($s) => $s !== ''));
    if ($parts === []) {
        return '';
    }
    $last = (string) end($parts);
    if (preg_match('/\.[a-z0-9]{1,16}$/i', $last)) {
        array_pop($parts);
    }
    $clean = [];
    foreach ($parts as $seg) {
        $seg = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $seg) ?? '';
        if ($seg !== '') {
            $clean[] = $seg;
        }
    }
    return implode('/', $clean);
}

if ($bucket === 'proposal-attachments') {
    $sub = trim(str_replace('\\', '/', $rawPath), '/');
    if ($sub !== '' && (str_contains($sub, '..') || !preg_match('#^[a-zA-Z0-9_./-]+$#', $sub))) {
        soublu_json(['ok' => false, 'error' => 'Caminho inválido.'], 400);
    }
} else {
    /* sonhos, profile-photos, product-images, docs, whatsapp-media, etc. */
    $sub = soublu_upload_normalize_subpath($rawPath);
}

if (!isset($_FILES['file']) || !true) {
    soublu_json(['ok' => false, 'error' => 'Arquivo ausente.'], 400);
}

$file = $_FILES['file'];
$maxMb = match (true) {
    in_array($bucket, ['trainings', 'docs', 'trainings-media'], true) => 100,
    $bucket === 'whatsapp-media' => 16,
    $bucket === 'proposal-attachments' => 50,
    in_array($bucket, ['tim-docs', 'contestacao-docs', 'finance-docs', 'ticket-docs', 'rh-docs', 'rh-justificativa', 'rh-demissao'], true) => 25,
    default => 10,
};
if ($file['size'] > $maxMb * 1024 * 1024) {
    soublu_json(['ok' => false, 'error' => "Arquivo maior que {$maxMb}MB."], 400);
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$blockedExt = [
    'php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phar', 'cgi', 'pl', 'asp', 'aspx', 'jsp',
    'htaccess', 'htpasswd',
];
if ($bucket === 'proposal-attachments') {
    if ($ext === '' || !preg_match('/^[a-z0-9]{1,16}$/', $ext)) {
        $ext = 'bin';
    }
    /* Supabase Storage: aceita qualquer documento; só renomeia extensões perigosas no objeto. */
    if (in_array($ext, $blockedExt, true)) {
        $ext = 'bin';
    }
} elseif ($bucket === 'whatsapp-media') {
    $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'ogg', 'm4a', 'aac', 'wav', 'webm'];
    if (!in_array($ext, $allowed, true)) {
        soublu_json(['ok' => false, 'error' => 'Tipo de arquivo não permitido.'], 400);
    }
} elseif (in_array($bucket, ['tim-docs', 'contestacao-docs', 'finance-docs', 'ticket-docs', 'rh-docs', 'rh-justificativa', 'rh-demissao'], true)) {
    /* Documentos RH/financeiro: PDF, imagens, ZIP e Office comuns. */
    $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'zip', 'doc', 'docx', 'xls', 'xlsx'];
    if (!in_array($ext, $allowed, true)) {
        soublu_json(['ok' => false, 'error' => 'Tipo de arquivo não permitido. Use PDF, imagem, ZIP, DOC ou XLS.'], 400);
    }
} elseif (in_array($bucket, ['docs', 'trainings', 'trainings-media'], true)) {
    /* Materiais de treinamento / docs / vídeos: PDF, imagens, Office, MP4, WebM, MOV. */
    $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'm4a'];
    if (!in_array($ext, $allowed, true)) {
        soublu_json(['ok' => false, 'error' => 'Tipo de arquivo não permitido. Use PDF, vídeo (MP4/WebM), áudio, imagem ou Office.'], 400);
    }
} else {
    $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
    if (!in_array($ext, $allowed, true)) {
        soublu_json(['ok' => false, 'error' => 'Tipo de arquivo não permitido.'], 400);
    }
}

if ($bucket === 'proposal-attachments') {
    $object = trim(str_replace('\\', '/', $rawPath), '/');
    if ($object === '' || str_contains($object, '..')) {
        soublu_json(['ok' => false, 'error' => 'Caminho inválido para anexo de proposta.'], 400);
    }
    $segments = array_values(array_filter(explode('/', $object), static fn ($s) => $s !== ''));
    $segments = array_map(static function (string $seg): string {
        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $seg);
        $clean = preg_replace('/[^a-zA-Z0-9._-]/', '_', $ascii !== false ? $ascii : $seg) ?? $seg;
        return trim($clean, '_') !== '' ? trim($clean, '_') : 'arquivo';
    }, $segments);
    $object = implode('/', $segments);
    if (!str_contains($object, '.')) {
        $object .= '/' . bin2hex(random_bytes(8)) . '.' . $ext;
    }
    $body = file_get_contents($file['tmp_name']);
    if ($body === false || $body === '') {
        soublu_json(['ok' => false, 'error' => 'Arquivo vazio ou ilegível.'], 400);
    }
    $mime = $file['type'] !== '' ? (string) $file['type'] : soublu_file_mime($file['name']);
    $pushed = soublu_file_upload_bytes_to_supabase('proposal-attachments', $object, $body, $mime);
    if (!$pushed) {
        soublu_json([
            'ok' => false,
            'error' => 'Falha ao enviar anexo ao Supabase. Verifique SUPABASE_SERVICE_KEY em config.supabase.local.php.',
        ], 500);
    }
    $serveUrl = soublu_file_serve_url((string) $pushed['caminho']);
    soublu_json([
        'ok' => true,
        'url' => $serveUrl,
        'public_url' => $pushed['url'],
        'caminho' => $pushed['caminho'],
        'path' => $pushed['caminho'],
        'storage' => 'supabase',
        'nome' => (string) ($file['name'] ?? ''),
    ]);
}

$siteRoot = dirname(__DIR__);
$base = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : ($siteRoot . '/uploads');
$base = str_replace('\\', '/', $base);
/* Caminho relativo (ex.: "uploads" ou "uploads\sonhos") cairia no CWD e poluiria a raiz. */
if ($base === '' || $base === '.' || !preg_match('#^(/|[a-zA-Z]:/)#', $base)) {
    $base = $siteRoot . '/uploads';
}
$base = rtrim(str_replace('\\', '/', $base), '/');
if (!str_ends_with($base, '/uploads') && !str_contains($base, '/uploads/')) {
    /* Se UPLOAD_DIR apontar para a raiz do site, força /uploads. */
    $normalizedRoot = rtrim(str_replace('\\', '/', $siteRoot), '/');
    if ($base === $normalizedRoot) {
        $base = $normalizedRoot . '/uploads';
    }
}

if (!is_dir($base) && !mkdir($base, 0755, true) && !is_dir($base)) {
    soublu_json(['ok' => false, 'error' => 'Não foi possível criar pasta uploads.'], 500);
}

$dir = $base . '/' . $bucket;
if ($sub !== '') {
    $dir .= '/' . $sub;
}
$dir = str_replace('\\', '/', $dir);
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    soublu_json(['ok' => false, 'error' => 'Não foi possível criar pasta de upload.'], 500);
}

$name = bin2hex(random_bytes(8)) . '.' . $ext;
$dest = $dir . '/' . $name;

$baseReal = realpath($base);
$dirReal = realpath($dir);
if ($baseReal === false || $dirReal === false || !str_starts_with($dirReal, $baseReal)) {
    soublu_json(['ok' => false, 'error' => 'Destino de upload inválido.'], 500);
}

if (!move_uploaded_file($file['tmp_name'], $dest)) {
    soublu_json(['ok' => false, 'error' => 'Falha ao salvar arquivo.'], 500);
}

$site = defined('SITE_URL') ? rtrim((string) SITE_URL, '/') : '';
$publicPath = '/uploads/' . $bucket . ($sub !== '' ? '/' . $sub : '') . '/' . $name;
$relServe = $bucket . ($sub !== '' ? '/' . $sub : '') . '/' . $name;
$serveUrl = soublu_file_serve_url($relServe);
$url = $serveUrl !== '' ? $serveUrl : ($site !== '' ? $site . $publicPath : $publicPath);

soublu_json(['ok' => true, 'url' => $url, 'path' => $publicPath, 'caminho' => $relServe]);
