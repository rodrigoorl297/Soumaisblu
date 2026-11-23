<?php
declare(strict_types=1);

/**
 * migrate-partner-comissao — injeta overlay de planilha + visão do parceiro.
 */
require_once __DIR__ . '/bootstrap.php';

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$root = dirname(__DIR__);
$tagTabela = '<script src="../js/partner-comissao-tabela.js?v=pct2"></script>';
$tagView = '<script src="../js/partner-comissao-view.js?v=pct2"></script>';
$files = [
    'admin.html',
    'pages/admin.html',
    'rh-manager.html',
    'pages/rh-manager.html',
    'financeiro.html',
    'pages/financeiro.html',
    'employee.html',
    'pages/employee.html',
];
$done = [];
foreach ($files as $rel) {
    $path = $root . '/' . $rel;
    if (!is_file($path)) {
        $done[] = $rel . ': missing';
        continue;
    }
    $html = (string) file_get_contents($path);
    $changed = false;
    if (str_contains($html, 'partner-comissao-tabela.js')) {
        $html2 = preg_replace('#partner-comissao-tabela\.js\?v=[^"\']+#', 'partner-comissao-tabela.js?v=pct2', $html);
        if ($html2 !== $html) {
            $html = $html2;
            $changed = true;
        }
    } else {
        $next = preg_replace(
            '#(<script[^>]*src="[^"]*js/partners\.js[^"]*"[^>]*></script>)#',
            '$1' . $tagTabela,
            $html,
            1,
            $count
        );
        if ($count) {
            $html = $next;
            $changed = true;
        }
    }
    if (str_contains($html, 'partner-comissao-view.js')) {
        $html2 = preg_replace('#partner-comissao-view\.js\?v=[^"\']+#', 'partner-comissao-view.js?v=pct2', $html);
        if ($html2 !== $html) {
            $html = $html2;
            $changed = true;
        }
    } else {
        $anchor = str_contains($html, 'partner-comissao-tabela.js')
            ? '#(<script[^>]*src="[^"]*js/partner-comissao-tabela\.js[^"]*"[^>]*></script>)#'
            : '#(<script[^>]*src="[^"]*js/partners\.js[^"]*"[^>]*></script>)#';
        $next = preg_replace($anchor, '$1' . $tagView, $html, 1, $count);
        if ($count) {
            $html = $next;
            $changed = true;
        } else {
            $done[] = $rel . ': no-anchor';
            continue;
        }
    }
    if ($changed) {
        file_put_contents($path, $html);
        $done[] = $rel . ': ok';
    } else {
        $done[] = $rel . ': already';
    }
}

soublu_json(['ok' => true, 'done' => $done]);
