<?php
declare(strict_types=1);

/**
 * Mercadinho ZS — endpoint único de integração para o sistema externo do mercadinho.
 *
 * POST JSON { action: "consulta" | "cobrar", ... } autenticado pela mesma
 * X-API-Key da API REST (API_INTERNAL_KEY em config.db.local.php).
 *
 * - consulta: { cracha_codigo } → funcionário + limite do Clube de Benefícios.
 * - cobrar:   { cracha_codigo, valor, itens?, operador? } → debita o limite
 *   (transação + lock de linha) e emite voucher em beneficios_vouchers,
 *   compatível com o extrato do Clube.
 */

ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/RhMysqlSchema.php';
require_once __DIR__ . '/lib/BeneficiosMysqlSchema.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    soublu_json(['ok' => true], 204);
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Não autorizado.', 'hint' => 'Header X-API-Key'], 401);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    soublu_json(['ok' => false, 'error' => 'Use POST com JSON {action, ...}.'], 405);
}

$raw = file_get_contents('php://input');
$body = $raw !== '' && $raw !== false ? json_decode($raw, true) : null;
if (!is_array($body)) {
    soublu_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
}

$action = strtolower(trim((string) ($body['action'] ?? '')));
if (!in_array($action, ['consulta', 'cobrar'], true)) {
    soublu_json(['ok' => false, 'error' => 'action deve ser "consulta" ou "cobrar".'], 400);
}

function mercadinho_round2(mixed $v): float
{
    return round((float) $v, 2);
}

/** Coluna/tabela ausente (schema ainda não migrado neste banco). */
function mercadinho_is_schema_error(Throwable $e): bool
{
    return (bool) preg_match('/Unknown column|doesn\'t exist|42S22|42S02|1054|1146/i', $e->getMessage());
}

/** Funcionário ativo pelo código do crachá (ignora demitidos). */
function mercadinho_find_employee(PDO $pdo, string $cracha): ?array
{
    $run = static function () use ($pdo, $cracha): array {
        $st = $pdo->prepare(
            'SELECT * FROM `rh_employees` WHERE `cracha_codigo` = ? ORDER BY `updated_at` DESC LIMIT 5'
        );
        $st->execute([$cracha]);
        return $st->fetchAll() ?: [];
    };
    try {
        $rows = $run();
    } catch (Throwable $e) {
        if (!mercadinho_is_schema_error($e)) {
            throw $e;
        }
        // Cria/migra sob demanda (mesmo ensure de api/migrate-rh-core.php).
        soublu_ensure_rh_core_schema($pdo);
        $rows = $run();
    }
    foreach ($rows as $row) {
        $demitido = (int) ($row['demitido'] ?? 0) === 1
            || strtolower(trim((string) ($row['status'] ?? ''))) === 'demitido';
        if (!$demitido) {
            return $row;
        }
    }
    return null;
}

/**
 * Candidatos de employee_id em beneficios_limites, na mesma ordem usada
 * pelo RH: user_id de login vinculado → fontedata_meta.linked_user_id → id RH.
 *
 * @return list<string>
 */
function mercadinho_limite_candidates(array $emp): array
{
    $ids = [];
    $add = static function ($v) use (&$ids): void {
        $s = trim((string) ($v ?? ''));
        if ($s !== '' && !in_array($s, $ids, true)) {
            $ids[] = $s;
        }
    };
    $add($emp['user_id'] ?? null);
    $meta = $emp['fontedata_meta'] ?? null;
    if (is_string($meta) && $meta !== '') {
        $meta = json_decode($meta, true);
    }
    if (is_array($meta)) {
        $add($meta['linked_user_id'] ?? null);
    }
    $add($emp['id'] ?? null);
    return $ids;
}

