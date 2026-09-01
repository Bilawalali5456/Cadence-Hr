/** Forward-only: late penalty tracking starts September 2026. */
export const LATE_PENALTY_MONTH_FLOOR = "2026-09";

function monthBounds(monthKey) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const start = `${m[1]}-${m[2]}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function monthDateRange(monthKey) {
  return monthBounds(monthKey);
}

export function isLatePenaltyMonth(monthKey) {
  return !!monthKey && monthKey >= LATE_PENALTY_MONTH_FLOOR;
}

export function latePenaltyToJs(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    month: row.month,
    lateCount: Number(row.late_count || 0),
    leavesDeducted: Number(row.leaves_deducted || 0),
    salaryDeductions: Number(row.salary_deductions || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getOrCreatePenaltyRow(client, employeeId, monthKey) {
  const id = `lp-${employeeId}-${monthKey}`;
  const { rows } = await client.query(
    `INSERT INTO late_penalties (id, employee_id, month, late_count, leaves_deducted, salary_deductions)
     VALUES ($1, $2, $3, 0, 0, 0)
     ON CONFLICT (employee_id, month) DO UPDATE SET employee_id = EXCLUDED.employee_id
     RETURNING *`,
    [id, employeeId, monthKey]
  );
  return rows[0];
}

/**
 * Reconcile late_penalties for one employee/month from attendance.late rows.
 * Every 3 lates → 1 Annual Leave deducted; if balance is 0 → salary_deductions++.
 */
export async function reconcileLatePenaltiesForEmployeeMonth(client, employeeId, monthKey) {
  if (!employeeId || !isLatePenaltyMonth(monthKey)) return null;

  const { rows: userRows } = await client.query(
    `SELECT role FROM users WHERE id = $1 LIMIT 1`,
    [employeeId]
  );
  const role = userRows[0]?.role;
  if (role === "Admin" || role === "HR Admin") return null;

  const bounds = monthBounds(monthKey);
  if (!bounds) return null;

  const { rows: countRows } = await client.query(
    `SELECT COUNT(*)::int AS c FROM attendance
     WHERE user_id = $1 AND date >= $2 AND date <= $3 AND late = true`,
    [employeeId, bounds.start, bounds.end]
  );
  const lateCount = Number(countRows[0]?.c || 0);
  const targetPenalties = Math.floor(lateCount / 3);

  const penaltyRow = await getOrCreatePenaltyRow(client, employeeId, monthKey);
  let leavesDeducted = Number(penaltyRow.leaves_deducted || 0);
  let salaryDeductions = Number(penaltyRow.salary_deductions || 0);
  let currentApplied = leavesDeducted + salaryDeductions;

  while (currentApplied < targetPenalties) {
    const { rows: userRows } = await client.query(
      `SELECT leave_balance FROM users WHERE id = $1 FOR UPDATE`,
      [employeeId]
    );
    const balance = Number(userRows[0]?.leave_balance ?? 0);
    if (balance > 0) {
      await client.query(
        `UPDATE users SET leave_balance = GREATEST(0, leave_balance - 1) WHERE id = $1`,
        [employeeId]
      );
      leavesDeducted += 1;
    } else {
      salaryDeductions += 1;
    }
    currentApplied += 1;
  }

  while (currentApplied > targetPenalties) {
    if (leavesDeducted > 0) {
      leavesDeducted -= 1;
      await client.query(
        `UPDATE users SET leave_balance = leave_balance + 1 WHERE id = $1`,
        [employeeId]
      );
    } else if (salaryDeductions > 0) {
      salaryDeductions -= 1;
    } else {
      break;
    }
    currentApplied -= 1;
  }

  const { rows: updated } = await client.query(
    `UPDATE late_penalties
     SET late_count = $1, leaves_deducted = $2, salary_deductions = $3, updated_at = NOW()
     WHERE employee_id = $4 AND month = $5
     RETURNING *`,
    [lateCount, leavesDeducted, salaryDeductions, employeeId, monthKey]
  );
  return latePenaltyToJs(updated[0]);
}

/** Reconcile all employee/month pairs touched in a date range (post-sync hook). */
export async function reconcileLatePenaltiesForRange(client, dateFrom, dateTo, userIds = null) {
  if (!dateFrom || !dateTo) return;
  const fromMonth = dateFrom.slice(0, 7);
  const toMonth = dateTo.slice(0, 7);
  if (toMonth < LATE_PENALTY_MONTH_FLOOR) return;

  const params = [dateFrom, dateTo, LATE_PENALTY_MONTH_FLOOR];
  let userFilter = "";
  if (Array.isArray(userIds) && userIds.length) {
    params.push(userIds);
    userFilter = ` AND user_id = ANY($${params.length})`;
  }

  const { rows } = await client.query(
    `SELECT DISTINCT user_id, SUBSTRING(date FROM 1 FOR 7) AS month_key
     FROM attendance
     WHERE date >= $1 AND date <= $2
       AND SUBSTRING(date FROM 1 FOR 7) >= $3
       ${userFilter}`,
    params
  );

  for (const row of rows) {
    if (!isLatePenaltyMonth(row.month_key)) continue;
    await reconcileLatePenaltiesForEmployeeMonth(client, row.user_id, row.month_key);
  }
}

export async function fetchLatePenaltiesForMonth(pool, monthKey, { employeeId = null } = {}) {
  if (!isLatePenaltyMonth(monthKey)) return [];

  const params = [monthKey];
  let where = "month = $1";
  if (employeeId) {
    params.push(employeeId);
    where += ` AND employee_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT lp.*, u.name AS employee_name
     FROM late_penalties lp
     JOIN users u ON u.id = lp.employee_id
     WHERE ${where} AND u.role NOT IN ('Admin', 'HR Admin')
     ORDER BY u.name`,
    params
  );
  return rows.map(r => ({
    ...latePenaltyToJs(r),
    employeeName: r.employee_name,
  }));
}
