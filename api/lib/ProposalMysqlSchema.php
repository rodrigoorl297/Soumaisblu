<?php
declare(strict_types=1);

/**
 * Garante colunas JSON na tabela proposals (MySQL Locaweb).
 * Usado por propostas de crédito, anexos e meta.
 */
function soublu_ensure_proposals_json_columns(?PDO $pdo = null): array
{
    static $done = false;
    static $applied = [];

    if ($done) {
        return $applied;
    }

    $pdo = $pdo ?? soublu_pdo();
    $columns = [
        'protocolo' => "ALTER TABLE `proposals` ADD COLUMN `protocolo` VARCHAR(64) NULL DEFAULT NULL",
        'meta' => "ALTER TABLE `proposals` ADD COLUMN `meta` JSON NULL",
        'history' => "ALTER TABLE `proposals` ADD COLUMN `history` JSON NULL",
        'attachments' => "ALTER TABLE `proposals` ADD COLUMN `attachments` JSON NULL",
        'credito_esteira' => "ALTER TABLE `proposals` ADD COLUMN `credito_esteira` JSON NULL",
        'credito_retorno' => "ALTER TABLE `proposals` ADD COLUMN `credito_retorno` JSON NULL",
    ];

    $check = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );

    foreach ($columns as $col => $sql) {
        $check->execute(['proposals', $col]);
        if ((int) $check->fetchColumn() === 0) {
            try {
                $pdo->exec($sql);
                $applied[] = $col;
            } catch (Throwable $e) {
                if (in_array($col, ['meta', 'history', 'attachments', 'credito_esteira', 'credito_retorno'], true)) {
                    $fallback = str_replace(' JSON NULL', ' LONGTEXT NULL', $sql);
                    $pdo->exec($fallback);
                    $applied[] = $col . ':longtext';
                } else {
                    throw $e;
                }
            }
        }
    }

    $done = true;
    return $applied;
}

function soublu_proposals_has_column(PDO $pdo, string $col): bool
{
    static $cache = [];
    if (isset($cache[$col])) {
        return $cache[$col];
    }
    $st = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $st->execute(['proposals', $col]);
    $cache[$col] = (int) $st->fetchColumn() > 0;
    return $cache[$col];
}
