<?php
/**
 * Remove transações específicas (conta corrente ELEVA + histórico global) e recalcula saldos.
 *
 * GET ?dry_run=1   — diagnóstico (padrão)
 * GET ?apply=1     — executa exclusão
 * GET ?discover=1  — lista usuários e txs recentes dos alvos (debug)
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

function pet_json_field(mixed $raw): array
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

function pet_money(float $n): float
{
    return round($n, 2);
}

function pet_user_name(array $u): string
{
    return trim((string) ($u['name'] ?? $u['nome'] ?? $u['email'] ?? $u['id'] ?? ''));
}

function pet_table_columns(PDO $pdo, string $table): array
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

function pet_has_column(PDO $pdo, string $table, string $col): bool
{
    return in_array($col, pet_table_columns($pdo, $table), true);
}

function pet_amount_close(float $a, float $b, float $tol = 0.02): bool
{
    return abs(pet_money($a) - pet_money($b)) <= $tol;
}

function pet_norm_reason(string $r): string
{
    return mb_strtolower(trim($r), 'UTF-8');
}

function pet_find_users(PDO $pdo): array
{
    $found = [];
    foreach ($pdo->query('SELECT id, name, role, balance, points, wallet_unit FROM users') as $u) {
        $n = mb_strtoupper(pet_user_name($u), 'UTF-8');
        $role = mb_strtolower(trim((string) ($u['role'] ?? '')), 'UTF-8');

        if (str_contains($n, 'ELEVA PROMOTORA')) {
            $found['eleva'] = $u;
        }
        if (str_contains($n, 'GEOVANNA ARAUJO')) {
            $found['geovanna'] = $u;
        }
        if (str_contains($n, 'CLARA SOFFIA')) {
            $found['clara'] = $u;
        }
        if (!isset($found['operacional0'])) {
            if (str_contains($n, 'OPERACIONAL 0') || str_contains($n, 'OPERACIONAL0')) {
                $found['operacional0'] = $u;
            } elseif ($role === 'operacional' && (str_contains($n, 'OPERACIONAL') || preg_match('/\b0\b/', $n))) {
                $found['operacional0'] = $u;
            }
        }
    }
    return $found;
}

/** Critérios das transações visíveis nos screenshots. */
function pet_target_specs(): array
{
    return [
        [
            'key' => 'eleva_saque_pix',
            'user_key' => 'eleva',
            'type' => 'debit',
            'amount' => 11524.58,
            'reason_contains' => ['saque pix', '5562996557728'],
        ],
        [
            'key' => 'eleva_proposta_20260619249907',
            'user_key' => 'eleva',
            'type' => 'credit',
            'amount' => 3591.37,
            'proposal' => '20260619249907',
        ],
        [
            'key' => 'eleva_proposta_20260610247456',
            'user_key' => 'eleva',
            'type' => 'credit',
            'amount' => 4469.55,
            'proposal' => '20260610247456',
        ],
        [
            'key' => 'eleva_bonus_campanha',
            'user_key' => 'eleva',
            'type' => 'credit',
            'amount' => 800.00,
            'reason_contains' => ['bônus', 'bonus', 'campanha'],
        ],
        [
            'key' => 'eleva_proposta_20260616248910',
            'user_key' => 'eleva',
            'type' => 'credit',
            'amount' => 2663.66,
            'proposal' => '20260616248910',
        ],
        [
            'key' => 'eleva_erro_debit',
            'user_key' => 'eleva',
            'type' => 'debit',
            'amount' => 999999999999.99,
            'reason_contains' => ['erro'],
        ],
        [
            'key' => 'eleva_erro_credit',
            'user_key' => 'eleva',
            'type' => 'credit',
            'amount' => 999999999999.99,
            'reason_contains' => ['3754'],
        ],
        [
            'key' => 'eleva_proposta_20260624250965',
            'user_key' => 'eleva',
            'type' => 'credit',
            'amount' => 1069.14,
            'proposal' => '20260624250965',
        ],
        [
            'key' => 'operacional_erro_sistemico',
            'user_key' => 'operacional0',
            'type' => 'debit',
            'amount' => 1256,
            'reason_contains' => ['erro sistem'],
        ],
        [
            'key' => 'geovanna_erro_sistemico',
            'user_key' => 'geovanna',
            'type' => 'debit',
            'amount' => 4830,
        ],
        [
            'key' => 'clara_debito',
            'user_key' => 'clara',
            'type' => 'debit',
            'amount' => 5361,
            'reason_contains' => ['debito', 'débito'],
        ],
    ];
}

