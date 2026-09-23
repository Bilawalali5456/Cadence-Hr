import ExcelJS from "exceljs";
import { HR_OPS_ROLES } from "../lib/rbac.js";
import { buildPayslip, monthToRange, MONTH_NAMES } from "../lib/payrollCalc.js";
import { syncAutoSalaryExpense } from "../lib/financeSalary.js";

function slipToJs(data) {
  return data && typeof data === "object" ? data : null;
}

function canGenerateForTarget(actor, targetUserId) {
  if (actor.role === "HR Employee" && actor.id === targetUserId) {
    return false;
  }
  return true;
}

async function loadHolidaysForMonth(pool, month) {
  const range = monthToRange(month);
  if (!range) return [];
  const { rows } = await pool.query(
    `SELECT id, title, date, type FROM holidays WHERE date >= $1 AND date <= $2`,
    [range.start, range.end]
  );
  return rows;
}

async function loadAttendanceForMonth(pool, month) {
  const range = monthToRange(month);
  if (!range) return [];
  const { rows } = await pool.query(
    `SELECT user_id, date, check_in, late FROM attendance
     WHERE date >= $1 AND date <= $2`,
    [range.start, range.end]
  );
  return rows;
}

async function loadLeavesForMonth(pool, month) {
  const range = monthToRange(month);
  if (!range) return [];
  const { rows } = await pool.query(
    `SELECT user_id, type, from_date, to_date, status, pay_tag
     FROM leave_requests
     WHERE status = 'approved'
       AND from_date <= $2
       AND to_date >= $1`,
    [range.start, range.end]
  );
  return rows;
}

async function loadLatePenalty(pool, userId, month) {
  const { rows } = await pool.query(
    `SELECT * FROM late_penalties WHERE employee_id = $1 AND month = $2 LIMIT 1`,
    [userId, month]
  );
  return rows[0] || null;
}

async function upsertSlip(pool, slip) {
  const { rows: existing } = await pool.query(
    `SELECT id FROM payroll WHERE user_id = $1 AND month = $2 LIMIT 1`,
    [slip.userId, slip.month]
  );
  const id = existing[0]?.id || slip.id;
  const data = { ...slip, id };
  const { rows } = await pool.query(
    `INSERT INTO payroll (id, user_id, month, data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       month = EXCLUDED.month,
       data = EXCLUDED.data
     RETURNING data`,
    [id, slip.userId, slip.month, JSON.stringify(data)]
  );
  return slipToJs(rows[0].data);
}

async function buildSlipForUser(pool, userRow, month, ctx, generatedBy) {
  const latePenalty = await loadLatePenalty(pool, userRow.id, month);
  return buildPayslip({
    user: userRow,
    month,
    attendanceRows: ctx.attendance,
    leaveRows: ctx.leaves,
    holidays: ctx.holidays,
    latePenalty,
    generatedBy,
  });
}

