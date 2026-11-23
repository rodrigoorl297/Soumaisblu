<?php
declare(strict_types=1);

/**
 * Remove usuários de demonstração que o seed recriava (Backoffice OP, Financeiro F, Desenvolvedor DEV001).
 */
require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$ids = ['back01', 'ger01', 'fin01', 'rh01', 'oper01', 'jur01', 'dir01', 'ouv01', 'dev_owner'];
$emails = [
    'desenvolvedor@soublu.com',
    'financeiro@empresa.com',
    'backoffice@empresa.com',
    'diretoria@empresa.com',
    'juridico@empresa.com',
    'gerencia@empresa.com',
];

try {
    $pdo = soublu_pdo();
    $found = [];

    $inIds = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT `id`, `email`, `name`, `matricula`, `active` FROM `users` WHERE `id` IN ($inIds)");
    $stmt->execute($ids);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $found[$row['id']] = $row;
    }

    $inEm = implode(',', array_fill(0, count($emails), '?'));
    $stmt = $pdo->prepare("SELECT `id`, `email`, `name`, `matricula`, `active` FROM `users` WHERE LOWER(`email`) IN ($inEm)");
    $stmt->execute($emails);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $found[$row['id']] = $row;
    }

    $stmt = $pdo->prepare("SELECT `id`, `email`, `name`, `matricula`, `active` FROM `users` WHERE LOWER(`email`) LIKE ?");
    $stmt->execute(['%@empresa.com']);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $found[$row['id']] = $row;
    }

    $deleted = [];
    $deactivated = [];
    $errors = [];

    foreach ($found as $id => $row) {
        $roleCheck = $pdo->prepare('SELECT `role` FROM `users` WHERE `id` = ? LIMIT 1');
        $roleCheck->execute([$id]);
        $role = strtolower((string) ($roleCheck->fetchColumn() ?: ''));
        if (in_array($role, ['master', 'fundador'], true)) {
            continue;
        }
        $em = strtolower(trim((string) ($row['email'] ?? '')));
        if (in_array($em, ['flaviahonda@gmail.com', 'gabi@blupromotora.com.br'], true)) {
            continue;
        }
        try {
            $pdo->prepare('DELETE FROM `users` WHERE `id` = ?')->execute([$id]);
            $deleted[] = $id;
            continue;
        } catch (Throwable $e) {
            $errors[$id] = $e->getMessage();
        }
        $stamp = 'del' . substr(bin2hex(random_bytes(4)), 0, 8);
        $hasDeletedAt = (bool) $pdo->query("SHOW COLUMNS FROM `users` LIKE 'deleted_at'")->fetch();
        $sql = 'UPDATE `users` SET `active` = 0, `email` = ?, `matricula` = ?, `name` = ?';
        $params = [
            'deleted_' . $stamp . '@deleted.local',
            'DEL-' . $stamp,
            trim((string) ($row['name'] ?? 'Removido')) . ' (removido)',
        ];
        if ($hasDeletedAt) {
            $sql .= ', `deleted_at` = NOW()';
        }
        $sql .= ' WHERE `id` = ?';
        $params[] = $id;
        $pdo->prepare($sql)->execute($params);
        $deactivated[] = $id;
    }

    soublu_json([
        'ok' => true,
        'found' => array_keys($found),
        'deleted' => $deleted,
        'deactivated' => $deactivated,
        'errors' => $errors,
    ]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
