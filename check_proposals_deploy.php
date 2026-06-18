<?php
declare(strict_types=1);
/**
 * Auditoria rápida — propostas no MySQL Locaweb antes do deploy.
 * Uso: php check_proposals_deploy.php
 */
require __DIR__ . '/api/bootstrap.php';

header('Content-Type: text/plain; charset=utf-8');

try {
    $pdo = soublu_pdo();
} catch (Throwable $e) {
    echo "ERRO conexão: " . $e->getMessage() . PHP_EOL;
    exit(1);
}

echo "=== SOU+BLU — Auditoria propostas (Locaweb) ===" . PHP_EOL;
echo 'Host: ' . DB_HOST . PHP_EOL;
echo 'Database: ' . DB_NAME . PHP_EOL;
echo 'Data: ' . date('Y-m-d H:i:s') . PHP_EOL . PHP_EOL;

$tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
if (!in_array('proposals', $tables, true)) {
    echo "ERRO: tabela `proposals` não existe." . PHP_EOL;
    exit(1);
}

$cols = $pdo->query('SHOW COLUMNS FROM proposals')->fetchAll(PDO::FETCH_ASSOC);
$colNames = array_column($cols, 'Field');

$required = [
    'id', 'numero', 'vendor_id', 'vendorId', 'employee_id',
    'client_name', 'clientName', 'valor', 'valor_final', 'valorFinal',
    'status', 'status_op', 'statusOp', 'created_at', 'createdAt',
];
$comissao = ['comissaoElegivel', 'comissaoRecebida', 'valorComissaoRecebida'];

echo "--- Colunas obrigatórias ---" . PHP_EOL;
$missing = [];
foreach ($required as $c) {
    $ok = in_array($c, $colNames, true);
    echo ($ok ? '[OK] ' : '[FALTA] ') . $c . PHP_EOL;
    if (!$ok) $missing[] = $c;
}

echo PHP_EOL . "--- Colunas comissão (financeiro) ---" . PHP_EOL;
$missingComissao = [];
foreach ($comissao as $c) {
    $ok = in_array($c, $colNames, true);
    echo ($ok ? '[OK] ' : '[FALTA] ') . $c . PHP_EOL;
    if (!$ok) $missingComissao[] = $c;
}

$total = (int) $pdo->query('SELECT COUNT(*) FROM proposals')->fetchColumn();
echo PHP_EOL . "Total de propostas: {$total}" . PHP_EOL;

$nullVendor = (int) $pdo->query(
    "SELECT COUNT(*) FROM proposals
     WHERE COALESCE(NULLIF(TRIM(vendorId),''), NULLIF(TRIM(vendor_id),''), NULLIF(TRIM(employee_id),'')) IS NULL"
)->fetchColumn();
echo "Propostas sem vendedor (todos os campos vazios): {$nullVendor}" . PHP_EOL;

$multiVendor = (int) $pdo->query(
    "SELECT COUNT(*) FROM proposals
     WHERE COALESCE(NULLIF(TRIM(vendorId),''), '') <> ''
       AND COALESCE(NULLIF(TRIM(vendor_id),''), '') <> ''
       AND TRIM(vendorId) <> TRIM(vendor_id)"
)->fetchColumn();
echo "Propostas com vendorId ≠ vendor_id (pode inflar filtros): {$multiVendor}" . PHP_EOL;

$sumAll = (float) $pdo->query(
    'SELECT COALESCE(SUM(COALESCE(valorFinal, valor_final, valor, 0)), 0) FROM proposals'
)->fetchColumn();
echo 'Soma geral (valorFinal → valor): R$ ' . number_format($sumAll, 2, ',', '.') . PHP_EOL;

echo PHP_EOL . '--- Top 8 vendedores (campo principal vendorId → vendor_id → employee_id) ---' . PHP_EOL;
$rows = $pdo->query(
    "SELECT COALESCE(NULLIF(TRIM(vendorId),''), NULLIF(TRIM(vendor_id),''), NULLIF(TRIM(employee_id),''), 'SEM_VENDEDOR') AS vid,
            COUNT(*) AS qtd,
            SUM(COALESCE(valorFinal, valor_final, valor, 0)) AS total
     FROM proposals
     GROUP BY vid
     ORDER BY total DESC
     LIMIT 8"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($rows as $r) {
    echo sprintf(
        "  %s | %d propostas | R$ %s\n",
        $r['vid'],
        (int) $r['qtd'],
        number_format((float) $r['total'], 2, ',', '.')
    );
}

echo PHP_EOL . '--- API REST (simulação listProposals) ---' . PHP_EOL;
require_once __DIR__ . '/api/lib/PostgRestCompat.php';
$api = new PostgRestCompat($pdo);
$list = $api->handle('proposals', 'GET', null, 'select=id,numero,vendorId,vendor_id,employee_id,valorFinal,valor_final,valor,status&order=created_at.desc&limit=3');
echo 'Últimas 3 via API: ' . count($list) . ' registros' . PHP_EOL;
foreach ($list as $p) {
    echo '  - ' . ($p['numero'] ?? $p['id'] ?? '?') . ' | ' . ($p['client_name'] ?? $p['clientName'] ?? '—') . ' | R$ ' . number_format((float)($p['valorFinal'] ?? $p['valor_final'] ?? $p['valor'] ?? 0), 2, ',', '.') . PHP_EOL;
}

echo PHP_EOL . '--- Resultado ---' . PHP_EOL;
if ($missing) {
    echo 'BLOQUEIO: faltam colunas essenciais: ' . implode(', ', $missing) . PHP_EOL;
    exit(2);
}
if ($missingComissao) {
    echo 'AVISO: colunas de comissão ausentes — rode: php api/migrate-proposals-comissao.php (ou abra financeiro uma vez)' . PHP_EOL;
    echo '         Faltam: ' . implode(', ', $missingComissao) . PHP_EOL;
}
if ($total === 0) {
    echo 'AVISO: nenhuma proposta no banco (pode ser ambiente vazio).' . PHP_EOL;
} else {
    echo "OK: {$total} propostas acessíveis no MySQL Locaweb." . PHP_EOL;
}
echo 'Pronto para subir código se config.db.local.php e certificados estiverem no servidor.' . PHP_EOL;
