<?php
declare(strict_types=1);

/**
 * chunk-deploy — recebe pedaços pequenos e monta arquivo no allowlist do remote-deploy.
 * Contorna WAF que corta POST JSON grande (~12KB+).
 */
require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    soublu_json(['ok' => false, 'error' => 'json', 'raw_bytes' => strlen($raw)], 400);
}

$path = str_replace('\\', '/', trim((string) ($body['path'] ?? '')));
$index = (int) ($body['index'] ?? -1);
$total = (int) ($body['total'] ?? 0);
$bin = base64_decode((string) ($body['data'] ?? ''), true);

$allowedFile = dirname(__DIR__) . '/api/remote-deploy.php';
$allowed = [];
if (is_file($allowedFile)) {
    $src = (string) file_get_contents($allowedFile);
    if (preg_match('/\$allowed\s*=\s*\[(.*?)\];/s', $src, $m)) {
        if (preg_match_all("/'([^']+)'/", $m[1], $mm)) {
            $allowed = $mm[1];
        }
    }
}
/* Sempre permitir estes durante o bootstrap do próprio chunk-deploy. */
$extra = [
    'api/chunk-deploy.php',
    'api/lib/PostgRestCompat.php',
    'api/migrate-vendor-pendencias.php',
    'js/esteira-pendencias.js',
    'js/db.js',
    'js/proposals.js',
    'js/admin.js',
    'js/simulacao.js',
    'api/fintech-corban.php',
    'api/bootstrap.php',
    'config.fintech-corban.local.php',
    'config.fintech-corban.local.php.example',
    'admin.html',
    'pages/admin.html',
    'employee.html',
    'pages/employee.html',
    // Landing /cadastro (parceiros)
    'cadastro.html',
    'css/landing.css',
    'js/landing.js',
    'adminLP/parceiros-admin.html',
    'api/parceiros.php',
    'api/consulta-cnpj.php',
    'api/lib/lp-admin.php',
    'api/lib/lp-admin-actions.php',
    'api/lib/lp-partner-archive.php',
    'api/lib/lp-mailer.php',
    'api/lib/lp-soublu.php',
    'politica-privacidade.html',
    'politicas.html',
    'termos.html',
    'imagens/logo-sou-blu.webp',
    'imagens/logo-mark.png',
    'imagens/favicon-blu.png',
    'imagens/favicon-blu.svg',
    'imagens/apple-touch-icon.png',
    'imagens/blu-logo.png',
    'imagens/blu-logo-branca.png',
    'scripts/archive-partners.php',
    'migrations/001_partner_archive.sql',
];
$allowed = array_values(array_unique(array_merge($allowed, $extra)));

if ($path === '' || $index < 0 || $total < 1 || $total > 500 || $bin === false) {
    soublu_json(['ok' => false, 'error' => 'parte invalida'], 400);
}
if (!in_array($path, $allowed, true)) {
    soublu_json(['ok' => false, 'error' => 'path nao permitido', 'path' => $path], 400);
}
if (strlen($bin) > 8000) {
    soublu_json(['ok' => false, 'error' => 'chunk grande'], 400);
}

$dir = sys_get_temp_dir() . '/soublu_chunk_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $path);
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    soublu_json(['ok' => false, 'error' => 'mkdir'], 500);
}

file_put_contents($dir . '/' . str_pad((string) $index, 4, '0', STR_PAD_LEFT) . '.part', $bin);

$got = 0;
for ($i = 0; $i < $total; $i++) {
    if (is_file($dir . '/' . str_pad((string) $i, 4, '0', STR_PAD_LEFT) . '.part')) {
        $got++;
    }
}
if ($got < $total) {
    soublu_json(['ok' => true, 'pending' => true, 'got' => $got, 'total' => $total]);
}

$out = '';
for ($i = 0; $i < $total; $i++) {
    $p = $dir . '/' . str_pad((string) $i, 4, '0', STR_PAD_LEFT) . '.part';
    $out .= (string) file_get_contents($p);
}

$root = dirname(__DIR__);
$dest = $root . '/' . $path;
$parent = dirname($dest);
if (!is_dir($parent) && !mkdir($parent, 0755, true) && !is_dir($parent)) {
    soublu_json(['ok' => false, 'error' => 'dest mkdir'], 500);
}
if (file_put_contents($dest, $out) === false) {
    soublu_json(['ok' => false, 'error' => 'write'], 500);
}
for ($i = 0; $i < $total; $i++) {
    @unlink($dir . '/' . str_pad((string) $i, 4, '0', STR_PAD_LEFT) . '.part');
}
@rmdir($dir);

soublu_json(['ok' => true, 'path' => $path, 'bytes' => strlen($out)]);
