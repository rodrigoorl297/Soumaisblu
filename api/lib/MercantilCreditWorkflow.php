<?php
declare(strict_types=1);

require_once __DIR__ . '/MercantilCreditClient.php';

final class MercantilCreditWorkflow
{
    public function __construct(private readonly MercantilCreditClient $client)
    {
    }

    /** @return array{prospect_id:string, cpf:string, estado:string} */
    public function startPreSimulation(string $cpf, ?string $benefit = null): array
    {
        $cpf = self::cpf($cpf);
        $payload = ['Cpf' => (int) $cpf];
        if ($benefit !== null && trim($benefit) !== '') {
            $benefit = trim($benefit);
            if (!preg_match('/^\d{1,10}$/D', $benefit) || (int) $benefit === 0) {
                throw new InvalidArgumentException('Número do benefício inválido.');
            }
            $payload['NumeroBeneficio'] = (int) $benefit;
        }
        $response = $this->client->execute('pre_simulacao', $payload);
        return [
            'prospect_id' => self::prospectId($response['Id'] ?? $response['id'] ?? null),
            'cpf' => $cpf,
            'estado' => 'aguardando_retorno',
        ];
    }

    /**
     * Normaliza um retorno já autenticado pelo receptor e o vincula à solicitação.
     * A autenticação e a persistência do callback são responsabilidade do receptor.
     */
    public static function readCallback(array $payload, string $expectedId, string $expectedCpf): array
    {
        $id = self::prospectId($payload['PropostaProspectId'] ?? $payload['propostaProspectId'] ?? null);
        $cpfValue = $payload['CpfCliente'] ?? $payload['cpfCliente'] ?? null;
        if (is_int($cpfValue) && $cpfValue >= 0) {
            $cpfValue = str_pad((string) $cpfValue, 11, '0', STR_PAD_LEFT);
        }
        if (!is_string($cpfValue) || $id !== self::prospectId($expectedId)
            || self::cpf($cpfValue) !== self::cpf($expectedCpf)) {
            throw new InvalidArgumentException('Retorno incompatível com o prospect solicitado.');
        }
        $credit = $payload['SimulacoesCreditoPessoal'] ?? $payload['simulacoesCreditoPessoal'] ?? null;
        $combos = $payload['SimulacoesCombinados'] ?? $payload['simulacoesCombinados'] ?? null;
        if ($credit !== null || $combos !== null) {
            return [
                'prospect_id' => $id,
                'evento' => 'simulacao',
                'credito_pessoal' => self::callbackList($credit),
                'combinados' => self::callbackList($combos),
            ];
        }
        $result = $payload['PreSimulacaoResultado'] ?? $payload['preSimulacaoResultado'] ?? null;
        $completed = $payload['Concluido'] ?? $payload['concluido'] ?? null;
        if (!is_array($result) || !is_bool($completed)) {
            throw new InvalidArgumentException('Formato de retorno da pré-simulação inválido.');
        }
        return [
            'prospect_id' => $id,
            'evento' => 'pre_simulacao',
            'concluido' => $completed,
            'resultado' => $result,
        ];
    }

    private static function callbackList(mixed $items): array
    {
        if ($items === null) {
            return [];
        }
        if (!is_array($items) || !array_is_list($items) || count(array_filter($items, 'is_array')) !== count($items)) {
            throw new InvalidArgumentException('Lista de simulações inválida.');
        }
        return $items;
    }

    private static function prospectId(mixed $id): string
    {
        if (!is_string($id) || !preg_match('/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iD', $id)) {
            throw new InvalidArgumentException('Identificador de prospect Mercantil inválido.');
        }
        return strtolower($id);
    }

    private static function cpf(string $value): string
    {
        $digits = str_replace(['.', '-', ' '], '', trim($value));
        if (!preg_match('/^\d{11}$/D', $digits) || preg_match('/^(\d)\1{10}$/D', $digits)) {
            throw new InvalidArgumentException('CPF inválido.');
        }
        for ($length = 9; $length <= 10; $length++) {
            $sum = 0;
            for ($i = 0; $i < $length; $i++) {
                $sum += (int) $digits[$i] * ($length + 1 - $i);
            }
            if ((($sum * 10) % 11) % 10 !== (int) $digits[$length]) {
                throw new InvalidArgumentException('CPF inválido.');
            }
        }
        return $digits;
    }
}
