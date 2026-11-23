<?php
/**
 * EFI Pay — Pix Automático (cobrança recorrente).
 * @see https://dev.efipay.com.br/docs/api-pix/pix-automatico
 */
declare(strict_types=1);

final class EfiPayPixAutomatico
{
    public const CLIENT_BUILD = '97c411pixauto9';

    public const BANK_CODE_ISPB = [
        '001' => '00000000',
        '237' => '60746948',
        '033' => '90400888',
        '260' => '18236120',
        '341' => '60701190',
        '104' => '00360305',
    ];

    private EfiPayClient $client;
    private bool $mock;

    public function __construct(EfiPayClient $client, bool $mock = false)
    {
        $this->client = $client;
        $this->mock = $mock;
    }

    public static function bankIspb(string $bankLabel): ?string
    {
        $label = trim($bankLabel);
        if ($label === '') {
            return null;
        }
        if (preg_match('/(\d{3})/', $label, $m)) {
            $code = $m[1];
            if (isset(self::BANK_CODE_ISPB[$code])) {
                return self::BANK_CODE_ISPB[$code];
            }
        }
        if (preg_match('/nubank|nu\s*pagamentos/i', $label)) {
            return self::BANK_CODE_ISPB['260'];
        }
        if (preg_match('/santander/i', $label)) {
            return self::BANK_CODE_ISPB['033'];
        }
        $key = strtoupper($label);
        return self::BANK_CODE_ISPB[$key] ?? null;
    }

    public function createLocation(): array
    {
        if ($this->mock) {
            return [
                'id' => random_int(100, 9999),
                'location' => 'pix-h.efipay.com.br/qr/v2/rec/mock-' . bin2hex(random_bytes(8)),
                'criacao' => gmdate('c'),
                'mock' => true,
            ];
        }
        // #region agent log
        pix_auto_dbg_log('EfiPayPixAutomatico.php:createLocation', 'POST /v2/locrec sem body', [
            'endpoint' => '/v2/locrec',
            'client_build' => self::CLIENT_BUILD,
            'body' => null,
        ], 'locrec-empty-body', 'post-fix-v2');
        // #endregion
        $res = $this->client->requestNoBody('POST', '/v2/locrec');
        // #region agent log
        pix_auto_dbg_log('EfiPayPixAutomatico.php:createLocation:response', 'locrec response', [
            'http_code' => (int) ($res['http_code'] ?? 0),
            'body_preview' => substr((string) ($res['body'] ?? ''), 0, 300),
            'client_build' => self::CLIENT_BUILD,
        ], 'locrec-empty-body', 'post-fix-v2');
        // #endregion
        $this->assertOk($res, 201, 'criar location Pix Automático');
        $data = $this->decode($res['body']);
        return is_array($data) ? $data : [];
    }

    public function createRecurrence(array $payload): array
    {
        if ($this->mock) {
            $idRec = 'RN' . strtoupper(bin2hex(random_bytes(12)));
            return [
                'idRec' => $idRec,
                'status' => 'CRIADA',
                'valor' => $payload['valor'] ?? ['valorRec' => '0.00'],
                'vinculo' => $payload['vinculo'] ?? [],
                'calendario' => $payload['calendario'] ?? [],
                'loc' => [
                    'id' => $payload['loc'] ?? 0,
                    'location' => 'pix-h.efipay.com.br/qr/v2/rec/mock',
                    'idRec' => $idRec,
                ],
                'dadosQR' => [
                    'jornada' => 'JORNADA_2',
                    'pixCopiaECola' => '00020126580014br.gov.bcb.pix0136' . $idRec . '5204000053039865802BR5925SOU+BLU CREDITO6009SAO PAULO62070503***6304MOCK',
                ],
                'mock' => true,
            ];
        }
        // #region agent log
        pix_auto_dbg_log('EfiPayPixAutomatico.php:createRecurrence', 'payload calendario', [
            'dataInicial' => $payload['calendario']['dataInicial'] ?? null,
            'dataFinal' => $payload['calendario']['dataFinal'] ?? null,
            'client_build' => self::CLIENT_BUILD,
        ], 'rec-data-inicial', 'post-fix');
        // #endregion
        $res = $this->client->request('POST', '/v2/rec', $payload);
        $this->assertOk($res, 201, 'criar recorrência Pix Automático');
        $data = $this->decode($res['body']);
        return is_array($data) ? $data : [];
    }

