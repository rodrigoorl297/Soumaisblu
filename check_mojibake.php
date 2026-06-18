<?php
require __DIR__ . '/config.db.local.php';

try {
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET,
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Retrieve products
    $stmt = $pdo->query("SELECT id, name, description FROM products WHERE description LIKE '%├%'");
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Products with ├ : \n";
    print_r($results);

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
