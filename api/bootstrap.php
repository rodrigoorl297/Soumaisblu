<?php
declare(strict_types=1);

// Segurança: Oculta erros do PHP para evitar vazamento de diretórios do servidor
ini_set('display_errors', '0');
error_reporting(0);

// Horário oficial do sistema: Brasília (UTC-3)
if (function_exists('date_default_timezone_set')) {
    date_default_timezone_set('America/Sao_Paulo');
}

/** Carrega configs locais (MySQL, PIX, Supabase, Evolution). */
function soublu_config_root(): string
{
    return dirname(__DIR__);
}

function soublu_load_local_configs(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;
    $root = soublu_config_root();

    $stack = $root . '/config.stack.local.php';
    if (is_file($stack)) {
        require_once $stack;
    }

    foreach (['config.db.local.php', 'config.pix.local.php', 'config.supabase.local.php', 'config.evolution.local.php', 'config.zapi.local.php', 'config.whaticket.local.php', 'config.sistemaweb.local.php', 'config.boleto.local.php', 'config.nextbilling.local.php'] as $file) {
        $path = $root . '/' . $file;
        if (is_file($path)) {
            require_once $path;
        }
    }
}

/** Metadados da config Evolution (arquivo usado + dica de setup). */
function soublu_evolution_config_meta(): array
{
    $root = soublu_config_root();
    $evoFile = $root . '/config.evolution.local.php';
    $stackFile = $root . '/config.stack.local.php';
    $hasEvoFile = is_file($evoFile);
    $hasStackFile = is_file($stackFile);

    $source = null;
    if ($hasEvoFile) {
        $source = 'config.evolution.local.php';
    } elseif ($hasStackFile && defined('EVOLUTION_API_URL') && defined('EVOLUTION_API_KEY')) {
        $source = 'config.stack.local.php';
    }

    $configured = class_exists('EvolutionClient', false)
        ? EvolutionClient::isConfigured()
        : soublu_evolution_is_configured();

    $hint = null;
    if (!$configured) {
        if (!$hasEvoFile && !$hasStackFile) {
            $hint = 'Copie config.evolution.local.php.example para config.evolution.local.php na raiz do site (mesma pasta que api/) e preencha EVOLUTION_API_URL e EVOLUTION_API_KEY. Alternativa: config.stack.local.php a partir de config.stack.local.php.example.';
        } elseif ($hasEvoFile || $hasStackFile) {
            $hint = 'Arquivo de config encontrado, mas EVOLUTION_API_URL / EVOLUTION_API_KEY estão vazios ou com valores de exemplo. Edite ' . ($source ?? 'config.evolution.local.php') . ' no servidor.';
        }
    }

    return [
        'configured' => $configured,
        'enabled' => !defined('EVOLUTION_ENABLED') || EVOLUTION_ENABLED !== false,
        'source' => $source,
        'files' => [
            'config.evolution.local.php' => $hasEvoFile,
            'config.stack.local.php' => $hasStackFile,
        ],
        'setup_hint' => $hint,
    ];
}

/** Checagem leve antes de EvolutionClient estar disponível. */
function soublu_evolution_is_configured(): bool
{
    if (defined('EVOLUTION_ENABLED') && EVOLUTION_ENABLED === false) {
        return false;
    }
    $url = defined('EVOLUTION_API_URL') ? trim((string) EVOLUTION_API_URL) : '';
    $key = defined('EVOLUTION_API_KEY') ? trim((string) EVOLUTION_API_KEY) : '';
    if ($url === '' || $key === '') {
        return false;
    }
    foreach (['SEU_SERVIDOR', 'SEU_SERVIDOR_EVOLUTION', 'seudominio'] as $needle) {
        if (stripos($url, $needle) !== false) {
            return false;
        }
    }
    foreach (['SUA_EVOLUTION', 'troque_esta', 'COLE_A_CHAVE', 'change_me'] as $needle) {
        if (stripos($key, $needle) !== false) {
            return false;
        }
    }
    return true;
}

soublu_load_local_configs();

function soublu_pdo_gone_away(Throwable $e): bool
{
    return (bool) preg_match('/2006|2013|gone away|Lost connection|server has gone away/i', $e->getMessage());
}

