<?php
declare(strict_types=1);

/**
 * proposal-catalog.php — catálogo configurável do cadastro de propostas.
 * GET  ?action=get     → overrides salvos + merged (defaults vêm do JS; aqui só persiste deltas).
 * POST ?action=save    → grava overrides (master/backoffice/operacional+).
 */
require_once __DIR__ . '/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
}

function pc_path(): string
{
    return soublu_config_root() . '/config.proposal-catalog.json';
}

/** Chaves permitidas no JSON de overrides. */
function pc_allowed_keys(): array
{
    return [
        'produtos',
        'convenios',
        'convenioEntidades',
        'vendorSituacoes',
        'bancosComprados',
        'bancosDigitados',
        'tiposOperacao',
    ];
}

function pc_read_overrides(): array
{
    $path = pc_path();
    if (!is_file($path)) {
        return [];
    }
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return [];
    }
    $out = [];
    foreach (pc_allowed_keys() as $k) {
        if (array_key_exists($k, $data)) {
            $out[$k] = $data[$k];
        }
    }
    return $out;
}

function pc_write_overrides(array $data): bool
{
    $clean = [];
    foreach (pc_allowed_keys() as $k) {
        if (!array_key_exists($k, $data)) {
            continue;
        }
        $clean[$k] = $data[$k];
    }
    $clean['updatedAt'] = gmdate('c');
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        return false;
    }
    return @file_put_contents(pc_path(), $json) !== false;
}

/** Papéis que podem alterar o catálogo (alinhado a _canManageProposalCatalog no JS). */
function pc_can_manage_role(string $role): bool
{
    $r = strtolower(trim($role));
    return in_array($r, [
        'master', 'fundador', 'desenvolvedor', 'gerente', 'gerencia', 'diretoria',
        'sup_backoffice', 'backoffice', 'operacional', 'financeiro', 'financial',
    ], true);
}

function pc_sanitize_overrides(array $in): array
{
    $out = [];
    if (isset($in['produtos']) && is_array($in['produtos'])) {
        $out['produtos'] = array_values(array_filter(array_map(static function ($x) {
            return trim((string) $x);
        }, $in['produtos']), static fn ($x) => $x !== ''));
    }
    if (isset($in['convenios']) && is_array($in['convenios'])) {
        $out['convenios'] = array_values(array_filter(array_map(static function ($x) {
            return strtoupper(trim((string) $x));
        }, $in['convenios']), static fn ($x) => $x !== ''));
    }
    if (isset($in['convenioEntidades']) && is_array($in['convenioEntidades'])) {
        $map = [];
        foreach ($in['convenioEntidades'] as $conv => $list) {
            $key = strtoupper(trim((string) $conv));
            if ($key === '' || !is_array($list)) {
                continue;
            }
            $items = array_values(array_filter(array_map(static function ($x) {
                return trim((string) $x);
            }, $list), static fn ($x) => $x !== ''));
            if ($items) {
                $map[$key] = $items;
            }
        }
        $out['convenioEntidades'] = $map;
    }
    if (isset($in['vendorSituacoes']) && is_array($in['vendorSituacoes'])) {
        $sit = [];
        foreach ($in['vendorSituacoes'] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $v = trim((string) ($row['v'] ?? $row['value'] ?? ''));
            if ($v === '') {
                continue;
            }
            $l = trim((string) ($row['l'] ?? $row['label'] ?? $v));
            $sit[] = ['v' => $v, 'l' => $l];
        }
        $out['vendorSituacoes'] = $sit;
    }
    foreach (['bancosComprados', 'bancosDigitados', 'tiposOperacao'] as $listKey) {
        if (!isset($in[$listKey]) || !is_array($in[$listKey])) {
            continue;
        }
        $out[$listKey] = array_values(array_filter(array_map(static function ($x) {
            return trim((string) $x);
        }, $in[$listKey]), static fn ($x) => $x !== ''));
    }
    return $out;
}

$action = strtolower(trim((string) ($_GET['action'] ?? '')));
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'GET' && ($action === '' || $action === 'get')) {
    $overrides = pc_read_overrides();
    soublu_json(['ok' => true, 'overrides' => $overrides]);
}

if ($method === 'POST' && $action === 'save') {
    $raw = file_get_contents('php://input') ?: '';
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        soublu_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
    }
    $role = strtolower(trim((string) ($body['role'] ?? '')));
    if (!pc_can_manage_role($role)) {
        soublu_json(['ok' => false, 'error' => 'Sem permissão para alterar o catálogo.'], 403);
    }
    $overrides = pc_sanitize_overrides((array) ($body['overrides'] ?? $body));
    if (!pc_write_overrides($overrides)) {
        soublu_json(['ok' => false, 'error' => 'Falha ao gravar configuração.'], 500);
    }
    soublu_json(['ok' => true, 'overrides' => pc_read_overrides()]);
}

soublu_json(['ok' => false, 'error' => 'Ação inválida. Use GET ?action=get ou POST ?action=save'], 400);
