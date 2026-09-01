import { getUserShift, requiredDutyMs } from "./attendanceSync.js";
import { monthDateRange } from "./latePenalties.js";

/** Forward-only: overtime detection starts September 2026. */
export const OVERTIME_DATE_FLOOR = "2026-09-01";

/** Minimum extra working time beyond required shift hours (1 hour). */
export const OVERTIME_MIN_MINUTES = 60;

const ASSETS_ONLY_ADMIN_ROLES = new Set(["Admin", "HR Admin"]);

export function isOvertimeEligibleDate(dateKey) {
  const d = String(dateKey || "").slice(0, 10);
  return d >= OVERTIME_DATE_FLOOR;
}

function isAssetsOnlyAdminRole(role) {
  return ASSETS_ONLY_ADMIN_ROLES.has(role);
}

/**
 * Extra minutes when actual working hours exceed required shift hours by >= 1 hour.
 * Uses attendance.working_ms (net of breaks) vs shift window minus break minutes.
 */
export function computeExtraMinutes(user, dateKey, attRow) {
  if (!user || !dateKey || !attRow) return 0;
  if (!isOvertimeEligibleDate(dateKey)) return 0;

  const checkOut = attRow.check_out || attRow.checkOut;
  if (!checkOut) return 0;

  const shift = getUserShift(user, dateKey);
  if (shift.off) return 0;

  const workingMs = attRow.working_ms != null
    ? Number(attRow.working_ms)
    : (attRow.workingMs != null ? Number(attRow.workingMs) : NaN);
  if (!Number.isFinite(workingMs) || workingMs <= 0) return 0;

  const requiredMs = requiredDutyMs(user, dateKey);
  if (!Number.isFinite(requiredMs) || requiredMs <= 0) return 0;

  const extraMs = workingMs - requiredMs;
  if (extraMs < OVERTIME_MIN_MINUTES * 60000) return 0;

  return Math.floor(extraMs / 60000);
}

export function overtimeToJs(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || undefined,
    date: row.date,
    extraMinutes: Number(row.extra_minutes || 0),
    reason: row.reason || "",
    hrStatus: row.hr_status || "pending",
    hrReviewedBy: row.hr_reviewed_by || null,
    hrReviewedAt: row.hr_reviewed_at || null,
    hrComment: row.hr_comment || "",
    execStatus: row.exec_status || "pending",
    execReviewedBy: row.exec_reviewed_by || null,
    execReviewedAt: row.exec_reviewed_at || null,
    execComment: row.exec_comment || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isFinalized(row) {
  if (!row) return false;
  return row.hr_status === "rejected" || row.exec_status === "approved" || row.exec_status === "rejected";
}

async function loadUser(client, userId) {
  const { rows } = await client.query(
    `SELECT id, name, role, designation, shift, status FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Create or update overtime_requests from an attendance row with checkout.
 * Preserves workflow state once HR/Executive has acted.
 */
export async function syncOvertimeForAttendance(client, attRow, userHint = null) {
  const userId = attRow.user_id || attRow.userId;
  const dateKey = String(attRow.date || "").slice(0, 10);
  const checkOut = attRow.check_out || attRow.checkOut;

  if (!userId || !dateKey || !checkOut) return null;
  if (!isOvertimeEligibleDate(dateKey)) return null;

  const user = userHint || await loadUser(client, userId);
  if (!user || user.status !== "active") return null;
  if (isAssetsOnlyAdminRole(user.role)) return null;

  const extraMinutes = computeExtraMinutes(user, dateKey, attRow);

  const { rows: existingRows } = await client.query(
    `SELECT * FROM overtime_requests WHERE employee_id = $1 AND date = $2 LIMIT 1`,
    [userId, dateKey]
  );
  const existing = existingRows[0];

  if (extraMinutes < OVERTIME_MIN_MINUTES) {
    if (existing && !isFinalized(existing)) {
      await client.query(`DELETE FROM overtime_requests WHERE id = $1`, [existing.id]);
    }
    return null;
  }

  const id = existing?.id || `ot-${userId}-${dateKey}`;

  if (existing) {
    if (isFinalized(existing)) {
      return overtimeToJs(existing);
    }
    const { rows: updated } = await client.query(
      `UPDATE overtime_requests
       SET extra_minutes = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [extraMinutes, existing.id]
    );
    return overtimeToJs(updated[0]);
  }

  const { rows: inserted } = await client.query(
    `INSERT INTO overtime_requests (
       id, employee_id, date, extra_minutes, reason, hr_status, exec_status
     ) VALUES ($1, $2, $3, $4, '', 'pending', 'pending')
     RETURNING *`,
    [id, userId, dateKey, extraMinutes]
  );
  return overtimeToJs(inserted[0]);
}

/** Reconcile overtime for all checked-out attendance in a date range. */
export async function syncOvertimeForRange(client, dateFrom, dateTo, userIds = null) {
  if (!dateFrom || !dateTo || dateTo < OVERTIME_DATE_FLOOR) return;
  const effectiveFrom = dateFrom < OVERTIME_DATE_FLOOR ? OVERTIME_DATE_FLOOR : dateFrom;

  const params = [effectiveFrom, dateTo];
  let userFilter = "";
  if (Array.isArray(userIds) && userIds.length) {
    params.push(userIds);
    userFilter = ` AND a.user_id = ANY($${params.length})`;
  }

  const { rows } = await client.query(
    `SELECT a.* FROM attendance a
     JOIN users u ON u.id = a.user_id
     WHERE a.date >= $1 AND a.date <= $2
       AND a.check_out IS NOT NULL AND a.check_out <> ''
       AND u.role NOT IN ('Admin', 'HR Admin')
       ${userFilter}`,
    params
  );

  for (const row of rows) {
    await syncOvertimeForAttendance(client, row);
  }
}

export async function fetchOvertimeRequests(pool, { employeeId = null, month = null } = {}) {
  const params = [];
  const where = ["u.role NOT IN ('Admin', 'HR Admin')"];

  if (employeeId) {
    params.push(employeeId);
    where.push(`o.employee_id = $${params.length}`);
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const range = monthDateRange(month);
    if (range) {
      params.push(range.start);
      params.push(range.end);
      where.push(`o.date >= $${params.length - 1} AND o.date <= $${params.length}`);
    }
  }

  const { rows } = await pool.query(
    `SELECT o.*, u.name AS employee_name
     FROM overtime_requests o
     JOIN users u ON u.id = o.employee_id
     WHERE ${where.join(" AND ")}
     ORDER BY o.date DESC, u.name`,
    params
  );
  return rows.map(overtimeToJs);
}
