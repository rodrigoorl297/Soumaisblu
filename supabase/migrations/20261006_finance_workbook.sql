-- Cadastros financeiros; emissão EFI não é executada por esta migração.
CREATE TABLE IF NOT EXISTS public.finance_workbook (
 id text PRIMARY KEY, kind text NOT NULL, data jsonb NOT NULL,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_workbook_kind_idx ON public.finance_workbook(kind);
ALTER TABLE public.finance_suppliers ADD COLUMN IF NOT EXISTS protocolo text,
 ADD COLUMN IF NOT EXISTS valor_pago numeric(12,2) DEFAULT 0,
 ADD COLUMN IF NOT EXISTS data_pagamento date,
 ADD COLUMN IF NOT EXISTS vigencia text,
 ADD COLUMN IF NOT EXISTS recorrencia_mensal boolean DEFAULT false,
 ADD COLUMN IF NOT EXISTS situacao text DEFAULT 'ativo',
 ADD COLUMN IF NOT EXISTS anexos jsonb;
