import { calculateMonthlyTax, parseSalaryAmount } from "./tax.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthToRange(month) {
  const m = String(month || "").trim();
  const mm = /^(\d{4})-(\d{2})$/.exec(m);
  if (!mm) return null;
  const year = Number(mm[1]);
  const monthIndex = Number(mm[2]) - 1;
  const start = `${mm[1]}-${mm[2]}-01`;
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const end = `${mm[1]}-${mm[2]}-${String(last).padStart(2, "0")}`;
  return { start, end, year, monthIndex };
}

function eachDateInRange(fromKey, toKey) {
  const start = new Date(`${fromKey}T12:00:00`);
  const end = new Date(`${toKey}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function isWeekend(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function normalizeHolidayType(type) {
  const t = String(type ?? "public").trim().toLowerCase().replace(/-/g, "_");
  if (t === "optional") return "optional";
  if (t === "wfh_day" || t === "wfh" || t === "wfhday") return "wfh_day";
  return "public";
}

function isPublicHoliday(dateKey, holidays) {
  return (holidays || []).some(h =>
    h && h.date === dateKey && normalizeHolidayType(h.type) === "public"
  );
}

function workingDaysInMonth(month, holidays) {
  const range = monthToRange(month);
  if (!range) return 0;
  return eachDateInRange(range.start, range.end).filter(d =>
    !isWeekend(d) && !isPublicHoliday(d, holidays)
  ).length;
}

function approvedLeaveDates(leaveRows, userId, month, holidays) {
  const range = monthToRange(month);
  if (!range) return { paid: new Set(), unpaid: new Set(), all: new Set() };
  const rangeDays = new Set(eachDateInRange(range.start, range.end));
  const paid = new Set();
  const unpaid = new Set();
  for (const r of leaveRows || []) {
    if (!r || r.user_id !== userId || r.status !== "approved" || r.type === "WFH") continue;
    const from = String(r.from_date || "").slice(0, 10);
    const to = String(r.to_date || r.from_date || "").slice(0, 10);
    if (!from || !to) continue;
    const isUnpaid = r.type === "Unpaid" || r.pay_tag === "Unpaid";
    for (const d of eachDateInRange(from, to)) {
      if (!rangeDays.has(d)) continue;
      if (isWeekend(d) || isPublicHoliday(d, holidays)) continue;
      if (isUnpaid) unpaid.add(d);
      else paid.add(d);
    }
  }
  const all = new Set([...paid, ...unpaid]);
  return { paid, unpaid, all };
}

/**
 * Build a full payslip object for one employee/month from DB rows.
 */
export function buildPayslip({
  user,
  month,
  attendanceRows = [],
  leaveRows = [],
  holidays = [],
  latePenalty = null,
  generatedBy = "",
}) {
  const totalSalary = parseSalaryAmount(user.salary);
  const fuelAllowance = Math.max(0, Number(user.fuel_allowance ?? user.fuelAllowance) || 0);
  const mobilePackage = Math.max(0, Number(user.mobile_package ?? user.mobilePackage) || 0);
  const basicSalary = Math.max(0, totalSalary - fuelAllowance - mobilePackage);
  const grossSalary = totalSalary;

  const workDays = workingDaysInMonth(month, holidays);
  const range = monthToRange(month);
  const leaveDates = approvedLeaveDates(leaveRows, user.id, month, holidays);

  const attInMonth = (attendanceRows || []).filter(r =>
    r && r.user_id === user.id && r.date && String(r.date).startsWith(month)
  );

  const presentDates = new Set(
    attInMonth
      .filter(r => r.check_in && !isWeekend(r.date) && !isPublicHoliday(r.date, holidays))
      .map(r => r.date)
  );
  const presentDays = presentDates.size;
  const lateDays = attInMonth.filter(r => r.late && presentDates.has(r.date)).length;

  const paidLeaveDays = leaveDates.paid.size;
  const unpaidLeaveDays = leaveDates.unpaid.size;
  // Scheduled work days without present and without approved leave → absent
  const scheduled = range
    ? eachDateInRange(range.start, range.end).filter(d => !isWeekend(d) && !isPublicHoliday(d, holidays))
    : [];
  const absentDays = scheduled.filter(d => !presentDates.has(d) && !leaveDates.all.has(d)).length;
  const payableDays = presentDays + paidLeaveDays;

  const perDay = workDays > 0 ? grossSalary / workDays : 0;
  const absentDeduction = Math.round(perDay * absentDays);
  const salaryDeductionDays = Number(latePenalty?.salary_deductions ?? latePenalty?.salaryDeductions ?? 0) || 0;
  const latePenaltyDeduction = Math.round(perDay * salaryDeductionDays);
  const incomeTax = calculateMonthlyTax(grossSalary);
  const totalDeductions = Math.round(absentDeduction + latePenaltyDeduction + incomeTax);
  const net = Math.round(grossSalary - totalDeductions);

  const mm = monthToRange(month);
  const monthLabel = mm ? `${MONTH_NAMES[mm.monthIndex]} ${mm.year}` : month;

  return {
    id: `slip-${user.id}-${month}`,
    userId: user.id,
    empName: user.name,
    empEmail: user.email,
    empTitle: user.title || user.designation || user.role,
    empId: user.id,
    month,
    monthLabel,
    workDays,
    presentDays,
    absentDays,
    lateDays,
    paidLeaveDays,
    unpaidLeaveDays,
    leaveDays: paidLeaveDays + unpaidLeaveDays,
    payableDays,
    // Earnings
    totalSalary,
    basicSalary,
    basic: basicSalary, // legacy alias
    fuelAllowance,
    mobilePackage,
    allowance: fuelAllowance + mobilePackage, // legacy
    bonus: 0,
    grossSalary,
    gross: grossSalary,
    // Deductions
    absentDeduction,
    unpaidLeaveDeduction: 0,
    latePenaltyDays: salaryDeductionDays,
    latePenaltyDeduction,
    incomeTax,
    otherDeduction: 0,
    totalDeductions,
    deduction: totalDeductions, // legacy
    net,
    perDaySalary: Math.round(perDay * 100) / 100,
    bank: {
      bankName: user.bank_name || user.bankName || "",
      accountNo: user.bank_account || user.bankAccount || "",
      accountTitle: user.account_title || user.accountTitle || "",
      iban: user.bank_iban || user.bankIban || "",
      branch: user.bank_branch || user.bankBranch || "",
    },
    generatedBy,
    generatedOn: new Date().toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" }),
    status: "generated",
    note: "",
  };
}

export { monthToRange, workingDaysInMonth, MONTH_NAMES };
