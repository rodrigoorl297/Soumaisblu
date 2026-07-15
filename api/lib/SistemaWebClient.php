<?php
declare(strict_types=1);

/**
 * Cliente HTTP para a API externa "Sistema Web" (folha / Financeiro).
 *
 * Credenciais ficam só no servidor (config.sistemaweb.local.php).
 * Sem BASE_URL + token + paths, isConfigured() / pathsReady() retornam false
 * e o proxy não chama a API remota.
 */
final class SistemaWebClient
{
    private string $baseUrl;
    private string $token;
    private string $authHeader;
    private string $authScheme;

    public function __construct(
        ?string $baseUrl = null,
        ?string $token = null
    ) {
        $this->baseUrl = rtrim(
            $baseUrl ?? (defined('SISTEMAWEB_BASE_URL') ? (string) SISTEMAWEB_BASE_URL : ''),
            '/'
        );
        $this->token = trim(
            $token ?? (defined('SISTEMAWEB_API_TOKEN') ? (string) SISTEMAWEB_API_TOKEN : '')
        );
        $this->authHeader = defined('SISTEMAWEB_AUTH_HEADER')
            ? trim((string) SISTEMAWEB_AUTH_HEADER)
            : 'Authorization';
        $this->authScheme = defined('SISTEMAWEB_AUTH_SCHEME')
            ? trim((string) SISTEMAWEB_AUTH_SCHEME)
            : 'Bearer';
    }

    public static function isEnabled(): bool
    {
        return !defined('SISTEMAWEB_ENABLED') || SISTEMAWEB_ENABLED !== false;
    }

    public static function isConfigured(): bool
    {
        if (!self::isEnabled()) {
            return false;
        }
        $url = defined('SISTEMAWEB_BASE_URL') ? trim((string) SISTEMAWEB_BASE_URL) : '';
        $tok = defined('SISTEMAWEB_API_TOKEN') ? trim((string) SISTEMAWEB_API_TOKEN) : '';
        if ($url === '' || $tok === '') {
            return false;
        }
        foreach (['exemplo', 'example', 'troque', 'cole_', 'change_me', 'SEU_', 'TODO'] as $needle) {
            if (stripos($url . $tok, $needle) !== false) {
                return false;
            }
        }
        return true;
    }

    /** Paths de funcionários + gravar folha preenchidos (contrato API pronto). */
    public static function pathsReady(): bool
    {
        $emp = defined('SISTEMAWEB_PATH_EMPLOYEES') ? trim((string) SISTEMAWEB_PATH_EMPLOYEES) : '';
        $save = defined('SISTEMAWEB_PATH_SAVE_FOLHA') ? trim((string) SISTEMAWEB_PATH_SAVE_FOLHA) : '';
        return $emp !== '' && $save !== '';
    }

    public static function setupHint(): ?string
    {
        $rootHint = 'Copie config.sistemaweb.local.php.example → config.sistemaweb.local.php na raiz do site.';
        if (!self::isEnabled()) {
            return 'SISTEMAWEB_ENABLED=false. Ative após preencher URL, token e paths.';
        }
        if (!self::isConfigured()) {
            $hasFile = is_file(dirname(__DIR__, 2) . '/config.sistemaweb.local.php');
            return $hasFile
                ? 'config.sistemaweb.local.php existe, mas BASE_URL/TOKEN estão vazios ou são exemplos.'
                : $rootHint . ' Peça ao Financeiro: base URL, token e endpoints (listar funcionários / gravar folha).';
        }
        if (!self::pathsReady()) {
            return 'Credenciais OK, mas SISTEMAWEB_PATH_EMPLOYEES / SISTEMAWEB_PATH_SAVE_FOLHA ainda vazios. Preencha com o contrato da API.';
        }
        return null;
    }

