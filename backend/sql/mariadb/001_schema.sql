-- Agency Watch — MariaDB schema (offline / self-hosted)
-- UUIDs stored as CHAR(36). JSON instead of JSONB.

CREATE TABLE IF NOT EXISTS auth_users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  encrypted_password VARCHAR(255) NOT NULL,
  email_confirmed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  raw_user_meta_data JSON NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_roles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  role ENUM('admin', 'manager', 'consultant') NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_user_role (user_id, role),
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS consultants (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(255) NULL,
  regional VARCHAR(128) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  slack_user_id VARCHAR(64) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE SET NULL,
  INDEX idx_consultants_phone (phone),
  INDEX idx_consultants_slack (slack_user_id)
);

CREATE TABLE IF NOT EXISTS real_estate_agencies (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(128) NOT NULL,
  state CHAR(2) NOT NULL,
  regional_director VARCHAR(255) NULL,
  consultant_id CHAR(36) NULL,
  contract_stock INT NOT NULL DEFAULT 0,
  current_guarantor VARCHAR(255) NULL,
  guarantor_type ENUM('Garantia Propria', 'Concorrente', 'Seguradora', 'Outro') NULL,
  main_contact VARCHAR(255) NULL,
  contact_role VARCHAR(128) NULL,
  negotiation_status VARCHAR(64) NOT NULL DEFAULT 'Pipeline de Prospecção',
  current_offer TEXT NULL,
  c_level_support_needed TINYINT(1) NOT NULL DEFAULT 0,
  next_steps TEXT NULL,
  feedback TEXT NULL,
  last_interaction_date DATETIME(6) NULL,
  total_interactions INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE SET NULL,
  UNIQUE KEY agencies_dedupe (name, city, state)
);

CREATE TABLE IF NOT EXISTS agency_interactions (
  id CHAR(36) PRIMARY KEY,
  agency_id CHAR(36) NOT NULL,
  interaction_date DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  interaction_type VARCHAR(64) NULL,
  feedback TEXT NULL,
  next_steps TEXT NULL,
  status_before VARCHAR(64) NULL,
  status_after VARCHAR(64) NULL,
  c_level_support_needed TINYINT(1) NULL,
  current_offer TEXT NULL,
  contract_stock INT NULL,
  source ENUM('web', 'whatsapp', 'import') NOT NULL DEFAULT 'web',
  created_by CHAR(36) NULL,
  created_by_name VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (agency_id) REFERENCES real_estate_agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id CHAR(36) PRIMARY KEY,
  phone VARCHAR(32) NOT NULL,
  consultant_id CHAR(36) NULL,
  message_body TEXT NULL,
  direction ENUM('inbound', 'outbound') NOT NULL,
  parsed_intent VARCHAR(128) NULL,
  raw_payload JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'received',
  error_message TEXT NULL,
  agency_id CHAR(36) NULL,
  flow VARCHAR(64) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bot_sessions (
  id CHAR(36) PRIMARY KEY,
  consultant_id CHAR(36) NULL,
  phone VARCHAR(32) NOT NULL,
  current_flow VARCHAR(64) NULL,
  current_step VARCHAR(64) NOT NULL DEFAULT 'idle',
  agency_id CHAR(36) NULL,
  session_data JSON NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  expires_at DATETIME(6) NOT NULL,
  last_message_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

CREATE TABLE IF NOT EXISTS hubspot_mappings (
  id CHAR(36) PRIMARY KEY,
  agency_id CHAR(36) NOT NULL UNIQUE,
  hubspot_company_id VARCHAR(64) NULL,
  hubspot_contact_id VARCHAR(64) NULL,
  last_synced_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY (agency_id) REFERENCES real_estate_agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS slack_events (
  id CHAR(36) PRIMARY KEY,
  event_type VARCHAR(128) NOT NULL,
  slack_user_id VARCHAR(64) NULL,
  slack_team_id VARCHAR(64) NULL,
  channel_id VARCHAR(64) NULL,
  consultant_id CHAR(36) NULL,
  payload JSON NOT NULL,
  response JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'received',
  error_message TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

CREATE TABLE IF NOT EXISTS slack_sessions (
  id CHAR(36) PRIMARY KEY,
  slack_user_id VARCHAR(64) NOT NULL,
  consultant_id CHAR(36) NULL,
  current_flow VARCHAR(64) NULL,
  current_step VARCHAR(64) NOT NULL DEFAULT 'idle',
  agency_id CHAR(36) NULL,
  session_data JSON NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  expires_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

CREATE TABLE IF NOT EXISTS slack_notifications (
  id CHAR(36) PRIMARY KEY,
  notification_type VARCHAR(64) NOT NULL,
  agency_id CHAR(36) NULL,
  consultant_id CHAR(36) NULL,
  slack_user_id VARCHAR(64) NULL,
  channel_id VARCHAR(64) NULL,
  message_ts VARCHAR(64) NULL,
  payload JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);
