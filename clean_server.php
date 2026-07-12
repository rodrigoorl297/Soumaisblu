<?php
/**
 * Script de Limpeza do Servidor (Auto-destrutivo)
 * Este script deve ser enviado para o servidor e acessado pelo navegador.
 * Após a execução, ele apagará os arquivos temporários e se excluirá.
 */

header('Content-Type: text/plain; charset=utf-8');

echo "Iniciando varredura e limpeza de arquivos temporários...\n\n";

// 1. Pastas a serem apagadas recursivamente
$foldersToDelete = [
    'temp_script_2',
    'scratch',
    'docker'
];

// 2. Arquivos específicos na raiz a serem apagados
$filesToDelete = [
    'add_cache_headers.php',
    'add_css.php',
    'add_sidebar_store.php',
    'check_btn.php',
    'check_emojis.php',
    'check_tabs.php',
    'fix_clube_script.php',
    'fix_clube_tabs.php',
    'fix_clube_tabs_redirect.php',
    'fix_js.php',
    'fix_js2.php',
    'fix_pages.php',
    'fix_tabs_final.php',
    'hide_buttons.php',
    'migrate_benefits.php',
    'move_menus.php',
    'parsed_planilha.txt',
    'read_log.php',
    '_tmp_navdefaults.js',
    'debug-wa.log',
    'test_config.php',
    'test_evo.php',
    'test_evo2.php',
    'test_evo3.php',
    'test_wa_api.php',
    'test_wa_connect.php',
    'update_cache.php',
    'update_tabs.php'
];

// Função auxiliar para deletar pasta recursivamente
function deleteDir($dirPath) {
    if (!is_dir($dirPath)) {
        return false;
    }
    if (!str_ends_with($dirPath, '/')) {
        $dirPath .= '/';
    }
    $files = glob($dirPath . '*', GLOB_MARK);
    foreach ($files as $file) {
        if (is_dir($file)) {
            deleteDir($file);
        } else {
            unlink($file);
        }
    }
    return rmdir($dirPath);
}

// Limpando pastas
foreach ($foldersToDelete as $folder) {
    $path = __DIR__ . '/' . $folder;
    if (is_dir($path)) {
        echo "Apagando pasta: $folder... ";
        if (deleteDir($path)) {
            echo "OK\n";
        } else {
            echo "FALHA\n";
        }
    }
}

// Limpando arquivos específicos
foreach ($filesToDelete as $file) {
    $path = __DIR__ . '/' . $file;
    if (file_exists($path)) {
        echo "Apagando arquivo: $file... ";
        if (unlink($path)) {
            echo "OK\n";
        } else {
            echo "FALHA\n";
        }
    }
}

// Limpando arquivos que seguem padrão (ex: test_*.php, fix_*.php, check_*.php)
$dir = new DirectoryIterator(__DIR__);
foreach ($dir as $fileinfo) {
    if (!$fileinfo->isDot() && $fileinfo->isFile()) {
        $name = $fileinfo->getFilename();
        if (preg_match('/^(check_|fix_|test_|update_)/', $name) && $name !== 'clean_server.php') {
            echo "Apagando arquivo padrão: $name... ";
            if (unlink($fileinfo->getPathname())) {
                echo "OK\n";
            } else {
                echo "FALHA\n";
            }
        }
    }
}

// Limpando os scripts de diagnóstico dentro da pasta /scripts/
$scriptsDir = __DIR__ . '/scripts';
if (is_dir($scriptsDir)) {
    $dir = new DirectoryIterator($scriptsDir);
    foreach ($dir as $fileinfo) {
        if (!$fileinfo->isDot() && $fileinfo->isFile()) {
            $name = $fileinfo->getFilename();
            // Apaga scripts de deploy ou diagnóstico antigos
            if (preg_match('/^(_|deploy-|diag-)/', $name)) {
                echo "Apagando script em /scripts: $name... ";
                if (unlink($fileinfo->getPathname())) {
                    echo "OK\n";
                } else {
                    echo "FALHA\n";
                }
            }
        }
    }
}

echo "\nLimpeza concluída!\n";

// Auto-destruição do script de limpeza
echo "Removendo este script de limpeza por segurança... ";
unlink(__FILE__);
echo "OK\n";
?>