function pet_proposal_in_tx(array $tx, bool $txHasMeta, string $proposal): bool
{
    $reason = (string) ($tx['reason'] ?? '');
    if ($proposal !== '' && str_contains($reason, $proposal)) {
        return true;
    }
    if (!$txHasMeta) {
        return false;
    }
    $meta = pet_json_field($tx['meta'] ?? '');
    return (string) ($meta['proposal_ref'] ?? '') === $proposal;
}

function pet_tx_matches_spec(array $tx, array $spec, string $empId, bool $txHasMeta): bool
{
    if ((string) ($tx['employee_id'] ?? '') !== $empId) {
        return false;
    }
    if ((string) ($tx['type'] ?? '') !== (string) ($spec['type'] ?? '')) {
        return false;
    }
    $amt = (float) ($tx['amount'] ?? 0);
    if (!pet_amount_close($amt, (float) ($spec['amount'] ?? 0))) {
        return false;
    }

    if (!empty($spec['proposal'])) {
        if (!pet_proposal_in_tx($tx, $txHasMeta, (string) $spec['proposal'])) {
            return false;
        }
    }

    if (!empty($spec['reason_contains']) && is_array($spec['reason_contains'])) {
        $reason = pet_norm_reason((string) ($tx['reason'] ?? ''));
        $ok = false;
        foreach ($spec['reason_contains'] as $needle) {
            if (str_contains($reason, pet_norm_reason((string) $needle))) {
                $ok = true;
                break;
            }
        }
        if (!$ok) {
            return false;
        }
    }

    return true;
}

function pet_recalc_user_balance(PDO $pdo, string $empId): float
{
    $stmt = $pdo->prepare('SELECT type, amount FROM transactions WHERE employee_id = ?');
    $stmt->execute([$empId]);
    $bal = 0.0;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $amt = pet_money((float) ($row['amount'] ?? 0));
        if ((string) ($row['type'] ?? '') === 'credit') {
            $bal += $amt;
        } elseif ((string) ($row['type'] ?? '') === 'debit') {
            $bal -= $amt;
        }
    }
    return pet_money($bal);
}

function pet_clear_proposal_meta(PDO $pdo, string $proposalRef): ?array
{
    if (!pet_has_column($pdo, 'proposals', 'meta')) {
        return null;
    }
    $numCol = pet_has_column($pdo, 'proposals', 'numero') ? 'numero' : null;
    if ($numCol) {
        $stmt = $pdo->prepare("SELECT id, `$numCol` AS numero, meta FROM proposals WHERE `$numCol` = ? OR id = ? LIMIT 1");
        $stmt->execute([$proposalRef, $proposalRef]);
    } else {
        $stmt = $pdo->prepare('SELECT id, meta FROM proposals WHERE id = ? LIMIT 1');
        $stmt->execute([$proposalRef]);
    }
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return ['proposal_ref' => $proposalRef, 'found' => false];
    }
    $meta = pet_json_field($row['meta'] ?? '');
    $keys = [
        'comissao_conta_creditada',
        'comissao_conta_creditada_em',
        'comissao_conta_creditada_para',
        'comissao_conta_estornada_em',
        'comissao_conta_estornada_motivo',
        'conta_credito_parceiro',
        'conta_credito_valor',
    ];
    $removed = [];
    foreach ($keys as $k) {
        if (array_key_exists($k, $meta)) {
            $removed[$k] = $meta[$k];
            unset($meta[$k]);
        }
    }
    if ($removed === []) {
        return [
            'proposal_id' => $row['id'],
            'numero' => $row['numero'] ?? $proposalRef,
            'cleared' => false,
        ];
    }
    $upd = $pdo->prepare('UPDATE proposals SET meta = :meta WHERE id = :id');
    $upd->execute(['meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'id' => $row['id']]);
    return [
        'proposal_id' => $row['id'],
        'numero' => $row['numero'] ?? $proposalRef,
        'cleared' => true,
        'removed_keys' => array_keys($removed),
    ];
}

$dryRun = !isset($_GET['apply']) || (string) $_GET['apply'] !== '1';
$discover = isset($_GET['discover']) && (string) $_GET['discover'] === '1';

try {
    $pdo = soublu_pdo();
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'DB: ' . $e->getMessage()], 500);
}

