<?php
declare(strict_types=1);

final class PostgRestCompat
{
    /** Limite padrão quando o cliente não envia limit (evita SELECT * ilimitado). */
    private const DEFAULT_LIMIT = 200;

    /** Teto absoluto — mesmo se o cliente pedir mais. */
    private const HARD_CAP = 1000;

    /** Tetos por tabela pesada (menor que HARD_CAP). */
    private const TABLE_CAPS = [
        'proposals' => 800,
        'users' => 1000,
        'transactions' => 500,
        'clients' => 800,
        'tickets' => 300,
        'leads' => 500,
        'wa_messages' => 300,
        'wa_chats' => 400,
        'finance_proposta_ops' => 500,
        'beneficios_vouchers' => 500,
        'rh_employees' => 500,
    ];

    private const ALLOWED = [
        'users', 'partners', 'products', 'transactions', 'orders', 'withdrawals',
        'clients', 'proposals', 'feedbacks', 'tickets', 'meetings',
        'trainings', 'training_attempts', 'training_mural',
        'lead_batches', 'leads', 'lead_weekly_assignments', 'lead_daily_progress', 'lead_unlock_requests',
        'tim_referrals', 'contestations', 'partner_fiscal',
        'marketplace_services', 'marketplace_orders',
        'finance_suppliers', 'finance_expenses',
        'finance_adiantamento', 'finance_reembolso', 'finance_proposta_ops',
        'rh_companies', 'rh_resumes', 'rh_jobs', 'rh_employees',
        'rh_absence_justifications', 'rh_punishments', 'rh_dismissals',
        'rh_cbo', 'monitoria_atendimento',
        'bolao_copa_picks', 'bolao_copa_results',
        'beneficios_limites', 'beneficios_prestadores', 'beneficios_produtos', 'beneficios_vouchers', 'beneficios_fechamentos',
    ];

    /** Nome na API (snake_case) → coluna física no MySQL. */
    private const COLUMN_ALIASES = [
        'proposals' => [
            'comissao_elegivel' => 'comissaoElegivel',
            'comissao_recebida' => 'comissaoRecebida',
            'valor_comissao_recebida' => 'valorComissaoRecebida',
        ],
        'rh_resumes' => [
            'vaga_id' => 'vaga',
        ],
        'rh_employees' => [
            'emergencia_nome_1' => 'nome_emergencia_1',
            'emergencia_contato_1' => 'contato_emergencia_1',
            'emergencia_nome_2' => 'nome_emergencia_2',
            'emergencia_contato_2' => 'contato_emergencia_2',
        ],
    ];

    /** Coluna física → nome exposto na API (leitura). */
    private const REVERSE_ALIASES = [
        'rh_employees' => [
            'nome_emergencia_1' => 'emergencia_nome_1',
            'contato_emergencia_1' => 'emergencia_contato_1',
            'nome_emergencia_2' => 'emergencia_nome_2',
            'contato_emergencia_2' => 'emergencia_contato_2',
        ],
    ];

    private const JSON_COLUMNS = [
        'users' => ['attendance_data', 'login_days', 'payment_saved', 'vendor_tier_data', 'permissions'],
        'finance_proposta_ops' => ['data'],
        'transactions' => ['meta'],
        'tickets' => ['messages', 'thread'],
        'meetings' => ['target_roles', 'acknowledgements', 'participant_ids'],
        'trainings' => ['questions', 'audience_roles'],
        'training_attempts' => ['answers'],
        'training_mural' => ['audience_roles'],
        'partners' => ['permissions', 'meta'],
        'proposals' => ['attachments', 'history', 'meta', 'credito_retorno', 'credito_esteira'],
        'clients' => ['documents'],
        'orders' => ['items'],
        'withdrawals' => ['bank_account'],
        'lead_batches' => ['column_mapping'],
        'leads' => ['extra_data'],
        'tim_referrals' => ['attachments'],
        'contestations' => ['partner_response', 'attachments', 'admin_review'],
        'partner_fiscal' => ['dados_nf'],
        'marketplace_orders' => ['request_data', 'result_data'],
        'finance_expenses' => ['pix_snapshot', 'attachments'],
        'finance_adiantamento' => ['attachments'],
        'finance_reembolso' => ['attachments'],
        'rh_employees' => ['change_history', 'fontedata_meta', 'attachments', 'permissions', 'audit_log'],
        'rh_resumes' => ['attachments', 'fontedata_meta'],
        'rh_jobs' => ['attachments'],
        'rh_dismissals' => ['checklist'],
        'monitoria_atendimento' => ['evidence_attachments'],
        'beneficios_limites' => ['distribuicao'],
        'beneficios_vouchers' => ['detalhes_pedido'],
        'beneficios_fechamentos' => ['voucher_ids'],
    ];

