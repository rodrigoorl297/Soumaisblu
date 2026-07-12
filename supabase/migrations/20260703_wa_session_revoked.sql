ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS session_revoked_at TIMESTAMPTZ NULL;
