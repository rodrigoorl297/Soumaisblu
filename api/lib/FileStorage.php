<?php
declare(strict_types=1);

function soublu_file_fail(string $msg, int $code, bool $json): void
{
    if ($json) {
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        http_response_code($code);
        echo json_encode(['ok' => false, 'source' => 'none', 'error' => $msg], JSON_UNESCAPED_UNICODE);
        exit;
    }
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo $msg;
    exit;
}

function soublu_file_mime(string $file): string
{
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    return match ($ext) {
        'pdf' => 'application/pdf',
        'ppt' => 'application/vnd.ms-powerpoint',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'jpg', 'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'zip' => 'application/zip',
        'mp3' => 'audio/mpeg',
        'ogg' => 'audio/ogg',
        'm4a', 'aac' => 'audio/mp4',
        'wav' => 'audio/wav',
        'webm' => 'audio/webm',
        default => 'application/octet-stream',
    };
}

/** Força download com nome amigável quando ?download=1&name=arquivo.zip */
function soublu_file_maybe_attachment_header(): void
{
    if (!isset($_GET['download']) || (string) $_GET['download'] !== '1') {
        return;
    }
    $name = basename(str_replace(["\0", '\\'], '', trim((string) ($_GET['name'] ?? 'anexo'))));
    if ($name === '' || $name === '.' || $name === '..') {
        $name = 'anexo';
    }
    $ascii = preg_replace('/[^\x20-\x7E]/', '_', $name) ?: 'anexo';
    $ascii = str_replace(['"', '\\', ';'], '', $ascii);
    header('Content-Disposition: attachment; filename="' . $ascii . '"');
}

function soublu_file_serve_bytes(string $body, string $mime, string $source): void
{
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string) strlen($body));
    header('Cache-Control: private, max-age=3600');
    header('X-Content-Type-Options: nosniff');
    header('Access-Control-Allow-Origin: *');
    header('X-Served-From: ' . $source);
    soublu_file_maybe_attachment_header();
    echo $body;
    exit;
}

function soublu_file_serve_local(string $file, string $source = 'local'): void
{
    if (!is_file($file) || !is_readable($file)) {
        return;
    }
    $mime = soublu_file_mime($file);
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string) filesize($file));
    header('Cache-Control: private, max-age=3600');
    header('X-Content-Type-Options: nosniff');
    header('Access-Control-Allow-Origin: *');
    header('X-Served-From: ' . $source);
    soublu_file_maybe_attachment_header();
    readfile($file);
    exit;
}

function soublu_file_find_local(string $baseDir, string $bucket, string $object): ?string
{
    foreach (soublu_file_object_variants($object) as $objTry) {
        $direct = rtrim($baseDir, '/\\') . '/' . $bucket . '/' . $objTry;
        if (is_file($direct)) {
            return $direct;
        }
    }

    $object = soublu_file_sanitize_object_path($object) ?: $object;
    $direct = rtrim($baseDir, '/\\') . '/' . $bucket . '/' . $object;
    if (is_file($direct)) {
        return $direct;
    }

    $dir = rtrim($baseDir, '/\\') . '/' . $bucket . '/' . dirname($object);
    $baseName = pathinfo($object, PATHINFO_FILENAME);
    if (!is_dir($dir) || $baseName === '') {
        return null;
    }

    $candidates = [];
    foreach (scandir($dir) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $full = $dir . '/' . $entry;
        if (is_file($full)) {
            $candidates[] = $full;
            continue;
        }
        if (is_dir($full)) {
            foreach (scandir($full) ?: [] as $sub) {
                if ($sub === '.' || $sub === '..') {
                    continue;
                }
                $subFull = $full . '/' . $sub;
                if (is_file($subFull)) {
                    $candidates[] = $subFull;
                }
            }
        }
    }

    if (!$candidates) {
        return null;
    }

    usort($candidates, static fn ($a, $b) => filemtime($b) <=> filemtime($a));

    foreach ($candidates as $c) {
        if (strcasecmp(pathinfo($c, PATHINFO_BASENAME), pathinfo($object, PATHINFO_BASENAME)) === 0) {
            return $c;
        }
    }
    foreach ($candidates as $c) {
        if (stripos(pathinfo($c, PATHINFO_FILENAME), $baseName) !== false) {
            return $c;
        }
    }

    // Pasta achatada no MySQL (…PROP-id_grupo_tsimg_tsext/hash) vs disco (…PROP-id_grupo_ts/img_ts.ext)
    if (preg_match('~^(PROP-\d+)_(.+?)_\d~i', $object, $m)) {
        $prefix = $m[1] . '_' . $m[2];
        $root = rtrim($baseDir, '/\\') . '/' . $bucket;
        if (is_dir($root)) {
            foreach (scandir($root) ?: [] as $entry) {
                if ($entry === '.' || $entry === '..' || !str_starts_with($entry, $prefix . '_')) {
                    continue;
                }
                $folder = $root . '/' . $entry;
                if (!is_dir($folder)) {
                    continue;
                }
                foreach (scandir($folder) ?: [] as $f) {
                    if ($f === '.' || $f === '..') {
                        continue;
                    }
                    $full = $folder . '/' . $f;
                    if (is_file($full) && filesize($full) > 200) {
                        return $full;
                    }
                }
            }
        }
    }

    return null;
}

