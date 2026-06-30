<?php
require 'api/bootstrap.php';
$pdo = soublu_pdo();
$sql = file_get_contents('mysql/migrations/20260624_whatsapp_tables.sql');
$queries = array_filter(array_map('trim', explode(';', $sql)));
foreach ($queries as $q) {
    if (!$q || strpos($q, '--') === 0) continue;
    try {
        $pdo->exec($q);
        echo "OK: " . substr($q, 0, 70) . "\n";
    } catch (Exception $e) {
        echo "ERR: " . $e->getMessage() . "\n";
    }
}
echo "Feito!\n";
