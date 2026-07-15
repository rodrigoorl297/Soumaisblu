<?php
declare(strict_types=1);

/**
 * Recupera propostas hard-deleted no MySQL a partir do Supabase legado (sou+blu)
 * ou reconstrói esqueleto mínimo a partir de créditos em transactions.
 *
 * GET  ?action=probe          — só consulta (não grava)
 * POST ?action=restore        — restaura do Supabase as 8 números conhecidos
 * POST ?action=sync_all       — traz TODAS as propostas do Supabase que faltam no MySQL
 * POST ?action=rebuild_stub   — cria stubs PAGO a partir de transactions (dados incompletos)
 */
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/SupabaseLegacy.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$MISSING_NUMEROS = [
    '20260622250375',
    '20260623250577',
    '20260623250804',
    '20260623250845',
    '20260624250965',
    '20260624251131',
    '20260625251201',
    '20260625251324',
];

$action = strtolower(trim((string) ($_GET['action'] ?? $_POST['action'] ?? 'probe')));

function recover_mysql_has_numero(PDO $pdo, string $numero): ?array
{
    $st = $pdo->prepare(
        'SELECT id, numero, clientName, vendorName, status, statusOp, valorFinal
         FROM proposals
         WHERE numero = ? OR numero = ? OR id = ?
         LIMIT 1'
    );
    $st->execute([$numero, '#' . $numero, $numero]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function recover_mysql_has_id(PDO $pdo, string $id): bool
{
    $st = $pdo->prepare('SELECT id FROM proposals WHERE id = ? LIMIT 1');
    $st->execute([$id]);
    return (bool) $st->fetchColumn();
}

function recover_fetch_supabase_by_numeros(array $numeros): array
{
    $found = [];
    $errors = [];

    if (soublu_supabase_legacy_configured()) {
        try {
            $client = soublu_supabase_legacy_client();
            $in = implode(',', $numeros);
            $rows = $client->rest('GET', 'proposals', null, 'numero=in.(' . $in . ')&select=*');
            if (is_array($rows)) {
                foreach ($rows as $row) {
                    if (is_array($row) && !empty($row['id'])) {
                        $found[(string) $row['id']] = $row;
                    }
                }
            }
            // também tenta com #
            $hashed = array_map(static fn($n) => '#' . $n, $numeros);
            $in2 = implode(',', $hashed);
            $rows2 = $client->rest('GET', 'proposals', null, 'numero=in.(' . $in2 . ')&select=*');
            if (is_array($rows2)) {
                foreach ($rows2 as $row) {
                    if (is_array($row) && !empty($row['id'])) {
                        $found[(string) $row['id']] = $row;
                    }
                }
            }
        } catch (Throwable $e) {
            $errors[] = 'service_key: ' . $e->getMessage();
        }
    }

    $url = soublu_supabase_legacy_url() . '/rest/v1/proposals';
    $anon = '';
    if (defined('SUPABASE_ANON_KEY')) {
        $anon = trim((string) SUPABASE_ANON_KEY);
    }
    if ($anon === '') {
        $anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcHRubHl3YmFydnpucHpndHVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzQ5NTEsImV4cCI6MjA5NDE1MDk1MX0.ntbw10N2fno5hbdLWaKgz11jk-n2gvxZ7zjI0O_Xt1I';
    }

    $ors = [];
    foreach ($numeros as $n) {
        $ors[] = 'numero.eq.' . $n;
        $ors[] = 'numero.eq.%23' . $n;
    }
    $q = '?select=*&or=(' . implode(',', $ors) . ')';
    $ch = curl_init($url . $q);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $anon,
            'Authorization: Bearer ' . $anon,
            'Accept: application/json',
        ],
        CURLOPT_TIMEOUT => 45,
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);
    if ($cerr) {
        $errors[] = 'anon_curl: ' . $cerr;
    }
    if ($code >= 200 && $code < 300) {
        $rows = json_decode((string) $raw, true);
        if (is_array($rows)) {
            foreach ($rows as $row) {
                if (is_array($row) && !empty($row['id'])) {
                    $found[(string) $row['id']] = $row;
                }
            }
        }
    } else {
        $errors[] = 'anon_http=' . $code . ' body=' . substr((string) $raw, 0, 200);
    }

    return ['rows' => array_values($found), 'errors' => $errors, 'legacy_configured' => soublu_supabase_legacy_configured()];
}