    private PDO $pdo;

    /** @var array<string, list<string>> */
    private array $tableColumnsCache = [];

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function handle(string $table, string $method, ?array $body, string $queryString): array
    {
        if (!in_array($table, self::ALLOWED, true)) {
            throw new RuntimeException('Tabela não permitida: ' . $table, 404);
        }

        $params = $this->parseQuery($queryString);
        $method = strtoupper($method);

        if ($method === 'GET') {
            return $this->select($table, $params);
        }
        if ($method === 'POST') {
            return $this->insert($table, $body ?? [], $params);
        }
        if ($method === 'PATCH') {
            return $this->update($table, $body ?? [], $params);
        }
        if ($method === 'DELETE') {
            $this->delete($table, $params);
            return [];
        }
        throw new RuntimeException('Método não suportado: ' . $method, 405);
    }

    /** Aplica default + teto por tabela (nunca devolve resultado ilimitado). */
    private function resolveLimit(string $table, mixed $requested): int
    {
        $tableCap = self::TABLE_CAPS[$table] ?? self::HARD_CAP;
        $cap = min(self::HARD_CAP, max(1, (int) $tableCap));
        if ($requested === null || $requested === '' || (int) $requested <= 0) {
            return min(self::DEFAULT_LIMIT, $cap);
        }
        return max(1, min((int) $requested, $cap));
    }

    private function parseQuery(string $qs): array
    {
        $out = [
            'select' => '*',
            'filters' => [],
            'or' => [],
            'order' => null,
            'limit' => null,
            'offset' => null,
            'on_conflict' => null,
        ];
        if ($qs === '') {
            return $out;
        }
        parse_str(ltrim($qs, '?'), $pairs);
        foreach ($pairs as $key => $val) {
            if ($key === 'select') {
                $out['select'] = (string) $val;
            } elseif ($key === 'order') {
                $out['order'] = (string) $val;
            } elseif ($key === 'limit') {
                $out['limit'] = (int) $val;
            } elseif ($key === 'offset') {
                $out['offset'] = (int) $val;
            } elseif ($key === 'on_conflict') {
                $out['on_conflict'] = (string) $val;
            } elseif ($key === 'or') {
                $out['or'] = $this->parseOrGroup((string) $val);
            } elseif (preg_match('/^(eq|ilike)\.(.+)$/s', (string) $val, $m)) {
                $out['filters'][] = [
                    'col' => (string) $key,
                    'op' => $m[1],
                    'val' => $m[2],
                ];
            } elseif ((string) $val === 'is.null') {
                $out['filters'][] = ['col' => (string) $key, 'op' => 'is', 'val' => 'null'];
            } elseif (str_starts_with((string) $val, 'in.(')) {
                $out['filters'][] = ['col' => (string) $key, 'op' => 'in', 'val' => (string) $val];
            }
        }
        return $out;
    }

    private function parseOrGroup(string $raw): array
    {
        $inner = trim($raw, '()');
        $parts = preg_split('/\s*,\s*/', $inner) ?: [];
        $conds = [];
        foreach ($parts as $p) {
            if (preg_match('/^([^.]+)\.(eq|ilike)\.(.+)$/', $p, $m)) {
                $conds[] = ['col' => $m[1], 'op' => $m[2], 'val' => $m[3]];
            }
        }
        return $conds;
    }

