<?php
/**
 * Remove do histórico créditos indevidos de comissão a vendedores e estornos do repair-vendor-comissao.
 * Apaga finance_proposta_ops (baixa_comissao), transactions (crédito + estorno) e limpa meta da proposta.
 * Saldos em users NÃO são alterados (crédito + estorno já se cancelam).
 *
 * GET ?dry_run=1   — diagnóstico (padrão)
 * GET ?apply=1     — executa exclusão
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

function pvc_json_field(mixed $raw): array
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

function pvc_money(float $n): float
{
    return round($n, 2);
}

function pvc_user_name(array $u): string
{
    return trim((string) ($u['name'] ?? $u['nome'] ?? $u['email'] ?? $u['id'] ?? ''));
}

function pvc_is_wrong_baixa_credit(array $opData): bool
{
    $cc = $opData['conta_credito'] ?? null;
    if (!is_array($cc) || empty($cc['ok'])) {
        return false;
    }
    $amount = (float) ($cc['delta'] ?? $cc['amount'] ?? 0);
    if ($amount <= 0) {
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

function pvc_should_purge_op(array $opData): bool
{
    if (!empty($opData['repair_vendor_comissao'])) {
        return true;
    }
    $cc = $opData['conta_credito'] ?? null;
    if (is_array($cc) && !empty($cc['repair_reversed'])) {
        return true;
    }
    return pvc_is_wrong_baixa_credit($opData);
}

function pvc_table_columns(PDO $pdo, string $table): array
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

function pvc_has_column(PDO $pdo, string $table, string $col): bool
{
    return in_array($col, pvc_table_columns($pdo, $table), true);
}

function pvc_tx_matches_proposal(array $tx, string $proposalRef, bool $txHasMeta): bool
{
    $reason = (string) ($tx['reason'] ?? '');
    if ($proposalRef !== '' && str_contains($reason, $proposalRef)) {
        return true;
    }
    if (!$txHasMeta) {
        return false;
    }
    $meta = pvc_json_field($tx['meta'] ?? '');
    $ref = (string) ($meta['proposal_ref'] ?? '');
    return $ref !== '' && $ref === $proposalRef;
}

function pvc_is_vendor_credit_tx(array $tx, array $usersById, bool $txHasMeta): bool
{
    $empId = (string) ($tx['employee_id'] ?? '');
    $emp = $usersById[$empId] ?? null;
    if (!$emp) {
        return false;
    }
    $role = strtolower(trim((string) ($emp['role'] ?? '')));
    if ($role === 'parceiro') {
        return false;
    }
    if ((string) ($tx['type'] ?? '') !== 'credit') {
        return false;
    }
    $reason = strtolower((string) ($tx['reason'] ?? ''));
    if (str_contains($reason, 'baixa comissão') || str_contains($reason, 'baixa comissao')) {
        return true;
    }
    if (!$txHasMeta) {
        return false;
    }
    $meta = pvc_json_field($tx['meta'] ?? '');
    return ($meta['kind'] ?? '') === 'conta_credito_proposta';
}

function pvc_is_repair_estorno_tx(array $tx, bool $txHasMeta): bool
{
    if ((string) ($tx['type'] ?? '') !== 'debit') {
        return false;
    }
    $reason = (string) ($tx['reason'] ?? '');
    if (str_contains($reason, 'Estorno — comissão indevida') || str_contains($reason, 'Estorno - comissao indevida')) {
        return true;
    }
    if (!$txHasMeta) {
        return false;
    }
    $meta = pvc_json_field($tx['meta'] ?? '');
    return ($meta['repair'] ?? '') === 'vendor_comissao';
}

function pvc_clear_proposal_meta(PDO $pdo, string $proposalId): ?array
{
    if (!pvc_has_column($pdo, 'proposals', 'meta')) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT id, numero, meta FROM proposals WHERE id = ? OR numero = ? LIMIT 1');
    $stmt->execute([$proposalId, $proposalId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }
    $meta = pvc_json_field($row['meta'] ?? '');
    $keys = [
        'comissao_conta_creditada',
        'comissao_conta_creditada_em',
        'comissao_conta_creditada_para',
        'comissao_conta_estornada_em',
        'comissao_conta_estornada_motivo',
    ];
    $removed = [];
    foreach ($keys as $k) {
        if (array_key_exists($k, $meta)) {
            $removed[$k] = $meta[$k];
            unset($meta[$k]);
        }
    }
    if ($removed === []) {
        return ['proposal_id' => $row['id'], 'numero' => $row['numero'] ?? null, 'cleared' => false];
    }
    $upd = $pdo->prepare('UPDATE proposals SET meta = :meta WHERE id = :id');
    $upd->execute(['meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'id' => $row['id']]);
    return ['proposal_id' => $row['id'], 'numero' => $row['numero'] ?? null, 'cleared' => true, 'removed_keys' => array_keys($removed)];
}

$dryRun = !isset($_GET['apply']) || (string) $_GET['apply'] !== '1';
$verifyOnly = isset($_GET['verify']) && (string) $_GET['verify'] === '1';

try {
    $pdo = soublu_pdo();
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'DB: ' . $e->getMessage()], 500);
}

$usersById = [];
foreach ($pdo->query('SELECT id, name, role, balance, points FROM users') as $u) {
    $usersById[(string) $u['id']] = $u;
}

$txHasMeta = pvc_has_column($pdo, 'transactions', 'meta');
$txSelect = $txHasMeta
    ? 'SELECT id, employee_id, type, amount, reason, meta, created_at'
    : 'SELECT id, employee_id, type, amount, reason, created_at';

$opsToDelete = [];
$proposalRefs = [];
$txIdsToDelete = [];
$txDetails = [];

/** Propostas conhecidas do reparo anterior (vendedores). */
$knownProposalNumeros = ['20260427233784', '20260527243491'];

