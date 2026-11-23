<?php
/**
 * Identifica e estorna créditos automáticos de comissão creditados indevidamente a vendedores
 * (propostas com origem_parceiro !== SIM no fluxo de baixa de comissão).
 *
 * GET ?dry_run=1          — apenas diagnóstico (padrão)
 * GET ?apply=1            — aplica estornos
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

function rvc_json_field(mixed $raw): array
{
    if (is_array($raw)) {
        return $raw;
    }
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function rvc_money(float $n): float
{
    return round($n, 2);
}

function rvc_user_name(array $u): string
{
    return trim((string) ($u['name'] ?? $u['nome'] ?? $u['email'] ?? $u['id'] ?? ''));
}

/** Crédito indevido: comissão automática quando origem parceiro não é SIM, ou parceiro deveria receber. */
function rvc_is_wrong_baixa_credit(array $opData): bool
{
    $cc = $opData['conta_credito'] ?? null;
    if (!is_array($cc) || empty($cc['ok'])) {
        return false;
    }
    $amount = (float) ($cc['delta'] ?? $cc['amount'] ?? 0);
    if ($amount <= 0) {
        return false;
    }
    if (!empty($cc['repair_reversed'])) {
        return false;
    }

    $origem = strtoupper(trim((string) ($opData['origem_parceiro'] ?? '')));
    $pago = strtoupper(trim((string) ($opData['pago_comissao_parceiro'] ?? '')));
    $label = strtolower(trim((string) ($cc['label'] ?? '')));

    if ($origem !== 'SIM') {
        return true;
    }
    if ($pago === 'SIM' && $label === 'vendedor') {
        return true;
    }
    return false;
}

function rvc_gen_id(string $prefix): string
{
    return $prefix . base_convert((string) (int) (microtime(true) * 1000), 10, 36) . substr(bin2hex(random_bytes(3)), 0, 5);
}

function rvc_table_columns(PDO $pdo, string $table): array
{
    static $cache = [];
    if (!isset($cache[$table])) {
        $stmt = $pdo->query('SHOW COLUMNS FROM `' . preg_replace('/[^a-zA-Z0-9_]/', '', $table) . '`');
        $cache[$table] = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $cache[$table][] = (string) ($row['Field'] ?? '');
        }
    }
    return $cache[$table];
}

function rvc_has_column(PDO $pdo, string $table, string $col): bool
{
    return in_array($col, rvc_table_columns($pdo, $table), true);
}

