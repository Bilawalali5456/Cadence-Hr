# Role Guide: HR Admin (Admin)

This document explains how the **HR Admin** role works in Adforce HR: permissions, features, and day-to-day workflows.

In the product UI this role appears as **HR Admin**. It is the primary **administrator** of the HR portal.

---

## 1. Who this role is for

HR staff responsible for:
- Hiring and maintaining employee records
- Attendance oversight and approvals
- Leave and short-leave decisions
- Payroll generation
- Policies, assets, announcements, holidays
- Employee warnings / notices
- Company settings

---

## 2. Permissions (from `roles` table)

HR Admin typically includes:

| Permission | Effect |
|------------|--------|
| `view_dashboard` | Operations home dashboard |
| `view_people` / `manage_employees` | Full People directory CRUD |
| `manage_executives` | Create and manage Executive accounts |
| `view_attendance` / `view_attendance_reports` | Own check-in + org attendance reports |
| `view_leave` / `approve_leave` / `approve_short_leave` | Leave queues and decisions |
| `view_payroll` / `manage_payroll` | Generate, edit status, delete slips |
| `view_policies` / `manage_policies` | Policy library admin |
| `view_assets` / `view_all_assets` / `manage_assets` | Full asset inventory |
| `view_announcements` / `manage_announcements` | Publish company posts |
| `manage_company_settings` | Office defaults / currency in Settings |

**Reports** nav item is also available (role allow-list: HR Admin & Executive).

HR Admin does **not** use the Employee-only **My Profile** nav item the same way staff do; profile/password is available under **Settings**. HR Admin can still check in on the Home dashboard.

---

## 3. Features by area

### 3.1 Home (Dashboard)
- Personal shift check-in / break / checkout card
- KPI cards (headcount, checked-in now, departments, pending setup)
- **Late Alerts** — employees with 3+ late arrivals this month → Issue Warning
- Pending short-leave approvals
- Today’s attendance list
- Pending first-login reminders

### 3.2 People
- Searchable employee / manager roster
- Add employee (generates temp password + emails credentials)
- Edit profile, shift, bank, personal, access fields
- Reset password / change email
- Delete employee (with confirmation)
- Issue **Warning** (verbal / written / final) + email + in-app notification
- Profile slide-over tabs including **Warnings** history
- Adjust leave balances where permitted

### 3.3 Executives
- Create Executive users
- Manage executive profile and credentials

### 3.4 Attendance
- Organization attendance reports (not only personal history)
- Late indicators, day status, admin corrections where enabled

### 3.5 Short Leave & Leave
- View all relevant requests
- Approve / reject
- Notifications created for the employee on status change

### 3.6 Payroll
- Select month, generate slips from attendance/leave data
- View slip details (basic, allowances, deductions, net)
- Mark paid / delete slips
- Currency from company settings

### 3.7 Reports
Analytics tabs:
- **Attendance** — dept %, top late, most absences
- **Leave** — paid vs unpaid, dept days, low balance warnings
- **Headcount** — dept pie, employment type, active/inactive/hires
- **Payroll** — month totals, dept summary, 6-month trend

### 3.8 Holidays
- Maintain public / optional holidays (affects attendance & calculations)

### 3.9 Policies & Announcements
- Create/update content
- Fan-out in-app notifications and optional emails to staff

### 3.10 Assets
- Full inventory: assign, return, condition, serials

### 3.11 Settings
- Own password / profile preferences
- **Company settings** (office start, grace, currency) when `manage_company_settings` is granted

---

## 4. Typical workflows

### Onboard a new employee
1. People → **Add employee**
2. Fill name, email, CNIC, role, shift, bank as needed
3. Save → system emails temporary password
4. Employee logs in → forced password change
5. Optional: assign assets, set leave balance

### Handle chronic lateness
1. Home → **Late Alerts** (or People → warning icon)
2. Issue Warning with type + reason (≥ 10 characters)
3. Employee receives email + bell notification
4. Employee acknowledges under My Profile → Warnings

### Run monthly payroll
1. Ensure attendance and leave are up to date
2. Payroll → select month → generate slips
3. Review deductions (absent / unpaid leave)
4. Mark paid when funds are transferred

### Publish a policy
1. Policies → add / edit
2. Employees get notification (and email if configured)
3. Staff read under Policies page

---

## 5. What HR Admin should not do

- Share the default `admin@adforce.com` password
- Issue warnings without a clear written reason (audit trail lives in `warnings`)
- Delete payroll slips after payment without a recorded process
- Rely on client-only checks for highly sensitive operations in multi-admin environments (current model trusts authenticated HR users)

---

## 6. Related docs

- [Role: Executive](./ROLE-EXECUTIVE.md)
- [Role: Employee](./ROLE-EMPLOYEE.md)
- [Database — roles](./DATABASE.md)
- [Backend — credentials email](./BACKEND.md)
