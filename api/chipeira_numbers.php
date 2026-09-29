<?php
declare(strict_types=1);

/**
 * chipeira_numbers.php — ponte Chipeira -> "Solicitações de Número" (admin.html).
 * Os chips identificados na Chipeira entram no estoque `wa_numbers`, o mesmo que a
 * Supervisão/T.I. alimenta manualmente em "Adicionar Número" (js/wa-number-requests.js).
 * Auth: header X-API-Key = API_INTERNAL_KEY.
 *
 * GET  -> { ok, numbers: [ { id, number, digits, status, assignedToName, note, source,
 *                            lastSms, lastSmsCode, lastSmsAt } ] }
 * POST { "numbers": [ { "number": "+5562999999999", "slot": 12, "operator": "TIM",
 *                       "whatsapp": true|false|null, "online": true } ] }
 *      -> { ok, inserted: [...], updated: [...], unchanged: [...], invalid: [...] }
 * POST { "sms": [ { "number": "(11) 96273-0069", "body": "...codigo...", "code": "482-913" } ] }
 *      -> { ok, applied: [...], invalid: [...] }
 *      Grava o ultimo SMS/codigo na linha (colunas last_sms/last_sms_code/last_sms_at)
 *      para aparecer no painel do vendedor. NAO mexe em status/vendedor; cria a linha
 *      como `disponivel` se ainda nao existir. Ver docs/codigos-sms.md na Chipeira.
 *
 * Regras do POST { numbers } (nunca atropela o que a gestão fez no painel):
 *  - numero novo entra como `disponivel`, created_by = 'chipeira';
 *  - numero ja cadastrado nao muda status/vendedor; so' a observacao e' atualizada,
 *    e so' quando o registro foi criado pela propria Chipeira;
 *  - numero que sumiu da Chipeira NAO e' removido (pode estar em uso por alguem).
 */
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

const CHIPEIRA_SOURCE = 'chipeira';

/** Digitos nacionais (DDD + numero), sem o 55 — chave de deduplicacao. */
function chipeira_national_digits(string $raw): string
{
    $d = preg_replace('/\D+/', '', $raw) ?? '';
    $d = ltrim($d, '0');
    if ((strlen($d) === 12 || strlen($d) === 13) && strpos($d, '55') === 0) {
        $d = substr($d, 2);
    }
    return $d;
}

/** Mesmo formato do placeholder do painel: (62) 99999-9999. */
function chipeira_format_number(string $national): string
{
    if (strlen($national) === 11) {
        return sprintf('(%s) %s-%s', substr($national, 0, 2), substr($national, 2, 5), substr($national, 7));
    }
    return sprintf('(%s) %s-%s', substr($national, 0, 2), substr($national, 2, 4), substr($national, 6));
}

function chipeira_build_note(array $row): string
{
    $parts = ['Chipeira'];
    if (isset($row['slot']) && is_numeric($row['slot'])) {
        $parts[] = 'Slot ' . (int) $row['slot'];
    }
    $op = trim((string) ($row['operator'] ?? ''));
    if ($op !== '') {
        $parts[] = mb_substr($op, 0, 40);
    }
    if (array_key_exists('whatsapp', $row) && $row['whatsapp'] !== null) {
        $parts[] = $row['whatsapp'] ? 'WhatsApp ativo' : 'sem WhatsApp';
    }
    if (array_key_exists('online', $row) && $row['online'] === false) {
        $parts[] = 'chip offline';
    }
    return implode(' · ', $parts);
}

/**
 * Garante as colunas do ultimo SMS/codigo recebido na linha — usadas pra
 * mostrar o codigo ao lado do numero no painel do vendedor. ALTER idempotente
 * porque a tabela ja' existe em producao e o CREATE TABLE IF NOT EXISTS nao
 * adiciona colunas a uma tabela existente. Se o usuario do banco nao tiver
 * permissao de ALTER, segue sem quebrar o endpoint (o push de numeros continua
 * funcionando; so' o codigo nao aparece ate' a migracao rodar).
 */
