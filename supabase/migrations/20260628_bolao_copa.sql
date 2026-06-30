-- Bolão Copa · Álbum Premiado (campanha interna)
CREATE TABLE IF NOT EXISTS bolao_copa_picks (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL DEFAULT 'album-copa-2026',
  user_id TEXT NOT NULL,
  user_name TEXT,
  match_id TEXT NOT NULL,
  pick TEXT NOT NULL CHECK (pick IN ('home', 'away', 'draw')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, user_id, match_id)
);

CREATE TABLE IF NOT EXISTS bolao_copa_results (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL DEFAULT 'album-copa-2026',
  match_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('home', 'away', 'draw')),
  set_by TEXT,
  set_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_bolao_picks_match ON bolao_copa_picks (match_id);
CREATE INDEX IF NOT EXISTS idx_bolao_picks_user ON bolao_copa_picks (user_id);
