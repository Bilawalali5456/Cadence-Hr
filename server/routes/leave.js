import { HR_ADMIN_ROLES } from "../lib/auth.js";

function isHr(role) {
  return HR_ADMIN_ROLES.includes(role);
}

export function registerLeaveRoutes(app, pool, requireAuth, requireHrAdmin) {
  async function upsertLeaveRecord(c, l) {
    const id = l?.id;
    if (!id) throw new Error("leave.id is required");
    if (!l?.userId) throw new Error("leave.userId is required");

    await c.query(
      `INSERT INTO leave_requests (
         id, user_id, emp_name, type, from_date, to_date, days, note, status, submitted, paid_days, unpaid_days, pay_tag
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         emp_name = EXCLUDED.emp_name,
         type = EXCLUDED.type,
         from_date = EXCLUDED.from_date,
         to_date = EXCLUDED.to_date,
         days = EXCLUDED.days,
         note = EXCLUDED.note,
         status = EXCLUDED.status,
         submitted = EXCLUDED.submitted,
         paid_days = EXCLUDED.paid_days,
         unpaid_days = EXCLUDED.unpaid_days,
         pay_tag = EXCLUDED.pay_tag,
         updated_at = NOW(),
         status_changed_at = CASE
           WHEN leave_requests.status IS DISTINCT FROM EXCLUDED.status THEN NOW()
           ELSE leave_requests.status_changed_at
         END`,
      [
        id,
        l.userId,
        l.empName || "",
        l.type || "Leave",
        l.from || null,
        l.to || null,
        l.days ?? 0,
        l.note || "",
        l.status || "pending",
        l.submitted || "",
        l.paidDays ?? null,
        l.unpaidDays ?? null,
        l.payTag || null,
      ]
    );
  }

  // Employee submits: POST /api/leave
  app.post("/api/leave", requireAuth, async (req, res) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const l = req.body || {};
      // If employee submits with a userId mismatch, disallow.
      if (!isHr(req.authUser.role) && String(l.userId) !== String(req.authUser.id)) {
        return res.status(403).json({ error: "Forbidden — cannot submit for other user" });
      }
      await upsertLeaveRecord(c, l);
      await c.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      console.error("POST /api/leave error:", e.message);
      res.status(500).json({ error: e.message });
    } finally {
      c.release();
    }
  });

  // HR approves/rejects: PUT /api/leave/:id
  app.put("/api/leave/:id", requireHrAdmin, async (req, res) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ error: "id is required" });
      const l = { ...(req.body || {}), id };
      await upsertLeaveRecord(c, l);
      await c.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      console.error("PUT /api/leave/:id error:", e.message);
      res.status(500).json({ error: e.message });
    } finally {
      c.release();
    }
  });

  // Cancel: DELETE /api/leave/:id
  app.delete("/api/leave/:id", requireAuth, async (req, res) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ error: "id is required" });

      const { rows } = await c.query("SELECT id, user_id FROM leave_requests WHERE id = $1 LIMIT 1", [id]);
      if (!rows[0]) {
        await c.query("ROLLBACK").catch(() => {});
        return res.status(404).json({ error: "Leave request not found" });
      }

      const actor = req.authUser;
      const targetUserId = String(rows[0].user_id);
      if (!isHr(actor.role) && String(actor.id) !== targetUserId) {
        await c.query("ROLLBACK").catch(() => {});
        return res.status(403).json({ error: "Forbidden — cannot cancel other user's leave" });
      }

      await c.query("DELETE FROM leave_requests WHERE id = $1", [id]);
      await c.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      console.error("DELETE /api/leave/:id error:", e.message);
      res.status(500).json({ error: e.message });
    } finally {
      c.release();
    }
  });
}

