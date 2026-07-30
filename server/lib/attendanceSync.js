import { karachiDateKey, karachiTimestampText, parseZktTime } from "./admsHelpers.js";

/**
 * Final attendance policy (Pakistan / Asia/Karachi):
 * - Check-in window: 11:00 AM PKT → first scan = check-in
 * - Dead zone: 05:00–10:59 AM — scans ignored
 * - Checkout window: shift end → 05:00 AM next day (last scan = checkout)
 * - Finalize at shift end + 30 min; no auto-checkout (Missing Checkout instead)
 * - Early-leave grace: checkoutGraceMinutes (default 20) before shift end
 */

export function hasShiftEnded(user, dateKey, now = new Date()) {
  return now >= getShiftEndDate(user, dateKey);
}

/** Shift end + 30 minutes — when attendance is finalized (NOT auto-checkout). */
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
  if (!start || !end) return end || start || new Date(`${dateKey}T00:00:00Z`);
  if (end <= start) end = new Date(end.getTime() + 86400000);
  return end;
}

/** ISO time at scheduled shift end (used only for Missing Checkout working-hours estimate). */
export function shiftEndIso(user, dateKey) {
  return getShiftEndDate(user, dateKey).toISOString();
}

/** Checkout window closes at 05:00 AM PKT the morning after the attendance date. */
export function getCheckoutDeadline(dateKey) {
  return parseZktTime(`${getNextDate(dateKey)} 05:00:00`);
}

/** Check-in window opens at 11:00 AM PKT on the attendance date. */
export function getCheckInEarliest(dateKey) {
  return parseZktTime(`${dateKey} 11:00:00`);
}

export function hasExtraScan(record) {
  return !!(record?.lastScan && record.lastScan !== record?.checkIn);
}

/** Karachi calendar day has passed for this attendance date (midnight cutoff). */
export function isAttendanceDayClosed(dateKey, now = new Date()) {
  return dateKeyFromDate(now) > String(dateKey || "").slice(0, 10);
}

/**
 * Finalize only after shift end + 30 minutes (or after the Karachi day closes).
 * Mid-shift scans must never become check-out before this window.
 */
export function shouldFinalizeAttendance(user, dateKey, now = new Date()) {
  if (isAttendanceDayClosed(dateKey, now)) return true;
  return isAutoCheckoutDue(user, dateKey, now);
}

export function isAttendanceInProgress(user, record, dateKey, now = new Date()) {
  if (!record?.checkIn) return false;
  if (record.manuallyCorrected) return false;
  // Until finalize window: in progress. After finalize: closed even with Missing Checkout.
  return !shouldFinalizeAttendance(user, dateKey, now);
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
      checkoutGraceMinutes: 20,
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
    checkoutGraceMinutes: s.checkoutGraceMinutes ?? 20,
    off: isWeekend || !!daySchedule.off,
    weeklySchedule,
    day,
  };
}

function shiftDateTime(dateKey, hhmm) {
  // Parse as Pakistan wall-clock so shift bounds match punch times.
  const raw = String(hhmm || "00:00");
  const withSeconds = /^\d{1,2}:\d{2}$/.test(raw) ? `${raw}:00` : raw;
  return parseZktTime(`${dateKey} ${withSeconds}`) || parseZktTime(`${dateKey} ${raw}`);
}

