<?php
/**
 * SOU+BLU — Diagnóstico e setup da stack (WhatsApp + DB + Evolution).
 *
 * GET ?action=status  — verifica componentes (requer X-API-Key)
 * GET ?action=migrate — roda migrate-whatsapp (MySQL ou valida Supabase)
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/EvolutionClient.php';
require_once __DIR__ . '/lib/WhatsAppRepository.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: X-API-Key, apikey');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

$action = strtolower(trim((string) ($_GET['action'] ?? 'status')));

function stack_check_mysql(): array
{
    try {
        $pdo = soublu_pdo();
        $pdo->query('SELECT 1');
        $tables = [];
        foreach (['whatsapp_instances', 'whatsapp_chats', 'whatsapp_messages'] as $t) {
            $st = $pdo->prepare(
                'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
            );
            $st->execute([$t]);
            $tables[$t] = (int) $st->fetchColumn() > 0;
        }
        return ['ok' => true, 'tables' => $tables];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

function stack_check_supabase(): array
{
    if (!SupabaseClient::globalsConfigured()) {
        return ['ok' => false, 'configured' => false, 'error' => 'SUPABASE_SERVICE_KEY ausente'];
    }
    try {
        $sb = soublu_supabase_client();
        $tables = [];
        foreach (['whatsapp_instances', 'whatsapp_chats', 'whatsapp_messages'] as $t) {
            $tables[$t] = $sb->tableExists($t);
        }
        return ['ok' => true, 'configured' => true, 'url' => defined('SUPABASE_URL') ? SUPABASE_URL : null, 'tables' => $tables];
    } catch (Throwable $e) {
        return ['ok' => false, 'configured' => true, 'error' => $e->getMessage()];
    }
}

function stack_check_evolution(): array
{
    $configured = EvolutionClient::isConfigured();
    $enabled = !defined('EVOLUTION_ENABLED') || EVOLUTION_ENABLED !== false;
    $reachable = null;
    $error = null;
    if ($configured && $enabled) {
        try {
            $evo = new EvolutionClient();
            $evo->request('GET', '/');
            $reachable = true;
        } catch (Throwable $e) {
            $reachable = false;
            $error = $e->getMessage();
        }
    }
    return [
        'configured' => $configured,
        'enabled' => $enabled,
        'reachable' => $reachable,
        'url' => defined('EVOLUTION_API_URL') ? EVOLUTION_API_URL : null,
        'error' => $error,
        'webhook_hint' => wa_site_url_for_stack() . '/api/whatsapp_api.php?action=webhook',
    ];
}

function wa_site_url_for_stack(): string
{
    if (defined('SITE_URL') && trim((string) SITE_URL) !== '') {
        return rtrim((string) SITE_URL, '/');
    }
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . $host;
}

if ($action === 'migrate') {
    $_SERVER['REQUEST_METHOD'] = 'GET';
    require __DIR__ . '/migrate-whatsapp.php';
    exit;
}

$waBackend = soublu_wa_db_backend();
$mysql = stack_check_mysql();
$supabase = stack_check_supabase();
$evolution = stack_check_evolution();

$waTablesOk = $waBackend === 'supabase'
    ? ($supabase['tables']['whatsapp_instances'] ?? false)
        && ($supabase['tables']['whatsapp_chats'] ?? false)
        && ($supabase['tables']['whatsapp_messages'] ?? false)
    : ($mysql['tables']['whatsapp_instances'] ?? false)
        && ($mysql['tables']['whatsapp_chats'] ?? false)
        && ($mysql['tables']['whatsapp_messages'] ?? false);

$ready = $evolution['configured'] && $evolution['enabled'] && $waTablesOk;

soublu_json([
    'ok' => true,
    'ready_for_whatsapp' => $ready,
    'site_url' => wa_site_url_for_stack(),
    'wa_db_backend' => $waBackend,
    'mysql' => $mysql,
    'supabase' => $supabase,
    'evolution' => $evolution,
    'config_files' => [
        'config.db.local.php' => is_file(dirname(__DIR__) . '/config.db.local.php'),
        'config.pix.local.php' => is_file(dirname(__DIR__) . '/config.pix.local.php'),
        'config.evolution.local.php' => is_file(dirname(__DIR__) . '/config.evolution.local.php'),
        'config.stack.local.php' => is_file(dirname(__DIR__) . '/config.stack.local.php'),
        'config.supabase.local.php' => is_file(dirname(__DIR__) . '/config.supabase.local.php'),
    ],
    'next_steps' => $ready ? [] : array_values(array_filter([
        !$evolution['configured'] ? 'Criar config.evolution.local.php (ou config.stack.local.php) com Evolution VPS + API key' : null,
        !$waTablesOk ? 'Rodar GET /api/setup-stack.php?action=migrate (ou SQL Supabase)' : null,
        $waBackend === 'supabase' && !($supabase['configured'] ?? false)
            ? 'Preencher SUPABASE_SERVICE_KEY em config.supabase.local.php' : null,
    ])),
]);