$opsStmt = $pdo->query(
    "SELECT id, type, proposal_id, proposal_numero, data, created_at
     FROM finance_proposta_ops
     WHERE type = 'baixa_comissao'
     ORDER BY created_at ASC"
);

while ($row = $opsStmt->fetch(PDO::FETCH_ASSOC)) {
    $opData = pvc_json_field($row['data'] ?? '');
    if (!pvc_should_purge_op($opData)) {
        continue;
    }
    $proposalNumero = (string) ($row['proposal_numero'] ?? $opData['proposal_numero'] ?? '');
    $proposalId = (string) ($row['proposal_id'] ?? $opData['proposal_id'] ?? '');
    $cc = is_array($opData['conta_credito'] ?? null) ? $opData['conta_credito'] : [];
    $repair = is_array($opData['repair_vendor_comissao'] ?? null) ? $opData['repair_vendor_comissao'] : [];

    $opsToDelete[] = [
        'id' => $row['id'],
        'proposal_id' => $proposalId,
        'proposal_numero' => $proposalNumero,
        'created_at' => $row['created_at'] ?? null,
        'target_id' => (string) ($cc['targetId'] ?? ''),
        'target_name' => isset($usersById[(string) ($cc['targetId'] ?? '')])
            ? pvc_user_name($usersById[(string) $cc['targetId']])
            : null,
        'credit_amount' => pvc_money((float) ($cc['delta'] ?? 0)),
        'repair_debit_tx' => (string) ($cc['repair_debit_tx'] ?? $repair['debit_tx'] ?? ''),
        'origem_parceiro' => $opData['origem_parceiro'] ?? null,
    ];

    if ($proposalNumero !== '') {
        $proposalRefs[$proposalNumero] = true;
    }
    if ($proposalId !== '' && $proposalId !== $proposalNumero) {
        $proposalRefs[$proposalId] = true;
    }
    $debitTx = (string) ($cc['repair_debit_tx'] ?? $repair['debit_tx'] ?? '');
    if ($debitTx !== '') {
        $txIdsToDelete[$debitTx] = true;
    }
}

