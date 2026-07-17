# Backend Documentation

This document describes the **Adforce HR** server: stack, architecture, APIs, authentication, email, and how data is persisted.

---

## 1. Stack overview

| Technology | Package | Purpose |
|------------|---------|---------|
| Runtime | **Node.js** | Server process |
| Framework | **Express 4** | HTTP API + static SPA hosting |
| Database driver | **pg** | PostgreSQL client pool |
| Auth hashing | **bcryptjs** | Password hash / compare |
| Email | **nodemailer** | SMTP outbound mail |
| Config | **dotenv** | Load `server/.env` |
| CORS | **cors** | Cross-origin support for API |

Location: `server/` (`adforce-hr-server`).

---

## 2. Architecture

```
Browser (React SPA)
        │  /api/*
        ▼
Express (server/index.js)
   ├── Auth routes (login, change-password)
   ├── Bootstrap + collection PUT sync
   ├── Notification helpers
   ├── Email endpoints → mail.js → SMTP
   ├── ensureSchema() on startup (schema.sql)
   └── express.static(dist) + SPA fallback
        │
        ▼
 PostgreSQL (adforce_hr)
```

In **production**, one Node process serves both the API and the built frontend from `../dist`.

In **development**, Vite serves the UI and proxies `/api` to `localhost:4000`.

---

## 3. Startup sequence

1. Load environment from `server/.env`
2. Create PostgreSQL pool from `DATABASE_URL`
3. `ensureSchema()` — execute `schema.sql` (idempotent `CREATE IF NOT EXISTS` + role seeds)
4. `migratePlaintextPasswords()` — hash any remaining plain-text passwords with bcrypt
5. Listen on `PORT` (default **4000**)
6. Log health URL: `/api/health`

---

## 4. Data sync model

The app uses a **full-replace sync** for most collections:

1. Client loads everything via `GET /api/bootstrap`
2. Client mutates React state
3. Client calls `PUT /api/{collection}` with the **entire array**
4. Server runs `replaceAll`:
   - `BEGIN`
   - `DELETE FROM table`
   - insert each row
   - `COMMIT`

| Client collection | HTTP path | DB table |
|-------------------|-----------|----------|
| users | `PUT /api/users` | `users` |
| attendance | `PUT /api/attendance` | `attendance` |
| leave | `PUT /api/leave` | `leave_requests` |
| short-leave | `PUT /api/short-leave` | `short_leave_requests` |
| announcements | `PUT /api/announcements` | `announcements` |
| payroll | `PUT /api/payroll` | `payroll` |
| company | `PUT /api/company` | `company_settings` |
| policies | `PUT /api/policies` | `policies` |
| assets | `PUT /api/assets` | `assets` |
| holidays | `PUT /api/holidays` | `holidays` |
| notifications | `PUT /api/notifications` | `notifications` |
| warnings | `PUT /api/warnings` | `warnings` |

**Notes**
- Users are returned from bootstrap **without passwords** (`userToSafeJs`)
- On user save, the server carefully preserves/hashes passwords (`resolvePasswordForSave`)
- Payroll stores rich slip JSON in a `data` JSONB column
- Company settings is a single-row upsert (`id = 1`)

CamelCase in JSON ↔ snake_case in SQL is handled by mapper functions (`userToJs`, `attToJs`, `warningToJs`, etc.).

---

## 5. API reference

### Health & bootstrap

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | `{ ok, database }` connectivity check |
| `GET` | `/api/bootstrap` | Full app payload in one response |

**Bootstrap JSON keys:**  
`users`, `attendance`, `leave`, `shortLeave`, `announcements`, `payroll`, `company`, `policies`, `assets`, `roles`, `holidays`, `notifications`, `warnings`