/** Mesma regra de api/upload.php — caminho gravado no Supabase. */
function soublu_file_sanitize_storage_segment(string $seg): string
{
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $seg);
    $clean = preg_replace('/[^a-zA-Z0-9._-]/', '_', $ascii !== false ? $ascii : $seg) ?? $seg;
    $clean = trim($clean, '_');
    return $clean !== '' ? $clean : 'arquivo';
}

/** Normaliza objeto (pastas/arquivo) como no upload de propostas. */
function soublu_file_sanitize_object_path(string $object): string
{
    $object = str_replace('\\', '/', $object);
    $segments = array_values(array_filter(explode('/', $object), static fn ($s) => $s !== ''));
    if (!$segments) {
        return '';
    }
    return implode('/', array_map('soublu_file_sanitize_storage_segment', $segments));
}

/** Variantes de caminho MySQL achatado (PROP-id_grupo_tsimg_tsext/hash) → disco/Supabase aninhado. */
function soublu_file_flat_mysql_variants(string $object): array
{
    $object = str_replace('\\', '/', $object);
    $variants = [];
    $add = static function (string $v) use (&$variants): void {
        $v = trim($v, '/');
        if ($v !== '' && !in_array($v, $variants, true)) {
            $variants[] = $v;
        }
    };

    if (preg_match('~^(PROP-\d+_[a-z0-9_]+_\d+)img_(\d+)([a-z0-9]+)/([^/]+)$~i', $object, $m)) {
        $folder = $m[1];
        $ts = $m[2];
        $ext = $m[3];
        $hash = $m[4];
        $add($folder . '/img_' . $ts . '.' . $ext);
        if (preg_match('~^(PROP-\d+)_(.+)_(\d+)$~i', $folder, $fm)) {
            $propId = $fm[1];
            $grupo = $fm[2];
            $add($propId . '/' . $grupo . '/' . $ts . '_' . $hash);
            $add($propId . '/' . $grupo . '/img_' . $ts . '.' . $ext);
            $add($propId . '/' . $grupo . '/' . $hash);
        }
    }

    if (preg_match('~^(PROP-\d+)_(.+?)_(\d+)([a-z0-9]+)\.([a-z0-9]+)$~i', $object, $m)) {
        $add($m[1] . '/' . $m[2] . '/' . $m[3] . '_' . $m[4] . '.' . $m[5]);
        $add($m[1] . '/' . $m[2] . '/' . $m[3] . '.' . $m[5]);
    }

    return $variants;
}

function soublu_file_object_variants(string $object): array
{
    $object = str_replace('\\', '/', $object);
    $variants = [];
    $add = static function (string $v) use (&$variants): void {
        $v = trim($v, '/');
        if ($v !== '' && !in_array($v, $variants, true)) {
            $variants[] = $v;
        }
    };
    $add($object);
    $add(rawurldecode($object));
    $sanitized = soublu_file_sanitize_object_path($object);
    $add($sanitized);
    foreach (soublu_file_flat_mysql_variants($object) as $flat) {
        $add($flat);
    }
    if (str_contains($object, ' ')) {
        $add(str_replace(' ', '%20', $object));
        $add(str_replace(' ', '_', $object));
    }
    if (preg_match('/[(),]/', $object)) {
        $add(preg_replace('/[(),]/', '_', $object) ?? $object);
    }
    return $variants;
}

