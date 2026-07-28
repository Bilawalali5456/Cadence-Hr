import { karachiDateKey, parseZktTime } from "./admsHelpers.js";

/**
 * Biometric attendance calculation:
 * - First scan of day = Check-in (finalized immediately)
 * - During active shift: latest scan = provisional last_scan (NOT check-out)
 * - After shift end or midnight: last scan = Check-out (if ≥2 scans)
 * - Single scan after day closed = Missing Checkout
 * - Working hours during shift = live from check-in to now
 */

export function hasShiftEnded(user, dateKey, now = new Date()) {
  return now >= getShiftEndDate(user, dateKey);
}

/** Shift end + 30 minutes — when auto-checkout runs for single-scan days. */
export function isAutoCheckoutDue(user, dateKey, now = new Date()) {
  if (!hasShiftEnded(user, dateKey, now)) return false;
  const shift = getUserShift(user, dateKey);
  if (shift.off) return false;
  return now >= new Date(getShiftEndDate(user, dateKey).getTime() + 30 * 60000);
}

function getShiftEndDate(user, dateKey) {
  const shift = getUserShift(user, dateKey);
  const start = shiftDateTime(dateKey, shift.shiftStart);
  let end = shiftDateTime(dateKey, shift.shiftEnd);
  if (end <= start) end = new Date(end.getTime() + 86400000);
  return end;
}

/** ISO check-out time at scheduled shift end (for auto-checkout). */
export function shiftEndIso(user, dateKey) {
  const shift = getUserShift(user, dateKey);
  const text = `${dateKey} ${shift.shiftEnd}:00`;
  return parseZktTime(text)?.toISOString() || getShiftEndDate(user, dateKey).toISOString();
}

export function hasExtraScan(record) {
  return !!(record?.lastScan && record.lastScan !== record?.checkIn);
}

/** Karachi calendar day has passed for this attendance date (midnight cutoff). */
export function isAttendanceDayClosed(dateKey, now = new Date()) {
  return dateKeyFromDate(now) > String(dateKey || "").slice(0, 10);
}

export function shouldFinalizeAttendance(user, dateKey, now = new Date()) {
  if (isAttendanceDayClosed(dateKey, now)) return true;
  return hasShiftEnded(user, dateKey, now);
}

export function isAttendanceInProgress(user, record, dateKey, now = new Date()) {
  if (!record?.checkIn || record.checkOut) return false;
  if (record.manuallyCorrected) return false;
  if (!hasShiftEnded(user, dateKey, now) && !isAttendanceDayClosed(dateKey, now)) return true;
  // Shift ended but only one scan — keep "Working" until auto-checkout at shift end + 30 min
  if (!hasExtraScan(record) && !isAutoCheckoutDue(user, dateKey, now)) return true;
  return false;
}

export function dateKeyFromDate(d) {
  return karachiDateKey(d);
}

