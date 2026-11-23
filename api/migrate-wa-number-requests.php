<?php
declare(strict_types=1);

/**
 * migrate-wa-number-requests — cria wa_number_requests (histórico legado de pedidos de número).
 * Idempotente. O fluxo atual usa sobretudo wa_numbers; esta tabela fica disponível se o front voltar a pedir.
 */
require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

try {
    $pdo = soublu_pdo();
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS wa_number_requests (
          id               VARCHAR(64) NOT NULL PRIMARY KEY,
          employee_id      VARCHAR(64) NOT NULL,
          employee_name    VARCHAR(255) NOT NULL DEFAULT \'\',
          employee_dept    VARCHAR(128) DEFAULT \'\',
          note             TEXT,
          status           VARCHAR(32) NOT NULL DEFAULT \'pendente\',
          assigned_number  VARCHAR(32) DEFAULT \'\',
          admin_note       TEXT,
          handled_by       VARCHAR(64) DEFAULT \'\',
          handled_by_name  VARCHAR(255) DEFAULT \'\',
          created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_wa_number_requests_employee (employee_id, created_at),
          INDEX idx_wa_number_requests_status (status, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    soublu_json(['ok' => true, 'applied' => ['wa_number_requests']]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
