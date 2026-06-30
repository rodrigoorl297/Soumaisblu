<?php
/**
 * Deploy remoto de arquivos permitidos (API key). Uso único para atualizar o site sem FTP manual.
 * POST JSON: { "path": "js/proposals.js", "content_base64": "..." }
 * GET ?action=list — lista paths permitidos
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

$allowed = [
    'api/bootstrap.php',
    'api/rest-v1.php',
    'api/rest-ping.php',
    'api/debug-session-log.php',
    'api/rest/index.php',
    'api/lib/FileStorage.php',
    'api/lib/FinanceMysqlSchema.php',
    'api/lib/PostgRestCompat.php',
    'api/lib/EvolutionClient.php',
    'api/lib/WhatsAppRepository.php',
    'api/lib/SupabaseClient.php',
    'api/lib/SupabaseLegacy.php',
    'api/repair-proposal-attachments.php',
    'api/file.php',
    'api/upload.php',
    'api/whatsapp_api.php',
    'api/setup-stack.php',
    'api/migrate-whatsapp.php',
    'api/remote-deploy.php',
    'js/proposals.js',
    'js/proposta-credito.js',
    'js/ui.js',
    'js/profile.js',
    'js/partners.js',
    'js/partner-ops.js',
    'js/partners-ui.js',
    'js/clients.js',
    'js/db.js',
    'js/withdrawal-rules.js',
    'js/withdrawal-flow.js',
    'js/db-connect.js',
    'js/config.js',
    'js/tickets.js',
    'js/auth.js',
    'js/login.js',
    'js/employee.js',
    'js/admin.js',
    'js/sales-ranking.js',
    'js/whatsapp-chat.js',
    'js/whatsapp-kanban.js',
    'js/bolao-copa.js',
    'js/painel-sonhos.js',
    'css/bolao-copa.css',
    'css/global.css',
    'css/whatsapp-chat.css',
    'admin.html',
    'pages/admin.html',
    'employee.html',
    'pages/employee.html',
    'financeiro.html',
    'pages/financeiro.html',
    'financeiro-sections.html',
    'pages/financeiro-sections.html',
    'pages/whatsapp.html',
    'whatsapp.html',
    'index.html',
    'config.supabase.local.php',
    'api/fontedata.php',
    'api/migrate-rh-core.php',
    'api/migrate-bolao-copa.php',
    'api/credito_api.php',
    'api/credito_pix_auto_api.php',
    'api/pix_api.php',
    'api/lib/EfiPayPixAutomatico.php',
    'api/lib/EfiPayClient.php',
    'api/migrate-credit-proposals.php',
    'api/lib/CreditProposalMysqlSchema.php',
    'api/lib/CreditProposalMysqlRepository.php',
    'api/lib/CreditProposalRepository.php',
    'js/credito-propostas-api.js',
    'js/financeiro-credito.js',
    'js/esteira-credito.js',
    'js/pix-automatico-credito.js',
    'js/financeiro-propostas.js',
    'js/fiscal-parceiro.js',
    'js/fontedata.js',
    'js/rh-manager.js',
    'js/contestacao.js',
    'js/juridico-manager.js',
    'rh-manager.html',
    'pages/rh-manager.html',
    'pages/juridico-manager.html',
    'config.pix.local.php',
];

$action = (string) ($_GET['action'] ?? '');
if ($action === 'list') {
    soublu_json(['ok' => true, 'allowed' => $allowed]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    soublu_json(['ok' => false, 'error' => 'POST JSON com path e content_base64'], 405);
}

$raw = file_get_contents('php://input');
$data = json_decode($raw ?: '{}', true);
$path = str_replace('\\', '/', trim((string) ($data['path'] ?? '')));
$b64 = (string) ($data['content_base64'] ?? '');

if ($path === '' || $b64 === '' || !in_array($path, $allowed, true)) {
    soublu_json(['ok' => false, 'error' => 'path inválido ou não permitido'], 400);
}

$body = base64_decode($b64, true);
if ($body === false || $body === '') {
    soublu_json(['ok' => false, 'error' => 'content_base64 inválido'], 400);
}

$root = dirname(__DIR__);
$dest = $root . '/' . $path;
$dir = dirname($dest);
if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
    soublu_json(['ok' => false, 'error' => 'Não foi criar pasta'], 500);
}

if (file_put_contents($dest, $body) === false) {
    soublu_json(['ok' => false, 'error' => 'Falha ao gravar'], 500);
}

soublu_json(['ok' => true, 'path' => $path, 'bytes' => strlen($body)]);