function addDaysToDateKey(dateKey, delta) {
  const [y, m, d] = String(dateKey || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const utc = Date.UTC(y, m - 1, d) + delta * 86400000;
  const dt = new Date(utc);
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

function getPreviousDate(dateKey) {
  return addDaysToDateKey(dateKey, -1);
}

function getNextDate(dateKey) {
  return addDaysToDateKey(dateKey, 1);
}

/** PKT hour (0–23) from a Date. */
function pktHour(scanTime) {
  const text = karachiTimestampText(scanTime);
  if (!text || text.length < 13) return null;
  return Number(text.slice(11, 13));
}

/**
 * Map a punch to the attendance day it belongs to.
 * PKT rules:
 *   00:00–04:59 → previous day (checkout for yesterday)
 *   05:00–10:59 → dead zone (ignored — return "")
 *   11:00–23:59 → calendar day (check-in / mid-shift)
 */
export function getAttendanceDay(scanTime, user) {
  if (!scanTime || Number.isNaN(scanTime.getTime())) return "";
  const scanDate = karachiDateKey(scanTime);
  if (!scanDate) return "";
  const hour = pktHour(scanTime);
  if (hour == null || Number.isNaN(hour)) return "";

  // Dead zone: 5:00 AM – 10:59 AM PKT — ghosts, ignore entirely
  if (hour >= 5 && hour < 11) return "";

  // Early morning checkout window: assign to previous day
  if (hour < 5) {
    return getPreviousDate(scanDate);
  }

  // 11:00 AM – 23:59 → today
  return scanDate;
}

/** Load logs whose shift-aware attendance day equals dateKey (may span two calendar days). */
async function fetchLogsForAttendanceDay(pool, employeeId, user, dateKey) {
  const nextDate = getNextDate(dateKey);
  const { rows } = await pool.query(
    `SELECT attendance_logs.*, TO_CHAR(punch_time, 'YYYY-MM-DD HH24:MI:SS') AS punch_time_local
     FROM attendance_logs
     WHERE employee_id = $1
       AND is_duplicate = false
       AND punch_time::date IN ($2::date, $3::date)
     ORDER BY punch_time ASC`,
    [employeeId, dateKey, nextDate]
  );
  return rows.filter(log => {
    const scanTime = parseZktTime(log.punch_time_local || log.punch_time);
    return scanTime && getAttendanceDay(scanTime, user) === dateKey;
  });
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

/**
 * Working ms when checkout is missing after finalize:
 * assume worked until shift end.
 */
export function computeMissingCheckoutWorkingMs(checkIn, user, dateKey, breaks = [], shortLeaves = [], breakStart = null, breakEnd = null) {
  if (!checkIn || !user) return null;
  const shiftEnd = getShiftEndDate(user, dateKey);
  if (!shiftEnd) return null;
  return computeNetWorkingMs(checkIn, shiftEnd.toISOString(), breaks, shortLeaves, breakStart, breakEnd);
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

export function isLateCheckIn(checkInIso, user, dateKeyOverride = null) {
  if (!checkInIso || !user) return false;
  const d = new Date(checkInIso);
  const dateKey = dateKeyOverride || dateKeyFromDate(d);
  const shift = getUserShift(user, dateKey);
  if (shift.off) return false;
  const start = shiftDateTime(dateKey, shift.shiftStart);
  // Late after shift start + grace (grace is part of assigned duty schedule)
  const lateCutoff = new Date(start.getTime() + shift.graceMinutes * 60000);
  return d > lateCutoff;
}

export function isEarlyLeave(checkOutIso, user, dateKeyOverride = null) {
  if (!checkOutIso || !user) return false;
  const d = new Date(checkOutIso);
  // Prefer attendance dateKey (critical for overnight checkouts after midnight).
  const dateKey = dateKeyOverride || dateKeyFromDate(d);
  const shift = getUserShift(user, dateKey);
  if (shift.off) return false;
  const grace = (shift.checkoutGraceMinutes ?? 20) * 60000;
  return d < new Date(getShiftEndDate(user, dateKey).getTime() - grace);
}

export function isShortHours(checkIn, checkOut, user, options = {}) {
  if (!checkIn || !checkOut || !user) return false;
  const dateKey = options.dateKey || dateKeyFromDate(new Date(checkIn));
  if (getUserShift(user, dateKey).off) return false;
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
 * Status priority after finalization:
 * Absent → Missing Checkout → Early Leave → Short Hours → Present
 * Late check-in alone does NOT set day status to Late when duty is completed
 * (checkout at/after shift end − grace). The Late badge on check-in covers that.
 * Until shift end + 30 min with check-in: Working
 * Auto Checkout is removed — never returned.
 */
export function computeBiometricDayStatus(user, checkIn, checkOut, options = {}) {
  const dateKey = options.dateKey || (checkIn ? dateKeyFromDate(new Date(checkIn)) : dateKeyFromDate(new Date()));
  const now = options.now || new Date();
  const shift = getUserShift(user, dateKey);
  if (shift.off) return checkIn ? "Present" : "Absent";
  if (!checkIn) return "Absent";

  // Never finalize status during the active window (before shift end + 30 min).
  if (!shouldFinalizeAttendance(user, dateKey, now)) return "Working";

  if (!checkOut) return "Missing Checkout";
  // Early Leave beats Late when both apply.
  if (isEarlyLeave(checkOut, user, dateKey)) return "Early Leave";
  // Late check-in + completed shift → Present (or Short Hours). Not "Late".
  if (isShortHours(checkIn, checkOut, user, { ...options, dateKey })) return "Short Hours";
  return "Present";
}

/**
 * First scan at/after 11:00 AM PKT = check-in.
 * Last scan becomes check-out only after shift end + 30 min.
 * Scans before 11 AM or at/after 5 AM next day are excluded.
 */
export function aggregateDayScans(logs, user, dateKey, now = new Date()) {
  const sorted = [...(logs || [])].sort(
    (a, b) => parseZktTime(a.punch_time_local || a.punch_time) - parseZktTime(b.punch_time_local || b.punch_time)
  );
  const earliestAllowed = getCheckInEarliest(dateKey);
  const checkoutDeadline = getCheckoutDeadline(dateKey);

  const validScans = sorted.filter(scan => {
    const scanTime = parseZktTime(scan.punch_time_local || scan.punch_time);
    if (!scanTime || !earliestAllowed || !checkoutDeadline) return false;
    // Valid attendance window: 11:00 AM dateKey → before 05:00 AM next day
    return scanTime >= earliestAllowed && scanTime < checkoutDeadline;
  });

  if (!validScans.length) {
    return {
      checkIn: null, checkOut: null, lastScan: null,
      checkInMethod: null, checkOutMethod: null, lastScanMethod: null, scanCount: 0,
    };
  }

  // Check-in must be on the attendance calendar day (not a post-midnight checkout-only scan).
  const checkInScan = validScans.find(scan => {
    const t = parseZktTime(scan.punch_time_local || scan.punch_time);
    return t && karachiDateKey(t) === dateKey && t >= earliestAllowed;
  });

  if (!checkInScan) {
    return {
      checkIn: null, checkOut: null, lastScan: null,
      checkInMethod: null, checkOutMethod: null, lastScanMethod: null, scanCount: 0,
    };
  }

  const checkInTime = parseZktTime(checkInScan.punch_time_local || checkInScan.punch_time);
  const checkIn = checkInTime?.toISOString() || null;
  const checkInMethod = methodLabel(checkInScan.verify_method);

  // Scans from check-in through checkout deadline (includes post-midnight checkouts).
  const dayScans = validScans.filter(scan => {
    const t = parseZktTime(scan.punch_time_local || scan.punch_time);
    return t && checkInTime && t >= checkInTime && t < checkoutDeadline;
  });

  const last = dayScans[dayScans.length - 1];
  const lastIso = parseZktTime(last.punch_time_local || last.punch_time)?.toISOString();
  const lastScanMethod = methodLabel(last.verify_method);
  const scanCount = dayScans.length;
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
      checkOut: null, // NEVER set checkout during active shift / pre-finalize window
      lastScan: lastIso,
      checkInMethod,
      checkOutMethod: null,
      lastScanMethod,
      scanCount,
    };
  }

  // Finalized: last scan = checkout (never invent shift-end auto-checkout).
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
  if (!shouldFinalizeAttendance(user, dateKey, now)) {
    return { checkOut: null, checkOutMethod: null, autoCheckout: false, lastScan: agg.lastScan || null };
  }

  const lastScan = agg.lastScan || (agg.checkOut && agg.checkOut !== agg.checkIn ? agg.checkOut : null) || prev.last_scan || null;
  const lastScanMethod = agg.lastScanMethod || agg.checkOutMethod || prev.last_scan_method || null;

  // Extra scan (different from check-in) → checkout = last scan. No auto-checkout.
  if (lastScan && lastScan !== agg.checkIn) {
    return {
      checkOut: lastScan,
      checkOutMethod: lastScanMethod,
      autoCheckout: false,
      lastScan,
    };
  }

  if (agg.checkOut && agg.checkOut !== agg.checkIn) {
    return {
      checkOut: agg.checkOut,
      checkOutMethod: agg.checkOutMethod || lastScanMethod,
      autoCheckout: false,
      lastScan: agg.lastScan || agg.checkOut,
    };
  }

  // Only check-in → Missing Checkout (checkOut stays null). Never set shift-end time.
  return { checkOut: null, checkOutMethod: null, autoCheckout: false, lastScan: null };
}

/**
 * Rebuild daily attendance from attendance_logs for mapped employees.
 * Scans are assigned to shift-aware attendance days (overnight late checkouts
 * stay on the previous day), then first/last aggregation runs per day.
 */
export async function syncAttendanceFromLogs(pool) {
  const { rows: pendingLogs } = await pool.query(
    `SELECT id, employee_id, punch_time,
            TO_CHAR(punch_time, 'YYYY-MM-DD HH24:MI:SS') AS punch_time_local
     FROM attendance_logs
     WHERE synced_to_attendance = false AND is_duplicate = false AND employee_id IS NOT NULL
     ORDER BY punch_time ASC`
  );
  if (!pendingLogs.length) {
    return { logsProcessed: 0, rowsUpdated: await finalizeOpenAttendance(pool) };
  }

  const { rows: users } = await pool.query(`SELECT id, shift FROM users WHERE status = 'active'`);
  const userById = new Map(users.map(u => [u.id, enrichUserShift(u)]));

  // Group pending work by (employee, shift-aware attendance day).
  const workKeys = new Map();
  for (const log of pendingLogs) {
    const user = userById.get(log.employee_id);
    if (!user) continue;
    const scanTime = parseZktTime(log.punch_time_local || log.punch_time);
    if (!scanTime) continue;
    const attDay = getAttendanceDay(scanTime, user);
    if (!attDay) continue; // dead zone — ignore
    workKeys.set(`${log.employee_id}|${attDay}`, { employeeId: log.employee_id, dateKey: attDay });
    // Also reprocess calendar day so wrongly created "next day" check-ins can be cleared.
    const calDay = karachiDateKey(scanTime);
    if (calDay && calDay !== attDay) {
      workKeys.set(`${log.employee_id}|${calDay}`, { employeeId: log.employee_id, dateKey: calDay });
    }
  }

  let rowsUpdated = 0;
  let logsProcessed = 0;

  for (const { employeeId, dateKey } of workKeys.values()) {
    const user = userById.get(employeeId);
    if (!user) continue;

    const dayLogs = await fetchLogsForAttendanceDay(pool, employeeId, user, dateKey);

    const agg = aggregateDayScans(dayLogs, user, dateKey, new Date());
    const now = new Date();
    const timeOptsBase = { dateKey, now, source: "biometric" };

    const existing = await pool.query(
      `SELECT * FROM attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
      [employeeId, dateKey]
    );

    // No valid scans for this attendance day — clear mis-assigned biometric rows.
    if (!agg.checkIn) {
      if (existing.rows.length) {
        const prev = existing.rows[0];
        if (prev.source === "biometric" && !prev.manually_corrected && prev.check_in) {
          const belongDay = getAttendanceDay(new Date(prev.check_in), user);
          if (belongDay && belongDay !== dateKey) {
            await pool.query(`DELETE FROM attendance WHERE id = $1`, [prev.id]);
            rowsUpdated += 1;
          }
        }
      }
      continue;
    }

    function computeRowMetrics(checkIn, checkOut, breaks, shortLeaves, breakStart, breakEnd) {
      const timeOpts = { breaks, shortLeaves, breakStart, breakEnd, ...timeOptsBase };
      const inProgress = isAttendanceInProgress(user, { checkIn, checkOut, source: "biometric" }, dateKey, now);
      const finalized = shouldFinalizeAttendance(user, dateKey, now);
      let workingMs = null;
      if (inProgress && checkIn) {
        workingMs = computeNetWorkingMs(checkIn, now.toISOString(), breaks, shortLeaves, breakStart, breakEnd);
      } else if (checkIn && checkOut) {
        workingMs = computeNetWorkingMs(checkIn, checkOut, breaks, shortLeaves, breakStart, breakEnd);
      } else if (checkIn && !checkOut && finalized) {
        // Missing Checkout — assume worked until shift end
        workingMs = computeMissingCheckoutWorkingMs(checkIn, user, dateKey, breaks, shortLeaves, breakStart, breakEnd);
      }
      const status = computeBiometricDayStatus(user, checkIn, checkOut, {
        ...timeOpts,
        netWorkingMs: workingMs,
      });
      const late = isLateCheckIn(checkIn, user, dateKey);
      const totalBreakMs = computeBreakMs(breaks, breakStart, breakEnd);
      return { workingMs, status, late, totalBreakMs };
    }

    if (existing.rows.length === 0) {
      const finalized = shouldFinalizeAttendance(user, dateKey, now);
      let finalCheckOut = null;
      let outMethod = null;
      let lastScan = agg.lastScan;
      let lastScanMethod = agg.lastScanMethod;

      if (finalized) {
        const resolved = resolveFinalizedCheckout(user, dateKey, agg, {}, now);
        finalCheckOut = agg.checkOut || resolved.checkOut;
        outMethod = agg.checkOutMethod || resolved.checkOutMethod;
        lastScan = resolved.lastScan ?? agg.lastScan;
      } else {
        finalCheckOut = null;
        outMethod = null;
      }

      const { workingMs, status, late } = computeRowMetrics(
        agg.checkIn, finalCheckOut, [], [], null, null
      );

      await pool.query(
        `INSERT INTO attendance (
           id, user_id, date, check_in, check_out, last_scan, breaks, short_leaves,
           auto_checkout, working_ms, total_break_ms, status, late, source,
           check_in_method, check_out_method, last_scan_method
         ) VALUES ($1,$2,$3,$4,$5,$6,'[]','[]',false,$7,0,$8,$9,'biometric',$10,$11,$12)`,
        [
          genAttId(), employeeId, dateKey, agg.checkIn, finalCheckOut, lastScan,
          workingMs, status, late,
          agg.checkInMethod, outMethod,
          lastScanMethod,
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

      if (source === "biometric" || !prev.check_in) {
        newCheckIn = agg.checkIn;
        newLastScan = agg.lastScan;
        newInMethod = agg.checkInMethod;
        newLastScanMethod = agg.lastScanMethod;
        newSource = "biometric";
        if (shouldFinalizeAttendance(user, dateKey, now)) {
          const resolved = resolveFinalizedCheckout(user, dateKey, agg, prev, now);
          newCheckOut = agg.checkOut || resolved.checkOut;
          newOutMethod = agg.checkOut ? agg.checkOutMethod : resolved.checkOutMethod;
          if (resolved.lastScan != null) newLastScan = resolved.lastScan;
        } else {
          // Mid-shift: check_out MUST be NULL; only last_scan is updated.
          newCheckOut = null;
          newOutMethod = null;
          if (agg.lastScan) {
            newLastScan = agg.lastScan;
            newLastScanMethod = agg.lastScanMethod;
          } else if (prev.check_out && prev.check_out !== prev.check_in) {
            newLastScan = prev.last_scan || prev.check_out;
            newLastScanMethod = prev.last_scan_method || prev.check_out_method || null;
          }
        }
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
           last_scan_method = $11, auto_checkout = false
         WHERE id = $12`,
        [
          newCheckIn, newCheckOut, newLastScan, workingMs, totalBreakMs,
          status, late, newSource, newInMethod, newOutMethod, newLastScanMethod,
          prev.id,
        ]
      );
      rowsUpdated += 1;
    }
  }

  // Mark pending logs synced (by id — calendar date is no longer the grouping key).
  const pendingIds = pendingLogs.map(l => l.id).filter(id => id != null);
  if (pendingIds.length) {
    const { rowCount } = await pool.query(
      `UPDATE attendance_logs SET synced_to_attendance = true, updated_at = NOW()
       WHERE id = ANY($1::int[]) AND synced_to_attendance = false`,
      [pendingIds]
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
         OR status = 'Auto Checkout'
         OR status = 'Missing Checkout'
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
    const finalized = shouldFinalizeAttendance(user, dateKey, now);

    // Mid-shift / pre-finalize: clear any premature check_out and force Working.
    if (!finalized && prev.source === "biometric" && !prev.manually_corrected) {
      const lastScan = prev.last_scan
        || (prev.check_out && prev.check_out !== prev.check_in ? prev.check_out : null);
      const lastScanMethod = prev.last_scan_method
        || (prev.check_out && prev.check_out !== prev.check_in ? prev.check_out_method : null);
      const workingMs = computeNetWorkingMs(prev.check_in, now.toISOString(), breaks, shortLeaves, breakStart, breakEnd);
      await pool.query(
        `UPDATE attendance SET
           check_out = NULL,
           check_out_method = NULL,
           auto_checkout = false,
           last_scan = COALESCE($1, last_scan),
           last_scan_method = COALESCE($2, last_scan_method),
           status = 'Working',
           working_ms = $3,
           late = $4
         WHERE id = $5`,
        [
          lastScan, lastScanMethod, workingMs,
          isLateCheckIn(prev.check_in, user, dateKey), prev.id,
        ]
      );
      rowsUpdated += 1;
      continue;
    }

    if (!finalized) continue;

    if (prev.source === "biometric") {
      const dayLogs = await fetchLogsForAttendanceDay(pool, prev.user_id, user, dateKey);
      const agg = aggregateDayScans(dayLogs, user, dateKey, now);
      if (!agg.checkIn) {
        // Mis-assigned next-day row whose only scans belong to the previous shift day.
        if (!prev.manually_corrected && prev.check_in) {
          const belongDay = getAttendanceDay(new Date(prev.check_in), user);
          if (belongDay && belongDay !== dateKey) {
            await pool.query(`DELETE FROM attendance WHERE id = $1`, [prev.id]);
            rowsUpdated += 1;
          }
        }
        continue;
      }
      const resolved = resolveFinalizedCheckout(user, dateKey, agg, prev, now);
      const checkOut = agg.checkOut || resolved.checkOut;
      let workingMs = null;
      if (checkOut) {
        workingMs = computeNetWorkingMs(agg.checkIn, checkOut, breaks, shortLeaves, breakStart, breakEnd);
      } else {
        workingMs = computeMissingCheckoutWorkingMs(agg.checkIn, user, dateKey, breaks, shortLeaves, breakStart, breakEnd);
      }
      const status = computeBiometricDayStatus(user, agg.checkIn, checkOut, {
        breaks, shortLeaves, breakStart, breakEnd, dateKey, now,
        netWorkingMs: workingMs, source: "biometric",
      });
      await pool.query(
        `UPDATE attendance SET
           check_in = $1, check_out = $2, last_scan = $3,
           working_ms = $4, status = $5, late = $6, auto_checkout = false,
           check_in_method = $7, check_out_method = $8, last_scan_method = $9
         WHERE id = $10`,
        [
          agg.checkIn, checkOut, resolved.lastScan ?? agg.lastScan, workingMs, status,
          isLateCheckIn(agg.checkIn, user, dateKey),
          agg.checkInMethod, checkOut ? (agg.checkOutMethod || resolved.checkOutMethod) : null,
          agg.lastScanMethod, prev.id,
        ]
      );
      rowsUpdated += 1;
    } else if (!prev.check_out && shouldFinalizeAttendance(user, dateKey, now)) {
      // Manual/WFH row past finalize with no checkout → Missing Checkout (no invented time).
      const workingMs = computeMissingCheckoutWorkingMs(
        prev.check_in, user, dateKey, breaks, shortLeaves, breakStart, breakEnd
      );
      const status = computeBiometricDayStatus(user, prev.check_in, null, {
        breaks, shortLeaves, breakStart, breakEnd, dateKey, now,
        netWorkingMs: workingMs, source: prev.source || "manual",
      });
      await pool.query(
        `UPDATE attendance SET check_out = NULL, auto_checkout = false, working_ms = $1, status = $2, late = $3
         WHERE id = $4`,
        [workingMs, status, isLateCheckIn(prev.check_in, user, dateKey), prev.id]
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
