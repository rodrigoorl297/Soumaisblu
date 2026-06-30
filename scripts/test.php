<?php
require_once __DIR__ . '/../api/bootstrap.php';
$pdo = soublu_pdo();
$stmt = $pdo->query('SELECT COUNT(*) FROM rh_cbo');
echo $stmt->fetchColumn();
