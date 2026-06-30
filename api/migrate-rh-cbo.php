<?php
/**
 * Migração: tabela rh_cbo (ocupações CBO).
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

if (php_sapi_name() !== 'cli' && !soublu_api_auth_ok()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Não autorizado'], JSON_UNESCAPED_UNICODE);
    exit;
}

$applied = [];

try {
    $pdo = soublu_pdo();

    $sql = "CREATE TABLE IF NOT EXISTS `rh_cbo` (
        `codigo` VARCHAR(10) NOT NULL,
        `titulo` VARCHAR(512) NOT NULL,
        PRIMARY KEY (`codigo`),
        KEY `idx_rh_cbo_titulo` (`titulo`(120))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
    );
    $stmt->execute(['rh_cbo']);
    if ((int) $stmt->fetchColumn() === 0) {
        $pdo->exec($sql);
        $applied[] = 'rh_cbo';
    }

    $count = (int) $pdo->query('SELECT COUNT(*) FROM rh_cbo')->fetchColumn();
    if ($count < 2000) {
        $jsonStr = file_get_contents(__DIR__ . '/../js/cbo-data.js');
        $jsonStr = preg_replace('/^window\.SOUBLU_CBO\s*=\s*/', '', $jsonStr);
        $jsonStr = preg_replace('/;$/', '', $jsonStr);
        $data = json_decode($jsonStr, true);
        if ($data) {
            $ins = $pdo->prepare('INSERT IGNORE INTO rh_cbo (codigo, titulo) VALUES (?, ?)');
            foreach ($data as $item) {
                $ins->execute([$item['codigo'] ?? '', $item['titulo'] ?? '']);
            }
            $applied[] = 'rh_cbo_seed_full';
        }
    }

    echo json_encode([
        'ok' => true,
        'applied' => $applied,
        'message' => $applied ? 'Tabela CBO pronta.' : 'Tabela CBO já existia.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