$users = pet_find_users($pdo);
$txHasMeta = pet_has_column($pdo, 'transactions', 'meta');
$txSelect = $txHasMeta
    ? 'SELECT id, employee_id, type, amount, reason, meta, created_at'
    : 'SELECT id, employee_id, type, amount, reason, created_at';

$missingUsers = [];
foreach (['eleva', 'operacional0', 'geovanna', 'clara'] as $uk) {
    if (!isset($users[$uk])) {
        $missingUsers[] = $uk;
    }
}

if (!isset($users['operacional0'])) {
    $opStmt = $pdo->query(
        "$txSelect FROM transactions
         WHERE type = 'debit'
           AND amount BETWEEN 1255.99 AND 1256.01
           AND (reason LIKE '%erro sistem%' OR reason LIKE '%erro sistêm%')
         ORDER BY created_at DESC
         LIMIT 3"
    );
    while ($tx = $opStmt->fetch(PDO::FETCH_ASSOC)) {
        $eid = (string) ($tx['employee_id'] ?? '');
        if ($eid === '') {
            continue;
        }
        $uStmt = $pdo->prepare('SELECT id, name, role, balance, points, wallet_unit FROM users WHERE id = ? LIMIT 1');
        $uStmt->execute([$eid]);
        $u = $uStmt->fetch(PDO::FETCH_ASSOC);
        if ($u) {
            $users['operacional0'] = $u;
            $missingUsers = array_values(array_filter($missingUsers, static fn ($k) => $k !== 'operacional0'));
            break;
        }
    }
}

if ($discover) {
    $disc = ['users' => [], 'recent_txs' => [], 'operacional_candidates' => []];
    foreach ($users as $key => $u) {
        $disc['users'][$key] = [
            'id' => $u['id'],
            'name' => pet_user_name($u),
            'role' => $u['role'] ?? '',
            'balance' => pet_money((float) ($u['points'] ?? $u['balance'] ?? 0)),
        ];
        $stmt = $pdo->prepare("$txSelect FROM transactions WHERE employee_id = ? ORDER BY created_at DESC LIMIT 30");
        $stmt->execute([(string) $u['id']]);
        while ($tx = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $disc['recent_txs'][] = [
                'user_key' => $key,
                'id' => $tx['id'],
                'type' => $tx['type'],
                'amount' => $tx['amount'],
                'reason' => $tx['reason'],
                'created_at' => $tx['created_at'],
            ];
        }
    }
    foreach ($pdo->query("SELECT id, name, role, balance, points FROM users WHERE role = 'operacional' OR name LIKE '%peracional%'") as $u) {
        $disc['operacional_candidates'][] = [
            'id' => $u['id'],
            'name' => pet_user_name($u),
            'role' => $u['role'] ?? '',
            'balance' => pet_money((float) ($u['points'] ?? $u['balance'] ?? 0)),
        ];
    }
    soublu_json(['ok' => true, 'discover' => $disc, 'missing_users' => $missingUsers]);
}

$specs = pet_target_specs();
$matched = [];
$matchedIds = [];
$unmatchedSpecs = [];

$userIds = [];
foreach ($users as $u) {
    $userIds[(string) $u['id']] = true;
}

