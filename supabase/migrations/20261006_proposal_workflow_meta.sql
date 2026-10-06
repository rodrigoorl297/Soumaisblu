-- Campos específicos de cada produto da Gestão de Propostas.
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
