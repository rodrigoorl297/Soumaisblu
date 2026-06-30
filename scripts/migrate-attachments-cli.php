<?php
/**
 * Migração local: MySQL Locaweb + upload Supabase (sem FTP manual).
 * Uso: php scripts/migrate-attachments-cli.php [--dry-run] [--from=2026-06-01] [--to=2026-06-22]
 */
declare(strict_types=1);

$root = dirname(__DIR__);
foreach (['config.db.local.php', 'config.supabase.local.php'] as $cfg) {
    $p = $root . '/' . $cfg;
    if (is_file($p)) {
        require_once $p;
    }
}

$dryRun = in_array('--dry-run', $argv ?? [], true);
$onlyLocaweb = in_array('--only-locaweb', $argv ?? [], true);
$fromDate = '2026-06-01';
$toDate = date('Y-m-d');
foreach ($argv ?? [] as $a) {
    if (str_starts_with($a, '--from=')) {
        $fromDate = substr($a, 7);
    }
    if (str_starts_with($a, '--to=')) {
        $toDate = substr($a, 5);
    }
}

require_once $root . '/api/lib/FileStorage.php';

// PDO direto (evita carregar config.pix e warnings de constante duplicada)
if (!defined('DB_HOST')) {
    fwrite(STDERR, "config.db.local.php ausente.\n");
    exit(1);
}
$charset = defined('DB_CHARSET') ? DB_CHARSET : 'utf8mb4';
$pdo = new PDO(
    'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . $charset,
    DB_USER,
    defined('DB_PASS') ? DB_PASS : '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);
$site = defined('SITE_URL') ? rtrim((string) SITE_URL, '/') : 'https://www.soumaisblu.com.br';
$legacy = soublu_file_legacy_base();
$keys = soublu_file_keys_for_base($legacy);
$authKey = $keys['service'] !== '' ? $keys['service'] : $keys['anon'];
if ($authKey === '') {
    fwrite(STDERR, "SUPABASE_SERVICE_KEY ausente.\n");
    exit(1);
}

function mig_http_get(string $url): ?string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Accept: */*'],
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code < 200 || $code >= 300 || !is_string($body) || $body === '') {
        return null;
    }
    return $body;
}

function mig_upload_supabase(string $bucket, string $object, string $body, string $mime): ?array
{
    global $legacy, $authKey;
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
    ];
}

/** Tenta baixar anexo da Locaweb com vários formatos de pasta. */
function mig_fetch_locaweb_bytes(string $site, string $rel, string $rawUrl): ?array
{
    $rel = ltrim(str_replace('\\', '/', $rel), '/');
    $urls = [];
    if ($rawUrl !== '' && preg_match('~^https?://~i', $rawUrl)) {
        $urls[] = str_replace(' ', '%20', $rawUrl);
    }
    $urls[] = $site . '/uploads/' . $rel;
    if (preg_match('~^proposal-attachments/(PROP-\d+)_([a-z0-9_]+)_\d~i', $rel, $m)) {
        $prefix = $m[1] . '_' . $m[2];
        if (preg_match('~/(PROP-\d+_[a-z0-9_]+_\d+)img_(\d+)([a-z]+)/~i', $rel, $mm)) {
            $folder = $mm[1];
            $ts = $mm[2];
            $ext = $mm[3];
            $urls[] = $site . '/uploads/proposal-attachments/' . $folder . '/img_' . $ts . '.' . $ext;
        }
        $urls[] = $site . '/api/file.php?path=' . rawurlencode($rel);
    }
    $urls = array_values(array_unique($urls));
    foreach ($urls as $u) {
        $body = mig_http_get($u);
        if ($body !== null && strlen($body) > 200) {
            $mime = 'application/octet-stream';
            if (preg_match('~\.pdf$~i', $u)) {
                $mime = 'application/pdf';
            } elseif (preg_match('~\.(jpe?g|png|gif|webp)$~i', $u, $ex)) {
                $mime = 'image/' . strtolower(str_replace('jpg', 'jpeg', $ex[1]));
            }
            return ['body' => $body, 'mime' => $mime, 'source' => $u];
        }
    }
    return null;
}

function mig_save_proposal(PDO &$pdo, string $charset, string $id, array $att): void
{
    $json = json_encode($att, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $run = static function (PDO $db) use ($json, $id): void {
        $upd = $db->prepare('UPDATE proposals SET attachments = :att WHERE id = :id');
        $upd->execute(['att' => $json, 'id' => $id]);
    };
    try {
        $run($pdo);
    } catch (PDOException) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . $charset,
            DB_USER,
            defined('DB_PASS') ? DB_PASS : '',
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
        $run($pdo);
    }
}

$sql = 'SELECT id, attachments, created_at FROM proposals
        WHERE attachments IS NOT NULL
          AND TRIM(CAST(attachments AS CHAR)) NOT IN (\'\', \'{}\', \'null\', \'[]\')
          AND DATE(created_at) >= :from_date AND DATE(created_at) <= :to_date
        ORDER BY created_at ASC';
$stmt = $pdo->prepare($sql);
$stmt->execute(['from_date' => $fromDate, 'to_date' => $toDate]);

$stats = ['processed' => 0, 'migrated' => 0, 'fixed' => 0, 'missing' => 0, 'skipped' => 0];

echo ($dryRun ? '[DRY-RUN] ' : '') . "Migração {$fromDate} → {$toDate}\n\n";

while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $id = (string) $row['id'];
    $att = json_decode((string) $row['attachments'], true);
    if (!is_array($att)) {
        continue;
    }
    $changed = false;
    $stats['processed']++;

    foreach ($att as $key => $val) {
        if (!is_string($key) || str_ends_with($key, '_nome') || str_ends_with($key, '_pasta') || str_ends_with($key, '_caminho')) {
            continue;
        }
        $valStr = is_string($val) ? $val : '';
        $caminho = (string) ($att[$key . '_caminho'] ?? '');
        $rel = $caminho !== '' ? ltrim($caminho, '/') : soublu_attach_extract_rel($valStr);

        if ($valStr !== '' && str_contains($valStr, 'supabase.co/storage')) {
            $stats['skipped']++;
            continue;
        }

        if ($rel === '') {
            continue;
        }
        $parts = explode('/', $rel, 2);
        $bucket = $parts[0] ?? '';
        $object = $parts[1] ?? '';
        if ($bucket === '' || $object === '') {
            continue;
        }

        $isLocaweb = $valStr !== '' && (str_contains($valStr, '/uploads/') || str_contains($valStr, 'soumaisblu.com.br'));
        if ($onlyLocaweb && !$isLocaweb) {
            $stats['skipped']++;
            continue;
        }
        if (!$isLocaweb) {
            $located = soublu_file_locate_public_url($bucket, $object);
            if ($located) {
                if ($valStr !== $located['url']) {
                    echo "  [fix-url] {$id} {$key}\n";
                    $att[$key] = $located['url'];
                    $att[$key . '_caminho'] = $located['caminho'];
                    $changed = true;
                    $stats['fixed']++;
                    if (!$dryRun) {
                        mig_save_proposal($pdo, $charset, $id, $att);
                    }
                } else {
                    $stats['skipped']++;
                }
                continue;
            }
        }

        $fetched = mig_fetch_locaweb_bytes($site, $rel, $valStr);
        if (!$fetched) {
            $stats['missing']++;
            continue;
        }

        echo "  [migrate] {$id} {$key} (" . strlen($fetched['body']) . " bytes)\n";
        if ($dryRun) {
            $stats['migrated']++;
            continue;
        }

        $up = mig_upload_supabase($bucket, $object, $fetched['body'], $fetched['mime']);
        if (!$up) {
            echo "    ERRO upload Supabase\n";
            $stats['missing']++;
            continue;
        }
        $att[$key] = $up['url'];
        $att[$key . '_caminho'] = $up['caminho'];
        $changed = true;
        $stats['migrated']++;
        $stats['fixed']++;
        mig_save_proposal($pdo, $charset, $id, $att);
        echo "  [saved] {$id} {$key}\n";
    }
}

echo "\n=== RESULTADO ===\n";
echo 'processed: ' . $stats['processed'] . "\n";
foreach ($stats as $k => $v) {
    echo "{$k}: {$v}\n";
}
