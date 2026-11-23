<?php
/**
 * Restaura perfil (role), departamento e permissões em users a partir de rh_employees.
 *
 * GET ?dry_run=1   — diagnóstico (padrão)
 * GET ?apply=1     — aplica correções
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

const RUR_PROTECTED = ['master', 'fundador'];

/** Overrides conhecidos (id users → perfil canônico). */
const RUR_CANONICAL = [
    'fund_rodrigo' => ['role' => 'fundador'],
    'sup_8651d3c45428' => ['role' => 'supervisor'],
    'sup_7c8d23343c38' => ['role' => 'supervisor'],
    'umpe2e5ghmxu6b' => ['role' => 'backoffice'],
    'rh01' => ['role' => 'rh'],
    'umpfh3i7tvog7c' => ['role' => 'financeiro', 'department' => 'Financeiro'],
    'ger_sak01' => ['role' => 'gerente', 'department' => 'Administração'],
];

function rur_norm_role(?string $role): string
{
    return strtolower(trim((string) $role));
}

function rur_is_garbage_role(string $role): bool
{
    return $role === '' || (bool) preg_match('/^[a-f0-9]{16,}$/i', $role);
}

function rur_json_field(mixed $raw): ?array
{
    if (is_array($raw)) {
        return $raw;
    }
    if (!is_string($raw) || trim($raw) === '') {
        return null;
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : null;
}

function rur_digits(?string $v): string
{
    return preg_replace('/\D+/', '', (string) $v) ?? '';
}

function rur_norm_dept(?string $dept): string
{
    return trim((string) $dept);
}

function rur_dept_eq(?string $a, ?string $b): bool
{
    $na = mb_strtolower(rur_norm_dept($a), 'UTF-8');
    $nb = mb_strtolower(rur_norm_dept($b), 'UTF-8');
    if ($na === $nb) {
        return true;
    }
    $sa = preg_replace('/[^a-z0-9]/u', '', $na) ?? '';
    $sb = preg_replace('/[^a-z0-9]/u', '', $nb) ?? '';
    return $sa !== '' && $sa === $sb;
}

function rur_dept_fix_needed(?string $cur, ?string $target): bool
{
    if ($target === null || rur_norm_dept($target) === '') {
        return false;
    }
    if (rur_dept_eq($cur, $target)) {
        return false;
    }
    if (str_contains($target, '?') || str_contains($target, '├')) {
        return false;
    }
    return true;
}

function rur_infer_role_from_id(string $id): ?string
{
    $id = strtolower($id);
    if (str_starts_with($id, 'fund_')) {
        return 'fundador';
    }
    if (str_starts_with($id, 'master')) {
        return 'master';
    }
    if (str_starts_with($id, 'sup_')) {
        return 'supervisor';
    }
    if (str_starts_with($id, 'vnd_')) {
        return 'vendedor';
    }
    if (str_starts_with($id, 'prt_')) {
        return 'portaria';
    }
    if ($id === 'rh01' || $id === 'umqz9v680b1nbn') {
        return 'rh';
    }
    if (str_starts_with($id, 'ger_') || $id === 'ger01') {
        return 'gerente';
    }
    if ($id === 'dir01') {
        return 'diretoria';
    }
    if ($id === 'jur01') {
        return 'juridico';
    }
    if ($id === 'oper01') {
        return 'operacional';
    }
    if ($id === 'ouv01') {
        return 'ouvidoria';
    }
    if ($id === 'ump7c8hn7aowp3' || $id === 'umpmyai0rh6xky') {
        return 'sup_backoffice';
    }
    return null;
}

function rur_role_from_department(string $dept, string $id, string $currentRole): ?string
{
    if (!in_array($currentRole, ['vendedor', 'employee', ''], true)) {
        return null;
    }
    $d = mb_strtolower(rur_norm_dept($dept), 'UTF-8');
    $d = str_replace(['ã', 'á', 'â', 'ç'], ['a', 'a', 'a', 'c'], $d);
    if ($d === 'financeiro') {
        return 'financeiro';
    }
    if (($d === 'administracao' || $d === 'administração') && str_starts_with(strtolower($id), 'ger_')) {
        return 'gerente';
    }
    return null;
}

/** Permissões padrão por perfil (espelha presets do rh-manager.js). */
function rur_permissions_for_role(string $role): array
{
    $base = [
        'canMasterPanel' => false,
        'canSaques' => false,
        'canCadFunc' => false,
        'canProposta' => true,
        'canClientes' => true,
        'canPartnerOpsHub' => false,
        'canRanking' => true,
        'canLoja' => true,
        'canSimulacao' => true,
        'canChamados' => true,
        'canSupervisorPanel' => false,
        'canPartnerDashboard' => false,
        'canLeadsManager' => true,
        'canTreinamentos' => true,
        'canTimIndicacao' => false,
        'canTimEsteira' => false,
        'canContestacao' => false,
        'canFiscalParceiro' => false,
        'canMarketplaceBlu' => false,
        'canFornecedorFinanceiro' => false,
        'canContaCorrente' => false,
    ];
    $role = rur_norm_role($role);
    if (in_array($role, ['master', 'fundador', 'desenvolvedor', 'diretoria'], true)) {
        return array_fill_keys(array_keys($base), true);
    }
    if ($role === 'financeiro' || $role === 'financial') {
        return array_merge($base, [
            'canSaques' => true,
            'canFiscalParceiro' => true,
            'canFornecedorFinanceiro' => true,
            'canContaCorrente' => true,
        ]);
    }
    if (in_array($role, ['gerente', 'gerencia', 'admin'], true)) {
        return array_merge($base, [
            'canSupervisorPanel' => true,
            'canSaques' => true,
            'canFiscalParceiro' => true,
            'canFornecedorFinanceiro' => true,
            'canContaCorrente' => true,
            'canCadFunc' => true,
            'canMarketplaceBlu' => true,
        ]);
    }
    if ($role === 'supervisor') {
        return array_merge($base, ['canSupervisorPanel' => true]);
    }
    if ($role === 'backoffice') {
        return array_merge($base, ['canTimEsteira' => true, 'canContestacao' => true]);
    }
    if ($role === 'rh') {
        return array_merge($base, [
            'canCadFunc' => true,
            'canProposta' => false,
            'canClientes' => false,
            'canRanking' => false,
            'canLoja' => false,
            'canSimulacao' => false,
            'canLeadsManager' => false,
        ]);
    }
    return $base;
}

function rur_id_prefix_authoritative(string $id): bool
{
    $id = strtolower($id);
    return str_starts_with($id, 'sup_')
        || str_starts_with($id, 'fund_')
        || str_starts_with($id, 'master')
        || str_starts_with($id, 'ger_')
        || $id === 'rh01';
}

/**
 * @return array{0:?string,1:?string,2:bool,3:bool} [role, source, fixUserRole, fixRhRole]
 */
function rur_resolve_target_role(string $id, string $currentRole, ?string $rhRole, ?string $canonicalRole): array
{
    $inferred = rur_infer_role_from_id($id);

    if ($canonicalRole) {
        $fixUser = $canonicalRole !== $currentRole;
        $fixRh = $rhRole !== $canonicalRole;
        return [$canonicalRole, 'canonical', $fixUser, $fixRh];
    }

    if (in_array($currentRole, RUR_PROTECTED, true)) {
        $fixRh = $rhRole !== null && $rhRole !== $currentRole;
        return [$currentRole, 'protected_user', false, $fixRh];
    }

    if ($inferred && rur_id_prefix_authoritative($id)) {
        if ($currentRole === $inferred && $rhRole !== null && $rhRole !== $inferred) {
            return [$inferred, 'inferred_id', false, true];
        }
        if ($currentRole !== $inferred) {
            return [$inferred, 'inferred_id', true, true];
        }
        if ($rhRole === null || rur_is_garbage_role($rhRole)) {
            return [$inferred, 'inferred_id', false, true];
        }
    }

    if ($inferred === 'rh' && $currentRole === 'rh' && $rhRole === 'vendedor') {
        return ['rh', 'user_authoritative', false, true];
    }

    if ($rhRole !== null && !rur_is_garbage_role($rhRole)) {
        return [$rhRole, 'rh_employees', $rhRole !== $currentRole, $rhRole !== $currentRole];
    }
    if ($inferred !== null && $inferred !== $currentRole) {
        return [$inferred, 'inferred_id', true, true];
    }

    return [$currentRole, 'unchanged', false, false];
}

function rur_role_from_rh(array $rh): ?string
{
    foreach (['system_role', 'role'] as $key) {
        $r = rur_norm_role($rh[$key] ?? '');
        if (!rur_is_garbage_role($r)) {
            return $r;
        }
    }
    return null;
}

function rur_dept_from_rh(array $rh): ?string
{
    $d = rur_norm_dept($rh['departamento'] ?? '');
    return $d !== '' ? $d : null;
}

function rur_pick_permissions(array $rhMatch): ?array
{
    foreach ($rhMatch as $rh) {
        $p = rur_json_field($rh['permissions'] ?? null);
        if (is_array($p) && $p) {
            return $p;
        }
    }
    return null;
}

function rur_pick_rh_row(array $matches): ?array
{
    if (!$matches) {
        return null;
    }
    usort($matches, static function (array $a, array $b): int {
        $ar = rur_role_from_rh($a) ? 1 : 0;
        $br = rur_role_from_rh($b) ? 1 : 0;
        if ($ar !== $br) {
            return $br <=> $ar;
        }
        $ad = rur_dept_from_rh($a) ? 1 : 0;
        $bd = rur_dept_from_rh($b) ? 1 : 0;
        return $bd <=> $ad;
    });
    return $matches[0];
}

function rur_rh_matches_for_user(array $u, array $rhByUserId, array $rhByCpf, array $rhByEmail, array $rhById = []): array
{
    $id = (string) ($u['id'] ?? '');
    $out = [];
    if ($id !== '' && isset($rhByUserId[$id])) {
        $out = array_merge($out, $rhByUserId[$id]);
    }
    if ($id !== '' && isset($rhById[$id])) {
        $out = array_merge($out, $rhById[$id]);
    }
    $cpf = rur_digits($u['cpf'] ?? '');
    if ($cpf !== '' && isset($rhByCpf[$cpf])) {
        $out = array_merge($out, $rhByCpf[$cpf]);
    }
    $email = strtolower(trim((string) ($u['email'] ?? '')));
    if ($email !== '' && isset($rhByEmail[$email])) {
        $out = array_merge($out, $rhByEmail[$email]);
    }
    $seen = [];
    $uniq = [];
    foreach ($out as $row) {
        $rid = (string) ($row['id'] ?? '');
        if ($rid === '' || isset($seen[$rid])) {
            continue;
        }
        $seen[$rid] = true;
        $uniq[] = $row;
    }
    return $uniq;
}

try {
    $pdo = soublu_pdo();
    $apply = isset($_GET['apply']) && (string) $_GET['apply'] === '1';

    $users = $pdo->query(
        'SELECT id, name, email, cpf, role, permissions, admin_id, department FROM users'
    )->fetchAll(PDO::FETCH_ASSOC);

    $rhRows = [];
    try {
        $rhRows = $pdo->query(
            'SELECT id, nome, cpf, email, email_pessoal, user_id, role, system_role, permissions, departamento, supervisor_id
             FROM rh_employees'
        )->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        soublu_json(['ok' => false, 'error' => 'Tabela rh_employees indisponível: ' . $e->getMessage()], 500);
    }

    $rhByUserId = [];
    $rhById = [];
    $rhByCpf = [];
    $rhByEmail = [];
    foreach ($rhRows as $row) {
        $uid = trim((string) ($row['user_id'] ?? ''));
        if ($uid !== '') {
            $rhByUserId[$uid][] = $row;
        }
        $rid = trim((string) ($row['id'] ?? ''));
        if ($rid !== '') {
            $rhById[$rid][] = $row;
        }
        $cpf = rur_digits($row['cpf'] ?? '');
        if ($cpf !== '') {
            $rhByCpf[$cpf][] = $row;
        }
        foreach (['email', 'email_pessoal'] as $ek) {
            $em = strtolower(trim((string) ($row[$ek] ?? '')));
            if ($em !== '') {
                $rhByEmail[$em][] = $row;
            }
        }
    }

    $fixes = [];
    foreach ($users as $u) {
        $id = (string) ($u['id'] ?? '');
        if ($id === '') {
            continue;
        }

        $currentRole = rur_norm_role($u['role'] ?? '');
        $currentDept = rur_norm_dept($u['department'] ?? '');

        $canonicalRole = null;
        $canonicalDept = null;
        if (isset(RUR_CANONICAL[$id])) {
            $canon = RUR_CANONICAL[$id];
            if (!empty($canon['role'])) {
                $canonicalRole = rur_norm_role($canon['role']);
            }
            if (!empty($canon['department'])) {
                $canonicalDept = rur_norm_dept($canon['department']);
            }
        }

        $rhMatch = rur_rh_matches_for_user($u, $rhByUserId, $rhByCpf, $rhByEmail, $rhById);
        $rh = rur_pick_rh_row($rhMatch);
        $rhRole = $rh ? rur_role_from_rh($rh) : null;
        $rhDept = $rh ? rur_dept_from_rh($rh) : null;

        [$targetRole, $source, $fixUserRole, $fixRhRole] = rur_resolve_target_role(
            $id,
            $currentRole,
            $rhRole,
            $canonicalRole
        );

        if ($targetRole === $currentRole || $targetRole === null) {
            $deptRole = rur_role_from_department($currentDept, $id, $currentRole);
            if ($deptRole && $deptRole !== $currentRole) {
                $targetRole = $deptRole;
                $fixUserRole = true;
                $fixRhRole = true;
                $source = $source ?: 'department';
            }
        }

        $targetDept = $canonicalDept ?? $rhDept ?? ($currentDept !== '' ? $currentDept : null);
        $deptChange = rur_dept_fix_needed($currentDept, $targetDept);

        if (!$fixUserRole && !$deptChange && !$fixRhRole) {
            continue;
        }

        $toRole = $fixUserRole && $targetRole ? $targetRole : $currentRole;
        $toDept = $deptChange && $targetDept ? $targetDept : $currentDept;

        $permPatch = ($fixUserRole && $targetRole) ? rur_permissions_for_role($targetRole) : null;
        if ($permPatch === null && $fixUserRole && $rh) {
            $permPatch = rur_pick_permissions($rhMatch);
        }
        $fixes[] = [
            'user_id' => $id,
            'name' => $u['name'] ?? '',
            'email' => $u['email'] ?? '',
            'from_role' => $currentRole,
            'to_role' => $toRole,
            'from_department' => $currentDept,
            'to_department' => $toDept,
            'source' => $source,
            'rh_id' => $rh['id'] ?? null,
            'fix_user_role' => $fixUserRole,
            'fix_rh_role' => $fixRhRole,
            'restore_permissions' => $permPatch !== null && $fixUserRole,
        ];
    }

    $applied = [];
    $rhFixed = [];
    if ($apply && $fixes) {
        foreach ($fixes as $fix) {
            $permPatch = null;
            if (!empty($fix['fix_user_role']) && !empty($fix['to_role'])) {
                $permPatch = rur_permissions_for_role((string) $fix['to_role']);
            }
            if ($permPatch === null && !empty($fix['restore_permissions'])) {
                $rhMatch = rur_rh_matches_for_user(
                    ['id' => $fix['user_id'], 'cpf' => '', 'email' => $fix['email']],
                    $rhByUserId,
                    $rhByCpf,
                    $rhByEmail,
                    $rhById
                );
                $permPatch = rur_pick_permissions($rhMatch);
            }

            if ($permPatch !== null) {
                $upd = $pdo->prepare(
                    'UPDATE users SET role = :role, department = :department, permissions = :permissions WHERE id = :id LIMIT 1'
                );
                $upd->execute([
                    ':role' => $fix['to_role'],
                    ':department' => $fix['to_department'],
                    ':permissions' => json_encode($permPatch, JSON_UNESCAPED_UNICODE),
                    ':id' => $fix['user_id'],
                ]);
            } elseif (!empty($fix['fix_user_role']) || $fix['from_department'] !== $fix['to_department']) {
                $upd = $pdo->prepare(
                    'UPDATE users SET role = :role, department = :department WHERE id = :id LIMIT 1'
                );
                $upd->execute([
                    ':role' => $fix['to_role'],
                    ':department' => $fix['to_department'],
                    ':id' => $fix['user_id'],
                ]);
            }

            if (!empty($fix['rh_id']) && !empty($fix['fix_rh_role']) && !empty($fix['to_role'])) {
                $pdo->prepare(
                    'UPDATE rh_employees SET system_role = :role, role = :role WHERE id = :id LIMIT 1'
                )->execute([
                    ':role' => $fix['to_role'],
                    ':id' => $fix['rh_id'],
                ]);
                $rhFixed[] = $fix['rh_id'];
            }

            $applied[] = $fix;
        }
    }

    // #region agent log
    @file_put_contents(
        dirname(__DIR__) . '/uploads/.debug-5ec660.ndjson',
        json_encode([
            'sessionId' => '5ec660',
            'location' => 'repair-user-roles.php',
            'message' => $apply ? 'repair_apply' : 'repair_dry_run',
            'data' => ['candidates' => count($fixes), 'applied' => count($applied), 'fixes' => $fixes],
            'timestamp' => (int) round(microtime(true) * 1000),
            'hypothesisId' => 'RH-DEPT',
        ], JSON_UNESCAPED_UNICODE) . "\n",
        FILE_APPEND
    );
    // #endregion

    soublu_json([
        'ok' => true,
        'dry_run' => !$apply,
        'candidates' => count($fixes),
        'fixes' => $fixes,
        'applied' => $applied,
        'rh_rows_synced' => count(array_unique($rhFixed)),
        'message' => $apply
            ? (count($applied) ? 'Perfis e departamentos restaurados a partir do RH.' : 'Nenhuma correção necessária.')
            : 'Diagnóstico concluído. Use ?apply=1 para restaurar.',
    ]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
