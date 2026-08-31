import { HR_OPS_ROLES } from "../lib/rbac.js";
import {
  fetchOvertimeRequests,
  overtimeToJs,
  syncOvertimeForRange,
} from "../lib/overtime.js";
import { monthDateRange } from "../lib/latePenalties.js";

function isExecutive(role) {
  return role === "Executive";
}

function isHrEmployee(role) {
  return role === "HR Employee";
}

export function registerOvertimeRoutes(app, pool, requireAuth) {
  app.get("/api/overtime", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const month = String(req.query.month || "").trim();
      const isHrOps = HR_OPS_ROLES.includes(actor.role);

      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const range = monthDateRange(month);
        if (range) {
          await syncOvertimeForRange(pool, range.start, range.end, isHrOps ? null : [actor.id]);
        }
      }

      let list;
      if (isHrOps) {
        list = await fetchOvertimeRequests(pool, { month: month || undefined });
      } else {
        list = await fetchOvertimeRequests(pool, { employeeId: actor.id, month: month || undefined });
      }

      res.json(list);
    } catch (e) {
      console.error("GET /api/overtime error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/overtime/:id/reason", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const id = String(req.params.id || "").trim();
      const reason = String(req.body?.reason || "").trim();
      if (!id) return res.status(400).json({ error: "id is required" });
      if (!reason) return res.status(400).json({ error: "reason is required" });

      const { rows } = await pool.query(
        `SELECT * FROM overtime_requests WHERE id = $1 LIMIT 1`,
        [id]
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      if (row.employee_id !== actor.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (row.hr_status !== "pending" || row.exec_status === "approved") {
        return res.status(400).json({ error: "Cannot update reason after HR review" });
      }

      const { rows: updated } = await pool.query(
        `UPDATE overtime_requests
         SET reason = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [reason, id]
      );
      res.json(overtimeToJs(updated[0]));
    } catch (e) {
      console.error("POST /api/overtime/:id/reason error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/overtime/:id/hr-review", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      if (!isHrEmployee(actor.role) && !isExecutive(actor.role)) {
        return res.status(403).json({ error: "Forbidden — HR Employee only" });
      }

      const id = String(req.params.id || "").trim();
      const status = String(req.body?.status || "").trim().toLowerCase();
      const comment = String(req.body?.comment || "").trim();
      if (!id) return res.status(400).json({ error: "id is required" });
      if (status !== "approved" && status !== "rejected") {
        return res.status(400).json({ error: "status must be approved or rejected" });
      }

      const { rows } = await pool.query(
        `SELECT * FROM overtime_requests WHERE id = $1 LIMIT 1`,
        [id]
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      if (row.hr_status !== "pending") {
        return res.status(400).json({ error: "HR review already completed" });
      }
      if (!String(row.reason || "").trim()) {
        return res.status(400).json({ error: "Employee has not submitted a reason yet" });
      }

      const { rows: updated } = await pool.query(
        `UPDATE overtime_requests
         SET hr_status = $1,
             hr_reviewed_by = $2,
             hr_reviewed_at = NOW(),
             hr_comment = $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [status, actor.name, comment, id]
      );
      res.json(overtimeToJs(updated[0]));
    } catch (e) {
      console.error("PUT /api/overtime/:id/hr-review error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/overtime/:id/exec-review", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      if (!isExecutive(actor.role)) {
        return res.status(403).json({ error: "Forbidden — Executive only" });
      }

      const id = String(req.params.id || "").trim();
      const status = String(req.body?.status || "").trim().toLowerCase();
      const comment = String(req.body?.comment || "").trim();
      if (!id) return res.status(400).json({ error: "id is required" });
      if (status !== "approved" && status !== "rejected") {
        return res.status(400).json({ error: "status must be approved or rejected" });
      }

      const { rows } = await pool.query(
        `SELECT * FROM overtime_requests WHERE id = $1 LIMIT 1`,
        [id]
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      if (row.hr_status !== "approved") {
        return res.status(400).json({ error: "HR must approve before Executive review" });
      }
      if (row.exec_status !== "pending") {
        return res.status(400).json({ error: "Executive review already completed" });
      }

      const { rows: updated } = await pool.query(
        `UPDATE overtime_requests
         SET exec_status = $1,
             exec_reviewed_by = $2,
             exec_reviewed_at = NOW(),
             exec_comment = $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [status, actor.name, comment, id]
      );
      res.json(overtimeToJs(updated[0]));
    } catch (e) {
      console.error("PUT /api/overtime/:id/exec-review error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
