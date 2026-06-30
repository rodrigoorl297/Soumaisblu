<?php
/**
 * Restaura anexos Locaweb ausentes copiando de pastas de backup local.
 *
 * Uso:
 *   php scripts/restore-missing-attachments.php --scan
 *   php scripts/restore-missing-attachments.php --scan --backup="C:\...\public_html (32)\public_html\uploads"
 *   php scripts/restore-missing-attachments.php --copy --backup="..." [--dry-run]
 *   php scripts/restore-missing-attachments.php --copy --migrate [--dry-run]
 *
 * Opções:
 *   --scan              Apenas relatório (padrão se nem --copy nem --migrate)
 *   --copy              Copia arquivos encontrados para uploads/
 *   --migrate           Após cópia, envia ao Supabase e atualiza MySQL
 *   --dry-run           Não grava disco nem MySQL
 *   --backup=PATH       Pasta uploads de backup (pode repetir; auto-detecta Downloads)
 *   --from=YYYY-MM-DD   Filtro created_at (padrão 2026-06-01)
 *   --to=YYYY-MM-DD     Filtro created_at (padrão hoje)
 *   --local-only        Scan rápido: não consulta Supabase por HTTP
 *   --report=FILE       Salva JSON com itens missing/not_found
 */
declare(strict_types=1);

$root = dirname(__DIR__);
foreach (['config.db.local.php', 'config.supabase.local.php'] as $cfg) {
    $p = $root . '/' . $cfg;
    if (is_file($p)) {
        require_once $p;
    }
}
require_once $root . '/api/lib/FileStorage.php';

$argv = $argv ?? [];
$dryRun = in_array('--dry-run', $argv, true);
$localOnly = in_array('--local-only', $argv, true);
$doCopy = in_array('--copy', $argv, true);
$doMigrate = in_array('--migrate', $argv, true);
$fromDate = '2026-06-01';
$toDate = date('Y-m-d');
$reportFile = '';
$backupRoots = [];

foreach ($argv as $a) {
    if (str_starts_with($a, '--from=')) {
        $fromDate = substr($a, 7);
    }
    if (str_starts_with($a, '--to=')) {
        $toDate = substr($a, 5);
    }
    if (str_starts_with($a, '--backup=')) {
        $backupRoots[] = rtrim(substr($a, 9), '/\\');
    }
    if (str_starts_with($a, '--report=')) {
        $reportFile = substr($a, 9);
    }
}

if (!$doCopy && !$doMigrate) {
    $doScan = true;
} else {
    $doScan = false;
}

if (!defined('DB_HOST')) {
    fwrite(STDERR, "config.db.local.php ausente.\n");
    exit(1);
}

$uploadDir = defined('UPLOAD_DIR') ? UPLOAD_DIR : ($root . '/uploads');
$charset = defined('DB_CHARSET') ? DB_CHARSET : 'utf8mb4';
$pdo = new PDO(
    'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . $charset,
    DB_USER,
    defined('DB_PASS') ? DB_PASS : '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

/** Auto-detecta backups comuns no PC do usuário. */
function restore_detect_backups(string $root): array
{
    $candidates = [
        dirname($root) . '/public_ht_rebuilt/uploads',
        $root . '/SOUBLU_deploy_2026-06-19/uploads',
        $root . '/uploads',
        'C:/Users/bluno/Downloads/public_html (32)/public_html/uploads',
        'C:/Users/bluno/Downloads/public_html_32_extracted/public_html/uploads',
        'C:/Users/bluno/Downloads/public_html (37)/public_html/uploads',
        'C:/Users/bluno/Downloads/public_html (38)/public_html/uploads',
        'C:/Users/bluno/Downloads/public_html_extracted/public_html/uploads',
        'C:/Users/bluno/Downloads/temp_37_extract/public_html/uploads',
        'C:/Users/bluno/Downloads/temp_38_extract/public_html/uploads',
        'C:/Users/bluno/Downloads/test_zip/public_html/uploads',
    ];
    $found = [];
    foreach ($candidates as $c) {
        $norm = str_replace('\\', '/', $c);
        if (is_dir($norm) && is_dir($norm . '/proposal-attachments')) {
            $found[] = $norm;
        }
    }
    return array_values(array_unique($found));
}

if (!$backupRoots) {
    $backupRoots = restore_detect_backups($root);
}

function restore_copy_file(string $src, string $dest, bool $dryRun): bool
{
    $destDir = dirname($dest);
    if (!is_dir($destDir) && !$dryRun) {
        if (!mkdir($destDir, 0755, true) && !is_dir($destDir)) {
            return false;
        }
    }
    if ($dryRun) {
        return true;
    }
    if (is_file($dest) && filesize($dest) > 200) {
        return true;
    }
    return copy($src, $dest);
}

function restore_find_in_backups(array $backupRoots, string $bucket, string $object, string $urlHint = '', string $propId = '', string $key = ''): ?array
{
    foreach ($backupRoots as $base) {
        $local = soublu_file_find_local($base, $bucket, $object);
        if ($local && is_readable($local)) {
            return ['path' => $local, 'backup' => $base];
        }
    }

    // URL Locaweb costuma ter formato achatado (…PROP-id_key_tsimg_tsext/hash) mesmo quando _caminho está aninhado
    if ($urlHint !== '') {
        $relUrl = soublu_attach_extract_rel($urlHint);
        if ($relUrl !== '') {
            $parts = explode('/', $relUrl, 2);
            $b = $parts[0] ?? '';
            $o = $parts[1] ?? '';
            if ($b !== '' && $o !== '') {
                foreach ($backupRoots as $base) {
                    $local = soublu_file_find_local($base, $b, $o);
                    if ($local && is_readable($local)) {
                        return ['path' => $local, 'backup' => $base, 'matched' => 'url'];
                    }
                }
            }
        }
    }

    // Fuzzy: PROP-id + nome do campo (boleto_1, extrato_2, …)
    if ($propId !== '' && $key !== '') {
        $needle = $propId . '_' . $key . '_';
        foreach ($backupRoots as $base) {
            $root = rtrim($base, '/\\') . '/' . $bucket;
            if (!is_dir($root)) {
                continue;
            }
            foreach (scandir($root) ?: [] as $entry) {
                if ($entry === '.' || $entry === '..' || !str_starts_with($entry, $needle)) {
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
                        return ['path' => $full, 'backup' => $base, 'matched' => 'fuzzy'];
                    }
                }
            }
        }
    }

    return null;
}

