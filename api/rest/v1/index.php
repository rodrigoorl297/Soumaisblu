<?php
declare(strict_types=1);

/**
 * Rota compatível com Supabase PostgREST: /api/rest/v1/{tabela}?...
 */
$uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
$table = '';
if (preg_match('#/api/rest/v1/([a-zA-Z0-9_]+)#', $uri, $m)) {
    $table = $m[1];
}
if ($table === '') {
    $table = (string) ($_GET['table'] ?? '');
}

$_GET['table'] = $table;
require dirname(__DIR__) . '/index.php';
