<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/InternalChatMysqlSchema.php';
header('Content-Type: application/json; charset=utf-8');
if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}
try {
    $applied = soublu_ensure_internal_chat_tables(soublu_pdo());
    soublu_json(['ok' => true, 'applied' => $applied]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
