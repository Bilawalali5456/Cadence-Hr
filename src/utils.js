import { Users, Briefcase, Check, User, Shield } from "lucide-react";
import { B } from "./brand.jsx";

export const DEFAULT_COMPANY = { officeStart: "09:00", graceMinutes: 15, currency: "PKR" };

/* ─── RBAC (loaded from PostgreSQL roles table) ─── */
export function getRolePermissions(roleName, roles = []) {
  const role = roles.find(r => r.id === roleName || r.name === roleName);
  return role?.permissions || [];
}

export function can(roleName, permission, roles = []) {
  return getRolePermissions(roleName, roles).includes(permission);
}

export function isStaffRole(role) {
  return role === "Employee" || role === "Manager";
}

export function isHrAdminRole(role) {
  return role === "HR Admin";
}

export function isExecutiveRole(role) {
  return role === "Executive";
}

export function employeeRoster(users) {
  return users.filter(u => isStaffRole(u.role));
}

export function hrAdminRoster(users) {
  return users.filter(u => isHrAdminRole(u.role));
}

export function isHrAdminRequest(req, users) {
  const u = users.find(x => x.id === req.userId);
  return isHrAdminRole(u?.role);
}

export function canSelfSubmitLeave(role) {
  return isStaffRole(role) || isHrAdminRole(role);
}

export function visibleShortLeaveRequests(requests, currentUser, users, roles) {
  const list = (requests || []).filter(r => r && r.userId);
  const role = currentUser.role;
  if (isExecutiveRole(role)) return list;
  if (isHrAdminRole(role)) {
    return list.filter(r => r.userId === currentUser.id || !isHrAdminRequest(r, users));
  }
  if (can(role, "approve_short_leave", roles)) {
    return list.filter(r => !isHrAdminRequest(r, users));
  }
  return list.filter(r => r.userId === currentUser.id);
}

export function visibleLeaveRequests(requests, currentUser, users, roles) {
  const list = (requests || []).filter(r => r && r.userId);
  const role = currentUser.role;
  if (isExecutiveRole(role)) return list;
  if (isHrAdminRole(role)) {
    return list.filter(r => r.userId === currentUser.id || !isHrAdminRequest(r, users));
  }
  if (can(role, "approve_leave", roles)) {
    return list.filter(r => !isHrAdminRequest(r, users));
  }
  return list.filter(r => r.userId === currentUser.id);
}

export function canApproveShortLeaveRequest(approver, req, users, roles) {
  if (!req) return false;
  if (req.userId === approver.id) return false;
  if (!can(approver.role, "approve_short_leave", roles)) return false;
  if (isHrAdminRequest(req, users)) return isExecutiveRole(approver.role);
  return isHrAdminRole(approver.role) || isExecutiveRole(approver.role) || approver.role === "Manager";
}

export function canApproveLeaveRequest(approver, req, users, roles) {
  if (!req) return false;
  if (req.userId === approver.id) return false;
  if (!can(approver.role, "approve_leave", roles)) return false;
  if (isHrAdminRequest(req, users)) return isExecutiveRole(approver.role);
  return isHrAdminRole(approver.role) || isExecutiveRole(approver.role) || approver.role === "Manager";
}

/** Executive super-authority: reverse or change any leave decision after HR/others have acted. */
export function canOverrideLeaveDecision(actor) {
  return !!actor && isExecutiveRole(actor.role);
}

/** Authority tier for approval hierarchy: Executive (2) > Admin/Manager (1). */
export function approvalAuthorityTier(role) {
  if (isExecutiveRole(role)) return 2;
  if (isHrAdminRole(role) || role === "Manager") return 1;
  return 0;
}

export function reviewerAuthorityTier(req) {
  if (!req || req.status === "pending") return 0;
  if (req.reviewedByRole) return approvalAuthorityTier(req.reviewedByRole);
  return 1;
}

export function buildApprovalDecision(approver, newStatus) {
  return {
    status: newStatus,
    reviewedBy: approver.name,
    reviewedOn: new Date().toLocaleString(),
    reviewedByRole: approver.role,
  };
}

export function approvalStatusLabel(req) {
  if (!req || req.status === "pending") return null;
  const byExecutive = reviewerAuthorityTier(req) >= 2;
  const actor = byExecutive ? "Executive" : "Admin";
  if (req.status === "approved") return `Approved by ${actor}`;
  if (req.status === "rejected") return `Rejected by ${actor}`;
  return null;
}

/** Leave/WFH: pending — Admin or Executive; decided — Executive may override Admin, Admin cannot override Executive. */
export function canChangeLeaveRequestStatus(approver, req, users, roles) {
  if (!req || !approver || req.userId === approver.id) return false;
  if (req.status === "pending") return canApproveLeaveRequest(approver, req, users, roles);
  if (approvalAuthorityTier(approver.role) < 1) return false;
  if (isExecutiveRole(approver.role)) return true;
  return reviewerAuthorityTier(req) < 2;
}

/** Short leave — same hierarchy as leave/WFH approvals. */
export function canChangeShortLeaveRequestStatus(approver, req, users, roles) {
  if (!req || !approver || req.userId === approver.id) return false;
  if (req.status === "pending") return canApproveShortLeaveRequest(approver, req, users, roles);
  if (approvalAuthorityTier(approver.role) < 1) return false;
  if (isExecutiveRole(approver.role)) return true;
  return reviewerAuthorityTier(req) < 2;
}

