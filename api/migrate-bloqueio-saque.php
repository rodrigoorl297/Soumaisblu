<?php
declare(strict_types=1);

/**
 * migrate-bloqueio-saque — bloqueio de conta trava só o saque.
 * Troca o texto da conta corrente e injeta js/conta-bloqueio-saque.js.
 */
require_once __DIR__ . '/bootstrap.php';

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$root = dirname(__DIR__);
$done = [];

$cc = $root . '/js/conta-corrente.js';
if (is_file($cc)) {
    $js = (string) file_get_contents($cc);
    $map = [
        'A pessoa não poderá cadastrar novas propostas enquanto a conta estiver bloqueada.'
            => 'A pessoa continua digitando proposta. O bloqueio impede só o saque.',
        'Ao confirmar, a conta é liberada para cadastrar propostas. Se o bloqueio for 001 (treinamentos) e ainda houver pendência, o bloqueio pode voltar no próximo login.'
            => 'Ao confirmar, o saque volta a ser permitido. A digitação de proposta não depende deste bloqueio. Se o bloqueio for 001 (treinamentos) e ainda houver pendência, o bloqueio pode voltar no próximo login.',
        'Esta pessoa não pode cadastrar novas propostas. Para liberar, use <strong>Desbloquear movimentação</strong> em um crédito do histórico abaixo.'
            => 'Esta pessoa pode digitar proposta. O bloqueio impede só o saque. Para liberar o saque, use <strong>Desbloquear movimentação</strong> em um crédito do histórico abaixo.',
        'Impede cadastrar propostas enquanto houver bloqueio.'
            => 'Impede só o saque enquanto houver bloqueio. A proposta continua liberada.',
    ];
    $n = 0;
    foreach ($map as $from => $to) {
        if (str_contains($js, $from)) {
            $js = str_replace($from, $to, $js, $c);
            $n += $c;
        }
    }
    if ($n) {
        file_put_contents($cc, $js);
    }
    $done[] = 'conta-corrente: ' . $n;
}

$tag = '<script src="../js/conta-bloqueio-saque.js?v=saque1"></script>';
$files = [
    'admin.html',
    'pages/admin.html',
    'employee.html',
    'pages/employee.html',
    'financeiro.html',
    'pages/financeiro.html',
    'rh-manager.html',
    'pages/rh-manager.html',
];
foreach ($files as $rel) {
    $path = $root . '/' . $rel;
    if (!is_file($path)) {
        continue;
    }
    $html = (string) file_get_contents($path);
    $html = preg_replace('#conta-corrente\.js\?v=[^"\']+#', 'conta-corrente.js?v=saque1', $html);
    if (str_contains($html, 'conta-bloqueio-saque.js?v=saque1')) {
        $done[] = $rel . ': already';
        continue;
    }
    if (str_contains($html, 'conta-bloqueio-saque.js')) {
        $html = preg_replace('#conta-bloqueio-saque\.js\?v=[^"\']+#', 'conta-bloqueio-saque.js?v=saque1', $html);
        file_put_contents($path, $html);
        $done[] = $rel . ': bumped';
        continue;
    }
    $next = preg_replace(
        '#(<script[^>]*src="[^"]*js/profile\.js[^"]*"[^>]*></script>)#',
        '$1' . $tag,
        $html,
        1,
        $count
    );
    if (!$count) {
        $next = preg_replace(
            '#(<script[^>]*src="[^"]*js/withdrawal-flow\.js[^"]*"[^>]*></script>)#',
            '$1' . $tag,
            $html,
            1,
            $count
        );
    }
    if (!$count) {
        $done[] = $rel . ': no-anchor';
        continue;
    }
    file_put_contents($path, $next);
    $done[] = $rel . ': injected';
}

soublu_json(['ok' => true, 'done' => $done]);
