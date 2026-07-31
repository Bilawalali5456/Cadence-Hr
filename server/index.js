import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import bcryptjs from "bcryptjs";
import { sendCredentialsEmail, sendNotificationEmail, sendWarningEmail } from "./mail.js";
import { registerAdmsRoutes } from "./routes/adms.js";
import { registerAttendanceApi } from "./routes/attendance.js";
import { registerAttendanceRestRoutes } from "./routes/attendance-api.js";
import { registerLeaveRoutes } from "./routes/leave.js";
import { registerUsersRoutes } from "./routes/users.js";
import { registerShortLeaveRoutes } from "./routes/short-leave.js";
import { registerAnnouncementsRoutes } from "./routes/announcements.js";
import { registerPayrollRoutes } from "./routes/payroll.js";
import { registerHolidaysRoutes } from "./routes/holidays.js";
import { registerPoliciesRoutes } from "./routes/policies.js";
import { registerAssetsRoutes } from "./routes/assets.js";
import { registerWarningsRoutes } from "./routes/warnings.js";
import { registerShiftsRoutes } from "./routes/shifts.js";
import { registerCompanyRoutes } from "./routes/company.js";
import { registerRolesRoutes } from "./routes/roles.js";
import { startAttendanceSyncProcessor, syncAttendanceFromLogs } from "./lib/attendanceSync.js";
import { createDatabaseBackup } from "./lib/dbBackup.js";
import { deleteEmployeeCascade } from "./lib/deleteEmployee.js";
import {
  createSession, resolveAuthenticatedUser, extractSessionToken, revokeSession,
  revokeAllUserSessions, cleanupExpiredSessions, createRequireAuth, createRequireHrAdmin,
  HR_ADMIN_ROLES, canManageTargetRole, setSessionCookie, clearSessionCookie,
} from "./lib/auth.js";
import { karachiTimestampText, parseAttLogLine, normalizeWallClockTimestamp } from "./lib/admsHelpers.js";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const requireAuth = createRequireAuth(pool);
const requireHrAdmin = createRequireHrAdmin(pool);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "..", "dist");

const app = express();
app.disable("x-powered-by");

/* ADMS: text body parser + routes BEFORE express.json (GET cdata must not go through JSON parser) */
const admsTextParser = express.text({ type: "*/*", limit: "10mb" });
app.use("/iclock", admsTextParser);
app.use("/ICLOCK", admsTextParser);
app.use("/iClock", admsTextParser);
registerAdmsRoutes(app, pool);

app.use((req, res, next) => {
  const p = req.path || "";
  if (p.toLowerCase().startsWith("/iclock")) return next();
  return cors()(req, res, next);
});
app.use(express.json({ limit: "5mb" }));

function isBcryptHash(pw) {
  return typeof pw === "string" && (pw.startsWith("$2a$") || pw.startsWith("$2b$"));
}

function hashPasswordIfNeeded(pw) {
  if (!pw) return pw;
  if (isBcryptHash(pw)) return pw;
  return bcryptjs.hashSync(String(pw), 10);
}

/** Resolve password for user save: preserve DB hash, avoid re-hashing same plain text on every sync. */
function resolvePasswordForSave(incomingPassword, existingHash) {
  if (!incomingPassword) return existingHash || hashPasswordIfNeeded("changeme");
  if (isBcryptHash(incomingPassword)) return incomingPassword;
  if (existingHash && isBcryptHash(existingHash) && bcryptjs.compareSync(String(incomingPassword), existingHash)) {
    return existingHash;
  }
  return bcryptjs.hashSync(String(incomingPassword), 10);
}

/** Once first_login is cleared in DB, only allow re-flagging when admin issues a new temp password. */
function resolveFirstLoginForSave(u, existingFirstLogin) {
  if (existingFirstLogin[u.id] === false) {
    const plain = u.password || u.tempPassword;
    const isNewTemp = plain && !isBcryptHash(String(plain));
    if (u.firstLogin === true && isNewTemp) return true;
    return false;
  }
  return !!u.firstLogin;
}

function canViewAllAttendance(role) {
  return HR_ADMIN_ROLES.includes(role);
}

async function resolveRequestUser(req) {
  return resolveAuthenticatedUser(pool, req);
}

/* ─── Row mappers: snake_case (DB) ↔ camelCase (frontend) ─── */

