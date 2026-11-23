<?php
declare(strict_types=1);

/**
 * consulta-cnpj.php — consulta FonteData após o cadastro da landing.
 * Só aceita POST com id de um lp_parceiros existente (evita gastar crédito à toa).
 * A resposta HTTP nunca inclui os dados da consulta; grava em fontedata_result.
 */

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    soublu_json(['ok' => false, 'error' => 'Use POST'], 405);
}

$raw = file_get_contents('php://input');
$input = json_decode((string) $raw, true);
if (!is_array($input)) {
    soublu_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
}

$id = $input['id'] ?? null;
$digits = preg_replace('/\D/', '', (string) ($input['cnpj'] ?? '')) ?? '';
if (strlen($digits) !== 14) {
    soublu_json(['ok' => true]);
}

if (!$id) {
    soublu_json(['ok' => false, 'error' => 'id é obrigatório.'], 400);
}

try {
    $pdo = soublu_pdo();
} catch (Throwable $e) {
    soublu_json(['ok' => true]);
}

$chk = $pdo->prepare('SELECT id, fontedata_result FROM lp_parceiros WHERE id = :id LIMIT 1');
$chk->execute([':id' => $id]);
$row = $chk->fetch(PDO::FETCH_ASSOC);
if (!$row) {
    soublu_json(['ok' => false, 'error' => 'Cadastro não encontrado.'], 404);
}
if (!empty($row['fontedata_result'])) {
    soublu_json(['ok' => true]);
}

$apiKey = defined('FONTE_DATA_API_KEY') ? trim((string) FONTE_DATA_API_KEY) : '';
if ($apiKey === '' || $apiKey === 'SUA-CHAVE-FONTEDATA') {
    error_log('consulta-cnpj: FONTE_DATA_API_KEY não configurada.');
    soublu_json(['ok' => true]);
}

$base = defined('FONTE_DATA_API_BASE') && trim((string) FONTE_DATA_API_BASE) !== ''
    ? rtrim((string) FONTE_DATA_API_BASE, '/')
    : 'https://app.fontedata.com/api/v1/consulta';

$ch = curl_init($base . '/cadastro-pj-plus?cnpj=' . $digits);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['X-API-Key: ' . $apiKey],
    CURLOPT_TIMEOUT => 15,
]);
$response = curl_exec($ch);
if (curl_errno($ch)) {
    error_log('consulta-cnpj FonteData: ' . curl_error($ch));
    curl_close($ch);
    soublu_json(['ok' => true]);
}
curl_close($ch);
$companyData = json_decode((string) $response, true);
$consultadoEm = date('c');

try {
    $stmt = $pdo->prepare(
        'UPDATE lp_parceiros SET fontedata_result = :result, fontedata_consultado_em = :consultado_em WHERE id = :id'
    );
    $stmt->execute([
        ':result' => json_encode($companyData, JSON_UNESCAPED_UNICODE),
        ':consultado_em' => $consultadoEm,
        ':id' => $id,
    ]);
} catch (Throwable $e) {
    error_log('consulta-cnpj save: ' . $e->getMessage());
}

soublu_json(['ok' => true]);
