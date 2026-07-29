function annToJs(r) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    date: r.date,
    author: r.author,
  };
}

export function registerAnnouncementsRoutes(app, pool, requireAuth, requireHrAdmin) {
  // List announcements: any logged-in user
  app.get("/api/announcements", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM announcements ORDER BY id DESC");
      res.json(rows.map(annToJs));
    } catch (e) {
      console.error("GET /api/announcements error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Create announcement (HR Admin only)
  app.post("/api/announcements", requireHrAdmin, async (req, res) => {
    const r = req.body || {};
    const id = r.id || `a${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const title = (r.title || "").trim();
    const body = (r.body || "").trim();
    const date = r.date || new Date().toLocaleDateString();
    const author = (r.author || "").trim();

    if (!title) return res.status(400).json({ error: "title is required" });
    if (!body) return res.status(400).json({ error: "body is required" });
    if (!author) return res.status(400).json({ error: "author is required" });

    try {
      const { rows } = await pool.query(
        `INSERT INTO announcements (id, title, body, date, author)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           date = EXCLUDED.date,
           author = EXCLUDED.author
         RETURNING *`,
        [id, title, body, date, author],
      );

      res.json({ announcement: annToJs(rows[0]) });
    } catch (e) {
      console.error("POST /api/announcements error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Update announcement (HR Admin only)
  app.put("/api/announcements/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const r = req.body || {};
    const title = (r.title || "").trim();
    const body = (r.body || "").trim();
    const date = r.date || new Date().toLocaleDateString();
    const author = (r.author || "").trim();

    if (!title) return res.status(400).json({ error: "title is required" });
    if (!body) return res.status(400).json({ error: "body is required" });
    if (!author) return res.status(400).json({ error: "author is required" });

    try {
      const { rows } = await pool.query(
        `UPDATE announcements
         SET title = $2, body = $3, date = $4, author = $5
         WHERE id = $1
         RETURNING *`,
        [id, title, body, date, author],
      );

      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ announcement: annToJs(rows[0]) });
    } catch (e) {
      console.error("PUT /api/announcements/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Delete announcement (HR Admin only)
  app.delete("/api/announcements/:id", requireHrAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    try {
      const { rows } = await pool.query("DELETE FROM announcements WHERE id = $1 RETURNING *", [id]);
      res.json({ ok: true, deleted: rows[0] ? annToJs(rows[0]) : null });
    } catch (e) {
      console.error("DELETE /api/announcements/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