    public static function statusMeta(): array
    {
        return [
            'enabled' => self::isEnabled(),
            'configured' => self::isConfigured(),
            'paths_ready' => self::pathsReady(),
            'ready' => self::isConfigured() && self::pathsReady(),
            'setup_hint' => self::setupHint(),
            'has_config_file' => is_file(dirname(__DIR__, 2) . '/config.sistemaweb.local.php'),
            'base_url_set' => self::isConfigured(),
            // Nunca devolver token
            'employees_path_set' => (defined('SISTEMAWEB_PATH_EMPLOYEES') && trim((string) SISTEMAWEB_PATH_EMPLOYEES) !== ''),
            'save_path_set' => (defined('SISTEMAWEB_PATH_SAVE_FOLHA') && trim((string) SISTEMAWEB_PATH_SAVE_FOLHA) !== ''),
        ];
    }

    /**
     * @param array<string, scalar|null> $vars
     */
    private function expandPath(string $template, array $vars): string
    {
        $out = $template;
        foreach ($vars as $k => $v) {
            $out = str_replace('{' . $k . '}', rawurlencode((string) ($v ?? '')), $out);
        }
        return $out;
    }

    /**
     * @param array<string, mixed>|null $jsonBody
     * @return array<string, mixed>
     */
    public function request(string $method, string $path, ?array $jsonBody = null): array
    {
        if (!self::isConfigured()) {
            throw new RuntimeException('Sistema Web não configurada (config.sistemaweb.local.php).');
        }
        if (!class_exists('HttpClient', false)) {
            require_once __DIR__ . '/HttpClient.php';
        }
        $url = str_starts_with($path, 'http')
            ? $path
            : $this->baseUrl . '/' . ltrim($path, '/');

        $authVal = $this->token;
        if ($this->authScheme !== '') {
            $authVal = $this->authScheme . ' ' . $this->token;
        }
        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            $this->authHeader . ': ' . $authVal,
        ];

        $extra = [];
        if (defined('SISTEMAWEB_SSL_VERIFY') && SISTEMAWEB_SSL_VERIFY === false) {
            $extra[CURLOPT_SSL_VERIFYPEER] = false;
            $extra[CURLOPT_SSL_VERIFYHOST] = 0;
        }
        $timeout = defined('SISTEMAWEB_TIMEOUT_SEC') ? (int) SISTEMAWEB_TIMEOUT_SEC : 30;

