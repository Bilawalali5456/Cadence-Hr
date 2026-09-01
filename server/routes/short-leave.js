import { HR_OPS_ROLES } from "../lib/rbac.js";

function isHr(role) {
  return HR_OPS_ROLES.includes(role);
}

async function applyApprovedShortLeaveToAttendance(c, sl) {
  const userId = sl.userId || sl.user_id;
  const date = String(sl.date || "").slice(0, 10);
  const id = sl.id;
  if (!userId || !date || !id) return;

  const { rows } = await c.query(
    `SELECT id, short_leaves FROM attendance
     WHERE user_id = $1 AND date = $2
     LIMIT 1`,
    [userId, date]
  );
  // No attendance that day — short leave not applicable
  if (!rows[0]) return;

  const entry = {
    id,
    from: sl.fromTime || sl.from_time || "",
    to: sl.toTime || sl.to_time || "",
    minutes: sl.minutes ?? 0,
    reason: sl.reason || "",
    // Keep start/end for working-hours deduction (computeShortLeaveMs)
    start: sl.startIso || sl.start_iso || null,
    end: sl.endIso || sl.end_iso || null,
    status: "approved",
  };

  await c.query(
    `UPDATE attendance SET
       short_leaves = (
         SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
         FROM jsonb_array_elements(COALESCE(short_leaves, '[]'::jsonb)) elem
         WHERE elem->>'id' IS DISTINCT FROM $1
       ) || $2::jsonb
     WHERE id = $3`,
    [id, JSON.stringify([entry]), rows[0].id]
  );
}

async function removeShortLeaveFromAttendance(c, sl) {
  const userId = sl.userId || sl.user_id;
  const date = String(sl.date || "").slice(0, 10);
  const id = sl.id;
  if (!userId || !date || !id) return;

  await c.query(
    `UPDATE attendance SET
       short_leaves = (
         SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
         FROM jsonb_array_elements(COALESCE(short_leaves, '[]'::jsonb)) elem
         WHERE elem->>'id' IS DISTINCT FROM $1
       )
     WHERE user_id = $2 AND date = $3`,
    [id, userId, date]
  );
}

export function registerShortLeaveRoutes(app, pool, requireAuth, requireHrAdmin) {
  async function upsertShortLeave(c, r) {
    const id = r?.id;
    if (!id) throw new Error("short-leave.id is required");
    if (!r?.userId) throw new Error("short-leave.userId is required");

    await c.query(
      `INSERT INTO short_leave_requests (
         id, user_id, emp_name, date, from_time, to_time, start_iso, end_iso, minutes, reason, status, submitted, reviewed_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
         reviewed_by = CASE
           WHEN EXCLUDED.status IN ('approved', 'rejected') THEN EXCLUDED.reviewed_by
           WHEN EXCLUDED.status = 'pending' THEN NULL
           ELSE short_leave_requests.reviewed_by
         END,
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
        r.reviewedBy || null,
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

      const { rows: prevRows } = await c.query(
        `SELECT id, user_id, date, from_time, to_time, start_iso, end_iso, minutes, reason, status
         FROM short_leave_requests WHERE id = $1 LIMIT 1`,
        [id]
      );
      const prev = prevRows[0] || null;
      const prevStatus = prev?.status || "";

      const r = { ...(req.body || {}), id };
      if (!r.userId && prev) r.userId = prev.user_id;
      if (!r.date && prev) r.date = prev.date;
      if (!r.fromTime && prev) r.fromTime = prev.from_time;
      if (!r.toTime && prev) r.toTime = prev.to_time;
      if (!r.startIso && prev) r.startIso = prev.start_iso;
      if (!r.endIso && prev) r.endIso = prev.end_iso;
      if (r.minutes == null && prev) r.minutes = prev.minutes;
      if (r.reason == null && prev) r.reason = prev.reason;

      const newStatus = r.status || "pending";
      if (newStatus === "approved" || newStatus === "rejected") {
        r.reviewedBy = req.authUser.id;
      } else if (newStatus === "pending") {
        r.reviewedBy = null;
      }

      await upsertShortLeave(c, r);

      if (newStatus === "approved") {
        await applyApprovedShortLeaveToAttendance(c, r);
      } else if (prevStatus === "approved" && newStatus === "rejected") {
        await removeShortLeaveFromAttendance(c, {
          id,
          userId: r.userId || prev?.user_id,
          date: r.date || prev?.date,
        });
      }

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

      const { rows } = await c.query(
        `SELECT id, user_id, date, status FROM short_leave_requests WHERE id = $1 LIMIT 1`,
        [id]
      );
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

      if (rows[0].status === "approved") {
        await removeShortLeaveFromAttendance(c, {
          id: rows[0].id,
          userId: rows[0].user_id,
          date: rows[0].date,
        });
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