    public function getRecurrence(string $idRec): array
    {
        if ($this->mock) {
            return [
                'idRec' => $idRec,
                'status' => 'APROVADA',
                'dadosQR' => [
                    'pixCopiaECola' => '00020126580014br.gov.bcb.pix0136' . $idRec . '5204000053039865802BR5925SOU+BLU CREDITO6009SAO PAULO62070503***6304MOCK',
                ],
                'mock' => true,
            ];
        }
        $res = $this->client->request('GET', '/v2/rec/' . rawurlencode($idRec));
        $this->assertOk($res, 200, 'consultar recorrência');
        $data = $this->decode($res['body']);
        return is_array($data) ? $data : [];
    }

    public function createSolicRec(array $payload): array
    {
        if ($this->mock) {
            return [
                'idSolicRec' => 'SC' . strtoupper(bin2hex(random_bytes(12))),
                'idRec' => $payload['idRec'] ?? '',
                'status' => 'CRIADA',
                'destinatario' => $payload['destinatario'] ?? [],
                'mock' => true,
            ];
        }
        $res = $this->client->request('POST', '/v2/solicrec', $payload);
        // #region agent log
        pix_auto_dbg_log('EfiPayPixAutomatico.php:createSolicRec', 'http response', [
            'http_code' => (int) ($res['http_code'] ?? 0),
            'body_preview' => substr((string) ($res['body'] ?? ''), 0, 400),
        ], 'H1-H5-http', 'push-debug');
        // #endregion
        $this->assertOk($res, 201, 'criar solicitação de confirmação');
        $data = $this->decode($res['body']);
        return is_array($data) ? $data : [];
    }

    public function getSolicRec(string $idSolicRec): array
    {
        if ($this->mock) {
            return [
                'idSolicRec' => $idSolicRec,
                'status' => 'APROVADA',
                'mock' => true,
            ];
        }
        $res = $this->client->request('GET', '/v2/solicrec/' . rawurlencode($idSolicRec));
        $this->assertOk($res, 200, 'consultar solicitação');
        $data = $this->decode($res['body']);
        return is_array($data) ? $data : [];
    }

    public function cancelSolicRec(string $idSolicRec): array
    {
        if ($this->mock) {
            return ['idSolicRec' => $idSolicRec, 'status' => 'CANCELADA', 'mock' => true];
        }
        $res = $this->client->request('PATCH', '/v2/solicrec/' . rawurlencode($idSolicRec), [
            'status' => 'CANCELADA',
        ]);
        $this->assertOk($res, 200, 'cancelar solicitação Pix Automático');
        $data = $this->decode($res['body']);
        return is_array($data) ? $data : [];
    }

    public function cancelRecurrence(string $idRec): array
    {
        if ($this->mock) {
            return ['idRec' => $idRec, 'status' => 'CANCELADA', 'mock' => true];
        }
        $res = $this->client->request('PATCH', '/v2/rec/' . rawurlencode($idRec), [
            'status' => 'CANCELADA',
        ]);
        $this->assertOk($res, 200, 'cancelar recorrência Pix Automático');
        $data = $this->decode($res['body']);
        return is_array($data) ? $data : [];
    }

