<?php
declare(strict_types=1);

/**
 * migrate-db-init-fast — injeta o boot rápido do banco depois de db.js.
 */
require_once __DIR__ . '/bootstrap.php';
if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$root = dirname(__DIR__);
// defer: roda logo depois de db.js, ainda antes do boot do painel.
$files = [
    'admin.html', 'pages/admin.html',
    'employee.html', 'pages/employee.html',
    'financeiro.html', 'pages/financeiro.html',
    'rh-manager.html', 'pages/rh-manager.html',
];
$done = [];
foreach ($files as $rel) {
    $path = $root . '/' . $rel;
    if (!is_file($path)) {
        continue;
    }
    $html = (string) file_get_contents($path);
    if (str_contains($html, 'db-init-fast.js?v=boot1')) {
        $done[] = $rel . ': already';
        continue;
    }
    if (str_contains($html, 'db-init-fast.js')) {
        $html = preg_replace('#db-init-fast\.js\?v=[^"\']+#', 'db-init-fast.js?v=boot1', $html);
        file_put_contents($path, $html);
        $done[] = $rel . ': bumped';
        continue;
    }
    // Prefixo igual ao do db.js (../js/ no painel) para o script abrir no mesmo lugar.
    $next = preg_replace(
        '#(<script[^>]*src="([^"]*js/)db\.js[^"]*"[^>]*></script>)#',
        '$1<script src="$2db-init-fast.js?v=boot1" defer></script>',
        $html,
        1,
        $count
    );
    if (!$count) {
        $done[] = $rel . ': no-db';
        continue;
    }
    file_put_contents($path, $next);
    $done[] = $rel . ': injected';
}
soublu_json(['ok' => true, 'done' => $done]);
