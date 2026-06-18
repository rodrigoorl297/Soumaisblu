<?php
require __DIR__ . '/config.db.local.php';

try {
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET,
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Update withdrawal
    $stmt = $pdo->prepare("UPDATE withdrawals SET status = 'pago', pix_status = 'pago', pix_error = 'Baixado manualmente' WHERE pix_key = '59218219000104' AND status = 'erro'");
    $stmt->execute();
    echo "Withdrawal updated. Rows affected: " . $stmt->rowCount() . "\n";

    // Create tables
    $pdo->exec("CREATE TABLE IF NOT EXISTS finance_service_providers (
        id VARCHAR(255) PRIMARY KEY,
        protocolo VARCHAR(255),
        document VARCHAR(50),
        name VARCHAR(255),
        pix_key VARCHAR(255),
        pix_type VARCHAR(50),
        category VARCHAR(100),
        valor_pago DECIMAL(12,2),
        data_pagamento DATETIME NULL,
        vigencia VARCHAR(255),
        recorrencia_mensal BOOLEAN DEFAULT FALSE,
        situacao VARCHAR(50) DEFAULT 'ativo',
        anexos JSON,
        notes TEXT,
        created_by VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    echo "finance_service_providers table checked/created.\n";

    $pdo->exec("CREATE TABLE IF NOT EXISTS finance_payroll (
        id VARCHAR(255) PRIMARY KEY,
        month VARCHAR(50),
        created_by VARCHAR(255),
        status VARCHAR(50) DEFAULT 'draft',
        total_employees INT DEFAULT 0,
        total_amount DECIMAL(12,2) DEFAULT 0.00,
        employees_data JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    echo "finance_payroll table checked/created.\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
