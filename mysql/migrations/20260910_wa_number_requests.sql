-- SOU+BLU — Solicite um Número (vendedores solicitando número de WhatsApp) — MySQL (DBaaS Locaweb)
-- Tabela: wa_number_requests

CREATE TABLE IF NOT EXISTS wa_number_requests (
  id               VARCHAR(64) NOT NULL PRIMARY KEY,
  employee_id      VARCHAR(64) NOT NULL,
  employee_name    VARCHAR(255) NOT NULL DEFAULT '',
  employee_dept    VARCHAR(128) DEFAULT '',
  note             TEXT,
  status           VARCHAR(32) NOT NULL DEFAULT 'pendente',
  assigned_number  VARCHAR(32) DEFAULT '',
  admin_note       TEXT,
  handled_by       VARCHAR(64) DEFAULT '',
  handled_by_name  VARCHAR(255) DEFAULT '',
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wa_number_requests_employee (employee_id, created_at),
  INDEX idx_wa_number_requests_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