const SHIFT_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DEFAULT_WEEKLY_SCHEDULE = {
  monday:    { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  tuesday:   { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  wednesday: { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  thursday:  { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  friday:    { off: false, shiftStart: "14:00", shiftEnd: "18:00" },
  saturday:  { off: true,  shiftStart: "09:00", shiftEnd: "14:00" },
  sunday:    { off: true,  shiftStart: "09:00", shiftEnd: "18:00" },
};

function genAttId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function shiftDayKey(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  return SHIFT_DAYS[(d.getDay() + 6) % 7];
}

function isWeekendDate(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function normalizeWeeklySchedule(shift = {}) {
  const base = shift?.weeklySchedule && typeof shift.weeklySchedule === "object"
    ? shift.weeklySchedule
    : null;
  const fallbackStart = shift.shiftStart || "09:00";
  const fallbackEnd = shift.shiftEnd || "18:00";
  const weekly = {};
  for (const day of SHIFT_DAYS) {
    const def = DEFAULT_WEEKLY_SCHEDULE[day];
    const src = base?.[day];
    const isWeekend = day === "saturday" || day === "sunday";
    weekly[day] = {
      off: isWeekend ? true : (src?.off ?? (base ? def.off : false)),
      shiftStart: src?.shiftStart || (base ? def.shiftStart : fallbackStart),
      shiftEnd: src?.shiftEnd || (base ? def.shiftEnd : fallbackEnd),
    };
  }
  return weekly;
}

function enrichUserShift(user) {
  if (user.shift && typeof user.shift === "object") return user;
  return {
    ...user,
    shift: {
      shiftStart: "09:00",
      shiftEnd: "18:00",
      graceMinutes: 15,
      breakMinutes: 60,
      checkoutGraceMinutes: 10,
      weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
    },
  };
}

export function getUserShift(user, dateKey = dateKeyFromDate(new Date())) {
  const s = (user?.shift && typeof user.shift === "object") ? user.shift : {};
  const weeklySchedule = normalizeWeeklySchedule(s);
  const day = shiftDayKey(dateKey);
  const daySchedule = weeklySchedule[day] || DEFAULT_WEEKLY_SCHEDULE[day];
  const isWeekend = day === "saturday" || day === "sunday";
  return {
    shiftStart: daySchedule.shiftStart || "09:00",
    shiftEnd: daySchedule.shiftEnd || "18:00",
    graceMinutes: s.graceMinutes ?? 15,
    breakMinutes: s.breakMinutes ?? 60,
    checkoutGraceMinutes: s.checkoutGraceMinutes ?? 10,
    off: isWeekend || !!daySchedule.off,
    weeklySchedule,
    day,
  };
}

function shiftDateTime(dateKey, hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const d = new Date(`${dateKey}T00:00:00`);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function methodLabel(verifyMethod) {
  const m = String(verifyMethod || "").toLowerCase();
  if (m === "face") return "Face";
  if (m === "fingerprint") return "Fingerprint";
  if (m === "card") return "Card";
  if (m === "password") return "Password";
  return verifyMethod ? String(verifyMethod) : null;
}

export function computeWorkingMs(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const ms = new Date(checkOut) - new Date(checkIn);
  return ms > 0 ? ms : null;
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

/** Sum approved/open break intervals (portal + biometric record breaks). */
export function computeBreakMs(breaks, breakStart = null, breakEnd = null) {
  let total = parseJsonArray(breaks).reduce((sum, b) => {
    if (!b?.start || !b?.end) return sum;
    const ms = new Date(b.end) - new Date(b.start);
    return sum + (ms > 0 ? ms : 0);
  }, 0);
  if (breakStart && breakEnd) {
    const ms = new Date(breakEnd) - new Date(breakStart);
    if (ms > 0) total += ms;
  }
  return total;
}

/** Sum approved short-leave intervals stored on the attendance row. */
export function computeShortLeaveMs(shortLeaves) {
  return parseJsonArray(shortLeaves)
    .filter(sl => !sl.status || sl.status === "approved")
    .reduce((sum, sl) => {
      if (!sl?.start || !sl?.end) return sum;
      const ms = new Date(sl.end) - new Date(sl.start);
      return sum + (ms > 0 ? ms : 0);
    }, 0);
}

/**
 * Net working ms = (check-out − check-in) − breaks − approved short leaves.
 * Used so periodic sync does not wipe portal break adjustments from status.
 */
export function computeNetWorkingMs(checkIn, checkOut, breaks = [], shortLeaves = [], breakStart = null, breakEnd = null) {
  const gross = computeWorkingMs(checkIn, checkOut);
  if (gross == null) return null;
  return Math.max(0, gross - computeBreakMs(breaks, breakStart, breakEnd) - computeShortLeaveMs(shortLeaves));
}

/** Required duty ms = shift window minus unpaid break. */
export function requiredDutyMs(user, dateKey) {
  const shift = getUserShift(user, dateKey);
  if (shift.off) return 0;
  const start = shiftDateTime(dateKey, shift.shiftStart);
  let end = shiftDateTime(dateKey, shift.shiftEnd);
  if (end <= start) end = new Date(end.getTime() + 86400000);
  return Math.max(0, end - start - shift.breakMinutes * 60000);
}

export function isLateCheckIn(checkInIso, user) {
  if (!checkInIso || !user) return false;
  const d = new Date(checkInIso);
  const dateKey = dateKeyFromDate(d);
  const shift = getUserShift(user, dateKey);
  if (shift.off) return false;
  const start = shiftDateTime(dateKey, shift.shiftStart);
  // Late after shift start + grace (grace is part of assigned duty schedule)
  const lateCutoff = new Date(start.getTime() + shift.graceMinutes * 60000);
  return d > lateCutoff;
}

export function isEarlyLeave(checkOutIso, user) {
  if (!checkOutIso || !user) return false;
  const d = new Date(checkOutIso);
  const dateKey = dateKeyFromDate(d);
  const shift = getUserShift(user, dateKey);
  if (shift.off) return false;
  return d < getShiftEndDate(user, dateKey);
}

export function isShortHours(checkIn, checkOut, user, options = {}) {
  if (!checkIn || !checkOut || !user) return false;
  const dateKey = dateKeyFromDate(new Date(checkIn));
  if (getUserShift(user, dateKey).off) return false;
  // Only trust a precomputed net when it is an actual number.
  // (undefined/null must fall through — `!= null` already does, but typeof is clearer.)
  const worked = typeof options.netWorkingMs === "number"
    ? options.netWorkingMs
    : computeNetWorkingMs(
      checkIn,
      checkOut,
      options.breaks,
      options.shortLeaves,
      options.breakStart,
      options.breakEnd
    );
  if (worked == null || Number.isNaN(worked)) return false;
  const required = requiredDutyMs(user, dateKey);
  return required > 0 && worked < required;
}

/**
 * Status priority after finalization: Absent → Missing Checkout → Late → Early Leave → Short Hours → Present
 * During active shift with check-in: Working
 */
export function computeBiometricDayStatus(user, checkIn, checkOut, options = {}) {
  const dateKey = options.dateKey || (checkIn ? dateKeyFromDate(new Date(checkIn)) : dateKeyFromDate(new Date()));
  const now = options.now || new Date();
  const shift = getUserShift(user, dateKey);
  if (shift.off) return checkIn ? "Present" : "Absent";
  if (!checkIn) return "Absent";

  if (!hasShiftEnded(user, dateKey, now)) return "Working";

  const late = isLateCheckIn(checkIn, user);
  if (!checkOut) return shouldFinalizeAttendance(user, dateKey, now) ? "Missing Checkout" : (late ? "Late" : "Present");
  if (late) return "Late";
  if (!hasShiftEnded(user, dateKey, now)) return "Working";
  if (isEarlyLeave(checkOut, user)) return "Early Leave";
  if (isShortHours(checkIn, checkOut, user, options)) return "Short Hours";
  return "Present";
}

/**
 * First scan = check-in. Last scan becomes check-out only after shift end or midnight.
 */
export function aggregateDayScans(logs, user, dateKey, now = new Date()) {
  const sorted = [...(logs || [])].sort(
    (a, b) => parseZktTime(a.punch_time_local || a.punch_time) - parseZktTime(b.punch_time_local || b.punch_time)
  );
  if (!sorted.length) {
    return {
      checkIn: null, checkOut: null, lastScan: null,
      checkInMethod: null, checkOutMethod: null, lastScanMethod: null, scanCount: 0,
    };
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const checkIn = parseZktTime(first.punch_time_local || first.punch_time)?.toISOString();
  const checkInMethod = methodLabel(first.verify_method);
  const lastIso = parseZktTime(last.punch_time_local || last.punch_time)?.toISOString();
  const lastScanMethod = methodLabel(last.verify_method);
  const scanCount = sorted.length;
  const finalized = shouldFinalizeAttendance(user, dateKey, now);

  if (scanCount === 1) {
    return {
      checkIn, checkOut: null, lastScan: null,
      checkInMethod, checkOutMethod: null, lastScanMethod: null, scanCount,
    };
  }

  if (!finalized) {
    return {
      checkIn,
      checkOut: null,
      lastScan: lastIso,
      checkInMethod,
      checkOutMethod: null,
      lastScanMethod,
      scanCount,
    };
  }

  return {
    checkIn,
    checkOut: lastIso,
    lastScan: lastIso,
    checkInMethod,
    checkOutMethod: lastScanMethod,
    lastScanMethod,
    scanCount,
  };
}

function resolveFinalizedCheckout(user, dateKey, agg, prev, now) {
  let checkOut = agg.checkOut || null;
  let checkOutMethod = agg.checkOutMethod || null;
  let autoCheckout = false;
  let lastScan = agg.lastScan || null;

  if (checkOut) {
    return { checkOut, checkOutMethod, autoCheckout: false, lastScan };
  }

  if (hasExtraScan({ checkIn: agg.checkIn, lastScan: agg.lastScan || prev.last_scan }) && hasShiftEnded(user, dateKey, now)) {
    checkOut = agg.lastScan || prev.last_scan;
    checkOutMethod = agg.lastScanMethod || prev.last_scan_method || null;
    return { checkOut, checkOutMethod, autoCheckout: false, lastScan: checkOut };
  }

  if (agg.checkIn && agg.scanCount === 1 && isAutoCheckoutDue(user, dateKey, now)) {
    checkOut = shiftEndIso(user, dateKey);
    return { checkOut, checkOutMethod: null, autoCheckout: true, lastScan: null };
  }

  return { checkOut: null, checkOutMethod: null, autoCheckout: false, lastScan };
}

/**
 * Rebuild daily attendance from attendance_logs for mapped employees.
 * When new scans arrive for a day, reloads ALL that day's logs so first/last stay correct.
 */
export async function syncAttendanceFromLogs(pool) {
  const { rows: pending } = await pool.query(
    `SELECT DISTINCT employee_id, TO_CHAR(punch_time, 'YYYY-MM-DD') AS day
     FROM attendance_logs
     WHERE synced_to_attendance = false AND is_duplicate = false AND employee_id IS NOT NULL`
  );
  if (!pending.length) return { logsProcessed: 0, rowsUpdated: 0 };

  const { rows: users } = await pool.query(`SELECT id, shift FROM users WHERE status = 'active'`);
  const userById = new Map(users.map(u => [u.id, enrichUserShift(u)]));

  let rowsUpdated = 0;
  let logsProcessed = 0;

  for (const row of pending) {
    const employeeId = row.employee_id;
    const dateKey = String(row.day || "").slice(0, 10);
    const user = userById.get(employeeId);
    if (!user) continue;

    const { rows: dayLogs } = await pool.query(
      `SELECT attendance_logs.*, TO_CHAR(punch_time, 'YYYY-MM-DD HH24:MI:SS') AS punch_time_local
       FROM attendance_logs
       WHERE employee_id = $1
         AND is_duplicate = false
         AND punch_time::date = $2::date
       ORDER BY punch_time ASC`,
      [employeeId, dateKey]
    );
    if (!dayLogs.length) continue;

    const agg = aggregateDayScans(dayLogs, user, dateKey, new Date());
    if (!agg.checkIn) continue;

    const now = new Date();
    const timeOptsBase = { dateKey, now, source: "biometric" };

    const existing = await pool.query(
      `SELECT * FROM attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
      [employeeId, dateKey]
    );

    function computeRowMetrics(checkIn, checkOut, breaks, shortLeaves, breakStart, breakEnd) {
      const timeOpts = { breaks, shortLeaves, breakStart, breakEnd, ...timeOptsBase };
      const inProgress = isAttendanceInProgress(user, { checkIn, checkOut, source: "biometric" }, dateKey, now);
      let workingMs = null;
      if (inProgress && checkIn) {
        workingMs = computeNetWorkingMs(checkIn, now.toISOString(), breaks, shortLeaves, breakStart, breakEnd);
      } else if (checkIn && checkOut) {
        workingMs = computeNetWorkingMs(checkIn, checkOut, breaks, shortLeaves, breakStart, breakEnd);
      }
      const status = computeBiometricDayStatus(user, checkIn, checkOut, {
        ...timeOpts,
        netWorkingMs: workingMs,
      });
      const late = isLateCheckIn(checkIn, user);
      const totalBreakMs = computeBreakMs(breaks, breakStart, breakEnd);
      return { workingMs, status, late, totalBreakMs };
    }

    if (existing.rows.length === 0) {
      const resolved = resolveFinalizedCheckout(user, dateKey, agg, {}, now);
      const finalCheckOut = agg.checkOut || resolved.checkOut;
      const finalAuto = resolved.autoCheckout;
      const { workingMs, status, late } = computeRowMetrics(
        agg.checkIn, finalCheckOut, [], [], null, null
      );

      await pool.query(
        `INSERT INTO attendance (
           id, user_id, date, check_in, check_out, last_scan, breaks, short_leaves,
           auto_checkout, working_ms, total_break_ms, status, late, source,
           check_in_method, check_out_method, last_scan_method
         ) VALUES ($1,$2,$3,$4,$5,$6,'[]','[]',$7,$8,0,$9,$10,'biometric',$11,$12,$13)`,
        [
          genAttId(), employeeId, dateKey, agg.checkIn, finalCheckOut, agg.lastScan,
          finalAuto, workingMs, status, late,
          agg.checkInMethod, finalAuto ? null : (agg.checkOutMethod || resolved.checkOutMethod),
          agg.lastScanMethod,
        ]
      );
      rowsUpdated += 1;
    } else {
      const prev = existing.rows[0];
      const source = prev.source || "manual";
      const breaks = parseJsonArray(prev.breaks);
      const shortLeaves = parseJsonArray(prev.short_leaves);
      const breakStart = prev.break_start || null;
      const breakEnd = prev.break_end || null;

      let newCheckIn = prev.check_in;
      let newCheckOut = prev.check_out;
      let newLastScan = prev.last_scan || null;
      let newInMethod = prev.check_in_method || null;
      let newOutMethod = prev.check_out_method || null;
      let newLastScanMethod = prev.last_scan_method || null;
      let newSource = source;
      let newAutoCheckout = prev.auto_checkout || false;

      if (source === "biometric" || !prev.check_in) {
        newCheckIn = agg.checkIn;
        newLastScan = agg.lastScan;
        newInMethod = agg.checkInMethod;
        newLastScanMethod = agg.lastScanMethod;
        newSource = "biometric";
        const resolved = resolveFinalizedCheckout(user, dateKey, agg, prev, now);
        newCheckOut = agg.checkOut || resolved.checkOut;
        newOutMethod = agg.checkOut ? agg.checkOutMethod : resolved.checkOutMethod;
        newAutoCheckout = resolved.autoCheckout;
      } else if (source === "manual" && !prev.check_out) {
        if (!newCheckIn) {
          newCheckIn = agg.checkIn;
          newInMethod = agg.checkInMethod;
        }
        if (agg.lastScan) {
          newLastScan = agg.lastScan;
          newLastScanMethod = agg.lastScanMethod;
        }
        if (shouldFinalizeAttendance(user, dateKey, now) && agg.checkOut) {
          newCheckOut = agg.checkOut;
          newOutMethod = agg.checkOutMethod;
        }
        newSource = "manual";
      } else {
        newSource = "manual";
      }

      const { workingMs, status, late, totalBreakMs } = computeRowMetrics(
        newCheckIn, newCheckOut, breaks, shortLeaves, breakStart, breakEnd
      );

      await pool.query(
        `UPDATE attendance SET
           check_in = $1, check_out = $2, last_scan = $3, working_ms = $4, total_break_ms = $5,
           status = $6, late = $7, source = $8, check_in_method = $9, check_out_method = $10,
           last_scan_method = $11, auto_checkout = $12
         WHERE id = $13`,
        [
          newCheckIn, newCheckOut, newLastScan, workingMs, totalBreakMs,
          status, late, newSource, newInMethod, newOutMethod, newLastScanMethod,
          newAutoCheckout, prev.id,
        ]
      );
      rowsUpdated += 1;
    }

    const { rowCount } = await pool.query(
      `UPDATE attendance_logs SET synced_to_attendance = true, updated_at = NOW()
       WHERE employee_id = $1 AND is_duplicate = false AND punch_time::date = $2::date
         AND synced_to_attendance = false`,
      [employeeId, dateKey]
    );
    logsProcessed += rowCount || 0;
  }

  return { logsProcessed, rowsUpdated: rowsUpdated + await finalizeOpenAttendance(pool) };
}

/** Finalize or repair open attendance when shift ends, at midnight, or fix premature check-outs. */
export async function finalizeOpenAttendance(pool) {
  const now = new Date();
  const { rows: users } = await pool.query(`SELECT id, shift FROM users WHERE status = 'active'`);
  const userById = new Map(users.map(u => [u.id, enrichUserShift(u)]));

  const { rows: openRows } = await pool.query(
    `SELECT * FROM attendance
     WHERE check_in IS NOT NULL
       AND (
         check_out IS NULL
         OR status = 'Working'
         OR status = 'Early Leave'
         OR last_scan IS NOT NULL
       )`
  );

  let rowsUpdated = 0;
  for (const prev of openRows) {
    const user = userById.get(prev.user_id);
    if (!user) continue;
    const dateKey = String(prev.date || "").slice(0, 10);
    const breaks = parseJsonArray(prev.breaks);
    const shortLeaves = parseJsonArray(prev.short_leaves);
    const breakStart = prev.break_start || null;
    const breakEnd = prev.break_end || null;
    const record = {
      checkIn: prev.check_in,
      checkOut: prev.check_out,
      lastScan: prev.last_scan,
      source: prev.source || "manual",
    };
    const inProgress = isAttendanceInProgress(user, record, dateKey, now);
    const finalized = shouldFinalizeAttendance(user, dateKey, now);

    if (inProgress && prev.source === "biometric" && prev.check_out && prev.check_out !== prev.check_in) {
      const workingMs = computeNetWorkingMs(prev.check_in, now.toISOString(), breaks, shortLeaves, breakStart, breakEnd);
      await pool.query(
        `UPDATE attendance SET
           check_out = NULL, check_out_method = NULL, auto_checkout = false,
           last_scan = $1, last_scan_method = COALESCE($2, last_scan_method),
           status = 'Working', working_ms = $3, late = $4
         WHERE id = $5`,
        [
          prev.check_out, prev.check_out_method, workingMs,
          isLateCheckIn(prev.check_in, user), prev.id,
        ]
      );
      rowsUpdated += 1;
      continue;
    }

    if (!finalized) continue;

    if (prev.source === "biometric") {
      const { rows: dayLogs } = await pool.query(
        `SELECT attendance_logs.*, TO_CHAR(punch_time, 'YYYY-MM-DD HH24:MI:SS') AS punch_time_local
         FROM attendance_logs
         WHERE employee_id = $1 AND is_duplicate = false AND punch_time::date = $2::date
         ORDER BY punch_time ASC`,
        [prev.user_id, dateKey]
      );
      const agg = aggregateDayScans(dayLogs, user, dateKey, now);
      if (!agg.checkIn) continue;
      const resolved = resolveFinalizedCheckout(user, dateKey, agg, prev, now);
      const checkOut = agg.checkOut || resolved.checkOut;
      const autoCheckout = resolved.autoCheckout;
      const workingMs = checkOut
        ? computeNetWorkingMs(agg.checkIn, checkOut, breaks, shortLeaves, breakStart, breakEnd)
        : null;
      const status = computeBiometricDayStatus(user, agg.checkIn, checkOut, {
        breaks, shortLeaves, breakStart, breakEnd, dateKey, now,
        netWorkingMs: workingMs, source: "biometric",
      });
      await pool.query(
        `UPDATE attendance SET
           check_in = $1, check_out = $2, last_scan = $3,
           working_ms = $4, status = $5, late = $6, auto_checkout = $7,
           check_in_method = $8, check_out_method = $9, last_scan_method = $10
         WHERE id = $11`,
        [
          agg.checkIn, checkOut, agg.lastScan, workingMs, status,
          isLateCheckIn(agg.checkIn, user), autoCheckout,
          agg.checkInMethod, autoCheckout ? null : (agg.checkOutMethod || resolved.checkOutMethod),
          agg.lastScanMethod, prev.id,
        ]
      );
      rowsUpdated += 1;
    } else if (!prev.check_out && isAutoCheckoutDue(user, dateKey, now)) {
      const checkOut = shiftEndIso(user, dateKey);
      const workingMs = computeNetWorkingMs(prev.check_in, checkOut, breaks, shortLeaves, breakStart, breakEnd);
      const status = computeBiometricDayStatus(user, prev.check_in, checkOut, {
        breaks, shortLeaves, breakStart, breakEnd, dateKey, now,
        netWorkingMs: workingMs, source: prev.source || "manual",
      });
      await pool.query(
        `UPDATE attendance SET check_out = $1, auto_checkout = true, working_ms = $2, status = $3, late = $4
         WHERE id = $5`,
        [checkOut, workingMs, status, isLateCheckIn(prev.check_in, user), prev.id]
      );
      rowsUpdated += 1;
    } else if (!prev.check_out && shouldFinalizeAttendance(user, dateKey, now)) {
      const status = "Missing Checkout";
      await pool.query(
        `UPDATE attendance SET status = $1, working_ms = NULL WHERE id = $2`,
        [status, prev.id]
      );
      rowsUpdated += 1;
    }
  }

  return rowsUpdated;
}

export function startAttendanceSyncProcessor(pool) {
  const intervalMs = 5 * 60 * 1000;
  setInterval(async () => {
    try {
      const r = await syncAttendanceFromLogs(pool);
      if (r.rowsUpdated > 0) {
        console.log(`[adms] sync interval: ${r.logsProcessed} logs → ${r.rowsUpdated} attendance rows`);
      }
    } catch (e) {
      console.error("[adms] sync interval error:", e.message);
    }
  }, intervalMs);
  console.log("[adms] attendance sync scheduled every 5 minutes");
}