function soublu_file_supabase_keys(): array
{
    $service = (defined('SUPABASE_SERVICE_KEY') && trim((string) SUPABASE_SERVICE_KEY) !== '')
        ? trim((string) SUPABASE_SERVICE_KEY) : '';
    $anon = (defined('SUPABASE_ANON_KEY') && trim((string) SUPABASE_ANON_KEY) !== '')
        ? trim((string) SUPABASE_ANON_KEY) : '';
    return ['service' => $service, 'anon' => $anon];
}

function soublu_file_supabase_bases(): array
{
    $bases = [];
    foreach (['SUPABASE_URL', 'SUPABASE_LEGACY_URL', 'SUPABASE_V2_URL'] as $const) {
        if (defined($const) && trim((string) constant($const)) !== '') {
            $bases[] = rtrim((string) constant($const), '/');
        }
    }
    $bases[] = 'https://dqptnlywbarvznpzgtuj.supabase.co';
    $bases[] = 'https://cpqediswbjxcvpnwflyj.supabase.co';
    return array_values(array_unique($bases));
}

function soublu_file_legacy_base(): string
{
    if (defined('SUPABASE_LEGACY_URL') && trim((string) SUPABASE_LEGACY_URL) !== '') {
        return rtrim((string) SUPABASE_LEGACY_URL, '/');
    }
    if (defined('SUPABASE_URL') && trim((string) SUPABASE_URL) !== '') {
        return rtrim((string) SUPABASE_URL, '/');
    }
    return 'https://dqptnlywbarvznpzgtuj.supabase.co';
}

function soublu_file_v2_base(): string
{
    if (defined('SUPABASE_V2_URL') && trim((string) SUPABASE_V2_URL) !== '') {
        return rtrim((string) SUPABASE_V2_URL, '/');
    }
    return 'https://cpqediswbjxcvpnwflyj.supabase.co';
}

function soublu_file_keys_for_base(string $base): array
{
    $keys = soublu_file_supabase_keys();
    $base = rtrim($base, '/');
    $legacy = soublu_file_legacy_base();
    $v2 = soublu_file_v2_base();

    if ($base === $legacy || str_contains($base, 'dqptnlywbarvznpzgtuj')) {
        $anon = (defined('SUPABASE_LEGACY_ANON_KEY') && trim((string) SUPABASE_LEGACY_ANON_KEY) !== '')
            ? trim((string) SUPABASE_LEGACY_ANON_KEY)
            : $keys['anon'];
        $service = (defined('SUPABASE_LEGACY_SERVICE_KEY') && trim((string) SUPABASE_LEGACY_SERVICE_KEY) !== '')
            ? trim((string) SUPABASE_LEGACY_SERVICE_KEY)
            : $keys['service'];
        if ($anon === '' && $keys['anon'] !== '') {
            $anon = $keys['anon'];
        }
        if ($service === '' && $keys['service'] !== '') {
            $service = $keys['service'];
        }
        if ($anon === '') {
            $anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcHRubHl3YmFydnpucHpndHVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzQ5NTEsImV4cCI6MjA5NDE1MDk1MX0.ntbw10N2fno5hbdLWaKgz11jk-n2gvxZ7zjI0O_Xt1I';
        }
        return ['service' => $service, 'anon' => $anon];
    }

    if ($base === $v2 || str_contains($base, 'cpqediswbjxcvpnwflyj')) {
        $anon = (defined('SUPABASE_V2_ANON_KEY') && trim((string) SUPABASE_V2_ANON_KEY) !== '')
            ? trim((string) SUPABASE_V2_ANON_KEY)
            : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwcWVkaXN3Ymp4Y3ZwbndmbHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzc1MDEsImV4cCI6MjA5NzY1MzUwMX0.oe_njTabnKBVvopX7INporQQMMaI3dyFRDmLCuCOtWE';
        $service = (defined('SUPABASE_V2_SERVICE_KEY') && trim((string) SUPABASE_V2_SERVICE_KEY) !== '')
            ? trim((string) SUPABASE_V2_SERVICE_KEY)
            : '';
        return ['service' => $service, 'anon' => $anon];
    }

    return $keys;
}

function soublu_file_public_url(string $base, string $bucket, string $object): string
{
    $objectEnc = implode('/', array_map('rawurlencode', explode('/', $object)));
    return rtrim($base, '/') . '/storage/v1/object/public/' . rawurlencode($bucket) . '/' . $objectEnc;
}

function soublu_file_url_exists(string $url): bool
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_NOBODY => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => ['Accept: */*'],
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code >= 200 && $code < 300;
}

/**
 * Envia bytes para Supabase Storage (projeto original / legado).
 *
 * @return array{url:string,caminho:string,base:string}|null
 */