const userToJs = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  password: r.password,
  role: r.role,
  title: r.title,
  dept: r.dept,
  team: r.team,
  type: r.type,
  hired: r.hired,
  salary: r.salary,
  phone: r.phone,
  status: r.status,
  leaveBalance: r.leave_balance,
  skills: r.skills || [],
  firstLogin: r.first_login,
  tempPassword: r.temp_password || undefined,
  cnicEnc: r.cnic_enc || undefined,
  maritalStatus: r.marital_status || "",
  guardianName: r.guardian_name || "",
  emergencyContactName: r.emergency_contact_name || "",
  emergencyContactPhone: r.emergency_contact_phone || "",
  emergencyContactRelation: r.emergency_contact_relation || "",
  bankName: r.bank_name || "",
  bankBranch: r.bank_branch || "",
  bankAccount: r.bank_account || "",
  bankIban: r.bank_iban || "",
  shift: r.shift || undefined,
  shiftId: r.shift_id || undefined,
});

/** Public user payload — never include password or tempPassword. */
const userToSafeJs = (r) => {
  const u = userToJs(r);
  const { password, tempPassword, ...safe } = u;
  return safe;
};

const attToJs = (r) => ({
  id: r.id,
  userId: r.user_id,
  date: r.date,
  checkIn: r.check_in,
  checkOut: r.check_out,
  lastScan: r.last_scan || null,
  breaks: r.breaks || [],
  shortLeaves: r.short_leaves || [],
  breakStart: r.break_start || null,
  breakEnd: r.break_end || null,
  autoCheckout: r.auto_checkout || false,
  workingMs: r.working_ms != null ? Number(r.working_ms) : undefined,
  totalBreakMs: r.total_break_ms != null ? Number(r.total_break_ms) : undefined,
  status: r.status || undefined,
  late: r.late || false,
  source: r.source || "manual",
  checkInMethod: r.check_in_method || null,
  checkOutMethod: r.check_out_method || null,
  lastScanMethod: r.last_scan_method || null,
  manuallyCorrected: r.manually_corrected === true,
  correctionLog: r.correction_log || [],
  lastCorrectedBy: r.last_corrected_by || null,
  lastCorrectedByRole: r.last_corrected_by_role || null,
  lastCorrectedOn: r.last_corrected_on || null,
});

const leaveToJs = (r) => ({
  id: r.id,
  userId: r.user_id,
  empName: r.emp_name,
  type: r.type,
  from: r.from_date,
  to: r.to_date,
  days: r.days,
  note: r.note,
  status: r.status,
  submitted: r.submitted,
  paidDays: r.paid_days != null ? Number(r.paid_days) : undefined,
  unpaidDays: r.unpaid_days != null ? Number(r.unpaid_days) : undefined,
  payTag: r.pay_tag || undefined,
});

const shortLeaveToJs = (r) => ({
  id: r.id,
  userId: r.user_id,
  empName: r.emp_name,
  date: r.date,
  fromTime: r.from_time,
  toTime: r.to_time,
  startIso: r.start_iso,
  endIso: r.end_iso,
  minutes: r.minutes,
  reason: r.reason,
  status: r.status,
  submitted: r.submitted,
});

const annToJs = (r) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  date: r.date,
  author: r.author,
});

const companyToJs = (r) => ({
  officeStart: r.office_start,
  graceMinutes: r.grace_minutes,
  currency: r.currency,
});

const policyToJs = (r) => ({
  id: r.id,
  title: r.title,
  category: r.category,
  body: r.body || "",
  version: r.version || 1,
  updatedAt: r.updated_at || "",
  updatedBy: r.updated_by || "",
  createdAt: r.created_at || "",
});

const assetToJs = (r) => ({
  id: r.id,
  name: r.name,
  assetType: r.asset_type,
  serialNumber: r.serial_number || "",
  condition: r.condition || "Good",
  remarks: r.remarks || "",
  assignedTo: r.assigned_to || null,
  assignedDate: r.assigned_date || "",
  returnDate: r.return_date || "",
  status: r.status || "available",
  updatedAt: r.updated_at || "",
});

const holidayToJs = (r) => ({
  id: r.id,
  title: r.title,
  date: r.date,
  type: r.type || "public",
});

const shiftToJs = (r) => ({
  id: r.id,
  name: r.name,
  graceMinutes: r.grace_minutes ?? 15,
  breakMinutes: r.break_minutes ?? 60,
  checkoutGraceMinutes: r.checkout_grace_minutes ?? 20,
  weeklySchedule: r.weekly_schedule || {},
  isDefault: r.is_default === true,
});

