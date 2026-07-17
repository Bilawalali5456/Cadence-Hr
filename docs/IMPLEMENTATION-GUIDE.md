# Implementation Guide

Step-by-step guide to set up **Adforce HR** from scratch on a developer machine or server.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js** | v18+ recommended (v20+ ideal) |
| **npm** | Comes with Node |
| **PostgreSQL** | 14+ recommended, running locally or remotely |
| **SMTP account** | Optional for local UI testing; required for credential/warning emails |
| **Git** | To clone the repository |

---

## 1. Obtain the project

```bash
git clone <your-repo-url> "Cadence Hr"
cd "Cadence Hr"
```

Or copy the project folder onto the machine.

---

## 2. Install frontend dependencies

From the **repository root**:

```bash
npm install
```

This installs React, Vite, lucide-react, recharts, and related packages.

---

## 3. Install backend dependencies

```bash
npm run server:install
```

Or:

```bash
cd server
npm install
cd ..
```

Installs Express, pg, bcryptjs, nodemailer, dotenv, cors.

---

## 4. Configure PostgreSQL

1. Ensure PostgreSQL is installed and the service is running.
2. Note the superuser password (often the `postgres` user).
3. You do **not** need to create tables manually — the setup script and startup schema handle that.

---

## 5. Create environment file

```bash
cd server
copy .env.example .env
```

On macOS/Linux: `cp .env.example .env`

Edit `server/.env`:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/adforce_hr
PORT=4000
NODE_ENV=development

SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your@email.com
SMTP_PASS=your-smtp-password
SMTP_FROM=Adforce HR <your@email.com>
APP_URL=http://localhost:5173
```

For production, set `APP_URL` to the public portal URL (e.g. `https://hr.adforcesolutions.com`) and `NODE_ENV=production`.

---

## 6. Create database and apply schema

From the **repository root**:

```bash
npm run server:setup
```

This runs `server/setup-db.js`, which:
- Creates database `adforce_hr` if it does not exist
- Applies `server/schema.sql` (tables, role seeds, default admin if empty, holiday seeds)

---

## 7. Run in development (two processes)

**Terminal A — API**

```bash
npm run server
```

API listens on `http://localhost:4000`.  
Check: `http://localhost:4000/api/health`

**Terminal B — Frontend**

```bash
npm run dev
```

Vite serves the UI (typically `http://localhost:5173`) and proxies `/api` to port 4000.

---

## 8. First login

If the users table was empty at seed time, use the default HR Admin:

| Field | Value |
|-------|--------|
| Role card | **HR Admin** |
| Email | `admin@adforce.com` |
| Password | `Admin@123` |

**Immediately change this password** after first login (Settings or forced change if `first_login` is set).

---

## 9. Production build & single-process deploy

1. Build the frontend:

```bash
npm run build
```

Output: `dist/`

2. Set production env in `server/.env` (`NODE_ENV=production`, real `DATABASE_URL`, SMTP, `APP_URL`).

3. Start the server from `server/`:

```bash
cd server
npm start
```

Express serves:
- `/api/*` — API
- `/*` — static files from `../dist` + SPA fallback

Point your reverse proxy (Nginx, IIS, Caddy, etc.) at `PORT` (default 4000), or bind the process behind HTTPS termination.

### Suggested production checklist
- [ ] Strong unique password for default admin (or delete/recreate)
- [ ] PostgreSQL backups scheduled
- [ ] SMTP tested (`send-credentials` after adding an employee)
- [ ] `APP_URL` matches the public hostname
- [ ] Firewall only exposes reverse proxy ports
- [ ] Process manager (PM2, systemd, Windows Service) keeps Node alive

---

## 10. Verify core flows

| Flow | How to test |
|------|-------------|
| Bootstrap | Login succeeds; sidebar loads |
| Add employee | People → Add → email received (if SMTP set) |
| First login | Employee forced to change password |
| Attendance | Check-in on Home as employee |
| Leave | Submit leave → approve as HR Admin |
| Payroll | Generate slip for a month |
| Warning | Issue warning → employee sees My Profile → Warnings |
| Reports | HR Admin → Reports tabs render without crash |
| Holidays | Calendar shows seeded / custom days |

---

## 11. Common issues

### Database connection failed
- PostgreSQL service not running
- Wrong password in `DATABASE_URL`
- Database name typo (must match URL)
- Restart API after fixing `.env`

### API works but UI shows empty / errors
- Frontend not proxying (use `npm run dev`, not opening `dist` as files)
- In production, rebuild after code changes: `npm run build` then restart Node

### Emails not sending
- Verify SMTP host/port/secure flags
- Hostinger and similar often require app-specific passwords
- Check server console for `send-credentials` / `send-warning-email` errors

### Schema / new tables missing
- Restart the API so `ensureSchema()` runs
- Confirm `warnings`, `notifications`, `holidays` exist in pgAdmin / `psql`

### Port already in use
- Change `PORT` in `.env` or stop the other process

---

## 12. Project scripts reference

| Location | Script | Purpose |
|----------|--------|---------|
| Root | `npm run dev` | Vite frontend |
| Root | `npm run build` | Production frontend build |
| Root | `npm run server` | API with watch |
| Root | `npm run server:setup` | Create DB + schema |
| Root | `npm run server:install` | Install server packages |
| Server | `npm start` | Production API + static |
| Server | `npm run setup` | Same as server:setup |

---

## 13. Next reading

- [Frontend](./FRONTEND.md) — UI architecture  
- [Backend](./BACKEND.md) — API details  
- [Database](./DATABASE.md) — schema  
- [Technical Reference](./TECHNICAL.md) — dependencies  
- Role guides — how each persona uses the system  
