<?php
require __DIR__ . '/config.db.local.php';

try {
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET,
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $tables = ['proposals', 'clients', 'products'];
    $pairs = [
        '├º' => 'ç', '├ú' => 'ã', '├╡' => 'õ', '├Á' => 'õ', '├í' => 'á', '├⌐' => 'é', '├®' => 'é',
        '├¡' => 'í', '├│' => 'ó', '├║' => 'ú', '├¬' => 'ê', '├┤' => 'ô', '├á' => 'à',
        '├ç' => 'Ç', '├â' => 'Ã', '├ò' => 'Õ', '├ü' => 'Á', '├ë' => 'É', '├ì' => 'Í',
        '├ô' => 'Ó', '├Ü' => 'Ú', '├è' => 'Ê', '├ö' => 'Ô', '├Ç' => 'À', '├£' => 'Ü'
    ];

    foreach ($tables as $table) {
        $stmt = $pdo->query("SHOW COLUMNS FROM `$table`");
        $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($columns as $col) {
            $colName = $col['Field'];
            if (strpos($col['Type'], 'varchar') !== false || strpos($col['Type'], 'text') !== false) {
                foreach ($pairs as $bad => $good) {
                    $sql = "UPDATE `$table` SET `$colName` = REPLACE(`$colName`, :bad, :good) WHERE `$colName` LIKE :bad_search";
                    $updateStmt = $pdo->prepare($sql);
                    $updateStmt->execute([
                        'bad' => $bad,
                        'good' => $good,
                        'bad_search' => '%' . $bad . '%'
                    ]);
                    $count = $updateStmt->rowCount();
                    if ($count > 0) {
                        echo "Fixed $count rows in $table.$colName replacing $bad with $good\n";
                    }
                }
                
                // Specific common mistakes from config.js literal
                $literalPairs = [
                    'COMPRA DE D├ìVIDA' => 'COMPRA DE DÍVIDA',
                    'COMPRA DE D├ÌVIDA' => 'COMPRA DE DÍVIDA',
                    'D├ìVIDA' => 'DÍVIDA',
                    'D├ÌVIDA' => 'DÍVIDA',
                    'LIBERA├ç├âO' => 'LIBERAÇÃO',
                    '├ç├âO' => 'ÇÃO',
                    '├ç├â' => 'çã',
                    '├írio' => 'ário'
                ];
                
                foreach ($literalPairs as $bad => $good) {
                    $sql = "UPDATE `$table` SET `$colName` = REPLACE(`$colName`, :bad, :good) WHERE `$colName` LIKE :bad_search";
                    $updateStmt = $pdo->prepare($sql);
                    $updateStmt->execute([
                        'bad' => $bad,
                        'good' => $good,
                        'bad_search' => '%' . $bad . '%'
                    ]);
                    $count = $updateStmt->rowCount();
                    if ($count > 0) {
                        echo "Fixed literal $count rows in $table.$colName replacing $bad with $good\n";
                    }
                }
            }
        }
    }
    echo "Database cleanup completed successfully.\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
