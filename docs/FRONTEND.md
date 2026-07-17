# Frontend Documentation

This document describes the client application for **Adforce HR**: technologies, structure, routing, state, and major UI modules.

---

## 1. Stack overview

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI library | **React 19** | Component-based SPA |
| Build tool | **Vite 7** | Dev server, HMR, production bundling |
| Language | **JavaScript (ES modules)** | Application code under `src/` |
| Styling | **Tailwind CSS (CDN)** | Utility classes loaded from `index.html` |
| Icons | **lucide-react** | Sidebar and action icons |
| Charts | **recharts** | Reports / analytics charts |
| Fonts | **Inter** (Google Fonts) | Global UI typography |
| HTTP | Browser `fetch` | Calls `/api/*` (proxied in dev) |

There is **no React Router**. Navigation is a `route` string in `App.jsx` that mounts the matching page component.

---

## 2. Project layout (frontend)

```
src/
├── main.jsx                 # React root mount
├── App.jsx                  # Shell, NAV, bootstrap, sync, routes
├── api.js                   # API helpers + sanitizers
├── utils.js                 # RBAC, attendance, leave, payroll helpers
├── brand.jsx                # Brand colors + AdforceLogo
├── notifications.js         # In-app notification builders + emails
├── components/
│   ├── ui.jsx               # Pill, Card, Modal, inputs, buttons
│   ├── EmployeeForm.jsx     # Shared employee create/edit form
│   ├── EmployeeShiftPanel.jsx # Check-in / break / checkout card
│   ├── IssueWarningModal.jsx  # Issue verbal/written/final warning
│   └── NotificationBell.jsx   # Header notification dropdown
└── pages/                   # Feature screens (see below)
```

Static assets live in `public/` (logos). Production build output is `dist/`, served by the Express server.

---

## 3. Entry and configuration

### `index.html`
- Mounts `#root`
- Loads Tailwind CDN and Inter
- Sets title **Adforce HR** and favicon

### `vite.config.js`
- `@vitejs/plugin-react` for JSX
- Dev proxy: `/api` → `http://localhost:4000`
- Avoids file-watcher issues on Windows logo PNGs

### `src/main.jsx`
- Renders `<App />` into the DOM

---

## 4. Application shell (`App.jsx`)

### Boot sequence
1. Show “Connecting to database…” while `GET /api/bootstrap` runs
2. On failure, show DB error + retry
3. If no session → `LoginPage`
4. If `currentUser.firstLogin` → `ForcePasswordChange`
5. Otherwise render sidebar + header + active page

### Client state (React `useState`)
Loaded once from bootstrap, then kept in memory:

| State | Source collection |
|-------|-------------------|
| `users` | users |
| `attendance` | attendance |
| `leaveRequests` | leave |
| `shortLeaveRequests` | shortLeave |
| `announcements` | announcements |
| `payroll` | payroll |
| `policies` | policies |
| `assets` | assets |
| `holidays` | holidays (+ localStorage cache) |
| `notifications` | notifications |
| `warnings` | warnings |
| `roles` | roles |
| `company` | company |
| `session` | `localStorage` key `adforce-hr-session` |

After the first successful load (`loadedRef`), each collection syncs back with `PUT /api/{collection}` when it changes (`apiSave`).

### Session
- Stored as `{ userId }` in `localStorage`
- Temporary passwords are **not** persisted in session after first-login flow

---

## 5. Navigation

Sidebar items are defined in the `NAV` array. Visibility rules:

| Rule | Behavior |
|------|----------|
| `roles: ["HR Admin", "Executive"]` | Shown only for those roles (Reports) |
| `id === "myprofile"` | Employee / Manager only |
| `permission: null` | Always visible (Holidays, Settings) |
| `permission: "..."` | Shown if `can(role, permission, roles)` is true |

### Routes / pages

| Route id | Page | Typical audience |
|----------|------|------------------|
| `home` | Dashboard | All (content differs by role) |
| `people` | PeoplePage | HR Admin, Executive |
| `executives` | ExecutivesPage | HR Admin |
| `attendance` | AttendancePage | All with attendance permission |
| `shortleave` | ShortLeavePage | Leave viewers / approvers |
| `payroll` | PayrollPage | Payroll viewers / managers |
| `leave` | LeavePage | Leave viewers / approvers |
| `reports` | ReportsPage | HR Admin, Executive |
| `holidays` | HolidaysPage | All (edit: HR Admin) |
| `policies` | PoliciesPage | Policy viewers / managers |
| `assets` | AssetsPage | Asset viewers / managers |
| `announcements` | AnnouncementsPage | Announcement viewers / managers |
| `myprofile` | MyProfilePage | Employee, Manager |
| `settings` | SettingsPage | All |

