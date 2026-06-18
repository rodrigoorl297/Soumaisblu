<?php
/**
 * Migração: tabela monitoria_atendimento (Monitoria de Atendimento — Administrativo).
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
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
    );
    $stmt->execute(['monitoria_atendimento']);
    if ((int) $stmt->fetchColumn() === 0) {
        $pdo->exec("CREATE TABLE `monitoria_atendimento` (
            `id` VARCHAR(64) NOT NULL,
            `protocolo` VARCHAR(32) NOT NULL,
            `motivo` VARCHAR(64) NOT NULL,
            `data_avaliacao` DATE NULL DEFAULT NULL,
            `origem` VARCHAR(120) NULL DEFAULT NULL,
            `protocolo_monitoria` VARCHAR(64) NULL DEFAULT NULL,
            `colaborador_id` VARCHAR(64) NULL DEFAULT NULL,
            `colaborador_nome` VARCHAR(255) NOT NULL,
            `colaborador_cpf` VARCHAR(20) NULL DEFAULT NULL,
            `evidence_attachments` JSON NULL,
            `observacoes` TEXT NULL,
            `created_by` VARCHAR(64) NULL DEFAULT NULL,
            `created_by_name` VARCHAR(255) NULL DEFAULT NULL,
            `created_at` DATETIME NULL DEFAULT NULL,
            `updated_at` DATETIME NULL DEFAULT NULL,
            PRIMARY KEY (`id`),
            KEY `idx_mon_colab` (`colaborador_id`),
            KEY `idx_mon_data` (`data_avaliacao`),
            KEY `idx_mon_protocolo` (`protocolo`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $applied[] = 'monitoria_atendimento';
    }
    echo json_encode([
        'ok' => true,
        'applied' => $applied,
        'message' => $applied ? 'Migração monitoria aplicada.' : 'Nada a migrar — tabela já existe.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
