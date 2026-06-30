<?php
require_once __DIR__ . "/../api/bootstrap.php";

$pdo = soublu_pdo();

$pdo->exec("CREATE TABLE IF NOT EXISTS `rh_cbo` (
    `codigo` VARCHAR(10) NOT NULL,
    `titulo` VARCHAR(255) NOT NULL,
    PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$content = file_get_contents("https://raw.githubusercontent.com/lucassmacedo/cbo-brasil/master/json/CBO2002%20-%20Ocupacao.json");

$data = json_decode($content, true);

if (!is_array($data)) {
    die("Falha ao ler JSON. Erro: " . json_last_error_msg());
}

$pdo->exec("TRUNCATE TABLE `rh_cbo`");
$stmt = $pdo->prepare("INSERT INTO rh_cbo (codigo, titulo) VALUES (?, ?)");

$count = 0;
foreach ($data as $item) {
    if (isset($item["code"]) && isset($item["name"])) {
        $stmt->execute([$item["code"], $item["name"]]);
        $count++;
    }
}

echo "Sucesso: $count registros inseridos na tabela rh_cbo.\n";
?>