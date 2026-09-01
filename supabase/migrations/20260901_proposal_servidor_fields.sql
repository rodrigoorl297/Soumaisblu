-- SOU+BLU — Propostas: campos "Servidor" e "Situação do Servidor"
-- Rode no SQL Editor do projeto original (dqptnlywbarvznpzgtuj) — mesma base de public.proposals.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS servidor VARCHAR(32),
  ADD COLUMN IF NOT EXISTS situacao_servidor VARCHAR(32);
