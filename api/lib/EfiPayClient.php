<?php
declare(strict_types=1);

function efi_resolve_ca_bundle(): ?string
{
    $candidates = [];
    if (defined('EFI_CAINFO_PATH') && (string) EFI_CAINFO_PATH !== '') {
        $candidates[] = (string) EFI_CAINFO_PATH;
    }
    $candidates[] = dirname(__DIR__, 2) . '/certs/cacert.pem';
    foreach ($candidates as $path) {
        if (is_string($path) && $path !== '' && is_file($path)) {
            return $path;
        }
    }
    return null;
}

final class EfiPayClient
{
    private string $baseUrl;
    private string $clientId;
    private string $clientSecret;
    private string $certPath;
    private string $certPassword;
    private ?string $accessToken = null;
    private ?int $tokenExpiresAt = null;

    public function __construct(
        string $clientId,
        string $clientSecret,
        string $certPath,
        string $certPassword = '',
        bool $sandbox = true
    ) {
        $this->clientId = $clientId;
        $this->clientSecret = $clientSecret;
        $this->certPath = $certPath;
        $this->certPassword = $certPassword;
        $this->baseUrl = $sandbox
            ? 'https://pix-h.api.efipay.com.br'
            : 'https://pix.api.efipay.com.br';
    }

    public function getAccessToken(bool $forceRefresh = false): string
    {
        if (
            !$forceRefresh
            && $this->accessToken !== null
            && $this->tokenExpiresAt !== null
            && time() < $this->tokenExpiresAt - 60
        ) {
            return $this->accessToken;
        }

        $auth = base64_encode($this->clientId . ':' . $this->clientSecret);
        $response = $this->curlRequest(
            'POST',
            '/oauth/token',
            '{"grant_type":"client_credentials"}',
            ['Authorization: Basic ' . $auth, 'Content-Type: application/json'],
            false
        );

        if ($response['http_code'] < 200 || $response['http_code'] >= 300) {
            throw new RuntimeException(
                'EfiPay OAuth falhou (HTTP ' . $response['http_code'] . '): ' . ($response['body'] ?? '')
            );
        }

        $data = json_decode($response['body'], true);
        if (empty($data['access_token'])) {
            throw new RuntimeException('EfiPay OAuth: access_token ausente na resposta.');
        }

        $this->accessToken = $data['access_token'];
        $this->tokenExpiresAt = time() + (int) ($data['expires_in'] ?? 3600);
        return $this->accessToken;
    }

    public function request(string $method, string $path, ?array $body = null): array
    {
        $payload = $body !== null ? json_encode($body, JSON_UNESCAPED_UNICODE) : null;
        $headers = ['Authorization: Bearer ' . $this->getAccessToken()];
        if ($payload !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        return $this->curlRequest(
            $method,
            $path,
            $payload,
            $headers,
            true
        );
    }

    /** POST/PUT sem corpo — ex.: POST /v2/locrec (Pix Automático). */
    public function requestNoBody(string $method, string $path): array
    {
        return $this->curlRequest(
            $method,
            $path,
            null,
            ['Authorization: Bearer ' . $this->getAccessToken()],
            true
        );
    }

    private function curlRequest(string $method, string $path, ?string $body, array $headers, bool $useBearer): array
    {
        if (!is_file($this->certPath)) {
            throw new RuntimeException('Certificado P12 não encontrado: ' . $this->certPath);
        }

        $method = strtoupper($method);
        $ch = curl_init();
        $opts = [
            CURLOPT_URL => $this->baseUrl . $path,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_SSLCERT => $this->certPath,
            CURLOPT_SSLCERTTYPE => 'P12',
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_HEADER => true,
        ];
        if ($this->certPassword !== '') {
            $opts[CURLOPT_SSLCERTPASSWD] = $this->certPassword;
        }
        if ($method === 'POST') {
            $opts[CURLOPT_POST] = true;
            if ($body !== null && $body !== '') {
                $opts[CURLOPT_POSTFIELDS] = $body;
            }
        } else {
            $opts[CURLOPT_CUSTOMREQUEST] = $method;
            if ($body !== null && $body !== '') {
                $opts[CURLOPT_POSTFIELDS] = $body;
            }
        }
        $caFile = efi_resolve_ca_bundle();
        if ($caFile !== null) {
            $opts[CURLOPT_SSL_VERIFYPEER] = true;
            $opts[CURLOPT_CAINFO] = $caFile;
        }
        curl_setopt_array($ch, $opts);

        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        if ($errno) {
            throw new RuntimeException('cURL EfiPay: ' . $error, $errno);
        }
        return [
            'http_code' => $httpCode,
            'body' => is_string($raw) ? substr($raw, $headerSize) : '',
        ];
    }
}

function efi_pay_client_from_config(): EfiPayClient
{
    return new EfiPayClient(
        (string) (defined('EFI_CLIENT_ID') ? EFI_CLIENT_ID : ''),
        (string) (defined('EFI_CLIENT_SECRET') ? EFI_CLIENT_SECRET : ''),
        (string) (defined('EFI_CERT_PATH') ? EFI_CERT_PATH : ''),
        defined('EFI_CERT_PASSWORD') ? (string) EFI_CERT_PASSWORD : '',
        defined('EFI_SANDBOX') ? (bool) EFI_SANDBOX : true
    );
}