function rvc_deduct_user(PDO $pdo, string $empId, float $amount, string $reason, array $meta): ?array
{
    $stmt = $pdo->prepare('SELECT id, name, role, balance, points, admin_id, partner_root_id FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$empId]);
    $emp = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$emp) {
        return null;
    }

    $current = rvc_money((float) ($emp['points'] ?? $emp['balance'] ?? 0));
    $amt = rvc_money($amount);
    if ($amt <= 0) {
        return null;
    }
    $nb = rvc_money($current - $amt);

    $txId = rvc_gen_id('tx');
    $txMeta = array_merge($meta, [
        'screen' => 'conta_corrente_gestao',
        'kind' => 'conta_debito_proposta',
        'saldo_anterior' => $current,
        'saldo_novo' => $nb,
    ]);

    $upd = $pdo->prepare('UPDATE users SET balance = :bal, points = :pts WHERE id = :id');
    $upd->execute(['bal' => $nb, 'pts' => $nb, 'id' => $empId]);

    $txCols = ['id', 'employee_id', 'type', 'amount', 'reason', 'by_user', 'created_at'];
    $txVals = [
        'id' => $txId,
        'employee_id' => $empId,
        'type' => 'debit',
        'amount' => $amt,
        'reason' => $reason,
        'by_user' => 'sistema',
        'created_at' => gmdate('Y-m-d H:i:s'),
    ];
    if (rvc_has_column($pdo, 'transactions', 'meta')) {
        $txCols[] = 'meta';
        $txVals['meta'] = json_encode($txMeta, JSON_UNESCAPED_UNICODE);
    }

    $placeholders = [];
    $params = [];
    foreach ($txCols as $c) {
        $placeholders[] = ':' . $c;
        $params[$c] = $txVals[$c];
    }
    $sql = 'INSERT INTO transactions (' . implode(', ', array_map(static fn ($c) => "`$c`", $txCols)) . ')
         VALUES (' . implode(', ', $placeholders) . ')';
    $ins = $pdo->prepare($sql);
    try {
        $ins->execute($params);
    } catch (Throwable $e) {
        if (isset($txVals['meta'])) {
            unset($txVals['meta']);
            $txCols = array_values(array_filter($txCols, static fn ($c) => $c !== 'meta'));
            $placeholders = [];
            $params = [];
            foreach ($txCols as $c) {
                $placeholders[] = ':' . $c;
                $params[$c] = $txVals[$c];
            }
            $sql = 'INSERT INTO transactions (' . implode(', ', array_map(static fn ($c) => "`$c`", $txCols)) . ')
                 VALUES (' . implode(', ', $placeholders) . ')';
            $pdo->prepare($sql)->execute($params);
        } else {
            throw $e;
        }
    }

    return [
        'employee_id' => $empId,
        'employee_name' => rvc_user_name($emp),
        'role' => $emp['role'] ?? '',
        'amount' => $amt,
        'balance_before' => $current,
        'balance_after' => $nb,
        'transaction_id' => $txId,
    ];
}

