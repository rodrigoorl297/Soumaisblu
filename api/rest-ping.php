<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    soublu_json(['ok' => true], 204);
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'message' => 'Não autorizado.'], 401);
}

$t0 = microtime(true);
$timing = ['total_ms' => 0];

try {
    $tPdo = microtime(true);
    $pdo = soublu_pdo();
    $timing['pdo_ms'] = (int) round((microtime(true) - $tPdo) * 1000);

    $tPing = microtime(true);
    $pdo->query('SELECT 1')->fetch();
    $timing['ping_ms'] = (int) round((microtime(true) - $tPing) * 1000);

    require_once __DIR__ . '/lib/FinanceMysqlSchema.php';
    require_once __DIR__ . '/lib/BeneficiosMysqlSchema.php';

    $tSchema = microtime(true);
    $timing['finance_exists'] = soublu_finance_modulos_tables_exist($pdo);
    $timing['beneficios_exists'] = soublu_beneficios_tables_exist($pdo);
    $timing['schema_check_ms'] = (int) round((microtime(true) - $tSchema) * 1000);

    $timing['total_ms'] = (int) round((microtime(true) - $t0) * 1000);
    $timing['persistent'] = defined('PDO::ATTR_PERSISTENT');

    soublu_json([
        'ok' => true,
        'db' => 'up',
        'ms' => $timing['total_ms'],
        'timing' => $timing,
    ]);
} catch (Throwable $e) {
    $timing['total_ms'] = (int) round((microtime(true) - $t0) * 1000);
    soublu_json([
        'ok' => false,
        'db' => 'down',
        'ms' => $timing['total_ms'],
        'timing' => $timing,
        'error' => $e->getMessage(),
    ], 503);
}