export function canManageHrAdmin(actor, target, roles) {
  if (!actor || !target || !isHrAdminRole(target.role)) return false;
  if (actor.id === target.id) return false;
  return isExecutiveRole(actor.role)
    || can(actor.role, "manage_hr_admin", roles)
    || can(actor.role, "edit_hr_admin", roles);
}

export function canEditPerson(actor, target, roles) {
  if (!actor || !target) return false;
  if (isStaffRole(target.role) && can(actor.role, "manage_employees", roles)) return true;
  return canManageHrAdmin(actor, target, roles);
}

export function canDeletePerson(actor, target, roles) {
  if (!actor || !target || actor.id === target.id) return false;
  if (isStaffRole(target.role) && can(actor.role, "manage_employees", roles)) return true;
  return canManageHrAdmin(actor, target, roles);
}

export function canResetPersonCredentials(actor, target, roles) {
  if (!actor || !target) return false;
  if (isStaffRole(target.role) && can(actor.role, "manage_employees", roles)) return true;
  return canManageHrAdmin(actor, target, roles);
}

export function canDeleteLeaveRecord(actor, req, users, roles) {
  if (!req || !actor) return false;
  if (req.userId === actor.id && req.status === "pending") return true;
  if (isExecutiveRole(actor.role)) return true;
  const requester = users.find(u => u.id === req.userId);
  if (isHrAdminRole(requester?.role)) return canManageHrAdmin(actor, requester, roles);
  if (!can(actor.role, "approve_leave", roles)) return false;
  return isHrAdminRole(actor.role) || actor.role === "Manager";
}

export function canDeleteShortLeaveRecord(actor, req, users, roles) {
  if (!req || !actor) return false;
  if (req.userId === actor.id && req.status === "pending") return true;
  if (isExecutiveRole(actor.role)) return true;
  const requester = users.find(u => u.id === req.userId);
  if (isHrAdminRequest(req, users)) return canManageHrAdmin(actor, requester, roles);
  if (!can(actor.role, "approve_short_leave", roles)) return false;
  return isHrAdminRole(actor.role) || actor.role === "Manager";
}

export function sortHrAdminFirst(users) {
  return [...users].sort((a, b) => {
    const aHr = isHrAdminRole(a.role) ? 0 : 1;
    const bHr = isHrAdminRole(b.role) ? 0 : 1;
    return aHr - bHr || (a.name || "").localeCompare(b.name || "");
  });
}

export function attendanceVisibleUserIds(users, viewerRole) {
  const ids = employeeRoster(users).map(u => u.id);
  if (isExecutiveRole(viewerRole)) {
    return new Set([...ids, ...hrAdminRoster(users).map(u => u.id)]);
  }
  return new Set(ids);
}

/** Staff roster for People / profile lists — executives also see HR Admin accounts (HR Admin first). */
export function peopleRoster(users, viewerRole) {
  const staff = employeeRoster(users);
  if (isExecutiveRole(viewerRole)) {
    return sortHrAdminFirst([...hrAdminRoster(users), ...staff]);
  }
  return staff;
}

/** Active users included in live attendance & payroll views for the current role. */
export function activeAttendanceRoster(users, viewerRole) {
  return peopleRoster(users, viewerRole).filter(u => u.status === "active");
}

export function activePayrollRoster(users, viewerRole) {
  return activeAttendanceRoster(users, viewerRole);
}