---

## 6. Libraries and how they are used

### React 19
- Functional components and hooks (`useState`, `useEffect`, `useRef`, `useMemo`)
- No Redux / Zustand — state lives in `App` and is passed as props

### Vite
- `npm run dev` — local UI with API proxy
- `npm run build` — outputs optimized bundle to `dist/`

### lucide-react
- Navigation icons (`LayoutDashboard`, `Users`, `BarChart3`, etc.)
- Inline actions (edit, delete, warning, bell)

### recharts
Used on **Reports** (`ReportsPage.jsx`):
- `ResponsiveContainer`, `BarChart`, `PieChart`, `Bar`, `Pie`, `Cell`, `XAxis`, `YAxis`, `Tooltip`, `Legend`
- Tabs: Attendance | Leave | Headcount | Payroll

### Tailwind (CDN)
- Layout, spacing, responsive grids
- Brand accents also use CSS variables / hex from `brand.jsx` (`#001520`, `#c70b07`)

---

## 7. Shared UI (`components/ui.jsx`)

Reusable primitives:
- **Pill** — status badges (green / amber / red / orange / slate / blue)
- **Avatar** — initials circle
- **Card** — white bordered panel
- **Modal** — dialogs
- **TextInput / SelectInput / PwInput** — form controls
- **Btn** — primary / ghost / danger buttons
- **ErrBox / OkBox** — feedback messages
- **STitle** — section titles inside cards

---

## 8. Client API layer (`api.js`)

| Helper | Purpose |
|--------|---------|
| `apiBootstrap()` | `GET /api/bootstrap` |
| `apiSave(collection, data)` | `PUT /api/{collection}` |
| `apiLogin` / `apiChangePassword` | Auth |
| `apiSendCredentials` | Welcome / reset emails |
| `apiSendNotificationEmail` | Announcement / policy emails |
| `apiSendWarningEmail` | Warning notice emails |
| `apiFetchNotifications` | Poll notifications |
| `apiMarkNotificationRead` / `apiMarkAllNotificationsRead` | Read state |
| `sanitize*` helpers | Drop null/invalid rows before React state |

---

## 9. Domain helpers (`utils.js`)

Frontend business logic (not server-side):
- **RBAC:** `can`, `isStaffRole`, `isHrAdminRole`, `isExecutiveRole`
- **Shifts:** check-in windows, grace, breaks, auto-checkout
- **Attendance status:** On Time / Late / Half Day / Absent / Weekend / Public Holiday
- **Leave:** paid/unpaid split, working-day enumeration
- **Payroll month helpers:** present / late / leave days in month
- **Sensitive fields:** CNIC normalize / encrypt helpers for forms

---

## 10. Notifications (`notifications.js`)

Creates in-app notification objects and optionally triggers emails for:
- Announcements
- New policies
- Leave approve / reject
- Warnings / notices

The header **NotificationBell** filters by `currentUser.id`, supports mark-one / mark-all read, and navigates via `link` (e.g. `myprofile`, `leave`).

---

## 11. Feature modules (pages)

| Page | Responsibility |
|------|----------------|
| LoginPage | Role card + email/password login |
| ForcePasswordChange | Mandatory password change on first login |
| Dashboard | Welcome, check-in (staff/HR), ops KPIs, late alerts, short-leave queue |
| PeoplePage | Roster, profile slide-over, CRUD, credentials reset, warnings |
| ExecutivesPage | Create/manage Executive accounts |
| AttendancePage | Personal history vs org reports |
| ShortLeavePage | Partial-day leave requests |
| LeavePage | Multi-day leave with paid/unpaid |
| PayrollPage | Generate / view / mark paid salary slips |
| ReportsPage | Charts and summary tables |
| HolidaysPage | Company holiday calendar |
| PoliciesPage | Policy library |
| AssetsPage | Equipment inventory and assignment |
| AnnouncementsPage | Company-wide posts |
| MyProfilePage | Self-service profile, warnings acknowledge, password |
| SettingsPage | Account prefs; company settings (HR Admin) |

---

## 12. Branding

`brand.jsx` defines:
- Primary dark: `#001520`
- Accent red: `#c70b07`
- Supporting light/border tokens
- `AdforceLogo` component for sidebar and login

Emails and warning subjects use **Adforce Solutions / Adforce HR** branding on the server.

---

## 13. Development commands (frontend)

```bash
npm install
npm run dev          # Vite on default port, proxies /api
npm run build        # Production bundle → dist/
npm run preview      # Preview dist locally
```

For a working app locally, the Express API must also be running (see [Implementation Guide](./IMPLEMENTATION-GUIDE.md)).