/**
 * Página todas as propostas do Supabase legado via service_role.
 * @return array{rows: list<array>, errors: list<string>, pages: int}
 */
function recover_fetch_all_supabase_proposals(int $pageSize = 50): array
{
    $rows = [];
    $errors = [];
    $pages = 0;

    if (!soublu_supabase_legacy_configured()) {
        return ['rows' => [], 'errors' => ['Supabase legado sem service_key'], 'pages' => 0];
    }

    // Sem attachments/history (JSON pesado) para evitar timeout no PostgREST
    $select = 'id,numero,"vendorId",vendor_id,employee_id,"vendorName",vendor_name,'
        . '"clientName",client_name,"clientCpf",client_cpf,product,convenio,entidade,obs,'
        . 'status,"statusOp",status_op,valor,desconto,"valorFinal",valor_final,'
        . '"createdAt",created_at,"updatedAt",updated_at,assinou,fases,matricula,tabela,'
        . '"bancoDigitado",banco_digitado,protocolo,bacen,nuvidio,"posVenda",pos_venda';

    try {
        $client = soublu_supabase_legacy_client();
        $offset = 0;
        while (true) {
            $pages++;
            $batch = $client->rest(
                'GET',
                'proposals',
                null,
                'select=' . $select . '&order=id.asc&limit=' . $pageSize . '&offset=' . $offset
            );
            if (!is_array($batch)) {
                $errors[] = 'page ' . $pages . ': resposta invalida';
                break;
            }
            if (!$batch) {
                break;
            }
            foreach ($batch as $row) {
                if (is_array($row) && !empty($row['id'])) {
                    $rows[] = $row;
                }
            }
            if (count($batch) < $pageSize) {
                break;
            }
            $offset += $pageSize;
            if ($pages > 40) {
                $errors[] = 'stop: >40 pages';
                break;
            }
        }
    } catch (Throwable $e) {
        $errors[] = $e->getMessage();
    }

    return ['rows' => $rows, 'errors' => $errors, 'pages' => $pages];
}

function recover_insert_mysql_proposal(PDO $pdo, array $row): array
{
    $id = (string) ($row['id'] ?? '');
    if ($id === '') {
        return ['ok' => false, 'error' => 'sem id'];
    }
    $chk = $pdo->prepare('SELECT id FROM proposals WHERE id = ? LIMIT 1');
    $chk->execute([$id]);
    if ($chk->fetch()) {
        return ['ok' => true, 'skipped' => true, 'id' => $id];
    }

    // Evita duplicar por número se já existir outra linha com o mesmo numero
    $numero = trim((string) ($row['numero'] ?? ''));
    $numeroDigits = preg_replace('/\D+/', '', $numero);
    if ($numeroDigits !== '' && strlen($numeroDigits) >= 8) {
        $dup = recover_mysql_has_numero($pdo, $numeroDigits);
        if ($dup) {
            return [
                'ok' => true,
                'skipped' => true,
                'id' => $id,
                'reason' => 'numero_ja_existe',
                'existing_id' => $dup['id'] ?? null,
            ];
        }
    }

    $cols = [];
    $st = $pdo->query('SHOW COLUMNS FROM proposals');
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $cols[$c['Field']] = true;
    }

    $data = [];
    foreach ($row as $k => $v) {
        if (!isset($cols[$k])) {
            continue;
        }
        if (is_array($v) || is_object($v)) {
            $data[$k] = json_encode($v, JSON_UNESCAPED_UNICODE);
        } else {
            $data[$k] = $v;
        }
    }
    if (!isset($data['id'])) {
        $data['id'] = $id;
    }

    // Normaliza aliases comuns camel/snake se a coluna MySQL existir
    $aliases = [
        'vendorId' => ['vendor_id', 'employee_id'],
        'vendorName' => ['vendor_name'],
        'clientName' => ['client_name'],
        'clientCpf' => ['client_cpf'],
        'valorFinal' => ['valor_final'],
        'statusOp' => ['status_op'],
    ];
    foreach ($aliases as $camel => $snakes) {
        if (!isset($cols[$camel])) {
            continue;
        }
        if (!array_key_exists($camel, $data) || $data[$camel] === null || $data[$camel] === '') {
            foreach ($snakes as $s) {
                if (isset($row[$s]) && $row[$s] !== null && $row[$s] !== '') {
                    $data[$camel] = is_array($row[$s]) ? json_encode($row[$s], JSON_UNESCAPED_UNICODE) : $row[$s];
                    break;
                }
            }
        }
    }

    $fields = array_keys($data);
    $placeholders = array_map(static fn($f) => ':' . $f, $fields);
    $sql = 'INSERT INTO proposals (`' . implode('`,`', $fields) . '`) VALUES (' . implode(',', $placeholders) . ')';
    $ins = $pdo->prepare($sql);
    foreach ($data as $k => $v) {
        $ins->bindValue(':' . $k, $v);
    }
    $ins->execute();
    return [
        'ok' => true,
        'inserted' => true,
        'id' => $id,
        'numero' => $data['numero'] ?? null,
        'vendorName' => $data['vendorName'] ?? ($data['vendor_name'] ?? null),
        'clientName' => $data['clientName'] ?? ($data['client_name'] ?? null),
    ];
}

