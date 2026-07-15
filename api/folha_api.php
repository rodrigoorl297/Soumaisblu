<?php
/**
 * SOU+BLU — Proxy Folha de Pagamento → Sistema Web (Financeiro).
 *
 * Secrets ficam no servidor (config.sistemaweb.local.php). O frontend só
 * chama este endpoint com X-API-Key interno.
 *
 * Actions:
 *   GET/POST  ?action=status     — config/ready (sem segredos)
 *   POST      ?action=employees  — lista funcionários no Sistema Web
 *   POST      ?action=save       — envia folha gerada ao Sistema Web
 *
 * Sem config: status.ready=false e employees/save retornam 503 com setup_hint.
 * A tela local (Carregar Funcionários via DB) continua funcionando.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/HttpClient.php';
require_once __DIR__ . '/lib/SistemaWebClient.php';

$swConfig = dirname(__DIR__) . '/config.sistemaweb.local.php';
if (is_file($swConfig)) {
    require_once $swConfig;
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

function folha_json_body(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

$action = strtolower(trim((string) (
    $_GET['action']
    ?? (folha_json_body()['action'] ?? 'status')
)));

try {
    if ($action === 'status' || $action === 'health') {
        $meta = SistemaWebClient::statusMeta();
        soublu_json(array_merge([
            'ok' => true,
            'provider' => 'sistema_web',
        ], $meta));
    }

    if ($action === 'employees' || $action === 'funcionarios') {
        if (!SistemaWebClient::isConfigured() || !SistemaWebClient::pathsReady()) {
            soublu_json([
                'ok' => false,
                'error' => 'Sistema Web não pronta para listar funcionários.',
                'setup_hint' => SistemaWebClient::setupHint(),
                'configured' => SistemaWebClient::isConfigured(),
                'paths_ready' => SistemaWebClient::pathsReady(),
            ], 503);
        }
        $body = folha_json_body();
        $ctx = [
            'cnpj' => (string) ($body['cnpj'] ?? $_GET['cnpj'] ?? ''),
            'mes' => (string) ($body['mes'] ?? $_GET['mes'] ?? ''),
            'empresa_id' => (string) ($body['empresa_id'] ?? $_GET['empresa_id'] ?? ''),
            'protocolo' => (string) ($body['protocolo'] ?? $_GET['protocolo'] ?? ''),
        ];
        if ($ctx['mes'] === '' && $ctx['cnpj'] === '' && $ctx['empresa_id'] === '') {
            soublu_json(['ok' => false, 'error' => 'Informe cnpj/empresa_id e mes.'], 400);
        }
        $client = new SistemaWebClient();
        $res = $client->listEmployees($ctx);
        soublu_json([
            'ok' => true,
            'source' => 'sistema_web',
            'employees' => $res['employees'],
            'count' => count($res['employees']),
        ]);
    }

    if ($action === 'save' || $action === 'sync' || $action === 'gerar') {
        if (!SistemaWebClient::isConfigured() || !SistemaWebClient::pathsReady()) {
            soublu_json([
                'ok' => false,
                'error' => 'Sistema Web não pronta para gravar folha.',
                'setup_hint' => SistemaWebClient::setupHint(),
                'configured' => SistemaWebClient::isConfigured(),
                'paths_ready' => SistemaWebClient::pathsReady(),
            ], 503);
        }
        $body = folha_json_body();
        if ($body === []) {
            soublu_json(['ok' => false, 'error' => 'Body JSON obrigatório.'], 400);
        }
        $client = new SistemaWebClient();
        $remote = $client->saveFolha($body);
        soublu_json([
            'ok' => true,
            'source' => 'sistema_web',
            'remote' => $remote,
        ]);
    }

    soublu_json(['ok' => false, 'error' => 'Action desconhecida: ' . $action], 400);
} catch (Throwable $e) {
    soublu_json([
        'ok' => false,
        'error' => $e->getMessage(),
        'setup_hint' => SistemaWebClient::setupHint(),
    ], 500);
}
