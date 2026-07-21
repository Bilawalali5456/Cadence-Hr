-- Adforce HR Database Schema
-- Applied automatically on server startup (server/index.js → ensureSchema)
-- Also run manually via: cd server && npm run setup
--
-- When adding a new table: use CREATE TABLE IF NOT EXISTS below.
-- When adding columns: use ALTER TABLE ... ADD COLUMN IF NOT EXISTS in migrations section.

CREATE TABLE IF NOT EXISTS users (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  email                       TEXT UNIQUE NOT NULL,
  password                    TEXT NOT NULL,
  role                        TEXT NOT NULL DEFAULT 'Employee',
  title                       TEXT DEFAULT '',
  dept                        TEXT DEFAULT '',
  team                        TEXT DEFAULT '',
  type                        TEXT DEFAULT 'Full-time',
  hired                       TEXT DEFAULT '',
  salary                      TEXT DEFAULT '',
  phone                       TEXT DEFAULT '',
  status                      TEXT DEFAULT 'active',
  leave_balance               INTEGER DEFAULT 24,
  sick_balance                INTEGER DEFAULT 0,
  skills                      JSONB DEFAULT '[]',
  first_login                 BOOLEAN DEFAULT false,
  temp_password               TEXT,
  cnic_enc                    TEXT,
  marital_status              TEXT DEFAULT '',
  guardian_name               TEXT DEFAULT '',
  emergency_contact_name      TEXT DEFAULT '',
  emergency_contact_phone     TEXT DEFAULT '',
  emergency_contact_relation  TEXT DEFAULT '',
  bank_name                   TEXT DEFAULT '',
  bank_branch                 TEXT DEFAULT '',
  bank_account                TEXT DEFAULT '',
  bank_iban                   TEXT DEFAULT '',
  shift                       JSONB
);

CREATE TABLE IF NOT EXISTS attendance (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  date            TEXT NOT NULL,
  check_in        TEXT,
  check_out       TEXT,
  breaks          JSONB DEFAULT '[]',
  short_leaves    JSONB DEFAULT '[]',
  break_start     TEXT,
  break_end       TEXT,
  auto_checkout   BOOLEAN DEFAULT false,
  working_ms      BIGINT,
  total_break_ms  BIGINT,
  status          TEXT,
  late            BOOLEAN DEFAULT false,
  source          TEXT DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  emp_name    TEXT NOT NULL,
  type        TEXT NOT NULL,
  from_date   TEXT NOT NULL,
  to_date     TEXT NOT NULL,
  days        INTEGER NOT NULL,
  note        TEXT DEFAULT '',
  status      TEXT DEFAULT 'pending',
  submitted   TEXT,
  paid_days   INTEGER,
  unpaid_days INTEGER,
  pay_tag     TEXT
);

CREATE TABLE IF NOT EXISTS short_leave_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  emp_name   TEXT NOT NULL,
  date       TEXT NOT NULL,
  from_time  TEXT NOT NULL,
  to_time    TEXT NOT NULL,
  start_iso  TEXT,
  end_iso    TEXT,
  minutes    INTEGER DEFAULT 0,
  reason     TEXT DEFAULT '',
  status     TEXT DEFAULT 'pending',
  submitted  TEXT
);

CREATE TABLE IF NOT EXISTS announcements (
  id     TEXT PRIMARY KEY,
  title  TEXT NOT NULL,
  body   TEXT DEFAULT '',
  date   TEXT,
  author TEXT
);

CREATE TABLE IF NOT EXISTS payroll (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  month   TEXT NOT NULL,
  data    JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS company_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  office_start  TEXT DEFAULT '09:00',
  grace_minutes INTEGER DEFAULT 15,
  currency      TEXT DEFAULT 'PKR'
);

