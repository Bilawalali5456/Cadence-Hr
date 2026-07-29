function holidayToJs(r) {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    type: r.type || "public",
  };
}

export function registerHolidaysRoutes(app, pool, requireAuth, requireHrAdmin) {
  // Any authenticated user can list holidays
  app.get("/api/holidays", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM holidays ORDER BY date");
      res.json(rows.map(holidayToJs));
    } catch (e) {
      console.error("GET /api/holidays error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Add holiday (HR Admin only)
  app.post("/api/holidays", requireHrAdmin, async (req, res) => {
    const r = req.body || {};
    const id = r.id || `hol-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const title = (r.title || "").trim();
    const date = (r.date || "").slice(0, 10);
    const type = r.type || "public";

    if (!title) return res.status(400).json({ error: "title is required" });
    if (!date) return res.status(400).json({ error: "date is required" });

    try {
      const { rows } = await pool.query(
        `INSERT INTO holidays (id, title, date, type)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           date = EXCLUDED.date,
           type = EXCLUDED.type
         RETURNING *`,
        [id, title, date, type],
      );
      res.json({ holiday: holidayToJs(rows[0]) });
    } catch (e) {
      console.error("POST /api/holidays error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Edit holiday (HR Admin only)
  app.put("/api/holidays/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const r = req.body || {};
    const title = (r.title || "").trim();
    const date = (r.date || "").slice(0, 10);
    const type = r.type || "public";

    if (!title) return res.status(400).json({ error: "title is required" });
    if (!date) return res.status(400).json({ error: "date is required" });

    try {
      const { rows } = await pool.query(
        `UPDATE holidays
         SET title = $2, date = $3, type = $4
         WHERE id = $1
         RETURNING *`,
        [id, title, date, type],
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ holiday: holidayToJs(rows[0]) });
    } catch (e) {
      console.error("PUT /api/holidays/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Delete holiday (HR Admin only)
  app.delete("/api/holidays/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    try {
      const { rows } = await pool.query("DELETE FROM holidays WHERE id = $1 RETURNING *", [id]);
      res.json({ ok: true, deleted: rows[0] ? holidayToJs(rows[0]) : null });
    } catch (e) {
      console.error("DELETE /api/holidays/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

