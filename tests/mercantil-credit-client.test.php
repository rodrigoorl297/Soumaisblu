<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/lib/MercantilCreditClient.php';
require_once __DIR__ . '/../api/lib/MercantilCreditWorkflow.php';

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

$prospectId = '00000000-0000-4000-8000-000000000001';
$requests = [];
$workflow = new MercantilCreditWorkflow(new MercantilCreditClient('hml-id', 'hml-secret', 'hml',
    static function ($method, $url, $payload) use (&$requests, $prospectId): array {
        if (str_contains($url, '/oauth/')) {
            return ['code' => 200, 'json' => ['access_token' => 'test', 'expires_in' => 3600]];
        }
        $requests[] = $payload;
        return ['code' => 200, 'json' => ['Id' => $prospectId]];
    }
));
$started = $workflow->startPreSimulation('012.345.678-90', '00123');
check($requests === [['Cpf' => 1234567890, 'NumeroBeneficio' => 123]], 'DTO do banco');
check($started === ['prospect_id' => $prospectId, 'cpf' => '01234567890', 'estado' => 'aguardando_retorno'], 'Vínculo local');
$callback = ['PropostaProspectId' => $prospectId, 'CpfCliente' => 1234567890,
    'PreSimulacaoResultado' => [], 'Concluido' => true];
check(MercantilCreditWorkflow::readCallback($callback, $prospectId, '01234567890')['concluido'], 'Callback correlacionado');
$offers = ['PropostaProspectId' => $prospectId, 'CpfCliente' => 1234567890,
    'SimulacoesCreditoPessoal' => [['ValorLiberado' => 1000]], 'SimulacoesCombinados' => []];
check(MercantilCreditWorkflow::readCallback($offers, $prospectId, '01234567890')['credito_pessoal'][0]['ValorLiberado'] === 1000, 'Ofertas');
try {
    MercantilCreditWorkflow::readCallback($callback, $prospectId, '12345678909');
    throw new LogicException('Esperava rejeição de CPF divergente.');
} catch (InvalidArgumentException) {
    check(count($requests) === 1, 'Callback divergente rejeitado');
}
try {
    $workflow->startPreSimulation('123.456.789-01');
    throw new LogicException('Esperava rejeição de CPF inválido.');
} catch (InvalidArgumentException) {
    check(count($requests) === 1, 'CPF inválido não enviado');
}
echo "PASS: pré-simulação, CPF com zero à esquerda e correlação dos callbacks.\n";