// Ops por número de proposta conhecido (mesmo sem marcador repair)
foreach ($knownProposalNumeros as $kn) {
    $proposalRefs[$kn] = true;
    $pStmt = $pdo->prepare(
        "SELECT id, type, proposal_id, proposal_numero, data, created_at
         FROM finance_proposta_ops
         WHERE type = 'baixa_comissao' AND (proposal_numero = ? OR proposal_id = ?)"
    );
    $pStmt->execute([$kn, $kn]);
    while ($row = $pStmt->fetch(PDO::FETCH_ASSOC)) {
        $already = false;
        foreach ($opsToDelete as $o) {
            if (($o['id'] ?? '') === ($row['id'] ?? '')) {
                $already = true;
                break;
            }
        }
        if ($already) {
            continue;
        }
        $opData = pvc_json_field($row['data'] ?? '');
        $cc = is_array($opData['conta_credito'] ?? null) ? $opData['conta_credito'] : [];
        $repair = is_array($opData['repair_vendor_comissao'] ?? null) ? $opData['repair_vendor_comissao'] : [];
        $targetId = (string) ($cc['targetId'] ?? '');
        $role = strtolower(trim((string) ($usersById[$targetId]['role'] ?? '')));
        if ($role === 'parceiro') {
            continue;
        }
        $opsToDelete[] = [
            'id' => $row['id'],
            'proposal_id' => (string) ($row['proposal_id'] ?? ''),
            'proposal_numero' => (string) ($row['proposal_numero'] ?? $kn),
            'created_at' => $row['created_at'] ?? null,
            'target_id' => $targetId,
            'target_name' => isset($usersById[$targetId]) ? pvc_user_name($usersById[$targetId]) : null,
            'credit_amount' => pvc_money((float) ($cc['delta'] ?? 0)),
            'repair_debit_tx' => (string) ($cc['repair_debit_tx'] ?? $repair['debit_tx'] ?? ''),
            'origem_parceiro' => $opData['origem_parceiro'] ?? null,
        ];
        $debitTx = (string) ($cc['repair_debit_tx'] ?? $repair['debit_tx'] ?? '');
        if ($debitTx !== '') {
            $txIdsToDelete[$debitTx] = true;
        }
    }
}

