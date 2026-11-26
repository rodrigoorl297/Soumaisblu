<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/lib/MercantilCreditClient.php';

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$calls = [];
$responses = [
    ['code' => 200, 'json' => ['access_token' => 'token-de-teste', 'expires_in' => 3600]],
    ['code' => 200, 'json' => ['Id' => 'prospect']],
    ['code' => 200, 'json' => []],
    ['code' => 429, 'json' => ['Errors' => [['Key' => 'FranquiaExcedida']]]],
];
$transport = static function ($method, $url, $body, $headers) use (&$calls, &$responses): array {
    $calls[] = [$method, $url, $body, $headers];
    return array_shift($responses);
};
$client = new MercantilCreditClient('id-teste', 'segredo+teste', 'hml', $transport);
check($client->execute('pre_simulacao', ['Cpf' => 12345678909]) === ['Id' => 'prospect'], 'Pré-simulação');
$client->execute('listar_agencias', ['ufAtuacao' => 12]);
check($calls[0][0] === 'POST' && str_contains($calls[0][1], 'client_secret=segredo%2Bteste'), 'OAuth');
check(str_starts_with($calls[1][1], 'https://apihml.mercantil.com.br:8443/'), 'Host de homologação');
check(str_ends_with($calls[1][1], '/api/Simulacoes/IniciarPreSimulacao'), 'Rota de pré-simulação');
check(in_array('Authorization: Bearer token-de-teste', $calls[1][3], true), 'Bearer');
check(count($calls) === 3 && $calls[2][2] === null && str_ends_with($calls[2][1], '?ufAtuacao=12'), 'GET e reuso do token');
try {
    $client->execute('finalizar', ['Id' => 'exemplo']);
    throw new LogicException('Esperava HTTP 429.');
} catch (MercantilCreditException $error) {
    check($error->httpStatus === 429 && $error->errorKeys === ['FranquiaExcedida'], 'Tratamento de limite');
}
check(count($calls) === 4, 'Finalização não pode ser reenviada automaticamente');
try {
    $client->execute('detalhes', [], '../outra-rota');
    throw new LogicException('Esperava rejeição do identificador.');
} catch (InvalidArgumentException) {
    check(count($calls) === 4, 'Identificador inválido não pode gerar chamada');
}
echo "PASS: OAuth, rotas fixas, Bearer, GET, validação e HTTP 429.\n";
