<?php
declare(strict_types=1);

/**
 * migrate-cadastro-nofooter — tira o rodapé jurídico da página de cadastro de parceiro.
 */
require_once __DIR__ . '/bootstrap.php';

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$root = dirname(__DIR__);
$path = $root . '/cadastro.html';
if (!is_file($path)) {
    soublu_json(['ok' => false, 'error' => 'cadastro.html ausente.'], 404);
}

$html = (string) file_get_contents($path);
if (!str_contains($html, '<footer')) {
    soublu_json(['ok' => true, 'done' => 'already']);
}

$next = preg_replace('#<footer\b[^>]*>.*?</footer>\s*#si', '', $html, 1, $count);
if (!$count) {
    soublu_json(['ok' => false, 'error' => 'footer-nao-encontrado'], 500);
}
file_put_contents($path, $next);
soublu_json(['ok' => true, 'done' => 'removed', 'bytes' => strlen($next)]);