    public function createCobranca(array $payload): array
    {
        if ($this->mock) {
            $txid = bin2hex(random_bytes(16));
            return [
                'txid' => $txid,
                'idRec' => $payload['idRec'] ?? '',
                'status' => 'CRIADA',
                'valor' => $payload['valor'] ?? ['original' => '0.00'],
                'mock' => true,
            ];
        }
        $res = $this->client->request('POST', '/v2/cobr', $payload);
        $this->assertOk($res, 201, 'criar cobrança Pix Automático');
        $data = $this->decode($res['body']);
        return is_array($data) ? $data : [];
    }

    public function getCobranca(string $txid): array
    {
        if ($this->mock) {
            return ['txid' => $txid, 'status' => 'ATIVA', 'mock' => true];
        }
        $res = $this->client->request('GET', '/v2/cobr/' . rawurlencode($txid));
        $this->assertOk($res, 200, 'consultar cobrança');
        $data = $this->decode($res['body']);
        return is_array($data) ? $data : [];
    }

    /** Monta payload de recorrência para proposta de crédito (Jornada 2). */
    public static function buildRecPayload(
        int $locId,
        string $contrato,
        string $cpf,
        string $nome,
        string $valorRec,
        string $dataInicial,
        string $dataFinal,
        int $parcelas
    ): array {
        return [
            'vinculo' => [
                'contrato' => $contrato,
                'devedor' => [
                    'cpf' => preg_replace('/\D+/', '', $cpf) ?? $cpf,
                    'nome' => $nome,
                ],
                'objeto' => 'Empréstimo SOU+BLU — ' . $parcelas . ' parcela(s)',
            ],
            'calendario' => [
                'dataInicial' => $dataInicial,
                'dataFinal' => $dataFinal,
                'periodicidade' => 'MENSAL',
            ],
            'valor' => ['valorRec' => number_format((float) $valorRec, 2, '.', '')],
            'politicaRetentativa' => 'PERMITE_3R_7D',
            'loc' => $locId,
        ];
    }

    private function assertOk(array $res, int $expected, string $ctx): void
    {
        $code = (int) ($res['http_code'] ?? 0);
        if ($code === $expected) {
            return;
        }
        $err = $this->decode($res['body'] ?? '');
        $msg = is_array($err)
            ? ($err['mensagem'] ?? $err['message'] ?? json_encode($err, JSON_UNESCAPED_UNICODE))
            : (string) ($res['body'] ?? 'Erro desconhecido');
        throw new RuntimeException("EfiPay Pix Automático — {$ctx} (HTTP {$code}): {$msg}", $code);
    }

    private function decode(?string $body): mixed
    {
        if (!is_string($body) || $body === '') {
            return null;
        }
        return json_decode($body, true);
    }
}

function pix_auto_service(): EfiPayPixAutomatico
{
    require_once __DIR__ . '/EfiPayClient.php';
    $provider = defined('PIX_PROVIDER') ? strtolower((string) PIX_PROVIDER) : 'mock';
    $mock = $provider !== 'efipay';
    if ($mock) {
        return new EfiPayPixAutomatico(efi_pay_client_from_config(), true);
    }
    if (!defined('EFI_CLIENT_ID') || trim((string) EFI_CLIENT_ID) === '') {
        throw new RuntimeException('Credenciais EfiPay incompletas em config.pix.local.php');
    }
    return new EfiPayPixAutomatico(efi_pay_client_from_config(), false);
}

function pix_auto_dbg_log(string $location, string $message, array $data = [], string $hypothesisId = '', string $runId = 'pre-fix'): void
{
    $logFile = dirname(__DIR__, 2) . '/debug-97c411.log';
    $line = json_encode([
        'sessionId' => '97c411',
        'timestamp' => (int) round(microtime(true) * 1000),
        'location' => $location,
        'message' => $message,
        'data' => $data,
        'hypothesisId' => $hypothesisId,
        'runId' => $runId,
    ], JSON_UNESCAPED_UNICODE);
    if (is_string($line)) {
        @file_put_contents($logFile, $line . "\n", FILE_APPEND | LOCK_EX);
    }
}
