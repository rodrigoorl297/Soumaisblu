<?php
declare(strict_types=1);

require_once __DIR__ . '/SupabaseClient.php';

/** Projeto soublu-v2 — exclusivo WhatsApp (não usar para propostas/crédito/anexos). */
function soublu_supabase_v2_url(): string
{
    if (defined('SUPABASE_V2_URL') && trim((string) SUPABASE_V2_URL) !== '') {
        return rtrim((string) SUPABASE_V2_URL, '/');
    }
    return 'https://cpqediswbjxcvpnwflyj.supabase.co';
}

function soublu_supabase_v2_service_key(): string
{
    if (!defined('SUPABASE_V2_SERVICE_KEY')) {
        return '';
    }
    $key = trim((string) SUPABASE_V2_SERVICE_KEY);
    if ($key === '' || str_contains($key, 'COLE') || $key === 'SUA_SERVICE_ROLE_KEY') {
        return '';
    }
    return $key;
}

function soublu_supabase_v2_configured(): bool
{
    return soublu_supabase_v2_service_key() !== '';
}

function soublu_supabase_v2_client(): SupabaseClient
{
    static $client = null;
    if ($client instanceof SupabaseClient) {
        return $client;
    }
    $key = soublu_supabase_v2_service_key();
    if ($key === '') {
        throw new RuntimeException(
            'SUPABASE_V2_SERVICE_KEY ausente em config.supabase.local.php (WhatsApp / soublu-v2).'
        );
    }
    $client = new SupabaseClient(soublu_supabase_v2_url(), $key);
    return $client;
}
