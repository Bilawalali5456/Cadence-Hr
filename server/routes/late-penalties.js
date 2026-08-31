import { HR_OPS_ROLES } from "../lib/rbac.js";
import {
  fetchLatePenaltiesForMonth,
  latePenaltyToJs,
  reconcileLatePenaltiesForEmployeeMonth,
  reconcileLatePenaltiesForRange,
  isLatePenaltyMonth,
  monthDateRange,
  LATE_PENALTY_MONTH_FLOOR,
} from "../lib/latePenalties.js";
import { karachiDateKey } from "../lib/admsHelpers.js";

function resolveMonth(queryMonth) {
  const m = String(queryMonth || "").trim();
  if (/^\d{4}-\d{2}$/.test(m)) return m;
  return karachiDateKey(new Date()).slice(0, 7);
}

export function registerLatePenaltiesRoutes(app, pool, requireAuth) {
  // HR Employee + Executive: all employees' late penalties for a month.
  app.get("/api/late-penalties", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      if (!HR_OPS_ROLES.includes(actor.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const month = resolveMonth(req.query.month);
      if (!isLatePenaltyMonth(month)) {
        return res.json([]);
      }

      const range = monthDateRange(month);
      if (range) {
        await reconcileLatePenaltiesForRange(pool, range.start, range.end);
      }

      const list = await fetchLatePenaltiesForMonth(pool, month);
      res.json(list);
    } catch (e) {
      console.error("GET /api/late-penalties error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Any authenticated user: own late penalty row for a month.
  app.get("/api/late-penalties/me", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const month = resolveMonth(req.query.month);

      if (!isLatePenaltyMonth(month)) {
        return res.json({
          id: null,
          employeeId: actor.id,
          month,
          lateCount: 0,
          leavesDeducted: 0,
          salaryDeductions: 0,
          floor: LATE_PENALTY_MONTH_FLOOR,
        });
      }

      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const penalty = await reconcileLatePenaltiesForEmployeeMonth(c, actor.id, month);
        await c.query("COMMIT");
        res.json(penalty || {
          employeeId: actor.id,
          month,
          lateCount: 0,
          leavesDeducted: 0,
          salaryDeductions: 0,
        });
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    } catch (e) {
      console.error("GET /api/late-penalties/me error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
