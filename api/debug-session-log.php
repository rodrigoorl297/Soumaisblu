<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Debug-Session-Id');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

$base = defined('UPLOAD_DIR') ? UPLOAD_DIR : (dirname(__DIR__) . '/uploads');
$dir = rtrim($base, '/\\') . '/.debug-sessions';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $sessionId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) ($_GET['session'] ?? '5ec660')) ?: '5ec660';
    $path = $dir . '/' . $sessionId . '.ndjson';
    if (!is_file($path)) {
        soublu_json(['ok' => true, 'sessionId' => $sessionId, 'lines' => [], 'count' => 0]);
    }
    $raw = (string) file_get_contents($path);
    $lines = array_values(array_filter(array_map('trim', explode("\n", $raw))));
    $tail = array_slice($lines, -80);
    $parsed = [];
    foreach ($tail as $ln) {
        $j = json_decode($ln, true);
        if (is_array($j)) {
            $parsed[] = $j;
        }
    }
    soublu_json(['ok' => true, 'sessionId' => $sessionId, 'count' => count($lines), 'lines' => $parsed]);
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw ?: '', true);
if (!is_array($payload)) {
    soublu_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
}

$sessionId = trim((string) ($payload['sessionId'] ?? $_SERVER['HTTP_X_DEBUG_SESSION_ID'] ?? 'default'));
$sessionId = preg_replace('/[^a-zA-Z0-9_-]/', '', $sessionId) ?: 'default';

if (!is_dir($dir)) {
    @mkdir($dir, 0755, true);
}

$line = json_encode([
    'ts' => gmdate('c'),
    'sessionId' => $sessionId,
    'location' => (string) ($payload['location'] ?? ''),
    'message' => (string) ($payload['message'] ?? ''),
    'hypothesisId' => (string) ($payload['hypothesisId'] ?? ''),
    'runId' => (string) ($payload['runId'] ?? ''),
    'data' => is_array($payload['data'] ?? null) ? $payload['data'] : [],
], JSON_UNESCAPED_UNICODE);

@file_put_contents($dir . '/' . $sessionId . '.ndjson', $line . "\n", FILE_APPEND | LOCK_EX);

soublu_json(['ok' => true]);
