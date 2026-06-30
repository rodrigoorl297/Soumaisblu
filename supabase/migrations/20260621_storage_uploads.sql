-- Bucket de uploads no soublu-v2 (rodar no SQL Editor se necessário)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uploads', 'uploads', true, 52428800)
ON CONFLICT (id) DO NOTHING;