$allTargetIds = [];
foreach ($users as $u) {
    $allTargetIds[] = (string) $u['id'];
}

$txByUser = [];
if ($allTargetIds !== []) {
    $placeholders = implode(',', array_fill(0, count($allTargetIds), '?'));
    $stmt = $pdo->prepare("$txSelect FROM transactions WHERE employee_id IN ($placeholders) ORDER BY created_at DESC");
    $stmt->execute($allTargetIds);
    while ($tx = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $eid = (string) ($tx['employee_id'] ?? '');
        $txByUser[$eid][] = $tx;
    }
}

foreach ($specs as $spec) {
    $uk = (string) ($spec['user_key'] ?? '');
    if (!isset($users[$uk])) {
        $unmatchedSpecs[] = ['spec' => $spec['key'], 'reason' => 'user_not_found'];
        continue;
    }
    $empId = (string) $users[$uk]['id'];
    $hit = null;
    foreach ($txByUser[$empId] ?? [] as $tx) {
        $txId = (string) ($tx['id'] ?? '');
        if ($txId === '' || isset($matchedIds[$txId])) {
            continue;
        }
        if (pet_tx_matches_spec($tx, $spec, $empId, $txHasMeta)) {
            $hit = $tx;
            break;
        }
    }
    if (!$hit) {
        $unmatchedSpecs[] = ['spec' => $spec['key'], 'reason' => 'tx_not_found', 'user' => pet_user_name($users[$uk])];
        continue;
    }
    $txId = (string) $hit['id'];
    $matchedIds[$txId] = true;
    $sign = ((string) ($hit['type'] ?? '') === 'credit') ? 1 : -1;
    $matched[] = [
        'spec_key' => $spec['key'],
        'id' => $txId,
        'employee_id' => $empId,
        'employee_name' => pet_user_name($users[$uk]),
        'type' => $hit['type'],
        'amount' => pet_money((float) ($hit['amount'] ?? 0)),
        'signed_delta' => pet_money($sign * (float) ($hit['amount'] ?? 0)),
        'reason' => $hit['reason'] ?? '',
        'created_at' => $hit['created_at'] ?? null,
    ];
}

$proposalRefs = [
    '20260619249907',
    '20260610247456',
    '20260616248910',
    '20260624250965',
];

$opsToDelete = [];
try {
    $opsStmt = $pdo->query(
        "SELECT id, type, proposal_id, proposal_numero, data, created_at
         FROM finance_proposta_ops
         WHERE proposal_numero IN ('" . implode("','", $proposalRefs) . "')
            OR proposal_id IN ('" . implode("','", $proposalRefs) . "')"
    );
    while ($row = $opsStmt->fetch(PDO::FETCH_ASSOC)) {
        $opsToDelete[] = [
            'id' => $row['id'],
            'type' => $row['type'] ?? '',
            'proposal_numero' => $row['proposal_numero'] ?? '',
            'created_at' => $row['created_at'] ?? null,
        ];
    }
} catch (Throwable $e) {
    $opsToDelete = ['error' => $e->getMessage()];
}

$withdrawalsToDelete = [];
if (isset($users['eleva']) && pet_has_column($pdo, 'withdrawals', 'pix_key')) {
    $elevaId = (string) $users['eleva']['id'];
    foreach ($matched as $t) {
        if (($t['spec_key'] ?? '') !== 'eleva_saque_pix') {
            continue;
        }
        $createdAt = (string) ($t['created_at'] ?? '');
        $wdStmt = $pdo->prepare(
            'SELECT id, employee_id, amount, pix_key, pix_key_type, status, created_at
             FROM withdrawals
             WHERE employee_id = ?
               AND pix_key LIKE ?
               AND amount BETWEEN ? AND ?
               AND ABS(TIMESTAMPDIFF(SECOND, created_at, ?)) <= 5
             LIMIT 1'
        );
        $wdStmt->execute([$elevaId, '%5562996557728%', 11500, 11520, $createdAt]);
        $wd = $wdStmt->fetch(PDO::FETCH_ASSOC);
        if ($wd) {
            $withdrawalsToDelete[] = $wd;
        }
    }
}

