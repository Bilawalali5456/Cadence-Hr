import { HR_OPS_ROLES } from "../lib/rbac.js";
import { karachiDateKey, karachiTimestampText } from "../lib/admsHelpers.js";
import {
  syncAttendanceFromLogs,
  hasShiftEnded,
  computeBreakMs,
  getCheckInEarliest,
  isLateCheckIn,
  computeBiometricDayStatus,
} from "../lib/attendanceSync.js";

/**
 * Short-leave ms overlapping [checkIn, checkOut] only.
 * Checkout before SL ⇒ 0; during SL ⇒ partial; after SL end ⇒ full duration.
 */
function computeShortLeaveOverlapMs(shortLeaves, checkIn, checkOut) {
  const workStart = new Date(checkIn).getTime();
  const workEnd = new Date(checkOut).getTime();
  if (!Number.isFinite(workStart) || !Number.isFinite(workEnd) || workEnd <= workStart) return 0;
  return parseJsonArray(shortLeaves)
    .filter(sl => !sl.status || sl.status === "approved")
    .reduce((sum, sl) => {
      const startRaw = sl?.start || sl?.startIso;
      const endRaw = sl?.end || sl?.endIso;
      if (!startRaw || !endRaw) return sum;
      const slStart = new Date(startRaw).getTime();
      const slEnd = new Date(endRaw).getTime();
      if (!Number.isFinite(slStart) || !Number.isFinite(slEnd) || slEnd <= slStart) return sum;
      const overlapStart = Math.max(slStart, workStart);
      const overlapEnd = Math.min(slEnd, workEnd);
      const ms = overlapEnd - overlapStart;
      return sum + (ms > 0 ? ms : 0);
    }, 0);
}

/** Net working ms = gross − breaks − overlapping short leave only. */
function computeNetWorkingMs(checkIn, checkOut, breaks = [], shortLeaves = [], breakStart = null, breakEnd = null) {
  if (!checkIn || !checkOut) return null;
  const gross = new Date(checkOut) - new Date(checkIn);
  if (!(gross > 0)) return null;
  return Math.max(
    0,
    gross
      - computeBreakMs(breaks, breakStart, breakEnd)
      - computeShortLeaveOverlapMs(shortLeaves, checkIn, checkOut)
  );
}

