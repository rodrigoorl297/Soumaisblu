<?php
declare(strict_types=1);

require_once __DIR__ . '/EvolutionClient.php';
require_once __DIR__ . '/ZApiClient.php';
require_once __DIR__ . '/WhaticketClient.php';

/** Provider ativo: evolution (padrão), zapi ou whaticket. */
function soublu_whatsapp_provider(?array $instanceRow = null): string
{
    if ($instanceRow !== null) {
        $p = strtolower(trim((string) ($instanceRow['provider'] ?? '')));
        if (in_array($p, ['zapi', 'evolution', 'whaticket'], true)) {
            return $p;
        }
    }
    if (defined('WHATSAPP_PROVIDER')) {
        $p = strtolower(trim((string) WHATSAPP_PROVIDER));
        if ($p === 'whaticket' && WhaticketClient::isConfigured()) {
            return 'whaticket';
        }
        if ($p === 'evolution' && EvolutionClient::isConfigured()) {
            return 'evolution';
        }
        if ($p === 'zapi' && ZApiClient::isConfigured()) {
            return 'zapi';
        }
    }
    if (WhaticketClient::isConfigured() && defined('WHATSAPP_PROVIDER') && strtolower((string) WHATSAPP_PROVIDER) === 'whaticket') {
        return 'whaticket';
    }
    if (EvolutionClient::isConfigured()) {
        return 'evolution';
    }
    if (ZApiClient::isConfigured()) {
        return 'zapi';
    }
    if (WhaticketClient::isConfigured()) {
        return 'whaticket';
    }
    return 'evolution';
}

function soublu_whatsapp_configured(): bool
{
    return EvolutionClient::isConfigured() || ZApiClient::isConfigured() || WhaticketClient::isConfigured();
}

/** @return EvolutionClient|ZApiClient|WhaticketClient */
function soublu_whatsapp_client(?array $instanceRow = null): EvolutionClient|ZApiClient|WhaticketClient
{
    $provider = soublu_whatsapp_provider($instanceRow);
    if ($provider === 'zapi') {
        return ZApiClient::fromInstanceRow($instanceRow);
    }
    if ($provider === 'whaticket') {
        return new WhaticketClient();
    }
    return new EvolutionClient();
}

function soublu_whatsapp_parse_connection_state(array $resp): string
{
    $provider = soublu_whatsapp_provider();
    if ($provider === 'zapi') {
        return ZApiClient::parseConnectionState($resp);
    }
    if ($provider === 'whaticket') {
        return WhaticketClient::parseConnectionState($resp);
    }
    return EvolutionClient::parseConnectionState($resp);
}

function soublu_whatsapp_parse_instance_list_state(array $resp, string $instanceName): ?string
{
    $provider = soublu_whatsapp_provider();
    if ($provider === 'zapi') {
        return ZApiClient::parseInstanceListState($resp, $instanceName);
    }
    if ($provider === 'whaticket') {
        return WhaticketClient::parseInstanceListState($resp, $instanceName);
    }
    return EvolutionClient::parseInstanceListState($resp, $instanceName);
}

function soublu_whatsapp_extract_qr(array $resp): ?string
{
    $provider = soublu_whatsapp_provider();
    if ($provider === 'zapi') {
        return ZApiClient::extractQr($resp);
    }
    if ($provider === 'whaticket') {
        return WhaticketClient::extractQr($resp);
    }
    return EvolutionClient::extractQr($resp);
}

function soublu_zapi_is_configured(): bool
{
    return ZApiClient::isConfigured();
}

function soublu_whaticket_is_configured(): bool
{
    return WhaticketClient::isConfigured();
}
