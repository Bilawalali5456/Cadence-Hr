import bcryptjs from "bcryptjs";
import { HR_OPS_ROLES, ASSET_MANAGER_ROLES, actorCanAssignRole } from "../lib/rbac.js";
import { canManageTargetRole } from "../lib/auth.js";
import { buildShiftHistoryOnChange, parseShiftHistory, shiftsEqual } from "../lib/shiftHistory.js";

function isBcryptHash(pw) {
  return typeof pw === "string" && (pw.startsWith("$2a$") || pw.startsWith("$2b$"));
}

function hashPasswordIfNeeded(pw) {
  if (!pw) return pw;
  if (isBcryptHash(pw)) return pw;
  return bcryptjs.hashSync(String(pw), 10);
}

/** Explicit column list so shift_history is always fetched from DB. */
export const USER_SELECT_SQL = `
  SELECT id, name, email, password, role, designation, title, dept, team, type, hired, salary, phone, status,
    leave_balance, sick_balance, skills, first_login, temp_password, cnic_enc, marital_status,
    guardian_name, emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    bank_name, bank_branch, bank_account, bank_iban, shift, shift_id, shift_history
  FROM users`;

export function logShiftHistoryRaw(row, label) {
  if (!row?.id) return;
  const raw = row.shift_history ?? row.shiftHistory;
  const parsed = parseShiftHistory(raw);
  console.log(
    `[${label}] user=${row.id} shift_history type=${raw == null ? "null" : typeof raw} isArray=${Array.isArray(raw)} parsedLen=${parsed.length} raw=${raw != null ? JSON.stringify(raw).slice(0, 200) : "null"}`
  );
}

function userRowToJs(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    password: r.password,
    role: r.role,
    designation: r.designation || "",
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
    shiftHistory: parseShiftHistory(r.shift_history ?? r.shiftHistory),
  };
}

function userRowToSafe(r) {
  const u = userRowToJs(r);
  const { password, tempPassword, ...safe } = u;
  return safe;
}

function resolvePasswordForSave(incomingPassword, existingHash) {
  if (!incomingPassword) return existingHash || hashPasswordIfNeeded("changeme");
  if (isBcryptHash(incomingPassword)) return incomingPassword;
  return bcryptjs.hashSync(String(incomingPassword), 10);
}

