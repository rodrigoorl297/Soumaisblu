<?php
/**
 * Repara / migra anexos das propostas (Locaweb uploads → Supabase + URLs no MySQL).
 *
 * GET ?dry_run=1
 * GET ?limit=100&offset=0
 * GET ?all=1                                    — todas as propostas com anexos (sem filtro de data)
 * GET ?from_date=2026-06-01&to_date=2026-06-22   — só propostas neste período (created_at)
 * GET ?only_locaweb=1                             — só anexos com URL /uploads/ ou soumaisblu
 * GET ?only_broken=1                              — só itens missing/broken (relatório mais enxuto)
 * GET ?proposal_id=PROP-1782229248031             — uma proposta específica
 * Header: X-API-Key
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/FileStorage.php';

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado. Envie header X-API-Key.'], 401);
}

$dryRun = isset($_GET['dry_run']) && (string) $_GET['dry_run'] === '1';
$limit = max(1, min(500, (int) ($_GET['limit'] ?? 100)));
$offset = max(0, (int) ($_GET['offset'] ?? 0));
$onlyLocaweb = isset($_GET['only_locaweb']) && (string) $_GET['only_locaweb'] === '1';
$onlyBroken = isset($_GET['only_broken']) && (string) $_GET['only_broken'] === '1';
$repairAll = isset($_GET['all']) && (string) $_GET['all'] === '1';
$proposalId = trim((string) ($_GET['proposal_id'] ?? ''));
$fromDate = trim((string) ($_GET['from_date'] ?? ''));
$toDate = trim((string) ($_GET['to_date'] ?? ''));
$uploadDir = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');

$where = [
    'attachments IS NOT NULL',
    "TRIM(CAST(attachments AS CHAR)) NOT IN ('', '{}', 'null', '[]')",
];
$params = [];

if ($fromDate !== '') {
    $where[] = 'DATE(created_at) >= :from_date';
    $params['from_date'] = $fromDate;
}
if ($toDate !== '') {
    $where[] = 'DATE(created_at) <= :to_date';
    $params['to_date'] = $toDate;
}
if ($proposalId !== '') {
    $where[] = 'id = :proposal_id';
    $params['proposal_id'] = $proposalId;
} elseif ($repairAll) {
    // sem filtro de data — processa todo o histórico em lotes
}

$whereSql = implode(' AND ', $where);

try {
    $pdo = soublu_pdo();
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'MySQL: ' . $e->getMessage()], 500);
}

$countSql = 'SELECT COUNT(*) FROM proposals WHERE ' . $whereSql;
$totalStmt = $pdo->prepare($countSql);
$totalStmt->execute($params);
$totalWithAttachments = (int) $totalStmt->fetchColumn();

$stmt = $pdo->prepare(
    'SELECT id, numero, created_at, attachments FROM proposals
     WHERE ' . $whereSql . '
     ORDER BY created_at ASC, id ASC
     LIMIT :lim OFFSET :off'
);
foreach ($params as $k => $v) {
    $stmt->bindValue(':' . $k, $v);
}
$stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
$stmt->bindValue(':off', $offset, PDO::PARAM_INT);
$stmt->execute();
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$report = [
    'ok' => true,
    'dry_run' => $dryRun,
    'filter' => [
        'from_date' => $fromDate !== '' ? $fromDate : null,
        'to_date' => $toDate !== '' ? $toDate : null,
        'only_locaweb' => $onlyLocaweb,
        'only_broken' => $onlyBroken,
        'all' => $repairAll,
        'proposal_id' => $proposalId !== '' ? $proposalId : null,
    ],
    'batch' => ['limit' => $limit, 'offset' => $offset, 'processed' => count($rows)],
    'total_matching' => $totalWithAttachments,
    'next_offset' => $offset + count($rows),
    'has_more' => ($offset + count($rows)) < $totalWithAttachments,
    'service_key_configured' => soublu_file_supabase_keys()['service'] !== '',
    'v2_service_key_configured' => defined('SUPABASE_V2_SERVICE_KEY') && trim((string) SUPABASE_V2_SERVICE_KEY) !== '',
    'stats' => ['ok' => 0, 'fixed' => 0, 'migrated' => 0, 'inline' => 0, 'missing' => 0, 'broken' => 0, 'empty' => 0, 'skipped' => 0],
    'proposals' => [],
];

foreach ($rows as $row) {
    $id = (string) ($row['id'] ?? '');
    $numero = (string) ($row['numero'] ?? $id);
    $createdAt = (string) ($row['created_at'] ?? '');
    $rawJson = $row['attachments'] ?? '{}';
    $att = is_string($rawJson) ? json_decode($rawJson, true) : $rawJson;
    if (!is_array($att)) {
        $att = [];
    }

    $changed = false;
    $items = [];

    foreach ($att as $key => $val) {
        if (!is_string($key) || str_ends_with($key, '_nome') || str_ends_with($key, '_pasta') || str_ends_with($key, '_caminho')) {
            continue;
        }
        $caminhoStored = isset($att[$key . '_caminho']) ? (string) $att[$key . '_caminho'] : '';
        $valStr = is_string($val) ? $val : (is_array($val) ? (string) ($val['url'] ?? '') : '');
        if ($valStr === '' && $caminhoStored !== '') {
            $valStr = $caminhoStored;
            $val = $caminhoStored;
        }
        if ($onlyLocaweb && $valStr !== '') {
            $isLocaweb = str_contains($valStr, '/uploads/') || str_contains($valStr, 'soumaisblu.com.br/uploads/');
            if (!$isLocaweb) {
                $report['stats']['skipped']++;
                continue;
            }
        }
        $repair = soublu_attach_repair_value($uploadDir, $val, $caminhoStored);
        if (!$repair) {
            continue;
        }

        $status = $repair['status'] ?? 'broken';
        $source = $repair['source'] ?? null;
        if ($onlyBroken && $status === 'ok') {
            $report['stats']['skipped']++;
            continue;
        }
        if ($status === 'ok' && $source === 'inline') {
            $report['stats']['inline']++;
        } elseif ($status === 'ok') {
            $report['stats']['ok']++;
        } else {
            $report['stats'][$status] = ($report['stats'][$status] ?? 0) + 1;
        }

        $item = [
            'key' => $key,
            'status' => $status,
            'nome' => $att[$key . '_nome'] ?? null,
        ];

        if ($status === 'ok') {
            $newUrl = $repair['url'] ?? (string) $val;
            $newCaminho = $repair['caminho'] ?? $caminhoStored;
            $serveUrl = $newCaminho !== '' ? soublu_file_serve_url($newCaminho) : '';
            if ($serveUrl !== '' && !str_starts_with((string) $val, 'data:')) {
                $newUrl = $serveUrl;
            }
            $item['source'] = $source;

            if ((string) $val !== (string) $newUrl) {
                $att[$key] = $newUrl;
                $changed = true;
                $report['stats']['fixed']++;
                if (is_string($source) && str_starts_with($source, 'migrated:')) {
                    $report['stats']['migrated']++;
                }
                $item['fixed'] = true;
                $item['old_url'] = is_string($val) ? mb_substr($val, 0, 120) : $val;
                $item['new_url'] = mb_substr($newUrl, 0, 120);
            }
            if ($newCaminho !== '' && ($caminhoStored === '' || $caminhoStored !== $newCaminho)) {
                $att[$key . '_caminho'] = $newCaminho;
                $changed = true;
                $item['caminho'] = $newCaminho;
            }
        } else {
            $item['url'] = is_string($val) ? mb_substr($val, 0, 120) : $val;
            if (!empty($repair['caminho'])) {
                $item['caminho'] = $repair['caminho'];
            }
        }

        $items[] = $item;
    }

    if ($changed && !$dryRun) {
        $json = json_encode($att, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $upd = $pdo->prepare('UPDATE proposals SET attachments = :att WHERE id = :id');
        $upd->execute(['att' => $json, 'id' => $id]);
    }

    if ($items) {
        $report['proposals'][] = [
            'id' => $id,
            'numero' => $numero,
            'created_at' => $createdAt,
            'changed' => $changed,
            'items' => $items,
        ];
    }
}

$report['message'] = $dryRun
    ? 'Simulacao: arquivos Locaweb serao enviados ao Supabase e URLs gravadas no MySQL. Rode sem dry_run=1.'
    : 'Lote gravado. Se has_more=true, repita com offset=next_offset. Depois Ctrl+F5 no painel.';
$report['curl_example'] = 'curl -s "' . (defined('SITE_URL') ? rtrim((string) SITE_URL, '/') : 'https://www.soumaisblu.com.br')
    . '/api/repair-proposal-attachments.php?all=1&limit=100&offset=0" -H "X-API-Key: SEU_API_KEY"';

soublu_json($report);