function soublu_pdo(bool $reset = false): PDO
{
    static $pdo = null;
    if ($reset) {
        $pdo = null;
    }
    if ($pdo instanceof PDO) {
        static $lastPingAt = 0;
        $now = time();
        if ($now - $lastPingAt < 25) {
            return $pdo;
        }
        try {
            $pdo->query('SELECT 1');
            $lastPingAt = $now;
            return $pdo;
        } catch (Throwable $e) {
            if (!soublu_pdo_gone_away($e)) {
                throw $e;
            }
            $pdo = null;
        }
    }
    if (!defined('DB_HOST') || !defined('DB_NAME') || !defined('DB_USER')) {
        throw new RuntimeException('config.db.local.php ausente ou incompleto.');
    }
    $charset = defined('DB_CHARSET') ? DB_CHARSET : 'utf8mb4';
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . $charset;
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];
    if (defined('PDO::MYSQL_ATTR_CONNECT_TIMEOUT')) {
        $options[PDO::MYSQL_ATTR_CONNECT_TIMEOUT] = 5;
    }
    $pdo = new PDO($dsn, DB_USER, defined('DB_PASS') ? DB_PASS : '', $options);
    $pdo->exec('SET NAMES ' . (preg_match('/^[a-z0-9_]+$/', $charset) ? $charset : 'utf8mb4'));
    try {
        $pdo->exec("SET time_zone = '-03:00'");
    } catch (Throwable $e) {
        try {
            $pdo->exec("SET time_zone = 'America/Sao_Paulo'");
        } catch (Throwable $e2) {
            // hosting pode bloquear — PHP já usa America/Sao_Paulo
        }
    }
    try {
        $pdo->exec('SET SESSION wait_timeout = 28800');
    } catch (Throwable $e) {
        // hosting pode bloquear — ignora
    }
    return $pdo;
}

/**
 * Executa uma chamada à REST API (PostgREST) do Supabase v2 — usado exclusivamente pelo WhatsApp.
 *
 * @param string      $method  GET | POST | PATCH | DELETE
 * @param string      $table   Nome da tabela (ex: 'wa_chats')
 * @param array       $query   Filtros PostgREST como query-string (ex: ['user_id=eq.123','order=last_message_at.desc'])
 * @param array|null  $body    Payload JSON para POST/PATCH
 * @param bool        $single  Se true, adiciona Prefer: return=representation e Accept: application/vnd.pgrst.object+json
 * @return array{ok:bool, data:mixed, status:int}
 */
function soublu_wa_supabase(
    string $method,
    string $table,
    array  $query  = [],
    ?array $body   = null,
    bool   $single = false
): array {
    if (!defined('SUPABASE_V2_URL') || !defined('SUPABASE_V2_SERVICE_KEY')) {
        return ['ok' => false, 'data' => null, 'status' => 0, 'error' => 'Supabase v2 não configurado'];
    }

    $base = rtrim((string) SUPABASE_V2_URL, '/') . '/rest/v1/' . $table;
    if ($query) {
        $base .= '?' . implode('&', $query);
    }

    $headers = [
        'apikey: '        . SUPABASE_V2_SERVICE_KEY,
        'Authorization: Bearer ' . SUPABASE_V2_SERVICE_KEY,
        'Content-Type: application/json',
    ];

    if ($single || in_array($method, ['POST', 'PATCH'], true)) {
        $headers[] = 'Prefer: return=representation';
    }
    if ($single) {
        $headers[] = 'Accept: application/vnd.pgrst.object+json';
    }

    $ch = curl_init($base);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    }

    $raw    = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err    = curl_error($ch);
    curl_close($ch);

    if ($err) {
        return ['ok' => false, 'data' => null, 'status' => 0, 'error' => $err];
    }

    $decoded = json_decode((string) $raw, true);
    $ok      = $status >= 200 && $status < 300;

    return ['ok' => $ok, 'data' => $decoded, 'status' => $status];
}

function soublu_api_auth_ok(): bool
{
    $expected = defined('API_INTERNAL_KEY') ? (string) API_INTERNAL_KEY : '';
    if ($expected === '') {
        return false;
    }
    $token = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if ($token === '' && isset($_GET['apikey'])) {
        $token = (string) $_GET['apikey'];
    }
    if ($token === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strtolower((string) $k) === 'x-api-key') {
                $token = (string) $v;
                break;
            }
        }
    }
    return hash_equals($expected, (string) $token);
}

function soublu_json(array $data, int $code = 200): void
{
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization, Prefer, X-Soublu-Actor');
        header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
