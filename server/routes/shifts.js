function shiftToJs(r) {
  return {
    id: r.id,
    name: r.name,
    graceMinutes: r.grace_minutes ?? 15,
    breakMinutes: r.break_minutes ?? 60,
    checkoutGraceMinutes: r.checkout_grace_minutes ?? 10,
    weeklySchedule: r.weekly_schedule || {},
    isDefault: r.is_default === true,
  };
}

export function registerShiftsRoutes(app, pool, requireAuth, requireHrAdmin) {
  app.get("/api/shifts", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM shifts ORDER BY name");
      res.json(rows.map(shiftToJs));
    } catch (e) {
      console.error("GET /api/shifts error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/shifts", requireHrAdmin, async (req, res) => {
    const r = req.body || {};
    const id = r.id || `shift-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = (r.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    try {
      const { rows } = await pool.query(
        `INSERT INTO shifts (id, name, grace_minutes, break_minutes, checkout_grace_minutes, weekly_schedule, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           grace_minutes = EXCLUDED.grace_minutes,
           break_minutes = EXCLUDED.break_minutes,
           checkout_grace_minutes = EXCLUDED.checkout_grace_minutes,
           weekly_schedule = EXCLUDED.weekly_schedule,
           is_default = EXCLUDED.is_default
         RETURNING *`,
        [
          id,
          name,
          r.graceMinutes ?? 15,
          r.breakMinutes ?? 60,
          r.checkoutGraceMinutes ?? 10,
          JSON.stringify(r.weeklySchedule || {}),
          r.isDefault === true,
        ],
      );
      res.json({ shift: shiftToJs(rows[0]) });
    } catch (e) {
      console.error("POST /api/shifts error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/shifts/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const r = req.body || {};
    const name = (r.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    try {
      const { rows } = await pool.query(
        `UPDATE shifts
         SET name = $2, grace_minutes = $3, break_minutes = $4, checkout_grace_minutes = $5,
             weekly_schedule = $6, is_default = $7
         WHERE id = $1
         RETURNING *`,
        [
          id,
          name,
          r.graceMinutes ?? 15,
          r.breakMinutes ?? 60,
          r.checkoutGraceMinutes ?? 10,
          JSON.stringify(r.weeklySchedule || {}),
          r.isDefault === true,
        ],
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ shift: shiftToJs(rows[0]) });
    } catch (e) {
      console.error("PUT /api/shifts/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/shifts/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    try {
      const { rows } = await pool.query("DELETE FROM shifts WHERE id = $1 RETURNING *", [id]);
      res.json({ ok: true, deleted: rows[0] ? shiftToJs(rows[0]) : null });
    } catch (e) {
      console.error("DELETE /api/shifts/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
