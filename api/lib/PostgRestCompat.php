<?php
declare(strict_types=1);

final class PostgRestCompat
{
    private const ALLOWED = [
        'users', 'partners', 'products', 'transactions', 'orders', 'withdrawals',
        'clients', 'proposals', 'feedbacks', 'tickets', 'meetings',
        'trainings', 'training_attempts', 'training_mural',
        'lead_batches', 'leads', 'lead_weekly_assignments', 'lead_daily_progress', 'lead_unlock_requests',
        'tim_referrals', 'contestations', 'partner_fiscal',
        'marketplace_services', 'marketplace_orders',
        'finance_suppliers', 'finance_expenses',
        'rh_companies', 'rh_resumes', 'rh_jobs', 'rh_employees',
        'rh_absence_justifications', 'rh_punishments', 'rh_dismissals',
        'rh_cbo', 'monitoria_atendimento',
    ];

    /** Nome na API (snake_case) → coluna física no MySQL quando não há coluna duplicada. */
    private const COLUMN_ALIASES = [
        'proposals' => [
            'comissao_elegivel' => 'comissaoElegivel',
            'comissao_recebida' => 'comissaoRecebida',
            'valor_comissao_recebida' => 'valorComissaoRecebida',
        ],
    ];

    private const JSON_COLUMNS = [
        'users' => ['attendance_data', 'login_days', 'payment_saved', 'vendor_tier_data'],
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
        'rh_employees' => ['change_history'],
        'rh_resumes' => ['attachments'],
        'rh_dismissals' => ['checklist'],
        'monitoria_atendimento' => ['evidence_attachments'],
    ];

    private PDO $pdo;

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

    private function parseQuery(string $qs): array
    {
        $out = [
            'select' => '*',
            'filters' => [],
            'or' => [],
            'order' => null,
            'limit' => null,
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
        if ($params['limit']) {
            $sql .= ' LIMIT ' . max(1, (int) $params['limit']);
        }
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll();
        return array_map(fn ($r) => $this->hydrateRow($table, $r), $rows);
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
                    $bind[$key] = $this->decodeFilterVal($f['val']);
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
                    $bind[$key] = $this->decodeFilterVal($f['val']);
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

    private function prepareRow(string $table, array $item): array
    {
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
        return $row;
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
            if (in_array($k, ['active', 'show_points', 'doc_verified', 'approved_by_master', 'approved_by_financial', 'met_target', 'lock_triggered', 'passed', 'is_lead_locked'], true)) {
                $row[$k] = (bool) (int) $v;
            }
        }
        return $row;
    }
}
