CREATE DATABASE IF NOT EXISTS cargo_planner
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE cargo_planner;

CREATE TABLE IF NOT EXISTS cp_users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  role ENUM('ADMIN', 'EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
  status ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
  password_salt VARCHAR(128) NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  password_iterations INT NOT NULL DEFAULT 120000,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  INDEX idx_cp_users_role_status (role, status),
  CONSTRAINT fk_cp_users_created_by FOREIGN KEY (created_by) REFERENCES cp_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_login_devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  device_name VARCHAR(128) NULL,
  mac_address VARCHAR(64) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  session_token_hash CHAR(64) NULL,
  online TINYINT(1) NOT NULL DEFAULT 0,
  logged_in_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cp_login_devices_user_device (user_id, device_id),
  INDEX idx_cp_login_devices_online (online, last_seen_at),
  INDEX idx_cp_login_devices_token (session_token_hash),
  CONSTRAINT fk_cp_login_devices_user FOREIGN KEY (user_id) REFERENCES cp_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_login_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  username VARCHAR(64) NULL,
  event_type ENUM('LOGIN_SUCCESS', 'LOGIN_FAIL', 'LOGOUT', 'KICK', 'DEVICE_LIMIT') NOT NULL,
  device_id VARCHAR(128) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  message VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cp_login_events_user_time (user_id, created_at),
  INDEX idx_cp_login_events_type_time (event_type, created_at),
  CONSTRAINT fk_cp_login_events_user FOREIGN KEY (user_id) REFERENCES cp_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_admin_audit_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  admin_user_id BIGINT NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40) NULL,
  target_id BIGINT NULL,
  detail VARCHAR(512) NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cp_admin_audit_admin_time (admin_user_id, created_at),
  CONSTRAINT fk_cp_admin_audit_user FOREIGN KEY (admin_user_id) REFERENCES cp_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_excel_cleaning_tasks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_no VARCHAR(40) NOT NULL UNIQUE,
  source_channel ENUM('MANUAL', 'AGENT') NOT NULL DEFAULT 'AGENT',
  original_file_name VARCHAR(255) NOT NULL,
  status ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  row_count INT NOT NULL DEFAULT 0,
  valid_count INT NOT NULL DEFAULT 0,
  issue_count INT NOT NULL DEFAULT 0,
  cleaned_count INT NOT NULL DEFAULT 0,
  cleaned_json LONGTEXT NULL,
  issues_json LONGTEXT NULL,
  agent_notes TEXT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  INDEX idx_cp_excel_cleaning_tasks_status_time (status, created_at),
  INDEX idx_cp_excel_cleaning_tasks_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_workspace_files (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  owner_display_name VARCHAR(80) NOT NULL,
  owner_folder VARCHAR(160) NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  normalized_file_name VARCHAR(255) NOT NULL,
  version_no INT NOT NULL DEFAULT 1,
  stored_relative_path VARCHAR(512) NOT NULL,
  content_type VARCHAR(160) NOT NULL DEFAULT 'application/octet-stream',
  extension VARCHAR(20) NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  source_channel VARCHAR(40) NOT NULL DEFAULT 'USER_UPLOAD',
  expires_at DATETIME(6) NOT NULL,
  last_accessed_at DATETIME(6) NULL,
  reuse_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_cp_workspace_files_user_name_version (user_id, normalized_file_name, version_no),
  INDEX idx_cp_workspace_files_user_time (user_id, created_at),
  INDEX idx_cp_workspace_files_expiry (expires_at),
  INDEX idx_cp_workspace_files_user_hash (user_id, sha256),
  CONSTRAINT fk_cp_workspace_files_user FOREIGN KEY (user_id) REFERENCES cp_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_text_recognition_tasks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_no VARCHAR(40) NOT NULL UNIQUE,
  source_channel ENUM('LOCAL', 'AGENT') NOT NULL DEFAULT 'AGENT',
  source_name VARCHAR(255) NOT NULL DEFAULT 'pasted-text',
  status ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  raw_text LONGTEXT NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  valid_count INT NOT NULL DEFAULT 0,
  issue_count INT NOT NULL DEFAULT 0,
  cleaned_count INT NOT NULL DEFAULT 0,
  cleaned_json LONGTEXT NULL,
  issues_json LONGTEXT NULL,
  agent_notes TEXT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  INDEX idx_cp_text_recognition_tasks_status_time (status, created_at),
  INDEX idx_cp_text_recognition_tasks_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cp_system_settings (
  setting_key VARCHAR(120) PRIMARY KEY,
  setting_value LONGTEXT NULL,
  description VARCHAR(255) NULL,
  updated_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cp_system_settings_updated_at (updated_at),
  CONSTRAINT fk_cp_system_settings_updated_by FOREIGN KEY (updated_by) REFERENCES cp_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO cp_system_settings (setting_key, setting_value, description)
SELECT 'llm.enabled', 'true', 'Whether text recognition should call the configured LLM first'
WHERE NOT EXISTS (SELECT 1 FROM cp_system_settings WHERE setting_key = 'llm.enabled');

INSERT INTO cp_system_settings (setting_key, setting_value, description)
SELECT 'llm.base_url', 'https://api.deepseek.com', 'OpenAI-compatible base URL for text recognition'
WHERE NOT EXISTS (SELECT 1 FROM cp_system_settings WHERE setting_key = 'llm.base_url');

INSERT INTO cp_system_settings (setting_key, setting_value, description)
SELECT 'llm.model', 'deepseek-v4-flash', 'LLM model name for text recognition'
WHERE NOT EXISTS (SELECT 1 FROM cp_system_settings WHERE setting_key = 'llm.model');

INSERT INTO cp_system_settings (setting_key, setting_value, description)
SELECT 'llm.api_key', '', 'API key for the configured OpenAI-compatible LLM provider'
WHERE NOT EXISTS (SELECT 1 FROM cp_system_settings WHERE setting_key = 'llm.api_key');

-- Default super administrator:
-- username: admin
-- password: Admin@123456
-- Please change this password immediately after the first production login.
INSERT INTO cp_users (
  username,
  display_name,
  role,
  status,
  password_salt,
  password_hash,
  password_iterations
)
SELECT
  'admin',
  '总管理员',
  'ADMIN',
  'ACTIVE',
  'Y2FyZ28tcGxhbm5lci1hZG1pbg==',
  '4rg2oHHTUKOtWfBp95e6uxvLAMP2iD51D+wNazHYt34=',
  120000
WHERE NOT EXISTS (
  SELECT 1 FROM cp_users WHERE username = 'admin'
);
