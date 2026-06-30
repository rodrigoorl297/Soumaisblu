-- SOU+BLU — WhatsApp (Evolution API) — Postgres / Supabase soublu-v2
-- Aplicado via Supabase MCP ou SQL Editor.

CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  instance_name VARCHAR(128) NOT NULL,
  phone VARCHAR(32),
  status VARCHAR(32) NOT NULL DEFAULT 'close',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_wa_user UNIQUE (user_id),
  CONSTRAINT uq_wa_instance UNIQUE (instance_name)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_chats (
  id VARCHAR(64) PRIMARY KEY,
  instance_id VARCHAR(64) NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  remote_jid VARCHAR(128) NOT NULL,
  contact_phone VARCHAR(32) NOT NULL,
  contact_name VARCHAR(255),
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_wa_chat_jid UNIQUE (instance_id, remote_jid)
);

CREATE INDEX IF NOT EXISTS idx_wa_chats_user ON public.whatsapp_chats (user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id VARCHAR(64) PRIMARY KEY,
  chat_id VARCHAR(64) NOT NULL REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE,
  instance_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  remote_jid VARCHAR(128) NOT NULL,
  direction VARCHAR(3) NOT NULL CHECK (direction IN ('in', 'out')),
  message_type VARCHAR(32) NOT NULL DEFAULT 'text',
  body TEXT,
  media_url TEXT,
  wa_message_id VARCHAR(128),
  status VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_chat ON public.whatsapp_messages (chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wa_msg_wa_id ON public.whatsapp_messages (wa_message_id);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY wa_instances_deny_anon ON public.whatsapp_instances FOR ALL TO anon, authenticated USING (false);
CREATE POLICY wa_chats_deny_anon ON public.whatsapp_chats FOR ALL TO anon, authenticated USING (false);
CREATE POLICY wa_messages_deny_anon ON public.whatsapp_messages FOR ALL TO anon, authenticated USING (false);
