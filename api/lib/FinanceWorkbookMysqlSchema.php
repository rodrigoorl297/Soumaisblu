<?php
declare(strict_types=1);
function soublu_ensure_finance_workbook(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS finance_workbook (id VARCHAR(64) PRIMARY KEY, kind VARCHAR(32) NOT NULL, data JSON NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX(kind)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // Preserve the existing supplier table; add the fields used by its current form.
    $st = $pdo->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?');
    $st->execute(['finance_suppliers']);
    $columns = $st->fetchAll(PDO::FETCH_COLUMN);
    if (!$columns) return;
    foreach (['protocolo'=>'VARCHAR(64)', 'valor_pago'=>'DECIMAL(12,2) DEFAULT 0', 'data_pagamento'=>'DATE', 'vigencia'=>'VARCHAR(64)', 'recorrencia_mensal'=>'TINYINT(1) DEFAULT 0', 'situacao'=>"VARCHAR(32) DEFAULT 'ativo'", 'anexos'=>'JSON'] as $name=>$type) {
        if (!in_array($name, $columns, true)) $pdo->exec("ALTER TABLE finance_suppliers ADD COLUMN `$name` $type NULL");
    }
}
