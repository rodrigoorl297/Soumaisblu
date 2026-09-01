-- SOU+BLU — Propostas: campo "Melhor horário para contato por vídeo chamada"
-- Rode no SQL Editor do projeto original (dqptnlywbarvznpzgtuj) — mesma base de public.proposals.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS horario_videochamada VARCHAR(8);