function recover_tx_credits_for_numeros(PDO $pdo, array $numeros): array
{
    $out = [];
    $st = $pdo->query('SELECT id, amount, type, reason, employee_id, created_at FROM transactions ORDER BY created_at DESC LIMIT 2000');
    $rows = $st ? $st->fetchAll(PDO::FETCH_ASSOC) : [];
    foreach ($rows as $tx) {
        $reason = (string) ($tx['reason'] ?? '');
        foreach ($numeros as $n) {
            if (strpos($reason, $n) === false) {
                continue;
            }
            if (!isset($out[$n])) {
                $out[$n] = [];
            }
            $out[$n][] = $tx;
        }
    }
    return $out;
}

try {
    $pdo = soublu_pdo();
    $mysqlStatus = [];
    $stillMissing = [];
    foreach ($MISSING_NUMEROS as $n) {
        $row = recover_mysql_has_numero($pdo, $n);
        $mysqlStatus[$n] = $row;
        if (!$row) {
            $stillMissing[] = $n;
        }
    }

    if ($action === 'probe') {
        $sb = recover_fetch_supabase_by_numeros($stillMissing);
        $tx = recover_tx_credits_for_numeros($pdo, $stillMissing);
        $mysqlCount = (int) $pdo->query('SELECT COUNT(*) FROM proposals')->fetchColumn();
        soublu_json([
            'ok' => true,
            'action' => 'probe',
            'mysql_proposals_count' => $mysqlCount,
            'mysql_present' => array_keys(array_filter($mysqlStatus)),
            'mysql_missing' => $stillMissing,
            'supabase' => $sb,
            'transactions_by_numero' => $tx,
            'note' => 'Exclusao e HARD DELETE. sync_all restaura linhas do Supabase faltantes no MySQL. rebuild_stub usa so transactions.',
        ]);
    }

    if ($action === 'restore') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST para restore'], 405);
        }
        $sb = recover_fetch_supabase_by_numeros($stillMissing);
        $restored = [];
        $failed = [];
        foreach ($sb['rows'] as $row) {
            try {
                $restored[] = recover_insert_mysql_proposal($pdo, $row);
            } catch (Throwable $e) {
                $failed[] = ['id' => $row['id'] ?? null, 'error' => $e->getMessage()];
            }
        }
        soublu_json([
            'ok' => true,
            'action' => 'restore',
            'missing_before' => $stillMissing,
            'supabase_found' => count($sb['rows']),
            'supabase_errors' => $sb['errors'],
            'restored' => $restored,
            'failed' => $failed,
        ]);
    }

    if ($action === 'sync_all') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST para sync_all'], 405);
        }
        $dry = isset($_GET['dry']) || isset($_POST['dry']);
        $sb = recover_fetch_all_supabase_proposals(200);
        $inserted = [];
        $skipped = [];
        $failed = [];
        foreach ($sb['rows'] as $row) {
            $id = (string) ($row['id'] ?? '');
            if ($id === '') {
                continue;
            }
            if (recover_mysql_has_id($pdo, $id)) {
                $skipped[] = $id;
                continue;
            }
            if ($dry) {
                $inserted[] = [
                    'ok' => true,
                    'would_insert' => true,
                    'id' => $id,
                    'numero' => $row['numero'] ?? null,
                    'vendorName' => $row['vendorName'] ?? ($row['vendor_name'] ?? null),
                    'clientName' => $row['clientName'] ?? ($row['client_name'] ?? null),
                    'status' => $row['status'] ?? null,
                ];
                continue;
            }
            try {
                $res = recover_insert_mysql_proposal($pdo, $row);
                if (!empty($res['inserted'])) {
                    $inserted[] = $res;
                } else {
                    $skipped[] = $id;
                }
            } catch (Throwable $e) {
                $failed[] = ['id' => $id, 'error' => $e->getMessage()];
            }
        }
        soublu_json([
            'ok' => true,
            'action' => 'sync_all',
            'dry' => $dry,
            'supabase_total' => count($sb['rows']),
            'supabase_pages' => $sb['pages'],
            'supabase_errors' => $sb['errors'],
            'already_in_mysql' => count($skipped),
            'inserted_count' => count($inserted),
            'inserted' => $inserted,
            'failed' => $failed,
        ]);
    }

    if ($action === 'rebuild_stub') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            soublu_json(['ok' => false, 'error' => 'Use POST para rebuild_stub'], 405);
        }
        $tx = recover_tx_credits_for_numeros($pdo, $stillMissing);
        $created = [];
        foreach ($stillMissing as $n) {
            $credits = $tx[$n] ?? [];
            if (!$credits) {
                $created[] = ['ok' => false, 'numero' => $n, 'error' => 'sem transaction'];
                continue;
            }
            $best = $credits[0];
            foreach ($credits as $c) {
                if (strcasecmp((string) ($c['type'] ?? ''), 'credit') === 0) {
                    $best = $c;
                    break;
                }
            }
            $amount = (float) ($best['amount'] ?? 0);
            $emp = (string) ($best['employee_id'] ?? '');
            $vendorName = '';
            if ($emp !== '') {
                $us = $pdo->prepare('SELECT name FROM users WHERE id = ? LIMIT 1');
                $us->execute([$emp]);
                $vendorName = (string) ($us->fetchColumn() ?: '');
            }
            $id = 'PROP-RECOVER-' . $n;
            $createdAt = $best['created_at'] ?? date('Y-m-d H:i:s');
            // Data de faturamento aproximada a partir do número YYYYMMDD...
            $billDate = null;
            if (preg_match('/^(20\d{2})(\d{2})(\d{2})/', $n, $m)) {
                $billDate = $m[1] . '-' . $m[2] . '-' . $m[3] . ' 12:00:00';
            }
            $row = [
                'id' => $id,
                'numero' => $n,
                'vendorId' => $emp,
                'vendor_id' => $emp,
                'employee_id' => $emp,
                'vendorName' => $vendorName,
                'vendor_name' => $vendorName,
                // Sem inventar cliente: vazio + obs clara
                'clientName' => '',
                'client_name' => '',
                'status' => 'PAGO',
                'statusOp' => 'PAGO',
                'status_op' => 'PAGO',
                'valor' => $amount,
                'valorFinal' => $amount,
                'valor_final' => $amount,
                'obs' => 'RECUPERADO PARCIAL (hard-delete). Fonte: transactions Eleva. Cliente/CPF/produto/anexos ausentes — completar se houver backup Locaweb.',
                'created_at' => $billDate ?: $createdAt,
                'updated_at' => date('Y-m-d H:i:s'),
                'createdAt' => $billDate ?: $createdAt,
                'updatedAt' => date('Y-m-d H:i:s'),
            ];
            try {
                $created[] = recover_insert_mysql_proposal($pdo, $row);
            } catch (Throwable $e) {
                $created[] = ['ok' => false, 'numero' => $n, 'error' => $e->getMessage()];
            }
        }
        soublu_json([
            'ok' => true,
            'action' => 'rebuild_stub',
            'created' => $created,
            'warning' => 'Stubs parciais (sem cliente). Preferivel backup MySQL/Locaweb para dados completos.',
        ]);
    }

    soublu_json(['ok' => false, 'error' => 'action invalida: probe|restore|sync_all|rebuild_stub'], 400);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
