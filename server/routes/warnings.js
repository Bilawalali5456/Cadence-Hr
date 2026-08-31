import { HR_OPS_ROLES } from "../lib/rbac.js";

function warningToJs(r) {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type || "verbal",
    reason: r.reason || "",
    date: r.date || "",
    issuedBy: r.issued_by || "",
    acknowledged: !!r.acknowledged,
  };
}

export function registerWarningsRoutes(app, pool, requireAuth, requireHrAdmin) {
  app.get("/api/warnings", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const userId = String(req.query.userId || "").trim();
      const roleCanViewAll = HR_OPS_ROLES.includes(actor.role);

      const params = [];
      const where = [];

      if (!roleCanViewAll) {
        params.push(actor.id);
        where.push(`user_id = $${params.length}`);
      } else if (userId) {
        params.push(userId);
        where.push(`user_id = $${params.length}`);
      }

      const sql = `SELECT * FROM warnings${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY date DESC`;
      const { rows } = await pool.query(sql, params);
      res.json(rows.map(warningToJs));
    } catch (e) {
      console.error("GET /api/warnings error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/warnings", requireHrAdmin, async (req, res) => {
    const r = req.body || {};
    const id = r.id || `warn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const userId = r.userId || r.user_id;
    const reason = (r.reason || "").trim();
    const type = String(r.type || "verbal").toLowerCase();
    const date = r.date || new Date().toISOString().slice(0, 10);
    const issuedBy = (r.issuedBy || r.issued_by || "").trim();

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!reason) return res.status(400).json({ error: "reason is required" });
    if (!issuedBy) return res.status(400).json({ error: "issuedBy is required" });

    try {
      const { rows } = await pool.query(
        `INSERT INTO warnings (id, user_id, type, reason, date, issued_by, acknowledged)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           type = EXCLUDED.type,
           reason = EXCLUDED.reason,
           date = EXCLUDED.date,
           issued_by = EXCLUDED.issued_by,
           acknowledged = EXCLUDED.acknowledged
         RETURNING *`,
        [id, userId, type, reason, date, issuedBy, r.acknowledged === true],
      );
      res.json({ warning: warningToJs(rows[0]) });
    } catch (e) {
      console.error("POST /api/warnings error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/warnings/:id", requireAuth, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const actor = req.authUser;
    const isHr = HR_OPS_ROLES.includes(actor.role);

    try {
      const { rows: existingRows } = await pool.query("SELECT * FROM warnings WHERE id = $1", [id]);
      const existing = existingRows[0];
      if (!existing) return res.status(404).json({ error: "Not found" });

      const isSelf = existing.user_id === actor.id;
      if (!isHr && !isSelf) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const r = req.body || {};

      if (!isHr) {
        // Self-acknowledge only
        const { rows } = await pool.query(
          `UPDATE warnings SET acknowledged = true WHERE id = $1 RETURNING *`,
          [id],
        );
        return res.json({ warning: warningToJs(rows[0]) });
      }

      const userId = r.userId || r.user_id || existing.user_id;
      const reason = (r.reason || existing.reason || "").trim();
      const type = String(r.type || existing.type || "verbal").toLowerCase();
      const date = r.date || existing.date || "";
      const issuedBy = (r.issuedBy || r.issued_by || existing.issued_by || "").trim();
      const acknowledged = r.acknowledged != null ? r.acknowledged === true : existing.acknowledged;

      const { rows } = await pool.query(
        `UPDATE warnings
         SET user_id = $2, type = $3, reason = $4, date = $5, issued_by = $6, acknowledged = $7
         WHERE id = $1
         RETURNING *`,
        [id, userId, type, reason, date, issuedBy, acknowledged],
      );
      res.json({ warning: warningToJs(rows[0]) });
    } catch (e) {
      console.error("PUT /api/warnings/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/warnings/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    try {
      const { rows } = await pool.query("DELETE FROM warnings WHERE id = $1 RETURNING *", [id]);
      res.json({ ok: true, deleted: rows[0] ? warningToJs(rows[0]) : null });
    } catch (e) {
      console.error("DELETE /api/warnings/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
