<?php
declare(strict_types=1);

require_once __DIR__ . '/CreditProposalMysqlSchema.php';

/**
 * Propostas de crédito — tabela MySQL dedicada credit_proposals (não proposals).
 */
final class CreditProposalMysqlRepository
{
    private const TABLE = 'credit_proposals';

    private const JSON_COLS = ['esteira', 'retorno', 'attachments', 'history', 'meta'];

    private const ALLOWED = [
        'id', 'protocolo', 'employee_id', 'employee_name', 'vendor_id', 'vendor_name',
        'cpf', 'nome', 'valor_solicitado', 'valor_aprovado', 'valor_parcela', 'valor_final',
        'conta_santander', 'forma_pagamento', 'banco', 'agencia', 'conta_corrente',
        'contato1', 'contato2', 'observacao',
        'avalista_cpf', 'avalista_nome', 'avalista_telefone',
        'status', 'esteira', 'retorno', 'attachments', 'history', 'meta',
        'legacy_proposal_id', 'created_at', 'updated_at',
    ];

    public function __construct(private PDO $pdo)
    {
    }

    /** @var array<string, true>|null */
    private ?array $columnCache = null;

    public function tableExists(): bool
    {
        return soublu_credit_proposals_table_exists($this->pdo);
    }

    public function getById(string $id): ?array
    {
        $this->ensureTable();
        $st = $this->pdo->prepare('SELECT * FROM `' . self::TABLE . '` WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ? $this->hydrateRow($row) : null;
    }

    public function listAll(int $limit = 500): array
    {
        $this->ensureTable();
        $lim = max(1, min($limit, 2000));
        $st = $this->pdo->query(
            'SELECT * FROM `' . self::TABLE . '`
             ORDER BY updated_at DESC, created_at DESC
             LIMIT ' . $lim
        );
        $rows = $st ? ($st->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
        return array_map(fn (array $r) => $this->hydrateRow($r), $rows);
    }

    public function listByEmployee(string $employeeId, int $limit = 200): array
    {
        $this->ensureTable();
        $lim = max(1, min($limit, 500));
        $eid = trim($employeeId);
        $st = $this->pdo->prepare(
            'SELECT * FROM `' . self::TABLE . '`
             WHERE employee_id = ? OR vendor_id = ?
             ORDER BY updated_at DESC, created_at DESC
             LIMIT ' . $lim
        );
        $st->execute([$eid, $eid]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
        return array_map(fn (array $r) => $this->hydrateRow($r), $rows);
    }

    public function create(array $row): array
    {
        $this->ensureTable();
        $payload = $this->normalizeRow($row);
        $payload = $this->filterToExistingColumns($payload);
        $now = gmdate('Y-m-d H:i:s');
        $payload['created_at'] = $payload['created_at'] ?? $now;
        $payload['updated_at'] = $payload['updated_at'] ?? $now;
$cols = array_keys($payload);
        $placeholders = array_map(static fn (string $c): string => ':' . $c, $cols);
        $sql = sprintf(
            'INSERT INTO `%s` (`%s`) VALUES (%s)',
            self::TABLE,
            implode('`,`', $cols),
            implode(',', $placeholders)
        );
        $st = $this->pdo->prepare($sql);
        $st->execute($payload);

        return $this->getById((string) $payload['id'])
            ?? throw new RuntimeException('Não foi possível salvar proposta de crédito.');
    }

    public function update(string $id, array $patch): array
    {
        $this->ensureTable();
        $payload = $this->normalizeRow($patch, true);
        $payload = $this->filterToExistingColumns($payload);
        $payload['updated_at'] = gmdate('Y-m-d H:i:s');
        unset($payload['id'], $payload['created_at']);

        if (!$payload) {
            $row = $this->getById($id);
            if (!$row) {
                throw new RuntimeException('Proposta de crédito não encontrada.');
            }
            return $row;
        }

        $sets = [];
        foreach (array_keys($payload) as $col) {
            $sets[] = '`' . $col . '` = :' . $col;
        }
        $sql = 'UPDATE `' . self::TABLE . '` SET ' . implode(', ', $sets) . ' WHERE id = :_id';
        $payload['_id'] = $id;
        $st = $this->pdo->prepare($sql);
        $st->execute($payload);

        return $this->getById($id)
            ?? throw new RuntimeException('Proposta de crédito não encontrada.');
    }

    private function ensureTable(): void
    {
        soublu_ensure_credit_proposals_table($this->pdo);
        $this->columnCache = null;
    }

    private function columnExists(string $column): bool
    {
        $st = $this->pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
        $st->execute([self::TABLE, $column]);
        return (int) $st->fetchColumn() > 0;
    }

    /** Remove campos que ainda não existem na tabela (segurança pós-migração). */
    private function filterToExistingColumns(array $payload): array
    {
        if ($this->columnCache === null) {
            $st = $this->pdo->prepare(
                'SELECT COLUMN_NAME FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
            );
            $st->execute([self::TABLE]);
            $this->columnCache = array_flip(array_map('strval', $st->fetchAll(PDO::FETCH_COLUMN) ?: []));
        }
        return array_intersect_key($payload, $this->columnCache);
    }

    private function normalizeRow(array $row, bool $partial = false): array
    {
        $out = [];
        foreach (self::ALLOWED as $key) {
            if (!array_key_exists($key, $row)) {
                continue;
            }
            $val = $row[$key];
            if (in_array($key, self::JSON_COLS, true)) {
                if (is_string($val)) {
                    $decoded = json_decode($val, true);
                    $val = is_array($decoded) ? $decoded : [];
                }
                $out[$key] = json_encode(is_array($val) ? $val : [], JSON_UNESCAPED_UNICODE);
                continue;
            }
            if ($key === 'cpf' || $key === 'avalista_cpf') {
                $out[$key] = preg_replace('/\D/', '', (string) $val);
                continue;
            }
            $out[$key] = $val;
        }

        if (!$partial) {
            foreach (['id', 'protocolo', 'employee_id', 'cpf', 'nome'] as $req) {
                if (empty($out[$req])) {
                    throw new InvalidArgumentException("Campo obrigatório ausente: {$req}");
                }
            }
            $meta = [];
            if (isset($row['meta'])) {
                $meta = is_array($row['meta']) ? $row['meta'] : (json_decode((string) $row['meta'], true) ?: []);
            }
            $meta['credito'] = true;
            $meta['opcao_credito'] = true;
            $meta['credit_table'] = 'credit_proposals';
            $meta['credit_backend'] = 'mysql';
            $metaJson = json_encode($meta, JSON_UNESCAPED_UNICODE);
            if ($this->columnExists('meta')) {
                $out['meta'] = $metaJson;
            } elseif (isset($out['esteira']) || isset($row['esteira'])) {
                $esteira = isset($out['esteira'])
                    ? (json_decode((string) $out['esteira'], true) ?: [])
                    : (is_array($row['esteira'] ?? null) ? $row['esteira'] : []);
                $esteira['_meta'] = $meta;
                $out['esteira'] = json_encode($esteira, JSON_UNESCAPED_UNICODE);
            }
        }

        return $out;
    }

    private function hydrateRow(array $row): array
    {
        foreach (self::JSON_COLS as $col) {
            if (!isset($row[$col]) || !is_string($row[$col])) {
                continue;
            }
            $decoded = json_decode($row[$col], true);
            $row[$col] = is_array($decoded) ? $decoded : [];
        }
        return $row;
    }
}
