# Adforce Solutions HRMS — Role Architecture

**Document version:** 2.0  
**System:** Cadence HR (Adforce Solutions)  
**Timezone:** Asia/Karachi (PKT)

> ⚠️ All changes are forward-only. Past attendance, leaves, payroll, and records remain unchanged.

---

## Role Hierarchy

```
┌─────────────────────────────────────────────┐
│               EXECUTIVE (CEO)               │
│         Super Authority — Full Access        │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌───────────────┐    ┌───────────────────┐
│  HR EMPLOYEE  │    │      ADMIN        │
│  HR Operations│    │  Assets Only      │
└───────┬───────┘    └───────────────────┘
        │
        ▼
┌───────────────────┐
│     EMPLOYEE      │
│   Self-Service    │
│  (incl. Manager)  │
└───────────────────┘
```

**Login Page Dropdown Order:**

1. Executive
2. HR Employee
3. Admin
4. Employee

> Manager role is merged into Employee. Existing Manager users login via "Employee" with "Manager" designation preserved.

---

## 1. EXECUTIVE (CEO Level)

### Role Description

The Executive is the highest authority in the system. Full visibility and control over every module, every employee, and every operation. The Executive is the final approver for sensitive operations and the only role that can manage HR Employee payroll.

### Portal Access

| Module | Access |
|--------|--------|
| Dashboard | ✅ Full (company-wide stats, all employees) |
| Attendance | ✅ View all, correct all, daily + monthly views |
| Leaves | ✅ View all, approve/reject all, edit balances |
| Short Leave | ✅ View all, approve/reject all |
| Payroll | ✅ View all, generate all (including HR Employee) |
| People | ✅ Add, edit, delete any employee, assign roles |
| Assets | ✅ Full (add, edit, assign, return, brands, specs) |
| Announcements | ✅ Create, edit, delete |
| Warnings | ✅ Issue, edit, delete warnings to any employee |
| Policies | ✅ Create, edit, delete company policies |
| Biometric | ✅ View device status, manage PIN mapping |
| Reports | ✅ All reports (attendance, payroll, leave summaries) |
| WFH | ✅ View all, approve/reject all |
| Shifts | ✅ Create, edit, assign shifts to any employee |

### Attendance Tracking

- ✅ Tracked via biometric device
- ✅ Can do WFH check-in/check-out (if approved WFH leave)
- ✅ Subject to all attendance rules (late, early leave, etc.)

### Leave Management

- ✅ Can apply for own leave
- ✅ Can approve/reject any employee's leave
- ✅ Can edit leave balances for any employee
- ✅ Can view all leave history

### Short Leave

- ✅ Can apply for own short leave
- ✅ Can approve/reject any employee's short leave

### Payroll

- ✅ Can view own payroll slip
- ✅ Can view all employees' payroll
- ✅ Can generate payroll slips for ALL employees (including HR Employee)
- ✅ Final authority on payroll generation

### People Management

- ✅ Can add new employees
- ✅ Can edit any employee profile
- ✅ Can delete/deactivate employees
- ✅ Can assign roles to any employee
- ✅ Can change shifts for any employee

### Assets Management

- ✅ Full access (add, edit, assign, return, track)

### Special Permissions

- Only role that can generate HR Employee's payroll slip
- Only role that can create/delete other Executive accounts
- Final approver for overtime/extra hours (after HR Employee approval)
- Can override any decision made by HR Employee
- Can view and export all reports

### Cannot Do

- Nothing — Executive has unrestricted access

---

## 2. HR EMPLOYEE

### Role Description

The HR Employee handles day-to-day HR operations — attendance monitoring, leave management, corrections, and payroll for regular employees. This is the operational backbone of HR. Full authority over all HR functions except assets and own payroll generation.

### Portal Access

| Module | Access |
|--------|--------|
| Dashboard | ✅ Full (company-wide stats, all employees) |
| Attendance | ✅ View all, correct all, daily + monthly views |
| Leaves | ✅ View all, approve/reject all, edit balances |
| Short Leave | ✅ View all, approve/reject all |
| Payroll | ✅ View all, generate for others (NOT own) |
| People | ✅ Add, edit employees |
| Assets | ❌ No access — completely hidden |
| Announcements | ✅ Create, edit, delete |
| Warnings | ✅ Issue, edit warnings |
| Policies | ✅ Create, edit policies |
| Biometric | ✅ View device status |
| Reports | ✅ Attendance, leave, payroll reports |
| WFH | ✅ View all, approve/reject all |
| Shifts | ✅ Create, edit, assign shifts |

