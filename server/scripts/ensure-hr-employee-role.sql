-- Ensure HR Employee role exists (safe to re-run on existing databases)
INSERT INTO roles (id, name, permissions) VALUES
('HR Employee', 'HR Employee', '[
  "view_dashboard","view_people","manage_employees","manage_executives",
  "view_attendance","view_attendance_reports","approve_short_leave","approve_leave","view_leave",
  "view_policies","manage_policies","view_assets","view_all_assets","manage_assets",
  "view_announcements","manage_announcements","manage_company_settings","view_payroll","manage_payroll"
]'::jsonb)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, permissions = EXCLUDED.permissions;