        $res = HttpClient::request(
            strtoupper($method),
            $url,
            $jsonBody,
            $headers,
            max(5, $timeout),
            5,
            $extra
        );
        if ($res['error'] !== '') {
            throw new RuntimeException('Sistema Web: ' . $res['error']);
        }
        $code = (int) $res['code'];
        $decoded = $res['json'];
        if ($code >= 400) {
            $msg = is_array($decoded)
                ? ($decoded['message'] ?? $decoded['error'] ?? $decoded['msg'] ?? $res['body'])
                : $res['body'];
            if (is_array($msg)) {
                $msg = json_encode($msg, JSON_UNESCAPED_UNICODE);
            }
            throw new RuntimeException('Sistema Web HTTP ' . $code . ': ' . (string) $msg);
        }
        return is_array($decoded) ? $decoded : ['raw' => $res['body']];
    }

    /**
     * Lista funcionários no Sistema Web para empresa + mês.
     *
     * @param array{cnpj?:string,mes?:string,empresa_id?:string,protocolo?:string} $ctx
     * @return array{employees:list<array<string,mixed>>,raw:array<string,mixed>}
     */
    public function listEmployees(array $ctx): array
    {
        $pathTpl = defined('SISTEMAWEB_PATH_EMPLOYEES')
            ? trim((string) SISTEMAWEB_PATH_EMPLOYEES)
            : '';
        if ($pathTpl === '') {
            throw new RuntimeException(
                'SISTEMAWEB_PATH_EMPLOYEES não definido. Informe o path do endpoint de funcionários ao time de TI.'
            );
        }
        $method = defined('SISTEMAWEB_METHOD_EMPLOYEES')
            ? strtoupper((string) SISTEMAWEB_METHOD_EMPLOYEES)
            : 'GET';
        $path = $this->expandPath($pathTpl, [
            'cnpj' => preg_replace('/\D+/', '', (string) ($ctx['cnpj'] ?? '')) ?: '',
            'mes' => (string) ($ctx['mes'] ?? ''),
            'empresa_id' => (string) ($ctx['empresa_id'] ?? ''),
            'protocolo' => (string) ($ctx['protocolo'] ?? ''),
        ]);
        $body = null;
        if ($method !== 'GET') {
            $body = [
                'cnpj' => $ctx['cnpj'] ?? null,
                'mes' => $ctx['mes'] ?? null,
                'empresa_id' => $ctx['empresa_id'] ?? null,
                'protocolo' => $ctx['protocolo'] ?? null,
            ];
        }
        $raw = $this->request($method, $path, $body);
        return [
            'employees' => self::normalizeEmployees($raw),
            'raw' => $raw,
        ];
    }

    /**
     * Envia folha gerada para o Sistema Web.
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function saveFolha(array $payload): array
    {
        $pathTpl = defined('SISTEMAWEB_PATH_SAVE_FOLHA')
            ? trim((string) SISTEMAWEB_PATH_SAVE_FOLHA)
            : '';
        if ($pathTpl === '') {
            throw new RuntimeException(
                'SISTEMAWEB_PATH_SAVE_FOLHA não definido. Informe o path do endpoint de gravar folha ao time de TI.'
            );
        }
        $method = defined('SISTEMAWEB_METHOD_SAVE_FOLHA')
            ? strtoupper((string) SISTEMAWEB_METHOD_SAVE_FOLHA)
            : 'POST';
        $path = $this->expandPath($pathTpl, [
            'cnpj' => preg_replace('/\D+/', '', (string) ($payload['cnpj'] ?? '')) ?: '',
            'mes' => (string) ($payload['mes'] ?? ''),
            'empresa_id' => (string) ($payload['empresa_id'] ?? ''),
            'protocolo' => (string) ($payload['protocolo'] ?? ''),
        ]);
        return $this->request($method, $path, $payload);
    }

    /**
     * Normaliza formatos comuns de lista de funcionários.
     *
     * @param array<string, mixed> $raw
     * @return list<array<string,mixed>>
     */
    public static function normalizeEmployees(array $raw): array
    {
        $list = null;
        foreach (['employees', 'funcionarios', 'data', 'items', 'result', 'lista'] as $key) {
            if (isset($raw[$key]) && is_array($raw[$key])) {
                $list = $raw[$key];
                break;
            }
        }
        if ($list === null && array_is_list($raw)) {
            $list = $raw;
        }
        if (!is_array($list)) {
            return [];
        }
        $out = [];
        foreach ($list as $row) {
            if (!is_array($row)) {
                continue;
            }
            $name = (string) ($row['name'] ?? $row['nome'] ?? $row['funcionario'] ?? $row['razao_social'] ?? '');
            $login = (string) ($row['login'] ?? $row['usuario'] ?? $row['email'] ?? $row['user'] ?? '');
            $matricula = (string) ($row['matricula'] ?? $row['registration'] ?? $row['codigo'] ?? '');
            $valor = $row['valor'] ?? $row['valor_pagamento'] ?? $row['salario'] ?? $row['liquido'] ?? null;
            $out[] = [
                'id' => (string) ($row['id'] ?? $row['codigo'] ?? $matricula ?: $login ?: uniqid('sw_', true)),
                'name' => $name !== '' ? $name : ($login ?: 'Funcionário'),
                'login' => $login,
                'email' => (string) ($row['email'] ?? $login),
                'matricula' => $matricula,
                'role' => (string) ($row['role'] ?? $row['cargo'] ?? $row['funcao'] ?? ''),
                'valor' => is_numeric($valor) ? (float) $valor : null,
                'pix_key' => (string) ($row['pix_key'] ?? $row['chave_pix'] ?? $row['pix'] ?? ''),
                'pix_key_type' => (string) ($row['pix_key_type'] ?? $row['tipo_pix'] ?? ''),
                'pix_holder' => (string) ($row['pix_holder'] ?? $row['titular'] ?? ''),
                'bank_name' => (string) ($row['bank_name'] ?? $row['banco'] ?? ''),
                'source' => 'sistema_web',
                '_raw' => $row,
            ];
        }
        return $out;
    }
}
