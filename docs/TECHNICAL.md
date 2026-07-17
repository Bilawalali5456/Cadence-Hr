# Technical Reference

Complete list of technologies, packages, dependencies, and external services used by **Adforce HR**, with purpose and integration notes.

---

## 1. System architecture (integration map)

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                 │
│  React 19 + Vite bundle + Tailwind CDN + lucide + charts │
│  localStorage (session, holiday cache)                   │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS / HTTP  /api/*
┌───────────────────────────▼─────────────────────────────┐
│  Node.js + Express                                        │
│  bcryptjs · dotenv · cors · nodemailer · pg               │
│  Serves API + production static (dist/)                   │
└───────────────┬───────────────────────────┬───────────────┘
                │                           │
                ▼                           ▼
        PostgreSQL                    SMTP provider
        (adforce_hr)                  (Hostinger, etc.)
```

---

## 2. Frontend packages (`package.json`)

| Package | Version (range) | Purpose | Integration |
|---------|-----------------|---------|-------------|
| **react** | `^19.1.0` | UI components & hooks | Entire `src/` |
| **react-dom** | `^19.1.0` | DOM renderer | `main.jsx` → `createRoot` |
| **lucide-react** | `^0.525.0` | SVG icon set | NAV, buttons, empty states |
| **recharts** | `^3.9.2` | Charts library | `ReportsPage.jsx` only |
| **vite** | `^7.0.4` (dev) | Bundler & dev server | `vite.config.js`, scripts |
| **@vitejs/plugin-react** | `^4.6.0` (dev) | JSX / Fast Refresh | Vite plugin |

### Frontend tools not installed via npm
| Tool | How loaded | Purpose |
|------|------------|---------|
| **Tailwind CSS** | CDN in `index.html` | Utility styling |
| **Inter font** | Google Fonts link | Typography |
| **Browser Fetch API** | Native | All HTTP to `/api` |

---

## 3. Backend packages (`server/package.json`)

| Package | Version (range) | Purpose | Integration |
|---------|-----------------|---------|-------------|
| **express** | `^4.19.2` | HTTP server, routing, static files | `server/index.js` |
| **pg** | `^8.12.0` | PostgreSQL connection pool | Queries + transactions |
| **bcryptjs** | `^2.4.3` | Password hashing | Login, change-password, user save, startup migration |
| **nodemailer** | `^7.0.13` | SMTP client | `server/mail.js` |
| **dotenv** | `^16.4.5` | Environment loading | Reads `server/.env` at boot |
| **cors** | `^2.8.5` | Cross-Origin Resource Sharing | Allows browser clients during dev |

---

## 4. External services

### 4.1 PostgreSQL
- **Role:** Primary datastore for all HR collections and RBAC
- **Connection:** `DATABASE_URL`
- **Lifecycle:** Schema applied on setup and every server start
- **Docs:** [DATABASE.md](./DATABASE.md)

### 4.2 SMTP (email)
- **Role:** Outbound transactional email
- **Library:** Nodemailer
- **Used for:** employee credentials, password resets, announcements/policies emails, warning notices
- **Config:** `SMTP_*` and `APP_URL` in `.env`

### 4.3 Reverse proxy / hosting (deployment)
Not bundled; commonly paired with:
- Nginx / Caddy / IIS — TLS termination
- PM2 / systemd / Windows Service — process supervision
- Optional CDN for static assets (usually unnecessary; Express serves `dist`)

---

## 5. Runtime & language

| Item | Detail |
|------|--------|
| Language | JavaScript (ES modules, `"type": "module"`) |
| Frontend module system | Vite ESM |
| Backend module system | Node ESM (`import` / `export`) |
| TypeScript | Not used |

---

## 6. Key internal modules

| Module | Layer | Responsibility |
|--------|-------|----------------|
| `src/App.jsx` | Frontend | App shell, bootstrap, sync effects, routing |
| `src/api.js` | Frontend | Thin HTTP client for all endpoints |
| `src/utils.js` | Frontend | RBAC + attendance/leave/payroll domain logic |
| `src/notifications.js` | Frontend | Notification object factory + email fan-out |
| `src/brand.jsx` | Frontend | Brand tokens and logo |
| `server/index.js` | Backend | Routes, mappers, schema ensure, static host |
| `server/mail.js` | Backend | Email HTML/text builders + send |
| `server/schema.sql` | Database | DDL + seeds |
| `server/setup-db.js` | Ops | Create DB + apply schema |

---

## 7. Authentication technology summary

| Concern | Implementation |
|---------|----------------|
| Password hashing | bcryptjs (cost 10) |
| Transport auth | Email + password over HTTPS (production) |
| Session | Client `localStorage` user id only |
| Authorization | Role permissions JSON from DB → `can()` in UI |
| First login | `first_login` flag + ForcePasswordChange screen |

No OAuth, SAML, or JWT is used in the current codebase.

---

## 8. Data interchange formats

| Format | Where |
|--------|-------|
| JSON over HTTP | All `/api` requests/responses |
| JSONB in PostgreSQL | skills, shift, payroll.data, roles.permissions, breaks |
| ISO date strings | `YYYY-MM-DD` for dates; ISO timestamps for check-in/out |
| CamelCase ↔ snake_case | Mapped at API boundary |

---

## 9. Frontend–backend contract highlights

| Pattern | Detail |
|---------|--------|
| Single bootstrap | One GET loads the portal |
| Optimistic UI | State updates immediately; PUT sync follows |
| Replace-all writes | Entire collection resent |
| Polling | Notifications refreshed ~every 60s while logged in |
| Auto-checkout | Client interval applies overdue checkouts using utils |

---

## 10. Reporting / analytics stack

| Piece | Role |
|-------|------|
| **recharts** | Bar and pie charts |
| **ReportsPage** | Aggregations computed in-browser from props |
| **utils** | `isLateCheckIn`, `enumerateWorkingDays`, leave paid/unpaid helpers |

No separate analytics database or BI tool is required.

---

## 11. Asset & branding files

| File | Purpose |
|------|---------|
| `public/adforce-logo.png` | Primary logo |
| `public/adforce-logo-dark.png` | Alternate logo |
| `brand.jsx` colors | `#001520` (dark), `#c70b07` (red) |

---

## 12. Development tooling

| Tool | Use |
|------|-----|
| Vite HMR | Instant UI reload |
| `node --watch` | API reload on file change |
| Vite `/api` proxy | Avoid CORS friction in local dev |
| `scripts/split-monolith.mjs` | Historical helper for splitting legacy monolith (maintenance) |

---

## 13. Security-related packages & practices

| Item | Notes |
|------|-------|
| bcryptjs | Industry-standard password hashing |
| dotenv | Keeps secrets out of source |
| .gitignore | Should exclude `server/.env`, `node_modules`, optionally `dist` |
| CORS | Enabled for API flexibility; lock down in hardened deployments if needed |
| Email validation | Basic checks before SMTP send |

---

## 14. Version pinning guidance

- Prefer installing from the committed `package-lock.json` / `server/package-lock.json` for reproducible builds.
- After upgrading major versions (React, Vite, Express, recharts), run `npm run build` and smoke-test login, attendance, payroll, and reports.

---

## 15. Related documentation

- [Frontend](./FRONTEND.md)
- [Backend](./BACKEND.md)
- [Database](./DATABASE.md)
- [Implementation Guide](./IMPLEMENTATION-GUIDE.md)
