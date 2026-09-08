import { HR_OPS_ROLES } from "../lib/rbac.js";
import {
  allocateAnnualLeaveDates,
  enumerateWeekdays,
  getMonthlyAnnualUsage,
  isMonthlyAnnualLeaveMonth,
  MONTHLY_ANNUAL_LEAVE_LIMIT,
} from "../lib/monthlyAnnualLeave.js";

function isHr(role) {
  return HR_OPS_ROLES.includes(role);
}

function isExecutive(role) {
  return role === "Executive";
}

function genAttId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function upsertAttendanceDay(c, { userId, date, status, source }) {
  const { rows } = await c.query(
    `SELECT id, status, source, check_in FROM attendance
     WHERE user_id = $1 AND date = $2
     LIMIT 1`,
    [userId, date]
  );
  const existing = rows[0];
  if (existing) {
    const src = String(existing.source || "").toLowerCase();
    if (src === "biometric" || src === "wfh") return;
    await c.query(
      `UPDATE attendance
       SET status = $1, source = $2,
           check_in = NULL, check_out = NULL
       WHERE id = $3`,
      [status, source, existing.id]
    );
    return;
  }

  await c.query(
    `INSERT INTO attendance (
       id, user_id, date, check_in, check_out, breaks, short_leaves,
       auto_checkout, working_ms, total_break_ms, status, late, source
     ) VALUES ($1,$2,$3,NULL,NULL,'[]'::jsonb,'[]'::jsonb,false,NULL,NULL,$4,false,$5)`,
    [`${genAttId()}-${date}`, userId, date, status, source]
  );
}

async function applyApprovedLeaveAttendance(c, leave, { leaveDates = null, absentDates = [] } = {}) {
  const userId = leave.userId || leave.user_id;
  const from = leave.from || leave.from_date;
  const to = leave.to || leave.to_date;
  if (!userId || !from || !to) return;

  const dates = leaveDates || enumerateWeekdays(from, to);
  for (const date of dates) {
    await upsertAttendanceDay(c, { userId, date, status: "On Leave", source: "leave" });
  }
  for (const date of absentDates) {
    await upsertAttendanceDay(c, { userId, date, status: "Absent", source: "annual-limit-absent" });
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
       AND source IN ('leave', 'annual-limit-absent')
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
         id, user_id, emp_name, type, from_date, to_date, days, note, status, submitted, paid_days, unpaid_days, pay_tag, reviewed_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
         reviewed_by = CASE
           WHEN EXCLUDED.status IN ('approved', 'rejected') THEN EXCLUDED.reviewed_by
           WHEN EXCLUDED.status = 'pending' THEN NULL
           ELSE leave_requests.reviewed_by
         END,
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
        l.reviewedBy || null,
      ]
    );
  }

  // Employee submits: POST /api/leave
  app.post("/api/leave", requireAuth, async (req, res) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const l = req.body || {};
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

  // Executive approves/rejects: PUT /api/leave/:id
  app.put("/api/leave/:id", requireHrAdmin, async (req, res) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ error: "id is required" });

      const { rows: prevRows } = await c.query(
        `SELECT id, user_id, type, from_date, to_date, status, paid_days, unpaid_days, days, pay_tag
         FROM leave_requests WHERE id = $1 LIMIT 1`,
        [id]
      );
      const prev = prevRows[0] || null;
      const prevStatus = prev?.status || "";

      const l = { ...(req.body || {}), id };
      if (!l.userId && prev) l.userId = prev.user_id;
      if (!l.from && prev) l.from = prev.from_date;
      if (!l.to && prev) l.to = prev.to_date;
      if (!l.type && prev) l.type = prev.type;
      if (l.paidDays == null && prev) l.paidDays = prev.paid_days;
      if (l.unpaidDays == null && prev) l.unpaidDays = prev.unpaid_days;
      if (l.days == null && prev) l.days = prev.days;
      if (!l.payTag && prev) l.payTag = prev.pay_tag;

      const newStatus = l.status || "pending";
      if (
        (newStatus === "approved" || newStatus === "rejected")
        && newStatus !== prevStatus
        && !isExecutive(req.authUser.role)
      ) {
        await c.query("ROLLBACK").catch(() => {});
        return res.status(403).json({ error: "Forbidden — only Executive can approve or reject leave requests" });
      }

      let warning = null;
      let monthlyLimitExceeded = false;
      let leaveDates = null;
      let absentDates = [];

      if (newStatus === "approved" || newStatus === "rejected") {
        l.reviewedBy = req.authUser.id;
      } else if (newStatus === "pending") {
        l.reviewedBy = null;
      }

      if (newStatus === "approved" && String(l.type || "") === "Annual") {
        const alloc = await allocateAnnualLeaveDates(c, l.userId, l.from, l.to, { excludeLeaveId: id });
        leaveDates = alloc.leaveDates;
        absentDates = alloc.absentDates;
        l.paidDays = alloc.paidDays;
        // Keep any unpaid portion from balance shortfall; add over-limit days as unpaid-absent
        const priorUnpaid = Number(l.unpaidDays || 0);
        l.unpaidDays = priorUnpaid + alloc.unpaidOrAbsentDays;
        if (alloc.monthlyLimitExceeded) {
          monthlyLimitExceeded = true;
          warning = alloc.warnings[0]
            || `Employee has already used ${MONTHLY_ANNUAL_LEAVE_LIMIT}/${MONTHLY_ANNUAL_LEAVE_LIMIT} monthly Annual Leaves. Extra day(s) marked Absent.`;
          if (alloc.paidDays === 0) {
            l.payTag = "Unpaid";
          }
        }
      }

      await upsertLeaveRecord(c, l);

      if (newStatus === "approved") {
        await applyApprovedLeaveAttendance(c, l, { leaveDates, absentDates });
      } else if (prevStatus === "approved" && newStatus === "rejected") {
        await removeLeaveAttendance(c, {
          userId: l.userId || prev?.user_id,
          from: l.from || prev?.from_date,
          to: l.to || prev?.to_date,
        });
      }

      const monthKey = String(l.from || "").slice(0, 7);
      let monthlyAnnualUsed = 0;
      if (isMonthlyAnnualLeaveMonth(monthKey)) {
        const usage = await getMonthlyAnnualUsage(c, l.userId, monthKey);
        monthlyAnnualUsed = usage.used;
      }

      await c.query("COMMIT");
      res.json({
        ok: true,
        warning,
        monthlyLimitExceeded,
        monthlyAnnualUsed,
        monthlyAnnualLimit: MONTHLY_ANNUAL_LEAVE_LIMIT,
        paidDays: l.paidDays ?? null,
        unpaidDays: l.unpaidDays ?? null,
      });
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