### Attendance Tracking

- ✅ Tracked via biometric device
- ✅ Can do WFH check-in/check-out (if approved WFH leave)
- ✅ Subject to all attendance rules

### Leave Management

- ✅ Can apply for own leave
- ✅ Can approve/reject any employee's leave
- ✅ Can edit leave balances for employees
- ✅ Full authority over leave operations

### Short Leave

- ✅ Can apply for own short leave
- ✅ Can approve/reject any employee's short leave

### Payroll

- ✅ Can view own payroll slip
- ✅ Can view all employees' payroll
- ✅ Can generate payroll slips for Employees and Admins
- ❌ Cannot generate own payroll slip (Executive does this)

### People Management

- ✅ Can add new employees
- ✅ Can edit employee profiles
- ❌ Cannot delete Executive accounts
- ❌ Cannot change Executive's role

### Assets Management

- ❌ No access — Assets section is completely removed from HR Employee view

### Special Permissions

- First-level approver for overtime/extra hours requests
- Can make manual attendance corrections for any employee
- Can manage WFH requests

### Cannot Do

- ❌ Cannot access Assets module
- ❌ Cannot generate own payroll slip
- ❌ Cannot edit own leave balance
- ❌ Cannot delete Executive accounts
- ❌ Cannot override Executive decisions

---

## 3. ADMIN (Asset Manager)

### Role Description

The Admin role is stripped down to a single function: Assets management. This role exists for the person responsible for managing company equipment, devices, and inventory. No access to HR operations, attendance, leaves, or payroll.

### Portal Access

| Module | Access |
|--------|--------|
| Dashboard | ✅ Limited (own info only) |
| Attendance | ❌ No access |
| Leaves | ❌ No access |
| Short Leave | ❌ No access |
| Payroll | ❌ No access |
| People | ❌ No access |
| Assets | ✅ Full (add, edit, assign, return, brands, specs) |
| Announcements | ❌ No access (can view only) |
| Warnings | ❌ No access |
| Policies | ❌ No access (can view only) |
| Biometric | ❌ No access |
| Reports | ❌ No access |
| WFH | ❌ No access |
| Shifts | ❌ No access |

### Attendance Tracking

- ✅ Own attendance is tracked via biometric
- ❌ Cannot view others' attendance
- ❌ Cannot make corrections

### Leave Management

- ✅ Can apply for own leave
- ❌ Cannot approve/reject any leave
- ❌ Cannot view others' leave

### Short Leave

- ✅ Can apply for own short leave
- ❌ Cannot approve/reject any short leave

### Payroll

- ✅ Can view own payroll slip only
- ❌ Cannot view others' payroll
- ❌ Cannot generate any payroll slips

### People Management

- ❌ No access

### Assets Management

- ✅ Full access — add, edit, delete assets
- ✅ Assign assets to employees
- ✅ Process asset returns
- ✅ Manage asset brands and specifications
- ✅ Track asset history and status

### Special Permissions

- None beyond Assets

### Cannot Do

