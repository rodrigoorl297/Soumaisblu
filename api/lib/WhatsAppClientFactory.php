<?php
declare(strict_types=1);

require_once __DIR__ . '/EvolutionClient.php';
require_once __DIR__ . '/ZApiClient.php';

/** Provider ativo: zapi (prioridade) ou evolution. */
function soublu_whatsapp_provider(?array $instanceRow = null): string
{
    if ($instanceRow !== null) {
        $p = strtolower(trim((string) ($instanceRow['provider'] ?? '')));
        if ($p === 'zapi' || $p === 'evolution') {
            return $p;
        }
    }
    if (defined('WHATSAPP_PROVIDER')) {
        $p = strtolower(trim((string) WHATSAPP_PROVIDER));
        if ($p === 'zapi' || $p === 'evolution') {
            return $p;
        }
    }
    return ZApiClient::isConfigured() ? 'zapi' : 'evolution';
}

function soublu_whatsapp_configured(): bool
{
    return ZApiClient::isConfigured() || EvolutionClient::isConfigured();
}

/** @return EvolutionClient|ZApiClient */
function soublu_whatsapp_client(?array $instanceRow = null): EvolutionClient|ZApiClient
{
    if (soublu_whatsapp_provider($instanceRow) === 'zapi') {
        return ZApiClient::fromInstanceRow($instanceRow);
    }
    return new EvolutionClient();
}

function soublu_whatsapp_parse_connection_state(array $resp): string
{
    if (soublu_whatsapp_provider() === 'zapi') {
        return ZApiClient::parseConnectionState($resp);
    }
    return EvolutionClient::parseConnectionState($resp);
}

function soublu_whatsapp_parse_instance_list_state(array $resp, string $instanceName): ?string
{
    if (soublu_whatsapp_provider() === 'zapi') {
        return ZApiClient::parseInstanceListState($resp, $instanceName);
    }
    return EvolutionClient::parseInstanceListState($resp, $instanceName);
}

function soublu_whatsapp_extract_qr(array $resp): ?string
{
    if (soublu_whatsapp_provider() === 'zapi') {
        return ZApiClient::extractQr($resp);
    }
    return EvolutionClient::extractQr($resp);
}

function soublu_zapi_is_configured(): bool
{
    return ZApiClient::isConfigured();
}