/** Linha do limite do Clube para o funcionário (opcionalmente com lock FOR UPDATE). */
function mercadinho_find_limite(PDO $pdo, array $emp, bool $forUpdate = false): ?array
{
    $suffix = $forUpdate ? ' FOR UPDATE' : '';
    foreach (mercadinho_limite_candidates($emp) as $uid) {
        $st = $pdo->prepare(
            'SELECT * FROM `beneficios_limites` WHERE `employee_id` = ?
             ORDER BY `updated_at` DESC LIMIT 1' . $suffix
        );
        $st->execute([$uid]);
        $row = $st->fetch();
        if ($row) {
            return $row;
        }
    }
    return null;
}

/** Prestador "Mercadinho ZS" (categoria Mercado) — cria sob demanda. */
function mercadinho_prestador(PDO $pdo): array
{
    $st = $pdo->prepare("SELECT `id`, `nome_fantasia` FROM `beneficios_prestadores` WHERE `categoria` = 'Mercado' LIMIT 1");
    $st->execute();
    $row = $st->fetch();
    if ($row) {
        return $row;
    }
    $id = 'ben_pre_' . bin2hex(random_bytes(6));
    try {
        $ins = $pdo->prepare(
            'INSERT INTO `beneficios_prestadores`
                (`id`, `codigo_parceiro`, `nome_fantasia`, `cnpj_cpf`, `chave_pix`, `dia_pagamento`, `categoria`, `pagamento_automatico`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $id,
            'MERC-' . strtoupper(base_convert((string) time(), 10, 36)),
            'Mercadinho ZS',
            '00000000000',
            '',
            5,
            'Mercado',
            'NÃO',
        ]);
        return ['id' => $id, 'nome_fantasia' => 'Mercadinho ZS'];
    } catch (Throwable $e) {
        // Corrida com outra criação simultânea: relê.
        $st->execute();
        $row = $st->fetch();
        if ($row) {
            return $row;
        }
        throw $e;
    }
}

function mercadinho_voucher_no(): string
{
    $rand = strtoupper(substr(bin2hex(random_bytes(3)), 0, 4));
    return 'ZS-' . date('dmY') . '-' . $rand;
}

/** Payload do funcionário + limite (consulta e validação da cobrança). */
function mercadinho_resolve(PDO $pdo, array $body, bool $lockLimite): array
{
    $cracha = trim((string) ($body['cracha_codigo'] ?? ''));
    if ($cracha === '') {
        throw new RuntimeException('Informe cracha_codigo.', 400);
    }
    $emp = mercadinho_find_employee($pdo, $cracha);
    if (!$emp) {
        throw new RuntimeException('Crachá não encontrado. Confira o código no cadastro do RH.', 404);
    }
    // Garante as tabelas do Clube antes de consultar o limite (mesmo gate do /api/rest).
    if (!soublu_beneficios_tables_exist($pdo)) {
        soublu_ensure_beneficios_tables($pdo);
    }
    $limite = mercadinho_find_limite($pdo, $emp, $lockLimite);
    $aprovado = $limite ? mercadinho_round2($limite['limite_aprovado']) : 0.0;
    if (!$limite || $aprovado <= 0) {
        throw new RuntimeException(
            trim((string) ($emp['nome'] ?? 'Funcionário')) . ' não tem limite aprovado no Clube de Benefícios.',
            404
        );
    }
    return [$emp, $limite];
}

