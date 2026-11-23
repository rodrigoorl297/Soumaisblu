<?php
/**
 * Repara URLs de anexos em partners.meta.attachments (MySQL) e tenta localizar arquivos.
 * Corrige meta.attachments gravado como lista JSON [] e recupera órfãos em uploads/partner-docs.
 *
 * GET /api/repair-partner-attachments.php?dry_run=1
 * GET /api/repair-partner-attachments.php?apply=1
 * GET /api/repair-partner-attachments.php?apply=1&partner_id=prtmpyb0qr6gjsbm
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/FileStorage.php';

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

$dryRun = !isset($_GET['apply']) || (string) $_GET['apply'] !== '1';
$partnerFilter = trim((string) ($_GET['partner_id'] ?? ''));
$uploadDir = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : (dirname(__DIR__) . '/uploads');

$docKeys = [
    'termo_login',
    'contrato_social',
    'termo_compliance',
    'rg_representante',
    'termo_confissao_divida',
    'contrato_prestacao_servicos',
];

/**
 * @return array<string, array{caminho:string,url:string,mtime:string}>
 */
function repair_partner_docs_index(string $uploadDir, array $docKeys): array
{
    $index = [];
    $root = rtrim($uploadDir, '/\\') . '/partner-docs';
    if (!is_dir($root)) {
        return $index;
    }
    foreach (scandir($root) ?: [] as $folder) {
        if ($folder === '.' || $folder === '..') {
            continue;
        }
        $matchedKey = '';
        foreach ($docKeys as $key) {
            if (str_starts_with($folder, $key . '_')) {
                $matchedKey = $key;
                break;
            }
        }
        if ($matchedKey === '') {
            continue;
        }
        $folderPath = $root . '/' . $folder;
        if (!is_dir($folderPath)) {
            continue;
        }
        $mtime = (int) (filemtime($folderPath) ?: 0);
        foreach (scandir($folderPath) ?: [] as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            $full = $folderPath . '/' . $file;
            if (!is_file($full) || filesize($full) < 100) {
                continue;
            }
            $rel = 'partner-docs/' . $folder . '/' . $file;
            $prev = $index[$matchedKey]['mtime_ts'] ?? 0;
            if ($mtime >= $prev) {
                $index[$matchedKey] = [
                    'caminho' => $rel,
                    'url' => soublu_file_serve_url($rel),
                    'mtime' => date('c', $mtime),
                    'mtime_ts' => $mtime,
                ];
            }
        }
    }
    return $index;
}

try {
    $pdo = soublu_pdo();
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'DB: ' . $e->getMessage()], 500);
}

$docsIndex = repair_partner_docs_index($uploadDir, $docKeys);

$sql = 'SELECT id, razao_social, meta, created_at FROM partners WHERE meta IS NOT NULL';
$params = [];
if ($partnerFilter !== '') {
    $sql .= ' AND id = :id';
    $params['id'] = $partnerFilter;
}
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$report = [
    'dry_run' => $dryRun,
    'partners' => 0,
    'attachments' => 0,
    'repaired' => 0,
    'recovered' => 0,
    'coerced_empty_list' => 0,
    'missing' => 0,
    'items' => [],
];

foreach ($rows as $row) {
    $metaRaw = $row['meta'] ?? '';
    $meta = is_string($metaRaw) ? json_decode($metaRaw, true) : $metaRaw;
    if (!is_array($meta)) {
        continue;
    }

    $rawAtt = $meta['attachments'] ?? null;
    $wasList = is_array($rawAtt) && ($rawAtt === [] || array_is_list($rawAtt));
    $nextAtt = soublu_partner_attachments_coerce_map($rawAtt);
    $changed = $wasList && $rawAtt !== $nextAtt;

    if ($wasList) {
        $report['coerced_empty_list']++;
    }

    if ($nextAtt === [] && $docsIndex !== [] && ($partnerFilter !== '' || $wasList)) {
        $createdTs = strtotime((string) ($row['created_at'] ?? '')) ?: 0;
        foreach ($docKeys as $key) {
            if (isset($nextAtt[$key]) || !isset($docsIndex[$key])) {
                continue;
            }
            $doc = $docsIndex[$key];
            if ($createdTs > 0 && ($doc['mtime_ts'] ?? 0) < $createdTs - 86400) {
                continue;
            }
            $nextAtt[$key] = $doc['url'];
            $changed = true;
            $report['recovered']++;
            $report['items'][] = [
                'partner_id' => $row['id'],
                'razao_social' => $row['razao_social'] ?? '',
                'key' => $key,
                'status' => 'recovered',
                'old_url' => null,
                'new_url' => $doc['url'],
                'source' => 'partner-docs:' . $doc['caminho'],
            ];
        }
    }

    if ($nextAtt === []) {
        continue;
    }

    $report['partners']++;
    foreach ($nextAtt as $key => $val) {
        if (!is_string($key) || $key === '_consultas' || !is_string($val) || $val === '') {
            continue;
        }
        if (str_starts_with($val, 'data:') || str_starts_with($val, 'blob:')) {
            continue;
        }
        $report['attachments']++;
        $rel = soublu_attach_extract_rel($val);
        $fixed = soublu_attach_repair_value($uploadDir, $val, $rel);
        $status = (string) ($fixed['status'] ?? 'broken');
        $newUrl = $val;
        if ($status === 'ok') {
            $caminho = ltrim((string) ($fixed['caminho'] ?? $rel), '/');
            $newUrl = $caminho !== '' ? soublu_file_serve_url($caminho) : (string) ($fixed['url'] ?? $val);
            if ($newUrl !== '' && $newUrl !== $val) {
                $nextAtt[$key] = $newUrl;
                $changed = true;
                $report['repaired']++;
            }
        } else {
            $report['missing']++;
        }
        $report['items'][] = [
            'partner_id' => $row['id'],
            'razao_social' => $row['razao_social'] ?? '',
            'key' => $key,
            'status' => $status,
            'old_url' => $val,
            'new_url' => $newUrl !== '' ? $newUrl : null,
            'source' => $fixed['source'] ?? null,
        ];
    }

    if ($changed && !$dryRun) {
        $meta['attachments'] = $nextAtt;
        $upd = $pdo->prepare('UPDATE partners SET meta = :meta WHERE id = :id');
        $upd->execute([
            'meta' => json_encode($meta, JSON_UNESCAPED_UNICODE),
            'id' => $row['id'],
        ]);
    }
}

soublu_json(['ok' => true] + $report);
