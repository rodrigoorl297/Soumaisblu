-- SOU+BLU — WhatsApp CRM — MySQL (DBaaS Locaweb)
-- Tabelas: wa_connections, wa_chats, wa_messages

CREATE TABLE IF NOT EXISTS wa_connections (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      VARCHAR(64) NOT NULL,
  status       VARCHAR(32) NOT NULL DEFAULT 'close',
  qr_code      TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_chats (
  id                   VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id              VARCHAR(64) NOT NULL,
  contact_name         VARCHAR(255),
  contact_phone        VARCHAR(32),
  unread_count         INT NOT NULL DEFAULT 0,
  last_message_preview TEXT,
  last_message_at      DATETIME,
  kanban_stage         VARCHAR(64) DEFAULT '',
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_chats_user (user_id, last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_messages (
  id           VARCHAR(64) NOT NULL PRIMARY KEY,
  chat_id      VARCHAR(64) NOT NULL,
  user_id      VARCHAR(64) NOT NULL,
  message_type VARCHAR(32) NOT NULL DEFAULT 'text',
  direction    ENUM('in','out') NOT NULL DEFAULT 'in',
  body         TEXT,
  media_url    TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wa_messages_chat (chat_id, created_at),
  CONSTRAINT fk_wa_msg_chat FOREIGN KEY (chat_id) REFERENCES wa_chats(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
