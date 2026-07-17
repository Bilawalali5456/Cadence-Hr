# Role Guide: Executive (HR Executive)

This document explains the **Executive** role in Adforce HR — the executive / HR executive oversight persona.

In the login UI this role is labeled **Executive**.

---

## 1. Who this role is for

Company executives who need:
- Visibility into workforce attendance and leave
- Oversight of **HR Admin** leave/short-leave requests
- Ability to manage company announcements and policies
- Access to payroll **views** and analytics
- People directory visibility (including HR Admin accounts where permitted)

They are **not** day-to-day employee administrators (no full employee CRUD / payroll generation / executive account management in the default permission set).

---

## 2. Permissions (typical seed)

| Permission | Effect |
|------------|--------|
| `view_dashboard` | Executive operations dashboard |
| `view_people` | People directory (view / HR Admin management helpers) |
| `manage_hr_admin` | Manage HR Admin profiles, credentials, related records |
| `view_attendance` / `view_attendance_reports` | Org attendance reports (no personal staff check-in focus) |
| `view_leave` / `approve_leave` / `approve_short_leave` | Approvals including HR Admin requests |
| `view_payroll` | View payroll slips (no `manage_payroll`) |
| `view_policies` / `manage_policies` | Policy administration |
| `view_assets` / `view_all_assets` | See assets (no `manage_assets` by default) |
| `view_announcements` / `manage_announcements` | Publish announcements |

**Reports** is visible (allow-list: HR Admin & Executive).

**Not** included by default:
- `manage_employees`
- `manage_executives`
- `manage_payroll`
- `manage_company_settings`
- `manage_assets`

---

## 3. Features by area

### 3.1 Home (Dashboard)
- Welcome / executive portal banner
- Org KPI cards
- **HR Admin oversight panel** — pending short leave and leave from HR Admins that require Executive approval
- Attendance overview for the org roster used by executives
- Late alerts appear for users who also have employee-management rights; Executives primarily use Reports + People for patterns

### 3.2 People
- View employees and HR Admin accounts per roster rules
- Where `manage_hr_admin` / related helpers apply: edit HR Admin profile, reset credentials, manage attendance/leave/payroll records tied to HR Admin
- **Read-only** for normal employees if `manage_employees` is absent (banner explains view-only)

### 3.3 Attendance
- Full attendance **reports** (checked-in status, late pills, history)
- Executives do **not** use the employee self-service check-in as their primary Home experience

### 3.4 Leave & Short Leave
- Approve / reject requests they are authorized to see
- Special case: **HR Admin’s own leave** is escalated to Executive review

### 3.5 Payroll
- Organization visibility into generated slips
- Cannot generate or mark paid without `manage_payroll`

### 3.6 Reports
Same analytics suite as HR Admin:
- Attendance, Leave, Headcount, Payroll charts and tables

### 3.7 Policies & Announcements
- Full create/update rights with notification fan-out

### 3.8 Assets / Holidays / Settings
- Assets: view (and all-assets where permitted)
- Holidays: visible; management typically left to HR Admin unless UI allows broader edit
- Settings: personal account/password; company settings tab only if permission granted (default seed does not)

---

## 4. Typical workflows

### Approve an HR Admin’s leave
1. Home → oversight panel **or** Leave / Short Leave pages
2. Review dates / reason
3. Approve or reject → HR Admin receives in-app notification

### Publish a company announcement
1. Announcements → create post
2. Employees & managers notified (email if SMTP configured)

### Review workforce health
1. Reports → Attendance (late / absence tables)
2. Reports → Headcount and Leave low-balance cards
3. Follow up with HR Admin for warnings or coaching

### Audit payroll readiness
1. Payroll → browse month slips (view only)
2. Ask HR Admin to generate or correct if gaps appear

---

## 5. Boundaries vs HR Admin

| Capability | Executive | HR Admin |
|------------|-----------|----------|
| Add / delete employees | No (default) | Yes |
| Create other Executives | No | Yes |
| Generate payroll | No | Yes |
| Manage company settings | No (default) | Yes |
| Manage assets | No (default) | Yes |
| Approve HR Admin leave | Yes | N/A (own leave escalates) |
| Reports analytics | Yes | Yes |
| Manage policies / announcements | Yes | Yes |

---

## 6. Related docs

- [Role: HR Admin](./ROLE-HR-ADMIN.md)
- [Role: Employee](./ROLE-EMPLOYEE.md)
- [Frontend — NAV filtering](./FRONTEND.md)
- [Database — roles seed](./DATABASE.md)
