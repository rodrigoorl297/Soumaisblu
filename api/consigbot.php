<?php
/**
 * api/consigbot.php — proxy do ConsigBot-AI para o painel Sou+Blu.
 * Encaminha POST /chat para a VPS (HTTP) evitando mixed-content no HTTPS.
 * Entrada: JSON { message, history? }. Saída: JSON do bot { reply|error }.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Use POST'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw ?: '', true);
if (!is_array($payload) || !isset($payload['message']) || !is_string($payload['message'])) {
    http_response_code(400);
    echo json_encode(['error' => 'JSON inválido: message obrigatório'], JSON_UNESCAPED_UNICODE);
    exit;
}

$message = trim($payload['message']);
if ($message === '' || mb_strlen($message) > 4000) {
    http_response_code(400);
    echo json_encode(['error' => 'Mensagem inválida'], JSON_UNESCAPED_UNICODE);
    exit;
}

$history = $payload['history'] ?? [];
if (!is_array($history)) {
    $history = [];
}
// Limita histórico encaminhado (mesmo critério do frontend do bot).
$history = array_slice($history, -10);

$upstream = getenv('CONSIGBOT_URL') ?: 'http://200.234.207.122:6767/chat';
$body = json_encode([
    'message' => $message,
    'history' => $history,
], JSON_UNESCAPED_UNICODE);

$ch = curl_init($upstream);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
    CURLOPT_POSTFIELDS => $body,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_TIMEOUT => 90,
]);
$resp = curl_exec($ch);
$errno = curl_errno($ch);
$err = curl_error($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($errno || $resp === false) {
    http_response_code(502);
    echo json_encode(['error' => 'ConsigBot indisponível: ' . ($err ?: 'falha de rede')], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code($status >= 200 && $status < 600 ? $status : 502);
echo $resp;
