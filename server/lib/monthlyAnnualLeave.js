/** Forward-only monthly Annual Leave cap (calendar month). */
export const MONTHLY_ANNUAL_LEAVE_LIMIT = 2;
export const MONTHLY_ANNUAL_LEAVE_FLOOR = "2026-09";

export function isMonthlyAnnualLeaveMonth(monthKey) {
  return !!monthKey && monthKey >= MONTHLY_ANNUAL_LEAVE_FLOOR;
}

function monthBounds(monthKey) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const start = `${m[1]}-${m[2]}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** Weekdays (Mon–Fri) between fromKey and toKey inclusive. */
export function enumerateWeekdays(fromKey, toKey) {
  const from = String(fromKey || "").slice(0, 10);
  const to = String(toKey || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return [];
  }
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const days = [];
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const y = cur.getUTCFullYear();
      const mo = String(cur.getUTCMonth() + 1).padStart(2, "0");
      const d = String(cur.getUTCDate()).padStart(2, "0");
      days.push(`${y}-${mo}-${d}`);
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/**
 * Paid Annual Leave working days already used in a month
 * (approved Annual leave days + late-penalty leave deductions).
 */
export async function getMonthlyAnnualUsage(client, employeeId, monthKey, { excludeLeaveId = null } = {}) {
  if (!employeeId || !isMonthlyAnnualLeaveMonth(monthKey)) {
    return { used: 0, limit: MONTHLY_ANNUAL_LEAVE_LIMIT, remaining: MONTHLY_ANNUAL_LEAVE_LIMIT };
  }
  const bounds = monthBounds(monthKey);
  if (!bounds) {
    return { used: 0, limit: MONTHLY_ANNUAL_LEAVE_LIMIT, remaining: MONTHLY_ANNUAL_LEAVE_LIMIT };
  }

  const params = [employeeId, bounds.start, bounds.end];
  let excludeSql = "";
  if (excludeLeaveId) {
    params.push(excludeLeaveId);
    excludeSql = ` AND id <> $${params.length}`;
  }

  const { rows: leaveRows } = await client.query(
    `SELECT from_date, to_date, paid_days, days
     FROM leave_requests
     WHERE user_id = $1
       AND status = 'approved'
       AND type = 'Annual'
       AND from_date <= $3
       AND to_date >= $2
       ${excludeSql}`,
    params
  );

  let leaveDays = 0;
  for (const row of leaveRows) {
    const overlap = enumerateWeekdays(row.from_date, row.to_date)
      .filter(d => d >= bounds.start && d <= bounds.end);
    const paid = row.paid_days != null ? Number(row.paid_days) : Number(row.days || 0);
    // Cap contribution by paid_days when request spans multiple months
    const allDays = enumerateWeekdays(row.from_date, row.to_date);
    if (allDays.length <= 1 || paid >= allDays.length) {
      leaveDays += overlap.length;
    } else {
      // Distribute paid days chronologically across the request
      let paidLeft = paid;
      for (const d of allDays) {
        if (paidLeft <= 0) break;
        paidLeft -= 1;
        if (d >= bounds.start && d <= bounds.end) leaveDays += 1;
      }
    }
  }

  const { rows: penRows } = await client.query(
    `SELECT leaves_deducted FROM late_penalties
     WHERE employee_id = $1 AND month = $2 LIMIT 1`,
    [employeeId, monthKey]
  );
  const lateLeaves = Number(penRows[0]?.leaves_deducted || 0);

  const used = leaveDays + lateLeaves;
  const remaining = Math.max(0, MONTHLY_ANNUAL_LEAVE_LIMIT - used);
  return { used, limit: MONTHLY_ANNUAL_LEAVE_LIMIT, remaining, leaveDays, lateLeaves };
}

/**
 * Split request weekdays into leave vs over-limit absent by monthly quota.
 * Returns { leaveDates, absentDates, paidDays, warnings[] }.
 */
export async function allocateAnnualLeaveDates(client, employeeId, fromKey, toKey, { excludeLeaveId = null } = {}) {
  const allDays = enumerateWeekdays(fromKey, toKey);
  const leaveDates = [];
  const absentDates = [];
  const warnings = [];
  const remainingByMonth = {};

  for (const dateKey of allDays) {
    const monthKey = dateKey.slice(0, 7);
    if (!isMonthlyAnnualLeaveMonth(monthKey)) {
      leaveDates.push(dateKey);
      continue;
    }
    if (remainingByMonth[monthKey] == null) {
      const usage = await getMonthlyAnnualUsage(client, employeeId, monthKey, { excludeLeaveId });
      remainingByMonth[monthKey] = usage.remaining;
      if (usage.remaining <= 0) {
        warnings.push(
          `Employee has already used ${usage.used}/${usage.limit} monthly Annual Leaves (${monthKey}).`
        );
      }
    }
    if (remainingByMonth[monthKey] > 0) {
      leaveDates.push(dateKey);
      remainingByMonth[monthKey] -= 1;
    } else {
      absentDates.push(dateKey);
    }
  }

  return {
    leaveDates,
    absentDates,
    paidDays: leaveDates.length,
    unpaidOrAbsentDays: absentDates.length,
    warnings,
    monthlyLimitExceeded: absentDates.length > 0,
  };
}
