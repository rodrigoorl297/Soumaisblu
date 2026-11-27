<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/FinanceSession.php';

header('Cache-Control: no-store');
header('Content-Type: application/json; charset=utf-8');

function mercantil_reply(array $body, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function mercantil_request(string $url, ?array $body = null, string $token = ''): array
{
    $headers = ['Accept: application/json'];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
    }
    if ($token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body === null ? '' : json_encode($body),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
    ]);
    $response = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    return [$status, is_string($response) ? json_decode($response, true) : null];
}

function mercantil_cpf(string $cpf): bool
{
    if (!preg_match('/^[0-9]{11}$/D', $cpf) || $cpf === str_repeat($cpf[0], 11)) {
        return false;
    }
    for ($length = 9; $length <= 10; $length++) {
        $sum = 0;
        for ($i = 0; $i < $length; $i++) {
            $sum += (int) $cpf[$i] * ($length + 1 - $i);
        }
        if (($sum * 10 % 11) % 10 !== (int) $cpf[$length]) {
            return false;
        }
    }
    return true;
}

function mercantil_id(mixed $value): ?string
{
    return is_string($value) && preg_match('/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iD', $value)
        ? strtolower($value)
        : null;
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        mercantil_reply(['message' => 'Método inválido.'], 405);
    }
    soublu_load_local_configs();
    $action = $_GET['action'] ?? '';
    $callbackKey = (string) getenv('MERCANTIL_CALLBACK_KEY');

    if ($action === 'callback') {
        if (strlen($callbackKey) < 32 || !hash_equals($callbackKey, $_SERVER['HTTP_X_MERCANTIL_CALLBACK_KEY'] ?? '')) {
            mercantil_reply(['message' => 'Acesso negado.'], 403);
        }
    } else {
        if (!in_array($action, ['start', 'status'], true)) {
            mercantil_reply(['message' => 'Ação inválida.'], 404);
        }
        $user = soublu_finance_user(soublu_pdo(), true);
        soublu_finance_csrf();
        session_write_close();
    }

    $raw = file_get_contents('php://input', false, null, 0, 32769);
    $body = is_string($raw) && strlen($raw) <= 32768 ? json_decode($raw, true) : null;
    if (!is_array($body)) {
        mercantil_reply(['message' => 'Corpo inválido.'], 400);
    }

    $pdo = soublu_pdo();
    $pdo->exec('CREATE TABLE IF NOT EXISTS mercantil_pre_consultas (
        id CHAR(36) PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL,
        cpf_hash CHAR(64) NOT NULL,
        concluido TINYINT(1) NOT NULL DEFAULT 0,
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX (criado_em)
    )');

    if ($action === 'callback') {
        $id = mercantil_id($body['PropostaProspectId'] ?? $body['propostaProspectId'] ?? null);
        $cpf = $body['CpfCliente'] ?? $body['cpfCliente'] ?? null;
        $concluido = $body['Concluido'] ?? $body['concluido'] ?? null;
        if (!$id || (!is_int($cpf) && !is_string($cpf)) || !preg_match('/^[0-9]{1,11}$/D', (string) $cpf) || !is_bool($concluido)) {
            mercantil_reply(['message' => 'Retorno inválido.'], 400);
        }
        $stmt = $pdo->prepare('SELECT cpf_hash FROM mercantil_pre_consultas WHERE id = ?');
        $stmt->execute([$id]);
        $hash = $stmt->fetchColumn();
        if ($hash === false) {
            mercantil_reply(['message' => 'Consulta indisponível.'], 503);
        }
        if (!hash_equals($hash, hash_hmac('sha256', str_pad((string) $cpf, 11, '0', STR_PAD_LEFT), $callbackKey))) {
            mercantil_reply(['message' => 'Retorno inválido.'], 400);
        }
        if ($concluido) {
            $stmt = $pdo->prepare('UPDATE mercantil_pre_consultas SET concluido = 1 WHERE id = ?');
            $stmt->execute([$id]);
        }
        mercantil_reply(['ok' => true]);
    }

    if ($action === 'status') {
        $stmt = $pdo->prepare('SELECT concluido FROM mercantil_pre_consultas WHERE id = ? AND user_id = ?');
        $stmt->execute([mercantil_id($body['id'] ?? null), $user['id']]);
        $status = $stmt->fetchColumn();
        if ($status === false) {
            mercantil_reply(['message' => 'Consulta não encontrada.'], 404);
        }
        mercantil_reply(['concluido' => (bool) $status]);
    }

    $cpf = $body['cpf'] ?? '';
    $beneficio = $body['beneficio'] ?? '';
    if (!is_string($cpf) || !mercantil_cpf($cpf)) {
        mercantil_reply(['message' => 'Informe um CPF válido.'], 400);
    }
    if (!is_string($beneficio) || ($beneficio !== '' && !preg_match('/^[0-9]{1,15}$/D', $beneficio))) {
        mercantil_reply(['message' => 'Informe um número de benefício válido.'], 400);
    }

    $clientId = (string) getenv('MERCANTIL_CLIENT_ID');
    $clientSecret = (string) getenv('MERCANTIL_CLIENT_SECRET');
    if ($clientId === '' || $clientSecret === '' || strlen($callbackKey) < 32) {
        mercantil_reply(['message' => 'A integração com o Mercantil ainda não foi configurada.'], 503);
    }

    $base = 'https://apihml.mercantil.com.br:8443';
    $query = http_build_query(['grant_type' => 'client_credentials', 'client_id' => $clientId, 'client_secret' => $clientSecret]);
    [$status, $auth] = mercantil_request($base . '/auth/oauth/v2/token?' . $query);
    $token = $auth['access_token'] ?? null;
    if ($status !== 200 || !is_string($token) || !preg_match('/^[A-Za-z0-9._~+\/=\-]+$/D', $token)) {
        mercantil_reply(['message' => 'Não foi possível autenticar no Mercantil.'], 502);
    }

    $request = ['Cpf' => (int) $cpf];
    if ($beneficio !== '') {
        $request['NumeroBeneficio'] = (int) $beneficio;
    }
    [$status, $result] = mercantil_request(
        $base . '/MB.API.CSN.PropostasExternasCP/api/Simulacoes/IniciarPreSimulacao',
        $request,
        $token
    );
    if ($status === 429) {
        mercantil_reply(['message' => 'O limite de consultas do Mercantil foi atingido.'], 429);
    }
    $id = mercantil_id($result['Id'] ?? $result['id'] ?? null);
    if ($status !== 200 || !$id) {
        mercantil_reply(['message' => 'O Mercantil não confirmou o início da consulta.'], 502);
    }
    $pdo->exec('DELETE FROM mercantil_pre_consultas WHERE criado_em < CURRENT_TIMESTAMP - INTERVAL 1 DAY');
    $stmt = $pdo->prepare('INSERT INTO mercantil_pre_consultas (id, user_id, cpf_hash) VALUES (?, ?, ?)');
    $stmt->execute([$id, $user['id'], hash_hmac('sha256', $cpf, $callbackKey)]);
    mercantil_reply(['id' => $id], 202);
} catch (Throwable $error) {
    $status = $error instanceof RuntimeException ? $error->getCode() : 0;
    if (in_array($status, [401, 403], true)) {
        mercantil_reply(['message' => 'Confirme seu acesso para consultar o cliente.'], $status);
    }
    mercantil_reply(['message' => 'A consulta está indisponível no momento.'], 503);
}
