<?php
declare(strict_types=1);

require_once __DIR__ . '/SupabaseClient.php';
require_once __DIR__ . '/CreditProposalMysqlRepository.php';
require_once __DIR__ . '/CreditProposalMysqlSchema.php';

function soublu_credit_proposal_load_supabase(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    if (is_file(__DIR__ . '/SupabaseLegacy.php')) {
        require_once __DIR__ . '/SupabaseLegacy.php';
    }
    $loaded = true;
}

final class CreditProposalRepository
{
    private const TABLE = 'credit_proposals';

    public function __construct(private SupabaseClient $sb)
    {
    }

    public function tableExists(): bool
    {
        return $this->sb->tableExists(self::TABLE);
    }

    public function getById(string $id): ?array
    {
        return $this->sb->selectOne(self::TABLE, 'id=eq.' . rawurlencode($id) . '&select=*');
    }

    public function listAll(int $limit = 500): array
    {
        return $this->sb->rest(
            'GET',
            self::TABLE,
            null,
            '?select=*&order=updated_at.desc&limit=' . max(1, min($limit, 2000))
        );
    }

    public function listByEmployee(string $employeeId, int $limit = 200): array
    {
        return $this->sb->rest(
            'GET',
            self::TABLE,
            null,
            '?employee_id=eq.' . rawurlencode($employeeId)
            . '&select=*&order=updated_at.desc&limit=' . max(1, min($limit, 500))
        );
    }

    public function create(array $row): array
    {
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $payload = $this->normalizeRow($row);
        $payload['created_at'] = $payload['created_at'] ?? $now;
        $payload['updated_at'] = $payload['updated_at'] ?? $now;
        $rows = $this->sb->rest('POST', self::TABLE, $payload);
        $saved = $rows[0] ?? $this->getById((string) ($payload['id'] ?? ''));
        if (!$saved) {
            throw new RuntimeException('Não foi possível salvar proposta de crédito no Supabase.');
        }
        return $saved;
    }

    public function update(string $id, array $patch): array
    {
        $payload = $this->normalizeRow($patch, true);
        $payload['updated_at'] = gmdate('Y-m-d\TH:i:s\Z');
        unset($payload['id'], $payload['created_at']);
        $rows = $this->sb->rest('PATCH', self::TABLE, $payload, '?id=eq.' . rawurlencode($id));
        return $rows[0] ?? $this->getById($id) ?? [];
    }

    private function normalizeRow(array $row, bool $partial = false): array
    {
        $allowed = [
            'id', 'protocolo', 'employee_id', 'employee_name', 'vendor_id', 'vendor_name',
            'cpf', 'nome', 'valor_solicitado', 'valor_aprovado', 'valor_parcela', 'valor_final',
            'conta_santander', 'forma_pagamento', 'banco', 'agencia', 'conta_corrente',
            'contato1', 'contato2', 'observacao',
            'avalista_cpf', 'avalista_nome', 'avalista_telefone',
            'status', 'esteira', 'retorno', 'attachments', 'history', 'meta',
            'legacy_proposal_id', 'created_at', 'updated_at',
        ];
        $out = [];
        foreach ($allowed as $key) {
            if (!array_key_exists($key, $row)) {
                continue;
            }
            $val = $row[$key];
            if (in_array($key, ['esteira', 'retorno', 'attachments', 'meta'], true) && is_string($val)) {
                $decoded = json_decode($val, true);
                $val = is_array($decoded) ? $decoded : [];
            }
            if ($key === 'history' && is_string($val)) {
                $decoded = json_decode($val, true);
                $val = is_array($decoded) ? $decoded : [];
            }
            if ($key === 'cpf' || $key === 'avalista_cpf') {
                $val = preg_replace('/\D/', '', (string) $val);
            }
            $out[$key] = $val;
        }
        if (!$partial) {
            foreach (['id', 'protocolo', 'employee_id', 'cpf', 'nome'] as $req) {
                if (empty($out[$req])) {
                    throw new InvalidArgumentException("Campo obrigatório ausente: {$req}");
                }
            }
            $meta = is_array($row['meta'] ?? null) ? $row['meta'] : [];
            $meta['credito'] = true;
            $meta['opcao_credito'] = true;
            $meta['credit_table'] = 'credit_proposals';
            $meta['credit_backend'] = 'supabase-legacy-pg';
            $out['meta'] = $meta;
        }
        return $out;
    }
}

function soublu_credit_proposal_backend(): string
{
    static $backend = null;
    if (is_string($backend)) {
        return $backend;
    }
    soublu_credit_proposal_load_supabase();
    if (function_exists('soublu_supabase_legacy_configured') && soublu_supabase_legacy_configured()) {
        try {
            $repo = new CreditProposalRepository(soublu_supabase_legacy_client());
            if ($repo->tableExists()) {
                $backend = 'supabase-legacy-pg';
                return $backend;
            }
        } catch (Throwable $e) {
            error_log('[credito] Supabase original: ' . $e->getMessage());
        }
    }
    $backend = 'mysql-credit_proposals';
    return $backend;
}

/** Supabase PostgreSQL (original) ou fallback MySQL credit_proposals. */
function soublu_credit_proposal_repository(): CreditProposalRepository|CreditProposalMysqlRepository
{
    static $repo = null;
    if ($repo !== null) {
        return $repo;
    }
    if (soublu_credit_proposal_backend() === 'supabase-legacy-pg') {
        soublu_credit_proposal_load_supabase();
        $repo = new CreditProposalRepository(soublu_supabase_legacy_client());
        return $repo;
    }
    soublu_ensure_credit_proposals_table(soublu_pdo());
    $repo = new CreditProposalMysqlRepository(soublu_pdo());
    return $repo;
}
