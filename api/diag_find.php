<?php
declare(strict_types=1);

header('Content-Type: text/plain; charset=utf-8');

$dir = dirname(__DIR__) . '/uploads';

echo "=== DIAGNÓSTICO DE ARQUIVOS ===\n";
echo "Diretório uploads: " . (is_dir($dir) ? "Existe" : "Não existe") . "\n";

$search = $_GET['search'] ?? '';
if ($search === '') {
    echo "Passe ?search=nome_do_arquivo para buscar.\n";
    exit;
}

echo "Buscando por: $search\n\n";

function search_recursive(string $folder, string $search): void {
    if (!is_dir($folder)) return;
    $items = scandir($folder);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $full = $folder . '/' . $item;
        if (is_dir($full)) {
            search_recursive($full, $search);
        } else {
            if (stripos($item, $search) !== false || stripos($full, $search) !== false) {
                echo "Encontrado: $full (" . filesize($full) . " bytes)\n";
            }
        }
    }
}

search_recursive($dir, $search);
echo "\nBusca concluída.\n";