export function registerPayrollRoutes(app, pool, requireAuth, requireHrAdmin, requireExecutive) {
  app.get("/api/payroll", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const roleCanViewAll = HR_OPS_ROLES.includes(actor.role);

      const month = String(req.query.month || "").trim();
      const userId = String(req.query.userId || "").trim();

      const where = [];
      const params = [];

      if (month) {
        params.push(month);
        where.push(`month = $${params.length}`);
      }

      if (!roleCanViewAll) {
        params.push(actor.id);
        where.push(`user_id = $${params.length}`);
      } else if (userId) {
        params.push(userId);
        where.push(`user_id = $${params.length}`);
      }

      const sql = `SELECT data FROM payroll${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY month DESC`;
      const { rows } = await pool.query(sql, params);
      res.json(rows.map(r => slipToJs(r.data)).filter(Boolean));
    } catch (e) {
      console.error("GET /api/payroll error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Server-side generate for one employee (HR Employee + Executive). */
  app.post("/api/payroll/generate", requireAuth, requireHrAdmin, async (req, res) => {
    try {
      const actor = req.authUser;
      const userId = String(req.body?.userId || req.body?.user_id || "").trim();
      const month = String(req.body?.month || "").trim();
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!monthToRange(month)) return res.status(400).json({ error: "month is required (YYYY-MM)" });
      if (!canGenerateForTarget(actor, userId)) {
        return res.status(403).json({ error: "Forbidden — cannot generate your own payslip" });
      }

      const { rows: users } = await pool.query(
        `SELECT id, name, email, role, title, designation, salary, status,
                bank_name, bank_branch, bank_account, bank_iban, account_title,
                COALESCE(fuel_allowance, 0) AS fuel_allowance,
                COALESCE(mobile_package, 0) AS mobile_package
         FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const user = users[0];
      if (!user) return res.status(404).json({ error: "Employee not found" });
      if (user.status !== "active") return res.status(400).json({ error: "Employee is not active" });
      if (user.role === "Admin" || user.role === "HR Admin") {
        return res.status(400).json({ error: "Cannot generate payroll for Admin" });
      }

      const [holidays, attendance, leaves] = await Promise.all([
        loadHolidaysForMonth(pool, month),
        loadAttendanceForMonth(pool, month),
        loadLeavesForMonth(pool, month),
      ]);
      const slip = await buildSlipForUser(
        pool,
        user,
        month,
        { holidays, attendance, leaves },
        actor.name || actor.email || "HR"
      );
      const saved = await upsertSlip(pool, slip);
      try {
        await syncAutoSalaryExpense(pool, month, actor.id);
      } catch (syncErr) {
        console.error("syncAutoSalaryExpense (generate) error:", syncErr.message);
      }
      res.json({ slip: saved });
    } catch (e) {
      console.error("POST /api/payroll/generate error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Generate all slips for a month — Executive only. */
  app.post("/api/payroll/generate-all", requireAuth, requireExecutive, async (req, res) => {
    try {
      const actor = req.authUser;
      const month = String(req.query.month || req.body?.month || "").trim();
      if (!monthToRange(month)) return res.status(400).json({ error: "month is required (YYYY-MM)" });

      const { rows: users } = await pool.query(
        `SELECT id, name, email, role, title, designation, salary, status,
                bank_name, bank_branch, bank_account, bank_iban, account_title,
                COALESCE(fuel_allowance, 0) AS fuel_allowance,
                COALESCE(mobile_package, 0) AS mobile_package
         FROM users
         WHERE status = 'active'
           AND role IS DISTINCT FROM 'Admin'
           AND role IS DISTINCT FROM 'HR Admin'
           AND role IS DISTINCT FROM 'Executive'
         ORDER BY LOWER(name)`
      );

      const [holidays, attendance, leaves] = await Promise.all([
        loadHolidaysForMonth(pool, month),
        loadAttendanceForMonth(pool, month),
        loadLeavesForMonth(pool, month),
      ]);
      const ctx = { holidays, attendance, leaves };
      const generatedBy = actor.name || "Executive";

      let generated = 0;
      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      const slips = [];

      for (const user of users) {
        const slip = await buildSlipForUser(pool, user, month, ctx, generatedBy);
        const saved = await upsertSlip(pool, slip);
        slips.push(saved);
        generated += 1;
        totalGross += Number(saved.grossSalary || saved.gross || 0);
        totalDeductions += Number(saved.totalDeductions || 0);
        totalNet += Number(saved.net || 0);
      }

      try {
        await syncAutoSalaryExpense(pool, month, actor.id);
      } catch (syncErr) {
        console.error("syncAutoSalaryExpense (generate-all) error:", syncErr.message);
      }

      res.json({
        ok: true,
        month,
        generated,
        totalGross: Math.round(totalGross),
        totalDeductions: Math.round(totalDeductions),
        totalNet: Math.round(totalNet),
        slips,
      });
    } catch (e) {
      console.error("POST /api/payroll/generate-all error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Bank sheet Excel — Executive only. */
  app.get("/api/payroll/bank-sheet", requireAuth, requireExecutive, async (req, res) => {
    try {
      const month = String(req.query.month || "").trim();
      const range = monthToRange(month);
      if (!range) return res.status(400).json({ error: "month is required (YYYY-MM)" });

      const { rows } = await pool.query(
        `SELECT data FROM payroll WHERE month = $1 ORDER BY data->>'empName'`,
        [month]
      );
      const slips = rows.map(r => slipToJs(r.data)).filter(Boolean);
      if (slips.length === 0) {
        return res.status(404).json({ error: "No payslips generated for this month" });
      }

      const wb = new ExcelJS.Workbook();
      const sheetName = `${MONTH_NAMES[range.monthIndex]} ${range.year}`;
      const ws = wb.addWorksheet("Bank Sheet");
      const headers = [
        "Sr. No", "Employee Name", "Bank Name", "Account Number", "Account Title",
        "Gross Salary", "Total Deductions", "Net Salary",
      ];
      const headerRow = ws.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      });

      let sumGross = 0;
      let sumDed = 0;
      let sumNet = 0;
      slips.forEach((s, i) => {
        const gross = Number(s.grossSalary ?? s.gross ?? 0);
        const ded = Number(s.totalDeductions ?? 0);
        const net = Number(s.net ?? 0);
        sumGross += gross;
        sumDed += ded;
        sumNet += net;
        ws.addRow([
          i + 1,
          s.empName || "",
          s.bank?.bankName || "",
          s.bank?.accountNo || "",
          s.bank?.accountTitle || "",
          gross,
          ded,
          net,
        ]);
      });

      const totalRow = ws.addRow(["", "TOTALS", "", "", "", sumGross, sumDed, sumNet]);
      totalRow.font = { bold: true };

      ws.columns.forEach((col, idx) => {
        let max = headers[idx]?.length || 10;
        col.eachCell({ includeEmpty: true }, cell => {
          const len = String(cell.value ?? "").length;
          if (len > max) max = len;
        });
        col.width = Math.min(Math.max(max + 2, 12), 36);
      });

      const fileName = `Bank_Sheet_${MONTH_NAMES[range.monthIndex]}_${range.year}.xlsx`;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (e) {
      console.error("GET /api/payroll/bank-sheet error:", e.message);
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });

  // Legacy create/save slip (still used if client sends precomputed slip)
  app.post("/api/payroll", requireHrAdmin, async (req, res) => {
    const r = req.body || {};
    const id = r.id || `slip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const userId = r.userId || r.user_id;
    const month = r.month;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!month) return res.status(400).json({ error: "month is required" });
    if (!canGenerateForTarget(req.authUser, userId)) {
      return res.status(403).json({ error: "Forbidden — cannot generate your own payslip" });
    }

    try {
      const data = { ...r, id, userId, month };
      const saved = await upsertSlip(pool, data);
      res.json({ slip: saved });
    } catch (e) {
      console.error("POST /api/payroll error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/payroll/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const r = req.body || {};
    const userId = r.userId || r.user_id;
    const month = r.month;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!month) return res.status(400).json({ error: "month is required" });

    try {
      const data = { ...r, id, userId, month };
      const { rows } = await pool.query(
        `UPDATE payroll
         SET user_id = $2, month = $3, data = $4
         WHERE id = $1
         RETURNING data`,
        [id, userId, month, JSON.stringify(data)],
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ slip: slipToJs(rows[0].data) });
    } catch (e) {
      console.error("PUT /api/payroll/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/payroll/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });
    try {
      const { rows } = await pool.query("DELETE FROM payroll WHERE id = $1 RETURNING data", [id]);
      const deleted = rows[0] ? slipToJs(rows[0].data) : null;
      if (deleted?.month) {
        try {
          await syncAutoSalaryExpense(pool, deleted.month, req.authUser?.id || null);
        } catch (syncErr) {
          console.error("syncAutoSalaryExpense (delete) error:", syncErr.message);
        }
      }
      res.json({ ok: true, deleted });
    } catch (e) {
      console.error("DELETE /api/payroll/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