function rvc_clear_proposal_credit_meta(PDO $pdo, string $proposalId, string $targetId): void
{
    if (!rvc_has_column($pdo, 'proposals', 'meta')) {
        return;
    }
    $stmt = $pdo->prepare('SELECT id, meta FROM proposals WHERE id = ? LIMIT 1');
    $stmt->execute([$proposalId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return;
    }
    $meta = rvc_json_field($row['meta'] ?? '');
    $creditedPara = (string) ($meta['comissao_conta_creditada_para'] ?? '');
    if ($creditedPara !== '' && $creditedPara !== $targetId) {
        return;
    }
    unset($meta['comissao_conta_creditada'], $meta['comissao_conta_creditada_em'], $meta['comissao_conta_creditada_para']);
    $meta['comissao_conta_estornada_em'] = gmdate('c');
    $meta['comissao_conta_estornada_motivo'] = 'repair-vendor-comissao';
    $upd = $pdo->prepare('UPDATE proposals SET meta = :meta WHERE id = :id');
    $upd->execute(['meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'id' => $proposalId]);
}

$dryRun = !isset($_GET['apply']) || (string) $_GET['apply'] !== '1';

try {
    $pdo = soublu_pdo();
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'DB: ' . $e->getMessage()], 500);
}

$usersById = [];
foreach ($pdo->query('SELECT id, name, role, balance, points, admin_id, partner_root_id FROM users') as $u) {
    $usersById[(string) $u['id']] = $u;
}

function rvc_op_already_repaired_for(PDO $pdo, string $proposalRef, string $targetId): bool
{
    $stmt = $pdo->prepare(
        "SELECT data FROM finance_proposta_ops
         WHERE type = 'baixa_comissao' AND (proposal_numero = ? OR proposal_id = ?)"
    );
    $stmt->execute([$proposalRef, $proposalRef]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $od = rvc_json_field($row['data'] ?? '');
        $cc = $od['conta_credito'] ?? [];
        if (empty($cc['repair_reversed'])) {
            continue;
        }
        if ((string) ($cc['targetId'] ?? '') === $targetId) {
            return true;
        }
    }
    return false;
}

$wrong = [];
$totalWrong = 0.0;
$reversed = [];
$skipped = [];
$handledCreditKeys = [];

function rvc_credit_key(string $targetId, string $proposalRef): string
{
    return $targetId . '|' . $proposalRef;
}

$opsStmt = $pdo->query(
    "SELECT id, type, proposal_id, proposal_numero, data, created_at
     FROM finance_proposta_ops
     WHERE type = 'baixa_comissao'
     ORDER BY created_at ASC"
);

while ($row = $opsStmt->fetch(PDO::FETCH_ASSOC)) {
    $opData = rvc_json_field($row['data'] ?? '');
    if ($opData === [] && isset($row['data']) && is_string($row['data'])) {
        $opData = rvc_json_field($row['data']);
    }
    if (!rvc_is_wrong_baixa_credit($opData)) {
        continue;
    }

    $cc = $opData['conta_credito'];
    $targetId = (string) ($cc['targetId'] ?? '');
    $amount = rvc_money((float) ($cc['delta'] ?? 0));
    $proposalId = (string) ($row['proposal_id'] ?? $opData['proposal_id'] ?? '');
    $proposalNumero = (string) ($row['proposal_numero'] ?? $opData['proposal_numero'] ?? '');
    $target = $usersById[$targetId] ?? null;

    $item = [
        'source' => 'baixa_comissao_op',
        'op_id' => $row['id'],
        'proposal_id' => $proposalId,
        'proposal_numero' => $proposalNumero,
        'created_at' => $row['created_at'] ?? $opData['created_at'] ?? null,
        'origem_parceiro' => $opData['origem_parceiro'] ?? null,
        'pago_comissao_parceiro' => $opData['pago_comissao_parceiro'] ?? null,
        'apto_comissao' => $opData['apto_comissao'] ?? null,
        'target_id' => $targetId,
        'target_name' => $target ? rvc_user_name($target) : null,
        'target_role' => $target['role'] ?? null,
        'credit_label' => $cc['label'] ?? null,
        'amount' => $amount,
        'reason' => 'origem_parceiro !== SIM ou crédito ao vendedor com pago parceiro SIM',
    ];
    $wrong[] = $item;
    $totalWrong += $amount;
    $handledCreditKeys[rvc_credit_key($targetId, $proposalNumero)] = true;

    if ($dryRun || $targetId === '' || $amount <= 0) {
        continue;
    }

    $reason = "Estorno — comissão indevida (proposta {$proposalNumero})";
    $meta = [
        'repair' => 'vendor_comissao',
        'repair_op_id' => $row['id'],
        'proposal_ref' => $proposalNumero,
        'original_credit_label' => $cc['label'] ?? null,
        'origem_parceiro' => $opData['origem_parceiro'] ?? null,
    ];

    try {
        $pdo->beginTransaction();
        $deduct = rvc_deduct_user($pdo, $targetId, $amount, $reason, $meta);
        if (!$deduct) {
            $pdo->rollBack();
            $skipped[] = ['op_id' => $row['id'], 'error' => 'Falha ao debitar usuário'];
            continue;
        }

        if ($proposalId !== '') {
            rvc_clear_proposal_credit_meta($pdo, $proposalId, $targetId);
        }

        $cc['repair_reversed'] = true;
        $cc['repair_reversed_at'] = gmdate('c');
        $cc['repair_debit_tx'] = $deduct['transaction_id'];
        $opData['conta_credito'] = $cc;
        $opData['repair_vendor_comissao'] = [
            'at' => gmdate('c'),
            'debit_tx' => $deduct['transaction_id'],
            'amount' => $amount,
        ];

        $updOp = $pdo->prepare('UPDATE finance_proposta_ops SET data = :data, updated_at = :ua WHERE id = :id');
        $updOp->execute([
            'data' => json_encode($opData, JSON_UNESCAPED_UNICODE),
            'ua' => gmdate('Y-m-d H:i:s'),
            'id' => $row['id'],
        ]);

        $pdo->commit();
        $reversed[] = array_merge($item, ['debit' => $deduct]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $skipped[] = ['op_id' => $row['id'], 'error' => $e->getMessage()];
    }
}

// Transações órfãs (crédito proposta em vendedor sem op coerente já estornada)
$txHasMeta = rvc_has_column($pdo, 'transactions', 'meta');
$txSelect = $txHasMeta
    ? 'SELECT id, employee_id, amount, reason, meta, created_at'
    : 'SELECT id, employee_id, amount, reason, created_at';
$txStmt = $pdo->query(
    "$txSelect
     FROM transactions
     WHERE type = 'credit'
       AND (reason LIKE '%Baixa comissão%' OR reason LIKE '%Baixa comissao%'"
    . ($txHasMeta ? " OR meta LIKE '%conta_credito_proposta%'" : '')
    . ")
     ORDER BY created_at ASC"
);

$reversedTxIds = [];
foreach ($reversed as $r) {
    if (!empty($r['debit']['transaction_id'])) {
        $reversedTxIds[$r['debit']['transaction_id']] = true;
    }
}

while ($tx = $txStmt->fetch(PDO::FETCH_ASSOC)) {
    $meta = $txHasMeta ? rvc_json_field($tx['meta'] ?? '') : [];
    if ($txHasMeta && ($meta['kind'] ?? '') !== 'conta_credito_proposta' && ($meta['kind'] ?? '') !== '') {
        continue;
    }
    if (!empty($meta['repair_reversed']) || !empty($meta['repair_vendor_comissao_skip'])) {
        continue;
    }
    $empId = (string) ($tx['employee_id'] ?? '');
    $emp = $usersById[$empId] ?? null;
    if (!$emp) {
        continue;
    }
    $role = strtolower(trim((string) ($emp['role'] ?? '')));
    if ($role === 'parceiro') {
        continue;
    }
    $proposalRef = (string) ($meta['proposal_ref'] ?? '');
    $reason = (string) ($tx['reason'] ?? '');
    if ($proposalRef === '' && preg_match('/proposta\s+(\S+)/iu', $reason, $m)) {
        $proposalRef = $m[1];
    }
    if ($proposalRef === '') {
        continue;
    }
    if (str_contains($proposalRef, ';') || stripos($proposalRef, 'proposta ') === 0) {
        continue;
    }
    if (!preg_match('/^\d{10,}$/', $proposalRef)) {
        continue;
    }
    $reasonLower = strtolower($reason);
    if (!str_contains($reasonLower, 'baixa comissão') && !str_contains($reasonLower, 'baixa comissao')) {
        continue;
    }
    if (!str_contains($reasonLower, 'vendedor')) {
        continue;
    }

    // Já coberto por op estornada ou listada?
    $creditKey = rvc_credit_key($empId, $proposalRef);
    if (isset($handledCreditKeys[$creditKey])) {
        continue;
    }
    if (rvc_op_already_repaired_for($pdo, $proposalRef, $empId)) {
        if (!$dryRun) {
            if ($txHasMeta) {
                $meta['repair_reversed'] = true;
                $meta['repair_reversed_at'] = gmdate('c');
                $meta['repair_note'] = 'credit matched repaired baixa_comissao op';
                $updTx = $pdo->prepare('UPDATE transactions SET meta = :meta WHERE id = :id');
                $updTx->execute(['meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'id' => $tx['id']]);
            } else {
                $updTx = $pdo->prepare(
                    "UPDATE transactions SET reason = CONCAT(reason, ' [ESTORNADO via op repair-vendor-comissao]') WHERE id = :id"
                );
                $updTx->execute(['id' => $tx['id']]);
            }
        }
        continue;
    }
    $already = false;
    foreach ($wrong as $w) {
        if ((string) ($w['proposal_numero'] ?? '') === $proposalRef
            && (string) ($w['target_id'] ?? '') === $empId) {
            $already = true;
            break;
        }
    }
    if ($already) {
        continue;
    }

    // Só estorna se reason indica vendedor ou não há op com origem SIM
    $hasValidPartnerOp = false;
    $checkOps = $pdo->prepare(
        "SELECT data FROM finance_proposta_ops
         WHERE type = 'baixa_comissao' AND (proposal_numero = ? OR proposal_id = ?)"
    );
    $checkOps->execute([$proposalRef, $proposalRef]);
    while ($opRow = $checkOps->fetch(PDO::FETCH_ASSOC)) {
        $od = rvc_json_field($opRow['data'] ?? '');
        $origem = strtoupper(trim((string) ($od['origem_parceiro'] ?? '')));
        $cc = $od['conta_credito'] ?? [];
        if ($origem === 'SIM' && is_array($cc) && !empty($cc['ok']) && ($cc['label'] ?? '') === 'parceiro') {
            $hasValidPartnerOp = true;
            break;
        }
    }
    if ($hasValidPartnerOp) {
        continue;
    }

    $amount = rvc_money((float) ($tx['amount'] ?? 0));
    if ($amount <= 0) {
        continue;
    }

    $item = [
        'source' => 'transaction',
        'transaction_id' => $tx['id'],
        'proposal_numero' => $proposalRef,
        'target_id' => $empId,
        'target_name' => rvc_user_name($emp),
        'target_role' => $emp['role'] ?? null,
        'amount' => $amount,
        'created_at' => $tx['created_at'] ?? null,
        'reason' => 'crédito conta_credito_proposta em vendedor sem origem parceiro',
    ];
    $wrong[] = $item;
    $totalWrong += $amount;
    $handledCreditKeys[$creditKey] = true;

    if ($dryRun) {
        continue;
    }

    $estornoReason = "Estorno — comissão indevida (proposta {$proposalRef})";
    $estornoMeta = [
        'repair' => 'vendor_comissao',
        'repair_source_tx' => $tx['id'],
        'proposal_ref' => $proposalRef,
    ];

    try {
        $pdo->beginTransaction();
        $deduct = rvc_deduct_user($pdo, $empId, $amount, $estornoReason, $estornoMeta);
        if (!$deduct) {
            $pdo->rollBack();
            $skipped[] = ['transaction_id' => $tx['id'], 'error' => 'Falha ao debitar'];
            continue;
        }

        if ($txHasMeta) {
            $meta['repair_reversed'] = true;
            $meta['repair_reversed_at'] = gmdate('c');
            $meta['repair_debit_tx'] = $deduct['transaction_id'];
            $updTx = $pdo->prepare('UPDATE transactions SET meta = :meta WHERE id = :id');
            $updTx->execute(['meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'id' => $tx['id']]);
        } else {
            $updTx = $pdo->prepare(
                "UPDATE transactions SET reason = CONCAT(reason, ' [ESTORNADO repair-vendor-comissao]') WHERE id = :id"
            );
            $updTx->execute(['id' => $tx['id']]);
        }

        $propStmt = $pdo->prepare('SELECT id FROM proposals WHERE id = ? OR numero = ? LIMIT 1');
        $propStmt->execute([$proposalRef, $proposalRef]);
        $propRow = $propStmt->fetch(PDO::FETCH_ASSOC);
        if ($propRow) {
            rvc_clear_proposal_credit_meta($pdo, (string) $propRow['id'], $empId);
        }

        $pdo->commit();
        $reversed[] = array_merge($item, ['debit' => $deduct]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $skipped[] = ['transaction_id' => $tx['id'], 'error' => $e->getMessage()];
    }
}

soublu_json([
    'ok' => true,
    'dry_run' => $dryRun,
    'wrong_count' => count($wrong),
    'total_amount' => rvc_money($totalWrong),
    'wrong_credits' => $wrong,
    'reversed_count' => count($reversed),
    'reversed' => $reversed,
    'skipped' => $skipped,
]);
