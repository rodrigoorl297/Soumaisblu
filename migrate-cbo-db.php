<?php
require_once 'api/lib/db.php';
require_once 'api/config.php';

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Create table if not exists
$sql = "CREATE TABLE IF NOT EXISTS rh_cbo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    titulo VARCHAR(255) NOT NULL,
    tipo VARCHAR(50),
    INDEX (codigo),
    INDEX (titulo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

if ($conn->query($sql) === TRUE) {
    echo "Table rh_cbo created successfully.\n";
} else {
    echo "Error creating table: " . $conn->error . "\n";
}

$json = file_get_contents('js/cbo-data.js');
// remove window.SOUBLU_CBO = 
$json = preg_replace('/^window\.SOUBLU_CBO\s*=\s*/', '', $json);
$json = preg_replace('/;$/', '', $json);

$data = json_decode($json, true);
if (!$data) {
    die("Error decoding JSON.\n");
}

$stmt = $conn->prepare("INSERT IGNORE INTO rh_cbo (codigo, titulo, tipo) VALUES (?, ?, ?)");

$count = 0;
foreach ($data as $item) {
    $codigo = $item['codigo'] ?? '';
    $titulo = $item['titulo'] ?? '';
    $tipo = $item['tipo'] ?? 'Ocupação';
    if ($codigo && $titulo) {
        $stmt->bind_param("sss", $codigo, $titulo, $tipo);
        $stmt->execute();
        $count++;
    }
}
$stmt->close();
$conn->close();

echo "Inserted/Verified $count CBO records.\n";
?>