function restore_save_proposal(PDO $pdo, string $charset, string $id, array $att): void
{
    $json = json_encode($att, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $upd = $pdo->prepare('UPDATE proposals SET attachments = :att WHERE id = :id');
    $upd->execute(['att' => $json, 'id' => $id]);
}

function restore_upload_supabase(string $bucket, string $object, string $body, string $mime): ?array
{
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
    ];
}

// Indexa arquivos nos backups (para estatísticas)
$backupFileCount = 0;
foreach ($backupRoots as $br) {
    $pa = $br . '/proposal-attachments';
    if (!is_dir($pa)) {
        continue;
    }
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($pa, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($it as $f) {
        if ($f->isFile()) {
            $backupFileCount++;
        }
    }
}

$sql = 'SELECT id, numero, attachments, created_at FROM proposals
        WHERE attachments IS NOT NULL
          AND TRIM(CAST(attachments AS CHAR)) NOT IN (\'\', \'{}\', \'null\', \'[]\')
          AND DATE(created_at) >= :from_date AND DATE(created_at) <= :to_date
        ORDER BY created_at ASC';
$stmt = $pdo->prepare($sql);
$stmt->execute(['from_date' => $fromDate, 'to_date' => $toDate]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$stats = [
    'proposals' => count($rows),
    'locaweb_refs' => 0,
    'already_supabase' => 0,
    'already_local' => 0,
    'in_supabase_wrong_url' => 0,
    'recoverable_backup' => 0,
    'copied' => 0,
    'migrated' => 0,
    'still_missing' => 0,
    'inline' => 0,
];
$details = ['recoverable' => [], 'missing' => [], 'fixed_url' => []];

echo ($dryRun ? '[DRY-RUN] ' : '') . "Restauração de anexos {$fromDate} → {$toDate}\n";
echo 'Upload dir: ' . $uploadDir . "\n";
echo 'Backups (' . count($backupRoots) . "):\n";
foreach ($backupRoots as $br) {
    echo '  - ' . $br . "\n";
}
echo "Arquivos nos backups (proposal-attachments): {$backupFileCount}\n\n";

foreach ($rows as $row) {
    $id = (string) $row['id'];
    $att = json_decode((string) $row['attachments'], true);
    if (!is_array($att)) {
        continue;
    }

    foreach ($att as $key => $val) {
        if (!is_string($key) || str_ends_with($key, '_nome') || str_ends_with($key, '_pasta') || str_ends_with($key, '_caminho')) {
            continue;
        }
        $valStr = is_string($val) ? $val : '';
        if ($valStr !== '' && (str_starts_with($valStr, 'data:') || str_starts_with($valStr, 'blob:'))) {
            $stats['inline']++;
            continue;
        }
        if ($valStr !== '' && str_contains($valStr, 'supabase.co/storage')) {
            $stats['already_supabase']++;
            continue;
        }

        $caminho = (string) ($att[$key . '_caminho'] ?? '');
        $rel = $caminho !== '' ? ltrim($caminho, '/') : soublu_attach_extract_rel($valStr);
        if ($rel === '') {
            continue;
        }
        $parts = explode('/', $rel, 2);
        $bucket = $parts[0] ?? '';
        $object = $parts[1] ?? '';
        if ($bucket === '' || $object === '') {
            continue;
        }

        $isLocaweb = $valStr === '' || str_contains($valStr, '/uploads/') || str_contains($valStr, 'soumaisblu.com.br');
        if (!$isLocaweb) {
            continue;
        }
        $stats['locaweb_refs']++;

        // Já no disco local?
        $localNow = soublu_file_find_local($uploadDir, $bucket, $object);
        if ($localNow && is_readable($localNow) && filesize($localNow) > 200) {
            $stats['already_local']++;
            if ($doMigrate) {
                $body = file_get_contents($localNow);
                $mime = soublu_file_mime($localNow);
                if (!$dryRun && $body !== false && $body !== '') {
                    $up = restore_upload_supabase($bucket, $object, $body, $mime);
                    if ($up) {
                        $att[$key] = $up['url'];
                        $att[$key . '_caminho'] = $up['caminho'];
                        restore_save_proposal($pdo, $charset, $id, $att);
                        $stats['migrated']++;
                        echo "  [migrate-local] {$id} {$key}\n";
                    }
                } elseif ($dryRun) {
                    $stats['migrated']++;
                    echo "  [migrate-local] {$id} {$key}\n";
                }
            }
            continue;
        }

        // Busca em backup (rápido — antes de HTTP Supabase)
        $found = restore_find_in_backups($backupRoots, $bucket, $object, $valStr, $id, $key);
        if ($found) {
            $stats['recoverable_backup']++;
            $dest = rtrim($uploadDir, '/\\') . '/' . $bucket . '/' . str_replace('/', DIRECTORY_SEPARATOR, $object);
            $item = [
                'id' => $id,
                'key' => $key,
                'caminho' => $rel,
                'from' => $found['path'],
                'to' => $dest,
                'backup' => $found['backup'],
            ];
            $details['recoverable'][] = $item;

            if ($doCopy || $doMigrate) {
                $ok = restore_copy_file($found['path'], $dest, $dryRun);
                if ($ok) {
                    $stats['copied']++;
                    echo '  [copy] ' . $id . ' ' . $key . ' ← ' . basename(dirname($found['path'])) . '/' . basename($found['path']) . "\n";

                    if ($doMigrate && !$dryRun && is_file($dest)) {
                        $body = file_get_contents($dest);
                        $mime = soublu_file_mime($dest);
                        if ($body !== false && $body !== '') {
                            $up = restore_upload_supabase($bucket, $object, $body, $mime);
                            if ($up) {
                                $att[$key] = $up['url'];
                                $att[$key . '_caminho'] = $up['caminho'];
                                restore_save_proposal($pdo, $charset, $id, $att);
                                $stats['migrated']++;
                                echo "  [migrate] {$id} {$key}\n";
                            }
                        }
                    } elseif ($doMigrate && $dryRun) {
                        $stats['migrated']++;
                        echo "  [migrate] {$id} {$key}\n";
                    }
                }
            }
            continue;
        }

        // Existe no Supabase mas URL MySQL errada?
        if (!$localOnly) {
            $located = soublu_file_locate_public_url($bucket, $object);
            if ($located) {
                $stats['in_supabase_wrong_url']++;
                $details['fixed_url'][] = [
                    'id' => $id, 'key' => $key, 'caminho' => $rel, 'url' => $located['url'],
                ];
                if ($doMigrate && !$dryRun) {
                    $att[$key] = $located['url'];
                    $att[$key . '_caminho'] = $located['caminho'];
                    restore_save_proposal($pdo, $charset, $id, $att);
                }
                continue;
            }
        }

        $stats['still_missing']++;
        $details['missing'][] = [
            'id' => $id,
            'numero' => (string) ($row['numero'] ?? $id),
            'key' => $key,
            'caminho' => $rel,
            'url' => substr($valStr, 0, 160),
        ];
    }
}

echo "\n=== RESULTADO ===\n";
foreach ($stats as $k => $v) {
    echo "{$k}: {$v}\n";
}

$canRestore = $stats['recoverable_backup'] + $stats['in_supabase_wrong_url'] + $stats['already_local'];
echo "\nResumo: {$canRestore} recuperáveis (backup + Supabase URL + já local), {$stats['still_missing']} sem backup.\n";

if ($reportFile !== '') {
    $payload = [
        'generated_at' => date('c'),
        'period' => ['from' => $fromDate, 'to' => $toDate],
        'backup_roots' => $backupRoots,
        'stats' => $stats,
        'recoverable' => $details['recoverable'],
        'missing' => $details['missing'],
        'fixed_url' => $details['fixed_url'],
    ];
    file_put_contents($reportFile, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    echo "Relatório JSON: {$reportFile}\n";
}

if (!$doCopy && !$doMigrate) {
    echo "\nPróximo passo:\n";
    echo "  php scripts/restore-missing-attachments.php --copy --migrate --dry-run\n";
    echo "  php scripts/restore-missing-attachments.php --copy --migrate\n";
}
