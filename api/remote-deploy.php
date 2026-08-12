<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$allowed = [
    'api/bootstrap.php',
    'api/rest-v1.php',
    'api/rest-ping.php',
    'api/health.php',
    'api/debug-session-log.php',
    'api/rest/index.php',
    'api/lib/FileStorage.php',
    'api/lib/FinanceMysqlSchema.php',
    'api/lib/BeneficiosMysqlSchema.php',
    'api/lib/LeadsMysqlSchema.php',
    'api/lib/InternalChatMysqlSchema.php',
    'api/lib/TrainingTracksMysqlSchema.php',
    'api/migrate-beneficios-whatsapp.php',
    'api/migrate-internal-chat.php',
    'api/migrate-training-tracks.php',
    'api/migrate-training-progress.php',
    'api/migrate-mural-image.php',
    'api/migrate-mural-engagement.php',
    'api/migrate-mural-ciencia.php',
    'api/lib/PostgRestCompat.php',
    'api/lib/EvolutionClient.php',
    'api/lib/ZApiClient.php',
    'api/lib/WhaticketClient.php',
    'api/lib/WhatsAppClientFactory.php',
    'api/lib/WhatsAppRepository.php',
    'api/lib/HttpClient.php',
    'api/lib/SistemaWebClient.php',
    'api/folha_api.php',
    'config.sistemaweb.local.php.example',
    'api/lib/SupabaseClient.php',
    'api/lib/SupabaseLegacy.php',
    'api/repair-proposal-attachments.php',
    'api/repair-partner-attachments.php',
    'api/scan-partner-docs.php',
    'api/repair-vendor-comissao.php',
    'api/repair-user-roles.php',
    'api/repair-beneficios-ids.php',
    'api/purge-vendor-comissao-history.php',
    'api/purge-eleva-transactions.php',
    'api/attachment-proxy.php',
    'api/file.php',
    'api/upload.php',
    'api/whatsapp_api.php',
    'api/setup-stack.php',
    'api/migrate-whatsapp.php',
    'api/migrate-whaticket-map.php',
    'api/remote-deploy.php',
    'js/proposals.js',
    'js/simulacao.js',
    'js/proposta-credito.js',
    'js/ui.js',
    'js/profile.js',
    'js/partners.js',
    'js/partner-ops.js',
    'js/partners-ui.js',
    'js/clients.js',
    'js/admin-beneficios.js',
    'js/clube-beneficios.js',
    'js/pedido-alert.js',
    'js/db.js',
    'js/withdrawal-rules.js',
    'js/withdrawal-flow.js',
    'js/db-connect.js',
    'js/base-path.js',
    'js/config.js',
    'js/tickets.js',
    'js/auth.js',
    'js/login.js',
    'js/employee.js',
    'js/admin.js',
    'js/sales-ranking.js',
    'js/internal-chat.js',
    'css/internal-chat.css',
    'js/monitoramento.js',
    'js/vendor-tier-points.js',
    'js/attendance-penalty.js',
    'js/rh-relatorios.js',
    'js/whatsapp-chat.js',
    'js/wa-audio-recorder.js',
    'js/wa-emoji-mart.js',
    'js/whatsapp-kanban.js',
    'js/bolao-copa.js',
    'js/painel-sonhos.js',
    'js/trainings.js',
    'js/training-tracks.js',
    'css/painel-sonhos.css',
    'css/trainings.css',
    'css/training-tracks.css',
    'css/bolao-copa.css',
    'css/global.css',
    'css/layout.css',
    'css/variables.css',
    'css/folha-pagamento.css',
    'css/whatsapp-chat.css',
    'css/whatsapp-app.css',
    'css/bootstrap.min.css',
    'js/bootstrap.bundle.min.js',
    'js/folha-pagamento.js',
    'js/leads-import.js',
    'js/vendor/xlsx.full.min.js',
    'pages/folha-pagamento.html',
    'pages/treinamentos.html',
    'pages/leads-manager.html',
    'leads-manager.html',
    'pages/leads-employee.html',
    'leads-employee.html',
    'css/leads.css',
    'pages/admin-beneficios.html',
    'admin.html',
    'clube-beneficios.html',
    'pages/admin.html',
    'pages/clube-beneficios.html',
    'pages/admin-beneficios.html',
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
    'api/migrate-rh-hierarchy.php',
    'api/migrate-rh-justif-hours.php',
    'api/migrate-rh-cbo.php',
    'api/migrate-rh-resume-avaliacao.php',
    'api/migrate-rh-vagas.php',
    'api/lib/RhMysqlSchema.php',
    'pages/rh-justificativa-section.html',
    'rh-justificativa-section.html',
    'css/rh-modules.css',
    'css/clube-beneficios.css',
    'images/zs-clube-beneficios.png',
    'images/logo.svg',
    'images/logo.png',
    'images/blu-logo.png',
    'js/rh-ui.js',
    'js/rh-justificativa-boot.js',
    'js/rh-vagas.js',
    'api/migrate-users-columns.php',
    'api/migrate-users-acesso-clube.php',
    'api/migrate-users-cc-money.php',
    'api/migrate-finance-proposta-ops.php',
    'api/migrate-proposals-comissao.php',
    'api/migrate-bolao-copa.php',
    'api/credito_api.php',
    'api/credito_pix_auto_api.php',
    'api/recover-dismissed.php',
    'api/pix_api.php',
    'api/lib/EfiPayPixAutomatico.php',
    'api/lib/EfiPayClient.php',
    'api/migrate-credit-proposals.php',
    'api/lib/CreditProposalMysqlSchema.php',
    'api/lib/CreditProposalMysqlRepository.php',
    'api/lib/CreditProposalRepository.php',
    'js/credito-propostas-api.js',
    'js/credito-fluxo.js',
    'js/pix-autorizar-employee.js',
    'js/financeiro-credito.js',
    'js/esteira-credito.js',
    'js/pix-automatico-credito.js',
    'js/financeiro-propostas.js',
    'js/financeiro-boot.js',
    'js/financeiro-page.js',
    'js/financeiro-reembolso.js',
    'js/fornecedor-financeiro.js',
    'js/conta-corrente.js',
    'js/fiscal-parceiro.js',
    'js/fontedata.js',
    'js/rh-manager.js',
    'js/rh-ops.js',
    'js/meetings.js',
    'js/contestacao.js',
    'js/juridico-manager.js',
    'rh-manager.html',
    'pages/rh-manager.html',
    'pages/juridico-manager.html',
    'config.pix.local.php',
    'api/mercadinho-charge.php',
    'api/boleto-webhook.php',
    'api/hyperflow-boleto.php',
    'api/nextbilling.php',
    'api/nextbilling-debug.php',
    'api/clear-ghost-leads.php',
    'api/bootstrap.php',
    'js/proposals.js',
    'js/leads-db.js',
    'js/leads-manager.js',
    'js/leads-employee.js',
    'config.boleto.local.php.example',
    'config.nextbilling.local.php.example',
    'config.nextbilling.local.php',
    'docs/n8n-boleto-validado-hyper.json',
    'docs/hyperflow-boleto-3dias.md',
    '.htaccess',
];