// Transações de crédito e estorno ligadas às propostas / repair
$txStmt = $pdo->query(
    "$txSelect
     FROM transactions
     WHERE type IN ('credit', 'debit')
       AND (
         reason LIKE '%Baixa comissão%'
         OR reason LIKE '%Baixa comissao%'
         OR reason LIKE '%Estorno — comissão indevida%'
         OR reason LIKE '%Estorno - comissao indevida%'"
    . ($txHasMeta ? " OR meta LIKE '%vendor_comissao%' OR meta LIKE '%conta_credito_proposta%'" : '')
    . ")
     ORDER BY created_at ASC"
);

while ($tx = $txStmt->fetch(PDO::FETCH_ASSOC)) {
    $txId = (string) ($tx['id'] ?? '');
    if ($txId === '') {
        continue;
    }

    $matched = isset($txIdsToDelete[$txId]);
    $proposalRef = '';
    if ($txHasMeta) {
        $meta = pvc_json_field($tx['meta'] ?? '');
        $proposalRef = (string) ($meta['proposal_ref'] ?? '');
    }
    if ($proposalRef === '') {
        $reason = (string) ($tx['reason'] ?? '');
        if (preg_match('/proposta\s+(\d{10,})/iu', $reason, $m)) {
            $proposalRef = $m[1];
        }
    }

    if (!$matched && $proposalRef !== '' && isset($proposalRefs[$proposalRef])) {
        if (pvc_is_vendor_credit_tx($tx, $usersById, $txHasMeta) || pvc_is_repair_estorno_tx($tx, $txHasMeta)) {
            $matched = true;
        }
    }

    if (!$matched && $proposalRef !== '' && in_array($proposalRef, $knownProposalNumeros, true)) {
        $empId = (string) ($tx['employee_id'] ?? '');
        $role = strtolower(trim((string) ($usersById[$empId]['role'] ?? '')));
        if ($role !== 'parceiro' && in_array((string) ($tx['type'] ?? ''), ['credit', 'debit'], true)) {
            $matched = true;
        }
    }

    if (!$matched && pvc_is_repair_estorno_tx($tx, $txHasMeta)) {
        if ($proposalRef !== '' && isset($proposalRefs[$proposalRef])) {
            $matched = true;
        }
    }

    if (!$matched) {
        continue;
    }

    $txIdsToDelete[$txId] = true;
    $empId = (string) ($tx['employee_id'] ?? '');
    $sign = ((string) ($tx['type'] ?? '') === 'credit') ? 1 : -1;
    $txDetails[] = [
        'id' => $txId,
        'type' => $tx['type'] ?? '',
        'employee_id' => $empId,
        'employee_name' => isset($usersById[$empId]) ? pvc_user_name($usersById[$empId]) : null,
        'amount' => pvc_money((float) ($tx['amount'] ?? 0)),
        'signed_delta' => pvc_money($sign * (float) ($tx['amount'] ?? 0)),
        'reason' => $tx['reason'] ?? '',
        'proposal_ref' => $proposalRef,
        'created_at' => $tx['created_at'] ?? null,
    ];
}

// Verificar saldo líquido por usuário (deve ser zero)
$netByUser = [];
foreach ($txDetails as $t) {
    $uid = (string) ($t['employee_id'] ?? '');
    if ($uid === '') {
        continue;
    }
    $netByUser[$uid] = pvc_money(($netByUser[$uid] ?? 0) + (float) ($t['signed_delta'] ?? 0));
}

$balancesBefore = [];
foreach (array_keys($netByUser) as $uid) {
    $u = $usersById[$uid] ?? null;
    $balancesBefore[$uid] = [
        'name' => $u ? pvc_user_name($u) : $uid,
        'balance' => pvc_money((float) ($u['points'] ?? $u['balance'] ?? 0)),
        'net_deleted_tx' => $netByUser[$uid] ?? 0,
    ];
}

$unsafeUsers = [];
foreach ($netByUser as $uid => $net) {
    if (abs($net) > 1.0) {
        $unsafeUsers[] = ['employee_id' => $uid, 'net_deleted_tx' => $net];
    }
}

function pvc_recalc_user_balance(PDO $pdo, string $empId, bool $txHasMeta): float
{
    $stmt = $pdo->prepare('SELECT type, amount FROM transactions WHERE employee_id = ?');
    $stmt->execute([$empId]);
    $bal = 0.0;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $amt = pvc_money((float) ($row['amount'] ?? 0));
        if ((string) ($row['type'] ?? '') === 'credit') {
            $bal += $amt;
        } elseif ((string) ($row['type'] ?? '') === 'debit') {
            $bal -= $amt;
        }
    }
    return pvc_money($bal);
}

function pvc_preview_balance_after_delete(float $current, float $netDeleted): float
{
    return pvc_money($current - $netDeleted);
}

$balanceAdjustments = [];
$affectedUserIds = [];
foreach ($txDetails as $t) {
    $eid = (string) ($t['employee_id'] ?? '');
    if ($eid !== '') {
        $affectedUserIds[$eid] = true;
    }
}
foreach ($opsToDelete as $op) {
    $eid = (string) ($op['target_id'] ?? '');
    if ($eid !== '') {
        $affectedUserIds[$eid] = true;
    }
}
foreach (array_keys($affectedUserIds) as $uid) {
    $u = $usersById[$uid] ?? null;
    $cur = pvc_money((float) ($u['points'] ?? $u['balance'] ?? 0));
    $net = $netByUser[$uid] ?? 0.0;
    $recalcNow = pvc_recalc_user_balance($pdo, $uid, $txHasMeta);
    $preview = pvc_money($recalcNow - $net);
    $balanceAdjustments[$uid] = [
        'name' => $u ? pvc_user_name($u) : $uid,
        'balance_before' => $cur,
        'balance_from_tx_sum' => $recalcNow,
        'net_deleted_tx' => $net,
        'balance_after' => $dryRun ? $preview : null,
        'reason' => 'recalcular saldo após apagar histórico',
    ];
}

