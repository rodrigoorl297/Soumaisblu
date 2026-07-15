<?php
declare(strict_types=1);

/**
 * Cliente HTTP mínimo compartilhado (cURL) — evita copiar CURLOPT em cada integração.
 */
final class HttpClient
{
    /**
     * @param array<int, string> $headers
     * @param array<int, mixed> $curlExtra CURLOPT_* extras
     * @return array{code:int, body:string, json:?array, error:string}
     */
    public static function request(
        string $method,
        string $url,
        ?array $jsonBody = null,
        array $headers = [],
        int $timeoutSec = 15,
        int $connectTimeoutSec = 5,
        array $curlExtra = []
    ): array {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('Falha ao iniciar cURL.');
        }
        $hdrs = $headers;
        $hasContentType = false;
        foreach ($hdrs as $h) {
            if (stripos($h, 'Content-Type:') === 0) {
                $hasContentType = true;
                break;
            }
        }
        if ($jsonBody !== null && !$hasContentType) {
            $hdrs[] = 'Content-Type: application/json';
        }
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $hdrs,
            CURLOPT_CONNECTTIMEOUT => max(1, $connectTimeoutSec),
            CURLOPT_TIMEOUT => max(1, $timeoutSec),
            CURLOPT_ENCODING => '',
            CURLOPT_TCP_KEEPALIVE => 1,
            CURLOPT_TCP_NODELAY => true,
            CURLOPT_FORBID_REUSE => false,
            CURLOPT_FRESH_CONNECT => false,
        ];
        if ($jsonBody !== null) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($jsonBody, JSON_UNESCAPED_UNICODE);
        }
        foreach ($curlExtra as $k => $v) {
            $opts[$k] = $v;
        }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            return ['code' => $code, 'body' => '', 'json' => null, 'error' => $err ?: 'falha na requisição'];
        }
        $decoded = json_decode($raw, true);
        return [
            'code' => $code,
            'body' => (string) $raw,
            'json' => is_array($decoded) ? $decoded : null,
            'error' => '',
        ];
    }
}
