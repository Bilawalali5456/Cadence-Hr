import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import bcryptjs from "bcryptjs";
import { sendCredentialsEmail, sendNotificationEmail, sendWarningEmail } from "./mail.js";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "..", "dist");

const app = express();
app.use(cors());
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
  breaks: r.breaks || [],
  shortLeaves: r.short_leaves || [],
  breakStart: r.break_start || null,
  breakEnd: r.break_end || null,
  autoCheckout: r.auto_checkout || false,
  workingMs: r.working_ms != null ? Number(r.working_ms) : undefined,
  totalBreakMs: r.total_break_ms != null ? Number(r.total_break_ms) : undefined,
  status: r.status || undefined,
  late: r.late || false,
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

/* ─── GET /api/bootstrap — everything in one call ─── */
app.get("/api/bootstrap", async (_req, res) => {
  try {
    const [users, attendance, leave, shortLeave, announcements, payroll, company, policies, assets, roles, holidays, notifications, warnings] = await Promise.all([
      pool.query("SELECT * FROM users ORDER BY name"),
      pool.query("SELECT * FROM attendance ORDER BY date DESC"),
      pool.query("SELECT * FROM leave_requests ORDER BY id"),
      pool.query("SELECT * FROM short_leave_requests ORDER BY id DESC"),
      pool.query("SELECT * FROM announcements ORDER BY id DESC"),
      pool.query("SELECT * FROM payroll ORDER BY month DESC"),
      pool.query("SELECT * FROM company_settings WHERE id = 1"),
      pool.query("SELECT * FROM policies ORDER BY updated_at DESC NULLS LAST, title"),
      pool.query("SELECT * FROM assets ORDER BY name"),
      pool.query("SELECT * FROM roles ORDER BY name"),
      pool.query("SELECT * FROM holidays ORDER BY date"),
      pool.query("SELECT * FROM notifications ORDER BY created_at DESC NULLS LAST, id DESC"),
      pool.query("SELECT * FROM warnings ORDER BY date DESC"),
    ]);
    res.json({
      users: users.rows.map(userToSafeJs),
      attendance: attendance.rows.map(attToJs),
      leave: leave.rows.map(leaveToJs),
      shortLeave: shortLeave.rows.map(shortLeaveToJs),
      announcements: announcements.rows.map(annToJs),
      payroll: payroll.rows.map((r) => r.data),
      company: company.rows[0] ? companyToJs(company.rows[0]) : {},
      policies: policies.rows.map(policyToJs),
      assets: assets.rows.map(assetToJs),
      roles: roles.rows.map(roleToJs),
      holidays: holidays.rows.map(holidayToJs),
      notifications: notifications.rows.map(notificationToJs),
      warnings: warnings.rows.map(warningToJs),
    });
  } catch (e) {
    const msg = e?.message || e?.code || String(e);
    console.error("bootstrap error:", msg);
    if (e?.cause) console.error("bootstrap cause:", e.cause);
    res.status(500).json({ error: msg });
  }
});

/* ─── Full-collection sync endpoints ─── */
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

app.put("/api/users", async (req, res) => {
  try {
    const { rows: existingRows } = await pool.query("SELECT id, password FROM users");
    const existingPasswords = Object.fromEntries(existingRows.map((r) => [r.id, r.password]));

    await replaceAll("users", req.body, (c, u) => {
      const password = resolvePasswordForSave(u.password, existingPasswords[u.id]);
      return c.query(
        `INSERT INTO users (
           id, name, email, password, role, title, dept, team, type, hired, salary, phone, status,
           leave_balance, sick_balance, skills, first_login, temp_password, cnic_enc, marital_status,
           guardian_name, emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
           bank_name, bank_branch, bank_account, bank_iban, shift
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
           $21,$22,$23,$24,$25,$26,$27,$28,$29
         )`,
        [
          u.id, u.name, u.email, password, u.role, u.title || "", u.dept || "", u.team || "",
          u.type || "Full-time", u.hired || "", u.salary || "", u.phone || "", u.status || "active",
          u.leaveBalance ?? 24, 0, JSON.stringify(u.skills || []),
          u.firstLogin || false, null, u.cnicEnc || null, u.maritalStatus || "",
          u.guardianName || "", u.emergencyContactName || "", u.emergencyContactPhone || "", u.emergencyContactRelation || "",
          u.bankName || "", u.bankBranch || "", u.bankAccount || "", u.bankIban || "",
          u.shift ? JSON.stringify(u.shift) : null,
        ]
      );
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("users sync error:", e.message);
    res.status(500).json({ error: e.message });
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

    res.json({ ok: true, user: userToSafeJs(row) });
  } catch (e) {
    console.error("login error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/change-password", async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body || {};
    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: "userId, currentPassword, and newPassword are required" });
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
    res.json({ ok: true });
  } catch (e) {
    console.error("change-password error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/attendance", async (req, res) => {
  try {
    await replaceAll("attendance", req.body, (c, a) =>
      c.query(
        `INSERT INTO attendance (
           id, user_id, date, check_in, check_out, breaks, short_leaves, break_start, break_end,
           auto_checkout, working_ms, total_break_ms, status, late
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          a.id, a.userId, a.date, a.checkIn || null, a.checkOut || null,
          JSON.stringify(a.breaks || []), JSON.stringify(a.shortLeaves || []),
          a.breakStart || null, a.breakEnd || null, a.autoCheckout || false,
          a.workingMs ?? null, a.totalBreakMs ?? null, a.status || null, a.late || false,
        ]
      )
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("attendance sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/leave", async (req, res) => {
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

app.put("/api/short-leave", async (req, res) => {
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

app.put("/api/announcements", async (req, res) => {
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

app.put("/api/payroll", async (req, res) => {
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

app.put("/api/company", async (req, res) => {
  try {
    const c = req.body;
    await pool.query(
      `INSERT INTO company_settings (id, office_start, grace_minutes, currency)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET office_start = $1, grace_minutes = $2, currency = $3`,
      [c.officeStart || "09:00", c.graceMinutes ?? 15, c.currency || "PKR"]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("company sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/policies", async (req, res) => {
  try {
    await replaceAll("policies", req.body, (c, p) =>
      c.query(
        `INSERT INTO policies (id, title, category, body, version, updated_at, updated_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          p.id, p.title, p.category || "General", p.body || "",
          p.version ?? 1, p.updatedAt || "", p.updatedBy || "", p.createdAt || "",
        ]
      )
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("policies sync error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/assets", async (req, res) => {
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

app.get("/api/notifications", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM notifications ORDER BY created_at DESC NULLS LAST, id DESC"
    );
    res.json(rows.map(notificationToJs));
  } catch (e) {
    console.error("notifications fetch error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/notifications", async (req, res) => {
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

app.put("/api/holidays", async (req, res) => {
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

app.put("/api/warnings", async (req, res) => {
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
    if (!to || !email || !password) {
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
      link: link || process.env.APP_URL || "https://hr.adforcesolutions.com",
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

const PORT = process.env.PORT || 4000;

ensureSchema()
  .then(() => migratePlaintextPasswords())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✓ Adforce HR API running on http://localhost:${PORT}`);
      console.log(`  Health check: http://localhost:${PORT}/api/health`);
    });
  })
  .catch((e) => {
    console.error("Schema error:", e.message);
    process.exit(1);
  });
