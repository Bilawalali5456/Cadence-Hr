# Role Guide: Employee (and Manager)

This document explains how **Employee** (and closely related **Manager**) users work in Adforce HR: features, permissions, and everyday workflows.

---

## 1. Who these roles are for

### Employee
Individual contributors who:
- Check in / out for their shift
- Request leave and short leave
- View policies, announcements, assets, and their payroll slips
- Maintain profile details and acknowledge HR warnings

### Manager
Uses the same staff portal patterns as Employee for self-service, with **extra** abilities to:
- View attendance **reports**
- Approve leave / short leave for their scope
- See broader payroll visibility per permissions

On the login screen, choosing **Employee** also accepts Manager accounts (Managers can use the Employee portal card).

---

## 2. Permissions

### Employee (seed)

| Permission | Effect |
|------------|--------|
| `view_dashboard` | Personal home / welcome |
| `view_attendance` | Own attendance history + check-in UX |
| `view_leave` | Submit and track leave / short leave |
| `view_policies` | Read policies |
| `view_assets` | See relevant assets |
| `view_announcements` | Read announcements |
| `view_payroll` | View **own** salary slips |

### Manager (seed) — Employee plus

| Permission | Effect |
|------------|--------|
| `view_attendance_reports` | Team / org attendance views where UI allows |
| `approve_short_leave` / `approve_leave` | Approval actions |
| `view_payroll` | Broader payroll visibility per page rules |

Managers typically **do not** have `manage_employees`, `manage_payroll`, or Reports (Reports is HR Admin / Executive only).

---

## 3. Navigation (what you see)

Staff sidebar commonly includes:
- Home
- Attendance
- Short Leave
- Leave
- Payroll
- Holidays
- Policies
- Assets
- Announcements
- **My Profile**
- Settings

Not shown (unless permissions change):
- People (admin)
- Executives
- Reports

---

## 4. Features by area

### 4.1 Home
- Welcome card with name / shift
- **Check-in / break / checkout** panel (`EmployeeShiftPanel`)
- Annual leave balance summary
- Quick links: leave, profile, settings, attendance history

### 4.2 Attendance
- Personal history of check-ins, breaks, hours, day status
- Late / auto-checkout indicators
- Managers with report permission see admin-style roster views

### 4.3 Short Leave
- Request time away within a day (from–to, reason)
- Track pending / approved / rejected
- Managers may approve others’ requests

### 4.4 Leave
- Multi-day requests (type, dates, note)
- System may split **paid** vs **unpaid** days based on balance
- Status updates appear as in-app notifications

### 4.5 Payroll
- List of generated salary slips for the user
- Open slip for earnings, deductions, net, bank snapshot
- Employees cannot generate slips

### 4.6 Holidays
- View company holiday calendar (public / optional)

### 4.7 Policies & Announcements
- Read published content
- Bell notifications when HR publishes new items

### 4.8 Assets
- See assets assigned to you (and list visibility per permission)

### 4.9 My Profile
- Personal information and emergency contacts (read-only; ask HR to change)
- Leave balance display
- **Warnings** tab:
  - List verbal / written / final warnings
  - **Acknowledge** pending items (green check when done)
- Change password tab

### 4.10 Settings
- Account security / preferences
- Password change (also available on My Profile)

### 4.11 Notifications (header bell)
- Types include announcement, policy, leave status, warning
- Mark one or all as read
- Click to jump to linked page (e.g. My Profile for warnings)

---

## 5. Typical workflows

### First day login
1. Open the portal URL
2. Select **Employee** (or Manager)
3. Sign in with emailed credentials
4. **Change temporary password** when prompted
5. Complete check-in on Home when shift starts

### Daily attendance
1. Home → Check in (respect shift window / grace / holidays)
2. Start / end break as needed
3. Check out at end of day (or allow auto-checkout if configured)

### Request leave
1. Leave → new request → type, dates, note
2. Submit → status `pending`
3. Wait for HR Admin / Manager / Executive approval
4. Notification arrives on decision; balance updates if approved paid leave

### Acknowledge a warning
1. Email and/or bell: “Verbal/Written/Final Warning Issued”
2. My Profile → **Warnings**
3. Read reason → **Acknowledge**
4. Status shows acknowledged with checkmark

### View payslip
1. Payroll → open the month slip
2. Review net pay and deductions
3. Contact HR Admin for discrepancies

---

## 6. Rules employees should know

- Weekends and **public holidays** generally block check-in
- Late check-in is flagged after grace minutes on your shift
- Leave balance is enforced when splitting paid/unpaid days
- Profile fields (CNIC, bank, etc.) are usually edited by HR, not self-serve
- Warnings remain on your record even after acknowledgement

---

## 7. Manager-specific notes

- Use approval queues on Short Leave / Leave (and Dashboard widgets when shown)
- Attendance reports help spot team lateness before HR issues warnings
- You still check in like an employee if you are on a staff shift
- You do not access the full People admin or Reports analytics by default

---

## 8. Related docs

- [Role: HR Admin](./ROLE-HR-ADMIN.md) — who manages your account
- [Role: Executive](./ROLE-EXECUTIVE.md) — oversight layer
- [Frontend](./FRONTEND.md) — My Profile / notifications
- [Implementation Guide](./IMPLEMENTATION-GUIDE.md) — how the portal is hosted
