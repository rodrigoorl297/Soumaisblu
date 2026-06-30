-- SOU+BLU — Propostas de Crédito — PostgreSQL / Supabase ORIGINAL (sou+blu)
-- Projeto: dqptnlywbarvznpzgtuj — NÃO usar soublu-v2 (v2 = só WhatsApp)
-- Rode no SQL Editor do projeto original ou via api/migrate-credito.php após deploy.

CREATE TABLE IF NOT EXISTS public.credit_proposals (
  id VARCHAR(64) PRIMARY KEY,
  protocolo VARCHAR(32) NOT NULL,
  employee_id VARCHAR(64) NOT NULL,
  employee_name VARCHAR(255),
  vendor_id VARCHAR(64),
  vendor_name VARCHAR(255),
  cpf VARCHAR(11) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  valor_solicitado DECIMAL(12,2) NOT NULL DEFAULT 0,
  valor_aprovado DECIMAL(12,2),
  valor_parcela DECIMAL(12,2),
  valor_final DECIMAL(12,2),
  conta_santander VARCHAR(8),
  forma_pagamento VARCHAR(64),
  banco VARCHAR(128),
  agencia VARCHAR(32),
  conta_corrente VARCHAR(32),
  contato1 VARCHAR(32),
  contato2 VARCHAR(32),
  observacao TEXT,
  avalista_cpf VARCHAR(11),
  avalista_nome VARCHAR(255),
  avalista_telefone VARCHAR(32),
  status VARCHAR(64) NOT NULL DEFAULT 'AG. ANÁLISE',
  esteira JSONB NOT NULL DEFAULT '{}'::jsonb,
  retorno JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments JSONB NOT NULL DEFAULT '{}'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  legacy_proposal_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_credit_protocolo UNIQUE (protocolo)
);

CREATE INDEX IF NOT EXISTS idx_credit_proposals_employee ON public.credit_proposals (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_proposals_status ON public.credit_proposals (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_proposals_cpf ON public.credit_proposals (cpf);

ALTER TABLE public.credit_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_proposals_deny_anon ON public.credit_proposals;
CREATE POLICY credit_proposals_deny_anon ON public.credit_proposals FOR ALL TO anon, authenticated USING (false);