- ❌ Cannot access attendance (others')
- ❌ Cannot approve/reject leaves
- ❌ Cannot view/generate payroll
- ❌ Cannot manage employees
- ❌ Cannot issue warnings
- ❌ Cannot create announcements
- ❌ Cannot create policies
- ❌ Cannot manage biometric
- ❌ Cannot view reports
- ❌ Cannot approve overtime requests

---

## 4. EMPLOYEE (Including Manager Designation)

### Role Description

Self-service role for all regular employees and managers. Can view own data, apply for leaves, and submit overtime requests. Managers retain their designation label but have the same system permissions as employees.

> **Manager Merge Note:** Existing Manager users are migrated to Employee role with "Manager" designation preserved in their profile. On login page, they use "Employee" to login. In UI, their designation shows as "Manager".

### Portal Access

| Module | Access |
|--------|--------|
| Dashboard | ✅ Own info only (attendance, leaves, WFH buttons) |
| Attendance | ✅ Own attendance only |
| Leaves | ✅ Own leaves only (apply) |
| Short Leave | ✅ Own short leave only (apply) |
| Payroll | ✅ Own payroll slip only (view) |
| People | ❌ No access |
| Assets | ❌ No access (can view own assigned assets) |
| Announcements | ✅ View only |
| Warnings | ✅ View own warnings only |
| Policies | ✅ View only |
| Biometric | ❌ No access |
| Reports | ❌ No access |
| WFH | ✅ Own WFH check-in/out (approved days only) |
| Shifts | ❌ No access (can view own shift) |

### Attendance Tracking

- ✅ Tracked via biometric device
- ✅ Can view own attendance records
- ✅ Can do WFH check-in/check-out (on approved WFH days)
- ❌ Cannot view others' attendance
- ❌ Cannot make corrections

### Leave Management

- ✅ Can apply for own leave (Annual, WFH, Sick)
- ✅ Can view own leave balance and history
- ❌ Cannot approve/reject any leave
- ❌ Cannot edit leave balances

### Short Leave

- ✅ Can apply for own short leave
- ❌ Cannot approve/reject any short leave

### Payroll

- ✅ Can view own payroll slip
- ❌ Cannot view others' payroll
- ❌ Cannot generate any payroll slips

### People Management

- ❌ No access

### Assets Management

- ✅ Can view own assigned assets
- ❌ Cannot add, edit, or manage assets

### Special Permissions

- Can submit overtime/extra hours reason for HR Employee approval
- Break buttons available on dashboard (Manager designation included)

### Cannot Do

- ❌ Cannot view others' data
- ❌ Cannot approve/reject anything
- ❌ Cannot access admin functions
- ❌ Cannot make attendance corrections
- ❌ Cannot manage assets
- ❌ Cannot generate payroll
- ❌ Cannot issue warnings or announcements

---

## Permission Comparison Matrix

| Permission | Executive | HR Employee | Admin | Employee |
|------------|:---------:|:-----------:|:-----:|:--------:|
| **View own attendance** | ✅ | ✅ | ✅ | ✅ |
| **View all attendance** | ✅ | ✅ | ❌ | ❌ |
| **Manual corrections** | ✅ | ✅ | ❌ | ❌ |
| **Apply own leave** | ✅ | ✅ | ✅ | ✅ |
| **Approve/reject leaves** | ✅ | ✅ | ❌ | ❌ |
| **Edit leave balances** | ✅ | ✅ | ❌ | ❌ |
| **Apply short leave** | ✅ | ✅ | ✅ | ✅ |
| **Approve short leave** | ✅ | ✅ | ❌ | ❌ |
| **View own payroll** | ✅ | ✅ | ✅ | ✅ |
| **View all payroll** | ✅ | ✅ | ❌ | ❌ |
| **Generate payroll** | ✅ All | ✅ Not own | ❌ | ❌ |
| **Add/edit employees** | ✅ | ✅ | ❌ | ❌ |
| **Delete employees** | ✅ | ❌ | ❌ | ❌ |
| **Manage assets** | ✅ | ❌ | ✅ | ❌ |
| **View own assets** | ✅ | ✅ | ✅ | ✅ |
| **Create announcements** | ✅ | ✅ | ❌ | ❌ |
| **Issue warnings** | ✅ | ✅ | ❌ | ❌ |
| **Manage policies** | ✅ | ✅ | ❌ | ❌ |
| **Biometric management** | ✅ | ✅ | ❌ | ❌ |
| **View reports** | ✅ | ✅ | ❌ | ❌ |
| **Approve WFH** | ✅ | ✅ | ❌ | ❌ |
| **Manage shifts** | ✅ | ✅ | ❌ | ❌ |
| **Approve overtime** | ✅ Final | ✅ First-level | ❌ | ❌ |
| **Submit overtime reason** | ✅ | ✅ | ✅ | ✅ |

---

## Late Penalty System (3-Late Rule)

### Overview

Every 3 late arrivals within a calendar month triggers an automatic Annual Leave deduction. This system enforces punctuality while being fair — occasional lateness is tolerated, but patterns are penalized.

### Rules

| Rule | Detail |
|------|--------|
| **Counting** | A "late" is any check-in after shift start + grace period |
| **Grace periods** | Unchanged — existing grace periods remain as configured per shift |
| **Reset cycle** | Late count resets to 0 on the 1st of every month |
| **Deduction trigger** | Every 3 lates = 1 Annual Leave auto-deducted |
| **Deduction source** | Annual Leave balance |
| **Balance exhausted** | If Annual Leave balance = 0, deduct 1 day salary per 3 lates |
| **Forward-only** | Past months are NOT recalculated |

### Monthly Deduction Examples

| Late Count | Annual Leave Deducted | Notes |
|------------|----------------------|-------|
| 1–2 lates | 0 | No penalty |
| 3 lates | 1 | First penalty |
| 4–5 lates | 1 | No additional penalty yet |
| 6 lates | 2 | Second penalty |
| 7–8 lates | 2 | No additional penalty yet |
| 9 lates | 3 | Third penalty |

### Salary Deduction Scenario

| Scenario | What Happens |
|----------|--------------|
| Employee has 2 Annual Leaves, used 1 already, balance = 1 | |
| First 3 lates | 1 Annual Leave deducted → balance = 0 |
| Next 3 lates (6 total) | No Annual Leave left → 1 day salary deducted from payroll |
| Next 3 lates (9 total) | Still no balance → another 1 day salary deducted |

### Visibility

- Employee can see their late count for current month in attendance view
- HR Employee and Executive can see all employees' late counts
- Deductions are logged and visible in leave history and payroll

---

## Overtime / Extra Hours System

### Overview

When an employee checks out after their scheduled shift end time, the extra hours are tracked. The employee must provide a reason, which goes through a two-level approval chain. For now, this is tracking only — no salary impact.

### Flow

```
Employee checks out late (after shift end)
        │
        ▼
System auto-detects extra hours
        │
        ▼
Employee enters reason for extra hours
        │
        ▼
HR Employee reviews → Approve / Reject
        │
        ▼ (if approved)
Executive reviews → Final Approve / Reject
        │
        ▼
Record marked as "Overtime Approved" (tracking only, no salary impact for now)
```

### Rules

| Rule | Detail |
|------|--------|
| **Detection** | Automatic — checkout time > shift end time |
| **Reason** | Required — employee must enter why they stayed late |
| **Approval Level 1** | HR Employee approves or rejects |
| **Approval Level 2** | Executive gives final approval or rejection |
| **Salary impact** | None for now — future implementation |
| **Forward-only** | Past records not affected |

### Statuses

- **Pending** — Employee submitted reason, awaiting HR Employee review
- **HR Approved** — HR Employee approved, awaiting Executive review
- **Approved** — Executive gave final approval
- **Rejected** — Rejected at any level (reason shown)

---

## Manager → Employee Migration

### What Changes

- Manager role is removed from the system as a separate role
- All existing Manager users are migrated to "Employee" role
- Their designation field is set to "Manager"
- Login page shows "Employee" (no Manager option)
- In the UI, their profile and name display shows "Manager" designation
- Break buttons on dashboard remain available (previously Manager-only feature, now available to all Employees)

### What Doesn't Change

- Their attendance history remains intact
- Their leave history remains intact
- Their payroll records remain intact
- No data is lost or modified

---

## Key Rules Summary

1. **No self-service on sensitive actions** — No one can generate their own payroll, edit their own leave balance, or approve their own requests.

2. **HR Employee ≠ Admin** — HR Employee handles all HR operations. Admin only manages assets. These are completely separate responsibilities.

3. **Executive sees everything** — Unrestricted access. Final authority on all decisions.

4. **Assets belong to Admin only** — HR Employee cannot access assets. Only Admin and Executive can manage them.

5. **3-Late Rule is automatic** — No manual intervention needed. System calculates and deducts automatically at month end.

6. **Overtime is tracking-only for now** — Two-level approval chain records the data but no salary impact yet.

7. **Forward-only changes** — All new rules (late penalty, overtime, role changes) apply from implementation date forward. No historical data is modified.

8. **Manager is a designation, not a role** — Login is under Employee. Designation shows as Manager in profile.

---

## Technical Implementation Notes

### Files to Modify

- `src/pages/LoginPage.jsx` — Dropdown order, remove Manager option
- `src/pages/Dashboard.jsx` — Role-based module visibility
- `src/pages/AttendancePage.jsx` — Late count display, overtime detection
- `src/utils.js` — Late penalty calculation logic
- `server/routes/attendance-api.js` — Overtime reason submission & approval endpoints
- `server/routes/leave-api.js` — Auto-deduction logic for 3-late rule
- `server/routes/payroll-api.js` — Salary deduction for exhausted leave balance

### Files NOT to Touch

- `server/lib/auth.js` — Session authentication
- `server/routes/adms.js` — ZKTeco biometric device protocol
- `server/lib/attendanceSync.js` — Biometric sync (review carefully if changes needed)

### Database Changes

- Add `late_count` tracking per employee per month
- Add `overtime_requests` table (employee_id, date, extra_minutes, reason, hr_status, exec_status)
- Migrate Manager users: `UPDATE users SET role='Employee', designation='Manager' WHERE role='Manager'`
- No deletion of existing data

---

## Current vs Target State

This document describes the **target** role architecture. The live codebase may still use legacy role names (`HR Admin`, `Manager`) and permissions until the implementation tasks above are completed. Refer to `server/schema.sql` and `src/utils.js` for the current RBAC seed when planning migrations.
