import { MONTH_NAMES, monthToRange } from "./payrollCalc.js";

function genId(prefix = "exp") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function slipNet(data) {
  if (!data || typeof data !== "object") return 0;
  const n = Number(data.net ?? data.netSalary ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * After payroll generate: upsert one auto "Salaries" expense for the month
 * = sum of net for all slips in that month. Deletes auto row if no slips remain.
 */
export async function syncAutoSalaryExpense(pool, month, actorId = null) {
  const range = monthToRange(month);
  if (!range) return null;

  const { rows } = await pool.query(
    `SELECT data FROM payroll WHERE month = $1`,
    [month]
  );
  const slips = rows.map(r => r.data).filter(d => d && typeof d === "object");
  const count = slips.length;
  const totalNet = Math.round(slips.reduce((sum, d) => sum + slipNet(d), 0));

  const { rows: existing } = await pool.query(
    `SELECT id FROM expenses
     WHERE is_auto = true AND payroll_month = $1
     LIMIT 1`,
    [month]
  );

  if (count === 0) {
    if (existing[0]) {
      await pool.query(`DELETE FROM expenses WHERE id = $1`, [existing[0].id]);
    }
    return null;
  }

  const monthLabel = `${MONTH_NAMES[range.monthIndex]} ${range.year}`;
  const description = `Payroll for ${monthLabel} — ${count} employee${count === 1 ? "" : "s"}`;
  // Mid-month date for the expense (display); category Salaries.
  const expenseDate = `${month}-15`;

  if (existing[0]) {
    const { rows: updated } = await pool.query(
      `UPDATE expenses SET
         category = 'Salaries',
         amount = $1,
         currency = 'PKR',
         description = $2,
         date = $3::date,
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [totalNet, description, expenseDate, existing[0].id]
    );
    return updated[0] || null;
  }

  const { rows: inserted } = await pool.query(
    `INSERT INTO expenses (
       id, category, amount, currency, description, date,
       added_by, is_auto, payroll_month
     ) VALUES ($1,$2,$3,'PKR',$4,$5::date,$6,true,$7)
     RETURNING *`,
    [genId("exp"), "Salaries", totalNet, description, expenseDate, actorId, month]
  );
  return inserted[0] || null;
}
