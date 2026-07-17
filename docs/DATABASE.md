# Database Documentation

Adforce HR uses **PostgreSQL** as the system of record. Schema is defined in `server/schema.sql` and applied automatically on every API startup (`ensureSchema()`), as well as via `setup-db.js`.

Database name (default): **`adforce_hr`**

---

## 1. Design principles

- **Logical relationships** via `user_id` / `assigned_to` text IDs (no hard FK constraints in schema for sync flexibility)
- **Idempotent DDL:** `CREATE TABLE IF NOT EXISTS`, safe seeds with `ON CONFLICT`
- **JSONB** for flexible structures: skills, shift, payroll slip `data`, role permissions
- **Client-driven sync:** most tables are replaced wholesale from the SPA (see [Backend](./BACKEND.md))

---

## 2. Entity overview

```
roles ───────────────► (permissions drive UI RBAC)
users ◄──── attendance
  │   ◄──── leave_requests
  │   ◄──── short_leave_requests
  │   ◄──── payroll
  │   ◄──── notifications
  │   ◄──── warnings
  │
  └── assets.assigned_to → users.id

company_settings (singleton id=1)
announcements, policies, holidays (org-wide)
```

---

## 3. Tables

### 3.1 `users`

Employee, manager, HR admin, and executive accounts.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | e.g. `u-…` |
| `name` | TEXT | Required |
| `email` | TEXT UNIQUE | Login identity |
| `password` | TEXT | bcrypt hash (or legacy during migration) |
| `role` | TEXT | `Employee`, `Manager`, `HR Admin`, `Executive` |
| `title`, `dept`, `team`, `type` | TEXT | Profile / org fields |
| `hired` | TEXT | Hire date (ISO date string) |
| `salary` | TEXT | Stored as text for display/forms |
| `phone` | TEXT | |
| `status` | TEXT | typically `active` / inactive |
| `leave_balance` | INTEGER | Annual leave remaining |
| `sick_balance` | INTEGER | Optional sick balance |
| `skills` | JSONB | Array |
| `first_login` | BOOLEAN | Force password change |
| `temp_password` | TEXT | Temporary credential (cleared after change) |
| `cnic_enc` | TEXT | Encrypted CNIC |
| `marital_status`, `guardian_name` | TEXT | Personal |
| `emergency_contact_name/phone/relation` | TEXT | Emergency contact |
| `bank_name`, `bank_branch`, `bank_account`, `bank_iban` | TEXT | Payroll banking |
| `shift` | JSONB | `{ shiftStart, shiftEnd, graceMinutes, breakMinutes, checkoutGraceMinutes }` |

**Seed:** If the table is empty, inserts default HR Admin:
- Email: `admin@adforce.com`
- Password: `Admin@123` (hashed on first migrate/login path)
- Role: `HR Admin`

---

### 3.2 `attendance`

Daily attendance records per user.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `user_id` | TEXT | → `users.id` |
| `date` | TEXT | `YYYY-MM-DD` |
| `check_in`, `check_out` | TEXT | ISO timestamps |
| `breaks` | JSONB | Break intervals |
| `short_leaves` | JSONB | Embedded short-leave segments |
| `break_start`, `break_end` | TEXT | Active break markers |
| `auto_checkout` | BOOLEAN | System closed the day |
| `working_ms`, `total_break_ms` | BIGINT / NUMERIC | Duration metrics |
| `status` | TEXT | Day status label |
| `late` | BOOLEAN | Late flag |

Used for dashboards, payroll calculations, late alerts, and Reports.

---

### 3.3 `leave_requests`

Multi-day leave applications.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `user_id` | TEXT | → `users.id` |
| `emp_name` | TEXT | Denormalized display name |
| `type` | TEXT | e.g. Annual, Sick, Unpaid |
| `from_date`, `to_date` | TEXT | Date range |
| `days` | NUMERIC | Total days |
| `note` | TEXT | Reason |
| `status` | TEXT | `pending` / `approved` / `rejected` |
| `submitted` | TEXT | Timestamp string |
| `paid_days`, `unpaid_days` | NUMERIC | Pay split |
| `pay_tag` | TEXT | `Paid` / `Unpaid` |

---

### 3.4 `short_leave_requests`

Partial-day leave (hours/minutes within a shift).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `user_id` | TEXT | |
| `emp_name` | TEXT | |
| `date` | TEXT | |
| `from_time`, `to_time` | TEXT | Display times |
| `start_iso`, `end_iso` | TEXT | Absolute range |
| `minutes` | INTEGER | Duration |
| `reason` | TEXT | |
| `status` | TEXT | pending / approved / rejected |
| `submitted` | TEXT | |

Approved short leave can be applied onto attendance records in the UI.

---

### 3.5 `announcements`

Company-wide posts.

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `title` | TEXT |
| `body` | TEXT |
| `date` | TEXT |
| `author` | TEXT |

Creating an announcement typically also creates **notifications** (and optional emails) for staff.

---

### 3.6 `payroll`

Salary slips stored as JSON documents.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `user_id` | TEXT | |
| `month` | TEXT | `YYYY-MM` |
| `data` | JSONB | Full slip: basic, net, deductions, bank snapshot, status, etc. |

