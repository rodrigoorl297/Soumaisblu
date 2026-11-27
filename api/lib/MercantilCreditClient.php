<?php
declare(strict_types=1);

require_once __DIR__ . '/HttpClient.php';

final class MercantilCreditException extends RuntimeException
{
    public function __construct(public readonly int $httpStatus, public readonly array $errorKeys = [])
    {
        parent::__construct(match ($httpStatus) {
            429 => 'Limite de chamadas do Mercantil atingido.',
            0 => 'Sem resposta do Mercantil. Confira o estado da operação antes de reenviar.',
            default => 'O Mercantil recusou a solicitação ou retornou uma resposta inválida.',
        });
    }
}

/** Cliente servidor a servidor para Propostas Externas de Crédito Pessoal. */
final class MercantilCreditClient
{
    private const OPERATIONS = [
        'pre_simulacao' => ['POST', 'Simulacoes/IniciarPreSimulacao'],
        'iniciar_operacao' => ['POST', 'Simulacoes/IniciarOperacao'],
        'simular_parcela' => ['POST', 'Simulacoes/ValorParcela'],
        'simular_emprestimo' => ['POST', 'Simulacoes/ValorEmprestimo'],
        'detalhes' => ['GET', 'Propostas/{id}/Detalhes'],
        'fluxo' => ['GET', 'Propostas/{id}/FluxoEsteira'],
        'finalizar' => ['POST', 'Propostas/Finalizacao'],
        'cancelar' => ['PUT', 'Propostas/{id}/Cancelamento'],
        'videoconferencia' => ['GET', 'VideoConferencia'],
        'listar_propostas' => ['GET', 'Propostas'],
        'listar_agencias' => ['GET', 'Agencias'],
        'documento' => ['POST', 'Documentos'],
    ];

    private string $origin;
    private string $token = '';
    private int $tokenExpiresAt = 0;

    public function __construct(
        private readonly string $clientId,
        private readonly string $clientSecret,
        string $environment = 'hml',
        private readonly ?Closure $transport = null,
    ) {
        if (trim($clientId) === '' || trim($clientSecret) === '') {
            throw new InvalidArgumentException('Configure as credenciais do Mercantil no servidor.');
        }
        $this->origin = match ($environment) {
            'hml' => 'https://apihml.mercantil.com.br:8443',
            'prod' => 'https://api.mercantil.com.br:8443',
            default => throw new InvalidArgumentException('Ambiente Mercantil inválido.'),
        };
    }

    public static function fromEnvironment(): self
    {
        return new self(
            (string) getenv('MERCANTIL_CP_CLIENT_ID'),
            (string) getenv('MERCANTIL_CP_CLIENT_SECRET'),
            getenv('MERCANTIL_CP_ENV') ?: 'hml',
        );
    }

    public function execute(string $operation, array $data = [], ?string $id = null): array
    {
        if (!isset(self::OPERATIONS[$operation])) {
            throw new InvalidArgumentException('Operação Mercantil desconhecida.');
        }
        [$method, $path] = self::OPERATIONS[$operation];
        if (str_contains($path, '{id}')) {
            if ($id === null || !preg_match('/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iD', $id)) {
                throw new InvalidArgumentException('Identificador de proposta Mercantil inválido.');
            }
            $path = str_replace('{id}', $id, $path);
        } elseif ($id !== null) {
            throw new InvalidArgumentException('Esta operação não recebe identificador na rota.');
        }

        $url = $this->origin . '/MB.API.CSN.PropostasExternasCP/api/' . $path;
        if ($method === 'GET' && $data !== []) {
            $url .= '?' . http_build_query($data, '', '&', PHP_QUERY_RFC3986);
        }
        $response = $this->request($method, $url, $method === 'GET' || $data === [] ? null : $data, [
            'Accept: application/json',
            'Authorization: Bearer ' . $this->accessToken(),
        ]);
        if ((int) ($response['code'] ?? 0) === 401) {
            $this->token = '';
        }
        return $this->decode($response);
    }

    private function accessToken(): string
    {
        if ($this->token !== '' && time() < $this->tokenExpiresAt) {
            return $this->token;
        }
        $query = http_build_query([
            'grant_type' => 'client_credentials',
            'client_id' => $this->clientId,
            'client_secret' => $this->clientSecret,
        ], '', '&', PHP_QUERY_RFC3986);
        $result = $this->decode($this->request('POST', $this->origin . '/auth/oauth/v2/token?' . $query, null, [
            'Accept: application/json',
        ]));
        $token = $result['access_token'] ?? '';
        if (!is_string($token) || $token === '' || preg_match('/[\x00-\x20\x7f]/', $token)) {
            throw new MercantilCreditException(502);
        }
        $this->token = $token;
        $this->tokenExpiresAt = time() + max(0, (int) ($result['expires_in'] ?? 0) - 30);
        return $token;
    }

    private function request(string $method, string $url, ?array $body, array $headers): array
    {
        return $this->transport !== null
            ? ($this->transport)($method, $url, $body, $headers)
            : HttpClient::request($method, $url, $body, $headers);
    }

    private function decode(array $response): array
    {
        $status = (int) ($response['code'] ?? 0);
        $json = $response['json'] ?? null;
        if ($status >= 200 && $status < 300 && is_array($json)) {
            return $json;
        }
        if ($status === 204) {
            return [];
        }
        $errors = is_array($json) ? ($json['Errors'] ?? $json['errors'] ?? $json) : [];
        $keys = [];
        foreach (is_array($errors) && array_is_list($errors) ? $errors : [$errors] as $error) {
            $key = is_array($error) ? ($error['Key'] ?? $error['key'] ?? '') : '';
            if (is_string($key) && preg_match('/^[A-Za-z][A-Za-z0-9_]{0,95}$/D', $key)) {
                $keys[] = $key;
            }
        }
        throw new MercantilCreditException($status >= 200 && $status < 300 ? 502 : $status, array_values(array_unique($keys)));
    }
}
