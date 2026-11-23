<?php
declare(strict_types=1);

/**
 * migrate-chipeira-numeros — junta o JS do estoque (WAF corta POST grande)
 * e mostra o menu Números no admin e no vendedor.
 * POST { index, total, data } com data em base64, pedaços de ~7KB.
 */
require_once __DIR__ . '/bootstrap.php';

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$root = dirname(__DIR__);
$partDir = __DIR__ . '/_chip_js_parts';
$done = [];

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body)) {
        soublu_json(['ok' => false, 'error' => 'JSON invalido ou corpo vazio.'], 400);
    }
    $index = (int) ($body['index'] ?? -1);
    $total = (int) ($body['total'] ?? 0);
    $raw = base64_decode((string) ($body['data'] ?? ''), true);
    if ($index < 0 || $total < 1 || $total > 8 || $raw === false || $raw === '') {
        soublu_json(['ok' => false, 'error' => 'pedaço invalido'], 400);
    }
    if (!is_dir($partDir) && !mkdir($partDir, 0755, true) && !is_dir($partDir)) {
        soublu_json(['ok' => false, 'error' => 'sem pasta de pedacos'], 500);
    }
    file_put_contents($partDir . '/' . $index, $raw);
    $have = 0;
    $js = '';
    for ($i = 0; $i < $total; $i++) {
        $p = $partDir . '/' . $i;
        if (!is_file($p)) {
            soublu_json(['ok' => true, 'part' => $index, 'waiting' => $total - $have]);
        }
        $js .= (string) file_get_contents($p);
        $have++;
    }
    if (!str_contains($js, 'FEATURE_ENABLED: true') || !str_contains($js, 'WaNumberRequests')) {
        soublu_json(['ok' => false, 'error' => 'JS incompleto', 'bytes' => strlen($js)], 400);
    }
    file_put_contents($root . '/js/wa-number-requests.js', $js);
    foreach (glob($partDir . '/*') ?: [] as $f) {
        @unlink($f);
    }
    $done[] = 'js:' . strlen($js);
}

foreach ([
    'admin.html', 'pages/admin.html',
    'employee.html', 'pages/employee.html',
] as $rel) {
    $path = $root . '/' . $rel;
    if (!is_file($path)) {
        continue;
    }
    $html = (string) file_get_contents($path);
    $html2 = preg_replace('#wa-number-requests\.js\?v=[^"\']+#', 'wa-number-requests.js?v=chip3', $html);
    $html2 = str_replace('id="navWaNumberRequests" style="display:none"', 'id="navWaNumberRequests"', $html2);
    $html2 = str_replace('id="navWaNumberRequest" style="display:none"', 'id="navWaNumberRequest"', $html2);
    if ($html2 !== $html) {
        file_put_contents($path, $html2);
        $done[] = $rel;
    }
}

soublu_json(['ok' => true, 'done' => $done]);
