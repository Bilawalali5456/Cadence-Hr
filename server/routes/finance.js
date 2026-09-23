import ExcelJS from "exceljs";
import { MONTH_NAMES, monthToRange } from "../lib/payrollCalc.js";

function genId(prefix = "exp") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function monthBounds(month) {
  const range = monthToRange(month);
  if (!range) return null;
  return range;
}

function prevMonthKey(month) {
  const range = monthToRange(month);
  if (!range) return null;
  let y = range.year;
  let m = range.monthIndex; // 0-based
  m -= 1;
  if (m < 0) {
    m = 11;
    y -= 1;
  }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function expenseToJs(r) {
  if (!r) return null;
  return {
    id: r.id,
    category: r.category,
    amount: Number(r.amount) || 0,
    currency: r.currency || "PKR",
    description: r.description || "",
    date: r.date ? String(r.date).slice(0, 10) : null,
    addedBy: r.added_by || null,
    isAuto: !!r.is_auto,
    payrollMonth: r.payroll_month || null,
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  };
}

function categoryToJs(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    isDefault: !!r.is_default,
    createdBy: r.created_by || null,
    createdAt: r.created_at || null,
  };
}

function normalizeCurrency(raw) {
  const c = String(raw || "PKR").trim().toUpperCase();
  return c === "USD" ? "USD" : "PKR";
}

function sumByCurrency(rows, amountKey = "amount", currencyKey = "currency") {
  let pkr = 0;
  let usd = 0;
  for (const r of rows || []) {
    const amt = Number(r[amountKey]) || 0;
    const cur = normalizeCurrency(r[currencyKey]);
    if (cur === "USD") usd += amt;
    else pkr += amt;
  }
  return { pkr: Math.round(pkr * 100) / 100, usd: Math.round(usd * 100) / 100 };
}

async function loadExpensesForMonth(pool, month) {
  const range = monthBounds(month);
  if (!range) return [];
  const { rows } = await pool.query(
    `SELECT * FROM expenses
     WHERE date >= $1::date AND date <= $2::date
     ORDER BY date DESC, created_at DESC`,
    [range.start, range.end]
  );
  return rows;
}

async function loadRevenueForMonth(pool, month) {
  const range = monthBounds(month);
  if (!range) return [];
  const { rows } = await pool.query(
    `SELECT p.id, p.lead_id, p.amount, p.currency, p.payment_date, p.payment_status,
            p.payment_method, p.notes,
            l.client_name, l.business_name
     FROM lead_payments p
     LEFT JOIN leads l ON l.id = p.lead_id
     WHERE p.payment_status = 'Received'
       AND p.payment_date >= $1::date
       AND p.payment_date <= $2::date
     ORDER BY p.payment_date DESC, p.created_at DESC`,
    [range.start, range.end]
  );
  return rows;
}

function buildMonthSummary(month, expenseRows, revenueRows) {
  const expenses = sumByCurrency(expenseRows);
  const revenue = sumByCurrency(revenueRows);

  const byCategoryMap = new Map();
  for (const r of expenseRows) {
    const cat = r.category || "Miscellaneous";
    const cur = normalizeCurrency(r.currency);
    const amt = Number(r.amount) || 0;
    if (!byCategoryMap.has(cat)) {
      byCategoryMap.set(cat, { category: cat, pkr: 0, usd: 0, count: 0 });
    }
    const entry = byCategoryMap.get(cat);
    if (cur === "USD") entry.usd += amt;
    else entry.pkr += amt;
    entry.count += 1;
  }
  const byCategory = [...byCategoryMap.values()]
    .map(c => ({
      category: c.category,
      pkr: Math.round(c.pkr * 100) / 100,
      usd: Math.round(c.usd * 100) / 100,
      count: c.count,
      amount: Math.round(c.pkr * 100) / 100,
    }))
    .sort((a, b) => (b.pkr + b.usd) - (a.pkr + a.usd));

  let salaryTotal = 0;
  for (const r of expenseRows) {
    if (r.is_auto && r.category === "Salaries") {
      salaryTotal += Number(r.amount) || 0;
    }
  }

  const netPkr = Math.round((revenue.pkr - expenses.pkr) * 100) / 100;
  const netUsd = Math.round((revenue.usd - expenses.usd) * 100) / 100;

  return {
    month,
    revenue: {
      pkr: revenue.pkr,
      usd: revenue.usd,
      total: revenue.pkr,
    },
    expenses: {
      pkr: expenses.pkr,
      usd: expenses.usd,
      total: expenses.pkr,
    },
    salaryTotal: Math.round(salaryTotal * 100) / 100,
    byCategory,
    netProfit: {
      pkr: netPkr,
      usd: netUsd,
      total: netPkr,
    },
  };
}

