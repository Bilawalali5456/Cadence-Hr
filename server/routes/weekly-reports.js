import { notifyWeeklyReportSubmitted } from "../lib/notify.js";

/** Monday (YYYY-MM-DD) for a given date key or Date (Asia/Karachi-friendly via local parse). */
export function mondayOfWeek(dateInput = new Date()) {
  const d = typeof dateInput === "string"
    ? new Date(`${String(dateInput).slice(0, 10)}T12:00:00`)
    : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function fridayOfWeek(mondayKey) {
  const d = new Date(`${String(mondayKey).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 4);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function reportToJs(r) {
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name || undefined,
    weekStart: r.week_start,
    weekEnd: r.week_end,
    reportText: r.report_text || "",
    submittedAt: r.submitted_at || null,
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  };
}

export function registerWeeklyReportsRoutes(app, pool, requireAuth) {
  app.get("/api/weekly-reports", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const week = String(req.query.week || "").slice(0, 10);
      const weekStart = week || mondayOfWeek(new Date());
      const params = [weekStart];
      let filter = "wr.week_start = $1";

      if (actor.role === "Executive") {
        // all reports for the week
      } else {
        // Team Lead: own team only
        const { rows: me } = await pool.query(
          `SELECT is_team_lead FROM users WHERE id = $1 LIMIT 1`,
          [actor.id]
        );
        if (!me[0]?.is_team_lead) {
          // Employee: own reports only
          params.push(actor.id);
          filter += ` AND wr.employee_id = $${params.length}`;
        } else {
          params.push(actor.id);
          filter += ` AND wr.employee_id IN (SELECT id FROM users WHERE team_lead_id = $${params.length})`;
        }
      }

      const { rows } = await pool.query(
        `SELECT wr.*, u.name AS employee_name
         FROM weekly_reports wr
         JOIN users u ON u.id = wr.employee_id
         WHERE ${filter}
         ORDER BY u.name`,
        params
      );
      res.json(rows.map(reportToJs));
    } catch (e) {
      console.error("GET /api/weekly-reports error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Employee: list own report history (optional). */
  app.get("/api/weekly-reports/me", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const { rows } = await pool.query(
        `SELECT wr.*, u.name AS employee_name
         FROM weekly_reports wr
         JOIN users u ON u.id = wr.employee_id
         WHERE wr.employee_id = $1
         ORDER BY wr.week_start DESC
         LIMIT 26`,
        [actor.id]
      );
      res.json(rows.map(reportToJs));
    } catch (e) {
      console.error("GET /api/weekly-reports/me error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/weekly-reports", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const body = req.body || {};
      const weekStart = String(body.weekStart || body.week_start || mondayOfWeek(new Date())).slice(0, 10);
      const reportText = String(body.reportText || body.report_text || "").trim();
      if (!reportText) return res.status(400).json({ error: "reportText is required" });

      const { rows: meRows } = await pool.query(
        `SELECT id, name, team_lead_id, status FROM users WHERE id = $1 LIMIT 1`,
        [actor.id]
      );
      const me = meRows[0];
      if (!me || me.status !== "active") return res.status(403).json({ error: "Forbidden" });
      if (!me.team_lead_id) {
        return res.status(400).json({ error: "Weekly reports require an assigned Team Lead" });
      }

      const weekEnd = fridayOfWeek(weekStart);
      const id = `wr-${actor.id}-${weekStart}`;

      const { rows } = await pool.query(
        `INSERT INTO weekly_reports (id, employee_id, week_start, week_end, report_text, submitted_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
         ON CONFLICT (employee_id, week_start) DO UPDATE SET
           report_text = EXCLUDED.report_text,
           submitted_at = NOW(),
           updated_at = NOW()
         RETURNING *`,
        [id, actor.id, weekStart, weekEnd, reportText]
      );

      await notifyWeeklyReportSubmitted(pool, {
        employeeId: actor.id,
        employeeName: me.name,
        weekStart,
        weekEnd,
      });

      res.json({ ok: true, report: reportToJs({ ...rows[0], employee_name: me.name }) });
    } catch (e) {
      console.error("POST /api/weekly-reports error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/weekly-reports/:id", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const id = String(req.params.id || "").trim();
      const reportText = String(req.body?.reportText || req.body?.report_text || "").trim();
      if (!id) return res.status(400).json({ error: "id is required" });
      if (!reportText) return res.status(400).json({ error: "reportText is required" });

      const { rows: existing } = await pool.query(
        `SELECT * FROM weekly_reports WHERE id = $1 LIMIT 1`,
        [id]
      );
      if (!existing[0]) return res.status(404).json({ error: "Not found" });
      if (existing[0].employee_id !== actor.id) {
        return res.status(403).json({ error: "Forbidden — can only edit your own report" });
      }

      // Editable until the next Monday after week_start
      const nextMonday = new Date(`${existing[0].week_start}T12:00:00`);
      nextMonday.setDate(nextMonday.getDate() + 7);
      if (new Date() >= nextMonday) {
        return res.status(400).json({ error: "This week's report can no longer be edited" });
      }

      const { rows } = await pool.query(
        `UPDATE weekly_reports
         SET report_text = $1, submitted_at = NOW(), updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [reportText, id]
      );
      res.json({ ok: true, report: reportToJs(rows[0]) });
    } catch (e) {
      console.error("PUT /api/weekly-reports/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

export function registerTeamMembersRoutes(app, pool, requireAuth) {
  app.get("/api/team-members", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      let rows;

      if (actor.role === "Executive" || actor.role === "HR Employee") {
        // All team leads (Employee + Executive) and their assigned members.
        const { rows: all } = await pool.query(
          `SELECT m.id, m.name, m.email, m.role, m.designation, m.dept, m.team, m.status,
                  m.is_team_lead, m.team_lead_id, tl.name AS team_lead_name
           FROM users m
           LEFT JOIN users tl ON tl.id = m.team_lead_id
           WHERE m.status = 'active'
             AND m.role NOT IN ('Admin', 'HR Admin')
             AND (
               COALESCE(m.is_team_lead, false) = true
               OR m.team_lead_id IS NOT NULL
               OR m.role IN ('Employee', 'Manager', 'HR Employee')
             )
           ORDER BY tl.name NULLS LAST, m.name`
        );
        rows = all;
      } else {
        const { rows: me } = await pool.query(
          `SELECT is_team_lead FROM users WHERE id = $1 LIMIT 1`,
          [actor.id]
        );
        if (!me[0]?.is_team_lead) {
          return res.status(403).json({ error: "Forbidden — Team Lead only" });
        }
        const { rows: team } = await pool.query(
          `SELECT m.id, m.name, m.email, m.role, m.designation, m.dept, m.team, m.status,
                  m.is_team_lead, m.team_lead_id, $2::text AS team_lead_name
           FROM users m
           WHERE m.team_lead_id = $1 AND m.status = 'active'
           ORDER BY m.name`,
          [actor.id, actor.name || ""]
        );
        rows = team;
      }

      res.json(rows.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        designation: r.designation || "",
        dept: r.dept || "",
        team: r.team || "",
        status: r.status,
        isTeamLead: !!r.is_team_lead,
        teamLeadId: r.team_lead_id || null,
        teamLeadName: r.team_lead_name || null,
      })));
    } catch (e) {
      console.error("GET /api/team-members error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