try {
    $pdo = soublu_pdo();

    if ($action === 'consulta') {
        [$emp, $limite] = mercadinho_resolve($pdo, $body, false);
        $aprovado = mercadinho_round2($limite['limite_aprovado']);
        $utilizado = max(0.0, min($aprovado, mercadinho_round2($limite['limite_utilizado'])));
        $disponivel = max(0.0, mercadinho_round2($aprovado - $utilizado));
        soublu_json([
            'ok' => true,
            'funcionario' => [
                'nome' => (string) ($emp['nome'] ?? $limite['employee_name'] ?? ''),
                'employee_id' => (string) $limite['employee_id'],
            ],
            'limite' => [
                'aprovado' => $aprovado,
                'utilizado' => $utilizado,
                'disponivel' => $disponivel,
            ],
        ]);
    }

    // ── action: cobrar ──
    $valor = mercadinho_round2($body['valor'] ?? 0);
    if ($valor <= 0) {
        throw new RuntimeException('Informe valor maior que zero.', 400);
    }
    $itens = is_array($body['itens'] ?? null) ? $body['itens'] : [];
    $operador = trim((string) ($body['operador'] ?? ''));

    /* Pré-validação FORA da transação: dispara ensure/migração de schema (DDL
       faria commit implícito dentro da transação) e falha cedo com 404 claro. */
    mercadinho_resolve($pdo, $body, false);

    // Prestador fora da transação (mantém o lock do limite curto).
    $prestador = mercadinho_prestador($pdo);

    $pdo->beginTransaction();
    try {
        [$emp, $limite] = mercadinho_resolve($pdo, $body, true);

        // Mesmo cálculo do _debitLimit de js/clube-beneficios.js.
        $aprovado = max(0.0, mercadinho_round2($limite['limite_aprovado']));
        $utilizado = max(0.0, min($aprovado, mercadinho_round2($limite['limite_utilizado'])));
        $disponivel = max(0.0, mercadinho_round2($aprovado - $utilizado));
        if ($valor > $disponivel + 0.009) {
            throw new RuntimeException(
                sprintf('Saldo insuficiente: disponível R$ %.2f para uma compra de R$ %.2f.', $disponivel, $valor),
                409
            );
        }
        $novoUtilizado = min($aprovado, mercadinho_round2($utilizado + $valor));
        $novoDisponivel = max(0.0, mercadinho_round2($aprovado - $novoUtilizado));

        // UPDATE condicional (guarda extra além do FOR UPDATE).
        $up = $pdo->prepare(
            "UPDATE `beneficios_limites`
             SET `limite_utilizado` = ?, `limite_disponivel` = ?, `status` = 'aprovado'
             WHERE `id` = ? AND `limite_disponivel` + 0.009 >= ?"
        );
        $up->execute([$novoUtilizado, $novoDisponivel, $limite['id'], $valor]);
        if ($up->rowCount() < 1) {
            throw new RuntimeException(
                sprintf('Saldo insuficiente: disponível R$ %.2f para uma compra de R$ %.2f.', $disponivel, $valor),
                409
            );
        }

        $voucherNo = mercadinho_voucher_no();
        $detalhes = [
            'origem' => 'mercadinho',
            'cracha_codigo' => trim((string) ($body['cracha_codigo'] ?? '')),
            'operador' => $operador !== '' ? $operador : null,
            'itens' => $itens,
        ];
        $ins = $pdo->prepare(
            'INSERT INTO `beneficios_vouchers`
                (`id`, `voucher_no`, `employee_id`, `employee_name`, `prestador_id`, `prestador_name`,
                 `categoria`, `valor`, `status`, `detalhes_pedido`, `created_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            'ben_vou_' . bin2hex(random_bytes(6)),
            $voucherNo,
            (string) $limite['employee_id'],
            trim((string) ($emp['nome'] ?? $limite['employee_name'] ?? '')),
            (string) $prestador['id'],
            (string) ($prestador['nome_fantasia'] ?? 'Mercadinho ZS'),
            'Mercado',
            $valor,
            'utilizado',
            json_encode($detalhes, JSON_UNESCAPED_UNICODE),
            date('Y-m-d H:i:s'),
        ]);

        $pdo->commit();
    } catch (Throwable $e) {
        // Rollback estorna o débito se o voucher (ou qualquer passo) falhar.
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    soublu_json([
        'ok' => true,
        'voucher_no' => $voucherNo,
        'saldo_restante' => $novoDisponivel,
    ]);
} catch (RuntimeException $e) {
    $code = $e->getCode() >= 400 && $e->getCode() < 600 ? (int) $e->getCode() : 500;
    soublu_json(['ok' => false, 'error' => $e->getMessage()], $code);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'Erro interno: ' . $e->getMessage()], 500);
}