function soublu_file_upload_bytes_to_supabase(string $bucket, string $object, string $body, string $mime): ?array
{
    if ($bucket === 'propostas') {
        $bucket = 'proposal-attachments';
    }
    $object = ltrim(str_replace('\\', '/', $object), '/');
    if ($object === '' || str_contains($object, '..')) {
        return null;
    }
    if ($body === '') {
        return null;
    }

    $legacy = soublu_file_legacy_base();
    $legacyKeys = soublu_file_keys_for_base($legacy);
    $authKey = $legacyKeys['service'] !== '' ? $legacyKeys['service'] : $legacyKeys['anon'];
    if ($authKey === '') {
        return null;
    }

    $objectEnc = implode('/', array_map('rawurlencode', explode('/', $object)));
    $uploadUrl = $legacy . '/storage/v1/object/' . rawurlencode($bucket) . '/' . $objectEnc;
    $ch = curl_init($uploadUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $authKey,
            'apikey: ' . $authKey,
            'Content-Type: ' . ($mime !== '' ? $mime : 'application/octet-stream'),
            'x-upsert: true',
        ],
        CURLOPT_TIMEOUT => 120,
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code < 200 || $code >= 300) {
        return null;
    }

    $v2 = soublu_file_v2_base();
    if ($v2 !== $legacy && $bucket === 'whatsapp-media') {
        $v2Keys = soublu_file_keys_for_base($v2);
        $v2Auth = $v2Keys['service'] !== '' ? $v2Keys['service'] : '';
        if ($v2Auth !== '') {
            $v2Url = $v2 . '/storage/v1/object/' . rawurlencode($bucket) . '/' . $objectEnc;
            $ch2 = curl_init($v2Url);
            curl_setopt_array($ch2, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $body,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => [
                    'Authorization: Bearer ' . $v2Auth,
                    'apikey: ' . $v2Auth,
                    'Content-Type: ' . ($mime !== '' ? $mime : 'application/octet-stream'),
                    'x-upsert: true',
                ],
                CURLOPT_TIMEOUT => 120,
            ]);
            curl_exec($ch2);
            curl_close($ch2);
        }
    }

    return [
        'url' => soublu_file_public_url($legacy, $bucket, $object),
        'caminho' => $bucket . '/' . $object,
        'base' => $legacy,
    ];
}

/**
 * Envia arquivo do disco Locaweb para o Supabase legado (proposal-attachments).
 *
 * @return array{url:string,caminho:string,base:string}|null
 */
function soublu_file_push_local_to_supabase(string $uploadDir, string $bucket, string $object): ?array
{
    if ($bucket === 'propostas') {
        $bucket = 'proposal-attachments';
    }
    $local = soublu_file_find_local($uploadDir, $bucket, $object);
    if (!$local || !is_readable($local)) {
        return null;
    }
    $body = file_get_contents($local);
    if ($body === false || $body === '') {
        return null;
    }
    $mime = soublu_file_mime($local);
    $legacy = soublu_file_legacy_base();
    $keys = soublu_file_keys_for_base($legacy);
    $authKey = $keys['service'] !== '' ? $keys['service'] : $keys['anon'];
    if ($authKey === '') {
        return null;
    }
    $objectEnc = implode('/', array_map('rawurlencode', explode('/', $object)));
    $uploadUrl = $legacy . '/storage/v1/object/' . rawurlencode($bucket) . '/' . $objectEnc;
    $ch = curl_init($uploadUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $authKey,
            'apikey: ' . $authKey,
            'Content-Type: ' . $mime,
            'x-upsert: true',
        ],
        CURLOPT_TIMEOUT => 120,
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code < 200 || $code >= 300) {
        return null;
    }
    return [
        'url' => soublu_file_public_url($legacy, $bucket, $object),
        'caminho' => $bucket . '/' . $object,
        'base' => $legacy,
    ];
}

/** @return array{url:string,caminho:string,base:string}|null */
function soublu_file_locate_public_url(string $bucket, string $object): ?array
{
    if ($bucket === 'propostas') {
        $bucket = 'proposal-attachments';
    }
    foreach (soublu_file_supabase_bases() as $base) {
        foreach (soublu_file_object_variants($object) as $objTry) {
            $url = soublu_file_public_url($base, $bucket, $objTry);
            if (soublu_file_url_exists($url)) {
                return [
                    'url' => $url,
                    'caminho' => $bucket . '/' . $objTry,
                    'base' => $base,
                ];
            }
        }
    }
    if (soublu_file_fetch_supabase($bucket, $object)) {
        foreach (soublu_file_supabase_bases() as $base) {
            foreach (soublu_file_object_variants($object) as $objTry) {
                return [
                    'url' => soublu_file_public_url($base, $bucket, $objTry),
                    'caminho' => $bucket . '/' . $objTry,
                    'base' => $base,
                ];
            }
        }
    }
    return null;
}