$deletedOps = [];
$deletedTx = [];
$metaCleared = [];
$errors = [];

if (!$dryRun && $unsafeUsers === []) {
    try {
        $pdo->beginTransaction();

        foreach (array_keys($txIdsToDelete) as $txId) {
            $del = $pdo->prepare('DELETE FROM transactions WHERE id = ?');
            $del->execute([$txId]);
            $deletedTx[] = $txId;
        }

        $affectedUsers = [];
        foreach ($txDetails as $t) {
            $eid = (string) ($t['employee_id'] ?? '');
            if ($eid !== '') {
                $affectedUsers[$eid] = true;
            }
        }
        foreach ($opsToDelete as $op) {
            $eid = (string) ($op['target_id'] ?? '');
            if ($eid !== '') {
                $affectedUsers[$eid] = true;
            }
        }

        foreach ($opsToDelete as $op) {
            $del = $pdo->prepare('DELETE FROM finance_proposta_ops WHERE id = ?');
            $del->execute([$op['id']]);
            $deletedOps[] = $op['id'];
        }

        $clearedProposalIds = [];
        foreach ($opsToDelete as $op) {
            $ref = (string) ($op['proposal_id'] ?: $op['proposal_numero']);
            if ($ref === '' || isset($clearedProposalIds[$ref])) {
                continue;
            }
            $clearedProposalIds[$ref] = true;
            $res = pvc_clear_proposal_meta($pdo, $ref);
            if ($res) {
                $metaCleared[] = $res;
            }
        }
        foreach ($knownProposalNumeros as $kn) {
            if (isset($clearedProposalIds[$kn])) {
                continue;
            }
            $clearedProposalIds[$kn] = true;
            $res = pvc_clear_proposal_meta($pdo, $kn);
            if ($res) {
                $metaCleared[] = $res;
            }
        }

        foreach ($affectedUsers as $uid => $_) {
            $nb = pvc_recalc_user_balance($pdo, $uid, $txHasMeta);
            $upd = $pdo->prepare('UPDATE users SET balance = :bal, points = :pts WHERE id = :id');
            $upd->execute(['bal' => $nb, 'pts' => $nb, 'id' => $uid]);
            if (isset($balanceAdjustments[$uid])) {
                $balanceAdjustments[$uid]['balance_after'] = $nb;
            } else {
                $u = $usersById[$uid] ?? null;
                $balanceAdjustments[$uid] = [
                    'name' => $u ? pvc_user_name($u) : $uid,
                    'balance_before' => pvc_money((float) ($u['points'] ?? $u['balance'] ?? 0)),
                    'net_deleted_tx' => $netByUser[$uid] ?? 0,
                    'balance_after' => $nb,
                    'reason' => 'recalcular após apagar histórico',
                ];
            }
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $errors[] = $e->getMessage();
    }
}

$balancesAfter = [];
$verifyReport = null;
if ($verifyOnly) {
    $verifyReport = ['vendors' => [], 'remaining_ops' => [], 'remaining_txs' => [], 'proposal_meta' => []];
    $names = ['CLARA SOFFIA', 'GEOVANNA ARAUJO'];
    foreach ($pdo->query('SELECT id, name, role, balance, points FROM users') as $u) {
        $n = strtoupper((string) ($u['name'] ?? ''));
        foreach ($names as $needle) {
            if (!str_contains($n, $needle)) {
                continue;
            }
            $uid = (string) $u['id'];
            $verifyReport['vendors'][] = [
                'id' => $uid,
                'name' => pvc_user_name($u),
                'balance' => pvc_money((float) ($u['points'] ?? $u['balance'] ?? 0)),
                'tx_sum' => pvc_recalc_user_balance($pdo, $uid, $txHasMeta),
            ];
            try {
                $txSql = 'SELECT id, employee_id, type, amount, reason, created_at FROM transactions WHERE employee_id = ? AND ('
                    . "reason LIKE '%20260427233784%' OR reason LIKE '%20260527243491%'"
                    . " OR reason LIKE '%Baixa comissão%' OR reason LIKE '%Estorno — comissão indevida%'"
                    . ($txHasMeta ? " OR meta LIKE '%20260427233784%' OR meta LIKE '%20260527243491%'" : '')
                    . ') ORDER BY created_at DESC LIMIT 20';
                $txs = $pdo->prepare($txSql);
                $txs->execute([$uid]);
                while ($tx = $txs->fetch(PDO::FETCH_ASSOC)) {
                    $verifyReport['remaining_txs'][] = [
                        'id' => $tx['id'],
                        'employee_name' => pvc_user_name($u),
                        'type' => $tx['type'],
                        'amount' => $tx['amount'],
                        'reason' => $tx['reason'],
                    ];
                }
            } catch (Throwable $e) {
                $verifyReport['remaining_txs_error'] = $e->getMessage();
            }
            break;
        }
    }
    try {
        $ops = $pdo->query(
            "SELECT id, proposal_numero, data, created_at FROM finance_proposta_ops
             WHERE type = 'baixa_comissao'
               AND (proposal_numero IN ('20260427233784','20260527243491')
                    OR proposal_id IN ('20260427233784','20260527243491'))"
        );
        while ($op = $ops->fetch(PDO::FETCH_ASSOC)) {
            $verifyReport['remaining_ops'][] = $op;
        }
    } catch (Throwable $e) {
        $verifyReport['remaining_ops_error'] = $e->getMessage();
    }
    foreach ($knownProposalNumeros as $kn) {
        try {
            if (!pvc_has_column($pdo, 'proposals', 'meta')) {
                break;
            }
            $numCol = pvc_has_column($pdo, 'proposals', 'numero') ? 'numero' : null;
            if ($numCol) {
                $ps = $pdo->prepare("SELECT id, `$numCol` AS numero, meta FROM proposals WHERE `$numCol` = ? OR id = ? LIMIT 1");
                $ps->execute([$kn, $kn]);
            } else {
                $ps = $pdo->prepare('SELECT id, meta FROM proposals WHERE id = ? LIMIT 1');
                $ps->execute([$kn]);
            }
            $pr = $ps->fetch(PDO::FETCH_ASSOC);
            if ($pr) {
                $meta = pvc_json_field($pr['meta'] ?? '');
                $verifyReport['proposal_meta'][] = [
                    'id' => $pr['id'],
                    'numero' => $pr['numero'] ?? $kn,
                    'comissao_conta_creditada' => $meta['comissao_conta_creditada'] ?? null,
                    'comissao_conta_estornada_em' => $meta['comissao_conta_estornada_em'] ?? null,
                ];
            }
        } catch (Throwable $e) {
            $verifyReport['proposal_meta_error'] = $e->getMessage();
            break;
        }
    }
}

if (!$dryRun && $errors === []) {
    foreach (array_keys($netByUser) as $uid) {
        $stmt = $pdo->prepare('SELECT id, name, balance, points FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$uid]);
        $u = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($u) {
            $balancesAfter[$uid] = [
                'name' => pvc_user_name($u),
                'balance' => pvc_money((float) ($u['points'] ?? $u['balance'] ?? 0)),
            ];
        }
    }
}

soublu_json([
    'ok' => $errors === [],
    'dry_run' => $dryRun,
    'verify_only' => $verifyOnly,
    'ops_to_delete' => count($opsToDelete),
    'transactions_to_delete' => count($txIdsToDelete),
    'ops' => $opsToDelete,
    'transactions' => $txDetails,
    'balances_before' => $balancesBefore,
    'balance_adjustments' => $balanceAdjustments,
    'balances_after' => $balancesAfter,
    'unsafe_users' => $unsafeUsers,
    'deleted_ops' => $deletedOps,
    'deleted_transactions' => $deletedTx,
    'meta_cleared' => $metaCleared,
    'verify_report' => $verifyReport,
    'errors' => $errors,
]);
