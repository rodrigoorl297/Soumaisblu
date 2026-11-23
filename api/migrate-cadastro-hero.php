<?php
declare(strict_types=1);

/**
 * migrate-cadastro-hero — texto do banner Seja Parceiro (Home Office / até 30 mil).
 */
require_once __DIR__ . '/bootstrap.php';

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$root = dirname(__DIR__);
$path = $root . '/cadastro.html';
if (!is_file($path)) {
    soublu_json(['ok' => false, 'error' => 'cadastro.html ausente'], 404);
}

$html = (string) file_get_contents($path);
$repl = [
    'Seja parceiro Blu' => 'Seja parceiro Home Office Blu',
    'Ganhe a partir de' => 'Ganhe até',
    'A partir de 30 mil reais / mês*' => 'Até 30 mil reais / mês*',
    '>30 mil / mês*<' => '>Até 30 mil / mês*<',
];
$n = 0;
foreach ($repl as $from => $to) {
    if (str_contains($html, $from)) {
        $html = str_replace($from, $to, $html, $c);
        $n += $c;
    }
}

file_put_contents($path, $html);
soublu_json(['ok' => true, 'replacements' => $n, 'home_office' => str_contains($html, 'Home Office'), 'ate' => str_contains($html, 'Ganhe até')]);
