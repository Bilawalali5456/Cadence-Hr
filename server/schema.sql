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
  late            BOOLEAN DEFAULT false
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
  "view_dashboard","view_people","manage_hr_admin","view_attendance","view_attendance_reports",
  "approve_short_leave","approve_leave","view_leave","view_payroll",
  "view_policies","manage_policies","view_assets","view_all_assets",
  "view_announcements","manage_announcements"
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
