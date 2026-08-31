-- Ensure HR Employee role exists with the same authorities as HR Admin
-- (does NOT include Super Authority: manage_hr_admin — Executive only)
INSERT INTO roles (id, name, permissions) VALUES
('HR Employee', 'HR Employee', '[
  "view_dashboard","view_people","manage_employees","manage_executives",
  "view_attendance","view_attendance_reports","approve_short_leave","approve_leave","view_leave",
  "view_policies","manage_policies",
  "view_announcements","manage_announcements","manage_company_settings","view_payroll","manage_payroll"
]'::jsonb)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, permissions = EXCLUDED.permissions;
