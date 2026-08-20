<?php
declare(strict_types=1);

/** Respostas REST devem ser JSON puro — avisos PHP quebram o login no navegador. */
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/lib/FinanceMysqlSchema.php';
require_once dirname(__DIR__) . '/lib/BeneficiosMysqlSchema.php';
require_once dirname(__DIR__) . '/lib/TrainingTracksMysqlSchema.php';
require_once dirname(__DIR__) . '/lib/InternalChatMysqlSchema.php';
require_once dirname(__DIR__) . '/lib/RhMysqlSchema.php';
require_once dirname(__DIR__) . '/lib/LeadsMysqlSchema.php';
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
    $t0 = microtime(true);
    $run = static function () use ($table, $method, $body, $query) {
        $pdo = soublu_pdo();
        // Ensure só no caminho das tabelas do módulo — evita INFORMATION_SCHEMA em todo GET.
        if (str_starts_with($table, 'finance_') && !soublu_finance_modulos_tables_exist($pdo)) {
            soublu_ensure_finance_modulos_tables($pdo);
        }
        if (str_starts_with($table, 'beneficios_') && !soublu_beneficios_tables_exist($pdo)) {
            soublu_ensure_beneficios_tables($pdo);
        }
        if ((str_starts_with($table, 'training_track')) && !soublu_training_tracks_tables_exist($pdo)) {
            soublu_ensure_training_tracks_tables($pdo);
        }
        if ($table === 'training_attempts') {
            soublu_ensure_training_attempts_progress_schema($pdo);
        }
        if ($table === 'training_mural') {
            soublu_ensure_training_mural_ciencia_schema($pdo);
        }
        if (str_starts_with($table, 'training_mural_') && !soublu_training_mural_engagement_tables_exist($pdo)) {
            soublu_ensure_training_mural_engagement_schema($pdo);
        }
        if (str_starts_with($table, 'internal_chat_') && !soublu_internal_chat_tables_exist($pdo)) {
            soublu_ensure_internal_chat_tables($pdo);
        }
        if (str_starts_with($table, 'rh_vaga') && !soublu_rh_vagas_tables_exist($pdo)) {
            soublu_ensure_rh_vagas_schema($pdo);
        }
        if ($table === 'rh_trilhas_cargos' && !soublu_rh_carreira_tables_exist($pdo)) {
            soublu_ensure_rh_carreira_schema($pdo);
        }
        if ($table === 'lead_unlock_requests' && !soublu_leads_unlock_schema_ok($pdo)) {
            soublu_ensure_leads_tables($pdo);
        }
        if ($table === 'leads') {
            soublu_ensure_leads_indexes($pdo);
        }
        $api = new PostgRestCompat($pdo);
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
    $ms = (int) round((microtime(true) - $t0) * 1000);
    if ($ms > 500 && !headers_sent()) {
        header('X-SOUBLU-Rest-Ms: ' . $ms);
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