function changeMetrics(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const amount = Math.round((cur - prev) * 100) / 100;
  let percent = null;
  if (prev !== 0) {
    percent = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
  } else if (cur !== 0) {
    percent = 100;
  } else {
    percent = 0;
  }
  return { amount, percent, improved: amount >= 0 };
}

export function registerFinanceRoutes(app, pool, requireAuth, requireExecutive) {
  /** List expenses for a month — Executive only. */
  app.get("/api/expenses", requireAuth, requireExecutive, async (req, res) => {
    try {
      const month = String(req.query.month || "").trim();
      if (!monthBounds(month)) {
        return res.status(400).json({ error: "month is required (YYYY-MM)" });
      }
      const rows = await loadExpensesForMonth(pool, month);
      res.json(rows.map(expenseToJs));
    } catch (e) {
      console.error("GET /api/expenses error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Add expense — Executive only. */
  app.post("/api/expenses", requireAuth, requireExecutive, async (req, res) => {
    try {
      const actor = req.authUser;
      const body = req.body || {};
      const category = String(body.category || "").trim();
      const amount = Number(body.amount);
      const currency = normalizeCurrency(body.currency);
      const description = String(body.description || "").trim();
      const date = String(body.date || "").slice(0, 10);

      if (!category) return res.status(400).json({ error: "category is required" });
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ error: "amount must be a non-negative number" });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
      }

      const { rows: cats } = await pool.query(
        `SELECT id FROM expense_categories WHERE name = $1 LIMIT 1`,
        [category]
      );
      if (!cats[0]) return res.status(400).json({ error: "Unknown expense category" });

      const { rows } = await pool.query(
        `INSERT INTO expenses (
           id, category, amount, currency, description, date, added_by, is_auto
         ) VALUES ($1,$2,$3,$4,$5,$6::date,$7,false)
         RETURNING *`,
        [genId("exp"), category, amount, currency, description, date, actor.id]
      );
      res.status(201).json(expenseToJs(rows[0]));
    } catch (e) {
      console.error("POST /api/expenses error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Update expense — Executive only; auto salary protected. */
  app.put("/api/expenses/:id", requireAuth, requireExecutive, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      const { rows: existingRows } = await pool.query(
        `SELECT * FROM expenses WHERE id = $1 LIMIT 1`,
        [id]
      );
      const existing = existingRows[0];
      if (!existing) return res.status(404).json({ error: "Expense not found" });
      if (existing.is_auto) {
        return res.status(403).json({ error: "Auto salary expenses cannot be edited" });
      }

      const body = req.body || {};
      const category = body.category != null ? String(body.category).trim() : existing.category;
      const amount = body.amount != null ? Number(body.amount) : Number(existing.amount);
      const currency = body.currency != null ? normalizeCurrency(body.currency) : normalizeCurrency(existing.currency);
      const description = body.description != null ? String(body.description).trim() : (existing.description || "");
      const date = body.date != null ? String(body.date).slice(0, 10) : String(existing.date).slice(0, 10);

      if (!category) return res.status(400).json({ error: "category is required" });
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ error: "amount must be a non-negative number" });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
      }

      const { rows: cats } = await pool.query(
        `SELECT id FROM expense_categories WHERE name = $1 LIMIT 1`,
        [category]
      );
      if (!cats[0]) return res.status(400).json({ error: "Unknown expense category" });

      const { rows } = await pool.query(
        `UPDATE expenses SET
           category = $1,
           amount = $2,
           currency = $3,
           description = $4,
           date = $5::date
         WHERE id = $6
         RETURNING *`,
        [category, amount, currency, description, date, id]
      );
      res.json(expenseToJs(rows[0]));
    } catch (e) {
      console.error("PUT /api/expenses/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Delete expense — Executive only; auto salary protected. */
  app.delete("/api/expenses/:id", requireAuth, requireExecutive, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      const { rows: existingRows } = await pool.query(
        `SELECT * FROM expenses WHERE id = $1 LIMIT 1`,
        [id]
      );
      const existing = existingRows[0];
      if (!existing) return res.status(404).json({ error: "Expense not found" });
      if (existing.is_auto) {
        return res.status(403).json({ error: "Auto salary expenses cannot be deleted" });
      }
      await pool.query(`DELETE FROM expenses WHERE id = $1`, [id]);
      res.json({ ok: true, id });
    } catch (e) {
      console.error("DELETE /api/expenses/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** List categories — Executive only. */
  app.get("/api/expense-categories", requireAuth, requireExecutive, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM expense_categories ORDER BY is_default DESC, LOWER(name)`
      );
      res.json(rows.map(categoryToJs));
    } catch (e) {
      console.error("GET /api/expense-categories error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Add custom category — Executive only. */
  app.post("/api/expense-categories", requireAuth, requireExecutive, async (req, res) => {
    try {
      const actor = req.authUser;
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "name is required" });
      if (name.length > 80) return res.status(400).json({ error: "name is too long" });

      const { rows: dup } = await pool.query(
        `SELECT id FROM expense_categories WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [name]
      );
      if (dup[0]) return res.status(409).json({ error: "Category already exists" });

      const { rows } = await pool.query(
        `INSERT INTO expense_categories (id, name, is_default, created_by)
         VALUES ($1,$2,false,$3)
         RETURNING *`,
        [genId("exp-cat"), name, actor.id]
      );
      res.status(201).json(categoryToJs(rows[0]));
    } catch (e) {
      console.error("POST /api/expense-categories error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Delete custom category — Executive only; defaults protected. */
  app.delete("/api/expense-categories/:id", requireAuth, requireExecutive, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      const { rows } = await pool.query(
        `SELECT * FROM expense_categories WHERE id = $1 LIMIT 1`,
        [id]
      );
      const cat = rows[0];
      if (!cat) return res.status(404).json({ error: "Category not found" });
      if (cat.is_default) {
        return res.status(403).json({ error: "Default categories cannot be deleted" });
      }

      const { rows: used } = await pool.query(
        `SELECT id FROM expenses WHERE category = $1 LIMIT 1`,
        [cat.name]
      );
      if (used[0]) {
        return res.status(400).json({ error: "Category is in use by expenses" });
      }

      await pool.query(`DELETE FROM expense_categories WHERE id = $1`, [id]);
      res.json({ ok: true, id });
    } catch (e) {
      console.error("DELETE /api/expense-categories/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Monthly finance summary — Executive only. */
  app.get("/api/finance/summary", requireAuth, requireExecutive, async (req, res) => {
    try {
      const month = String(req.query.month || "").trim();
      if (!monthBounds(month)) {
        return res.status(400).json({ error: "month is required (YYYY-MM)" });
      }

      const prev = prevMonthKey(month);
      const [expenseRows, revenueRows, prevExpenses, prevRevenue] = await Promise.all([
        loadExpensesForMonth(pool, month),
        loadRevenueForMonth(pool, month),
        loadExpensesForMonth(pool, prev),
        loadRevenueForMonth(pool, prev),
      ]);

      const current = buildMonthSummary(month, expenseRows, revenueRows);
      const previous = buildMonthSummary(prev, prevExpenses, prevRevenue);

      const profitChange = changeMetrics(current.netProfit.pkr, previous.netProfit.pkr);
      const revenueChange = changeMetrics(current.revenue.pkr, previous.revenue.pkr);
      const expenseChange = changeMetrics(current.expenses.pkr, previous.expenses.pkr);

      res.json({
        ...current,
        previousMonth: previous,
        comparison: {
          profit: profitChange,
          revenue: revenueChange,
          expenses: {
            ...expenseChange,
            // Lower expenses are "better"
            improved: expenseChange.amount <= 0,
          },
        },
        revenueEntries: revenueRows.map(r => ({
          id: r.id,
          leadId: r.lead_id,
          clientName: r.client_name || r.business_name || "—",
          amount: Number(r.amount) || 0,
          currency: r.currency || "USD",
          date: r.payment_date ? String(r.payment_date).slice(0, 10) : null,
          status: r.payment_status,
          method: r.payment_method || "",
        })),
        expensesList: expenseRows.map(expenseToJs),
      });
    } catch (e) {
      console.error("GET /api/finance/summary error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Yearly monthly breakdown — Executive only. */
  app.get("/api/finance/yearly", requireAuth, requireExecutive, async (req, res) => {
    try {
      const year = Number(String(req.query.year || "").trim());
      if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: "year is required (YYYY)" });
      }

      const months = [];
      let runningPkr = 0;
      let runningUsd = 0;

      for (let i = 1; i <= 12; i++) {
        const month = `${year}-${String(i).padStart(2, "0")}`;
        const [expenseRows, revenueRows] = await Promise.all([
          loadExpensesForMonth(pool, month),
          loadRevenueForMonth(pool, month),
        ]);
        const summary = buildMonthSummary(month, expenseRows, revenueRows);
        runningPkr += summary.netProfit.pkr;
        runningUsd += summary.netProfit.usd;
        months.push({
          month,
          label: MONTH_NAMES[i - 1],
          revenue: summary.revenue,
          expenses: summary.expenses,
          netProfit: summary.netProfit,
          runningTotal: {
            pkr: Math.round(runningPkr * 100) / 100,
            usd: Math.round(runningUsd * 100) / 100,
          },
        });
      }

      res.json({ year, months });
    } catch (e) {
      console.error("GET /api/finance/yearly error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Excel financial report — Executive only. */
  app.get("/api/finance/export", requireAuth, requireExecutive, async (req, res) => {
    try {
      const month = String(req.query.month || "").trim();
      const range = monthBounds(month);
      if (!range) return res.status(400).json({ error: "month is required (YYYY-MM)" });

      const [expenseRows, revenueRows] = await Promise.all([
        loadExpensesForMonth(pool, month),
        loadRevenueForMonth(pool, month),
      ]);
      const summary = buildMonthSummary(month, expenseRows, revenueRows);
      const monthLabel = `${MONTH_NAMES[range.monthIndex]} ${range.year}`;

      const wb = new ExcelJS.Workbook();
      wb.creator = "Cadence HR";
      wb.created = new Date();

      const pl = wb.addWorksheet("P&L");
      pl.columns = [
        { header: "Item", key: "item", width: 32 },
        { header: "PKR", key: "pkr", width: 16 },
        { header: "USD", key: "usd", width: 16 },
      ];
      pl.addRow({ item: `Revenue — ${monthLabel}`, pkr: summary.revenue.pkr, usd: summary.revenue.usd });
      pl.addRow({ item: "Total Expenses", pkr: summary.expenses.pkr, usd: summary.expenses.usd });
      pl.addRow({ item: "", pkr: "", usd: "" });
      pl.addRow({ item: "Expenses by category", pkr: "", usd: "" });
      for (const c of summary.byCategory) {
        pl.addRow({ item: c.category, pkr: c.pkr, usd: c.usd });
      }
      pl.addRow({ item: "", pkr: "", usd: "" });
      pl.addRow({ item: "Net Profit / Loss", pkr: summary.netProfit.pkr, usd: summary.netProfit.usd });
      pl.getRow(1).font = { bold: true };

      const expSheet = wb.addWorksheet("Expenses");
      expSheet.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "Category", key: "category", width: 18 },
        { header: "Description", key: "description", width: 40 },
        { header: "Amount", key: "amount", width: 14 },
        { header: "Currency", key: "currency", width: 10 },
        { header: "Auto", key: "auto", width: 10 },
      ];
      for (const r of expenseRows) {
        expSheet.addRow({
          date: String(r.date).slice(0, 10),
          category: r.category,
          description: r.description || "",
          amount: Number(r.amount) || 0,
          currency: r.currency || "PKR",
          auto: r.is_auto ? "Yes" : "",
        });
      }
      expSheet.getRow(1).font = { bold: true };

      const revSheet = wb.addWorksheet("Revenue");
      revSheet.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "Client", key: "client", width: 28 },
        { header: "Amount", key: "amount", width: 14 },
        { header: "Currency", key: "currency", width: 10 },
        { header: "Status", key: "status", width: 12 },
        { header: "Lead ID", key: "leadId", width: 20 },
      ];
      for (const r of revenueRows) {
        revSheet.addRow({
          date: r.payment_date ? String(r.payment_date).slice(0, 10) : "",
          client: r.client_name || r.business_name || "",
          amount: Number(r.amount) || 0,
          currency: r.currency || "USD",
          status: r.payment_status,
          leadId: r.lead_id,
        });
      }
      revSheet.getRow(1).font = { bold: true };

      const fileName = `Finance_${MONTH_NAMES[range.monthIndex]}_${range.year}.xlsx`;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (e) {
      console.error("GET /api/finance/export error:", e.message);
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });
}
