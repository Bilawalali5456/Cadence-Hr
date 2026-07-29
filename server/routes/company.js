function companyToJs(r) {
  return {
    officeStart: r.office_start,
    graceMinutes: r.grace_minutes,
    currency: r.currency,
  };
}

export function registerCompanyRoutes(app, pool, requireAuth, requireHrAdmin) {
  app.get("/api/company", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM company_settings WHERE id = 1");
      res.json(rows[0] ? companyToJs(rows[0]) : {});
    } catch (e) {
      console.error("GET /api/company error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/company", requireHrAdmin, async (req, res) => {
    const c = req.body || {};
    try {
      const { rows } = await pool.query(
        `INSERT INTO company_settings (id, office_start, grace_minutes, currency)
         VALUES (1, $1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
           office_start = EXCLUDED.office_start,
           grace_minutes = EXCLUDED.grace_minutes,
           currency = EXCLUDED.currency
         RETURNING *`,
        [c.officeStart || "09:00", c.graceMinutes ?? 15, c.currency || "PKR"],
      );
      res.json({ company: companyToJs(rows[0]) });
    } catch (e) {
      console.error("PUT /api/company error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
