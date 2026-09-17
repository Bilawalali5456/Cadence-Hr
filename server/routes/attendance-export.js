import ExcelJS from "exceljs";
import { karachiTimestampText, karachiDateKey } from "../lib/admsHelpers.js";
import { parseShiftHistory } from "../lib/shiftHistory.js";

const SHIFT_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DEFAULT_WEEKLY_SCHEDULE = {
  monday:    { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  tuesday:   { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  wednesday: { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  thursday:  { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  friday:    { off: false, shiftStart: "14:00", shiftEnd: "18:00" },
  saturday:  { off: true,  shiftStart: "09:00", shiftEnd: "14:00" },
  sunday:    { off: true,  shiftStart: "09:00", shiftEnd: "18:00" },
};

const DEFAULT_SHIFT = {
  shiftStart: "09:00",
  shiftEnd: "18:00",
  graceMinutes: 15,
  breakMinutes: 60,
  checkoutGraceMinutes: 20,
  weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
};

const COLORS = {
  headerBg: "1E293B",
  headerFg: "FFFFFF",
  summaryBg: "F1F5F9",
  present: "15803D",
  absent: "DC2626",
  late: "EA580C",
  off: "64748B",
  leave: "2563EB",
  wfh: "0369A1",
  mc: "D97706",
  el: "DC2626",
  sl: "7C3AED",
  ph: "2563EB",
};

function parseJson(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function parseJsonArray(value) {
  const v = parseJson(value, []);
  return Array.isArray(v) ? v : [];
}

function monthToRange(month) {
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
  return { start: toYMD(start), end: toYMD(end), year, monthIndex };
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

function isWeekendDate(dateKey) {
  const d = new Date(`${String(dateKey).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function dayOfWeekShort(dateKey) {
  const d = new Date(`${String(dateKey).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return DAY_SHORT[d.getDay()] || "";
}

function dateHeaderLabel(dateKey) {
  const d = new Date(`${String(dateKey).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  const mon = MONTH_NAMES[d.getMonth()]?.slice(0, 3) || "";
  return `${mon} ${d.getDate()} (${dayOfWeekShort(dateKey)})`;
}

function normalizeHolidayType(type) {
  const t = String(type ?? "public").trim().toLowerCase().replace(/-/g, "_");
  if (t === "optional") return "optional";
  if (t === "wfh_day" || t === "wfh" || t === "wfhday") return "wfh_day";
  return "public";
}

function getHolidayOnDate(dateKey, holidays) {
  const key = String(dateKey || "").slice(0, 10);
  return (holidays || []).find(h => h && h.date === key) || null;
}

function isPublicHoliday(dateKey, holidays) {
  const h = getHolidayOnDate(dateKey, holidays);
  return !!(h && normalizeHolidayType(h.type) === "public");
}

function isCompanyWfhDay(dateKey, holidays) {
  const h = getHolidayOnDate(dateKey, holidays);
  return !!(h && normalizeHolidayType(h.type) === "wfh_day");
}

function isNonWorkingDay(dateKey, holidays) {
  return isWeekendDate(dateKey) || isPublicHoliday(dateKey, holidays);
}

function enumerateWorkingDays(fromKey, toKey, holidays) {
  return eachDateInRange(fromKey, toKey).filter(d => !isNonWorkingDay(d, holidays));
}

function parseShiftObject(shift) {
  if (shift && typeof shift === "object") return shift;
  if (typeof shift === "string") {
    try {
      const parsed = JSON.parse(shift);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function resolveShiftSource(user) {
  const parsed = parseShiftObject(user?.shift);
  if (parsed && (parsed.weeklySchedule || parsed.shiftStart)) return parsed;
  return {};
}

function historyEntryCoversDate(entry, dateKey) {
  const from = String(entry?.from ?? entry?.from_date ?? "").slice(0, 10);
  if (!from || from > dateKey) return false;
  const toRaw = entry?.to ?? entry?.to_date;
  if (toRaw == null || toRaw === "") return true;
  return String(toRaw).slice(0, 10) >= dateKey;
}

function getShiftForDate(user, dateKey, today) {
  const current = resolveShiftSource(user);
  const key = String(dateKey || "").slice(0, 10);
  if (!key) return current;
  if (key >= today) return current;

  const history = Array.isArray(user?.shiftHistory)
    ? user.shiftHistory
    : parseShiftHistory(user?.shiftHistory ?? user?.shift_history);
  let matched = null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (historyEntryCoversDate(history[i], key)) {
      matched = history[i];
      break;
    }
  }
  const historicalShift = matched ? parseShiftObject(matched.shift) : null;
  return historicalShift || current;
}

function normalizeWeeklySchedule(shift = {}) {
  const base = shift?.weeklySchedule && typeof shift.weeklySchedule === "object"
    ? shift.weeklySchedule
    : null;
  const fallbackStart = shift.shiftStart || DEFAULT_SHIFT.shiftStart;
  const fallbackEnd = shift.shiftEnd || DEFAULT_SHIFT.shiftEnd;
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

function shiftDayKey(dateKey) {
  const d = new Date(`${String(dateKey).slice(0, 10)}T12:00:00`);
  return SHIFT_DAYS[(d.getDay() + 6) % 7];
}

function isShiftOffDay(user, dateKey, today) {
  if (isWeekendDate(dateKey)) return true;
  const shift = getShiftForDate(user, dateKey, today);
  const weekly = normalizeWeeklySchedule(shift);
  const day = shiftDayKey(dateKey);
  return !!(weekly[day]?.off);
}

function karachiDateToIso(dateKey, hhmm) {
  if (!dateKey || !hhmm) return null;
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const [hour, minute] = String(hhmm).split(":").map(Number);
  if ([year, month, day, hour, minute].some(Number.isNaN)) return null;
  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute, 0, 0)).toISOString();
}

function isLateCheckIn(checkIn, user, dateKey, holidays, today) {
  if (!checkIn || !user) return false;
  if (isPublicHoliday(dateKey, holidays)) return false;
  if (isShiftOffDay(user, dateKey, today)) return false;
  const shift = getShiftForDate(user, dateKey, today);
  const weekly = normalizeWeeklySchedule(shift);
  const day = weekly[shiftDayKey(dateKey)] || {};
  const start = day.shiftStart || shift.shiftStart || DEFAULT_SHIFT.shiftStart;
  const grace = Number(shift.graceMinutes ?? DEFAULT_SHIFT.graceMinutes) || 0;
  const startIso = karachiDateToIso(dateKey, start);
  if (!startIso) return false;
  const lateCutoff = new Date(new Date(startIso).getTime() + grace * 60000);
  return new Date(checkIn) > lateCutoff;
}

/** Compact 12h PKT: "5:07p" / "2:00a" */
function formatPktCompact(value) {
  if (!value) return "";
  const text = karachiTimestampText(value);
  if (!text || text.length < 16) return "";
  let h = Number(text.slice(11, 13));
  const mins = text.slice(14, 16);
  if (!Number.isFinite(h)) return "";
  const ap = h >= 12 ? "p" : "a";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mins}${ap}`;
}

function timePair(record) {
  const inn = formatPktCompact(record?.checkIn);
  if (!inn) return "";
  if (!record?.checkOut) return `${inn}-?`;
  const out = formatPktCompact(record.checkOut);
  return out ? `${inn}-${out}` : `${inn}-?`;
}

function userHasOwnAttendance(role) {
  return role === "Employee" || role === "Manager" || role === "HR Employee";
}

function approvedLeaveDates(leaveRows, userId, fromKey, toKey, holidays, user, today) {
  const range = new Set(eachDateInRange(fromKey, toKey));
  const scheduled = new Set(
    eachDateInRange(fromKey, toKey).filter(d =>
      !isWeekendDate(d) &&
      !isPublicHoliday(d, holidays) &&
      !isShiftOffDay(user, d, today)
    )
  );
  const days = new Set();
  for (const r of leaveRows) {
    if (!r || r.user_id !== userId || r.status !== "approved" || r.type === "WFH") continue;
    const from = String(r.from_date || "").slice(0, 10);
    const to = String(r.to_date || r.from_date || "").slice(0, 10);
    if (!from || !to) continue;
    for (const d of enumerateWorkingDays(from, to, holidays)) {
      if (!range.has(d)) continue;
      if (!scheduled.has(d)) continue;
      days.add(d);
    }
  }
  return days;
}

function isApprovedWfhLeaveDay(leaveRows, userId, dateKey) {
  const key = String(dateKey).slice(0, 10);
  for (const r of leaveRows) {
    if (!r || r.user_id !== userId || r.status !== "approved" || r.type !== "WFH") continue;
    const from = String(r.from_date || "").slice(0, 10);
    const to = String(r.to_date || r.from_date || "").slice(0, 10);
    if (from && to && key >= from && key <= to) return true;
  }
  return false;
}

function hasApprovedShortLeave(shortLeaveSet, attendanceShortLeaves) {
  if (shortLeaveSet) return true;
  return parseJsonArray(attendanceShortLeaves).some(sl => !sl.status || sl.status === "approved");
}

/**
 * Build register cell text + color kind for one employee/date.
 */
function buildDayCell({
  user, dateKey, record, holidays, leaveDates, shortLeaveApproved,
  leaveRows, today,
}) {
  const hired = String(user.hired || "").slice(0, 10);
  if (hired && dateKey < hired) return { text: "", kind: "empty" };
  if (dateKey > today) return { text: "", kind: "empty" };

  const off = isShiftOffDay(user, dateKey, today);
  const pub = isPublicHoliday(dateKey, holidays);
  const onLeave = leaveDates.has(dateKey);
  const companyWfh = isCompanyWfhDay(dateKey, holidays);
  const wfhLeave = isApprovedWfhLeaveDay(leaveRows, user.id, dateKey);
  const checkIn = record?.check_in || record?.checkIn || null;
  const checkOut = record?.check_out || record?.checkOut || null;
  const status = record?.status != null ? String(record.status).trim() : "";
  const source = record?.source || "";
  const lateFlag = !!(record?.late) || (checkIn && isLateCheckIn(checkIn, user, dateKey, holidays, today));
  const att = checkIn ? { checkIn, checkOut, status, source, late: lateFlag } : null;
  const isWfhAtt = !!(att && (source === "wfh" || companyWfh || wfhLeave));
  const hasSL = hasApprovedShortLeave(shortLeaveApproved, record?.short_leaves);

  if (pub && !checkIn) return { text: "PH", kind: "ph" };
  if (off && !checkIn) return { text: "OFF", kind: "off" };
  if (onLeave && !checkIn) return { text: "LV", kind: "leave" };

  if (!checkIn) {
    if (wfhLeave) return { text: "WFH", kind: "wfh" };
    if (companyWfh) return { text: "A", kind: "absent" };
    if (off || pub) return { text: off ? "OFF" : "PH", kind: off ? "off" : "ph" };
    return { text: "A", kind: "absent" };
  }

  const pair = timePair(att);

  if (isWfhAtt) {
    return { text: `WFH ${pair}`, kind: "wfh" };
  }

  if (!checkOut || status === "Missing Checkout" || status === "Auto Checkout") {
    return { text: `${formatPktCompact(checkIn)}-? MC`, kind: "mc" };
  }

  if (status === "Early Leave") {
    return { text: `${pair} EL`, kind: "el" };
  }

  if (hasSL) {
    return { text: `${pair} SL`, kind: "sl" };
  }

  if (lateFlag) {
    return { text: `${pair} L`, kind: "late" };
  }

  return { text: `${pair} ✓`, kind: "present" };
}

function summarizeEmployee({
  user, dates, attByDate, holidays, leaveRows, today,
}) {
  const hired = String(user.hired || "").slice(0, 10);
  let rangeStart = dates[0];
  let rangeEnd = dates[dates.length - 1];
  if (hired && hired > rangeEnd) {
    return { present: 0, absent: 0, late: 0, leaves: 0, wfh: 0, payable: 0, leaveDates: new Set() };
  }
  if (hired && hired > rangeStart) rangeStart = hired;
  if (rangeEnd > today) rangeEnd = today;
  if (rangeStart > rangeEnd) {
    return { present: 0, absent: 0, late: 0, leaves: 0, wfh: 0, payable: 0, leaveDates: new Set() };
  }

  const scheduled = eachDateInRange(rangeStart, rangeEnd).filter(d =>
    !isWeekendDate(d) &&
    !isPublicHoliday(d, holidays) &&
    !isShiftOffDay(user, d, today)
  );
  const leaveDates = approvedLeaveDates(leaveRows, user.id, rangeStart, rangeEnd, holidays, user, today);

  let present = 0;
  let late = 0;
  let wfh = 0;
  const presentDates = new Set();

  for (const d of scheduled) {
    const rec = attByDate.get(d);
    const checkIn = rec?.check_in;
    if (!checkIn) continue;
    presentDates.add(d);
    present += 1;
    if (rec.late || isLateCheckIn(checkIn, user, d, holidays, today)) late += 1;
    const companyWfh = isCompanyWfhDay(d, holidays);
    const wfhLeave = isApprovedWfhLeaveDay(leaveRows, user.id, d);
    if (rec.source === "wfh" || companyWfh || wfhLeave) wfh += 1;
  }

  const absent = !user.shift
    ? 0
    : scheduled.filter(d => !presentDates.has(d) && !leaveDates.has(d)).length;

  const leaves = leaveDates.size;
  return {
    present,
    absent,
    late,
    leaves,
    wfh,
    payable: present + leaves,
    leaveDates,
  };
}

function applyCellStyle(cell, kind) {
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
  cell.font = { size: 9 };
  const colorMap = {
    present: COLORS.present,
    absent: COLORS.absent,
    late: COLORS.late,
    off: COLORS.off,
    leave: COLORS.leave,
    wfh: COLORS.wfh,
    mc: COLORS.mc,
    el: COLORS.el,
    sl: COLORS.sl,
    ph: COLORS.ph,
  };
  if (colorMap[kind]) {
    cell.font = { size: 9, color: { argb: `FF${colorMap[kind]}` } };
  }
}

async function buildWorkbook({ month, users, attendance, leaveRows, holidays, shortLeaves }) {
  const range = monthToRange(month);
  if (!range) throw new Error("Invalid month");
  const dates = eachDateInRange(range.start, range.end);
  const today = karachiDateKey(new Date());
  const monthTitle = `${MONTH_NAMES[range.monthIndex]} ${range.year}`;

  const attByUser = new Map();
  for (const row of attendance) {
    if (!attByUser.has(row.user_id)) attByUser.set(row.user_id, new Map());
    attByUser.get(row.user_id).set(row.date, row);
  }

  const shortByUserDate = new Map();
  for (const sl of shortLeaves) {
    if (sl.status !== "approved") continue;
    const key = `${sl.user_id}|${String(sl.date).slice(0, 10)}`;
    shortByUserDate.set(key, true);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Cadence HR";
  wb.created = new Date();
  const ws = wb.addWorksheet(monthTitle, {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });

  const summaryHeaders = ["Present", "Absent", "Late", "Leaves", "WFH", "Payable Days"];
  const headers = ["Employee Name", ...dates.map(dateHeaderLabel), ...summaryHeaders];
  const headerRow = ws.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: `FF${COLORS.headerFg}` }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${COLORS.headerBg}` },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  for (const user of users) {
    const attByDate = attByUser.get(user.id) || new Map();
    const summary = summarizeEmployee({
      user,
      dates,
      attByDate,
      holidays,
      leaveRows,
      today,
    });

    const rowValues = [user.name || ""];
    const kinds = ["name"];

    for (const dateKey of dates) {
      const record = attByDate.get(dateKey) || null;
      const cell = buildDayCell({
        user,
        dateKey,
        record,
        holidays,
        leaveDates: summary.leaveDates || new Set(),
        shortLeaveApproved: shortByUserDate.get(`${user.id}|${dateKey}`),
        leaveRows,
        today,
      });
      rowValues.push(cell.text);
      kinds.push(cell.kind);
    }

    rowValues.push(
      summary.present,
      summary.absent,
      summary.late,
      summary.leaves,
      summary.wfh,
      summary.payable
    );
    kinds.push("summary", "summary", "summary", "summary", "summary", "summary");

    const row = ws.addRow(rowValues);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(1).alignment = { vertical: "middle" };

    for (let i = 2; i <= dates.length + 1; i++) {
      applyCellStyle(row.getCell(i), kinds[i - 1]);
    }

    const summaryStart = dates.length + 2;
    for (let i = 0; i < 6; i++) {
      const cell = row.getCell(summaryStart + i);
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${COLORS.summaryBg}` },
      };
    }
  }

  ws.getColumn(1).width = 22;
  for (let i = 2; i <= dates.length + 1; i++) {
    ws.getColumn(i).width = 14;
  }
  for (let i = 0; i < 6; i++) {
    ws.getColumn(dates.length + 2 + i).width = 12;
  }

  return { wb, fileName: `Attendance_${MONTH_NAMES[range.monthIndex]}_${range.year}.xlsx` };
}

export function registerAttendanceExportRoutes(app, pool, requireAuth, requireHrOps) {
  app.get("/api/attendance/export", requireAuth, requireHrOps, async (req, res) => {
    try {
      const month = String(req.query.month || "").trim();
      const range = monthToRange(month);
      if (!range) {
        return res.status(400).json({ error: "month is required (YYYY-MM)" });
      }

      const [usersRes, attRes, leaveRes, holidayRes, shortRes] = await Promise.all([
        pool.query(
          `SELECT id, name, role, status, hired, shift, shift_history
           FROM users
           WHERE status = 'active'
             AND role IS DISTINCT FROM 'Admin'
             AND role IS DISTINCT FROM 'Executive'
           ORDER BY LOWER(name) ASC`
        ),
        pool.query(
          `SELECT id, user_id, date, check_in, check_out, status, late, source, short_leaves
           FROM attendance
           WHERE date >= $1 AND date <= $2`,
          [range.start, range.end]
        ),
        pool.query(
          `SELECT id, user_id, type, from_date, to_date, status
           FROM leave_requests
           WHERE status = 'approved'
             AND from_date <= $2
             AND to_date >= $1`,
          [range.start, range.end]
        ),
        pool.query(
          `SELECT id, title, date, type
           FROM holidays
           WHERE date >= $1 AND date <= $2`,
          [range.start, range.end]
        ),
        pool.query(
          `SELECT id, user_id, date, status
           FROM short_leave_requests
           WHERE status = 'approved'
             AND date >= $1 AND date <= $2`,
          [range.start, range.end]
        ),
      ]);

      const users = usersRes.rows
        .filter(r => userHasOwnAttendance(r.role))
        .map(r => ({
          id: r.id,
          name: r.name,
          role: r.role,
          hired: r.hired || "",
          shift: parseShiftObject(r.shift) || r.shift,
          shiftHistory: parseShiftHistory(r.shift_history),
        }));

      const holidays = holidayRes.rows.map(r => ({
        id: r.id,
        title: r.title,
        date: r.date,
        type: normalizeHolidayType(r.type),
      }));

      const { wb, fileName } = await buildWorkbook({
        month,
        users,
        attendance: attRes.rows,
        leaveRows: leaveRes.rows,
        holidays,
        shortLeaves: shortRes.rows,
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (e) {
      console.error("GET /api/attendance/export error:", e.message);
      if (!res.headersSent) {
        res.status(500).json({ error: e.message || "Export failed" });
      }
    }
  });
}
