<?php
declare(strict_types=1);

/**
 * chipeira_whatsapp_check.php — proxy Evolution para o backend Chipeira.
 * O PC com os modems muitas vezes nao alcanca a VPS Evolution (Locaweb/VPN); o site
 * Locaweb alcanca. Auth: header X-API-Key = API_INTERNAL_KEY.
 *
 * POST JSON { "numbers": ["5562999999999", ...], "instance": "opcional" }
 * Resposta: { "ok": true, "instance": "...", "numbers": [ { "number", "exists" }, ... ] }
 */
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/EvolutionClient.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

/**
 * action=health — ping na Evolution (fetchInstances) sem consultar numeros.
 * Usado pelo painel Chipeira para avisar quando a VPS esta offline.
 */
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && (($_GET['action'] ?? '') === 'health')) {
    if (!EvolutionClient::isConfigured()) {
        soublu_json(['ok' => false, 'configured' => false, 'error' => 'Evolution nao configurada.'], 503);
    }
    $started = microtime(true);
    try {
        $evo = new EvolutionClient();
        $evo->fetchInstances();
        $ms = (int) round((microtime(true) - $started) * 1000);
        soublu_json([
            'ok' => true,
            'configured' => true,
            'reachable' => true,
            'latencyMs' => $ms,
            'evolutionHost' => defined('EVOLUTION_API_URL') ? (parse_url((string) EVOLUTION_API_URL, PHP_URL_HOST) ?: null) : null,
        ]);
    } catch (Throwable $e) {
        $ms = (int) round((microtime(true) - $started) * 1000);
        soublu_json([
            'ok' => false,
            'configured' => true,
            'reachable' => false,
            'latencyMs' => $ms,
            'evolutionHost' => defined('EVOLUTION_API_URL') ? (parse_url((string) EVOLUTION_API_URL, PHP_URL_HOST) ?: null) : null,
            'error' => $e->getMessage(),
        ], 502);
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    soublu_json(['ok' => false, 'error' => 'Use POST JSON.'], 405);
}

if (!EvolutionClient::isConfigured()) {
    soublu_json(['ok' => false, 'error' => 'Evolution API nao configurada no servidor.'], 503);
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    soublu_json(['ok' => false, 'error' => 'JSON invalido.'], 400);
}

$numbers = $body['numbers'] ?? null;
if (!is_array($numbers) || $numbers === []) {
    soublu_json(['ok' => false, 'error' => 'Campo numbers (array) e obrigatorio.'], 400);
}

$numbers = array_values(array_filter(array_map(static function ($n) {
    return preg_replace('/\D+/', '', (string) $n) ?? '';
}, $numbers), static fn($n) => $n !== ''));

if ($numbers === []) {
    soublu_json(['ok' => false, 'error' => 'Nenhum numero valido em numbers.'], 400);
}

/**
 * chipeira_pick_evolution_instance — instancia fixa ou 1a conectada (open).
 */
function chipeira_pick_evolution_instance(EvolutionClient $evo, ?string $preferred): string
{
    $preferred = trim((string) $preferred);
    if ($preferred !== '') {
        return $preferred;
    }

    $list = $evo->fetchInstances();
    $rows = is_array($list) ? $list : [];
    $fallback = null;
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $nested = isset($row['instance']) && is_array($row['instance']) ? $row['instance'] : null;
        $name = (string) ($nested['instanceName'] ?? $row['instanceName'] ?? $row['name'] ?? '');
        if ($name === '') {
            continue;
        }
        if ($fallback === null) {
            $fallback = $name;
        }
        $state = strtolower((string) ($nested['state'] ?? $nested['status'] ?? $row['connectionStatus'] ?? $row['state'] ?? ''));
        if ($state === 'open') {
            return $name;
        }
    }
    if ($fallback !== null) {
        return $fallback;
    }
    throw new RuntimeException('Nenhuma instancia Evolution encontrada.');
}

try {
    $evo = new EvolutionClient();
    $instance = chipeira_pick_evolution_instance($evo, isset($body['instance']) ? (string) $body['instance'] : null);
    $resp = $evo->whatsappNumbers($instance, $numbers);

    $rows = is_array($resp) ? $resp : [];
    if (isset($rows['numbers']) && is_array($rows['numbers'])) {
        $rows = $rows['numbers'];
    }

    $out = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $num = preg_replace('/\D+/', '', (string) ($row['number'] ?? $row['jid'] ?? '')) ?? '';
        if ($num === '') {
            continue;
        }
        $out[] = ['number' => $num, 'exists' => !empty($row['exists'])];
    }

    soublu_json(['ok' => true, 'instance' => $instance, 'numbers' => $out]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 502);
}