Bootstrap returns `payroll` as an array of the `data` objects (plus identifying fields as stored by the mapper).

---

### 3.7 `company_settings`

Singleton configuration row.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Always `1` |
| `office_start` | TEXT | Default office start |
| `grace_minutes` | INTEGER | Global grace default |
| `currency` | TEXT | e.g. `PKR` |

---

### 3.8 `policies`

HR policy library.

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `title` | TEXT |
| `category` | TEXT |
| `body` | TEXT |
| `version` | TEXT |
| `updated_at`, `created_at` | TEXT |
| `updated_by` | TEXT |

---

### 3.9 `assets`

Company equipment inventory.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `asset_type` | TEXT | |
| `serial_number` | TEXT | |
| `condition` | TEXT | |
| `remarks` | TEXT | |
| `assigned_to` | TEXT | → `users.id` (nullable) |
| `assigned_date`, `return_date` | TEXT | |
| `status` | TEXT | assigned / available / etc. |
| `updated_at` | TEXT | |

---

### 3.10 `holidays`

Company holiday calendar.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `title` | TEXT | |
| `date` | TEXT | `YYYY-MM-DD` |
| `type` | TEXT | `public` or `optional` |

**Seed:** Pakistani public holidays for 2026 (Pakistan Day, Labour Day, Independence Day, Eid ul Fitr, Eid ul Adha) when missing.

Affects attendance status (public holiday) and working-day counts for leave/payroll/reports.

---

### 3.11 `notifications`

In-app notification inbox.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `user_id` | TEXT | Recipient |
| `title` | TEXT | |
| `body` | TEXT | |
| `type` | TEXT | `announcement`, `policy`, `leave`, `warning`, … |
| `read` | BOOLEAN | |
| `created_at` | TEXT | ISO |
| `link` | TEXT | Client route id, e.g. `myprofile` |

---

### 3.12 `warnings`

Formal employee warnings / notices.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `user_id` | TEXT | Employee |
| `type` | TEXT | `verbal` / `written` / `final` |
| `reason` | TEXT | |
| `date` | TEXT | Issued date |
| `issued_by` | TEXT | Admin name |
| `acknowledged` | BOOLEAN | Employee confirmation |

Display labels: Verbal Warning, Written Warning, Final Warning.

---

### 3.13 `roles`

RBAC definition loaded into the SPA.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | Matches role name key |
| `name` | TEXT UNIQUE | Display name |
| `permissions` | JSONB | Array of permission strings |

#### Seeded roles

**HR Admin** — full operational HR (people, executives, payroll manage, assets manage, company settings, announcements/policies manage, attendance reports, approvals, …).

**Executive** — oversight of people/HR Admin workflows, view payroll, manage announcements/policies, attendance reports, approvals; **no** `manage_employees` / `manage_payroll` / `manage_executives` / `manage_company_settings` / `manage_assets`.

**Manager** — team-oriented view: attendance reports, leave/short-leave approval, view policies/assets/announcements/payroll; no people management.

**Employee** — self-service: dashboard, own attendance, leave, policies, assets, announcements, payroll (own slips).

Permission strings include (non-exhaustive):  
`view_dashboard`, `view_people`, `manage_employees`, `manage_executives`, `manage_hr_admin`, `view_attendance`, `view_attendance_reports`, `approve_short_leave`, `approve_leave`, `view_leave`, `view_policies`, `manage_policies`, `view_assets`, `view_all_assets`, `manage_assets`, `view_announcements`, `manage_announcements`, `manage_company_settings`, `view_payroll`, `manage_payroll`.

Seeds use `ON CONFLICT (id) DO UPDATE` so permission lists refresh when schema is re-applied.

---

## 4. Relationships (logical)

| From | To | Via | Meaning |
|------|----|-----|---------|
| attendance | users | `user_id` | Who checked in |
| leave_requests | users | `user_id` | Leave applicant |
| short_leave_requests | users | `user_id` | Short leave applicant |
| payroll | users | `user_id` | Slip owner |
| notifications | users | `user_id` | Inbox owner |
| warnings | users | `user_id` | Warning subject |
| assets | users | `assigned_to` | Current holder |

Org-wide tables (`announcements`, `policies`, `holidays`, `company_settings`, `roles`) are not user-scoped.

---

## 5. Data management practices

1. **Schema evolution** — add `CREATE TABLE IF NOT EXISTS` / `ALTER` carefully in `schema.sql`; restart API to apply.
2. **Backups** — use standard PostgreSQL dumps (`pg_dump adforce_hr`).
3. **Sync caution** — PUT replace-all deletes then re-inserts; concurrent editors can overwrite each other (single-tenant HR portal assumption).
4. **Null safety** — frontend sanitizers filter bad rows; reports/pages guard with `(arr \|\| []).filter(x => x && …)`.
5. **Passwords** — never store new passwords as plain text; migration hashes legacy rows at startup.

---

## 6. Connection string

```
postgresql://USER:PASSWORD@HOST:5432/adforce_hr
```

Configured as `DATABASE_URL` in `server/.env`.

---

## 7. Related docs

- [Backend](./BACKEND.md) — how the API reads/writes these tables
- [Implementation Guide](./IMPLEMENTATION-GUIDE.md) — creating the database
- [Role docs](./README.md) — how permissions map to features
