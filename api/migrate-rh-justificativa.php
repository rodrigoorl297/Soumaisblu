<?php
/**
 * Migração: anexo de atestado em rh_absence_justifications.
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

$changes = [
    'rh_absence_justifications' => [
        'atestado_anexo_url' => 'VARCHAR(512) NULL DEFAULT NULL',
        'atestado_anexo_nome' => 'VARCHAR(255) NULL DEFAULT NULL',
    ],
];

$applied = [];

try {
    $pdo = soublu_pdo();
    foreach ($changes as $table => $cols) {
        foreach ($cols as $col => $def) {
            $stmt = $pdo->prepare(
                'SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
            );
            $stmt->execute([$table, $col]);
            if ((int) $stmt->fetchColumn() > 0) {
                continue;
            }
            $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$col}` {$def}");
            $applied[] = "{$table}.{$col}";
        }
    }
    echo json_encode([
        'ok' => true,
        'applied' => $applied,
        'message' => $applied ? 'Migração justificativa aplicada.' : 'Nada a migrar — colunas já existem.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