CREATE TABLE IF NOT EXISTS policies (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'General',
  body        TEXT DEFAULT '',
  version     INTEGER DEFAULT 1,
  updated_at  TEXT,
  updated_by  TEXT DEFAULT '',
  created_at  TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  asset_type      TEXT NOT NULL DEFAULT 'Other',
  serial_number   TEXT DEFAULT '',
  condition       TEXT DEFAULT 'Good',
  remarks         TEXT DEFAULT '',
  assigned_to     TEXT,
  assigned_date   TEXT,
  return_date     TEXT,
  status          TEXT DEFAULT 'available',
  updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS holidays (
  id    TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date  TEXT NOT NULL,
  type  TEXT NOT NULL DEFAULT 'public'
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT DEFAULT '',
  type       TEXT NOT NULL DEFAULT 'announcement',
  read       BOOLEAN DEFAULT false,
  created_at TEXT,
  link       TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS warnings (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'verbal',
  reason       TEXT NOT NULL,
  date         TEXT NOT NULL,
  issued_by    TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'
);

-- Seed RBAC role definitions
INSERT INTO roles (id, name, permissions) VALUES
('HR Admin', 'HR Admin', '[
  "view_dashboard","view_people","manage_employees","manage_executives",
  "view_attendance","view_attendance_reports","approve_short_leave","approve_leave","view_leave",
  "view_policies","manage_policies","view_assets","view_all_assets","manage_assets",
  "view_announcements","manage_announcements","manage_company_settings","view_payroll","manage_payroll"
]'::jsonb),
('Executive', 'Executive', '[
  "view_dashboard","view_people","manage_employees","manage_executives","manage_hr_admin",
  "view_attendance","view_attendance_reports","approve_short_leave","approve_leave","view_leave",
  "view_policies","manage_policies","view_assets","view_all_assets","manage_assets",
  "view_announcements","manage_announcements","manage_company_settings","view_payroll","manage_payroll"
]'::jsonb),
('Manager', 'Manager', '[
  "view_dashboard","view_attendance","view_attendance_reports",
  "approve_short_leave","approve_leave","view_leave",
  "view_policies","view_assets","view_announcements","view_payroll"
]'::jsonb),
('Employee', 'Employee', '[
  "view_dashboard","view_attendance","view_leave",
  "view_policies","view_assets","view_announcements","view_payroll"
]'::jsonb)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, permissions = EXCLUDED.permissions;

-- Seed default admin (only if users table is empty)
INSERT INTO users (id, name, email, password, role, title, dept, team, type, hired, status, leave_balance, sick_balance, first_login, shift)
SELECT 'u-admin', 'Admin', 'admin@adforce.com', 'Admin@123', 'HR Admin', 'HR Administrator', 'Management', 'HQ', 'Full-time', '2024-01-01', 'active', 24, 0, false,
  '{"shiftStart":"09:00","shiftEnd":"18:00","graceMinutes":15,"breakMinutes":60,"checkoutGraceMinutes":10}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM users);

-- Migrate existing databases to new leave/weekend policy columns
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS paid_days INTEGER;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS unpaid_days INTEGER;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS pay_tag TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE users ALTER COLUMN leave_balance SET DEFAULT 24;
ALTER TABLE users ALTER COLUMN sick_balance SET DEFAULT 0;
-- Align existing accounts to the new annual leave policy (was 15 + separate sick days)
UPDATE users SET leave_balance = 24 WHERE leave_balance IS NULL OR leave_balance = 15;
UPDATE users SET sick_balance = 0 WHERE sick_balance IS DISTINCT FROM 0;

-- Seed company settings
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Default Pakistani public holidays for 2026 (Eid dates are approximate)
INSERT INTO holidays (id, title, date, type) VALUES
('hol-pk-day-2026',        'Pakistan Day',    '2026-03-23', 'public'),
('hol-labour-2026',        'Labour Day',      '2026-05-01', 'public'),
('hol-independence-2026',  'Independence Day','2026-08-14', 'public'),
('hol-eid-fitr-2026',      'Eid ul Fitr',     '2026-03-21', 'public'),
('hol-eid-adha-2026',      'Eid ul Adha',     '2026-05-27', 'public')
ON CONFLICT (id) DO NOTHING;

-- Biometric / ZKTeco ADMS integration
CREATE TABLE IF NOT EXISTS biometric_devices (
  id SERIAL PRIMARY KEY,
  serial_number VARCHAR(50) UNIQUE NOT NULL,
  device_name VARCHAR(100),
  model VARCHAR(50),
  firmware_version VARCHAR(50),
  ip_address VARCHAR(45),
  last_seen TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  attlog_stamp BIGINT DEFAULT 0,
  operlog_stamp BIGINT DEFAULT 0,
  attphoto_stamp BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS attlog_stamp BIGINT DEFAULT 0;
ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS operlog_stamp BIGINT DEFAULT 0;
ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS attphoto_stamp BIGINT DEFAULT 0;

CREATE TABLE IF NOT EXISTS biometric_logs (
  id SERIAL PRIMARY KEY,
  device_serial VARCHAR(50),
  pin VARCHAR(20) NOT NULL,
  scan_time TIMESTAMP NOT NULL,
  status INTEGER DEFAULT 0,
  verify_type INTEGER DEFAULT 0,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS biometric_user_map (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(50) NOT NULL DEFAULT '',
  biometric_pin VARCHAR(20) NOT NULL,
  employee_name VARCHAR(100),
  enrolled BOOLEAN DEFAULT false,
  enrolled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(biometric_pin)
);

CREATE TABLE IF NOT EXISTS device_commands (
  id SERIAL PRIMARY KEY,
  device_serial VARCHAR(50) NOT NULL,
  command_type VARCHAR(50) NOT NULL,
  command_data TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMP,
  completed_at TIMESTAMP,
  result TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS biometric_raw_logs (
  id SERIAL PRIMARY KEY,
  device_serial VARCHAR(50),
  request_method VARCHAR(10),
  request_path TEXT,
  query_params TEXT,
  request_body TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biometric_logs_pin_time ON biometric_logs (pin, scan_time);
CREATE INDEX IF NOT EXISTS idx_biometric_logs_processed ON biometric_logs (processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_biometric_user_map_employee ON biometric_user_map (employee_id);

-- ADMS v2: normalized attendance logs + per-device user mapping
CREATE TABLE IF NOT EXISTS device_user_mapping (
  id SERIAL PRIMARY KEY,
  device_user_id INTEGER NOT NULL,
  employee_id VARCHAR(50) NOT NULL,
  device_serial_number VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (device_serial_number, device_user_id)
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(50),
  device_user_id INTEGER NOT NULL,
  device_serial_number VARCHAR(50) NOT NULL,
  punch_time TIMESTAMP NOT NULL,
  punch_type VARCHAR(20) NOT NULL DEFAULT 'check_in',
  verify_method VARCHAR(20) DEFAULT 'unknown',
  raw_data TEXT,
  is_duplicate BOOLEAN DEFAULT false,
  synced_to_attendance BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (device_serial_number, device_user_id, punch_time)
);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee ON attendance_logs (employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_punch_time ON attendance_logs (punch_time);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_unsynced ON attendance_logs (synced_to_attendance) WHERE synced_to_attendance = false AND is_duplicate = false;
CREATE INDEX IF NOT EXISTS idx_device_user_mapping_employee ON device_user_mapping (employee_id);

-- Migrate legacy PIN mappings into device_user_mapping (best-effort)
INSERT INTO device_user_mapping (device_user_id, employee_id, device_serial_number)
SELECT CAST(bm.biometric_pin AS INTEGER), bm.employee_id,
       COALESCE(
         (SELECT serial_number FROM biometric_devices ORDER BY last_seen DESC NULLS LAST LIMIT 1),
         'UNKNOWN'
       )
FROM biometric_user_map bm
WHERE bm.employee_id IS NOT NULL
  AND bm.employee_id != ''
  AND bm.biometric_pin ~ '^[0-9]+$'
ON CONFLICT (device_serial_number, device_user_id) DO NOTHING;
