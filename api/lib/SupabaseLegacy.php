<?php
declare(strict_types=1);

require_once __DIR__ . '/SupabaseClient.php';

/** Projeto original sou+blu (PostgreSQL) — propostas de crédito, anexos, dados gerais. */
function soublu_supabase_legacy_url(): string
{
    if (defined('SUPABASE_LEGACY_URL') && trim((string) SUPABASE_LEGACY_URL) !== '') {
        return rtrim((string) SUPABASE_LEGACY_URL, '/');
    }
    if (defined('SUPABASE_URL') && trim((string) SUPABASE_URL) !== '') {
        return rtrim((string) SUPABASE_URL, '/');
    }
    return 'https://dqptnlywbarvznpzgtuj.supabase.co';
}

function soublu_supabase_legacy_service_key(): string
{
    foreach (['SUPABASE_LEGACY_SERVICE_KEY', 'SUPABASE_SERVICE_KEY'] as $const) {
        if (!defined($const)) {
            continue;
        }
        $key = trim((string) constant($const));
        if ($key !== '' && !str_contains($key, 'COLE') && $key !== 'SUA_SERVICE_ROLE_KEY') {
            return $key;
        }
    }
    return '';
}

function soublu_supabase_legacy_configured(): bool
{
    return soublu_supabase_legacy_service_key() !== '';
}

function soublu_supabase_legacy_client(): SupabaseClient
{
    static $client = null;
    if ($client instanceof SupabaseClient) {
        return $client;
    }
    $key = soublu_supabase_legacy_service_key();
    if ($key === '') {
        throw new RuntimeException(
            'SUPABASE_SERVICE_KEY ausente em config.supabase.local.php (projeto original sou+blu).'
        );
    }
    $client = new SupabaseClient(soublu_supabase_legacy_url(), $key);
    return $client;
}
