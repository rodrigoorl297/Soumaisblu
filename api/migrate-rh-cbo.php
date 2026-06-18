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

if (!soublu_api_auth_ok()) {
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
    if ($count === 0) {
        $seed = [
            ['411010', 'Assistente administrativo'],
            ['521110', 'Vendedor de comércio varejista'],
            ['252105', 'Administrador'],
            ['354120', 'Agente de vendas de serviços'],
            ['411005', 'Auxiliar de escritório'],
            ['142105', 'Gerente administrativo'],
            ['317110', 'Programador de sistemas de informação'],
        ];
        $ins = $pdo->prepare('INSERT IGNORE INTO rh_cbo (codigo, titulo) VALUES (?, ?)');
        foreach ($seed as [$cod, $titulo]) {
            $ins->execute([$cod, $titulo]);
        }
        $applied[] = 'rh_cbo_seed';
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
