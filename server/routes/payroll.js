import { HR_ADMIN_ROLES } from "../lib/auth.js";

function slipToJs(data) {
  // Stored as JSON in payroll.data; pg typically returns it as an object already.
  return data && typeof data === "object" ? data : null;
}

export function registerPayrollRoutes(app, pool, requireAuth, requireHrAdmin) {
  app.get("/api/payroll", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const roleCanViewAll = HR_ADMIN_ROLES.includes(actor.role);

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

  // Create/generate slip (HR Admin only)
  app.post("/api/payroll", requireHrAdmin, async (req, res) => {
    const r = req.body || {};
    const id = r.id || `slip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const userId = r.userId || r.user_id;
    const month = r.month;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!month) return res.status(400).json({ error: "month is required" });

    try {
      const data = { ...r, id, userId, month };
      const { rows } = await pool.query(
        `INSERT INTO payroll (id, user_id, month, data)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           month = EXCLUDED.month,
           data = EXCLUDED.data
         RETURNING data`,
        [id, userId, month, JSON.stringify(data)],
      );
      res.json({ slip: slipToJs(rows[0].data) });
    } catch (e) {
      console.error("POST /api/payroll error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Update slip (HR Admin only)
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

  // Delete slip (HR Admin only)
  app.delete("/api/payroll/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });
    try {
      const { rows } = await pool.query("DELETE FROM payroll WHERE id = $1 RETURNING data", [id]);
      res.json({ ok: true, deleted: rows[0] ? slipToJs(rows[0].data) : null });
    } catch (e) {
      console.error("DELETE /api/payroll/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

