<?php
declare(strict_types=1);

/**
 * Cliente REST Supabase (service_role) — PHP server-side.
 */
final class SupabaseClient
{
    private string $url;
    private string $serviceKey;

    public function __construct(?string $url = null, ?string $serviceKey = null)
    {
        $this->url = rtrim($url ?? (defined('SUPABASE_URL') ? (string) SUPABASE_URL : ''), '/');
        $this->serviceKey = $serviceKey ?? (defined('SUPABASE_SERVICE_KEY') ? (string) SUPABASE_SERVICE_KEY : '');
    }

    public function isConfigured(): bool
    {
        $url = trim($this->url);
        $key = trim($this->serviceKey);
        return $url !== '' && $key !== '' && $key !== 'SUA_SERVICE_ROLE_KEY'
            && !str_contains($key, 'COLE_SERVICE_ROLE')
            && !str_contains($key, 'COLE_')
            && !str_contains($url, 'SEU_PROJECT');
    }

    public static function globalsConfigured(): bool
    {
        $url = defined('SUPABASE_URL') ? trim((string) SUPABASE_URL) : '';
        $key = defined('SUPABASE_SERVICE_KEY') ? trim((string) SUPABASE_SERVICE_KEY) : '';
        return $url !== '' && $key !== '' && $key !== 'SUA_SERVICE_ROLE_KEY'
            && !str_contains($key, 'COLE_SERVICE_ROLE')
            && !str_contains($url, 'SEU_PROJECT');
    }

    public function rest(string $method, string $table, ?array $body = null, string $query = ''): array
    {
        if (!$this->isConfigured()) {
            throw new RuntimeException('Supabase não configurado (URL + service_role key).');
        }
        $q = $query !== '' && $query[0] !== '?' ? '?' . $query : $query;
        $ch = curl_init($this->url . '/rest/v1/' . rawurlencode($table) . $q);
        $headers = [
            'apikey: ' . $this->serviceKey,
            'Authorization: Bearer ' . $this->serviceKey,
            'Content-Type: application/json',
            'Prefer: return=representation',
        ];
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 45,
        ]);
        if ($body !== null && in_array(strtoupper($method), ['POST', 'PATCH', 'PUT'], true)) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
        }
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            throw new RuntimeException('Supabase: ' . ($err ?: 'falha na requisição'));
        }
        if ($code === 204) {
            return [];
        }
        $decoded = json_decode($raw, true);
        if ($code >= 400) {
            $msg = is_array($decoded) ? ($decoded['message'] ?? $decoded['error'] ?? $raw) : $raw;
            throw new RuntimeException('Supabase HTTP ' . $code . ': ' . (string) $msg, $code);
        }
        return is_array($decoded) ? $decoded : [];
    }

    public function selectOne(string $table, string $filterQuery): ?array
    {
        $rows = $this->rest('GET', $table, null, $filterQuery . '&limit=1');
        return $rows[0] ?? null;
    }

    public function tableExists(string $table): bool
    {
        try {
            $this->rest('GET', $table, null, '?select=id&limit=0');
            return true;
        } catch (Throwable $e) {
            if (str_contains($e->getMessage(), '42P01') || str_contains($e->getMessage(), 'does not exist')) {
                return false;
            }
            throw $e;
        }
    }
}