const roleToJs = (r) => ({
  id: r.id,
  name: r.name,
  permissions: Array.isArray(r.permissions) ? r.permissions : [],
});

const notificationToJs = (r) => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  body: r.body || "",
  type: r.type || "announcement",
  read: !!r.read,
  createdAt: r.created_at || "",
  link: r.link || "",
});

const warningToJs = (r) => ({
  id: r.id,
  userId: r.user_id,
  type: r.type || "verbal",
  reason: r.reason || "",
  date: r.date || "",
  issuedBy: r.issued_by || "",
  acknowledged: !!r.acknowledged,
});

/* ─── GET /api/bootstrap — lightweight shell data for first paint ─── */
app.get("/api/bootstrap", async (req, res) => {
  try {
    const token = extractSessionToken(req);
    let actor = null;
    if (token) {
      actor = await resolveAuthenticatedUser(pool, req);
      if (!actor) {
        return res.status(401).json({ error: "Session expired or invalid" });
      }
    }

    const currentUserPromise = actor
      ? pool.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [actor.id])
      : Promise.resolve({ rows: [] });

    const [currentUserRow, roles, company, holidays, shifts] = await Promise.all([
      currentUserPromise,
      pool.query("SELECT * FROM roles ORDER BY name"),
      pool.query("SELECT * FROM company_settings WHERE id = 1"),
      pool.query("SELECT * FROM holidays ORDER BY date"),
      pool.query("SELECT * FROM shifts ORDER BY name"),
    ]);

    res.json({
      currentUser: currentUserRow.rows[0] ? userToSafeJs(currentUserRow.rows[0]) : null,
      company: company.rows[0] ? companyToJs(company.rows[0]) : {},
      roles: roles.rows.map(roleToJs),
      holidays: holidays.rows.map(holidayToJs),
      shifts: shifts.rows.map(shiftToJs),
      actor: actor ? { id: actor.id, role: actor.role, name: actor.name, email: actor.email } : null,
    });

    // Background finalize/sync after bootstrap — do not block first paint.
    if (actor) {
      syncAttendanceFromLogs(pool).catch(err => {
        console.error("bootstrap attendance sync:", err.message);
      });
    }
  } catch (e) {
    const msg = e?.message || e?.code || String(e);
    console.error("bootstrap error:", msg);
    if (e?.cause) console.error("bootstrap cause:", e.cause);
    res.status(500).json({ error: msg });
  }
});

/* ─── Per-module GET APIs (reload-free tab refresh) ─── */