function genAttId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function roleHasNoAttendance(role) {
  return role === "Executive";
}

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
    status: r.status != null && String(r.status).trim() !== "" ? String(r.status).trim() : null,
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

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function prevDateKey(dateKey) {
  const [y, m, d] = String(dateKey || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/** PKT hour (0–23) from a Date. */
function pktHour(now) {
  const text = karachiTimestampText(now);
  if (!text || text.length < 13) return null;
  return Number(text.slice(11, 13));
}

/** PKT 00:00–04:59 — overnight checkout window (same rule as biometric). */
function isOvernightCheckoutWindow(now = new Date()) {
  const hour = pktHour(now);
  return hour != null && !Number.isNaN(hour) && hour >= 0 && hour < 5;
}

/** Open WFH row for checkout: today first, then yesterday during overnight window. */
async function findOpenWfhAttendance(pool, userId, now = new Date()) {
  const today = karachiDateKey(now);
  const openWfhSql = `SELECT * FROM attendance
     WHERE user_id = $1 AND date = $2 AND source = 'wfh'
       AND check_in IS NOT NULL AND check_out IS NULL
     LIMIT 1`;

  const { rows: todayRows } = await pool.query(openWfhSql, [userId, today]);
  if (todayRows[0]) return todayRows[0];

  if (!isOvernightCheckoutWindow(now)) return null;

  const yesterday = prevDateKey(today);
  const { rows: yRows } = await pool.query(openWfhSql, [userId, yesterday]);
  return yRows[0] || null;
}

const STUCK_BREAK_MS = 60 * 60 * 1000; // 60 minutes

function isActiveBreak(row) {
  return !!(row?.break_start && !row?.break_end);
}

/** Open break_start older than 60 minutes — treated as a forgotten break end. */
function isStuckBreak(row, now = new Date()) {
  if (!isActiveBreak(row)) return false;
  const startMs = new Date(row.break_start).getTime();
  if (Number.isNaN(startMs)) return false;
  return now.getTime() - startMs > STUCK_BREAK_MS;
}

function forgottenBreakEndIso(breakStart) {
  return new Date(new Date(breakStart).getTime() + STUCK_BREAK_MS).toISOString();
}

/** Close an open break into the breaks[] array and clear break_start / break_end. */
async function finalizeOpenBreak(pool, row, actorId, breakEndIso) {
  const breakStart = row.break_start;
  const breaks = parseJsonArray(row.breaks);
  breaks.push({ start: breakStart, end: breakEndIso });
  const shortLeaves = parseJsonArray(row.short_leaves);
  const totalBreakMs = computeBreakMs(breaks);
  const endForWorking = row.check_out || breakEndIso;
  const workingMs = computeNetWorkingMs(
    row.check_in,
    endForWorking,
    breaks,
    shortLeaves,
    null,
    null
  );
  const { rows: updated } = await pool.query(
    `UPDATE attendance SET
       breaks = $1,
       break_start = NULL,
       break_end = NULL,
       total_break_ms = $2,
       working_ms = $3
     WHERE id = $4 AND user_id = $5
     RETURNING *`,
    [JSON.stringify(breaks), totalBreakMs, workingMs, row.id, actorId]
  );
  return updated[0] || null;
}

async function loadUserForBreak(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id, shift FROM users WHERE id = $1 AND status = 'active' LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function findAttendanceForBreak(pool, userId, user, dateKey) {
  const key = String(dateKey || karachiDateKey(new Date())).slice(0, 10);
  const { rows } = await pool.query(
    `SELECT * FROM attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
    [userId, key]
  );
  if (rows[0]?.check_in) return rows[0];

  const prev = prevDateKey(key);
  if (!prev) return rows[0] || null;
  const { rows: prevRows } = await pool.query(
    `SELECT * FROM attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
    [userId, prev]
  );
  const prevRec = prevRows[0];
  if (prevRec?.check_in && !prevRec.check_out && user && !hasShiftEnded(user, prev, new Date())) {
    return prevRec;
  }
  return rows[0] || null;
}

function breakStatusPayload(row) {
  const breaks = parseJsonArray(row?.breaks);
  const totalBreakMs = row?.total_break_ms != null ? Number(row.total_break_ms) : 0;
  return {
    activeBreak: isActiveBreak(row),
    breakStart: row?.break_start || null,
    breaks,
    totalBreakMs,
    record: row ? attToJs(row) : null,
  };
}

/** Prefer top-level times; fall back to latest correction_log change targets. */
function resolveCorrectionTimes(r) {
  const log = Array.isArray(r?.correctionLog) ? r.correctionLog : [];
  const last = log.length ? log[log.length - 1] : null;
  const fromLogIn = last?.changes?.checkIn?.to;
  const fromLogOut = last?.changes?.checkOut?.to;
  const checkIn = r?.checkIn || fromLogIn || null;
  const checkOut = r?.checkOut || fromLogOut || null;
  return {
    checkIn: checkIn || null,
    checkOut: checkOut || null,
    last,
  };
}

export function registerAttendanceRestRoutes(app, pool, requireAuth, requireHrAdmin) {
  async function upsertAttendanceRecord(c, r) {
    // r is already camelCased from frontend utils/state
    const id = r?.id;
    if (!id) throw new Error("attendance.id is required");
    const userId = r.userId;
    const dateKey = String(r.date || "").slice(0, 10);
    if (!userId || !dateKey) throw new Error("attendance.userId and attendance.date are required");

    const isCorrection = r.manuallyCorrected === true;
    let checkIn = r.checkIn || null;
    let checkOut = r.checkOut || null;
    let workingMs = r.workingMs ?? null;
    let totalBreakMs = r.totalBreakMs ?? null;
    let status = r.status ?? null;
    let late = r.late || false;
    const breaks = r.breaks || [];
    const shortLeaves = r.shortLeaves || [];
    const breakStart = r.breakStart || null;
    const breakEnd = r.breakEnd || null;

    // Manual correction must carry a reason + edited-by metadata, and must
    // always write the corrected check_in / check_out onto the main row.
    if (isCorrection) {
      const resolved = resolveCorrectionTimes(r);
      const last = resolved.last;
      if (!last || !String(last.reason || "").trim()) throw new Error("Reason for correction is required.");
      if (!r.lastCorrectedBy || !r.lastCorrectedByRole) throw new Error("editedBy metadata is required.");
      checkIn = resolved.checkIn;
      checkOut = resolved.checkOut;
      if (!checkIn && !checkOut) throw new Error("Corrected check-in or check-out time is required.");

      // Recalculate metrics from the corrected times (do not trust stale client values).
      const { rows: userRows } = await c.query(
        `SELECT id, shift FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const user = userRows[0] || null;
      totalBreakMs = computeBreakMs(breaks, breakStart, breakEnd);
      if (checkIn && checkOut) {
        workingMs = computeNetWorkingMs(checkIn, checkOut, breaks, shortLeaves, breakStart, breakEnd);
      } else if (checkIn && user) {
        workingMs = computeNetWorkingMs(checkIn, new Date().toISOString(), breaks, shortLeaves, breakStart, breakEnd);
      } else {
        workingMs = null;
      }
      status = user
        ? computeBiometricDayStatus(user, checkIn, checkOut, {
            breaks,
            shortLeaves,
            breakStart,
            breakEnd,
            dateKey,
            now: new Date(),
            netWorkingMs: workingMs,
            source: r.source || "manual",
          })
        : (checkOut ? "Present" : (checkIn ? "Missing Checkout" : "Absent"));
      late = user ? isLateCheckIn(checkIn, user, dateKey) : false;
    }

    // Prefer the existing (user_id, date) row so corrections never land on a
    // duplicate id while the biometric row keeps the old check_out.
    let canonicalId = id;
    if (isCorrection) {
      const { rows: existingRows } = await c.query(
        `SELECT id FROM attendance WHERE user_id = $1 AND date = $2
         ORDER BY updated_at DESC NULLS LAST, id LIMIT 1`,
        [userId, dateKey]
      );
      if (existingRows[0]?.id) canonicalId = existingRows[0].id;
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
         last_corrected_on = EXCLUDED.last_corrected_on,
         updated_at = NOW()`,
      [
        canonicalId,
        userId,
        dateKey,
        checkIn,
        checkOut,
        JSON.stringify(breaks),
        JSON.stringify(shortLeaves),
        breakStart,
        breakEnd,
        r.autoCheckout || false,
        workingMs,
        totalBreakMs,
        status,
        late,
        r.source || "manual",
        r.checkInMethod || null,
        r.checkOutMethod || null,
        r.lastScan || null,
        r.lastScanMethod || null,
        isCorrection,
        JSON.stringify(r.correctionLog || []),
        r.lastCorrectedBy || null,
        r.lastCorrectedByRole || null,
        r.lastCorrectedOn || null,
      ]
    );

    // Belt-and-suspenders: force the main clock fields on correction even if
    // an older partial UPDATE path somehow ran without them.
    if (isCorrection) {
      const source = r.source || "manual";
      const checkInMethod = r.checkInMethod || null;
      const checkOutMethod = r.checkOutMethod || null;
      await c.query(
        `UPDATE attendance SET
           check_in = $1,
           check_out = $2,
           status = $3,
           working_ms = $4,
           total_break_ms = $5,
           late = $6,
           source = $7,
           check_in_method = $8,
           check_out_method = $9,
           manually_corrected = true,
           correction_log = $10,
           last_corrected_by = $11,
           last_corrected_by_role = $12,
           last_corrected_on = $13,
           updated_at = NOW()
         WHERE id = $14`,
        [
          checkIn,
          checkOut,
          status,
          workingMs,
          totalBreakMs,
          late,
          source,
          checkInMethod,
          checkOutMethod,
          JSON.stringify(r.correctionLog || []),
          r.lastCorrectedBy || null,
          r.lastCorrectedByRole || null,
          r.lastCorrectedOn || null,
          canonicalId,
        ]
      );
    }
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
      const roleCanViewAll = HR_OPS_ROLES.includes(actor.role);

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

  app.get("/api/attendance/break/status", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const date = String(req.query.date || req.body?.date || "").slice(0, 10) || karachiDateKey(new Date());
      const user = await loadUserForBreak(pool, actor.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      let row = await findAttendanceForBreak(pool, actor.id, user, date);
      if (!row) {
        return res.json({
          activeBreak: false,
          breakStart: null,
          breaks: [],
          totalBreakMs: 0,
          record: null,
        });
      }
      // Forgotten break: auto-end after 60 minutes and report not on break.
      if (isStuckBreak(row)) {
        row = await finalizeOpenBreak(pool, row, actor.id, forgottenBreakEndIso(row.break_start));
      }
      res.json(breakStatusPayload(row));
    } catch (e) {
      console.error("GET /api/attendance/break/status error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/attendance/break/start", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const date = String(req.body?.date || "").slice(0, 10) || karachiDateKey(new Date());
      const user = await loadUserForBreak(pool, actor.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      let row = await findAttendanceForBreak(pool, actor.id, user, date);
      if (!row?.check_in) {
        return res.status(400).json({ error: "You must check in first" });
      }
      if (row.check_out) {
        return res.status(400).json({ error: "Cannot start a break after check-out" });
      }
      if (isActiveBreak(row)) {
        if (isStuckBreak(row)) {
          // Forgotten break end — close the stuck break, then allow a new start.
          row = await finalizeOpenBreak(pool, row, actor.id, forgottenBreakEndIso(row.break_start));
        } else {
          return res.status(400).json({ error: "Break already active" });
        }
      }

      const breakStart = new Date().toISOString();
      const { rows: updated } = await pool.query(
        `UPDATE attendance SET break_start = $1, break_end = NULL
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [breakStart, row.id, actor.id]
      );
      const next = updated[0];
      res.json({ ok: true, breakStart, record: attToJs(next) });
    } catch (e) {
      console.error("POST /api/attendance/break/start error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/attendance/break/end", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      const date = String(req.body?.date || "").slice(0, 10) || karachiDateKey(new Date());
      const user = await loadUserForBreak(pool, actor.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const row = await findAttendanceForBreak(pool, actor.id, user, date);
      if (!row?.break_start) {
        return res.status(400).json({ error: "No active break" });
      }
      if (row.break_end) {
        return res.status(400).json({ error: "No active break" });
      }

      const breakEnd = new Date().toISOString();
      const breakStart = row.break_start;
      const breakDuration = Math.max(0, new Date(breakEnd) - new Date(breakStart));
      const next = await finalizeOpenBreak(pool, row, actor.id, breakEnd);
      res.json({
        ok: true,
        breakEnd,
        breakDuration,
        totalBreakMs: next?.total_break_ms != null ? Number(next.total_break_ms) : 0,
        record: attToJs(next),
      });
    } catch (e) {
      console.error("POST /api/attendance/break/end error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── WFH portal check-in / check-out ───
  app.post("/api/attendance/wfh-checkin", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      if (roleHasNoAttendance(actor.role)) {
        return res.status(403).json({ error: "Not applicable" });
      }

      const now = new Date();
      const today = karachiDateKey(now);
      const earliest = getCheckInEarliest(today);
      if (earliest && now < earliest) {
        return res.status(400).json({ error: "Check-in not allowed before 11:00 AM" });
      }

      const { rows: wfhRows } = await pool.query(
        `SELECT id FROM leave_requests
         WHERE user_id = $1 AND type = 'WFH' AND status = 'approved'
           AND from_date <= $2 AND to_date >= $2
         LIMIT 1`,
        [actor.id, today]
      );
      if (!wfhRows[0]) {
        return res.status(403).json({ error: "No approved WFH leave for today" });
      }

      const { rows: existing } = await pool.query(
        `SELECT * FROM attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
        [actor.id, today]
      );
      if (existing[0]?.check_in) {
        return res.status(400).json({ error: "Already checked in today" });
      }

      const { rows: userRows } = await pool.query(
        `SELECT id, name, role, shift, status FROM users WHERE id = $1 LIMIT 1`,
        [actor.id]
      );
      const dbUser = userRows[0];
      if (!dbUser || dbUser.status !== "active") {
        return res.status(404).json({ error: "User not found" });
      }
      const user = { id: dbUser.id, name: dbUser.name, role: dbUser.role, shift: dbUser.shift };
      const checkInIso = now.toISOString();
      const late = isLateCheckIn(checkInIso, user, today);

      let inserted;
      if (existing[0] && !existing[0].check_in) {
        const { rows: updated } = await pool.query(
          `UPDATE attendance SET
             check_in = $1,
             check_out = NULL,
             status = 'Present',
             late = $2,
             source = 'wfh',
             check_in_method = 'wfh',
             check_out_method = NULL,
             total_break_ms = COALESCE(total_break_ms, 0),
             breaks = COALESCE(breaks, '[]'::jsonb)
           WHERE id = $3 AND user_id = $4
           RETURNING *`,
          [checkInIso, late, existing[0].id, actor.id]
        );
        inserted = updated[0];
      } else {
        const { rows: created } = await pool.query(
          `INSERT INTO attendance (
             id, user_id, date, check_in, check_out, breaks, short_leaves,
             auto_checkout, working_ms, total_break_ms, status, late, source,
             check_in_method, check_out_method
           ) VALUES ($1,$2,$3,$4,NULL,'[]'::jsonb,'[]'::jsonb,false,NULL,0,'Present',$5,'wfh','wfh',NULL)
           RETURNING *`,
          [genAttId(), actor.id, today, checkInIso, late]
        );
        inserted = created[0];
      }

      res.json(attToJs(inserted));
    } catch (e) {
      console.error("POST /api/attendance/wfh-checkin error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/attendance/wfh-checkout", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      if (roleHasNoAttendance(actor.role)) {
        return res.status(403).json({ error: "Not applicable" });
      }

      const now = new Date();

      const row = await findOpenWfhAttendance(pool, actor.id, now);
      if (!row?.check_in) {
        return res.status(404).json({ error: "No open WFH check-in found" });
      }
      if (row.check_out) {
        return res.status(400).json({ error: "Already checked out" });
      }

      const attendanceDate = String(row.date || karachiDateKey(now)).slice(0, 10);

      const { rows: userRows } = await pool.query(
        `SELECT id, name, role, shift, status FROM users WHERE id = $1 LIMIT 1`,
        [actor.id]
      );
      const dbUser = userRows[0];
      if (!dbUser) {
        return res.status(404).json({ error: "User not found" });
      }
      const user = { id: dbUser.id, name: dbUser.name, role: dbUser.role, shift: dbUser.shift };

      const checkOutIso = now.toISOString();
      let breaks = parseJsonArray(row.breaks);
      let breakStart = row.break_start || null;
      // Close an open break at checkout so working_ms is accurate.
      if (breakStart && !row.break_end) {
        breaks = [...breaks, { start: breakStart, end: checkOutIso }];
        breakStart = null;
      }
      const shortLeaves = parseJsonArray(row.short_leaves);
      const totalBreakMs = computeBreakMs(breaks);
      const workingMs = computeNetWorkingMs(
        row.check_in,
        checkOutIso,
        breaks,
        shortLeaves,
        null,
        null
      );
      const status = computeBiometricDayStatus(user, row.check_in, checkOutIso, {
        dateKey: attendanceDate,
        now,
        breaks,
        shortLeaves,
        netWorkingMs: workingMs,
      });

      const { rows: updated } = await pool.query(
        `UPDATE attendance SET
           check_out = $1,
           check_out_method = 'wfh',
           working_ms = $2,
           total_break_ms = $3,
           breaks = $4,
           break_start = NULL,
           break_end = NULL,
           status = $5
         WHERE id = $6 AND user_id = $7
         RETURNING *`,
        [
          checkOutIso,
          workingMs,
          totalBreakMs,
          JSON.stringify(breaks),
          status,
          row.id,
          actor.id,
        ]
      );

      res.json(attToJs(updated[0]));
    } catch (e) {
      console.error("POST /api/attendance/wfh-checkout error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

