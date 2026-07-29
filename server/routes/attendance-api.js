import { HR_ADMIN_ROLES } from "../lib/auth.js";
import { karachiDateKey } from "../lib/admsHelpers.js";
import { syncAttendanceFromLogs } from "../lib/attendanceSync.js";

function attToJs(r) {
  return {
    id: r.id,
    userId: r.user_id,
    date: r.date,
    checkIn: r.check_in,
    checkOut: r.check_out,
    lastScan: r.last_scan || null,
    breaks: r.breaks || [],
    shortLeaves: r.short_leaves || [],
    breakStart: r.break_start || null,
    breakEnd: r.break_end || null,
    autoCheckout: r.auto_checkout || false,
    workingMs: r.working_ms != null ? Number(r.working_ms) : undefined,
    totalBreakMs: r.total_break_ms != null ? Number(r.total_break_ms) : undefined,
    status: r.status || undefined,
    late: r.late || false,
    source: r.source || "manual",
    checkInMethod: r.check_in_method || null,
    checkOutMethod: r.check_out_method || null,
    lastScanMethod: r.last_scan_method || null,
    manuallyCorrected: r.manually_corrected === true,
    correctionLog: r.correction_log || [],
    lastCorrectedBy: r.last_corrected_by || null,
    lastCorrectedByRole: r.last_corrected_by_role || null,
    lastCorrectedOn: r.last_corrected_on || null,
  };
}

function monthToRange(month) {
  // month: "YYYY-MM"
  const m = String(month || "").trim();
  const mm = /^(\d{4})-(\d{2})$/.exec(m);
  if (!mm) return null;
  const year = Number(mm[1]);
  const monthIndex = Number(mm[2]) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  const toYMD = (d) => {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  };
  return { start: toYMD(start), end: toYMD(end) };
}

export function registerAttendanceRestRoutes(app, pool, requireAuth, requireHrAdmin) {
  async function upsertAttendanceRecord(c, r) {
    // r is already camelCased from frontend utils/state
    const id = r?.id;
    if (!id) throw new Error("attendance.id is required");

    // Manual correction must carry a reason + edited-by metadata.
    if (r.manuallyCorrected === true) {
      const log = Array.isArray(r.correctionLog) ? r.correctionLog : [];
      const last = log[log.length - 1];
      if (!last || !String(last.reason || "").trim()) throw new Error("Reason for correction is required.");
      if (!r.lastCorrectedBy || !r.lastCorrectedByRole) throw new Error("editedBy metadata is required.");
    }

    await c.query(
      `INSERT INTO attendance (
         id, user_id, date, check_in, check_out, breaks, short_leaves, break_start, break_end,
         auto_checkout, working_ms, total_break_ms, status, late, source,
         check_in_method, check_out_method, last_scan, last_scan_method,
         manually_corrected, correction_log,
         last_corrected_by, last_corrected_by_role, last_corrected_on
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         date = EXCLUDED.date,
         check_in = EXCLUDED.check_in,
         check_out = EXCLUDED.check_out,
         breaks = EXCLUDED.breaks,
         short_leaves = EXCLUDED.short_leaves,
         break_start = EXCLUDED.break_start,
         break_end = EXCLUDED.break_end,
         auto_checkout = EXCLUDED.auto_checkout,
         working_ms = EXCLUDED.working_ms,
         total_break_ms = EXCLUDED.total_break_ms,
         status = EXCLUDED.status,
         late = EXCLUDED.late,
         source = EXCLUDED.source,
         check_in_method = EXCLUDED.check_in_method,
         check_out_method = EXCLUDED.check_out_method,
         last_scan = EXCLUDED.last_scan,
         last_scan_method = EXCLUDED.last_scan_method,
         manually_corrected = EXCLUDED.manually_corrected,
         correction_log = EXCLUDED.correction_log,
         last_corrected_by = EXCLUDED.last_corrected_by,
         last_corrected_by_role = EXCLUDED.last_corrected_by_role,
         last_corrected_on = EXCLUDED.last_corrected_on`,
      [
        id,
        r.userId,
        r.date,
        r.checkIn || null,
        r.checkOut || null,
        JSON.stringify(r.breaks || []),
        JSON.stringify(r.shortLeaves || []),
        r.breakStart || null,
        r.breakEnd || null,
        r.autoCheckout || false,
        r.workingMs ?? null,
        r.totalBreakMs ?? null,
        r.status ?? null,
        r.late || false,
        r.source || "manual",
        r.checkInMethod || null,
        r.checkOutMethod || null,
        r.lastScan || null,
        r.lastScanMethod || null,
        r.manuallyCorrected === true,
        JSON.stringify(r.correctionLog || []),
        r.lastCorrectedBy || null,
        r.lastCorrectedByRole || null,
        r.lastCorrectedOn || null,
      ]
    );
  }

  app.post("/api/attendance", requireHrAdmin, async (req, res) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const r = req.body || {};
      await upsertAttendanceRecord(c, r);
      await c.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      console.error("POST /api/attendance error:", e.message);
      res.status(500).json({ error: e.message });
    } finally {
      c.release();
    }
  });

  app.put("/api/attendance/:id", requireHrAdmin, async (req, res) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ error: "id is required" });
      const r = { ...(req.body || {}), id };
      await upsertAttendanceRecord(c, r);
      await c.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      console.error("PUT /api/attendance/:id error:", e.message);
      res.status(500).json({ error: e.message });
    } finally {
      c.release();
    }
  });

  // Filtered attendance: HR sees all, Employee sees only their own.
  // Supports:
  //   - date=YYYY-MM-DD (single day)
  //   - month=YYYY-MM (recommended for summaries)
  //   - from=YYYY-MM-DD&to=YYYY-MM-DD (legacy compatibility)
  // Defaults to today (Karachi) when no date range is provided.
  // Optional userId is only honored for HR roles.
  app.get("/api/attendance", requireAuth, async (req, res) => {
    try {
      // Refresh biometric aggregation (overnight day assignment + finalize) before read.
      try {
        await syncAttendanceFromLogs(pool);
      } catch (syncErr) {
        console.error("GET /api/attendance sync warning:", syncErr.message);
      }

      const actor = req.authUser;
      const roleCanViewAll = HR_ADMIN_ROLES.includes(actor.role);

      const month = String(req.query.month || "").trim();
      const date = String(req.query.date || "").slice(0, 10);
      const from = String(req.query.from || "").slice(0, 10);
      const to = String(req.query.to || "").slice(0, 10);
      const userId = String(req.query.userId || "").trim();

      let dateFrom = "";
      let dateTo = "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        dateFrom = date;
        dateTo = date;
      } else {
        const range = month ? monthToRange(month) : null;
        dateFrom = range?.start || (from || "");
        dateTo = range?.end || (to || "");
        if (!dateFrom && !dateTo) {
          const today = karachiDateKey(new Date());
          dateFrom = today;
          dateTo = today;
        }
      }

      const params = [];
      const where = [];

      if (!roleCanViewAll) {
        params.push(actor.id);
        where.push(`user_id = $${params.length}`);
      } else if (userId) {
        params.push(userId);
        where.push(`user_id = $${params.length}`);
      }

      if (dateFrom) {
        params.push(dateFrom);
        where.push(`date >= $${params.length}`);
      }
      if (dateTo) {
        params.push(dateTo);
        where.push(`date <= $${params.length}`);
      }

      const sql = `SELECT * FROM attendance ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY date DESC`;
      const { rows } = await pool.query(sql, params);
      res.json(rows.map(attToJs));
    } catch (e) {
      console.error("GET /api/attendance error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

