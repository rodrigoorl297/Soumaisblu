<?php
declare(strict_types=1);

/** Respostas REST devem ser JSON puro — avisos PHP quebram o login no navegador. */
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/lib/FinanceMysqlSchema.php';
require_once dirname(__DIR__) . '/lib/PostgRestCompat.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    soublu_json(['ok' => true], 204);
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'message' => 'Não autorizado.', 'hint' => 'Header X-API-Key'], 401);
}

$table = (string) ($_GET['table'] ?? '');
if ($table === '') {
    soublu_json(['ok' => false, 'error' => 'Tabela ausente.'], 400);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$raw = file_get_contents('php://input');
$body = $raw !== '' && $raw !== false ? json_decode($raw, true) : null;
if ($raw !== '' && $raw !== false && !is_array($body)) {
    soublu_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
}

$query = $_SERVER['QUERY_STRING'] ?? '';
$query = preg_replace('/(^|&)table=[^&]*/', '', $query) ?? $query;
$query = ltrim($query, '&');

try {
    $run = static function () use ($table, $method, $body, $query) {
        soublu_ensure_finance_modulos_tables(soublu_pdo());
        $api = new PostgRestCompat(soublu_pdo());
        return $api->handle($table, $method, $body, $query);
    };
    try {
        $rows = $run();
    } catch (Throwable $e) {
        if (!soublu_pdo_gone_away($e)) {
            throw $e;
        }
        soublu_pdo(true);
        $rows = $run();
    }
    soublu_json($rows, $method === 'POST' ? 201 : 200);
} catch (RuntimeException $e) {
    $code = $e->getCode() >= 400 && $e->getCode() < 600 ? (int) $e->getCode() : 500;
    $msg = $e->getMessage();
    if (str_contains($msg, 'Duplicate') || str_contains($msg, '1062')) {
        soublu_json(['code' => '23505', 'message' => 'Registro duplicado.'], 409);
    }
    soublu_json(['message' => $msg], $code);
} catch (Throwable $e) {
    soublu_json(['message' => $e->getMessage()], 500);
}
