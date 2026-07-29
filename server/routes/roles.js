function roleToJs(r) {
  return {
    id: r.id,
    name: r.name,
    permissions: Array.isArray(r.permissions) ? r.permissions : [],
  };
}

export function registerRolesRoutes(app, pool, requireAuth, requireHrAdmin) {
  app.get("/api/roles", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM roles ORDER BY name");
      res.json(rows.map(roleToJs));
    } catch (e) {
      console.error("GET /api/roles error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/roles", requireHrAdmin, async (req, res) => {
    const r = req.body || {};
    const id = r.id || `role-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = (r.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    try {
      const { rows } = await pool.query(
        `INSERT INTO roles (id, name, permissions)
         VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           permissions = EXCLUDED.permissions
         RETURNING *`,
        [id, name, JSON.stringify(r.permissions || [])],
      );
      res.json({ role: roleToJs(rows[0]) });
    } catch (e) {
      console.error("POST /api/roles error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/roles/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const r = req.body || {};
    const name = (r.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    try {
      const { rows } = await pool.query(
        `UPDATE roles SET name = $2, permissions = $3 WHERE id = $1 RETURNING *`,
        [id, name, JSON.stringify(r.permissions || [])],
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ role: roleToJs(rows[0]) });
    } catch (e) {
      console.error("PUT /api/roles/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/roles/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    try {
      const { rows } = await pool.query("DELETE FROM roles WHERE id = $1 RETURNING *", [id]);
      res.json({ ok: true, deleted: rows[0] ? roleToJs(rows[0]) : null });
    } catch (e) {
      console.error("DELETE /api/roles/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