/** @return array{body:string,mime:string}|null */
function soublu_file_fetch_supabase(string $bucket, string $object): ?array
{
    if ($bucket === 'propostas') {
        $bucket = 'proposal-attachments';
    }
    foreach (soublu_file_supabase_bases() as $base) {
        $keys = soublu_file_keys_for_base($base);
        foreach (soublu_file_object_variants($object) as $objTry) {
            $objectEnc = implode('/', array_map('rawurlencode', explode('/', $objTry)));
            $tryUrls = [
                ['url' => $base . '/storage/v1/object/public/' . rawurlencode($bucket) . '/' . $objectEnc, 'auth' => false],
            ];
            if ($keys['service'] !== '') {
                $tryUrls[] = ['url' => $base . '/storage/v1/object/authenticated/' . rawurlencode($bucket) . '/' . $objectEnc, 'auth' => true, 'key' => $keys['service']];
                $tryUrls[] = ['url' => $base . '/storage/v1/object/' . rawurlencode($bucket) . '/' . $objectEnc, 'auth' => true, 'key' => $keys['service']];
            }
            if ($keys['anon'] !== '') {
                $tryUrls[] = ['url' => $base . '/storage/v1/object/authenticated/' . rawurlencode($bucket) . '/' . $objectEnc, 'auth' => true, 'key' => $keys['anon']];
            }

            foreach ($tryUrls as $spec) {
                $url = $spec['url'];
                $ch = curl_init($url);
                $headers = ['Accept: */*'];
                if (!empty($spec['auth']) && !empty($spec['key'])) {
                    $headers[] = 'Authorization: Bearer ' . $spec['key'];
                    $headers[] = 'apikey: ' . $spec['key'];
                }
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_FOLLOWLOCATION => true,
                    CURLOPT_TIMEOUT => 45,
                    CURLOPT_HTTPHEADER => $headers,
                ]);
                $body = curl_exec($ch);
                $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $ctype = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
                curl_close($ch);

                if ($body === false || $code < 200 || $code >= 300) {
                    continue;
                }
                if (str_contains($ctype, 'text/html') || str_starts_with(ltrim((string) $body), '<!')) {
                    continue;
                }

                $mime = $ctype !== '' ? strtok($ctype, ';') : soublu_file_mime($objTry);
                return ['body' => (string) $body, 'mime' => $mime];
            }
        }
    }

    return null;
}

/** @return array{body:string,mime:string}|null */
function soublu_file_search_supabase_list(string $bucket, string $object): ?array
{
    if ($bucket === 'propostas') {
        $bucket = 'proposal-attachments';
    }

    $targetFull = pathinfo($object, PATHINFO_BASENAME);
    $prefix = dirname($object);
    if ($prefix === '.' || $prefix === '') {
        return null;
    }
    $prefix = rtrim($prefix, '/') . '/';

    foreach (soublu_file_supabase_bases() as $base) {
        $keys = soublu_file_keys_for_base($base);
        $authKey = $keys['service'] !== '' ? $keys['service'] : $keys['anon'];
        if ($authKey === '') {
            continue;
        }
        $listUrl = $base . '/storage/v1/object/list/' . rawurlencode($bucket);
        $ch = curl_init($listUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(['prefix' => $prefix, 'limit' => 200, 'sortBy' => ['column' => 'name', 'order' => 'asc']]),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $authKey,
                'apikey: ' . $authKey,
            ],
            CURLOPT_TIMEOUT => 30,
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($raw === false || $code < 200 || $code >= 300) {
            continue;
        }
        $items = json_decode((string) $raw, true);
        if (!is_array($items)) {
            continue;
        }

        $sanitizedTarget = soublu_file_sanitize_storage_segment($targetFull);
        foreach ($items as $item) {
            if (!is_array($item) || empty($item['name']) || empty($item['id'])) {
                continue;
            }
            $name = (string) $item['name'];
            if (strcasecmp($name, $targetFull) === 0 || strcasecmp($name, $sanitizedTarget) === 0) {
                return soublu_file_fetch_supabase($bucket, $prefix . $name);
            }
        }
        if (preg_match('/^(\d+)_/i', $targetFull, $tm)) {
            $ts = $tm[1];
            foreach ($items as $item) {
                if (!is_array($item) || empty($item['name'])) {
                    continue;
                }
                $name = (string) $item['name'];
                if (str_starts_with($name, $ts . '_')) {
                    return soublu_file_fetch_supabase($bucket, $prefix . $name);
                }
            }
        }
    }

    return null;
}

