<?php
/**
 * Migração: colunas de comissão do vendedor na tabela proposals (módulo Financeiro).
 * GET com header X-API-Key (API_INTERNAL_KEY) ou apikey.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Não autorizado'], JSON_UNESCAPED_UNICODE);
    exit;
}

$applied = [];

try {
    $pdo = soublu_pdo();

    $columns = [
        'comissaoRecebida' => "ALTER TABLE `proposals` ADD COLUMN `comissaoRecebida` VARCHAR(8) NULL DEFAULT NULL COMMENT 'SIM/NÃO — vendedor recebeu comissão'",
        'comissaoElegivel' => "ALTER TABLE `proposals` ADD COLUMN `comissaoElegivel` VARCHAR(8) NULL DEFAULT NULL COMMENT 'SIM/NÃO — elegível a comissão'",
        'valorComissaoRecebida' => "ALTER TABLE `proposals` ADD COLUMN `valorComissaoRecebida` DECIMAL(12,2) NULL DEFAULT NULL COMMENT 'Valor recebido de comissão (R$)'",
    ];

    foreach ($columns as $col => $sql) {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
        $stmt->execute(['proposals', $col]);
        if ((int) $stmt->fetchColumn() === 0) {
            $pdo->exec($sql);
            $applied[] = $col;
        }
    }

    echo json_encode([
        'ok' => true,
        'applied' => $applied,
        'message' => $applied
            ? 'Colunas de comissão adicionadas em proposals.'
            : 'Colunas de comissão já existem.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
