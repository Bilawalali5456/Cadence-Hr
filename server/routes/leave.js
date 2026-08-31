import { HR_OPS_ROLES } from "../lib/rbac.js";

function isHr(role) {
  return HR_OPS_ROLES.includes(role);
}

function genAttId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Weekdays (Mon–Fri) between fromKey and toKey inclusive (YYYY-MM-DD). */
function enumerateWeekdays(fromKey, toKey) {
  const from = String(fromKey || "").slice(0, 10);
  const to = String(toKey || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return [];
  }
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const days = [];
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cur <= end) {
    const dow = cur.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6) {
      const y = cur.getUTCFullYear();
      const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
      const d = String(cur.getUTCDate()).padStart(2, "0");
      days.push(`${y}-${m}-${d}`);
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

async function applyApprovedLeaveAttendance(c, leave) {
  const userId = leave.userId || leave.user_id;
  const from = leave.from || leave.from_date;
  const to = leave.to || leave.to_date;
  if (!userId || !from || !to) return;

  for (const date of enumerateWeekdays(from, to)) {
    const { rows } = await c.query(
      `SELECT id, status, source, check_in FROM attendance
       WHERE user_id = $1 AND date = $2
       LIMIT 1`,
      [userId, date]
    );
    const existing = rows[0];
    if (existing) {
      const source = String(existing.source || "").toLowerCase();
      // Never overwrite real biometric / WFH attendance
      if (source === "biometric" || source === "wfh") continue;
      if (String(existing.status || "") === "Absent") {
        await c.query(
          `UPDATE attendance
           SET status = 'On Leave', source = 'leave',
               check_in = NULL, check_out = NULL
           WHERE id = $1`,
          [existing.id]
        );
      }
      continue;
    }

    await c.query(
      `INSERT INTO attendance (
         id, user_id, date, check_in, check_out, breaks, short_leaves,
         auto_checkout, working_ms, total_break_ms, status, late, source
       ) VALUES ($1,$2,$3,NULL,NULL,'[]'::jsonb,'[]'::jsonb,false,NULL,NULL,'On Leave',false,'leave')`,
      [`${genAttId()}-${date}`, userId, date]
    );
  }
}

async function removeLeaveAttendance(c, leave) {
  const userId = leave.userId || leave.user_id;
  const from = leave.from || leave.from_date;
  const to = leave.to || leave.to_date;
  if (!userId || !from || !to) return;

  await c.query(
    `DELETE FROM attendance
     WHERE user_id = $1
       AND source = 'leave'
       AND date >= $2
       AND date <= $3`,
    [userId, String(from).slice(0, 10), String(to).slice(0, 10)]
  );
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

      const { rows: prevRows } = await c.query(
        `SELECT id, user_id, type, from_date, to_date, status
         FROM leave_requests WHERE id = $1 LIMIT 1`,
        [id]
      );
      const prev = prevRows[0] || null;
      const prevStatus = prev?.status || "";

      const l = { ...(req.body || {}), id };
      // Prefer DB user/dates if body omits them
      if (!l.userId && prev) l.userId = prev.user_id;
      if (!l.from && prev) l.from = prev.from_date;
      if (!l.to && prev) l.to = prev.to_date;
      if (!l.type && prev) l.type = prev.type;

      await upsertLeaveRecord(c, l);

      const newStatus = l.status || "pending";
      if (newStatus === "approved") {
        await applyApprovedLeaveAttendance(c, l);
      } else if (prevStatus === "approved" && newStatus === "rejected") {
        await removeLeaveAttendance(c, {
          userId: l.userId || prev?.user_id,
          from: l.from || prev?.from_date,
          to: l.to || prev?.to_date,
        });
      }

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

      const { rows } = await c.query(
        `SELECT id, user_id, from_date, to_date, status FROM leave_requests WHERE id = $1 LIMIT 1`,
        [id]
      );
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

      // If an approved leave is deleted, clear synthetic On Leave attendance rows
      if (rows[0].status === "approved") {
        await removeLeaveAttendance(c, {
          userId: rows[0].user_id,
          from: rows[0].from_date,
          to: rows[0].to_date,
        });
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