function soublu_file_serve_url(string $path): string
{
    $site = defined('SITE_URL') ? rtrim((string) SITE_URL, '/') : '';
    if ($site === '' && isset($_SERVER['HTTP_HOST'])) {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $site = $scheme . '://' . $_SERVER['HTTP_HOST'];
    }
    return $site . '/api/file.php?path=' . rawurlencode($path);
}

function soublu_file_resolve(string $uploadDir, string $bucket, string $object): array
{
    if ($bucket === 'propostas') {
        $bucket = 'proposal-attachments';
    }
    foreach (soublu_file_object_variants($object) as $objTry) {
        $relPath = $bucket . '/' . $objTry;
        $serveUrl = soublu_file_serve_url($relPath);

        $local = soublu_file_find_local($uploadDir, $bucket, $objTry);
        if ($local) {
            return ['ok' => true, 'source' => 'local', 'path' => $relPath, 'serve_url' => $serveUrl];
        }

        $remote = soublu_file_fetch_supabase($bucket, $objTry);
        if ($remote) {
            return ['ok' => true, 'source' => 'supabase', 'path' => $relPath, 'serve_url' => $serveUrl];
        }

        $listed = soublu_file_search_supabase_list($bucket, $objTry);
        if ($listed) {
            return ['ok' => true, 'source' => 'supabase', 'path' => $relPath, 'serve_url' => $serveUrl];
        }
    }

    $relPath = $bucket . '/' . $object;
    $serveUrl = soublu_file_serve_url($relPath);
    return ['ok' => false, 'source' => 'none', 'path' => $relPath, 'serve_url' => $serveUrl];
}

function soublu_attach_extract_rel(mixed $val): string
{
    if (is_array($val)) {
        $nested = $val['url'] ?? $val['path'] ?? $val['src'] ?? '';
        return soublu_attach_extract_rel($nested);
    }
    $s = trim((string) $val);
    if ($s === '') {
        return '';
    }
    if (preg_match('~[?&]path=([^&]+)~i', $s, $m)) {
        $decoded = rawurldecode($m[1]);
        if ($decoded !== '' && !str_contains($decoded, '..')) {
            return ltrim(str_replace('\\', '/', $decoded), '/');
        }
    }
    if (preg_match('~/uploads/([^?]+)~i', $s, $m)) {
        return rawurldecode($m[1]);
    }
    if (preg_match('~/storage/v1/object/(?:public|sign|authenticated)/([^/]+)/(.+)$~i', $s, $m)) {
        $bucket = rawurldecode($m[1]);
        if ($bucket === 'propostas') {
            $bucket = 'proposal-attachments';
        }
        return $bucket . '/' . rawurldecode($m[2]);
    }
    if (preg_match('~^proposal-attachments/~i', $s)) {
        return ltrim($s, '/');
    }
    if (preg_match('~^(?:partner-docs|ticket-docs|tim-docs|contestacao-docs|finance-docs|profile-photos|product-images|sonhos|misc|rh-demissao|rh-justificativa|rh-docs|monitoria-atendimento|partner-nf|whatsapp-media)/~i', $s)) {
        return ltrim(str_replace('\\', '/', $s), '/');
    }
    return '';
}

/**
 * Garante meta.attachments como mapa string→URL (nunca lista JSON []).
 *
 * @return array<string, mixed>
 */
function soublu_partner_attachments_coerce_map(mixed $attachments): array
{
    if (!is_array($attachments) || $attachments === [] || array_is_list($attachments)) {
        return [];
    }
    $out = [];
    foreach ($attachments as $key => $val) {
        if (!is_string($key) || $key === '_consultas') {
            continue;
        }
        if (is_string($val) && $val !== '') {
            $out[$key] = $val;
        } elseif (is_array($val) && !empty($val['url'])) {
            $out[$key] = (string) $val['url'];
        }
    }
    return $out;
}

/**
 * Normaliza URLs de anexos obrigatórios do parceiro (meta.attachments).
 *
 * @return array<string, mixed>
 */