function chipeira_ensure_sms_columns(PDO $pdo): void
{
    try {
        $cols = [];
        foreach ($pdo->query('SHOW COLUMNS FROM `wa_numbers`') as $c) {
            $cols[(string) ($c['Field'] ?? '')] = true;
        }
        $needed = [
            'last_sms' => 'TEXT NULL DEFAULT NULL',
            'last_sms_code' => 'VARCHAR(32) NULL DEFAULT NULL',
            'last_sms_at' => 'DATETIME NULL DEFAULT NULL',
        ];
        foreach ($needed as $col => $ddl) {
            if (!isset($cols[$col])) {
                $pdo->exec('ALTER TABLE `wa_numbers` ADD COLUMN `' . $col . '` ' . $ddl);
            }
        }
    } catch (Throwable $e) {
        /* ambiente sem permissao de ALTER — segue sem bloquear o endpoint */
    }
}

try {
    $pdo = soublu_pdo();

    // Mesmo DDL de migrate-wa-numbers.php — garante a tabela caso a migracao nao tenha rodado.
    $pdo->exec("CREATE TABLE IF NOT EXISTS `wa_numbers` (
        `id` VARCHAR(64) NOT NULL,
        `number` VARCHAR(32) NOT NULL,
        `status` VARCHAR(32) NOT NULL DEFAULT 'disponivel',
        `assigned_to` VARCHAR(64) NULL DEFAULT '',
        `assigned_to_name` VARCHAR(255) NULL DEFAULT '',
        `assigned_at` DATETIME NULL DEFAULT NULL,
        `blocked_reason` TEXT NULL DEFAULT NULL,
        `note` TEXT NULL DEFAULT NULL,
        `created_by` VARCHAR(64) NULL DEFAULT '',
        `created_by_name` VARCHAR(255) NULL DEFAULT '',
        `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uq_wa_numbers_number` (`number`),
        KEY `idx_wa_numbers_status` (`status`),
        KEY `idx_wa_numbers_assigned` (`assigned_to`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    chipeira_ensure_sms_columns($pdo);

    $existing = [];
    foreach ($pdo->query('SELECT id, number, status, assigned_to_name, note, created_by, last_sms, last_sms_code, last_sms_at FROM wa_numbers') as $r) {
        $key = chipeira_national_digits((string) $r['number']);
        if ($key !== '') {
            $existing[$key] = $r;
        }
    }

    $method = $_SERVER['REQUEST_METHOD'] ?? '';

    if ($method === 'GET') {
        $out = [];
        foreach ($existing as $digits => $r) {
            $out[] = [
                'id' => $r['id'],
                'number' => $r['number'],
                'digits' => '55' . $digits,
                'status' => $r['status'],
                'assignedToName' => $r['assigned_to_name'] ?: null,
                'note' => $r['note'],
                'source' => $r['created_by'] === CHIPEIRA_SOURCE ? CHIPEIRA_SOURCE : 'manual',
                'lastSms' => $r['last_sms'] ?? null,
                'lastSmsCode' => $r['last_sms_code'] ?? null,
                'lastSmsAt' => $r['last_sms_at'] ?? null,
            ];
        }
        soublu_json(['ok' => true, 'numbers' => $out]);
    }

    if ($method !== 'POST') {
        soublu_json(['ok' => false, 'error' => 'Use GET ou POST JSON.'], 405);
    }

    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body)) {
        soublu_json(['ok' => false, 'error' => 'Body JSON invalido.'], 400);
    }

    // Branch `sms`: ultimo SMS/codigo que caiu numa das linhas da Chipeira,
    // gravado ao lado do numero pro vendedor dono ler no painel (colunas
    // last_sms/last_sms_code/last_sms_at). NAO mexe em status/vendedor — so'
    // as colunas de SMS. Independente do branch `numbers` abaixo.
    if (is_array($body['sms'] ?? null)) {
        if (count($body['sms']) > 500) {
            soublu_json(['ok' => false, 'error' => 'Maximo de 500 SMS por envio.'], 400);
        }
        $insertMin = $pdo->prepare(
            "INSERT INTO wa_numbers (id, number, status, note, created_by, created_by_name, created_at, updated_at)
             VALUES (:id, :number, 'disponivel', :note, :created_by, 'Chipeira', NOW(), NOW())"
        );
        $updateSms = $pdo->prepare(
            'UPDATE wa_numbers SET last_sms = :body, last_sms_code = :code, last_sms_at = NOW(), updated_at = NOW() WHERE id = :id'
        );
        $applied = $invalid = [];
        foreach ($body['sms'] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $national = chipeira_national_digits((string) ($row['number'] ?? ''));
            if (strlen($national) < 10 || strlen($national) > 11) {
                $invalid[] = (string) ($row['number'] ?? '');
                continue;
            }
            // Linha ainda pode nao existir se o SMS chegar antes do push
            // periodico de numeros — cria minima (disponivel) pra o codigo
            // nao se perder do painel.
            if (!isset($existing[$national])) {
                $id = 'WAN-CHIP-' . $national;
                $insertMin->execute([
                    ':id' => $id,
                    ':number' => chipeira_format_number($national),
                    ':note' => 'Chipeira',
                    ':created_by' => CHIPEIRA_SOURCE,
                ]);
                $existing[$national] = ['id' => $id];
            }
            $smsBody = mb_substr((string) ($row['body'] ?? ''), 0, 500);
            $codeRaw = $row['code'] ?? null;
            $code = ($codeRaw === null || $codeRaw === '') ? null : mb_substr((string) $codeRaw, 0, 32);
            $updateSms->execute([':body' => $smsBody, ':code' => $code, ':id' => $existing[$national]['id']]);
            $applied[] = chipeira_format_number($national);
        }
        soublu_json(['ok' => true, 'applied' => $applied, 'invalid' => $invalid]);
    }

    if (!is_array($body['numbers'] ?? null)) {
        soublu_json(['ok' => false, 'error' => 'Campo numbers (array) e obrigatorio.'], 400);
    }
    if (count($body['numbers']) > 500) {
        soublu_json(['ok' => false, 'error' => 'Maximo de 500 numeros por envio.'], 400);
    }

    $insert = $pdo->prepare(
        "INSERT INTO wa_numbers (id, number, status, note, created_by, created_by_name, created_at, updated_at)
         VALUES (:id, :number, 'disponivel', :note, :created_by, 'Chipeira', NOW(), NOW())"
    );
    $updateNote = $pdo->prepare('UPDATE wa_numbers SET note = :note, updated_at = NOW() WHERE id = :id');

    $inserted = $updated = $unchanged = $invalid = [];

    foreach ($body['numbers'] as $row) {
        if (!is_array($row)) {
            continue;
        }
        $national = chipeira_national_digits((string) ($row['number'] ?? ''));
        if (strlen($national) < 10 || strlen($national) > 11) {
            $invalid[] = (string) ($row['number'] ?? '');
            continue;
        }
        $formatted = chipeira_format_number($national);
        $note = chipeira_build_note($row);

        if (!isset($existing[$national])) {
            $id = 'WAN-CHIP-' . $national;
            $insert->execute([':id' => $id, ':number' => $formatted, ':note' => $note, ':created_by' => CHIPEIRA_SOURCE]);
            $existing[$national] = ['id' => $id, 'note' => $note, 'created_by' => CHIPEIRA_SOURCE];
            $inserted[] = $formatted;
            continue;
        }

        $cur = $existing[$national];
        if ($cur['created_by'] === CHIPEIRA_SOURCE && (string) $cur['note'] !== $note) {
            $updateNote->execute([':note' => $note, ':id' => $cur['id']]);
            $updated[] = $formatted;
        } else {
            $unchanged[] = $formatted;
        }
    }

    soublu_json([
        'ok' => true,
        'inserted' => $inserted,
        'updated' => $updated,
        'unchanged' => $unchanged,
        'invalid' => $invalid,
    ]);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