export const SHIFT_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
/** Mon–Fri only — used in shift settings UI; Sat/Sun are always off. */
export const SHIFT_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
export const SHIFT_DAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const DEFAULT_WEEKLY_SCHEDULE = {
  monday:    { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  tuesday:   { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  wednesday: { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  thursday:  { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  friday:    { off: false, shiftStart: "09:00", shiftEnd: "18:00" },
  saturday:  { off: true,  shiftStart: "09:00", shiftEnd: "14:00" },
  sunday:    { off: true,  shiftStart: "09:00", shiftEnd: "18:00" },
};

export const DEFAULT_SHIFT = {
  shiftStart: "09:00",
  shiftEnd: "18:00",
  graceMinutes: 15,
  breakMinutes: 60,
  checkoutGraceMinutes: 10,
  weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
};

export function shiftDayKey(dateKey = todayKey()) {
  const d = typeof dateKey === "string"
    ? new Date(dateKey.includes("T") ? dateKey : dateKey + "T12:00:00")
    : new Date(dateKey);
  return SHIFT_DAYS[(d.getDay() + 6) % 7];
}

export function normalizeWeeklySchedule(shift = {}) {
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

export function getShiftSchedule(user, dateKey = todayKey()) {
  const shift = user?.shift || {};
  const weeklySchedule = normalizeWeeklySchedule(shift);
  const day = shiftDayKey(dateKey);
  const daySchedule = weeklySchedule[day] || DEFAULT_WEEKLY_SCHEDULE[day];
  return {
    day,
    label: SHIFT_DAY_LABELS[day],
    weeklySchedule,
    off: isWeekendDate(dateKey) || !!daySchedule.off,
    shiftStart: daySchedule.shiftStart || DEFAULT_SHIFT.shiftStart,
    shiftEnd: daySchedule.shiftEnd || DEFAULT_SHIFT.shiftEnd,
  };
}

export function getUserShift(user, dateKey = todayKey()) {
  const shift = { ...DEFAULT_SHIFT, ...(user?.shift || {}) };
  const daySchedule = getShiftSchedule(user, dateKey);
  return { ...shift, ...daySchedule, weeklySchedule: daySchedule.weeklySchedule };
}

export function shiftDateTime(dateKey, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dateKey + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d;
}

export function getShiftBounds(user, dateKey) {
  const s = getUserShift(user, dateKey);
  if (s.off) {
    return { start: null, end: null, lateCutoff: null, checkoutDeadline: null, ...s };
  }
  const start = shiftDateTime(dateKey, s.shiftStart);
  let end = shiftDateTime(dateKey, s.shiftEnd);
  if (end <= start) end = new Date(end.getTime() + 86400000);
  const lateCutoff = new Date(start.getTime() + s.graceMinutes * 60000);
  const checkoutDeadline = new Date(end.getTime() + s.checkoutGraceMinutes * 60000);
  return { start, end, lateCutoff, checkoutDeadline, ...s };
}

export function formatShiftRange(user, dateKey = todayKey()) {
  const s = getUserShift(user, dateKey);
  if (s.off) return "OFF";
  const fmt = t => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  return `${fmt(s.shiftStart)} – ${fmt(s.shiftEnd)}`;
}

export function formatDurationMs(ms) {
  if (!ms || ms <= 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export function calcTotalBreakMs(record) {
  if (!record) return 0;
  let total = (record.breaks || []).reduce((sum, b) => sum + (new Date(b.end) - new Date(b.start)), 0);
  if (record.breakStart && record.breakEnd) {
    total += new Date(record.breakEnd) - new Date(record.breakStart);
  }
  return total;
}

export function calcShortLeaveMs(record) {
  return (record?.shortLeaves || [])
    .filter(sl => !sl.status || sl.status === "approved")
    .reduce((sum, sl) => sum + (new Date(sl.end) - new Date(sl.start)), 0);
}

export function calcNetWorkingMs(record) {
  if (!record?.checkIn || !record?.checkOut) return 0;
  let ms = new Date(record.checkOut) - new Date(record.checkIn);
  ms -= calcTotalBreakMs(record);
  ms -= calcShortLeaveMs(record);
  return Math.max(0, ms);
}

export function isLateCheckIn(checkInIso, user, holidays = []) {
  if (!checkInIso || !user) return false;
  if (isPublicHolidayDate(checkInIso, holidays)) return false;
  const bounds = getShiftBounds(user, todayKey(new Date(checkInIso)));
  if (bounds.off || !bounds.lateCutoff) return false;
  return new Date(checkInIso) > bounds.lateCutoff;
}

export function computeDayStatus(user, record, holidays = []) {
  const dateKey = record?.date || todayKey();
  const pub = getPublicHoliday(dateKey, holidays);
  if (pub && !record?.checkIn) return "Public Holiday";
  const bounds = getShiftBounds(user, dateKey);
  if (bounds.off && !record?.checkIn) return "Off";
  if (!record?.checkIn) return "Absent";

  // Always recompute from current times + breaks/short leaves.
  // Do not reuse stored biometric status — server sync has no break data, so
  // portal breaks added later would leave a stale "Short Hours" / Present label.
  const late = isLateCheckIn(record.checkIn, user, holidays);
  if (!record.checkOut) return late ? "Late" : "Present";

  const net = calcNetWorkingMs(record);
  const expectedNet = Math.max(0, bounds.end - bounds.start - getUserShift(user).breakMinutes * 60000);
  if (late) return "Late";
  if (new Date(record.checkOut) < bounds.end) return "Early Leave";
  if (expectedNet > 0 && net < expectedNet) return "Short Hours";
  return "Present";
}

export function resolveDayStatus(user, record, dateKey = record?.date || todayKey(), holidays = []) {
  const pub = getPublicHoliday(dateKey, holidays);
  if (pub && !record?.checkIn) return "Public Holiday";
  const bounds = getShiftBounds(user, dateKey);
  if (bounds.off && !record?.checkIn) return "Off";
  if (!record) return bounds.off || pub ? (pub ? "Public Holiday" : "Off") : "Absent";
  return computeDayStatus(user, record, holidays);
}

export function dayStatusPill(status) {
  const map = {
    Present: { tone: "green", label: "Present" },
    "On Time": { tone: "green", label: "Present" },
    Late: { tone: "amber", label: "Late" },
    "Early Leave": { tone: "amber", label: "Early Leave" },
    "Short Hours": { tone: "amber", label: "Short Hours" },
    "Half Day": { tone: "red", label: "Short Hours" },
    Absent: { tone: "slate", label: "Absent" },
    Off: { tone: "blue", label: "Off" },
    "Weekend Off": { tone: "blue", label: "Weekend Off" },
    "Public Holiday": { tone: "blue", label: "Public Holiday" },
  };
  return map[status] || { tone: "slate", label: status || "—" };
}

export function finalizeRecord(record, user, holidays = []) {
  const dayStatus = computeDayStatus(user, record, holidays);
  return {
    ...record,
    dayStatus,
    status: dayStatus,
    late: !!(record?.checkIn && isLateCheckIn(record.checkIn, user, holidays)),
    totalBreakMs: calcTotalBreakMs(record),
    workingMs: calcNetWorkingMs(record),
  };
}

export function isoFromDateAndTime(dateKey, hhmm) {
  if (!dateKey || !hhmm) return null;
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date(`${dateKey}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function timeInputFromIso(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function wasCorrectedByExecutive(record) {
  if (!record) return false;
  if (record.lastCorrectedByRole === "Executive") return true;
  return (record.correctionLog || []).some(e => e?.byRole === "Executive");
}

export function canCorrectAttendance(actor, record) {
  if (!actor) return false;
  if (!isHrAdminRole(actor.role) && !isExecutiveRole(actor.role)) return false;
  if (isExecutiveRole(actor.role)) return true;
  return !wasCorrectedByExecutive(record);
}

export function formatCorrectionChangeSummary(changes) {
  if (!changes || typeof changes !== "object") return "";
  const parts = [];
  if (changes.checkIn) {
    parts.push(`Check-in: ${formatTime(changes.checkIn.from) || "—"} → ${formatTime(changes.checkIn.to) || "—"}`);
  }
  if (changes.checkOut) {
    parts.push(`Check-out: ${formatTime(changes.checkOut.from) || "—"} → ${formatTime(changes.checkOut.to) || "—"}`);
  }
  return parts.join(" · ");
}

export function applyAttendanceCorrection(attendance, userId, dateKey, user, actor, { checkInTime, checkOutTime, reason }, holidays = []) {
  const list = attendance || [];
  const existing = list.find(r => r && r.userId === userId && r.date === dateKey) || null;
  const prevCheckIn = existing?.checkIn || null;
  const prevCheckOut = existing?.checkOut || null;
  const newCheckIn = checkInTime ? isoFromDateAndTime(dateKey, checkInTime) : null;
  const newCheckOut = checkOutTime ? isoFromDateAndTime(dateKey, checkOutTime) : null;

  if (!reason?.trim()) return { attendance: list, error: "Reason for correction is required." };
  if (!newCheckIn && !newCheckOut) return { attendance: list, error: "Enter at least a check-in or check-out time." };
  if (newCheckIn && newCheckOut && new Date(newCheckOut) <= new Date(newCheckIn)) {
    return { attendance: list, error: "Check-out must be after check-in." };
  }

  const changes = {};
  if (prevCheckIn !== newCheckIn) changes.checkIn = { from: prevCheckIn, to: newCheckIn };
  if (prevCheckOut !== newCheckOut) changes.checkOut = { from: prevCheckOut, to: newCheckOut };
  if (Object.keys(changes).length === 0) return { attendance: list, error: "No changes to save." };

  const logEntry = {
    id: `corr-${Date.now()}`,
    by: actor.name,
    byRole: actor.role,
    at: new Date().toISOString(),
    reason: reason.trim(),
    changes,
  };

  const base = existing || {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId,
    date: dateKey,
    breaks: [],
    shortLeaves: [],
    breakStart: null,
    breakEnd: null,
    autoCheckout: false,
    source: "manual",
    correctionLog: [],
  };

  const updated = finalizeRecord({
    ...base,
    checkIn: newCheckIn,
    checkOut: newCheckOut,
    manuallyCorrected: true,
    correctionLog: [...(base.correctionLog || []), logEntry],
    lastCorrectedBy: actor.name,
    lastCorrectedByRole: actor.role,
    lastCorrectedOn: logEntry.at,
  }, user, holidays);

  const next = [...list.filter(r => !(r && r.userId === userId && r.date === dateKey)), updated];
  return { attendance: next, error: null };
}

export function flattenCorrectionAuditLog(attendance, users = []) {
  const nameById = Object.fromEntries((users || []).map(u => [u.id, u.name]));
  const rows = [];
  for (const r of (attendance || [])) {
    if (!r?.correctionLog?.length) continue;
    for (const entry of r.correctionLog) {
      rows.push({
        ...entry,
        employeeId: r.userId,
        employeeName: nameById[r.userId] || r.userId,
        date: r.date,
      });
    }
  }
  return rows.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}

export function canManualCheckIn(user, dateKey, leaveRequests = [], holidays = []) {
  if (!user?.id || !dateKey) return false;
  return isApprovedWfhDay(user.id, dateKey, leaveRequests, holidays, user);
}

export function isApprovedWfhDay(userId, dateKey, leaveRequests = [], holidays = [], user = null) {
  for (const r of (leaveRequests || []).filter(x =>
    x && x.userId === userId && x.status === "approved" && x.type === "WFH" && x.from && x.to
  )) {
    for (const d of enumerateWorkingDays(r.from, r.to, holidays)) {
      if (d !== dateKey) continue;
      if (user && !scheduledWorkDatesForUser(user, dateKey, dateKey, holidays).includes(dateKey)) continue;
      return true;
    }
  }
  return false;
}

export function isWfhAttendance(record, userId, dateKey, leaveRequests = [], holidays = [], user = null) {
  if (!record?.checkIn) return false;
  return record.source === "wfh" || isApprovedWfhDay(userId, dateKey, leaveRequests, holidays, user);
}

export function canCheckIn(now, user, record, holidays = [], leaveRequests = []) {
  const key = todayKey(now);
  if (!canManualCheckIn(user, key, leaveRequests, holidays)) {
    return { ok: false, msg: "Manual check-in is only available on approved Work from Home days." };
  }
  const bounds = getShiftBounds(user, key);
  if (bounds.off) return { ok: false, msg: "Today is off in your assigned shift." };
  const pub = getPublicHoliday(todayKey(now), holidays);
  if (pub) return { ok: false, msg: `Public Holiday — ${pub.title}` };
  if (record?.checkIn && !record?.checkOut) return { ok: false, msg: "You are already checked in." };
  if (record?.checkOut) return { ok: false, msg: "Today's attendance is already complete." };
  if (now < bounds.start) {
    return { ok: false, msg: `Check-in opens at ${formatTime(bounds.start.toISOString())} (shift start).` };
  }
  if (now > bounds.end) {
    return { ok: false, msg: "Your shift has ended. Check-in is only allowed during your assigned shift." };
  }
  return { ok: true };
}

export function canCheckOut(now, user, record) {
  if (!record?.checkIn) return { ok: false, msg: "Please check in first." };
  if (record.checkOut) return { ok: false, msg: "You have already checked out." };
  if (record.breakStart && !record.breakEnd) return { ok: false, msg: "End your break before checking out." };
  const bounds = getShiftBounds(user, todayKey(now));
  if (!bounds.checkoutDeadline) return { ok: false, msg: "Today is off in your assigned shift." };
  if (now > bounds.checkoutDeadline) {
    return { ok: false, msg: `Checkout window closed at ${formatTime(bounds.checkoutDeadline.toISOString())}.` };
  }
  return { ok: true };
}

export function performCheckIn(attendance, userId, user, now = new Date(), holidays = [], leaveRequests = []) {
  const list = attendance || [];
  const key = todayKey(now);
  const existing = list.find(r => r && r.userId === userId && r.date === key);
  const gate = canCheckIn(now, user, existing, holidays, leaveRequests);
  if (!gate.ok) return { attendance: list, error: gate.msg };
  const record = {
    id: "att-" + Date.now(),
    userId,
    date: key,
    checkIn: now.toISOString(),
    checkOut: null,
    breaks: existing?.breaks || [],
    shortLeaves: existing?.shortLeaves || [],
    breakStart: null,
    breakEnd: null,
    autoCheckout: false,
    source: "wfh",
  };
  const next = [...list.filter(r => !(r && r.userId === userId && r.date === key)), finalizeRecord(record, user, holidays)];
  return { attendance: next, error: null };
}

export function performCheckOut(attendance, userId, user, now = new Date()) {
  const list = attendance || [];
  const key = todayKey(now);
  const existing = list.find(r => r && r.userId === userId && r.date === key);
  const gate = canCheckOut(now, user, existing);
  if (!gate.ok) return { attendance: list, error: gate.msg };
  const next = list.map(r => {
    if (!r || r.userId !== userId || r.date !== key) return r;
    return finalizeRecord({ ...r, checkOut: now.toISOString() }, user);
  });
  return { attendance: next, error: null };
}

export function performBreakStart(attendance, userId, user, now = new Date()) {
  const list = attendance || [];
  const key = todayKey(now);
  const existing = list.find(r => r && r.userId === userId && r.date === key);
  if (!existing?.checkIn || existing.checkOut) return { attendance: list, error: "Check in before starting a break." };
  if (existing.breakStart && !existing.breakEnd) return { attendance: list, error: "Break already in progress." };
  const bounds = getShiftBounds(user, key);
  if (bounds.off || !bounds.start || !bounds.end) return { attendance: list, error: "Breaks are not allowed on off days." };
  if (now < bounds.start || now > bounds.end) return { attendance: list, error: "Breaks are only allowed during your shift." };
  const next = list.map(r =>
    r && r.userId === userId && r.date === key ? { ...r, breakStart: now.toISOString(), breakEnd: null } : r
  ).filter(Boolean);
  return { attendance: next, error: null };
}

export function performBreakEnd(attendance, userId, user, now = new Date()) {
  const list = attendance || [];
  const key = todayKey(now);
  const existing = list.find(r => r && r.userId === userId && r.date === key);
  if (!existing?.breakStart || existing.breakEnd) return { attendance: list, error: "No active break to end." };
  const breaks = [...(existing.breaks || []), { start: existing.breakStart, end: now.toISOString() }];
  const next = list.map(r =>
    r && r.userId === userId && r.date === key
      ? { ...r, breaks, breakStart: null, breakEnd: null, totalBreakMs: calcTotalBreakMs({ ...r, breaks, breakStart: null, breakEnd: null }) }
      : r
  ).filter(Boolean);
  return { attendance: next, error: null };
}

export function buildShortLeaveRequest(user, dateKey, fromTime, toTime, reason) {
  const start = shiftDateTime(dateKey, fromTime);
  let end = shiftDateTime(dateKey, toTime);
  if (end <= start) end = new Date(end.getTime() + 86400000);
  if (end <= start) return { error: "End time must be after start time." };
  const minutes = Math.round((end - start) / 60000);
  return {
    request: {
      id: "slr-" + Date.now(),
      userId: user.id,
      empName: user.name,
      date: dateKey,
      fromTime,
      toTime,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      minutes,
      reason: reason.trim(),
      status: "pending",
      submitted: new Date().toLocaleString(),
    },
    error: null,
  };
}

export function applyApprovedShortLeave(attendance, users, request) {
  const user = users.find(u => u.id === request.userId);
  if (!user) return attendance || [];
  const list = attendance || [];
  const entry = {
    id: request.id,
    start: request.startIso,
    end: request.endIso,
    reason: request.reason,
    status: "approved",
  };
  const key = request.date;
  const existing = list.find(r => r && r.userId === request.userId && r.date === key);
  if (existing) {
    return list.map(r =>
      r && r.userId === request.userId && r.date === key
        ? finalizeRecord({
            ...r,
            shortLeaves: [...(r.shortLeaves || []).filter(sl => sl.id !== entry.id), entry],
          }, user)
        : r
    ).filter(Boolean);
  }
  const record = finalizeRecord({
    id: "att-" + Date.now(),
    userId: request.userId,
    date: key,
    checkIn: null,
    checkOut: null,
    breaks: [],
    shortLeaves: [entry],
    autoCheckout: false,
  }, user);
  return [...list, record];
}

export function removeShortLeaveFromAttendance(attendance, users, request) {
  const user = users.find(u => u.id === request.userId);
  if (!user) return attendance || [];
  return (attendance || [])
    .map(r => {
      if (!r || r.userId !== request.userId || r.date !== request.date) return r;
      const shortLeaves = (r.shortLeaves || []).filter(sl => sl.id !== request.id);
      return finalizeRecord({ ...r, shortLeaves }, user);
    })
    .filter(r => r && !(r.userId === request.userId && r.date === request.date && !r.checkIn && !r.checkOut && !(r.shortLeaves || []).length));
}

export function applyAutoCheckouts(attendance, users) {
  const now = new Date();
  const key = todayKey(now);
  let changed = false;
  const next = (attendance || []).map(r => {
    if (!r || r.date !== key || !r.checkIn || r.checkOut) return r;
    const user = users.find(u => u.id === r.userId);
    if (!user) return r;
    const bounds = getShiftBounds(user, key);
    if (now >= bounds.checkoutDeadline) {
      changed = true;
      return finalizeRecord({
        ...r,
        checkOut: bounds.checkoutDeadline.toISOString(),
        autoCheckout: true,
        breakStart: null,
        breakEnd: r.breakStart && !r.breakEnd ? bounds.checkoutDeadline.toISOString() : r.breakEnd,
        breaks: r.breakStart && !r.breakEnd
          ? [...(r.breaks || []), { start: r.breakStart, end: bounds.checkoutDeadline.toISOString() }]
          : r.breaks,
      }, user);
    }
    return r;
  });
  return changed ? next : attendance;
}

export function displayWorkingHours(record, user) {
  if (record?.checkOut && record.workingMs != null) return formatDurationMs(record.workingMs);
  if (record?.checkIn && record?.checkOut) return formatDurationMs(calcNetWorkingMs(record));
  if (record?.checkIn && !record?.checkOut) return "—";
  return "—";
}

/** Check-out cell: show Missing when only one scan (check-in only). */
export function formatCheckOutDisplay(record) {
  if (!record?.checkIn) return "—";
  if (!record.checkOut) return "Missing";
  return null; // caller formats time
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const DEFAULT_ANNUAL_LEAVE = 24;

/** Saturday (6) and Sunday (0) are company weekend off. */
export function isWeekendDate(dateOrKey) {
  const d = typeof dateOrKey === "string"
    ? new Date(dateOrKey.includes("T") ? dateOrKey : dateOrKey + "T12:00:00")
    : new Date(dateOrKey);
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

export function normalizeHolidayType(type) {
  const t = String(type ?? "public").trim().toLowerCase();
  return t === "optional" ? "optional" : "public";
}

export function filterValidHolidays(holidays) {
  return (holidays || []).filter(h => h && h.date && h.title);
}

export function getHolidayOnDate(dateKey, holidays = []) {
  const key = typeof dateKey === "string" ? dateKey.slice(0, 10) : todayKey(dateKey);
  return filterValidHolidays(holidays).find(h => h.date === key) || null;
}

export function getPublicHoliday(dateKey, holidays = []) {
  const h = getHolidayOnDate(dateKey, holidays);
  return h && normalizeHolidayType(h.type) === "public" ? h : null;
}

export function isPublicHolidayDate(dateKey, holidays = []) {
  return !!getPublicHoliday(dateKey, holidays);
}

export function isNonWorkingDay(dateKey, holidays = []) {
  return isWeekendDate(dateKey) || isPublicHolidayDate(dateKey, holidays);
}

export function upcomingHolidays(holidays = [], fromDate = todayKey()) {
  return filterValidHolidays(holidays)
    .filter(h => h.date >= fromDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function remainingPublicHolidaysThisYear(holidays = [], year = new Date().getFullYear()) {
  const today = todayKey();
  return filterValidHolidays(holidays).filter(h =>
    normalizeHolidayType(h.type) === "public" &&
    h.date.startsWith(String(year)) &&
    h.date >= today
  ).length;
}

export function enumerateWorkingDays(fromKey, toKey, holidays = []) {
  const start = new Date(fromKey + "T12:00:00");
  const end = new Date(toKey + "T12:00:00");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    if (!isNonWorkingDay(cur, holidays)) days.push(todayKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function countWorkingDaysInclusive(fromKey, toKey, holidays = []) {
  return enumerateWorkingDays(fromKey, toKey, holidays).length;
}

export function leavePaidDays(req) {
  if (req == null) return 0;
  if (req.type === "WFH") return 0;
  if (req.paidDays != null) return Number(req.paidDays) || 0;
  if (req.type === "Unpaid" || req.payTag === "Unpaid") return 0;
  return Number(req.days) || 0;
}

export function leaveUnpaidDays(req) {
  if (req == null) return 0;
  if (req.type === "WFH") return 0;
  if (req.unpaidDays != null) return Number(req.unpaidDays) || 0;
  if (req.type === "Unpaid") return Number(req.days) || 0;
  if (req.payTag === "Unpaid") return Number(req.days) || 0;
  return 0;
}

export function leaveTypeLabel(type) {
  if (type === "Unpaid") return "Unpaid Leave";
  if (type === "WFH") return "Work from Home";
  return "Annual Leave";
}

export function computeLeavePaySplit(type, days, availableBalance) {
  if (type === "WFH") {
    return { paidDays: 0, unpaidDays: 0, payTag: "WFH" };
  }
  if (type === "Unpaid") {
    return { paidDays: 0, unpaidDays: days, payTag: "Unpaid" };
  }
  const paidDays = Math.min(Math.max(0, availableBalance), days);
  const unpaidDays = Math.max(0, days - paidDays);
  return {
    paidDays,
    unpaidDays,
    payTag: unpaidDays > 0 ? "Unpaid" : "Paid",
  };
}

export function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(key) {
  if (!key) return "—";
  return new Date(key + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function hoursWorked(checkIn, checkOut) {
  if (!checkIn || !checkOut) return "—";
  const ms = new Date(checkOut) - new Date(checkIn);
  if (ms <= 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export function getUserTodayRecord(attendance, userId) {
  const key = todayKey();
  return (attendance || []).find(r => r && r.userId === userId && r.date === key) || null;
}

export function attendanceStatus(record) {
  if (!record || !record.checkIn) return { label: "Not checked in", tone: "slate" };
  if (!record.checkOut) return { label: "Checked in", tone: "green" };
  return { label: "Checked out", tone: "blue" };
}

export function weekStart(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function filterAttendanceByPeriod(attendance, period, anchor = new Date()) {
  const list = (attendance || []).filter(r => r && r.date);
  const key = todayKey(anchor);
  if (period === "daily") return list.filter(r => r.date === key);
  if (period === "weekly") {
    const start = weekStart(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return list.filter(r => {
      const d = new Date(r.date + "T12:00:00");
      return d >= start && d <= end;
    });
  }
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  return list.filter(r => {
    const d = new Date(r.date + "T12:00:00");
    return d.getFullYear() === y && d.getMonth() === m;
  });
}

export function findUserByCredentials(users, email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();
  return users.find(u =>
    u.email.trim().toLowerCase() === normalizedEmail &&
    (u.password === normalizedPassword || u.tempPassword === normalizedPassword)
  );
}

export function genId()     { return "u-" + Math.random().toString(36).slice(2, 9); }
export function genTempPw() {
  const c = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!";
  return Array.from({ length: 10 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

export const SENSITIVE_ENC_KEY = "adforce-hr-sensitive-v1";

export function normalizeCnic(v) {
  return String(v || "").replace(/\D/g, "");
}

export function formatCnic(digits) {
  const d = normalizeCnic(digits);
  if (d.length !== 13) return digits || "";
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export function formatCnicInput(v) {
  const d = normalizeCnic(v).slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export function isValidCnic(v) {
  return /^\d{13}$/.test(normalizeCnic(v));
}

export function encryptSensitive(plain) {
  if (!plain) return "";
  const te = new TextEncoder();
  const bytes = te.encode(plain);
  const key = te.encode(SENSITIVE_ENC_KEY);
  const out = bytes.map((b, i) => b ^ key[i % key.length]);
  return "enc:" + btoa(String.fromCharCode(...out));
}

export function decryptSensitive(enc) {
  if (!enc) return "";
  if (!enc.startsWith("enc:")) return normalizeCnic(enc);
  try {
    const raw = atob(enc.slice(4));
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const key = new TextEncoder().encode(SENSITIVE_ENC_KEY);
    const out = bytes.map((b, i) => b ^ key[i % key.length]);
    return new TextDecoder().decode(out);
  } catch {
    return "";
  }
}

export function getUserCnic(user) {
  return formatCnic(decryptSensitive(user?.cnicEnc));
}

export function cnicDigitsForUser(user) {
  return normalizeCnic(decryptSensitive(user?.cnicEnc));
}

export const LOGIN_ROLES = [
  {
    id: "HR Admin",
    label: "HR Admin",
    icon: Shield,
    color: B.red,
    description: "Manage employees, payroll, attendance & settings",
  },
  {
    id: "Employee",
    label: "Employee",
    icon: User,
    color: B.dark,
    description: "Check in, view payslips, request leave",
  },
  {
    id: "Manager",
    label: "Manager",
    icon: Users,
    color: B.darkMid,
    description: "Approve leave, oversee team attendance & requests",
  },
  {
    id: "Executive",
    label: "Executive",
    icon: Briefcase,
    color: "#0f4c75",
    description: "Company overview, reports & analytics",
  },
];

export function loginRoleMatchesSelection(selectedRole, actualRole) {
  if (selectedRole === actualRole) return true;
  // Managers use the employee portal; Employee card still accepts Manager accounts.
  if (selectedRole === "Employee" && actualRole === "Manager") return true;
  return false;
}

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function monthDateRange(key) {
  const [y, m] = key.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return {
    start: `${y}-${String(m).padStart(2, "0")}-01`,
    end: `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`,
    daysInMonth,
  };
}

export function eachDateInRange(fromKey, toKey) {
  const start = new Date(fromKey + "T12:00:00");
  const end = new Date(toKey + "T12:00:00");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(todayKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function isShiftOffDay(user, dateKey) {
  if (isWeekendDate(dateKey)) return true;
  return !!getShiftBounds(user, dateKey).off;
}

export function scheduledWorkDatesForUser(user, fromKey, toKey, holidays = []) {
  return eachDateInRange(fromKey, toKey).filter(dateKey =>
    !isWeekendDate(dateKey) &&
    !getPublicHoliday(dateKey, holidays) &&
    !isShiftOffDay(user, dateKey)
  );
}

export function workingDaysInMonth(key, holidays = [], user = null) {
  const { start, end } = monthDateRange(key);
  if (user) return scheduledWorkDatesForUser(user, start, end, holidays).length;
  let count = 0;
  for (const dateKey of eachDateInRange(start, end)) {
    if (!isNonWorkingDay(dateKey, holidays)) count++;
  }
  return count;
}

function approvedLeaveDatesForUser(leaveRequests, userId, fromKey, toKey, holidays = [], user = null) {
  const rangeDays = new Set(eachDateInRange(fromKey, toKey));
  const scheduled = user ? new Set(scheduledWorkDatesForUser(user, fromKey, toKey, holidays)) : null;
  const days = new Set();
  for (const r of (leaveRequests || []).filter(x =>
    x && x.userId === userId && x.status === "approved" && x.from && x.to && x.type !== "WFH"
  )) {
    for (const d of enumerateWorkingDays(r.from, r.to, holidays)) {
      if (!rangeDays.has(d)) continue;
      if (scheduled && !scheduled.has(d)) continue;
      days.add(d);
    }
  }
  return days;
}

export function computeMonthlyAttendanceSummary(user, attendance, leaveRequests, month, holidays = []) {
  const { start, end } = monthDateRange(month);
  const today = todayKey();
  let rangeStart = start;
  let rangeEnd = end;

  if (user?.hired) {
    if (user.hired > end) {
      return {
        month,
        joinedFrom: user.hired,
        totalPresentDays: 0,
        totalAbsentDays: 0,
        totalLateDays: 0,
        totalWorkingMs: 0,
        totalRequiredMs: 0,
        approvedLeaveDays: 0,
        payableDays: 0,
      };
    }
    if (user.hired > rangeStart) rangeStart = user.hired;
  }

  if (rangeEnd > today) rangeEnd = today;

  if (rangeStart > rangeEnd) {
    return {
      month,
      joinedFrom: rangeStart,
      totalPresentDays: 0,
      totalAbsentDays: 0,
      totalLateDays: 0,
      totalWorkingMs: 0,
      totalRequiredMs: 0,
      approvedLeaveDays: 0,
      payableDays: 0,
    };
  }

  const scheduledDates = scheduledWorkDatesForUser(user, rangeStart, rangeEnd, holidays);
  const scheduledSet = new Set(scheduledDates);
  const leaveDates = approvedLeaveDatesForUser(leaveRequests, user?.id, rangeStart, rangeEnd, holidays, user);

  const rows = (attendance || [])
    .filter(r => r && r.userId === user?.id && r.date && r.date >= rangeStart && r.date <= rangeEnd)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const presentRows = rows.filter(r => r.checkIn && scheduledSet.has(r.date));
  const presentDates = new Set(presentRows.map(r => r.date));
  const lateDays = presentRows.filter(r => resolveDayStatus(user, r, r.date, holidays) === "Late").length;
  const totalWorkingMs = presentRows.reduce((sum, r) => sum + (r.workingMs || calcNetWorkingMs(r) || 0), 0);
  const totalRequiredMs = scheduledDates
    .filter(d => !leaveDates.has(d))
    .reduce((sum, d) => {
      const bounds = getShiftBounds(user, d);
      if (bounds.off || !bounds.start || !bounds.end) return sum;
      return sum + Math.max(0, bounds.end - bounds.start - getUserShift(user, d).breakMinutes * 60000);
    }, 0);
  const approvedLeaveDays = leaveDates.size;
  const absentDays = scheduledDates.filter(d => !presentDates.has(d) && !leaveDates.has(d)).length;

  return {
    month,
    joinedFrom: rangeStart,
    totalPresentDays: presentDates.size,
    totalAbsentDays: absentDays,
    totalLateDays: lateDays,
    totalWorkingMs,
    totalRequiredMs,
    approvedLeaveDays,
    payableDays: presentDates.size + approvedLeaveDays,
  };
}

export function presentDaysInMonth(attendance, userId, key, holidays = []) {
  return (attendance || []).filter(r =>
    r && r.userId === userId &&
    r.date &&
    r.date.startsWith(key) &&
    r.checkIn &&
    !isNonWorkingDay(r.date, holidays)
  ).length;
}

export function lateDaysInMonth(attendance, userId, key, users, holidays = []) {
  const user = users.find(u => u.id === userId);
  if (!user) return 0;
  return (attendance || []).filter(r =>
    r && r.userId === userId &&
    r.date &&
    r.date.startsWith(key) &&
    r.checkIn &&
    !isNonWorkingDay(r.date, holidays) &&
    isLateCheckIn(r.checkIn, user, holidays)
  ).length;
}

/** Count approved paid/unpaid leave working days overlapping a payroll month. */
export function leaveDaysInMonth(leaveRequests, userId, monthKey, kind = "paid", holidays = []) {
  let count = 0;
  for (const r of (leaveRequests || []).filter(x =>
    x && x.userId === userId && x.status === "approved" && x.from && x.to && x.type !== "WFH"
  )) {
    const days = enumerateWorkingDays(r.from, r.to, holidays);
    let paidLeft = leavePaidDays(r);
    let unpaidLeft = leaveUnpaidDays(r);
    for (const d of days) {
      const isPaidSlot = paidLeft > 0;
      if (isPaidSlot) paidLeft--;
      else if (unpaidLeft > 0) unpaidLeft--;
      else break;
      if (!d.startsWith(monthKey)) continue;
      if (kind === "paid" && isPaidSlot) count++;
      if (kind === "unpaid" && !isPaidSlot) count++;
    }
  }
  return count;
}
