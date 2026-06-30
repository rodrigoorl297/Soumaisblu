<?php
declare(strict_types=1);

header('Content-Type: text/plain; charset=utf-8');

$dir = dirname(__DIR__) . '/uploads/proposal-attachments';
if (!is_dir($dir)) {
    echo "Diretório não existe: $dir\n";
    exit;
}

echo "=== DIRETÓRIOS EM $dir ===\n";
$items = scandir($dir);
foreach ($items as $item) {
    if ($item === '.' || $item === '..') continue;
    $full = $dir . '/' . $item;
    if (is_dir($full)) {
        echo "[DIR] $item\n";
        $sub = scandir($full);
        foreach ($sub as $s) {
            if ($s === '.' || $s === '..') continue;
            echo "  - $s (" . filesize($full . '/' . $s) . " bytes)\n";
        }
    } else {
        echo "[FILE] $item\n";
    }
}