    private function select(string $table, array $params): array
    {
        $cols = $params['select'] === '*' ? '*' : $this->quoteSelect($table, $params['select']);
        $sql = "SELECT {$cols} FROM `{$table}`";
        [$where, $bind] = $this->buildWhere($table, $params);
        if ($where !== '') {
            $sql .= ' WHERE ' . $where;
        }
        if ($params['order']) {
            $sql .= ' ORDER BY ' . $this->parseOrder($table, $params['order']);
        }
        $lim = $this->resolveLimit($table, $params['limit'] ?? null);
        $off = max(0, (int) ($params['offset'] ?? 0));
        $sql .= $off > 0 ? (' LIMIT ' . $off . ',' . $lim) : (' LIMIT ' . $lim);
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll();
        $mapped = array_map(fn ($r) => $this->hydrateRow($table, $r), $rows);
        if ($table === 'users') {
            $mapped = array_values(array_filter(
                $mapped,
                static fn (array $r): bool => trim((string) ($r['id'] ?? '')) !== ''
            ));
        }
        return $mapped;
    }

    private function insert(string $table, array $body, array $params): array
    {
        $items = isset($body[0]) ? $body : [$body];
        $out = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $row = $this->prepareRow($table, $item);
            $row = $this->ensureAutoId($table, $row);
            if ($params['on_conflict']) {
                $out[] = $this->upsert($table, $row, $params['on_conflict']);
            } else {
                $cols = array_keys($row);
                $placeholders = array_map(fn ($c) => ':' . $c, $cols);
                $sql = sprintf(
                    'INSERT INTO `%s` (`%s`) VALUES (%s)',
                    $table,
                    implode('`,`', $cols),
                    implode(',', $placeholders)
                );
                $stmt = $this->pdo->prepare($sql);
                $stmt->execute($row);
                $out[] = $this->hydrateRow($table, $row);
            }
        }
        return $out;
    }

    private function upsert(string $table, array $row, string $conflictCol): array
    {
        $cols = array_keys($row);
        $updates = [];
        foreach ($cols as $c) {
            if ($c === $conflictCol) {
                continue;
            }
            $updates[] = "`{$c}`=VALUES(`{$c}`)";
        }
        $placeholders = array_map(fn ($c) => ':' . $c, $cols);
        $sql = sprintf(
            'INSERT INTO `%s` (`%s`) VALUES (%s) ON DUPLICATE KEY UPDATE %s',
            $table,
            implode('`,`', $cols),
            implode(',', $placeholders),
            implode(',', $updates)
        );
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($row);
        return $this->hydrateRow($table, $row);
    }

    private function update(string $table, array $body, array $params): array
    {
        $row = $this->prepareRow($table, $body);
        if (!$row) {
            return [];
        }
        $sets = [];
        foreach (array_keys($row) as $c) {
            $sets[] = "`{$c}` = :{$c}";
        }
        $sql = "UPDATE `{$table}` SET " . implode(', ', $sets);
        [$where, $bind] = $this->buildWhere($table, $params);
        if ($where === '') {
            throw new RuntimeException('PATCH sem filtro não permitido.', 400);
        }
        $sql .= ' WHERE ' . $where;
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($row + $bind);
        return $this->select($table, $params);
    }

    private function delete(string $table, array $params): void
    {
        $sql = "DELETE FROM `{$table}`";
        [$where, $bind] = $this->buildWhere($table, $params);
        if ($where === '') {
            throw new RuntimeException('DELETE sem filtro não permitido.', 400);
        }
        $sql .= ' WHERE ' . $where;
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($bind);
    }

    private function buildWhere(string $table, array $params): array
    {
        $parts = [];
        $bind = [];
        $i = 0;
        foreach ($params['filters'] as $f) {
            $col = $this->resolveCol($table, $f['col']);
            $key = 'p' . $i++;
            if ($f['op'] === 'eq') {
                if ($f['val'] === 'null') {
                    $parts[] = "`{$col}` IS NULL";
                } else {
                    $parts[] = "`{$col}` = :{$key}";
                    $bind[$key] = $this->normalizeFilterBind($f['col'], $this->decodeFilterVal($f['val']));
                }
            } elseif ($f['op'] === 'ilike') {
                $parts[] = "`{$col}` LIKE :{$key}";
                $bind[$key] = '%' . $this->decodeFilterVal($f['val']) . '%';
            } elseif ($f['op'] === 'is' && $f['val'] === 'null') {
                $parts[] = "`{$col}` IS NULL";
            } elseif (str_starts_with($f['val'], 'in.(')) {
                $vals = $this->parseInList($f['val']);
                if ($vals) {
                    $inKeys = [];
                    foreach ($vals as $v) {
                        $ik = 'p' . $i++;
                        $inKeys[] = ':' . $ik;
                        $bind[$ik] = $v;
                    }
                    $parts[] = "`{$col}` IN (" . implode(',', $inKeys) . ')';
                }
            }
        }
        if ($params['or']) {
            $orParts = [];
            foreach ($params['or'] as $f) {
                $col = $this->resolveCol($table, $f['col']);
                $key = 'p' . $i++;
                if ($f['op'] === 'eq') {
                    $orParts[] = "`{$col}` = :{$key}";
                    $bind[$key] = $this->normalizeFilterBind($f['col'], $this->decodeFilterVal($f['val']));
                }
            }
            if ($orParts) {
                $parts[] = '(' . implode(' OR ', $orParts) . ')';
            }
        }
        return [implode(' AND ', $parts), $bind];
    }

    private function parseInList(string $val): array
    {
        if (!preg_match('/^in\.\((.*)\)$/s', $val, $m)) {
            return [];
        }
        return array_map('trim', explode(',', $m[1]));
    }

    private function decodeFilterVal(string $v): string
    {
        return rawurldecode($v);
    }

    /** MySQL TINYINT(1): active=eq.true deve virar 1, não a string "true". */
    private function normalizeFilterBind(string $col, string $val): string|int
    {
        static $boolCols = [
            'active', 'show_points', 'doc_verified', 'approved_by_master', 'approved_by_financial',
            'met_target', 'lock_triggered', 'passed', 'is_lead_locked', 'is_partner',
        ];
        if (!in_array($col, $boolCols, true)) {
            return $val;
        }
        $low = strtolower(trim($val));
        if ($low === 'true' || $low === '1') {
            return 1;
        }
        if ($low === 'false' || $low === '0') {
            return 0;
        }
        return $val;
    }

    private function parseOrder(string $table, string $order): string
    {
        $bits = [];
        foreach (explode(',', $order) as $part) {
            $p = trim($part);
            if (preg_match('/^([a-zA-Z0-9_]+)\.(asc|desc)$/i', $p, $m)) {
                $bits[] = '`' . $this->resolveCol($table, $m[1]) . '` ' . strtoupper($m[2]);
            }
        }
        return $bits ? implode(', ', $bits) : '`created_at` DESC';
    }

    private function quoteSelect(string $table, string $select): string
    {
        $seen = [];
        $parts = [];
        foreach (explode(',', $select) as $raw) {
            $col = trim($raw);
            if ($col === '') {
                continue;
            }
            $this->safeCol($col);
            $physical = $this->resolveCol($table, $col);
            if (isset($seen[$physical])) {
                continue;
            }
            $seen[$physical] = true;
            if ($physical !== $col) {
                $parts[] = '`' . $physical . '` AS `' . $col . '`';
            } else {
                $parts[] = '`' . $physical . '`';
            }
        }
        return $parts ? implode(',', $parts) : '*';
    }

    private function safeCol(string $col): string
    {
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $col)) {
            throw new RuntimeException('Coluna inválida.', 400);
        }
        return $col;
    }

    private function resolveCol(string $table, string $col): string
    {
        $this->safeCol($col);
        return self::COLUMN_ALIASES[$table][$col] ?? $col;
    }

    /** @return list<string> */
    private function tableColumns(string $table): array
    {
        if (!isset($this->tableColumnsCache[$table])) {
            $stmt = $this->pdo->query('SHOW COLUMNS FROM `' . $table . '`');
            $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
            $this->tableColumnsCache[$table] = array_values(array_filter(array_map(
                static fn (array $r): string => (string) ($r['Field'] ?? ''),
                $rows
            )));
        }
        return $this->tableColumnsCache[$table];
    }

    private function filterRowToTable(string $table, array $row): array
    {
        if ($row === []) {
            return [];
        }
        $allowed = array_flip($this->tableColumns($table));
        $filtered = [];
        foreach ($row as $k => $v) {
            if (isset($allowed[$k])) {
                $filtered[$k] = $v;
            }
        }
        return $filtered;
    }

    /** Gera `id` quando o front não envia (tabelas benefícios exigem PK). */
    private function ensureAutoId(string $table, array $row): array
    {
        static $prefixes = [
            'beneficios_limites' => 'ben_lim_',
            'beneficios_prestadores' => 'ben_pre_',
            'beneficios_produtos' => 'ben_prd_',
            'beneficios_vouchers' => 'ben_vou_',
            'beneficios_fechamentos' => 'ben_fec_',
        ];
        if (!isset($prefixes[$table])) {
            return $row;
        }
        $id = trim((string) ($row['id'] ?? ''));
        if ($id !== '') {
            return $row;
        }
        try {
            $row['id'] = $prefixes[$table] . bin2hex(random_bytes(6));
        } catch (Throwable $e) {
            $row['id'] = $prefixes[$table] . dechex(time()) . dechex(random_int(0, 0xffffff));
        }
        return $row;
    }

    private function prepareRow(string $table, array $item): array
    {
        if ($table === 'proposals' && isset($item['attachments']) && is_array($item['attachments'])) {
            require_once dirname(__DIR__) . '/lib/FileStorage.php';
            $uploadDir = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : (dirname(__DIR__, 2) . '/uploads');
            $item['attachments'] = soublu_attachments_normalize_for_api($item['attachments'], $uploadDir, true);
        }
        if ($table === 'partners' && isset($item['meta']) && is_array($item['meta'])) {
            require_once dirname(__DIR__) . '/lib/FileStorage.php';
            $uploadDir = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : (dirname(__DIR__, 2) . '/uploads');
            $item['meta'] = soublu_partner_meta_normalize_for_api($item['meta'], $uploadDir, true);
        }
        $jsonCols = self::JSON_COLUMNS[$table] ?? [];
        $row = [];
        foreach ($item as $k => $v) {
            if (!preg_match('/^[a-zA-Z0-9_]+$/', (string) $k)) {
                continue;
            }
            $physical = $this->resolveCol($table, (string) $k);
            if (in_array($physical, $jsonCols, true)) {
                $row[$physical] = $v === null ? null : json_encode($v, JSON_UNESCAPED_UNICODE);
            } elseif (is_bool($v)) {
                $row[$physical] = $v ? 1 : 0;
            } else {
                $row[$physical] = $v;
            }
        }
        return $this->filterRowToTable($table, $row);
    }

    private function hydrateRow(string $table, array $row): array
    {
        $jsonCols = self::JSON_COLUMNS[$table] ?? [];
        foreach ($row as $k => $v) {
            if (in_array($k, $jsonCols, true) && is_string($v) && $v !== '') {
                $decoded = json_decode($v, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $row[$k] = $decoded;
                }
            }
            if (in_array($k, ['active', 'show_points', 'doc_verified', 'approved_by_master', 'approved_by_financial', 'met_target', 'lock_triggered', 'passed', 'is_lead_locked', 'is_partner'], true)) {
                $row[$k] = (bool) (int) $v;
            }
        }
        if ($table === 'proposals' && isset($row['attachments']) && is_array($row['attachments'])) {
            require_once dirname(__DIR__) . '/lib/FileStorage.php';
            $uploadDir = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : (dirname(__DIR__, 2) . '/uploads');
            $row['attachments'] = soublu_attachments_normalize_for_api($row['attachments'], $uploadDir, false);
        }
        if ($table === 'partners' && isset($row['meta']) && is_array($row['meta'])) {
            require_once dirname(__DIR__) . '/lib/FileStorage.php';
            $uploadDir = defined('UPLOAD_DIR') ? (string) UPLOAD_DIR : (dirname(__DIR__, 2) . '/uploads');
            $row['meta'] = soublu_partner_meta_normalize_for_api($row['meta'], $uploadDir, false);
        }
        foreach (self::REVERSE_ALIASES[$table] ?? [] as $physical => $apiName) {
            if (array_key_exists($physical, $row) && !array_key_exists($apiName, $row)) {
                $row[$apiName] = $row[$physical];
            }
        }
        return $row;
    }
}