function pickAllowedSelfFields(body) {
  // Employees can update a *small* subset of non-sensitive profile fields.
  // (Password/role/salary/shift are intentionally excluded.)
  const allowed = [
    "name",
    "phone",
    "maritalStatus",
    "guardianName",
    "emergencyContactName",
    "emergencyContactPhone",
    "emergencyContactRelation",
    "bankName",
    "bankBranch",
    "bankAccount",
    "bankIban",
  ];
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

function buildUserInsertValues(u, { passwordHash, firstLogin, existing } = {}) {
  const salary = u.salary ?? (existing?.salary ?? "");
  const phone = u.phone ?? (existing?.phone ?? "");
  const status = u.status ?? (existing?.status ?? "active");
  const leaveBalance = u.leaveBalance ?? (existing?.leaveBalance ?? 24);
  const skills = u.skills ?? (existing?.skills ?? []);
  const cnicEnc = u.cnicEnc ?? (existing?.cnicEnc ?? null);
  const maritalStatus = u.maritalStatus ?? (existing?.maritalStatus ?? "");
  const guardianName = u.guardianName ?? (existing?.guardianName ?? "");
  const emergencyContactName = u.emergencyContactName ?? (existing?.emergencyContactName ?? "");
  const emergencyContactPhone = u.emergencyContactPhone ?? (existing?.emergencyContactPhone ?? "");
  const emergencyContactRelation = u.emergencyContactRelation ?? (existing?.emergencyContactRelation ?? "");
  const bankName = u.bankName ?? (existing?.bankName ?? "");
  const bankBranch = u.bankBranch ?? (existing?.bankBranch ?? "");
  const bankAccount = u.bankAccount ?? (existing?.bankAccount ?? "");
  const bankIban = u.bankIban ?? (existing?.bankIban ?? "");

  const shift = u.shift !== undefined ? (u.shift ? JSON.stringify(u.shift) : null) : existing?.shift;
  const shiftId = u.shiftId !== undefined ? (u.shiftId || null) : existing?.shiftId;
  const shiftHistory = u.shiftHistory !== undefined
    ? JSON.stringify(Array.isArray(u.shiftHistory) ? u.shiftHistory : [])
    : (existing?.shiftHistory != null ? JSON.stringify(existing.shiftHistory) : "[]");

  const type = u.type ?? (existing?.type ?? "Full-time");
  const hired = u.hired ?? (existing?.hired ?? "");
  const team = u.team ?? (existing?.team ?? "");
  const dept = u.dept ?? (existing?.dept ?? "");
  const title = u.title ?? (existing?.title ?? "");
  const designation = u.designation ?? (existing?.designation ?? "");

  return [
    u.id,
    u.name ?? existing?.name ?? "",
    u.email ?? existing?.email ?? "",
    passwordHash,
    u.role ?? existing?.role ?? "Employee",
    designation,
    title,
    dept,
    team,
    type,
    hired,
    salary,
    phone,
    status,
    leaveBalance,
    0,
    JSON.stringify(Array.isArray(skills) ? skills : []),
    firstLogin,
    null, // temp_password
    cnicEnc,
    maritalStatus,
    guardianName,
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelation,
    bankName,
    bankBranch,
    bankAccount,
    bankIban,
    shift,
    shiftId,
    shiftHistory,
  ];
}

export function registerUsersRoutes(app, pool, requireAuth, requireHrAdmin) {
  // Note: DELETE /api/users/:userId lives in server/index.js and blocks id=u-admin
  // ("System admin account cannot be deleted").

  // HR Admin/Executive: list all users (password/temp never returned).
  app.get("/api/users", requireHrAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(`${USER_SELECT_SQL} ORDER BY name`);
      for (const row of rows) {
        const raw = row.shift_history;
        if (raw != null && JSON.stringify(raw) !== "[]") {
          logShiftHistoryRaw(row, "GET /api/users");
        }
      }
      res.json(rows.map(userRowToSafe));
    } catch (e) {
      console.error("GET /api/users error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Authenticated user: read own profile; HR Admin/Executive can read any.
  app.get("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const targetId = String(req.params.id || "").trim();
      if (!targetId) return res.status(400).json({ error: "User id is required" });

      const canViewAll = HR_OPS_ROLES.includes(actor.role);
      if (!canViewAll && actor.id !== targetId) {
        return res.status(403).json({ error: "Forbidden — cannot view other users" });
      }

      const { rows } = await pool.query(`${USER_SELECT_SQL} WHERE id = $1 LIMIT 1`, [targetId]);
      if (!rows[0]) return res.status(404).json({ error: "User not found" });
      logShiftHistoryRaw(rows[0], "GET /api/users/:id");
      res.json(userRowToSafe(rows[0]));
    } catch (e) {
      console.error("GET /api/users/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // HR only: create user with initial temp password + first_login=true.
  app.post("/api/users", requireHrAdmin, async (req, res) => {
    try {
      const actor = req.authUser;
      const u = req.body || {};
      if (!u.id || !u.name || !u.email || !u.password) {
        return res.status(400).json({ error: "id, name, email, and password are required" });
      }

      const newRole = u.role || "Employee";
      if (!actorCanAssignRole(actor.role, newRole)) {
        return res.status(403).json({ error: `Forbidden — cannot create users with role ${newRole}` });
      }

      const passwordHash = hashPasswordIfNeeded(u.password);
      const firstLogin = !!u.firstLogin;

      const values = buildUserInsertValues({ ...u, role: newRole }, { passwordHash, firstLogin, existing: null });

      await pool.query(
        `INSERT INTO users (
          id, name, email, password, role, designation, title, dept, team, type, hired, salary, phone, status,
          leave_balance, sick_balance, skills, first_login, temp_password, cnic_enc, marital_status,
          guardian_name, emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
          bank_name, bank_branch, bank_account, bank_iban, shift, shift_id, shift_history
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          password = EXCLUDED.password,
          role = EXCLUDED.role,
          designation = EXCLUDED.designation,
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
          shift_id = EXCLUDED.shift_id,
          shift_history = EXCLUDED.shift_history
        `,
        values
      );

      const { rows: created } = await pool.query(`${USER_SELECT_SQL} WHERE id = $1 LIMIT 1`, [u.id]);
      logShiftHistoryRaw(created[0], "POST /api/users");
      res.json({ ok: true, user: userRowToSafe(created[0]) });
    } catch (e) {
      console.error("POST /api/users error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // HR (full) or self (limited): update user profile (and optionally password for HR).
  app.put("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const targetId = String(req.params.id || "").trim();
      if (!targetId) return res.status(400).json({ error: "User id is required" });

      const canHr = HR_OPS_ROLES.includes(actor.role);
      if (!canHr && actor.id !== targetId) {
        return res.status(403).json({ error: "Forbidden — cannot edit other users" });
      }

      const bodyRaw = req.body || {};

      const { rows: existingRows } = await pool.query(`${USER_SELECT_SQL} WHERE id = $1 LIMIT 1`, [targetId]);
      if (!existingRows[0]) return res.status(404).json({ error: "User not found" });

      const existing = userRowToJs(existingRows[0]);

      let body;
      if (!canHr) {
        body = pickAllowedSelfFields(bodyRaw);
      } else if (actor.id === targetId) {
        // HR Admin / HR Employee cannot change own role or salary via this endpoint.
        body = { ...bodyRaw };
        delete body.role;
        delete body.salary;
        if (actor.role === "HR Employee") {
          // Keep password reset for self via settings elsewhere; strip elevated fields.
          delete body.password;
        }
      } else {
        // Executives outrank HR Admin, but admins with manage_executives may still
        // update executive accounts (including password reset) — same as create.
        const mayManageExecutive =
          existing.role === "Executive"
          && actor.id !== targetId
          && actorCanAssignRole(actor.role, "Executive");
        if (!canManageTargetRole(actor.role, existing.role) && !mayManageExecutive) {
          return res.status(403).json({ error: "Forbidden — cannot manage this user (role hierarchy)" });
        }
        body = { ...bodyRaw };
        if (body.role !== undefined && body.role !== existing.role) {
          if (!actorCanAssignRole(actor.role, body.role)) {
            return res.status(403).json({ error: `Forbidden — cannot assign role ${body.role}` });
          }
        }
      }

      const passwordHash = body.password !== undefined
        ? hashPasswordIfNeeded(body.password)
        : resolvePasswordForSave(undefined, existing.password);

      const firstLogin = body.firstLogin !== undefined ? !!body.firstLogin : existing.firstLogin;

      const merged = {
        ...existing,
        ...body,
      };

      const oldShift = existing.shift;
      const newShift = body.shift !== undefined ? body.shift : existing.shift;
      let shiftHistory = parseShiftHistory(existingRows[0].shift_history);
      if (canHr && body.shift !== undefined && !shiftsEqual(oldShift, newShift)) {
        shiftHistory = buildShiftHistoryOnChange(shiftHistory, oldShift, existing.hired);
        merged.shiftHistory = shiftHistory;
      }

      const values = buildUserInsertValues(merged, { passwordHash, firstLogin, existing });

      await pool.query(
        `INSERT INTO users (
          id, name, email, password, role, designation, title, dept, team, type, hired, salary, phone, status,
          leave_balance, sick_balance, skills, first_login, temp_password, cnic_enc, marital_status,
          guardian_name, emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
          bank_name, bank_branch, bank_account, bank_iban, shift, shift_id, shift_history
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          password = EXCLUDED.password,
          role = EXCLUDED.role,
          designation = EXCLUDED.designation,
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
          shift_id = EXCLUDED.shift_id,
          shift_history = EXCLUDED.shift_history
        `,
        values
      );

      const { rows: updated } = await pool.query(`${USER_SELECT_SQL} WHERE id = $1 LIMIT 1`, [targetId]);
      logShiftHistoryRaw(updated[0], "PUT /api/users/:id");
      res.json({ ok: true, user: userRowToSafe(updated[0]) });
    } catch (e) {
      console.error("PUT /api/users/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

