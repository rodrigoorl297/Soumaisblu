<?php
/**
 * Recupera um anexo de proposta: disco Locaweb / URL → Supabase + UPDATE MySQL.
 *
 * Uso:
 *   php scripts/recover-proposal-attachment.php --proposal=PROP-1782229248031 [--key=extrato_1] [--dry-run]
 *   php scripts/recover-proposal-attachment.php --protocol=2026062353227 [--key=extrato_1]
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
$proposalId = '';
$protocol = '';
$keyFilter = '';
foreach ($argv as $a) {
    if (str_starts_with($a, '--proposal=')) {
        $proposalId = substr($a, 11);
    }
    if (str_starts_with($a, '--protocol=')) {
        $protocol = substr($a, 11);
    }
    if (str_starts_with($a, '--key=')) {
        $keyFilter = substr($a, 6);
    }
}

if ($proposalId === '' && $protocol === '') {
    fwrite(STDERR, "Informe --proposal=PROP-... ou --protocol=...\n");
    exit(1);
}
if (!defined('DB_HOST')) {
    fwrite(STDERR, "config.db.local.php ausente (rode no servidor Locaweb ou com credenciais locais).\n");
    exit(1);
}

$charset = defined('DB_CHARSET') ? DB_CHARSET : 'utf8mb4';
$pdo = new PDO(
    'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . $charset,
    DB_USER,
    defined('DB_PASS') ? DB_PASS : '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

if ($proposalId === '' && $protocol !== '') {
    $q = $pdo->prepare('SELECT id FROM proposals WHERE protocolo = :p LIMIT 1');
    $q->execute(['p' => $protocol]);
    $proposalId = (string) ($q->fetchColumn() ?: '');
    if ($proposalId === '') {
        fwrite(STDERR, "Proposta não encontrada para protocolo {$protocol}\n");
        exit(1);
    }
}

$stmt = $pdo->prepare('SELECT id, numero, protocolo, client_name, attachments, created_at FROM proposals WHERE id = :id LIMIT 1');
$stmt->execute(['id' => $proposalId]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$row) {
    fwrite(STDERR, "Proposta {$proposalId} não encontrada.\n");
    exit(1);
}

$uploadDir = defined('UPLOAD_DIR') ? UPLOAD_DIR : ($root . '/uploads');
$att = json_decode((string) ($row['attachments'] ?? '{}'), true);
if (!is_array($att)) {
    $att = [];
}

echo ($dryRun ? '[DRY-RUN] ' : '') . "Proposta {$row['id']}";
if (!empty($row['client_name'])) {
    echo ' — ' . $row['client_name'];
}
if (!empty($row['protocolo'])) {
    echo ' (protocolo ' . $row['protocolo'] . ')';
}
echo "\n";

$changed = false;
$results = [];

foreach ($att as $key => $val) {
    if (!is_string($key) || str_ends_with($key, '_nome') || str_ends_with($key, '_pasta') || str_ends_with($key, '_caminho')) {
        continue;
    }
    if ($keyFilter !== '' && $key !== $keyFilter) {
        continue;
    }
    $caminhoStored = isset($att[$key . '_caminho']) ? (string) $att[$key . '_caminho'] : '';
    $repair = soublu_attach_repair_value($uploadDir, $val, $caminhoStored);
    if (!$repair) {
        continue;
    }
    $status = $repair['status'] ?? 'broken';
    $nome = $att[$key . '_nome'] ?? '';
    $line = [
        'key' => $key,
        'nome' => $nome,
        'status' => $status,
        'source' => $repair['source'] ?? null,
    ];

    if ($status === 'ok') {
        $newUrl = $repair['url'] ?? (string) $val;
        $newCaminho = $repair['caminho'] ?? $caminhoStored;
        if ((string) $val !== (string) $newUrl) {
            $line['old_url'] = mb_substr((string) $val, 0, 120);
            $line['new_url'] = mb_substr((string) $newUrl, 0, 120);
            if (!$dryRun) {
                $att[$key] = $newUrl;
            }
            $changed = true;
        }
        if ($newCaminho !== '' && $caminhoStored !== $newCaminho) {
            if (!$dryRun) {
                $att[$key . '_caminho'] = $newCaminho;
            }
            $changed = true;
            $line['caminho'] = $newCaminho;
        }
    } else {
        $line['url'] = is_string($val) ? mb_substr($val, 0, 120) : $val;
        if (!empty($repair['caminho'])) {
            $line['caminho'] = $repair['caminho'];
        }
    }
    $results[] = $line;
}

if ($changed && !$dryRun) {
    $json = json_encode($att, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $upd = $pdo->prepare('UPDATE proposals SET attachments = :att WHERE id = :id');
    $upd->execute(['att' => $json, 'id' => $proposalId]);
    echo "MySQL atualizado.\n";
} elseif ($changed && $dryRun) {
    echo "Simulação: MySQL seria atualizado.\n";
} else {
    echo "Nenhuma alteração necessária ou anexo irrecuperável.\n";
}

echo json_encode(['proposal_id' => $proposalId, 'changed' => $changed, 'items' => $results], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
