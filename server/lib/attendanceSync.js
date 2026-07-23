/**
 * Biometric attendance calculation:
 * - First scan of day = Check-in
 * - Last scan of day  = Check-out (if more than one scan)
 * - Middle scans ignored for attendance
 * - Single scan = Check-in only (Check-out Missing)
 * - Working hours = Check-out − Check-in
 * - Status vs users.shift: Present / Late / Early Leave / Short Hours / Absent
 */

export function dateKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function genAttId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getUserShift(user) {
  const s = (user?.shift && typeof user.shift === "object") ? user.shift : {};
  return {
    shiftStart: s.shiftStart || "09:00",
    shiftEnd: s.shiftEnd || "18:00",
    graceMinutes: s.graceMinutes ?? 15,
    breakMinutes: s.breakMinutes ?? 60,
    checkoutGraceMinutes: s.checkoutGraceMinutes ?? 10,
  };
}

function shiftDateTime(dateKey, hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const d = new Date(`${dateKey}T00:00:00`);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function isWeekendDateKey(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.getDay() === 0 || d.getDay() === 6;
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

/** Required duty ms = shift window minus unpaid break. */
export function requiredDutyMs(user, dateKey) {
  const shift = getUserShift(user);
  const start = shiftDateTime(dateKey, shift.shiftStart);
  let end = shiftDateTime(dateKey, shift.shiftEnd);
  if (end <= start) end = new Date(end.getTime() + 86400000);
  return Math.max(0, end - start - shift.breakMinutes * 60000);
}

export function isLateCheckIn(checkInIso, user) {
  if (!checkInIso || !user) return false;
  const d = new Date(checkInIso);
  const dateKey = dateKeyFromDate(d);
  if (isWeekendDateKey(dateKey)) return false;
  const shift = getUserShift(user);
  const start = shiftDateTime(dateKey, shift.shiftStart);
  // Late after shift start + grace (grace is part of assigned duty schedule)
  const lateCutoff = new Date(start.getTime() + shift.graceMinutes * 60000);
  return d > lateCutoff;
}

export function isEarlyLeave(checkOutIso, user) {
  if (!checkOutIso || !user) return false;
  const d = new Date(checkOutIso);
  const dateKey = dateKeyFromDate(d);
  if (isWeekendDateKey(dateKey)) return false;
  const shift = getUserShift(user);
  const end = shiftDateTime(dateKey, shift.shiftEnd);
  return d < end;
}

export function isShortHours(checkIn, checkOut, user) {
  if (!checkIn || !checkOut || !user) return false;
  const dateKey = dateKeyFromDate(new Date(checkIn));
  if (isWeekendDateKey(dateKey)) return false;
  const worked = computeWorkingMs(checkIn, checkOut);
  if (worked == null) return false;
  const required = requiredDutyMs(user, dateKey);
  return required > 0 && worked < required;
}

/**
 * Status priority: Absent → Late → Early Leave → Short Hours → Present
 * Check-in only (no check-out): Late or Present (checkout shown as Missing in UI)
 */
export function computeBiometricDayStatus(user, checkIn, checkOut) {
  if (!checkIn) return "Absent";
  const late = isLateCheckIn(checkIn, user);
  if (!checkOut) return late ? "Late" : "Present";
  if (late) return "Late";
  if (isEarlyLeave(checkOut, user)) return "Early Leave";
  if (isShortHours(checkIn, checkOut, user)) return "Short Hours";
  return "Present";
}

/**
 * First scan = check-in, last scan = check-out (if ≥2). Middle scans ignored.
 */
export function aggregateDayScans(logs) {
  const sorted = [...(logs || [])].sort(
    (a, b) => new Date(a.punch_time) - new Date(b.punch_time)
  );
  if (!sorted.length) {
    return { checkIn: null, checkOut: null, checkInMethod: null, checkOutMethod: null, scanCount: 0 };
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const checkIn = new Date(first.punch_time).toISOString();
  const checkInMethod = methodLabel(first.verify_method);
  if (sorted.length === 1) {
    return { checkIn, checkOut: null, checkInMethod, checkOutMethod: null, scanCount: 1 };
  }
  return {
    checkIn,
    checkOut: new Date(last.punch_time).toISOString(),
    checkInMethod,
    checkOutMethod: methodLabel(last.verify_method),
    scanCount: sorted.length,
  };
}

/**
 * Rebuild daily attendance from attendance_logs for mapped employees.
 * When new scans arrive for a day, reloads ALL that day's logs so first/last stay correct.
 */
export async function syncAttendanceFromLogs(pool) {
  const { rows: pending } = await pool.query(
    `SELECT DISTINCT employee_id, punch_time::date AS day
     FROM attendance_logs
     WHERE synced_to_attendance = false AND is_duplicate = false AND employee_id IS NOT NULL`
  );
  if (!pending.length) return { logsProcessed: 0, rowsUpdated: 0 };

  const { rows: users } = await pool.query(`SELECT id, shift FROM users WHERE status = 'active'`);
  const userById = new Map(users.map(u => [u.id, u]));

  let rowsUpdated = 0;
  let logsProcessed = 0;

  for (const row of pending) {
    const employeeId = row.employee_id;
    const dateKey = dateKeyFromDate(new Date(row.day));
    const user = userById.get(employeeId);
    if (!user) continue;

    const { rows: dayLogs } = await pool.query(
      `SELECT * FROM attendance_logs
       WHERE employee_id = $1
         AND is_duplicate = false
         AND punch_time::date = $2::date
       ORDER BY punch_time ASC`,
      [employeeId, dateKey]
    );
    if (!dayLogs.length) continue;

    const agg = aggregateDayScans(dayLogs);
    if (!agg.checkIn) continue;

    const late = isLateCheckIn(agg.checkIn, user);
    const status = computeBiometricDayStatus(user, agg.checkIn, agg.checkOut);
    const workingMs = computeWorkingMs(agg.checkIn, agg.checkOut);

    const existing = await pool.query(
      `SELECT * FROM attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
      [employeeId, dateKey]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO attendance (
           id, user_id, date, check_in, check_out, breaks, short_leaves,
           auto_checkout, working_ms, total_break_ms, status, late, source,
           check_in_method, check_out_method
         ) VALUES ($1,$2,$3,$4,$5,'[]','[]',false,$6,0,$7,$8,'biometric',$9,$10)`,
        [
          genAttId(), employeeId, dateKey, agg.checkIn, agg.checkOut,
          workingMs, status, late, agg.checkInMethod, agg.checkOutMethod,
        ]
      );
      rowsUpdated += 1;
    } else {
      const prev = existing.rows[0];
      const source = prev.source || "manual";

      let newCheckIn = prev.check_in;
      let newCheckOut = prev.check_out;
      let newInMethod = prev.check_in_method || null;
      let newOutMethod = prev.check_out_method || null;
      let newSource = source;

      if (source === "biometric" || !prev.check_in) {
        // Biometric (or empty) row: full first/last rebuild from device scans
        newCheckIn = agg.checkIn;
        newCheckOut = agg.checkOut;
        newInMethod = agg.checkInMethod;
        newOutMethod = agg.checkOutMethod;
        newSource = "biometric";
      } else {
        // Manual portal row: fill gaps / extend check-out only
        if (!newCheckIn) {
          newCheckIn = agg.checkIn;
          newInMethod = agg.checkInMethod;
        }
        if (!newCheckOut && agg.checkOut) {
          newCheckOut = agg.checkOut;
          newOutMethod = agg.checkOutMethod;
        } else if (agg.checkOut && new Date(agg.checkOut) > new Date(newCheckOut || 0)) {
          newCheckOut = agg.checkOut;
          newOutMethod = agg.checkOutMethod;
        }
        newSource = "manual";
      }

      const finalLate = isLateCheckIn(newCheckIn, user);
      const finalStatus = computeBiometricDayStatus(user, newCheckIn, newCheckOut);
      const finalWorkingMs = computeWorkingMs(newCheckIn, newCheckOut);

      await pool.query(
        `UPDATE attendance SET
           check_in = $1, check_out = $2, working_ms = $3, status = $4, late = $5,
           source = $6, check_in_method = $7, check_out_method = $8
         WHERE id = $9`,
        [
          newCheckIn, newCheckOut, finalWorkingMs, finalStatus, finalLate,
          newSource, newInMethod, newOutMethod, prev.id,
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

  return { logsProcessed, rowsUpdated };
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
