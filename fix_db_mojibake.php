<?php
require __DIR__ . '/config.db.local.php';

try {
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET,
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Update products table
    $stmt = $pdo->prepare("UPDATE products SET description = REPLACE(description, '├®', 'é') WHERE description LIKE '%├®%'");
    $stmt->execute();
    $stmt = $pdo->prepare("UPDATE products SET description = REPLACE(description, '├º', 'ç') WHERE description LIKE '%├º%'");
    $stmt->execute();
    $stmt = $pdo->prepare("UPDATE products SET description = REPLACE(description, '├ú', 'ã') WHERE description LIKE '%├ú%'");
    $stmt->execute();
    $stmt = $pdo->prepare("UPDATE products SET description = REPLACE(description, '├¡', 'í') WHERE description LIKE '%├¡%'");
    $stmt->execute();
    $stmt = $pdo->prepare("UPDATE products SET description = REPLACE(description, '├í', 'á') WHERE description LIKE '%├í%'");
    $stmt->execute();
    $stmt = $pdo->prepare("UPDATE products SET description = REPLACE(description, '├│', 'ó') WHERE description LIKE '%├│%'");
    $stmt->execute();
    $stmt = $pdo->prepare("UPDATE products SET description = REPLACE(description, '├║', 'ú') WHERE description LIKE '%├║%'");
    $stmt->execute();
    $stmt = $pdo->prepare("UPDATE products SET description = REPLACE(description, '├â', 'Ã') WHERE description LIKE '%├â%'");
    $stmt->execute();
    $stmt = $pdo->prepare("UPDATE products SET description = REPLACE(description, '├ç', 'Ç') WHERE description LIKE '%├ç%'");
    $stmt->execute();
    $stmt = $pdo->prepare("UPDATE products SET name = REPLACE(name, '├®', 'é') WHERE name LIKE '%├®%'");
    $stmt->execute();
    // (and so on...)

    // Retrieve products to confirm
    $stmt = $pdo->query("SELECT id, name, description FROM products WHERE id = 'pmpk9xf5gh5nsb'");
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Products after fix: \n";
    print_r($results);

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
