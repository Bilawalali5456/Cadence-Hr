/**
 * Sync attendance_logs → main HRMS attendance table.
 */

export function dateKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function genAttId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getUserShift(user) {
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
  d.setHours(h, m, 0, 0);
  return d;
}

function isWeekendDateKey(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.getDay() === 0 || d.getDay() === 6;
}

function isLateCheckIn(checkInIso, user) {
  if (!checkInIso || !user) return false;
  const d = new Date(checkInIso);
  const dateKey = dateKeyFromDate(d);
  if (isWeekendDateKey(dateKey)) return false;
  const shift = getUserShift(user);
  const start = shiftDateTime(dateKey, shift.shiftStart);
  const lateCutoff = new Date(start.getTime() + shift.graceMinutes * 60000);
  return d > lateCutoff;
}

function computeWorkingMs(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const ms = new Date(checkOut) - new Date(checkIn);
  return ms > 0 ? ms : null;
}

function computeDayStatus(user, checkIn, checkOut) {
  if (!checkIn) return "Absent";
  const dateKey = dateKeyFromDate(new Date(checkIn));
  const late = isLateCheckIn(checkIn, user);
  if (!checkOut) return late ? "Late" : "On Time";
  const net = computeWorkingMs(checkIn, checkOut) || 0;
  const shift = getUserShift(user);
  const start = shiftDateTime(dateKey, shift.shiftStart);
  let end = shiftDateTime(dateKey, shift.shiftEnd);
  if (end <= start) end = new Date(end.getTime() + 86400000);
  const expectedNet = Math.max(0, end - start - shift.breakMinutes * 60000);
  if (expectedNet > 0 && net < expectedNet * 0.5) return "Half Day";
  if (late) return "Late";
  return "On Time";
}

/**
 * Build daily attendance from attendance_logs for mapped employees.
 * Uses explicit check_in/check_out punch types; falls back to first/last scan.
 */
export async function syncAttendanceFromLogs(pool) {
  const { rows: pending } = await pool.query(
    `SELECT * FROM attendance_logs
     WHERE synced_to_attendance = false AND is_duplicate = false AND employee_id IS NOT NULL
     ORDER BY punch_time ASC`
  );
  if (!pending.length) return { logsProcessed: 0, rowsUpdated: 0 };

  const { rows: users } = await pool.query(`SELECT id, shift FROM users WHERE status = 'active'`);
  const userById = new Map(users.map(u => [u.id, u]));

  const groups = new Map();
  for (const log of pending) {
    const punchTime = new Date(log.punch_time);
    const dateKey = dateKeyFromDate(punchTime);
    const key = `${log.employee_id}|${dateKey}`;
    if (!groups.has(key)) {
      groups.set(key, { employeeId: log.employee_id, dateKey, logs: [] });
    }
    groups.get(key).logs.push(log);
  }

  let rowsUpdated = 0;
  const syncedIds = [];

  for (const [, group] of groups) {
    const user = userById.get(group.employeeId);
    if (!user) continue;

    const checkIns = group.logs.filter(l => l.punch_type === "check_in");
    const checkOuts = group.logs.filter(l => l.punch_type === "check_out");
    const sorted = [...group.logs].sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));

    let checkIn = checkIns.length
      ? new Date(Math.min(...checkIns.map(l => new Date(l.punch_time).getTime()))).toISOString()
      : sorted[0] ? new Date(sorted[0].punch_time).toISOString() : null;

    let checkOut = checkOuts.length
      ? new Date(Math.max(...checkOuts.map(l => new Date(l.punch_time).getTime()))).toISOString()
      : sorted.length > 1 ? new Date(sorted[sorted.length - 1].punch_time).toISOString() : null;

    if (!checkIn) continue;

    const late = isLateCheckIn(checkIn, user);
    const status = computeDayStatus(user, checkIn, checkOut);
    const workingMs = checkOut ? computeWorkingMs(checkIn, checkOut) : null;

    const existing = await pool.query(
      `SELECT * FROM attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
      [group.employeeId, group.dateKey]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO attendance (
           id, user_id, date, check_in, check_out, breaks, short_leaves,
           auto_checkout, working_ms, total_break_ms, status, late, source
         ) VALUES ($1,$2,$3,$4,$5,'[]','[]',false,$6,0,$7,$8,'biometric')`,
        [genAttId(), group.employeeId, group.dateKey, checkIn, checkOut, workingMs, status, late]
      );
      rowsUpdated += 1;
    } else {
      const row = existing.rows[0];
      const source = row.source || "manual";
      let newCheckIn = row.check_in;
      let newCheckOut = row.check_out;

      if (source === "biometric") {
        newCheckIn = checkIn;
        newCheckOut = checkOut;
      } else {
        if (!newCheckIn) newCheckIn = checkIn;
        if (!newCheckOut && checkOut) newCheckOut = checkOut;
        else if (checkOut && new Date(checkOut) > new Date(newCheckOut || 0)) newCheckOut = checkOut;
      }

      const finalLate = isLateCheckIn(newCheckIn, user);
      const finalStatus = computeDayStatus(user, newCheckIn, newCheckOut);
      const finalWorkingMs = newCheckOut ? computeWorkingMs(newCheckIn, newCheckOut) : null;
      const newSource = source === "manual" ? "manual" : "biometric";

      await pool.query(
        `UPDATE attendance SET
           check_in = $1, check_out = $2, working_ms = $3, status = $4, late = $5, source = $6
         WHERE id = $7`,
        [newCheckIn, newCheckOut, finalWorkingMs, finalStatus, finalLate, newSource, row.id]
      );
      rowsUpdated += 1;
    }

    for (const l of group.logs) syncedIds.push(l.id);
  }

  if (syncedIds.length) {
    await pool.query(
      `UPDATE attendance_logs SET synced_to_attendance = true, updated_at = NOW() WHERE id = ANY($1::int[])`,
      [syncedIds]
    );
  }

  return { logsProcessed: syncedIds.length, rowsUpdated };
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
