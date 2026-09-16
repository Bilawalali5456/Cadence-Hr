import * as XLSX from "xlsx";
import {
  computeMonthlyAttendanceSummary,
  formatShiftRange,
  formatTime,
  formatDurationMs,
  displayWorkingHours,
  displayBreakTime,
  monthLabel,
  monthDateRange,
  todayKey,
  isManagerDesignation,
  scheduledWorkDatesForUser,
  resolveDayStatus,
  dayStatusPill,
  isLateCheckIn,
  isWfhAttendance,
  calcNetWorkingMs,
  calcTotalBreakMs,
} from "../utils.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hoursFromMs(ms) {
  const n = Number(ms || 0);
  if (!n) return 0;
  return Math.round((n / 3600000) * 100) / 100;
}

function shortLeaveCountForUser(shortLeaveRequests, userId, month) {
  return (shortLeaveRequests || []).filter(r =>
    r
    && r.userId === userId
    && r.status === "approved"
    && String(r.date || "").startsWith(month)
  ).length;
}

function roleLabel(user) {
  if (isManagerDesignation(user)) return "Manager";
  return user?.role || "Employee";
}

function dayOfWeekLabel(dateKey) {
  const d = new Date(`${String(dateKey).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return DAY_NAMES[d.getDay()] || "";
}

/** Format "14:05" or ISO → "2:05 PM" (Asia/Karachi for ISO). */
function formatClock(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{1,2}:\d{2}/.test(s) && !s.includes("T")) {
    const [hh, mm] = s.split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return s;
    const d = new Date(2000, 0, 1, hh, mm, 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  return formatTime(s);
}

function isApprovedLeaveOnDate(userId, dateKey, leaveRequests) {
  const key = String(dateKey).slice(0, 10);
  for (const r of leaveRequests || []) {
    if (!r || r.userId !== userId || r.status !== "approved") continue;
    if (r.type === "WFH") continue;
    const from = String(r.from || r.from_date || "").slice(0, 10);
    const to = String(r.to || r.to_date || from).slice(0, 10);
    if (from && to && key >= from && key <= to) return true;
  }
  return false;
}

function employeeMonthRange(user, month) {
  const { start, end } = monthDateRange(month);
  const today = todayKey();
  let rangeStart = start;
  let rangeEnd = end;
  if (user?.hired) {
    if (user.hired > end) return null;
    if (user.hired > rangeStart) rangeStart = user.hired;
  }
  if (rangeEnd > today) rangeEnd = today;
  if (rangeStart > rangeEnd) return null;
  return { rangeStart, rangeEnd };
}

function formatShortLeaveCell(record, shortLeaveRequests, userId, dateKey) {
  const fromRecord = (record?.shortLeaves || []).filter(sl => !sl?.status || sl.status === "approved");
  const fromReqs = (shortLeaveRequests || []).filter(r =>
    r
    && r.userId === userId
    && String(r.date || "").slice(0, 10) === dateKey
    && r.status === "approved"
  );

  const ranges = [];
  for (const sl of fromRecord) {
    const from = formatClock(sl.from || sl.fromTime || sl.start || sl.startIso);
    const to = formatClock(sl.to || sl.toTime || sl.end || sl.endIso);
    if (from || to) ranges.push(`${from || "?"} – ${to || "?"}`);
  }
  for (const r of fromReqs) {
    const from = formatClock(r.fromTime || r.from || "");
    const to = formatClock(r.toTime || r.to || "");
    const label = from || to ? `${from || "?"} – ${to || "?"}` : "";
    if (label && !ranges.includes(label)) ranges.push(label);
  }

  if (!ranges.length && !fromRecord.length && !fromReqs.length) return "No";
  if (!ranges.length) return "Yes";
  return `Yes (${ranges.join("; ")})`;
}

function exportDayStatus(user, record, dateKey, leaveRequests, holidays) {
  if (isApprovedLeaveOnDate(user.id, dateKey, leaveRequests) && !record?.checkIn) {
    return "On Leave";
  }
  const now = new Date(`${dateKey}T23:59:59`);
  let status = resolveDayStatus(user, record, dateKey, holidays, now);
  const pill = dayStatusPill(status, record);
  let label = pill?.label || status || "—";

  if (
    record
    && isWfhAttendance(record, user.id, dateKey, leaveRequests, holidays, user)
    && label !== "On Leave"
    && label !== "Absent"
    && label !== "Off"
    && label !== "Public Holiday"
  ) {
    label = "WFH";
  }
  return label;
}

function workingHoursCell(record, user, dateKey) {
  if (!record?.checkIn) return "—";
  const now = new Date(`${dateKey}T23:59:59`);
  const display = displayWorkingHours(record, user, now);
  if (display && display !== "—") return display;
  if (record.workingMs != null) return formatDurationMs(record.workingMs);
  if (record.checkOut) return formatDurationMs(calcNetWorkingMs(record));
  return "—";
}

function breakTimeCell(record, dateKey) {
  if (!record?.checkIn) return "—";
  const now = new Date(`${dateKey}T23:59:59`);
  const display = displayBreakTime(record, now);
  if (display && display !== "—") return display;
  return formatDurationMs(calcTotalBreakMs(record, now));
}

/**
 * Build and download monthly attendance Excel for HR/Executive.
 * Sheet 1 "Daily": one row per employee per working day.
 * Sheet 2 "Summary": monthly totals per employee.
 */
export function downloadMonthlyAttendanceSheet({
  month,
  users = [],
  attendance = [],
  leaveRequests = [],
  shortLeaveRequests = [],
  holidays = [],
  latePenalties = [],
}) {
  const penaltyMap = {};
  for (const p of latePenalties || []) {
    if (p?.employeeId) penaltyMap[p.employeeId] = p;
  }

  const attByUserDate = new Map();
  for (const r of attendance || []) {
    if (!r?.userId || !r?.date) continue;
    attByUserDate.set(`${r.userId}|${String(r.date).slice(0, 10)}`, r);
  }

  const activeUsers = (users || [])
    .filter(u => u && u.status === "active")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const dailyRows = [];
  for (const user of activeUsers) {
    const range = employeeMonthRange(user, month);
    if (!range) continue;
    const workDays = scheduledWorkDatesForUser(user, range.rangeStart, range.rangeEnd, holidays);
    for (const dateKey of workDays) {
      const record = attByUserDate.get(`${user.id}|${dateKey}`) || null;
      const late = !!(record?.checkIn && (
        record.late === true || isLateCheckIn(record.checkIn, user, holidays)
      ));
      dailyRows.push({
        "Employee Name": user.name || "",
        Role: roleLabel(user),
        Date: dateKey,
        Day: dayOfWeekLabel(dateKey),
        Shift: formatShiftRange(user, dateKey),
        "Check-in Time": record?.checkIn ? formatTime(record.checkIn) : "—",
        "Check-out Time": record?.checkOut ? formatTime(record.checkOut) : "—",
        "Working Hours": workingHoursCell(record, user, dateKey),
        "Break Time": breakTimeCell(record, dateKey),
        Status: exportDayStatus(user, record, dateKey, leaveRequests, holidays),
        Late: late ? "Yes" : "No",
        "Short Leave": formatShortLeaveCell(record, shortLeaveRequests, user.id, dateKey),
      });
    }
  }

  const summaryRows = activeUsers
    .map(user => {
      const summary = computeMonthlyAttendanceSummary(user, attendance, leaveRequests, month, holidays);
      const penalty = penaltyMap[user.id];
      return {
        "Employee Name": user.name || "",
        Role: roleLabel(user),
        Shift: formatShiftRange(user),
        "Total Working Days": summary.totalWorkingDays ?? 0,
        "Present Days": summary.totalPresentDays ?? 0,
        "Absent Days": summary.totalAbsentDays ?? 0,
        "Late Days": summary.totalLateDays ?? 0,
        "On Leave Days": summary.approvedLeaveDays ?? 0,
        "WFH Days": summary.wfhDays ?? 0,
        "Short Leave Count": shortLeaveCountForUser(shortLeaveRequests, user.id, month),
        "Total Working Hours": hoursFromMs(summary.totalWorkingMs),
        "Total Break Hours": hoursFromMs(summary.totalBreakMs),
        "Payable Days": summary.payableDays ?? 0,
        "Late Penalty (leaves deducted)": Number(penalty?.leavesDeducted || 0),
        "Late Penalty (salary deductions)": Number(penalty?.salaryDeductions || 0),
      };
    })
    .sort((a, b) => String(a["Employee Name"]).localeCompare(String(b["Employee Name"])));

  const dailySheet = XLSX.utils.json_to_sheet(dailyRows);
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, dailySheet, "Daily");
  XLSX.utils.book_append_sheet(book, summarySheet, "Summary");

  const label = monthLabel(month).replace(/\s+/g, "_");
  XLSX.writeFile(book, `Attendance_${label}.xlsx`);
}
