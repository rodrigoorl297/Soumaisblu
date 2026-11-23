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
        $stmt = $pdo->query('SHOW COLUMNS FROM `users` LIKE ' . $pdo->quote($col));
        return (bool) ($stmt && $stmt->fetch(PDO::FETCH_ASSOC));
    };

    if (!$has($pdo, 'training_block')) {
        $pdo->exec(
            'ALTER TABLE `users` ADD COLUMN `training_block` TINYINT(1) NOT NULL DEFAULT 0
             COMMENT \'1=conta bloqueada por treinamentos obrigatorios (nao cadastra proposta)\''
        );
        $applied[] = 'users.training_block';
    } else {
        $applied[] = 'users.training_block_exists';
    }

    soublu_json(['ok' => true, 'applied' => $applied]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
