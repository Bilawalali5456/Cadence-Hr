import * as XLSX from "xlsx";
import {
  computeMonthlyAttendanceSummary,
  formatShiftRange,
  monthLabel,
  isManagerDesignation,
} from "../utils.js";

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

/**
 * Build and download monthly attendance Excel for HR/Executive.
 * Uses the same monthly summary calculations as the Attendance page.
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

  const rows = (users || [])
    .filter(u => u && u.status === "active")
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

  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Attendance");

  const label = monthLabel(month).replace(/\s+/g, "_");
  const filename = `Attendance_${label}.xlsx`;
  XLSX.writeFile(book, filename);
}
