-- soublu-v2: buckets + políticas de Storage (anexos e uploads)
-- Já aplicado via Supabase MCP em cpqediswbjxcvpnwflyj (2026-06-22)

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('proposal-attachments', 'proposal-attachments', true, 52428800),
  ('tim-docs', 'tim-docs', true, 26214400),
  ('contestacao-docs', 'contestacao-docs', true, 26214400),
  ('finance-docs', 'finance-docs', true, 26214400),
  ('ticket-docs', 'ticket-docs', true, 26214400),
  ('partner-docs', 'partner-docs', true, 26214400),
  ('profile-photos', 'profile-photos', true, 5242880),
  ('product-images', 'product-images', true, 10485760),
  ('rh-demissao', 'rh-demissao', true, 26214400),
  ('monitoria-atendimento', 'monitoria-atendimento', true, 26214400),
  ('partner-nf', 'partner-nf', true, 26214400),
  ('sonhos', 'sonhos', true, 26214400),
  ('misc', 'misc', true, 26214400),
  ('whatsapp-media', 'whatsapp-media', true, 26214400),
  ('uploads', 'uploads', true, 52428800)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;