$netByUser = [];
foreach ($matched as $t) {
    $uid = (string) ($t['employee_id'] ?? '');
    if ($uid === '') {
        continue;
    }
    $netByUser[$uid] = pet_money(($netByUser[$uid] ?? 0) + (float) ($t['signed_delta'] ?? 0));
}

$balanceAdjustments = [];
foreach (array_keys($netByUser) as $uid) {
    $u = null;
    foreach ($users as $usr) {
        if ((string) $usr['id'] === $uid) {
            $u = $usr;
            break;
        }
    }
    $cur = pet_money((float) ($u['points'] ?? $u['balance'] ?? 0));
    $recalcNow = pet_recalc_user_balance($pdo, $uid);
    $net = $netByUser[$uid] ?? 0.0;
    $balanceAdjustments[$uid] = [
        'name' => $u ? pet_user_name($u) : $uid,
        'balance_before' => $cur,
        'balance_from_tx_sum' => $recalcNow,
        'net_deleted_tx' => $net,
        'balance_after' => $dryRun ? pet_money($recalcNow - $net) : null,
    ];
}

$deletedTx = [];
$deletedOps = [];
$deletedWds = [];
$metaCleared = [];
$errors = [];

$canApply = $unmatchedSpecs === [] && $matched !== [];

if (!$dryRun && $canApply) {
    try {
        $pdo->beginTransaction();

        foreach ($matched as $t) {
            $del = $pdo->prepare('DELETE FROM transactions WHERE id = ?');
            $del->execute([(string) $t['id']]);
            $deletedTx[] = $t['id'];
        }

        if (is_array($opsToDelete) && !isset($opsToDelete['error'])) {
            foreach ($opsToDelete as $op) {
                if (!is_array($op) || empty($op['id'])) {
                    continue;
                }
                $del = $pdo->prepare('DELETE FROM finance_proposta_ops WHERE id = ?');
                $del->execute([(string) $op['id']]);
                $deletedOps[] = $op['id'];
            }
        }

        foreach ($withdrawalsToDelete as $wd) {
            $del = $pdo->prepare('DELETE FROM withdrawals WHERE id = ?');
            $del->execute([(string) $wd['id']]);
            $deletedWds[] = $wd['id'];
        }

        foreach ($proposalRefs as $ref) {
            $res = pet_clear_proposal_meta($pdo, $ref);
            if ($res) {
                $metaCleared[] = $res;
            }
        }

        foreach (array_keys($netByUser) as $uid) {
            $nb = pet_recalc_user_balance($pdo, $uid);
            $upd = $pdo->prepare('UPDATE users SET balance = :bal, points = :pts WHERE id = :id');
            $upd->execute(['bal' => $nb, 'pts' => $nb, 'id' => $uid]);
            if (isset($balanceAdjustments[$uid])) {
                $balanceAdjustments[$uid]['balance_after'] = $nb;
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

soublu_json([
    'ok' => $errors === [] && ($dryRun || $canApply),
    'dry_run' => $dryRun,
    'can_apply' => $canApply,
    'users_found' => array_map(static fn ($u) => [
        'id' => $u['id'],
        'name' => pet_user_name($u),
        'role' => $u['role'] ?? '',
        'balance' => pet_money((float) ($u['points'] ?? $u['balance'] ?? 0)),
    ], $users),
    'missing_users' => $missingUsers,
    'matched_count' => count($matched),
    'transactions' => $matched,
    'unmatched_specs' => $unmatchedSpecs,
    'ops_to_delete' => is_array($opsToDelete) && !isset($opsToDelete['error']) ? $opsToDelete : [],
    'withdrawals_to_delete' => $withdrawalsToDelete,
    'balance_adjustments' => $balanceAdjustments,
    'deleted_transactions' => $deletedTx,
    'deleted_ops' => $deletedOps,
    'deleted_withdrawals' => $deletedWds,
    'meta_cleared' => $metaCleared,
    'errors' => $errors,
]);
