<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

try {
    $pdo = soublu_pdo();
    $applied = [];

    $has = static function (PDO $pdo, string $col): bool {
        $stmt = $pdo->query("SHOW COLUMNS FROM `users` LIKE " . $pdo->quote($col));
        return (bool) ($stmt && $stmt->fetch(PDO::FETCH_ASSOC));
    };

    if (!$has($pdo, 'acesso_clube')) {
        $pdo->exec(
            'ALTER TABLE `users` ADD COLUMN `acesso_clube` TINYINT(1) NOT NULL DEFAULT 1
             COMMENT \'Acesso ao Clube de Beneficios\''
        );
        $applied[] = 'users.acesso_clube';
    }

    soublu_json(['ok' => true, 'applied' => $applied]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