function soublu_partner_attachments_normalize_for_api(array $attachments, string $uploadDir = '', bool $repair = false): array
{
    $attachments = soublu_partner_attachments_coerce_map($attachments);
    if ($attachments === []) {
        return $attachments;
    }
    if ($uploadDir === '') {
        $uploadDir = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : (dirname(__DIR__, 2) . '/uploads');
    }

    foreach ($attachments as $key => $val) {
        if (!is_string($key) || $key === '_consultas') {
            continue;
        }
        $valStr = is_string($val) ? $val : (is_array($val) ? (string) ($val['url'] ?? '') : '');
        if ($valStr === '') {
            unset($attachments[$key]);
            continue;
        }
        if (str_starts_with($valStr, 'data:') || str_starts_with($valStr, 'blob:')) {
            if ($repair) {
                unset($attachments[$key]);
            }
            continue;
        }

        $rel = soublu_attach_extract_rel($valStr);
        if ($repair && $rel !== '') {
            $fixed = soublu_attach_repair_value($uploadDir, $valStr, $rel);
            if ($fixed && ($fixed['status'] ?? '') === 'ok') {
                $newCaminho = (string) ($fixed['caminho'] ?? $rel);
                if ($newCaminho !== '') {
                    $rel = ltrim($newCaminho, '/');
                }
                $serveUrl = soublu_file_serve_url($rel);
                if ($serveUrl !== '') {
                    $attachments[$key] = $serveUrl;
                } elseif (!empty($fixed['url'])) {
                    $attachments[$key] = (string) $fixed['url'];
                }
                continue;
            }
        }

        if ($rel !== '') {
            $attachments[$key] = soublu_file_serve_url($rel);
        }
    }

    return $attachments;
}

/**
 * @return array<string, mixed>
 */
function soublu_partner_meta_normalize_for_api(array $meta, string $uploadDir = '', bool $repair = false): array
{
    if (isset($meta['attachments']) && is_array($meta['attachments'])) {
        $meta['attachments'] = soublu_partner_attachments_normalize_for_api($meta['attachments'], $uploadDir, $repair);
    }
    return $meta;
}

/**
 * Localiza URL pública funcional para um anexo gravado na proposta.
 *
 * @return array{status:string,url?:string,caminho?:string,source?:string}|null
 */
function soublu_attach_repair_value(string $uploadDir, mixed $val, string $caminhoStored = ''): ?array
{
    if (is_array($val)) {
        $val = $val['url'] ?? $val['path'] ?? '';
    }
    $s = trim((string) $val);
    if ($s === '') {
        return ['status' => 'empty'];
    }
    if (str_starts_with($s, 'data:') || str_starts_with($s, 'blob:')) {
        return ['status' => 'ok', 'url' => $s, 'source' => 'inline'];
    }

    $rel = trim($caminhoStored) !== '' ? ltrim($caminhoStored, '/') : soublu_attach_extract_rel($s);
    if ($rel === '') {
        return ['status' => 'broken', 'url' => $s];
    }

    $parts = explode('/', $rel, 2);
    $bucket = $parts[0] ?? '';
    $object = $parts[1] ?? '';
    if ($bucket === '' || $object === '') {
        return ['status' => 'broken', 'url' => $s];
    }

    $located = soublu_file_locate_public_url($bucket, $object);
    if (!$located) {
        $san = soublu_file_sanitize_object_path($object);
        if ($san !== '' && $san !== $object) {
            $located = soublu_file_locate_public_url($bucket, $san);
        }
    }
    if ($located) {
        return [
            'status' => 'ok',
            'url' => $located['url'],
            'caminho' => $located['caminho'],
            'source' => 'supabase:' . $located['base'],
        ];
    }

    $resolved = soublu_file_resolve($uploadDir, $bucket, $object);
    if ($resolved['ok'] && $resolved['source'] === 'local') {
        $pushed = soublu_file_push_local_to_supabase($uploadDir, $bucket, $object);
        if ($pushed) {
            return [
                'status' => 'ok',
                'url' => $pushed['url'],
                'caminho' => $pushed['caminho'],
                'source' => 'migrated:' . $pushed['base'],
            ];
        }
        $useUrl = preg_match('~^https?://~i', $s) ? $s : $resolved['serve_url'];
        return [
            'status' => 'ok',
            'url' => $useUrl,
            'caminho' => $resolved['path'],
            'source' => 'local',
        ];
    }

    if (preg_match('~^https?://~i', $s) && (str_contains($s, '/uploads/') || str_contains($s, 'soumaisblu.com.br'))) {
        if (soublu_file_url_exists($s)) {
            $ch = curl_init($s);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_TIMEOUT => 120,
                CURLOPT_HTTPHEADER => ['Accept: */*'],
            ]);
            $body = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if (is_string($body) && $body !== '' && $code >= 200 && $code < 300 && strlen($body) > 200) {
                $mime = soublu_file_mime($object);
                $pushed = soublu_file_upload_bytes_to_supabase($bucket, $object, $body, $mime);
                if ($pushed) {
                    return [
                        'status' => 'ok',
                        'url' => $pushed['url'],
                        'caminho' => $pushed['caminho'],
                        'source' => 'migrated:url-fetch:' . $pushed['base'],
                    ];
                }
            }
            return ['status' => 'ok', 'url' => $s, 'caminho' => $rel, 'source' => 'existing-local-url'];
        }
    }

    if (str_contains($s, 'supabase.co') && soublu_file_url_exists($s)) {
        return ['status' => 'ok', 'url' => $s, 'caminho' => $rel, 'source' => 'existing'];
    }

    $resolved = soublu_file_resolve($uploadDir, $bucket, $object);
    if ($resolved['ok']) {
        $usePath = (string) ($resolved['path'] ?? $rel);
        $serveUrl = (string) ($resolved['serve_url'] ?? soublu_file_serve_url($usePath));
        return [
            'status' => 'ok',
            'url' => $serveUrl,
            'caminho' => $usePath,
            'source' => (string) ($resolved['source'] ?? 'resolved'),
        ];
    }

    return ['status' => 'missing', 'url' => $s, 'caminho' => $rel];
}