if (($_GET['action'] ?? '') === 'list') {
    soublu_json(['ok' => true, 'allowed' => $allowed]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    soublu_json(['ok' => false, 'error' => 'POST JSON com path e content_base64'], 405);
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    soublu_json(['ok' => false, 'error' => 'POST JSON com path e content_base64'], 400);
}

$path = str_replace('\\', '/', trim((string) ($body['path'] ?? '')));
$b64 = (string) ($body['content_base64'] ?? '');
$content = $b64 !== '' ? base64_decode($b64, true) : false;

if ($path === '' || $content === false) {
    soublu_json(['ok' => false, 'error' => 'POST JSON com path e content_base64'], 400);
}

if (!in_array($path, $allowed, true)) {
    soublu_json(['ok' => false, 'error' => 'path invalido ou nao permitido'], 400);
}

$root = dirname(__DIR__);
$dest = $root . '/' . $path;
$parent = dirname($dest);
if (!is_dir($parent) && !mkdir($parent, 0755, true) && !is_dir($parent)) {
    soublu_json(['ok' => false, 'error' => 'Nao foi possivel criar pasta destino.'], 500);
}

if (file_put_contents($dest, $content) === false) {
    soublu_json(['ok' => false, 'error' => 'Falha ao gravar arquivo.'], 500);
}

soublu_json(['ok' => true, 'path' => $path, 'bytes' => strlen($content)]);
