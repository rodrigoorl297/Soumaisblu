-- SOU+BLU — Estoque de números de WhatsApp (chips) — MySQL (DBaaS Locaweb)
-- Tabela: wa_numbers (disponível / em_uso / bloqueado)

CREATE TABLE IF NOT EXISTS wa_numbers (
  id                VARCHAR(64) NOT NULL PRIMARY KEY,
  number            VARCHAR(32) NOT NULL,
  status            VARCHAR(32) NOT NULL DEFAULT 'disponivel',
  assigned_to       VARCHAR(64) DEFAULT '',
  assigned_to_name  VARCHAR(255) DEFAULT '',
  assigned_at       DATETIME NULL DEFAULT NULL,
  blocked_reason    TEXT,
  note              TEXT,
  created_by        VARCHAR(64) DEFAULT '',
  created_by_name   VARCHAR(255) DEFAULT '',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_numbers_number (number),
  INDEX idx_wa_numbers_status (status),
  INDEX idx_wa_numbers_assigned (assigned_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