/**
 * Normaliza caminhos de anexos de proposta e opcionalmente repara URLs (Supabase / file.php).
 *
 * @return array<string, mixed>
 */
function soublu_attachments_normalize_for_api(array $att, string $uploadDir = '', bool $repair = false): array
{
    if ($att === []) {
        return $att;
    }
    if ($uploadDir === '') {
        $uploadDir = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : (dirname(__DIR__, 2) . '/uploads');
    }

    foreach ($att as $key => $val) {
        if (!is_string($key) || str_ends_with($key, '_nome') || str_ends_with($key, '_pasta') || str_ends_with($key, '_caminho')) {
            continue;
        }
        $valStr = is_string($val) ? $val : (is_array($val) ? (string) ($val['url'] ?? '') : '');
        $caminhoStored = isset($att[$key . '_caminho']) ? (string) $att[$key . '_caminho'] : '';
        $rel = $caminhoStored !== '' ? ltrim($caminhoStored, '/') : soublu_attach_extract_rel($valStr);
        if ($rel === '') {
            continue;
        }

        $parts = explode('/', $rel, 2);
        $bucket = $parts[0] ?? '';
        $object = $parts[1] ?? '';
        if ($bucket === 'propostas') {
            $bucket = 'proposal-attachments';
        }
        if ($bucket === '' || $object === '') {
            continue;
        }

        $sanObject = soublu_file_sanitize_object_path($object);
        $normalized = $bucket . '/' . $sanObject;
        if ($normalized !== $rel) {
            $att[$key . '_caminho'] = $normalized;
            $rel = $normalized;
            $object = $sanObject;
        } elseif ($caminhoStored === '') {
            $att[$key . '_caminho'] = $rel;
        }

        if ($repair) {
            $fixed = soublu_attach_repair_value($uploadDir, $valStr !== '' ? $valStr : $rel, $rel);
            if ($fixed && ($fixed['status'] ?? '') === 'ok') {
                $newCaminho = (string) ($fixed['caminho'] ?? $rel);
                if ($newCaminho !== '') {
                    $att[$key . '_caminho'] = $newCaminho;
                    $rel = $newCaminho;
                }
                $serveUrl = soublu_file_serve_url($rel);
                if ($serveUrl !== '' && !str_starts_with($valStr, 'data:')) {
                    $att[$key] = $serveUrl;
                } elseif (!empty($fixed['url'])) {
                    $att[$key] = (string) $fixed['url'];
                }
                continue;
            }
        }

        if ($valStr !== '' && !str_starts_with($valStr, 'data:') && !str_starts_with($valStr, 'blob:')) {
            $att[$key] = soublu_file_serve_url($rel);
        }
    }

    return $att;
}