### Authentication

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/login` | `{ email, password }` | Validates credentials; returns safe user |
| `POST` | `/api/change-password` | `{ userId, currentPassword, newPassword }` | Updates hash; clears first-login flags |

**Login behavior**
- Accepts bcrypt hashes (`$2a$` / `$2b$`)
- Falls back to legacy plain-text / `temp_password` for migration
- Does not return password fields to the client

**Password rules (change-password)**
- Minimum length enforced server-side (8+)
- Client also enforces uppercase + digit for UX

### Notifications

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/notifications` | List all notifications |
| `PUT` | `/api/notifications` | Full sync |
| `POST` | `/api/notifications/read` | `{ id }` mark one read |
| `POST` | `/api/notifications/read-all` | `{ userId }` mark all read |

### Email

| Method | Path | Required fields | Purpose |
|--------|------|-----------------|---------|
| `POST` | `/api/send-credentials` | `to`, `email`, `password` | Welcome or password-reset email |
| `POST` | `/api/send-notification-email` | `to`, `subject` | Generic branded notification |
| `POST` | `/api/send-warning-email` | `to`, `warningType`, `reason` | Formal warning notice |

### Collection sync (PUT)

See table in §4. All return `{ ok: true }` on success or `500` with `{ error }`.

### Static SPA

Non-API routes serve `dist/index.html` so client-side routing works in production.

---

## 6. Authentication & security

### Password storage
- Algorithm: **bcrypt** via `bcryptjs` (cost factor **10**)
- Columns: `users.password`, optional `users.temp_password`
- Flag: `users.first_login` forces password change in the UI

### Session model
- **Stateless** relative to the API: no JWT/session cookie on the server
- Browser keeps `{ userId }` in `localStorage`
- Authorization for UI actions is enforced primarily on the **frontend** using the `roles` permissions from bootstrap

### Sensitive fields
- CNIC and similar values may be stored encrypted client-side (`cnic_enc`) before sync
- Bootstrap never sends password hashes to the browser after login flows strip them

---

## 7. Email service (`mail.js`)

Uses Nodemailer with SMTP settings from env:

| Variable | Role |
|----------|------|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | Usually `465` |
| `SMTP_SECURE` | `true` for TLS |
| `SMTP_USER` / `SMTP_PASS` | Auth |
| `SMTP_FROM` | From header (falls back to `SMTP_USER`) |
| `APP_URL` | Portal link in email CTAs |

### Email types
1. **Credentials** — new account or password reset; includes temporary password
2. **Notification** — announcements / policies style body
3. **Warning** — subject `Adforce Solutions — {Warning Type} Issued`; asks employee to acknowledge in My Profile

HTML templates are branded Adforce layouts generated in `mail.js`.

---

## 8. Database setup utility

`server/setup-db.js` (npm script `setup`):
- Connects to PostgreSQL
- Creates database `adforce_hr` if missing
- Applies `schema.sql`

Use once on a new environment: `npm run server:setup` from the repo root (or `npm run setup` inside `server/`).

---

## 9. Environment variables

See `server/.env.example`:

```env
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/adforce_hr
PORT=4000
NODE_ENV=production
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=hr@example.com
SMTP_PASS=secret
SMTP_FROM=Adforce HR <hr@example.com>
APP_URL=https://hr.adforcesolutions.com
```

Never commit real `.env` files.

---

## 10. Server scripts

| Script | Command | Use |
|--------|---------|-----|
| `npm start` | `node index.js` | Production |
| `npm run dev` | `node --watch index.js` | Local auto-reload |
| `npm run setup` | `node setup-db.js` | Create DB + schema |

From repo root:
- `npm run server` → server `dev`
- `npm run server:setup` → setup
- `npm run server:install` → install server deps

---

## 11. Error handling

- Route handlers wrap logic in `try/catch`
- Failures log to console and return JSON `{ error: message }` with appropriate status (`400` / `500`)
- Schema failure on startup exits the process (`process.exit(1)`)

---

## 12. Related docs

- [Database](./DATABASE.md) — tables and relationships
- [Technical Reference](./TECHNICAL.md) — package purposes
- [Implementation Guide](./IMPLEMENTATION-GUIDE.md) — setup steps
