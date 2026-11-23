<?php
declare(strict_types=1);

/**
 * migrate-clients-search — injeta busca por nome no banco (lista da tela é limitada).
 */
require_once __DIR__ . '/bootstrap.php';

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$root = dirname(__DIR__);
$done = [];
$tag = '<script src="../js/clients-search-fix.js?v=name1"></script>';
$htmlFiles = [
    'admin.html',
    'pages/admin.html',
    'employee.html',
    'pages/employee.html',
    'financeiro.html',
    'pages/financeiro.html',
];
foreach ($htmlFiles as $rel) {
    $path = $root . '/' . $rel;
    if (!is_file($path)) {
        $done[] = $rel . ': missing';
        continue;
    }
    $html = (string) file_get_contents($path);
    if (str_contains($html, 'clients-search-fix.js?v=name1')) {
        $done[] = $rel . ': already';
        continue;
    }
    if (str_contains($html, 'clients-search-fix.js')) {
        $html = preg_replace('#clients-search-fix\.js\?v=[^"\']+#', 'clients-search-fix.js?v=name1', $html);
        file_put_contents($path, $html);
        $done[] = $rel . ': bumped';
        continue;
    }
    $next = preg_replace(
        '#(<script[^>]*src="[^"]*js/clients\.js[^"]*"[^>]*></script>)#',
        '$1' . $tag,
        $html,
        1,
        $count
    );
    if (!$count) {
        $next = str_replace('</body>', $tag . "\n</body>", $html, $count);
        if (!$count) {
            $done[] = $rel . ': no-hook';
            continue;
        }
    }
    file_put_contents($path, $next);
    $done[] = $rel . ': injected';
}

$adminJs = $root . '/js/admin.js';
if (is_file($adminJs)) {
    $src = (string) file_get_contents($adminJs);
    $needle = "window._repaintClientsTableFromCache = _repaintClientsTableFromCache;";
    $insert = $needle . "\nwindow._paintClientsTable = _paintClientsTable;\nwindow._getClientsListCache = function () { return _clientsListCache; };";
    if (str_contains($src, 'window._paintClientsTable = _paintClientsTable')) {
        $done[] = 'admin.js: paint-already';
    } elseif (str_contains($src, $needle)) {
        file_put_contents($adminJs, str_replace($needle, $insert, $src));
        $done[] = 'admin.js: paint-export';
    } else {
        $done[] = 'admin.js: paint-miss';
    }
}

soublu_json(['ok' => true, 'done' => $done]);
