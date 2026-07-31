import { HR_ADMIN_ROLES } from "../lib/auth.js";

function isHr(role) {
  return HR_ADMIN_ROLES.includes(role);
}

export function registerShortLeaveRoutes(app, pool, requireAuth, requireHrAdmin) {
  async function upsertShortLeave(c, r) {
    const id = r?.id;
    if (!id) throw new Error("short-leave.id is required");
    if (!r?.userId) throw new Error("short-leave.userId is required");

    await c.query(
      `INSERT INTO short_leave_requests (
         id, user_id, emp_name, date, from_time, to_time, start_iso, end_iso, minutes, reason, status, submitted
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         emp_name = EXCLUDED.emp_name,
         date = EXCLUDED.date,
         from_time = EXCLUDED.from_time,
         to_time = EXCLUDED.to_time,
         start_iso = EXCLUDED.start_iso,
         end_iso = EXCLUDED.end_iso,
         minutes = EXCLUDED.minutes,
         reason = EXCLUDED.reason,
         status = EXCLUDED.status,
         submitted = EXCLUDED.submitted,
         updated_at = NOW(),
         status_changed_at = CASE
           WHEN short_leave_requests.status IS DISTINCT FROM EXCLUDED.status THEN NOW()
           ELSE short_leave_requests.status_changed_at
         END`,
      [
        id,
        r.userId,
        r.empName || "",
        r.date || "",
        r.fromTime || "",
        r.toTime || "",
        r.startIso || null,
        r.endIso || null,
        r.minutes ?? 0,
        r.reason || "",
        r.status || "pending",
        r.submitted || "",
      ]
    );
  }

  // Employee submits: POST /api/short-leave
  app.post("/api/short-leave", requireAuth, async (req, res) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const r = req.body || {};
      // Employees can only submit for themselves.
      if (!isHr(req.authUser.role) && String(r.userId) !== String(req.authUser.id)) {
        await c.query("ROLLBACK").catch(() => {});
        return res.status(403).json({ error: "Forbidden — cannot submit for other user" });
      }
      await upsertShortLeave(c, r);
      await c.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      console.error("POST /api/short-leave error:", e.message);
      res.status(500).json({ error: e.message });
    } finally {
      c.release();
    }
  });

  // HR approves/rejects: PUT /api/short-leave/:id
  app.put("/api/short-leave/:id", requireHrAdmin, async (req, res) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ error: "id is required" });
      const r = { ...(req.body || {}), id };
      await upsertShortLeave(c, r);
      await c.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      console.error("PUT /api/short-leave/:id error:", e.message);
      res.status(500).json({ error: e.message });
    } finally {
      c.release();
    }
  });

  // Cancel/delete: DELETE /api/short-leave/:id
  app.delete("/api/short-leave/:id", requireAuth, async (req, res) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ error: "id is required" });

      const { rows } = await c.query("SELECT id, user_id FROM short_leave_requests WHERE id = $1 LIMIT 1", [id]);
      if (!rows[0]) {
        await c.query("ROLLBACK").catch(() => {});
        return res.status(404).json({ error: "Short leave request not found" });
      }

      const actor = req.authUser;
      const targetUserId = String(rows[0].user_id);
      if (!isHr(actor.role) && String(actor.id) !== targetUserId) {
        await c.query("ROLLBACK").catch(() => {});
        return res.status(403).json({ error: "Forbidden — cannot delete other user's short leave" });
      }

      await c.query("DELETE FROM short_leave_requests WHERE id = $1", [id]);
      await c.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      console.error("DELETE /api/short-leave/:id error:", e.message);
      res.status(500).json({ error: e.message });
    } finally {
      c.release();
    }
  });
}

