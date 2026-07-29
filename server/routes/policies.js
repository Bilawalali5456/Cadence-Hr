function policyToJs(r) {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    body: r.body || "",
    version: r.version || 1,
    updatedAt: r.updated_at || "",
    updatedBy: r.updated_by || "",
    createdAt: r.created_at || "",
  };
}

export function registerPoliciesRoutes(app, pool, requireAuth, requireHrAdmin) {
  app.get("/api/policies", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM policies ORDER BY updated_at DESC NULLS LAST, title",
      );
      res.json(rows.map(policyToJs));
    } catch (e) {
      console.error("GET /api/policies error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/policies", requireHrAdmin, async (req, res) => {
    const r = req.body || {};
    const id = r.id || `pol-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const title = (r.title || "").trim();
    const body = (r.body || "").trim();
    const category = r.category || "General";
    const now = r.updatedAt || r.createdAt || new Date().toLocaleString();
    const updatedBy = (r.updatedBy || "").trim();

    if (!title) return res.status(400).json({ error: "title is required" });
    if (!body) return res.status(400).json({ error: "body is required" });
    if (!updatedBy) return res.status(400).json({ error: "updatedBy is required" });

    try {
      const { rows } = await pool.query(
        `INSERT INTO policies (id, title, category, body, version, updated_at, updated_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           category = EXCLUDED.category,
           body = EXCLUDED.body,
           version = EXCLUDED.version,
           updated_at = EXCLUDED.updated_at,
           updated_by = EXCLUDED.updated_by,
           created_at = EXCLUDED.created_at
         RETURNING *`,
        [id, title, category, body, r.version ?? 1, now, updatedBy, now],
      );
      res.json({ policy: policyToJs(rows[0]) });
    } catch (e) {
      console.error("POST /api/policies error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/policies/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const r = req.body || {};
    const title = (r.title || "").trim();
    const body = (r.body || "").trim();
    const category = r.category || "General";
    const now = r.updatedAt || new Date().toLocaleString();
    const updatedBy = (r.updatedBy || "").trim();

    if (!title) return res.status(400).json({ error: "title is required" });
    if (!body) return res.status(400).json({ error: "body is required" });
    if (!updatedBy) return res.status(400).json({ error: "updatedBy is required" });

    try {
      const existing = await pool.query("SELECT version, created_at FROM policies WHERE id = $1", [id]);
      const prev = existing.rows[0];
      if (!prev) return res.status(404).json({ error: "Not found" });

      const version = r.version ?? ((prev.version || 1) + 1);
      const createdAt = r.createdAt || prev.created_at || now;

      const { rows } = await pool.query(
        `UPDATE policies
         SET title = $2, category = $3, body = $4, version = $5, updated_at = $6, updated_by = $7, created_at = $8
         WHERE id = $1
         RETURNING *`,
        [id, title, category, body, version, now, updatedBy, createdAt],
      );
      res.json({ policy: policyToJs(rows[0]) });
    } catch (e) {
      console.error("PUT /api/policies/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/policies/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    try {
      const { rows } = await pool.query("DELETE FROM policies WHERE id = $1 RETURNING *", [id]);
      res.json({ ok: true, deleted: rows[0] ? policyToJs(rows[0]) : null });
    } catch (e) {
      console.error("DELETE /api/policies/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
