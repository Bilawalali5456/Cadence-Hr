# Cadence HR

HR Management System for **Adforce Solutions**.

## Project Overview

- Full HRMS: biometric attendance, leave, short leave, payroll, policies, announcements, assets, and warnings
- Role-based portals for executives, HR, managers, and employees
- Live at: [https://hrms.adforcesolutions.com](https://hrms.adforcesolutions.com)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite 7 |
| Backend | Node.js + Express |
| Database | PostgreSQL (Docker) |
| Biometric | ZKTeco SenseFace 2A (ADMS Push) |
| VPS | Hostinger |
| Process | PM2 + Nginx |

## Project Structure

```
src/                 Frontend React app
src/api.js           All API client functions
src/utils.js         Business logic & helpers
src/pages/           Page components
src/components/      Shared UI components
server/index.js      Main Express server
server/lib/          Shared server logic
server/routes/       Per-module REST routes
server/scripts/      Utility / migration scripts
server/schema.sql    Database schema
```

## Environment Setup

Create `server/.env` (never commit real secrets):

```env
DATABASE_URL=postgresql://USER:PASS@localhost:PORT/DB_NAME
PORT=4000
SMTP_HOST=smtp.hostinger.com
SMTP_USER=your@email.com
SMTP_PASS=your_password
SMTP_FROM=your@email.com
APP_URL=https://hrms.adforcesolutions.com
```

## Deploy

On the VPS (`/home/adforce-hr/`):

```bash
chmod +x deploy.sh   # only once
./deploy.sh          # every deploy
```

`deploy.sh` resets local changes, pulls `main`, builds the frontend with Vite, and restarts PM2.

## Database Backup

- Auto backup: every night at **2:00 AM** via cron
- Location: `/home/adforce-hr/backups/`
- Retention: last **30 days** kept automatically

## Roles

| Role | Access | Attendance tracked |
|------|--------|--------------------|
| Executive | Highest authority; overrides HR; manages HR Admin | No |
| HR Admin | Full HR access (people, payroll, policies, biometric, settings) | No |
| HR Employee | Same admin powers as HR Admin | Yes (biometric) |
| Manager | Team leave approvals; basic portal | Yes (biometric) |
| Employee | Basic portal (attendance, leave, payslips, policies) | Yes (biometric) |

## Attendance Rules

- **Check-in window:** 11:00 AM PKT onwards
- **Dead zone:** 5:00 AM – 10:59 AM (scans ignored for check-in)
- **Late grace:** 15 minutes after shift start
- **Early leave grace:** 20 minutes before shift end
- **Missing checkout:** counted as Present (hours estimated to shift end)
- **WFH:** portal check-in / check-out on approved WFH leave days

Timezone: **Asia/Karachi (PKT = UTC+5)**.

## Critical — Do Not Touch

| Path | Why |
|------|-----|
| `server/routes/adms.js` | ZKTeco device communication |
| `server/lib/auth.js` | Session authentication |
| `/iclock/*` endpoints | Device ADMS push protocol |

Changing these can break biometric sync or login for the whole company.

## Database Access

```bash
docker exec $(docker ps --format '{{.Names}}' | grep -i postgres) \
  psql -U adforce_admin adforce_hr -c "YOUR SQL HERE;"
```

## PM2 Commands

```bash
pm2 status
pm2 restart all
pm2 logs --lines 20
pm2 logs --err
```