app.get("/api/leave", requireAuth, async (req, res) => {
  try {
    const actor = req.authUser;
    const { rows } = canViewAllAttendance(actor.role)
      ? await pool.query("SELECT * FROM leave_requests ORDER BY id DESC")
      : await pool.query("SELECT * FROM leave_requests WHERE user_id = $1 ORDER BY id DESC", [actor.id]);
    res.json(rows.map(leaveToJs));
  } catch (e) {
    console.error("GET /api/leave error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/short-leave", requireAuth, async (req, res) => {
  try {
    const actor = req.authUser;
    const { rows } = canViewAllAttendance(actor.role)
      ? await pool.query("SELECT * FROM short_leave_requests ORDER BY id DESC")
      : await pool.query("SELECT * FROM short_leave_requests WHERE user_id = $1 ORDER BY id DESC", [actor.id]);
    res.json(rows.map(shortLeaveToJs));
  } catch (e) {
    console.error("GET /api/short-leave error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Payroll module: served by server/routes/payroll.js

// Holidays module: served by server/routes/holidays.js

// Policies module: served by server/routes/policies.js

// Assets module: served by server/routes/assets.js

// Announcements module: served by server/routes/announcements.js

// Warnings module: served by server/routes/warnings.js

// Company module: served by server/routes/company.js

/* ─── Full-collection sync endpoints (legacy — being phased out) ─── */
async function replaceAll(table, rows, insertFn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ${table}`);
    for (const row of rows) await insertFn(client, row);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

app.put("/api/users", requireHrAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const body = Array.isArray(req.body) ? req.body : [];
    const { rows: existingRows } = await client.query("SELECT id, password, first_login FROM users");
    const existingPasswords = Object.fromEntries(existingRows.map((r) => [r.id, r.password]));
    const existingFirstLogin = Object.fromEntries(existingRows.map((r) => [r.id, r.first_login]));

    // IMPORTANT: do NOT DELETE FROM users (full wipe). That cascades into user_sessions
    // and immediately invalidates the caller's Bearer token after every sync.
    await client.query("BEGIN");

    const keepIds = [];
    for (const u of body) {
      if (!u?.id) continue;
      keepIds.push(u.id);
      const password = resolvePasswordForSave(u.password, existingPasswords[u.id]);
      const firstLogin = resolveFirstLoginForSave(u, existingFirstLogin);
      await client.query(
        `INSERT INTO users (
           id, name, email, password, role, title, dept, team, type, hired, salary, phone, status,
           leave_balance, sick_balance, skills, first_login, temp_password, cnic_enc, marital_status,
           guardian_name, emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
           bank_name, bank_branch, bank_account, bank_iban, shift, shift_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
           $21,$22,$23,$24,$25,$26,$27,$28,$29,$30
         )
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           password = EXCLUDED.password,
           role = EXCLUDED.role,
           title = EXCLUDED.title,
           dept = EXCLUDED.dept,
           team = EXCLUDED.team,
           type = EXCLUDED.type,
           hired = EXCLUDED.hired,
           salary = EXCLUDED.salary,
           phone = EXCLUDED.phone,
           status = EXCLUDED.status,
           leave_balance = EXCLUDED.leave_balance,
           sick_balance = EXCLUDED.sick_balance,
           skills = EXCLUDED.skills,
           first_login = EXCLUDED.first_login,
           temp_password = EXCLUDED.temp_password,
           cnic_enc = EXCLUDED.cnic_enc,
           marital_status = EXCLUDED.marital_status,
           guardian_name = EXCLUDED.guardian_name,
           emergency_contact_name = EXCLUDED.emergency_contact_name,
           emergency_contact_phone = EXCLUDED.emergency_contact_phone,
           emergency_contact_relation = EXCLUDED.emergency_contact_relation,
           bank_name = EXCLUDED.bank_name,
           bank_branch = EXCLUDED.bank_branch,
           bank_account = EXCLUDED.bank_account,
           bank_iban = EXCLUDED.bank_iban,
           shift = EXCLUDED.shift,
           shift_id = EXCLUDED.shift_id`,
        [
          u.id, u.name, u.email, password, u.role, u.title || "", u.dept || "", u.team || "",
          u.type || "Full-time", u.hired || "", u.salary || "", u.phone || "", u.status || "active",
          u.leaveBalance ?? 24, 0, JSON.stringify(u.skills || []),
          firstLogin, null, u.cnicEnc || null, u.maritalStatus || "",
          u.guardianName || "", u.emergencyContactName || "", u.emergencyContactPhone || "", u.emergencyContactRelation || "",
          u.bankName || "", u.bankBranch || "", u.bankAccount || "", u.bankIban || "",
          u.shift ? JSON.stringify(u.shift) : null,
          u.shiftId || null,
        ]
      );
    }

    // Remove users that were deleted in the UI (their sessions cascade away — correct).
    // Never run a blanket DELETE FROM users.
    if (keepIds.length > 0) {
      await client.query("DELETE FROM users WHERE NOT (id = ANY($1::text[]))", [keepIds]);
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    console.error("users sync error:", e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.delete("/api/users/:userId", requireHrAdmin, async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "Employee id is required." });

    const actor = req.authUser;
    const { rows: targetRows } = await pool.query("SELECT id, role, name FROM users WHERE id = $1", [userId]);
    if (!targetRows[0]) return res.status(404).json({ error: "Employee not found." });
    if (actor.id === userId) {
      return res.status(403).json({ error: "Forbidden — cannot delete your own account" });
    }
    if (!canManageTargetRole(actor.role, targetRows[0].role)) {
      return res.status(403).json({ error: "Forbidden — cannot delete this user (role hierarchy)" });
    }

    const backup = await createDatabaseBackup(pool, `pre-delete-${userId}`);
    const result = await deleteEmployeeCascade(pool, userId, actor);
    if (!result.ok) return res.status(404).json({ error: result.error });

    res.json({
      ok: true,
      userId,
      name: result.name,
      backup: backup.filename,
      backupFormat: backup.format,
      deleted: result.counts,
    });
  } catch (e) {
    console.error("delete employee error:", e.message);
    res.status(500).json({ error: e.message || "Failed to delete employee." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res.json({ ok: false, error: "Invalid credentials" });
    }

    const { rows } = await pool.query(
      "SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1",
      [email]
    );
    const row = rows[0];
    if (!row) {
      return res.json({ ok: false, error: "Invalid credentials" });
    }

    const stored = row.password || "";
    let match = false;
    if (isBcryptHash(stored)) {
      match = bcryptjs.compareSync(password, stored);
    } else {
      // Legacy plain-text row (pre-migration) — allow once, then migrate on next startup/save
      match = stored === password || row.temp_password === password;
    }

    if (!match) {
      return res.json({ ok: false, error: "Invalid credentials" });
    }

    const session = await createSession(pool, row.id);
    setSessionCookie(res, session.token);
    res.json({
      ok: true,
      user: userToSafeJs(row),
      sessionToken: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (e) {
    console.error("login error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/logout", async (req, res) => {
  try {
    const token = extractSessionToken(req);
    if (token) await revokeSession(pool, token);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) {
    console.error("logout error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Debug: does the server see auth headers/cookie? (no secrets returned) */
app.get("/api/auth/ping", async (req, res) => {
  const token = extractSessionToken(req);
  let sessionOk = false;
  if (token) {
    const user = await resolveAuthenticatedUser(pool, req);
    sessionOk = !!user;
  }
  res.json({
    ok: true,
    hasAuthorizationHeader: !!req.headers.authorization,
    hasXSessionToken: !!req.headers["x-session-token"],
    hasSessionCookie: String(req.headers.cookie || "").includes("adforce_session"),
    tokenSeen: !!token,
    sessionValid: sessionOk,
  });
});

app.post("/api/change-password", requireAuth, async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body || {};
    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: "userId, currentPassword, and newPassword are required" });
    }
    if (req.authUser.id !== userId) {
      return res.status(403).json({ ok: false, error: "Cannot change another user's password" });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ ok: false, error: "Password must be at least 8 characters." });
    }

    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    const stored = row.password || "";
    let match = false;
    if (isBcryptHash(stored)) {
      match = bcryptjs.compareSync(String(currentPassword), stored);
    } else {
      match = stored === String(currentPassword) || row.temp_password === String(currentPassword);
    }
    if (!match) {
      return res.json({ ok: false, error: "Current password is incorrect." });
    }

    const hashed = bcryptjs.hashSync(String(newPassword), 10);
    await pool.query(
      "UPDATE users SET password = $1, first_login = false, temp_password = NULL WHERE id = $2",
      [hashed, userId]
    );
    await revokeAllUserSessions(pool, userId);
    const session = await createSession(pool, userId);
    const { rows: updated } = await pool.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
    setSessionCookie(res, session.token);
    res.json({
      ok: true,
      user: userToSafeJs(updated[0]),
      sessionToken: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (e) {
    console.error("change-password error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/attendance", requireHrAdmin, async (req, res) => {
  try {
    await replaceAll("attendance", req.body, (c, a) =>
      c.query(
        `INSERT INTO attendance (
           id, user_id, date, check_in, check_out, breaks, short_leaves, break_start, break_end,
           auto_checkout, working_ms, total_break_ms, status, late, source,
           check_in_method, check_out_method, last_scan, last_scan_method,
           manually_corrected, correction_log,
           last_corrected_by, last_corrected_by_role, last_corrected_on
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        [
          a.id, a.userId, a.date, a.checkIn || null, a.checkOut || null,
          JSON.stringify(a.breaks || []), JSON.stringify(a.shortLeaves || []),
          a.breakStart || null, a.breakEnd || null, a.autoCheckout || false,
          a.workingMs ?? null, a.totalBreakMs ?? null, a.status || null, a.late || false,
          a.source || "manual",
          a.checkInMethod || null, a.checkOutMethod || null,
          a.lastScan || null, a.lastScanMethod || null,
          a.manuallyCorrected === true,
          JSON.stringify(a.correctionLog || []),
          a.lastCorrectedBy || null,
          a.lastCorrectedByRole || null,
          a.lastCorrectedOn || null,
        ]
      )
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("attendance sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/leave", requireAuth, async (req, res) => {
  try {
    await replaceAll("leave_requests", req.body, (c, l) =>
      c.query(
        `INSERT INTO leave_requests (id, user_id, emp_name, type, from_date, to_date, days, note, status, submitted, paid_days, unpaid_days, pay_tag)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          l.id, l.userId, l.empName, l.type, l.from, l.to, l.days, l.note || "", l.status, l.submitted || "",
          l.paidDays ?? null, l.unpaidDays ?? null, l.payTag || null,
        ]
      )
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("leave sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/short-leave", requireAuth, async (req, res) => {
  try {
    await replaceAll("short_leave_requests", req.body, (c, l) =>
      c.query(
        `INSERT INTO short_leave_requests (
           id, user_id, emp_name, date, from_time, to_time, start_iso, end_iso, minutes, reason, status, submitted
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          l.id, l.userId, l.empName, l.date, l.fromTime, l.toTime,
          l.startIso || null, l.endIso || null, l.minutes ?? 0,
          l.reason || "", l.status || "pending", l.submitted || "",
        ]
      )
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("short-leave sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/announcements", requireHrAdmin, async (req, res) => {
  try {
    await replaceAll("announcements", req.body, (c, a) =>
      c.query(
        `INSERT INTO announcements (id, title, body, date, author) VALUES ($1,$2,$3,$4,$5)`,
        [a.id, a.title, a.body || "", a.date || "", a.author || ""]
      )
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("announcements sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/payroll", requireHrAdmin, async (req, res) => {
  try {
    await replaceAll("payroll", req.body, (c, s) =>
      c.query(
        `INSERT INTO payroll (id, user_id, month, data) VALUES ($1,$2,$3,$4)`,
        [s.id, s.userId, s.month, JSON.stringify(s)]
      )
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("payroll sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Legacy bulk PUT endpoints below are deprecated; granular REST routes take precedence when registered last.

app.put("/api/assets", requireAuth, async (req, res) => {
  try {
    await replaceAll("assets", req.body, (c, a) =>
      c.query(
        `INSERT INTO assets (
           id, name, asset_type, serial_number, condition, remarks,
           assigned_to, assigned_date, return_date, status, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          a.id, a.name, a.assetType || "Other", a.serialNumber || "",
          a.condition || "Good", a.remarks || "",
          a.assignedTo || null, a.assignedDate || "", a.returnDate || "",
          a.status || "available", a.updatedAt || "",
        ]
      )
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("assets sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const actor = req.authUser;
    const { rows } = canViewAllAttendance(actor.role)
      ? await pool.query(
          "SELECT * FROM notifications ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 200"
        )
      : await pool.query(
          "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 100",
          [actor.id]
        );
    res.json(rows.map(notificationToJs));
  } catch (e) {
    console.error("notifications fetch error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/notifications", requireAuth, async (req, res) => {
  try {
    await replaceAll("notifications", req.body, (c, n) =>
      c.query(
        `INSERT INTO notifications (id, user_id, title, body, type, read, created_at, link)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          n.id, n.userId, n.title, n.body || "", n.type || "announcement",
          !!n.read, n.createdAt || new Date().toISOString(), n.link || "",
        ]
      )
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("notifications sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/notifications/read", async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id is required" });
    await pool.query("UPDATE notifications SET read = true WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("notification read error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/notifications/read-all", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });
    await pool.query("UPDATE notifications SET read = true WHERE user_id = $1", [userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error("notifications read-all error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/holidays", requireHrAdmin, async (req, res) => {
  try {
    await replaceAll("holidays", req.body, (c, h) =>
      c.query(
        `INSERT INTO holidays (id, title, date, type) VALUES ($1,$2,$3,$4)`,
        [h.id, h.title, h.date, h.type || "public"]
      )
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("holidays sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/warnings", requireAuth, async (req, res) => {
  try {
    await replaceAll("warnings", req.body, (c, w) =>
      c.query(
        `INSERT INTO warnings (id, user_id, type, reason, date, issued_by, acknowledged)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          w.id,
          w.userId,
          (w.type || "verbal").toLowerCase(),
          w.reason || "",
          w.date || "",
          w.issuedBy || "",
          !!w.acknowledged,
        ]
      )
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("warnings sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/send-credentials", async (req, res) => {
  try {
    const { to, name, email, password, role, isReset } = req.body || {};
    console.log(`[api] POST /api/send-credentials role=${role || "Employee"} to=${to || email || "(missing)"}`);
    if (!to || !email || !password) {
      console.error("[api] send-credentials rejected: missing to, email, or password");
      return res.status(400).json({ error: "to, email, and password are required" });
    }

    await sendCredentialsEmail({
      to: String(to).trim(),
      name: String(name || email).trim(),
      email: String(email).trim(),
      password: String(password),
      role: role || "Employee",
      isReset: !!isReset,
    });

    res.json({ ok: true });
  } catch (e) {
    const msg = e?.message || e?.code || String(e);
    console.error("send-credentials error:", msg);
    if (e?.stack) console.error(e.stack);
    res.status(500).json({ error: msg });
  }
});

app.post("/api/send-notification-email", async (req, res) => {
  try {
    const { to, name, subject, body, link } = req.body || {};
    if (!to || !subject) {
      return res.status(400).json({ error: "to and subject are required" });
    }
    await sendNotificationEmail({
      to: String(to).trim(),
      name: String(name || to).trim(),
      subject: String(subject).trim(),
      body: String(body || ""),
      link: link || process.env.APP_URL || "https://hrms.adforcesolutions.com",
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = e?.message || e?.code || String(e);
    console.error("send-notification-email error:", msg);
    res.status(500).json({ error: msg });
  }
});

app.post("/api/send-warning-email", async (req, res) => {
  try {
    const { to, name, warningType, reason, date } = req.body || {};
    if (!to || !warningType || !reason) {
      return res.status(400).json({ error: "to, warningType, and reason are required" });
    }
    await sendWarningEmail({
      to: String(to).trim(),
      name: String(name || to).trim(),
      warningType: String(warningType).trim(),
      reason: String(reason).trim(),
      date: String(date || "").trim(),
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = e?.message || e?.code || String(e);
    console.error("send-warning-email error:", msg);
    res.status(500).json({ error: msg });
  }
});

registerAttendanceApi(app, pool);
registerAttendanceRestRoutes(app, pool, requireAuth, requireHrAdmin);
registerLeaveRoutes(app, pool, requireAuth, requireHrAdmin);
registerShortLeaveRoutes(app, pool, requireAuth, requireHrAdmin);
registerAnnouncementsRoutes(app, pool, requireAuth, requireHrAdmin);
registerPayrollRoutes(app, pool, requireAuth, requireHrAdmin);
registerHolidaysRoutes(app, pool, requireAuth, requireHrAdmin);
registerPoliciesRoutes(app, pool, requireAuth, requireHrAdmin);
registerAssetsRoutes(app, pool, requireAuth, requireHrAdmin);
registerWarningsRoutes(app, pool, requireAuth, requireHrAdmin);
registerShiftsRoutes(app, pool, requireAuth, requireHrAdmin);
registerCompanyRoutes(app, pool, requireAuth, requireHrAdmin);
registerRolesRoutes(app, pool, requireAuth, requireHrAdmin);
registerUsersRoutes(app, pool, requireAuth, requireHrAdmin);

/* ─── Production: serve built frontend ─── */
app.use(express.static(distPath));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

/** Apply schema.sql on every startup — creates missing tables/columns/seeds safely. */
async function ensureSchema() {
  const schema = readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
  console.log("✓ All tables verified");
}

/** One-time migration: hash any remaining plain-text passwords. */
async function migratePlaintextPasswords() {
  const { rows } = await pool.query("SELECT id, password FROM users");
  let migrated = 0;
  for (const row of rows) {
    const pw = row.password || "";
    if (!pw || isBcryptHash(pw)) continue;
    const hashed = bcryptjs.hashSync(pw, 10);
    await pool.query(
      "UPDATE users SET password = $1, temp_password = NULL WHERE id = $2",
      [hashed, row.id]
    );
    migrated += 1;
  }
  if (migrated > 0) {
    console.log(`✓ Migrated ${migrated} plain-text password${migrated === 1 ? "" : "s"} to bcrypt`);
  }
}

async function applyBiometricTimezoneFix() {
  const migrationKey = "biometric_timezone_fix_v3";
  const already = await pool.query("SELECT value FROM app_meta WHERE key = $1 LIMIT 1", [migrationKey]);
  if (already.rows.length) return;

  let backup = null;
  try {
    backup = await createDatabaseBackup(pool, migrationKey);
    console.log(`✓ Timezone-fix backup created: ${backup.filename}`);
  } catch (e) {
    console.warn("Timezone-fix backup skipped:", e.message);
  }

  // punch_time is TIMESTAMP WITHOUT TIME ZONE and stores the device's Pakistan
  // wall-clock text as-is (e.g. "2026-07-28 13:00:15"). Do NOT write punchTime
  // (UTC Date) here — node-pg would persist the UTC clock face (08:00), and
  // syncAttendanceFromLogs would then parseZktTime() it as local again (−5h),
  // shifting display from 1:00 PM → 8:00 AM.
  const { rows } = await pool.query(
    `SELECT id, employee_id, raw_data,
            TO_CHAR(punch_time, 'YYYY-MM-DD HH24:MI:SS') AS punch_time_text
     FROM attendance_logs
     WHERE raw_data IS NOT NULL AND raw_data <> ''`
  );

  let logsFixed = 0;
  let logsFailed = 0;
  const touchedLogIds = [];
  for (const row of rows) {
    try {
      const parsed = parseAttLogLine(row.raw_data);
      const desired = parsed?.punchTimeText || (parsed?.punchTime ? karachiTimestampText(parsed.punchTime) : "");
      if (!desired) continue;
      const current = String(row.punch_time_text || "").trim();
      if (current === desired) continue;
      await pool.query(
        "UPDATE attendance_logs SET punch_time = $1::timestamp, synced_to_attendance = false, updated_at = NOW() WHERE id = $2",
        [desired, row.id]
      );
      touchedLogIds.push(row.id);
      logsFixed += 1;
    } catch (e) {
      logsFailed += 1;
      console.warn(`Timezone fix skipped log id=${row.id}:`, e.message);
    }
  }

  // Repair attendance TEXT fields that still contain invalid hour-24 clock values
  const { rows: badAttendance } = await pool.query(
    `SELECT id, check_in, check_out, break_start, break_end
     FROM attendance
     WHERE COALESCE(check_in, '') LIKE '% 24:%'
        OR COALESCE(check_out, '') LIKE '% 24:%'
        OR COALESCE(break_start, '') LIKE '% 24:%'
        OR COALESCE(break_end, '') LIKE '% 24:%'`
  );
  let attendanceTextFixed = 0;
  for (const row of badAttendance) {
    const next = {
      check_in: row.check_in ? normalizeWallClockTimestamp(row.check_in) : null,
      check_out: row.check_out ? normalizeWallClockTimestamp(row.check_out) : null,
      break_start: row.break_start ? normalizeWallClockTimestamp(row.break_start) : null,
      break_end: row.break_end ? normalizeWallClockTimestamp(row.break_end) : null,
    };
    await pool.query(
      `UPDATE attendance
       SET check_in = $1, check_out = $2, break_start = $3, break_end = $4
       WHERE id = $5`,
      [next.check_in, next.check_out, next.break_start, next.break_end, row.id]
    );
    attendanceTextFixed += 1;
  }

  const { rowCount: biometricRowsFlagged } = await pool.query(
    `UPDATE attendance_logs
     SET synced_to_attendance = false, updated_at = NOW()
     WHERE employee_id IS NOT NULL`
  );

  const syncResult = await syncAttendanceFromLogs(pool);

  await pool.query(
    `INSERT INTO app_meta (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [migrationKey, JSON.stringify({
      appliedAt: new Date().toISOString(),
      backup: backup?.filename || null,
      logsFixed,
      logsFailed,
      attendanceTextFixed,
      touchedLogIds: touchedLogIds.length,
      biometricRowsFlagged,
      syncResult,
    })]
  );

  console.log(`✓ Biometric timezone fix applied (${logsFixed} attendance log timestamps corrected, ${attendanceTextFixed} attendance text rows, ${logsFailed} skipped)`);
}

const PORT = process.env.PORT || 4000;

ensureSchema()
  .then(() => cleanupExpiredSessions(pool))
  .then(() => migratePlaintextPasswords())
  .then(() => applyBiometricTimezoneFix().catch((e) => {
    console.error("Biometric timezone fix failed (continuing startup):", e.message);
  }))
  .then(() => {
    startAttendanceSyncProcessor(pool);
    app.listen(PORT, () => {
      console.log(`✓ Adforce HR API running on http://localhost:${PORT}`);
      console.log(`  Health check: http://localhost:${PORT}/api/health`);
    });
  })
  .catch((e) => {
    console.error("Schema error:", e.message);
    process.exit(1);
  });
