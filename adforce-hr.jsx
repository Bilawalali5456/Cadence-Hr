import React, { useState, useRef, useEffect } from "react";
import {
  Users, Clock, CalendarDays, Plane, Wallet, Receipt, Briefcase, Megaphone,
  LayoutDashboard, Settings, Search, Bell, ChevronRight, Check, X, Sparkles,
  AlertTriangle, Send, ShieldCheck, ArrowRight, UserPlus, CircleDollarSign,
  Activity, BadgeCheck, Timer, Trash2, Edit2, Eye, EyeOff, Lock, LogOut,
  User, Save, Plus, ChevronDown, Key, Shield, Building, Phone, Mail, Upload,
  ToggleLeft, ToggleRight, AlertCircle, RefreshCw, KeyRound, LogIn, Landmark, Coffee,
  FileText, Package
} from "lucide-react";

/* ─── BRAND ─── */
const B = {
  dark:       "#001520",
  darkMid:    "#002235",
  darkLight:  "#e8f0f4",
  darkBorder: "#b0c8d4",
  red:        "#c70b07",
  redLight:   "#fef2f2",
  redBorder:  "#fca5a5",
  white:      "#ffffff",
};

/* ─── API LAYER (PostgreSQL via Express backend) ─── */
const API_URL = "/api";
const SESSION_STORAGE_KEY = "adforce-hr-session"; // login session stays in browser

async function apiBootstrap() {
  const res = await fetch(`${API_URL}/bootstrap`);
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

async function apiSave(collection, data) {
  try {
    await fetch(`${API_URL}/${collection}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (e) {
    console.error(`Failed to sync ${collection}:`, e);
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const DEFAULT_COMPANY = { officeStart: "09:00", graceMinutes: 15, currency: "PKR" };

/* ─── RBAC (loaded from PostgreSQL roles table) ─── */
function getRolePermissions(roleName, roles = []) {
  const role = roles.find(r => r.id === roleName || r.name === roleName);
  return role?.permissions || [];
}

function can(roleName, permission, roles = []) {
  return getRolePermissions(roleName, roles).includes(permission);
}

function isStaffRole(role) {
  return role === "Employee" || role === "Manager";
}

function isHrAdminRole(role) {
  return role === "HR Admin";
}

function isExecutiveRole(role) {
  return role === "Executive";
}

function employeeRoster(users) {
  return users.filter(u => isStaffRole(u.role));
}

function hrAdminRoster(users) {
  return users.filter(u => isHrAdminRole(u.role));
}

function isHrAdminRequest(req, users) {
  const u = users.find(x => x.id === req.userId);
  return isHrAdminRole(u?.role);
}

function canSelfSubmitLeave(role) {
  return isStaffRole(role) || isHrAdminRole(role);
}

function visibleShortLeaveRequests(requests, currentUser, users, roles) {
  const role = currentUser.role;
  if (isExecutiveRole(role)) return requests;
  if (isHrAdminRole(role)) {
    return requests.filter(r => r.userId === currentUser.id || !isHrAdminRequest(r, users));
  }
  if (can(role, "approve_short_leave", roles)) {
    return requests.filter(r => !isHrAdminRequest(r, users));
  }
  return requests.filter(r => r.userId === currentUser.id);
}

function visibleLeaveRequests(requests, currentUser, users, roles) {
  const role = currentUser.role;
  if (isExecutiveRole(role)) return requests;
  if (isHrAdminRole(role)) {
    return requests.filter(r => r.userId === currentUser.id || !isHrAdminRequest(r, users));
  }
  if (can(role, "approve_leave", roles)) {
    return requests.filter(r => !isHrAdminRequest(r, users));
  }
  return requests.filter(r => r.userId === currentUser.id);
}

function canApproveShortLeaveRequest(approver, req, users, roles) {
  if (req.userId === approver.id) return false;
  if (!can(approver.role, "approve_short_leave", roles)) return false;
  if (isHrAdminRequest(req, users)) return isExecutiveRole(approver.role);
  return isHrAdminRole(approver.role) || isExecutiveRole(approver.role) || approver.role === "Manager";
}

function canApproveLeaveRequest(approver, req, users, roles) {
  if (req.userId === approver.id) return false;
  if (!can(approver.role, "approve_leave", roles)) return false;
  if (isHrAdminRequest(req, users)) return isExecutiveRole(approver.role);
  return isHrAdminRole(approver.role) || isExecutiveRole(approver.role) || approver.role === "Manager";
}

function canManageHrAdmin(actor, target, roles) {
  if (!actor || !target || !isHrAdminRole(target.role)) return false;
  if (actor.id === target.id) return false;
  return isExecutiveRole(actor.role)
    || can(actor.role, "manage_hr_admin", roles)
    || can(actor.role, "edit_hr_admin", roles);
}

function canEditPerson(actor, target, roles) {
  if (!actor || !target) return false;
  if (isStaffRole(target.role) && can(actor.role, "manage_employees", roles)) return true;
  return canManageHrAdmin(actor, target, roles);
}

function canDeletePerson(actor, target, roles) {
  if (!actor || !target || actor.id === target.id) return false;
  if (isStaffRole(target.role) && can(actor.role, "manage_employees", roles)) return true;
  return canManageHrAdmin(actor, target, roles);
}

function canResetPersonCredentials(actor, target, roles) {
  if (!actor || !target) return false;
  if (isStaffRole(target.role) && can(actor.role, "manage_employees", roles)) return true;
  return canManageHrAdmin(actor, target, roles);
}

function canDeleteLeaveRecord(actor, req, users, roles) {
  if (!req || !actor) return false;
  if (req.userId === actor.id && req.status === "pending") return true;
  const requester = users.find(u => u.id === req.userId);
  if (isHrAdminRole(requester?.role)) return canManageHrAdmin(actor, requester, roles);
  if (!can(actor.role, "approve_leave", roles)) return false;
  return isHrAdminRole(actor.role) || isExecutiveRole(actor.role) || actor.role === "Manager";
}

function canDeleteShortLeaveRecord(actor, req, users, roles) {
  if (!req || !actor) return false;
  if (req.userId === actor.id && req.status === "pending") return true;
  const requester = users.find(u => u.id === req.userId);
  if (isHrAdminRequest(req, users)) return canManageHrAdmin(actor, requester, roles);
  if (!can(actor.role, "approve_short_leave", roles)) return false;
  return isHrAdminRole(actor.role) || isExecutiveRole(actor.role) || actor.role === "Manager";
}

function sortHrAdminFirst(users) {
  return [...users].sort((a, b) => {
    const aHr = isHrAdminRole(a.role) ? 0 : 1;
    const bHr = isHrAdminRole(b.role) ? 0 : 1;
    return aHr - bHr || (a.name || "").localeCompare(b.name || "");
  });
}

function attendanceVisibleUserIds(users, viewerRole) {
  const ids = employeeRoster(users).map(u => u.id);
  if (isExecutiveRole(viewerRole)) {
    return new Set([...ids, ...hrAdminRoster(users).map(u => u.id)]);
  }
  return new Set(ids);
}

/** Staff roster for People / profile lists — executives also see HR Admin accounts (HR Admin first). */
function peopleRoster(users, viewerRole) {
  const staff = employeeRoster(users);
  if (isExecutiveRole(viewerRole)) {
    return sortHrAdminFirst([...hrAdminRoster(users), ...staff]);
  }
  return staff;
}

/** Active users included in live attendance & payroll views for the current role. */
function activeAttendanceRoster(users, viewerRole) {
  return peopleRoster(users, viewerRole).filter(u => u.status === "active");
}

function activePayrollRoster(users, viewerRole) {
  return activeAttendanceRoster(users, viewerRole);
}

const DEFAULT_SHIFT = {
  shiftStart: "09:00",
  shiftEnd: "18:00",
  graceMinutes: 15,
  breakMinutes: 60,
  checkoutGraceMinutes: 10,
};

function getUserShift(user) {
  return { ...DEFAULT_SHIFT, ...(user?.shift || {}) };
}

function shiftDateTime(dateKey, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dateKey + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d;
}

function getShiftBounds(user, dateKey) {
  const s = getUserShift(user);
  const start = shiftDateTime(dateKey, s.shiftStart);
  let end = shiftDateTime(dateKey, s.shiftEnd);
  if (end <= start) end = new Date(end.getTime() + 86400000);
  const lateCutoff = new Date(start.getTime() + s.graceMinutes * 60000);
  const checkoutDeadline = new Date(end.getTime() + s.checkoutGraceMinutes * 60000);
  return { start, end, lateCutoff, checkoutDeadline, ...s };
}

function formatShiftRange(user) {
  const s = getUserShift(user);
  const fmt = t => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  return `${fmt(s.shiftStart)} – ${fmt(s.shiftEnd)}`;
}

function formatDurationMs(ms) {
  if (!ms || ms <= 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function calcTotalBreakMs(record) {
  if (!record) return 0;
  let total = (record.breaks || []).reduce((sum, b) => sum + (new Date(b.end) - new Date(b.start)), 0);
  if (record.breakStart && record.breakEnd) {
    total += new Date(record.breakEnd) - new Date(record.breakStart);
  }
  return total;
}

function calcShortLeaveMs(record) {
  return (record?.shortLeaves || [])
    .filter(sl => !sl.status || sl.status === "approved")
    .reduce((sum, sl) => sum + (new Date(sl.end) - new Date(sl.start)), 0);
}

function calcNetWorkingMs(record) {
  if (!record?.checkIn || !record?.checkOut) return 0;
  let ms = new Date(record.checkOut) - new Date(record.checkIn);
  ms -= calcTotalBreakMs(record);
  ms -= calcShortLeaveMs(record);
  return Math.max(0, ms);
}

function isLateCheckIn(checkInIso, user) {
  if (!checkInIso || !user) return false;
  const bounds = getShiftBounds(user, todayKey(new Date(checkInIso)));
  return new Date(checkInIso) > bounds.lateCutoff;
}

function computeDayStatus(user, record) {
  if (!record?.checkIn) return "Absent";
  const bounds = getShiftBounds(user, record.date);
  const late = isLateCheckIn(record.checkIn, user);
  if (!record.checkOut) return late ? "Late" : "On Time";
  const net = calcNetWorkingMs(record);
  const expectedNet = Math.max(0, bounds.end - bounds.start - getUserShift(user).breakMinutes * 60000);
  if (expectedNet > 0 && net < expectedNet * 0.5) return "Half Day";
  if (late) return "Late";
  return "On Time";
}

function dayStatusPill(status) {
  const map = {
    "On Time": { tone: "green", label: "On Time" },
    Late: { tone: "amber", label: "Late" },
    "Half Day": { tone: "red", label: "Half Day" },
    Absent: { tone: "slate", label: "Absent" },
  };
  return map[status] || { tone: "slate", label: status || "—" };
}

function finalizeRecord(record, user) {
  const dayStatus = computeDayStatus(user, record);
  return {
    ...record,
    dayStatus,
    totalBreakMs: calcTotalBreakMs(record),
    workingMs: calcNetWorkingMs(record),
  };
}

function canCheckIn(now, user, record) {
  if (record?.checkIn && !record?.checkOut) return { ok: false, msg: "You are already checked in." };
  if (record?.checkOut) return { ok: false, msg: "Today's attendance is already complete." };
  const bounds = getShiftBounds(user, todayKey(now));
  if (now < bounds.start) {
    return { ok: false, msg: `Check-in opens at ${formatTime(bounds.start.toISOString())} (shift start).` };
  }
  if (now > bounds.end) {
    return { ok: false, msg: "Your shift has ended. Check-in is only allowed during your assigned shift." };
  }
  return { ok: true };
}

function canCheckOut(now, user, record) {
  if (!record?.checkIn) return { ok: false, msg: "Please check in first." };
  if (record.checkOut) return { ok: false, msg: "You have already checked out." };
  if (record.breakStart && !record.breakEnd) return { ok: false, msg: "End your break before checking out." };
  const bounds = getShiftBounds(user, todayKey(now));
  if (now > bounds.checkoutDeadline) {
    return { ok: false, msg: `Checkout window closed at ${formatTime(bounds.checkoutDeadline.toISOString())}.` };
  }
  return { ok: true };
}

function performCheckIn(attendance, userId, user, now = new Date()) {
  const key = todayKey(now);
  const existing = attendance.find(r => r.userId === userId && r.date === key);
  const gate = canCheckIn(now, user, existing);
  if (!gate.ok) return { attendance, error: gate.msg };
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
  };
  const next = [...attendance.filter(r => !(r.userId === userId && r.date === key)), finalizeRecord(record, user)];
  return { attendance: next, error: null };
}

function performCheckOut(attendance, userId, user, now = new Date()) {
  const key = todayKey(now);
  const existing = attendance.find(r => r.userId === userId && r.date === key);
  const gate = canCheckOut(now, user, existing);
  if (!gate.ok) return { attendance, error: gate.msg };
  const next = attendance.map(r => {
    if (r.userId !== userId || r.date !== key) return r;
    return finalizeRecord({ ...r, checkOut: now.toISOString() }, user);
  });
  return { attendance: next, error: null };
}

function performBreakStart(attendance, userId, user, now = new Date()) {
  const key = todayKey(now);
  const existing = attendance.find(r => r.userId === userId && r.date === key);
  if (!existing?.checkIn || existing.checkOut) return { attendance, error: "Check in before starting a break." };
  if (existing.breakStart && !existing.breakEnd) return { attendance, error: "Break already in progress." };
  const bounds = getShiftBounds(user, key);
  if (now < bounds.start || now > bounds.end) return { attendance, error: "Breaks are only allowed during your shift." };
  const next = attendance.map(r =>
    r.userId === userId && r.date === key ? { ...r, breakStart: now.toISOString(), breakEnd: null } : r
  );
  return { attendance: next, error: null };
}

function performBreakEnd(attendance, userId, user, now = new Date()) {
  const key = todayKey(now);
  const existing = attendance.find(r => r.userId === userId && r.date === key);
  if (!existing?.breakStart || existing.breakEnd) return { attendance, error: "No active break to end." };
  const breaks = [...(existing.breaks || []), { start: existing.breakStart, end: now.toISOString() }];
  const next = attendance.map(r =>
    r.userId === userId && r.date === key
      ? { ...r, breaks, breakStart: null, breakEnd: null, totalBreakMs: calcTotalBreakMs({ ...r, breaks, breakStart: null, breakEnd: null }) }
      : r
  );
  return { attendance: next, error: null };
}

function buildShortLeaveRequest(user, dateKey, fromTime, toTime, reason) {
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

function applyApprovedShortLeave(attendance, users, request) {
  const user = users.find(u => u.id === request.userId);
  if (!user) return attendance;
  const entry = {
    id: request.id,
    start: request.startIso,
    end: request.endIso,
    reason: request.reason,
    status: "approved",
  };
  const key = request.date;
  const existing = attendance.find(r => r.userId === request.userId && r.date === key);
  if (existing) {
    return attendance.map(r =>
      r.userId === request.userId && r.date === key
        ? finalizeRecord({
            ...r,
            shortLeaves: [...(r.shortLeaves || []).filter(sl => sl.id !== entry.id), entry],
          }, user)
        : r
    );
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
  return [...attendance, record];
}

function removeShortLeaveFromAttendance(attendance, users, request) {
  const user = users.find(u => u.id === request.userId);
  if (!user) return attendance;
  return attendance
    .map(r => {
      if (r.userId !== request.userId || r.date !== request.date) return r;
      const shortLeaves = (r.shortLeaves || []).filter(sl => sl.id !== request.id);
      return finalizeRecord({ ...r, shortLeaves }, user);
    })
    .filter(r => !(r.userId === request.userId && r.date === request.date && !r.checkIn && !r.checkOut && !(r.shortLeaves || []).length));
}

function applyAutoCheckouts(attendance, users) {
  const now = new Date();
  const key = todayKey(now);
  let changed = false;
  const next = attendance.map(r => {
    if (r.date !== key || !r.checkIn || r.checkOut) return r;
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

function displayWorkingHours(record, user) {
  if (record?.checkOut && record.workingMs != null) return formatDurationMs(record.workingMs);
  if (record?.checkIn && record?.checkOut) return formatDurationMs(calcNetWorkingMs(record));
  return "—";
}

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(key) {
  if (!key) return "—";
  return new Date(key + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function hoursWorked(checkIn, checkOut) {
  if (!checkIn || !checkOut) return "—";
  const ms = new Date(checkOut) - new Date(checkIn);
  if (ms <= 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function getUserTodayRecord(attendance, userId) {
  const key = todayKey();
  return attendance.find(r => r.userId === userId && r.date === key) || null;
}

function attendanceStatus(record) {
  if (!record || !record.checkIn) return { label: "Not checked in", tone: "slate" };
  if (!record.checkOut) return { label: "Checked in", tone: "green" };
  return { label: "Checked out", tone: "blue" };
}

function weekStart(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function filterAttendanceByPeriod(attendance, period, anchor = new Date()) {
  const key = todayKey(anchor);
  if (period === "daily") return attendance.filter(r => r.date === key);
  if (period === "weekly") {
    const start = weekStart(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return attendance.filter(r => {
      const d = new Date(r.date + "T12:00:00");
      return d >= start && d <= end;
    });
  }
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  return attendance.filter(r => {
    const d = new Date(r.date + "T12:00:00");
    return d.getFullYear() === y && d.getMonth() === m;
  });
}

function findUserByCredentials(users, email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();
  return users.find(u =>
    u.email.trim().toLowerCase() === normalizedEmail &&
    (u.password === normalizedPassword || u.tempPassword === normalizedPassword)
  );
}

function genId()     { return "u-" + Math.random().toString(36).slice(2, 9); }
function genTempPw() {
  const c = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!";
  return Array.from({ length: 10 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

const SENSITIVE_ENC_KEY = "adforce-hr-sensitive-v1";

function normalizeCnic(v) {
  return String(v || "").replace(/\D/g, "");
}

function formatCnic(digits) {
  const d = normalizeCnic(digits);
  if (d.length !== 13) return digits || "";
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

function formatCnicInput(v) {
  const d = normalizeCnic(v).slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

function isValidCnic(v) {
  return /^\d{13}$/.test(normalizeCnic(v));
}

function encryptSensitive(plain) {
  if (!plain) return "";
  const te = new TextEncoder();
  const bytes = te.encode(plain);
  const key = te.encode(SENSITIVE_ENC_KEY);
  const out = bytes.map((b, i) => b ^ key[i % key.length]);
  return "enc:" + btoa(String.fromCharCode(...out));
}

function decryptSensitive(enc) {
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

function getUserCnic(user) {
  return formatCnic(decryptSensitive(user?.cnicEnc));
}

function cnicDigitsForUser(user) {
  return normalizeCnic(decryptSensitive(user?.cnicEnc));
}

/* ─── ADFORCE LOGO ─── */
const LOGO_SRC = "/adforce-logo.png";

/**
 * Portrait-friendly logo — use `boxWidth` + `boxHeight` for hero areas, or `height` for compact headers.
 */
function AdforceLogo({ height, width, maxHeight, boxWidth, boxHeight, align = "left", className = "" }) {
  const objectPosition = align === "center" ? "center center" : "left center";
  const imgStyle = {
    background: "transparent",
    objectFit: "contain",
    objectPosition,
    display: "block",
    maxWidth: "100%",
    maxHeight: "100%",
    width: "auto",
    height: "auto",
  };

  if (boxWidth != null && boxHeight != null) {
    return (
      <div
        className={className}
        style={{
          width: boxWidth,
          height: boxHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: align === "center" ? "center" : "flex-start",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <img src={LOGO_SRC} alt="Adforce Solutions" style={imgStyle} draggable={false} className="select-none" />
      </div>
    );
  }

  const style = { ...imgStyle, flexShrink: 0 };
  if (width != null) {
    style.width = width;
    if (maxHeight != null) style.maxHeight = maxHeight;
  } else {
    style.height = height ?? 40;
    if (maxHeight != null) style.maxHeight = maxHeight;
  }

  return (
    <img
      src={LOGO_SRC}
      alt="Adforce Solutions"
      className={`select-none ${className}`}
      style={style}
      draggable={false}
    />
  );
}

/* ─── PRIMITIVES ─── */
function Pill({ tone = "slate", children }) {
  const map = {
    red:   "bg-red-100 text-red-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    dark:  "bg-slate-800 text-white",
    slate: "bg-slate-100 text-slate-600",
    blue:  "bg-blue-100 text-blue-700",
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[tone]||map.slate}`}>{children}</span>;
}

function Avatar({ name = "?", size = 8 }) {
  const ini = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{ width: size * 4, height: size * 4, background: B.dark, color: B.white }}
      className="rounded-full flex items-center justify-center text-xs font-bold shrink-0 select-none">
      {ini}
    </div>
  );
}

function Card({ children, className = "" }) {
  return <div className={`bg-white border border-slate-200 rounded-xl ${className}`}>{children}</div>;
}

function STitle({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold" style={{ color: B.dark }}>{children}</h3>
      {right}
    </div>
  );
}

function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto z-10`}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold" style={{ color: B.dark }}>{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-slate-600 mb-1">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
    </div>
  );
}

function TextInput({ label, type = "text", value, onChange, placeholder, required, Icon, disabled, onKeyDown }) {
  return (
    <Field label={label} required={required}>
      <div className="relative">
        {Icon && <Icon size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />}
        <input
          type={type}
          value={value}
          onChange={e => onChange && onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onKeyDown={onKeyDown}
          autoComplete="off"
          className={`w-full ${Icon ? "pl-8" : "pl-3"} pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900 disabled:bg-slate-50 disabled:text-slate-400`}
        />
      </div>
    </Field>
  );
}

function SelectInput({ label, value, onChange, options, required }) {
  return (
    <Field label={label} required={required}>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

function PwInput({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <Lock size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || "••••••••"}
          autoComplete="new-password"
          className="w-full pl-8 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900"
        />
        <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </Field>
  );
}

function PwStrength({ pw }) {
  if (!pw) return null;
  const checks = [
    { label: "8+ chars",  ok: pw.length >= 8 },
    { label: "Uppercase", ok: /[A-Z]/.test(pw) },
    { label: "Number",    ok: /\d/.test(pw) },
  ];
  return (
    <div className="flex gap-1 mt-1.5">
      {checks.map(c => (
        <span key={c.label} className={`text-xs px-2 py-0.5 rounded-full ${c.ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{c.label}</span>
      ))}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", size = "md", disabled = false, className = "" }) {
  const sz = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const styles = {
    primary: { background: B.dark,   color: B.white, border: "none" },
    danger:  { background: "#dc2626",color: B.white, border: "none" },
    ghost:   { background: "transparent", color: B.dark, border: "1px solid #cbd5e1" },
    accent:  { background: B.red,    color: B.white, border: "none" },
  };
  const s = styles[variant] || styles.primary;
  return (
    <button onClick={onClick} disabled={disabled}
      style={disabled ? { ...s, opacity: 0.4, cursor: "not-allowed" } : s}
      className={`inline-flex items-center gap-1.5 font-medium rounded-lg transition-opacity ${sz} ${className}`}>
      {children}
    </button>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="p-3 rounded-lg flex gap-2 text-sm" style={{ background: B.redLight, border: `1px solid ${B.redBorder}`, color: B.red }}>
      <AlertCircle size={16} className="shrink-0 mt-0.5" />{msg}
    </div>
  );
}

function OkBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="p-3 rounded-lg flex gap-2 text-sm bg-emerald-50 border border-emerald-200 text-emerald-700">
      <Check size={16} className="shrink-0 mt-0.5" />{msg}
    </div>
  );
}

/* ─── FORCE PASSWORD CHANGE ─── */
function ForcePasswordChange({ onDone }) {
  const [pw, setPw]     = useState("");
  const [conf, setConf] = useState("");
  const [err, setErr]   = useState("");

  function save() {
    setErr("");
    if (pw.length < 8)         { setErr("Password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(pw))     { setErr("Password must contain at least one uppercase letter."); return; }
    if (!/\d/.test(pw))        { setErr("Password must contain at least one number."); return; }
    if (pw !== conf)            { setErr("Passwords do not match."); return; }
    onDone(pw);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: B.dark }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: B.red }}>
            <KeyRound size={20} color="white" />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: B.dark }}>Set your password</h2>
            <p className="text-xs text-slate-500">First login — please create a new password</p>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-6 mt-3">
          You were logged in with a temporary password. Set your permanent password to continue.
        </p>
        <div className="space-y-4">
          <div>
            <PwInput label="New password" value={pw} onChange={setPw} />
            <PwStrength pw={pw} />
          </div>
          <PwInput label="Confirm password" value={conf} onChange={setConf} />
          <ErrBox msg={err} />
          <Btn onClick={save} className="w-full justify-center"><Save size={14} />Save password</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── LOGIN ─── */
function LoginPage({ users, onLogin }) {
  const [email,   setEmail]   = useState("");
  const [pw,      setPw]      = useState("");
  const [show,    setShow]    = useState(false);
  const [err,     setErr]     = useState("");
  const [loading, setLoading] = useState(false);

  function handleLogin() {
    setErr(""); setLoading(true);
    setTimeout(() => {
      const u = findUserByCredentials(users, email, pw);
      if (u) {
        if (u.status === "inactive") setErr("This account is inactive. Contact your administrator.");
        else onLogin(u);
      } else if (!email.trim() || !pw.trim()) {
        setErr("Email and password are required.");
      } else {
        setErr("Incorrect email or password.");
      }
      setLoading(false);
    }, 500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: B.dark }}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <AdforceLogo boxWidth={240} boxHeight={96} align="center" />
          <p className="text-sm mt-4" style={{ color: "#7aa8bf" }}>HR Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <h2 className="text-lg font-bold mb-5" style={{ color: B.dark }}>Sign in to your account</h2>
          <ErrBox msg={err} />
          <div className="space-y-4 mt-4">
            <TextInput
              label="Work email" type="email" value={email} onChange={setEmail}
              placeholder="you@adforce.com" required Icon={Mail}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                <input
                  type={show ? "text" : "password"}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-8 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-2.5 text-slate-400">
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <button
              onClick={handleLogin} disabled={loading}
              className="w-full py-2.5 text-sm font-bold rounded-lg text-white flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: B.dark }}>
              {loading
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Signing in...</>
                : "Sign in"}
            </button>
          </div>
          <p className="text-xs text-slate-400 text-center mt-5">
            Forgot your password? Contact your HR administrator.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── SETTINGS ─── */
function SettingsPage({ currentUser, users, setUsers, onLogout, company, setCompany, roles }) {
  const [tab,   setTab]   = useState("profile");
  const [saved, setSaved] = useState(false);
  const [prof,  setProf]  = useState({
    name:  currentUser.name,
    email: currentUser.email,
    phone: currentUser.phone  || "",
    title: currentUser.title  || "",
    dept:  currentUser.dept   || "",
  });
  const [pw,    setPw]    = useState({ curr: "", newp: "", conf: "" });
  const [pwErr, setPwErr] = useState("");
  const [pwOk,  setPwOk]  = useState(false);
  const [notifs, setNotifs] = useState({ leave: true, payroll: true, ann: true, att: false, weekly: true });

  const canManageCompany = can(currentUser.role, "manage_company_settings", roles);

  function saveProfile() {
    setUsers(us => us.map(u => u.id === currentUser.id ? { ...u, ...prof } : u));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  function changePw() {
    setPwErr(""); setPwOk(false);
    if (currentUser.password !== pw.curr)  { setPwErr("Current password is incorrect."); return; }
    if (pw.newp.length < 8)                { setPwErr("Password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(pw.newp))            { setPwErr("Password must include an uppercase letter."); return; }
    if (!/\d/.test(pw.newp))               { setPwErr("Password must include a number."); return; }
    if (pw.newp !== pw.conf)               { setPwErr("Passwords do not match."); return; }
    setUsers(us => us.map(u => u.id === currentUser.id ? { ...u, password: pw.newp } : u));
    setPwOk(true); setPw({ curr: "", newp: "", conf: "" });
  }

  const tabs = [
    { id: "profile",  label: "Profile",       icon: User    },
    { id: "password", label: "Password",       icon: Key     },
    { id: "notifs",   label: "Notifications",  icon: Bell    },
    ...(canManageCompany ? [{ id: "company", label: "Company", icon: Building }] : []),
    { id: "security", label: "Security",       icon: Shield  },
  ];

  return (
    <div className="flex gap-5 flex-col lg:flex-row">
      <div className="lg:w-44 shrink-0">
        <Card className="overflow-hidden">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left border-b border-slate-100 last:border-0 transition-colors"
              style={tab === t.id ? { background: B.darkLight, color: B.dark, fontWeight: 600 } : { color: B.dark }}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
          <button onClick={onLogout} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm border-t border-slate-200 text-red-600 hover:bg-red-50">
            <LogOut size={14} />Sign out
          </button>
        </Card>
      </div>

      <div className="flex-1 min-w-0">
        {tab === "profile" && (
          <Card className="p-5">
            <STitle>Profile settings</STitle>
            <div className="flex items-center gap-4 mb-5 p-4 rounded-xl" style={{ background: B.darkLight }}>
              <Avatar name={prof.name} size={14} />
              <div>
                <div className="text-base font-semibold" style={{ color: B.dark }}>{prof.name}</div>
                <div className="text-sm text-slate-500">{currentUser.role} · {prof.dept}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput label="Full name"   value={prof.name}  onChange={v => setProf({ ...prof, name: v })}  required Icon={User} />
              <TextInput label="Work email"  type="email" value={prof.email} onChange={v => setProf({ ...prof, email: v })} required Icon={Mail} />
              <TextInput label="Phone"       value={prof.phone} onChange={v => setProf({ ...prof, phone: v })} Icon={Phone} />
              <TextInput label="Job title"   value={prof.title} onChange={v => setProf({ ...prof, title: v })} />
              <TextInput label="Department"  value={prof.dept}  onChange={v => setProf({ ...prof, dept: v })} />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Btn onClick={saveProfile}><Save size={14} />Save changes</Btn>
              {saved && <span className="text-sm text-emerald-600 flex items-center gap-1"><Check size={14} />Saved!</span>}
            </div>
          </Card>
        )}

        {tab === "password" && (
          <Card className="p-5">
            <STitle>Change password</STitle>
            <div className="max-w-sm space-y-4">
              <PwInput label="Current password"  value={pw.curr} onChange={v => setPw({ ...pw, curr: v })} />
              <div>
                <PwInput label="New password" value={pw.newp} onChange={v => setPw({ ...pw, newp: v })} />
                <PwStrength pw={pw.newp} />
              </div>
              <PwInput label="Confirm new password" value={pw.conf} onChange={v => setPw({ ...pw, conf: v })} />
              <ErrBox msg={pwErr} />
              <OkBox  msg={pwOk ? "Password changed successfully." : ""} />
              <Btn onClick={changePw}><Key size={14} />Change password</Btn>
            </div>
          </Card>
        )}

        {tab === "notifs" && (
          <Card className="p-5">
            <STitle>Notification preferences</STitle>
            <div className="space-y-3">
              {[
                { k: "leave",   l: "Leave approvals",   s: "When a leave request is approved or rejected" },
                { k: "payroll", l: "Payroll reminders",  s: "2 days before payroll is due" },
                { k: "ann",     l: "Announcements",      s: "New company-wide posts" },
                { k: "att",     l: "Attendance alerts",  s: "Late clock-in or anomaly detected" },
                { k: "weekly",  l: "Weekly digest",      s: "Summary email every Monday" },
              ].map(n => (
                <div key={n.k} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{n.l}</div>
                    <div className="text-xs text-slate-500">{n.s}</div>
                  </div>
                  <button onClick={() => setNotifs(p => ({ ...p, [n.k]: !p[n.k] }))} style={{ color: notifs[n.k] ? B.dark : "#cbd5e1" }}>
                    {notifs[n.k] ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === "company" && canManageCompany && (
          <Card className="p-5">
            <STitle>Company settings</STitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput label="Company name" value="Adforce Solutions" onChange={() => {}} Icon={Building} />
              <SelectInput label="Currency" value={company.currency} onChange={v => setCompany(c => ({ ...c, currency: v }))} options={[{ value: "PKR", label: "PKR — Pakistani Rupee" }, { value: "USD", label: "USD" }, { value: "AED", label: "AED" }]} />
              <TextInput label="Office start time" type="time" value={company.officeStart} onChange={v => setCompany(c => ({ ...c, officeStart: v }))} />
              <TextInput label="Late grace period (minutes)" type="number" value={String(company.graceMinutes)} onChange={v => setCompany(c => ({ ...c, graceMinutes: parseInt(v) || 0 }))} />
            </div>
            <div className="mt-3 p-3 rounded-lg text-xs bg-amber-50 border border-amber-200 text-amber-800">
              Check-ins after {company.officeStart} + {company.graceMinutes} min grace are marked <b>Late</b> in attendance and payroll.
            </div>
            <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: B.darkLight, color: B.dark }}>
              Plan: <b>Business</b> · {users.length} employee{users.length !== 1 ? "s" : ""} · Next billing Jul 1
            </div>
            <Btn className="mt-4"><Save size={14} />Save</Btn>
          </Card>
        )}

        {tab === "security" && (
          <Card className="p-5">
            <STitle>Security</STitle>
            <div className="space-y-3 mb-5">
              {[
                { l: "Two-factor authentication", s: "TOTP app or SMS verification", on: false },
                { l: "Session timeout (30 min)",  s: "Auto sign-out on inactivity",   on: true  },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
                  <div><div className="text-sm font-medium text-slate-800">{s.l}</div><div className="text-xs text-slate-500">{s.s}</div></div>
                  {s.on ? <Pill tone="green"><Check size={12} />Active</Pill> : <Pill tone="slate">Off</Pill>}
                </div>
              ))}
            </div>
            <STitle>Recent activity</STitle>
            <div className="space-y-2">
              {[
                { a: "Sign in",          d: "Chrome · Lahore, PK", t: "Just now",   ok: true  },
                { a: "Password changed", d: "Chrome",              t: "Today",       ok: true  },
              ].map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg text-sm border border-slate-100">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${a.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="font-medium text-slate-800 flex-1">{a.a}</span>
                  <span className="text-slate-400 text-xs hidden sm:inline">{a.d}</span>
                  <span className="text-slate-400 text-xs">{a.t}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ─── PEOPLE (admin) ─── */
function EmployeeForm({ form, setForm, ferr, lockRole = false }) {
  return (
    <div className="space-y-3">
      <ErrBox msg={ferr} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Full name"  value={form.name}   onChange={v => setForm({ ...form, name: v })}   required Icon={User} />
        <TextInput label="Work email" type="email" value={form.email}  onChange={v => setForm({ ...form, email: v })}  required Icon={Mail} />
        <TextInput label="Phone"      value={form.phone}  onChange={v => setForm({ ...form, phone: v })}  Icon={Phone} />
        <TextInput label="CNIC" value={form.cnic || ""} onChange={v => setForm({ ...form, cnic: formatCnicInput(v) })} required Icon={Shield} placeholder="12345-1234567-1" />
        <TextInput label="Job title"  value={form.title}  onChange={v => setForm({ ...form, title: v })} />
        <TextInput label="Department" value={form.dept}   onChange={v => setForm({ ...form, dept: v })}  placeholder="e.g. Sales" />
        <TextInput label="Team"       value={form.team}   onChange={v => setForm({ ...form, team: v })}  placeholder="e.g. North" />
        {lockRole ? (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
            <div className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700">HR Admin</div>
          </div>
        ) : (
          <SelectInput label="Role" value={form.role} onChange={v => setForm({ ...form, role: v })}
            options={[{ value: "Employee", label: "Employee" }, { value: "Manager", label: "Manager" }]} />
        )}
        <SelectInput label="Employment type" value={form.type} onChange={v => setForm({ ...form, type: v })}
          options={[{ value: "Full-time", label: "Full-time" }, { value: "Part-time", label: "Part-time" }, { value: "Contractor", label: "Contractor" }]} />
        <TextInput label="Hire date" type="date" value={form.hired} onChange={v => setForm({ ...form, hired: v })} />
        <TextInput label="Salary"    value={form.salary}  onChange={v => setForm({ ...form, salary: v })}  placeholder="e.g. 80,000 PKR" />
        <SelectInput label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })}
          options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive (blocked)" }]} />
        <SelectInput label="Marital status" value={form.maritalStatus || ""} onChange={v => setForm({ ...form, maritalStatus: v })}
          options={[{ value: "", label: "Select…" }, { value: "Married", label: "Married" }, { value: "Unmarried", label: "Unmarried" }]} />
      </div>
      <div className="pt-2 border-t border-slate-100">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Phone size={13} />Emergency contact
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Guardian name" value={form.guardianName || ""} onChange={v => setForm({ ...form, guardianName: v })} placeholder="e.g. Father / Mother" />
          <TextInput label="Emergency contact name" value={form.emergencyContactName || ""} onChange={v => setForm({ ...form, emergencyContactName: v })} Icon={User} />
          <TextInput label="Emergency contact number" value={form.emergencyContactPhone || ""} onChange={v => setForm({ ...form, emergencyContactPhone: v })} Icon={Phone} placeholder="+92-300-0000000" />
          <TextInput label="Relationship with emergency contact" value={form.emergencyContactRelation || ""} onChange={v => setForm({ ...form, emergencyContactRelation: v })} placeholder="e.g. Spouse, Parent, Sibling" />
        </div>
      </div>
      <div className="pt-2 border-t border-slate-100">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Clock size={13} />Official duty schedule
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Shift start" type="time" value={form.shiftStart || "09:00"} onChange={v => setForm({ ...form, shiftStart: v })} />
          <TextInput label="Shift end" type="time" value={form.shiftEnd || "18:00"} onChange={v => setForm({ ...form, shiftEnd: v })} />
          <TextInput label="Late grace (minutes)" type="number" value={String(form.graceMinutes ?? 15)} onChange={v => setForm({ ...form, graceMinutes: parseInt(v) || 0 })} />
          <TextInput label="Break duration (minutes)" type="number" value={String(form.breakMinutes ?? 60)} onChange={v => setForm({ ...form, breakMinutes: parseInt(v) || 0 })} />
          <TextInput label="Checkout grace (minutes)" type="number" value={String(form.checkoutGraceMinutes ?? 10)} onChange={v => setForm({ ...form, checkoutGraceMinutes: parseInt(v) || 0 })} />
        </div>
        <p className="text-xs text-slate-400 mt-2">Example: 13:00–22:00 with 60 min break = 9 hr shift. Auto checkout occurs {form.checkoutGraceMinutes ?? 10} min after shift end.</p>
      </div>
      <div className="pt-2 border-t border-slate-100">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Landmark size={13} />Bank details
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Bank name"      value={form.bankName    || ""} onChange={v => setForm({ ...form, bankName: v })}     placeholder="e.g. HBL" />
          <TextInput label="Branch"         value={form.bankBranch  || ""} onChange={v => setForm({ ...form, bankBranch: v })}   placeholder="e.g. Gulberg" />
          <TextInput label="Account number" value={form.bankAccount || ""} onChange={v => setForm({ ...form, bankAccount: v })}  placeholder="e.g. 1234567890" />
          <TextInput label="IBAN"           value={form.bankIban    || ""} onChange={v => setForm({ ...form, bankIban: v })}     placeholder="PK00XXXX..." />
        </div>
      </div>
    </div>
  );
}

function PeoplePage({
  users, setUsers, currentUser, attendance, setAttendance,
  payroll = [], setPayroll, leaveRequests = [], setLeaveRequests,
  shortLeaveRequests = [], setShortLeaveRequests, roles,
}) {
  const canManage = can(currentUser.role, "manage_employees", roles);
  const readOnly = !canManage;
  const [q,         setQ]         = useState("");
  const [sel,       setSel]       = useState(null);
  const [selTab,    setSelTab]    = useState("Overview");
  const [addOpen,   setAddOpen]   = useState(false);
  const [editOpen,  setEditOpen]  = useState(false);
  const [delOpen,   setDelOpen]   = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [editTgt,   setEditTgt]   = useState(null);
  const [delTgt,    setDelTgt]    = useState(null);
  const [resetTgt,  setResetTgt]  = useState(null);
  const [resetResult, setResetResult] = useState("");
  const [newEmail,  setNewEmail]  = useState("");
  const [ferr,      setFerr]      = useState("");

  const blank = {
    name: "", email: "", phone: "", title: "", dept: "", team: "", type: "Full-time", hired: "", salary: "",
    status: "active", role: "Employee", bankName: "", bankBranch: "", bankAccount: "", bankIban: "",
    guardianName: "", maritalStatus: "", emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelation: "", cnic: "",
    shiftStart: "09:00", shiftEnd: "18:00", graceMinutes: 15, breakMinutes: 60, checkoutGraceMinutes: 10,
  };
  const [form, setForm] = useState(blank);

  const roster = peopleRoster(users, currentUser.role);
  const list = sortHrAdminFirst(roster.filter(u =>
    (u.name + u.email + u.dept + u.role).toLowerCase().includes(q.toLowerCase())
  ));

  function openAdd()    { setForm(blank); setFerr(""); setAddOpen(true); }
  function openEdit(u) {
    const s = getUserShift(u);
    setEditTgt(u);
    setForm({ ...u, cnic: getUserCnic(u), shiftStart: s.shiftStart, shiftEnd: s.shiftEnd, graceMinutes: s.graceMinutes, breakMinutes: s.breakMinutes, checkoutGraceMinutes: s.checkoutGraceMinutes });
    setFerr("");
    setEditOpen(true);
  }
  function openDel(u)   { setDelTgt(u);  setDelOpen(true); }
  function openReset(u) { setResetTgt(u); setResetResult(""); setNewEmail(""); setResetOpen(true); }

  function saveAdd() {
    const email = form.email.trim();
    if (!form.name.trim() || !email) { setFerr("Full name and work email are required."); return; }
    if (!isValidCnic(form.cnic)) { setFerr("A valid 13-digit CNIC is required (format: XXXXX-XXXXXXX-X)."); return; }
    const cnicDigits = normalizeCnic(form.cnic);
    if (users.find(u => cnicDigitsForUser(u) === cnicDigits)) { setFerr("This CNIC is already registered to another employee."); return; }
    if (users.find(u => u.email.trim().toLowerCase() === email.toLowerCase())) { setFerr("This email already exists."); return; }
    const tempPw  = genTempPw();
    const { shiftStart, shiftEnd, graceMinutes, breakMinutes, checkoutGraceMinutes, cnic, ...rest } = form;
    const newUser = {
      ...rest, name: form.name.trim(), email, cnicEnc: encryptSensitive(cnicDigits),
      shift: { shiftStart, shiftEnd, graceMinutes, breakMinutes, checkoutGraceMinutes },
      id: genId(), password: tempPw, leaveBalance: 15, sickBalance: 8, skills: [], firstLogin: true, tempPassword: tempPw,
    };
    setUsers(p => [...p, newUser]);
    setFerr("");
    alert(`Employee added!\n\nEmail: ${email}\nTemporary Password: ${tempPw}\n\nShare these credentials with the employee. They must change their password on first login.`);
    setAddOpen(false);
  }

  function saveEdit() {
    if (!canEditPerson(currentUser, editTgt, roles)) { setFerr("You do not have permission to edit this account."); return; }
    if (!form.name || !form.email) { setFerr("Full name and work email are required."); return; }
    if (!isValidCnic(form.cnic)) { setFerr("A valid 13-digit CNIC is required (format: XXXXX-XXXXXXX-X)."); return; }
    const cnicDigits = normalizeCnic(form.cnic);
    if (users.find(u => cnicDigitsForUser(u) === cnicDigits && u.id !== editTgt.id)) { setFerr("This CNIC is already registered to another employee."); return; }
    if (users.find(u => u.email.toLowerCase() === form.email.toLowerCase() && u.id !== editTgt.id)) { setFerr("This email is already used by another account."); return; }
    const { shiftStart, shiftEnd, graceMinutes, breakMinutes, checkoutGraceMinutes, password, tempPassword, cnic, ...rest } = form;
    const updated = {
      ...rest,
      role: isHrAdminRole(editTgt.role) ? "HR Admin" : rest.role,
      cnicEnc: encryptSensitive(cnicDigits),
      shift: { shiftStart: shiftStart || "09:00", shiftEnd: shiftEnd || "18:00", graceMinutes: graceMinutes ?? 15, breakMinutes: breakMinutes ?? 60, checkoutGraceMinutes: checkoutGraceMinutes ?? 10 },
    };
    setUsers(p => p.map(u => u.id === editTgt.id ? { ...u, ...updated } : u));
    if (sel?.id === editTgt.id) setSel(s => ({ ...s, ...updated }));
    setEditOpen(false);
  }

  function confirmDel() {
    if (!canDeletePerson(currentUser, delTgt, roles)) return;
    setUsers(p => p.filter(u => u.id !== delTgt.id));
    if (sel?.id === delTgt.id) setSel(null);
    setDelOpen(false);
  }

  function doPasswordReset() {
    if (!canResetPersonCredentials(currentUser, resetTgt, roles)) return;
    const tempPw = genTempPw();
    setUsers(p => p.map(u => u.id === resetTgt.id ? { ...u, password: tempPw, firstLogin: true, tempPassword: tempPw } : u));
    setResetResult(`New temporary password: ${tempPw}\n\nShare this with the employee. They must change it on next login.`);
  }

  function doEmailChange() {
    if (!canResetPersonCredentials(currentUser, resetTgt, roles)) return;
    if (!newEmail) return;
    if (users.find(u => u.email.toLowerCase() === newEmail.toLowerCase() && u.id !== resetTgt.id)) {
      setResetResult("Error: This email is already in use."); return;
    }
    setUsers(p => p.map(u => u.id === resetTgt.id ? { ...u, email: newEmail } : u));
    setResetResult(`Email updated to: ${newEmail}`);
    setNewEmail("");
  }

  function managingSel() {
    return sel && canManageHrAdmin(currentUser, sel, roles);
  }

  function updateSelBalances(leaveBalance, sickBalance) {
    if (!managingSel()) return;
    setUsers(us => us.map(u => u.id === sel.id ? { ...u, leaveBalance, sickBalance } : u));
    setSel(s => ({ ...s, leaveBalance, sickBalance }));
  }

  function deleteAttendanceRecord(recordId) {
    if (!managingSel() || !setAttendance) return;
    if (!window.confirm("Delete this attendance record?")) return;
    setAttendance(a => a.filter(r => r.id !== recordId));
  }

  function deleteLeaveRecord(id) {
    if (!managingSel() || !setLeaveRequests) return;
    const req = leaveRequests.find(r => r.id === id);
    if (!req) return;
    if (!window.confirm(`Delete this leave request?`)) return;
    if (req.status === "approved") {
      const type = req.type;
      setUsers(us => us.map(u => {
        if (u.id !== sel.id) return u;
        if (type === "Sick") return { ...u, sickBalance: (u.sickBalance ?? 8) + req.days };
        return { ...u, leaveBalance: (u.leaveBalance ?? 15) + req.days };
      }));
      setSel(s => ({
        ...s,
        sickBalance: type === "Sick" ? (s.sickBalance ?? 8) + req.days : s.sickBalance,
        leaveBalance: type !== "Sick" ? (s.leaveBalance ?? 15) + req.days : s.leaveBalance,
      }));
    }
    setLeaveRequests(p => p.filter(r => r.id !== id));
  }

  function deleteShortLeaveRecord(id) {
    if (!managingSel() || !setShortLeaveRequests) return;
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req) return;
    if (!window.confirm(`Delete this short leave record?`)) return;
    if (req.status === "approved" && setAttendance) {
      setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    }
    setShortLeaveRequests(rs => rs.filter(r => r.id !== id));
  }

  function deletePayrollSlip(id) {
    if (!managingSel() || !setPayroll) return;
    if (!window.confirm("Delete this salary slip?")) return;
    setPayroll(p => p.filter(s => s.id !== id));
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employees…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        {canManage && <Btn onClick={openAdd}><UserPlus size={14} />Add employee</Btn>}
      </div>

      {readOnly && (
        <div className="mb-4 p-4 rounded-xl text-sm flex gap-3 items-start" style={{ background: B.darkLight, color: B.dark, border: `1px solid ${B.darkBorder}` }}>
          <Eye size={16} className="mt-0.5 shrink-0" />
          <div><b>View only</b> for employees. Executives have full management access over HR Admin accounts — profile, shift, credentials, attendance, leave, and payroll records.</div>
        </div>
      )}

      {canManage && roster.length === 0 && (
        <div className="mb-4 p-4 rounded-xl text-sm flex gap-3 items-start" style={{ background: B.darkLight, color: B.dark, border: `1px solid ${B.darkBorder}` }}>
          <Users size={16} className="mt-0.5 shrink-0" />
          <div>
            <b>No employees yet.</b> Click "Add employee" to get started. Each employee receives a unique email and temporary password — they must change it on first login.
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2.5 font-medium">Employee</th>
              <th className="px-4 py-2.5 font-medium hidden md:table-cell">Role</th>
              <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Shift</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Today</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map(u => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <button onClick={() => { setSel(u); setSelTab("Overview"); }} className="flex items-center gap-3 text-left">
                    <Avatar name={u.name} />
                    <div>
                      <div className="font-medium text-slate-800">{u.name}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </div>
                  </button>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <Pill tone={u.role === "HR Admin" ? "dark" : "slate"}>{u.role}</Pill>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-slate-500 text-xs tabular-nums">{formatShiftRange(u)}</td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {(() => {
                    const r = getUserTodayRecord(attendance, u.id);
                    const ds = dayStatusPill(r ? (r.dayStatus || computeDayStatus(u, r)) : "Absent");
                    return <Pill tone={ds.tone}>{ds.label}</Pill>;
                  })()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    {canManage && isStaffRole(u.role) && (
                      <>
                        <button onClick={() => openReset(u)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600" title="Reset credentials"><RefreshCw size={14} /></button>
                        <button onClick={() => openEdit(u)}  className="p-1.5 rounded-lg hover:bg-blue-50  text-slate-400 hover:text-blue-600"  title="Edit"><Edit2 size={14} /></button>
                        {u.id !== currentUser.id && (
                          <button onClick={() => openDel(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
                        )}
                      </>
                    )}
                    {canManageHrAdmin(currentUser, u, roles) && (
                      <>
                        <button onClick={() => openReset(u)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600" title="Reset credentials"><RefreshCw size={14} /></button>
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Edit HR Admin"><Edit2 size={14} /></button>
                        <button onClick={() => openDel(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Remove HR Admin"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No employees found.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Add */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add new employee" wide>
        <EmployeeForm form={form} setForm={setForm} ferr={ferr} />
        <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: B.darkLight, color: B.dark }}>
          A temporary password will be generated and shown after adding. Share it with the employee — they must change it on first login.
        </div>
        <div className="flex gap-2 mt-4">
          <Btn onClick={saveAdd}><UserPlus size={14} />Add employee</Btn>
          <Btn variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      {/* Edit */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={isHrAdminRole(editTgt?.role) ? "Edit HR Admin" : "Edit employee"} wide>
        <EmployeeForm form={form} setForm={setForm} ferr={ferr} lockRole={isHrAdminRole(editTgt?.role)} />
        <div className="flex gap-2 mt-4">
          <Btn onClick={saveEdit}><Save size={14} />Save changes</Btn>
          <Btn variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      {/* Delete */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title={isHrAdminRole(delTgt?.role) ? "Remove HR Admin" : "Delete employee"}>
        <div className="flex gap-3 items-start p-3 rounded-lg border mb-4" style={{ background: B.redLight, borderColor: B.redBorder }}>
          <AlertTriangle size={18} style={{ color: B.red }} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium" style={{ color: B.red }}>Permanently remove {delTgt?.name}?</p>
            <p className="text-xs text-red-600 mt-1">This cannot be undone. The account and associated profile data will be removed from the system.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Btn variant="danger" onClick={confirmDel}><Trash2 size={14} />Delete</Btn>
          <Btn variant="ghost"  onClick={() => setDelOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      {/* Reset credentials */}
      <Modal open={resetOpen} onClose={() => { setResetOpen(false); setNewEmail(""); setResetResult(""); }} title={`Reset credentials — ${resetTgt?.name}`}>
        <div className="space-y-5">
          <div className="p-3 rounded-lg text-sm" style={{ background: B.darkLight, color: B.dark }}>
            Reset this employee's <b>password</b> or update their <b>email address</b>.
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-1">Reset password</h4>
            <p className="text-xs text-slate-500 mb-3">Generates a new temporary password. The employee must change it on next login.</p>
            <Btn onClick={doPasswordReset}><RefreshCw size={14} />Generate new temporary password</Btn>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Change email address</h4>
            <div className="flex gap-2">
              <div className="flex-1">
                <TextInput value={newEmail} onChange={setNewEmail} placeholder="new@adforce.com" Icon={Mail} />
              </div>
              <Btn onClick={doEmailChange} size="sm"><Save size={13} /></Btn>
            </div>
          </div>

          {resetResult && (
            <div className={`p-3 rounded-lg text-sm whitespace-pre-wrap font-mono ${resetResult.startsWith("Error") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>
              {resetResult}
            </div>
          )}
        </div>
      </Modal>

      {/* Profile slide-over */}
      {sel && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setSel(null)} />
          <div className="absolute inset-y-0 right-0 w-full sm:w-[480px] bg-white shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={sel.name} size={12} />
                  <div>
                    <div className="text-lg font-semibold" style={{ color: B.dark }}>{sel.name}</div>
                    <div className="text-sm text-slate-500">{sel.title || sel.role} · {sel.dept}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {canEditPerson(currentUser, sel, roles) && (
                    <button onClick={() => openEdit(sel)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400" title="Edit"><Edit2 size={15} /></button>
                  )}
                  {canResetPersonCredentials(currentUser, sel, roles) && (
                    <button onClick={() => openReset(sel)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400" title="Reset credentials"><RefreshCw size={15} /></button>
                  )}
                  {canDeletePerson(currentUser, sel, roles) && (
                    <button onClick={() => openDel(sel)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Remove"><Trash2 size={15} /></button>
                  )}
                  <button onClick={() => setSel(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
                </div>
              </div>
              <div className="flex gap-1 mt-4 border-b border-slate-100 -mb-5 flex-wrap">
                {["Overview", "Personal", "Shift", "Bank", "Access", "Leave", ...(readOnly ? ["Salary", "Attendance"] : [])].map(t => (
                  <button key={t} onClick={() => setSelTab(t)}
                    className="px-3 py-2 text-sm border-b-2 -mb-px"
                    style={selTab === t ? { borderColor: B.dark, color: B.dark, fontWeight: 600 } : { borderColor: "transparent", color: "#64748b" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-sm">
              {selTab === "Overview" && (
                <div className="space-y-3">
                  {[["Email", sel.email], ["Phone", sel.phone || "—"], ["CNIC", getUserCnic(sel) || "—"], ["Marital status", sel.maritalStatus || "—"], ["Role", sel.role], ["Team", sel.team || "—"], ["Type", sel.type], ["Hired", sel.hired || "—"], ["Status", sel.status], ...(readOnly && sel.salary ? [["Salary", sel.salary]] : [])].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-slate-400">{k}</span>
                      <span className="font-medium text-slate-800">{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {selTab === "Personal" && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Emergency contact</div>
                  {[["Guardian name", sel.guardianName || "—"], ["Contact name", sel.emergencyContactName || "—"], ["Contact number", sel.emergencyContactPhone || "—"], ["Relationship", sel.emergencyContactRelation || "—"]].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-slate-50 pb-2 gap-4">
                      <span className="text-slate-400 shrink-0">{k}</span>
                      <span className="font-medium text-slate-800 text-right">{v}</span>
                    </div>
                  ))}
                  {!sel.guardianName && !sel.emergencyContactName && !sel.emergencyContactPhone && (
                    <p className="text-xs text-slate-400 p-3 rounded-lg bg-slate-50">No emergency contact details on file. Edit the employee to add them.</p>
                  )}
                </div>
              )}
              {selTab === "Shift" && (
                <div className="space-y-3">
                  {[["Shift time", formatShiftRange(sel)], ["Late grace", `${getUserShift(sel).graceMinutes} min`], ["Break allowance", `${getUserShift(sel).breakMinutes} min`], ["Checkout grace", `${getUserShift(sel).checkoutGraceMinutes} min after shift end`]].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-slate-50 pb-2 gap-4">
                      <span className="text-slate-400 shrink-0">{k}</span>
                      <span className="font-medium text-slate-800 text-right">{v}</span>
                    </div>
                  ))}
                  {managingSel() && (
                    <Btn size="sm" onClick={() => openEdit(sel)}><Edit2 size={13} />Edit shift & schedule</Btn>
                  )}
                </div>
              )}
              {selTab === "Bank" && (
                <div className="space-y-3">
                  {[["Bank name", sel.bankName || "—"], ["Branch", sel.bankBranch || "—"], ["Account number", sel.bankAccount || "—"], ["IBAN", sel.bankIban || "—"]].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-slate-50 pb-2 gap-4">
                      <span className="text-slate-400 shrink-0">{k}</span>
                      <span className="font-medium text-slate-800 text-right break-all">{v}</span>
                    </div>
                  ))}
                  {!sel.bankName && !sel.bankAccount && (
                    <p className="text-xs text-slate-400 p-3 rounded-lg bg-slate-50">No bank details on file. Edit the employee to add them.</p>
                  )}
                </div>
              )}
              {selTab === "Access" && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg" style={{ background: B.darkLight }}>
                    <div className="text-xs font-medium mb-1" style={{ color: B.dark }}>Role</div>
                    <Pill tone={sel.role === "HR Admin" ? "dark" : "slate"}>{sel.role}</Pill>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-400">First login pending</span>
                    <span className="font-medium">{sel.firstLogin ? "Yes" : "No"}</span>
                  </div>
                  {sel.firstLogin && sel.tempPassword && (
                    <div className="p-3 rounded-lg text-xs font-mono bg-amber-50 border border-amber-200 text-amber-800">
                      Temp password: {sel.tempPassword}
                    </div>
                  )}
                  {canResetPersonCredentials(currentUser, sel, roles) && (
                    <Btn size="sm" onClick={() => openReset(sel)}><RefreshCw size={13} />Reset credentials</Btn>
                  )}
                </div>
              )}
              {selTab === "Leave" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {managingSel() ? (
                      <div className="grid grid-cols-2 gap-3">
                        <TextInput label="Annual balance (days)" type="number" value={String(sel.leaveBalance ?? 15)}
                          onChange={v => updateSelBalances(Math.max(0, parseInt(v) || 0), sel.sickBalance ?? 8)} />
                        <TextInput label="Sick balance (days)" type="number" value={String(sel.sickBalance ?? 8)}
                          onChange={v => updateSelBalances(sel.leaveBalance ?? 15, Math.max(0, parseInt(v) || 0))} />
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-400">Annual balance</span><span className="font-medium">{sel.leaveBalance ?? 15} days</span></div>
                        <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-400">Sick days</span><span className="font-medium">{sel.sickBalance ?? 8} days</span></div>
                      </>
                    )}
                  </div>
                  {(readOnly || managingSel()) && (
                    <>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Leave requests</div>
                        {leaveRequests.filter(r => r.userId === sel.id).length === 0 ? (
                          <p className="text-xs text-slate-400 p-3 rounded-lg bg-slate-50">No leave requests on file.</p>
                        ) : (
                          <div className="space-y-2">
                            {leaveRequests.filter(r => r.userId === sel.id).map(r => (
                              <div key={r.id} className="p-3 rounded-lg border border-slate-100 text-xs flex items-start gap-2">
                                <div className="flex-1">
                                  <div className="font-medium text-slate-800">{r.type} · {r.from} → {r.to} · {r.days} day{r.days !== 1 ? "s" : ""}</div>
                                  {r.note && <div className="text-slate-400 italic mt-0.5">"{r.note}"</div>}
                                  <div className="mt-1">
                                    {r.status === "pending" && <Pill tone="amber">Pending</Pill>}
                                    {r.status === "approved" && <Pill tone="green">Approved</Pill>}
                                    {r.status === "rejected" && <Pill tone="slate">Rejected</Pill>}
                                  </div>
                                </div>
                                {managingSel() && (
                                  <button onClick={() => deleteLeaveRecord(r.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={13} /></button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Short leave requests</div>
                        {shortLeaveRequests.filter(r => r.userId === sel.id).length === 0 ? (
                          <p className="text-xs text-slate-400 p-3 rounded-lg bg-slate-50">No short leave requests on file.</p>
                        ) : (
                          <div className="space-y-2">
                            {shortLeaveRequests.filter(r => r.userId === sel.id).map(r => (
                              <div key={r.id} className="p-3 rounded-lg border border-slate-100 text-xs flex items-start gap-2">
                                <div className="flex-1">
                                  <div className="font-medium text-slate-800">{formatDate(r.date)} · {r.fromTime} – {r.toTime} · {r.minutes} min</div>
                                  {r.reason && <div className="text-slate-400 italic mt-0.5">"{r.reason}"</div>}
                                  <div className="mt-1">
                                    {r.status === "pending" && <Pill tone="amber">Pending</Pill>}
                                    {r.status === "approved" && <Pill tone="green">Approved</Pill>}
                                    {r.status === "rejected" && <Pill tone="red">Rejected</Pill>}
                                  </div>
                                </div>
                                {managingSel() && (
                                  <button onClick={() => deleteShortLeaveRecord(r.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={13} /></button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {selTab === "Salary" && readOnly && (
                <div className="space-y-4">
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-400">Listed salary</span>
                    <span className="font-medium text-slate-800">{sel.salary || "—"}</span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Salary slips</div>
                    {payroll.filter(s => s.userId === sel.id).length === 0 ? (
                      <p className="text-xs text-slate-400 p-3 rounded-lg bg-slate-50">No salary slips generated yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {[...payroll.filter(s => s.userId === sel.id)].sort((a, b) => b.month.localeCompare(a.month)).map(s => (
                          <div key={s.id} className="p-3 rounded-lg border border-slate-100 flex items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium text-slate-800">{monthLabel(s.month)}</div>
                              <div className="text-xs text-slate-400">{s.presentDays}/{s.workDays} days present · Net {s.net?.toLocaleString()}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {s.status === "paid" ? <Pill tone="green">Paid</Pill> : <Pill tone="amber">Generated</Pill>}
                              {managingSel() && (
                                <button onClick={() => deletePayrollSlip(s.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete slip"><Trash2 size={13} /></button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {selTab === "Attendance" && readOnly && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                    <div className="font-medium text-slate-700 mb-1">Today's shift · {formatShiftRange(sel)}</div>
                    {(() => {
                      const r = getUserTodayRecord(attendance, sel.id);
                      const ds = dayStatusPill(r ? (r.dayStatus || computeDayStatus(sel, r)) : "Absent");
                      return (
                        <div className="flex flex-wrap gap-2 items-center text-slate-600">
                          <span>In {formatTime(r?.checkIn)}</span>
                          <span>· Out {formatTime(r?.checkOut)}</span>
                          <span>· Break {formatDurationMs(calcTotalBreakMs(r))}</span>
                          <span>· Hours {displayWorkingHours(r, sel)}</span>
                          <Pill tone={ds.tone}>{ds.label}</Pill>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <table className="w-full text-xs min-w-[520px]">
                      <thead>
                        <tr className="text-left text-slate-400 bg-slate-50 border-b border-slate-100">
                          {["Date", "In", "Out", "Break", "Hours", "Status", ...(managingSel() ? [""] : [])].map(h => (
                            <th key={h || "actions"} className="px-3 py-2 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {attendance.filter(r => r.userId === sel.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).length === 0 ? (
                          <tr><td colSpan={managingSel() ? 7 : 6} className="px-3 py-6 text-center text-slate-400">No attendance records yet.</td></tr>
                        ) : attendance.filter(r => r.userId === sel.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(r => {
                          const ds = dayStatusPill(r.dayStatus || computeDayStatus(sel, r));
                          return (
                            <tr key={r.id} className="border-b border-slate-50 last:border-0">
                              <td className="px-3 py-2">{formatDate(r.date)}</td>
                              <td className="px-3 py-2 tabular-nums">{formatTime(r.checkIn)}{r.checkIn && isLateCheckIn(r.checkIn, sel) && <Pill tone="amber">Late</Pill>}</td>
                              <td className="px-3 py-2 tabular-nums">{formatTime(r.checkOut)}{r.autoCheckout && <Pill tone="amber">Auto</Pill>}</td>
                              <td className="px-3 py-2 tabular-nums">{formatDurationMs(calcTotalBreakMs(r))}</td>
                              <td className="px-3 py-2 tabular-nums">{displayWorkingHours(r, sel)}</td>
                              <td className="px-3 py-2"><Pill tone={ds.tone}>{ds.label}</Pill></td>
                              {managingSel() && (
                                <td className="px-3 py-2">
                                  <button onClick={() => deleteAttendanceRecord(r.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete record"><Trash2 size={13} /></button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── EMPLOYEE SELF VIEW ─── */
function MyProfilePage({ currentUser, users, setUsers, onLogout }) {
  const me = users.find(u => u.id === currentUser.id) || currentUser;
  const [tab, setTab] = useState("info");
  const [pw, setPw]   = useState({ curr: "", newp: "", conf: "" });
  const [pwErr, setPwErr] = useState(""); const [pwOk, setPwOk] = useState(false);

  function changePw() {
    setPwErr(""); setPwOk(false);
    if (me.password !== pw.curr)      { setPwErr("Current password is incorrect."); return; }
    if (pw.newp.length < 8)           { setPwErr("Password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(pw.newp))       { setPwErr("Must include an uppercase letter."); return; }
    if (!/\d/.test(pw.newp))          { setPwErr("Must include a number."); return; }
    if (pw.newp !== pw.conf)          { setPwErr("Passwords do not match."); return; }
    setUsers(us => us.map(u => u.id === me.id ? { ...u, password: pw.newp } : u));
    setPwOk(true); setPw({ curr: "", newp: "", conf: "" });
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-4 mb-6 p-5 rounded-xl text-white" style={{ background: B.dark }}>
        <Avatar name={me.name} size={14} />
        <div>
          <div className="text-lg font-bold">{me.name}</div>
          <div className="text-sm opacity-70">{me.title || me.role} · {me.dept}</div>
          <div className="text-xs opacity-50 mt-0.5">{me.email}</div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-5">
        {[{ id: "info", label: "My info" }, { id: "password", label: "Change password" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-4 py-2 text-sm border-b-2 -mb-px"
            style={tab === t.id ? { borderColor: B.dark, color: B.dark, fontWeight: 600 } : { borderColor: "transparent", color: "#64748b" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="space-y-4">
          <Card className="p-5">
            <STitle>My information</STitle>
            <div className="space-y-3">
              {[["Full name", me.name], ["Email", me.email], ["Phone", me.phone || "—"], ["CNIC", getUserCnic(me) || "—"], ["Role", me.role], ["Department", me.dept || "—"], ["Team", me.team || "—"], ["Employment type", me.type], ["Hire date", me.hired || "—"], ["Marital status", me.maritalStatus || "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-50 pb-2">
                  <span className="text-slate-400 text-sm">{k}</span>
                  <span className="font-medium text-sm text-slate-800">{v}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <STitle>Emergency contact</STitle>
            <div className="space-y-3">
              {[["Guardian name", me.guardianName || "—"], ["Contact name", me.emergencyContactName || "—"], ["Contact number", me.emergencyContactPhone || "—"], ["Relationship", me.emergencyContactRelation || "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-50 pb-2">
                  <span className="text-slate-400 text-sm">{k}</span>
                  <span className="font-medium text-sm text-slate-800">{v}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <STitle>Leave balances</STitle>
            <div className="space-y-3">
              {[["Annual leave balance", `${me.leaveBalance ?? 15} days`], ["Sick leave balance", `${me.sickBalance ?? 8} days`]].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-50 pb-2">
                  <span className="text-slate-400 text-sm">{k}</span>
                  <span className="font-medium text-sm text-slate-800">{v}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-4">To update your information, contact your HR administrator.</p>
          </Card>
        </div>
      )}

      {tab === "password" && (
        <Card className="p-5">
          <STitle>Change password</STitle>
          <div className="space-y-4">
            <PwInput label="Current password"      value={pw.curr} onChange={v => setPw({ ...pw, curr: v })} />
            <div>
              <PwInput label="New password"         value={pw.newp} onChange={v => setPw({ ...pw, newp: v })} />
              <PwStrength pw={pw.newp} />
            </div>
            <PwInput label="Confirm new password"  value={pw.conf} onChange={v => setPw({ ...pw, conf: v })} />
            <ErrBox msg={pwErr} />
            <OkBox  msg={pwOk ? "Password changed successfully." : ""} />
            <Btn onClick={changePw}><Key size={14} />Change password</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── HR ADMIN OVERSIGHT (Executives only) ─── */
function HrAdminOversightPanel({
  users, attendance, shortLeaveRequests, leaveRequests,
  currentUser, setAttendance, setShortLeaveRequests, setLeaveRequests, setUsers, roles,
}) {
  const pendingShort = shortLeaveRequests.filter(r => r.status === "pending" && isHrAdminRequest(r, users));
  const pendingLeave = leaveRequests.filter(r => r.status === "pending" && isHrAdminRequest(r, users));
  if (pendingShort.length === 0 && pendingLeave.length === 0) return null;

  function adjustBalance(userId, type, delta) {
    setUsers(us => us.map(u => {
      if (u.id !== userId) return u;
      if (type === "Sick") return { ...u, sickBalance: Math.max(0, (u.sickBalance ?? 8) + delta) };
      return { ...u, leaveBalance: Math.max(0, (u.leaveBalance ?? 15) + delta) };
    }));
  }

  function changeShortStatus(id, newStatus) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canApproveShortLeaveRequest(currentUser, req, users, roles)) return;
    const prev = req.status;
    if (prev === newStatus) return;
    if (newStatus === "approved" && prev !== "approved") {
      setAttendance(a => applyApprovedShortLeave(a, users, req));
    }
    if (prev === "approved" && newStatus !== "approved") {
      setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    }
    setShortLeaveRequests(rs => rs.map(r => r.id === id ? {
      ...r, status: newStatus, reviewedBy: currentUser.name, reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function changeLeaveStatus(id, newStatus) {
    const req = leaveRequests.find(r => r.id === id);
    if (!req || !canApproveLeaveRequest(currentUser, req, users, roles)) return;
    const prev = req.status;
    if (prev === newStatus) return;
    if (newStatus === "approved" && prev !== "approved") adjustBalance(req.userId, req.type, -req.days);
    if (prev === "approved" && newStatus !== "approved") adjustBalance(req.userId, req.type, +req.days);
    setLeaveRequests(p => p.map(r => r.id === id ? {
      ...r, status: newStatus, reviewedBy: currentUser.name, reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function deleteShortLeave(id) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(currentUser, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    if (req.status === "approved") setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    setShortLeaveRequests(rs => rs.filter(r => r.id !== id));
  }

  return (
    <Card className="p-5 border-indigo-200 bg-amber-50/30">
      <STitle right={<Pill tone="dark">HR Admin approvals</Pill>}>Pending HR Admin requests</STitle>
      <p className="text-xs text-slate-500 mb-4">
        Approve or reject HR Admin leave and short leave here. Full profiles, attendance, and payroll are available under People, Attendance, and Payroll.
      </p>

      {(pendingShort.length > 0 || pendingLeave.length > 0) && (
        <div className="space-y-4">
          {pendingShort.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-2">Pending short leave</div>
              <div className="divide-y divide-slate-100">
                {pendingShort.map(r => (
                  <div key={r.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-44">
                      <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                      <div className="text-xs text-slate-500">
                        {formatDate(r.date)} · {r.fromTime} – {r.toTime} · {r.minutes} min
                      </div>
                      {r.reason && <div className="text-xs text-slate-400 italic">"{r.reason}"</div>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => changeShortStatus(r.id, "approved")}
                        className="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#16a34a" }}>
                        Approve
                      </button>
                      <button onClick={() => changeShortStatus(r.id, "rejected")}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-white">
                        Reject
                      </button>
                      <button onClick={() => deleteShortLeave(r.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                        title="Delete record">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pendingLeave.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-2">Pending leave</div>
              <div className="divide-y divide-slate-100">
                {pendingLeave.map(r => (
                  <div key={r.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-44">
                      <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                      <div className="text-xs text-slate-500">
                        {r.type} · {r.from} → {r.to} · {r.days} day{r.days !== 1 ? "s" : ""}
                      </div>
                      {r.note && <div className="text-xs text-slate-400 italic">"{r.note}"</div>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => changeLeaveStatus(r.id, "approved")}
                        className="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#16a34a" }}>
                        Approve
                      </button>
                      <button onClick={() => changeLeaveStatus(r.id, "rejected")}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-white">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ─── DASHBOARD ─── */
function Dashboard({ currentUser, users, setRoute, attendance, setAttendance, shortLeaveRequests, setShortLeaveRequests, leaveRequests, setLeaveRequests, setUsers, roles }) {
  const role = currentUser.role;
  const me   = users.find(u => u.id === currentUser.id) || currentUser;
  const opsDashboard = can(role, "view_attendance_reports", roles) && can(role, "view_people", roles);

  if ((role === "Employee" || role === "Manager") && !opsDashboard) {
    return (
      <div className="space-y-5 max-w-3xl">
        <div className="p-6 rounded-2xl text-white" style={{ background: B.dark }}>
          <div className="text-lg font-bold">Welcome, {me.name.split(" ")[0]}</div>
          <div className="text-sm opacity-70 mt-0.5">{me.title || me.role} · Shift {formatShiftRange(me)}</div>
        </div>
        <EmployeeShiftPanel user={me} attendance={attendance} setAttendance={setAttendance} compact />
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-xs text-slate-400">Annual leave</div>
            <div className="text-3xl font-bold mt-1" style={{ color: B.dark }}>{me.leaveBalance ?? 15}</div>
            <div className="text-xs text-slate-500">days remaining</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-slate-400">Sick days</div>
            <div className="text-3xl font-bold mt-1" style={{ color: B.dark }}>{me.sickBalance ?? 8}</div>
            <div className="text-xs text-slate-500">available this year</div>
          </Card>
        </div>
        <Card className="p-4">
          <STitle>Quick actions</STitle>
          <div className="space-y-2">
            {[["Attendance history", "attendance"], ["Short leave request", "shortleave"], ["Submit leave request", "leave"], ["My profile", "myprofile"], ["Account settings", "settings"]].map(([l, r]) => (
              <button key={r} onClick={() => setRoute(r)}
                className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium flex items-center justify-between border border-slate-200 hover:bg-slate-50"
                style={{ color: B.dark }}>
                {l}<ChevronRight size={16} />
              </button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!opsDashboard) return null;

  // HR Admin & Executive operations dashboard
  const staffRoster = employeeRoster(users);
  const allStaff = staffRoster.filter(u => u.status === "active");
  const todayRoster = isExecutiveRole(role)
    ? activeAttendanceRoster(users, role)
    : allStaff;
  const checkedInNow = todayRoster.filter(u => {
    const r = getUserTodayRecord(attendance, u.id);
    return r?.checkIn && !r?.checkOut;
  });

  const pendingShort = shortLeaveRequests.filter(r =>
    r.status === "pending" && canApproveShortLeaveRequest(me, r, users, roles)
    && !(isExecutiveRole(role) && isHrAdminRequest(r, users))
  );

  function approveShort(id, status) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canApproveShortLeaveRequest(me, req, users, roles)) return;
    if (status === "approved") setAttendance(a => applyApprovedShortLeave(a, users, req));
    setShortLeaveRequests(rs => rs.map(r => r.id === id ? {
      ...r, status, reviewedBy: currentUser.name, reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function deleteShort(id) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(me, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    if (req.status === "approved") setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    setShortLeaveRequests(rs => rs.filter(r => r.id !== id));
  }

  return (
    <div className="space-y-5">
      {isHrAdminRole(role) && (
        <EmployeeShiftPanel user={me} attendance={attendance} setAttendance={setAttendance} compact />
      )}
      <div className="p-6 rounded-2xl text-white" style={{ background: B.dark }}>
        <div className="text-lg font-bold">Welcome, {me.name.split(" ")[0]}</div>
        <div className="text-sm opacity-70 mt-0.5">
          {role === "Executive" ? `${me.title || "Executive"} · Executive Portal` : "Adforce Solutions · HR Admin Portal"}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total employees",  value: staffRoster.length,                                    icon: Users },
          { label: "Checked in now",   value: checkedInNow.length,                             icon: LogIn },
          { label: "Departments",      value: [...new Set(staffRoster.map(u => u.dept).filter(Boolean))].length, icon: Building },
          { label: "Pending setup",    value: staffRoster.filter(u => u.firstLogin).length,          icon: AlertTriangle },
        ].map(k => (
          <Card key={k.label} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">{k.label}</span>
              <span className="p-1.5 rounded-lg" style={{ background: B.darkLight, color: B.dark }}><k.icon size={14} /></span>
            </div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: B.dark }}>{k.value}</div>
          </Card>
        ))}
      </div>

      {isExecutiveRole(role) && (
        <HrAdminOversightPanel
          users={users}
          attendance={attendance}
          shortLeaveRequests={shortLeaveRequests}
          leaveRequests={leaveRequests}
          currentUser={currentUser}
          setAttendance={setAttendance}
          setShortLeaveRequests={setShortLeaveRequests}
          setLeaveRequests={setLeaveRequests}
          setUsers={setUsers}
          roles={roles}
        />
      )}

      {pendingShort.length > 0 && (
        <Card className="p-5 border-amber-200">
          <STitle right={
            <button onClick={() => setRoute("shortleave")} className="text-xs hover:underline" style={{ color: B.dark }}>View all</button>
          }>Pending short leave requests</STitle>
          <div className="divide-y divide-slate-100">
            {pendingShort.slice(0, 5).map(r => (
              <div key={r.id} className="py-3 flex items-center gap-3 flex-wrap">
                <Avatar name={r.empName} />
                <div className="flex-1 min-w-44">
                  <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                  <div className="text-xs text-slate-500">
                    {formatDate(r.date)} · {r.fromTime} – {r.toTime} · {r.minutes} min
                  </div>
                  {r.reason && <div className="text-xs text-slate-400 italic">"{r.reason}"</div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveShort(r.id, "approved")}
                    className="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#16a34a" }}>
                    Approve
                  </button>
                  <button onClick={() => approveShort(r.id, "rejected")}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50">
                    Reject
                  </button>
                  <button onClick={() => deleteShort(r.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                    title="Delete record">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {todayRoster.length > 0 && (
        <Card className="p-5">
          <STitle right={
            <button onClick={() => setRoute("attendance")} className="text-xs hover:underline" style={{ color: B.dark }}>Full reports</button>
          }>Today's attendance</STitle>
          <div className="divide-y divide-slate-100">
            {todayRoster.map(u => {
              const r = getUserTodayRecord(attendance, u.id);
              const ds = dayStatusPill(r ? (r.dayStatus || computeDayStatus(u, r)) : "Absent");
              return (
                <div key={u.id} className="py-2.5 flex items-center gap-3">
                  <Avatar name={u.name} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-400">
                      {formatShiftRange(u)} · {r?.checkIn ? `In ${formatTime(r.checkIn)}` : "Not checked in"}
                      {r?.checkOut ? ` · Out ${formatTime(r.checkOut)}` : ""}
                      {r?.autoCheckout ? " (auto)" : ""}
                    </div>
                  </div>
                  <Pill tone={ds.tone}>{ds.label}</Pill>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {isHrAdminRole(role) && staffRoster.length === 0 && (
        <Card className="p-8 text-center">
          <UserPlus size={36} className="mx-auto mb-3 text-slate-300" />
          <div className="text-slate-600 font-medium mb-1">No employees yet</div>
          <div className="text-slate-400 text-sm mb-4">Add your first employee to get started.</div>
          <button onClick={() => setRoute("people")}
            className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg"
            style={{ background: B.dark }}>
            Add first employee
          </button>
        </Card>
      )}

      {staffRoster.filter(u => u.firstLogin).length > 0 && (
        <Card className="p-5">
          <STitle>Pending first login</STitle>
          <div className="divide-y divide-slate-100">
            {staffRoster.filter(u => u.firstLogin).map(u => (
              <div key={u.id} className="py-2.5 flex items-center gap-3">
                <Avatar name={u.name} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">{u.name}</div>
                  <div className="text-xs text-slate-400">{u.email}</div>
                </div>
                <Pill tone="amber"><Timer size={12} />Setup pending</Pill>
              </div>
            ))}
          </div>
        </Card>
      )}

      {staffRoster.length > 0 && (
        <Card className="p-5">
          <STitle right={
            <button onClick={() => setRoute("people")} className="text-xs hover:underline" style={{ color: B.dark }}>View all</button>
          }>Recent employees</STitle>
          <div className="divide-y divide-slate-100">
            {staffRoster.slice(-4).reverse().map(u => (
              <div key={u.id} className="py-2.5 flex items-center gap-3">
                <Avatar name={u.name} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">{u.name}</div>
                  <div className="text-xs text-slate-400">{u.role} · {u.dept || "—"}</div>
                </div>
                {u.status === "active" ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Inactive</Pill>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── ATTENDANCE ─── */
function EmployeeShiftPanel({ user, attendance, setAttendance, compact = false }) {
  const [err, setErr] = useState("");
  const today = getUserTodayRecord(attendance, user.id);
  const shift = getUserShift(user);
  const bounds = getShiftBounds(user, todayKey());
  const checkedIn = today?.checkIn && !today?.checkOut;
  const onBreak = today?.breakStart && !today?.breakEnd;
  const daySt = dayStatusPill(today ? (today.dayStatus || computeDayStatus(user, today)) : "Absent");
  const breakMs = calcTotalBreakMs(today);
  const allowedBreakMs = shift.breakMinutes * 60000;

  function run(action) {
    setErr("");
    const result = action();
    if (result.error) { setErr(result.error); return; }
    setAttendance(result.attendance);
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <Card className={compact ? "p-4" : "p-6"}>
        <STitle right={<Pill tone={daySt.tone}>{daySt.label}</Pill>}>
          {compact ? "Today's attendance" : "Shift attendance"}
        </STitle>
        <div className="text-xs text-slate-500 mb-4 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
          <b>Your shift:</b> {formatShiftRange(user)} · Grace {shift.graceMinutes}m · Break {shift.breakMinutes}m · Checkout by {formatTime(bounds.checkoutDeadline.toISOString())}
        </div>
        <ErrBox msg={err} />
        <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-3 mb-4 text-sm`}>
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-center">
            <div className="text-xs text-emerald-600">Check in</div>
            <div className="font-semibold text-emerald-800 tabular-nums mt-1">{formatTime(today?.checkIn)}</div>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-center">
            <div className="text-xs text-blue-600">Check out</div>
            <div className="font-semibold text-blue-800 tabular-nums mt-1">
              {formatTime(today?.checkOut)}
              {today?.autoCheckout && <span className="block text-[10px] text-blue-500 mt-0.5">Auto</span>}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-center">
            <div className="text-xs text-amber-600">Break</div>
            <div className="font-semibold text-amber-800 tabular-nums mt-1">{formatDurationMs(breakMs)}</div>
            <div className="text-[10px] text-amber-600">of {shift.breakMinutes}m</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
            <div className="text-xs text-slate-500">Working hours</div>
            <div className="font-semibold tabular-nums mt-1" style={{ color: B.dark }}>{displayWorkingHours(today, user)}</div>
          </div>
        </div>

        {!today?.checkOut && (
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {!checkedIn && (
              <Btn onClick={() => run(() => performCheckIn(attendance, user.id, user))}>
                <LogIn size={14} />Check in
              </Btn>
            )}
            {checkedIn && !onBreak && (
              <Btn onClick={() => run(() => performCheckOut(attendance, user.id, user))} variant="danger">
                <LogOut size={14} />Check out
              </Btn>
            )}
            {checkedIn && (
              onBreak ? (
                <Btn onClick={() => run(() => performBreakEnd(attendance, user.id, user))} variant="ghost">
                  <Coffee size={14} />End break
                </Btn>
              ) : (
                <Btn onClick={() => run(() => performBreakStart(attendance, user.id, user))} variant="ghost">
                  <Coffee size={14} />Start break
                </Btn>
              )
            )}
          </div>
        )}

        {today?.shortLeaves?.filter(sl => sl.status === "approved").length > 0 && (
          <div className="text-xs text-slate-500 space-y-1 mb-2">
            <b>Approved short leave today:</b>
            {today.shortLeaves.filter(sl => sl.status === "approved").map(sl => (
              <div key={sl.id} className="flex justify-between p-2 rounded bg-white border border-slate-100">
                <span>{formatTime(sl.start)} – {formatTime(sl.end)}</span>
                <span className="text-slate-400">{sl.reason || "—"}</span>
              </div>
            ))}
          </div>
        )}

        {today?.checkOut && (
          <div className="text-sm text-center text-slate-500 mt-2">
            Shift complete · <b>{displayWorkingHours(today, user)}</b> net working time
            {today.autoCheckout && <span className="text-amber-600"> · Auto checkout applied</span>}
          </div>
        )}
      </Card>
    </div>
  );
}

function AttendancePage({ currentUser, users, attendance, setAttendance, shortLeaveRequests, setShortLeaveRequests, leaveRequests, setLeaveRequests, setUsers, roles }) {
  const me = users.find(u => u.id === currentUser.id) || currentUser;
  const showReports = can(currentUser.role, "view_attendance_reports", roles);

  if (isHrAdminRole(currentUser.role) && showReports) {
    return (
      <div className="space-y-5">
        <EmployeeAttendanceFull user={me} attendance={attendance} setAttendance={setAttendance} />
        <AdminAttendanceView
          users={users}
          attendance={attendance}
          setAttendance={setAttendance}
          shortLeaveRequests={shortLeaveRequests}
          setShortLeaveRequests={setShortLeaveRequests}
          leaveRequests={leaveRequests}
          setLeaveRequests={setLeaveRequests}
          setUsers={setUsers}
          currentUser={currentUser}
          roles={roles}
        />
      </div>
    );
  }

  if (showReports) {
    return (
      <AdminAttendanceView
        users={users}
        attendance={attendance}
        setAttendance={setAttendance}
        shortLeaveRequests={shortLeaveRequests}
        setShortLeaveRequests={setShortLeaveRequests}
        leaveRequests={leaveRequests}
        setLeaveRequests={setLeaveRequests}
        setUsers={setUsers}
        currentUser={currentUser}
        roles={roles}
      />
    );
  }

  return <EmployeeAttendanceFull user={me} attendance={attendance} setAttendance={setAttendance} />;
}

function EmployeeAttendanceFull({ user, attendance, setAttendance }) {
  const history = attendance
    .filter(r => r.userId === user.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  return (
    <div className="space-y-5 max-w-3xl">
      <EmployeeShiftPanel user={user} attendance={attendance} setAttendance={setAttendance} />
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200"><STitle>My attendance history</STitle></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Date", "Check in", "Check out", "Break", "Hours", "Status"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No attendance records yet.</td></tr>
              ) : history.map(r => {
                const ds = dayStatusPill(r.dayStatus || computeDayStatus(user, r));
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-700">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatTime(r.checkIn)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r.checkOut)}{r.autoCheckout && <Pill tone="amber">Auto</Pill>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatDurationMs(calcTotalBreakMs(r))}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, user)}</td>
                    <td className="px-4 py-3"><Pill tone={ds.tone}>{ds.label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AdminAttendanceView({ users, attendance, setAttendance, shortLeaveRequests, setShortLeaveRequests, leaveRequests, setLeaveRequests, setUsers, currentUser, roles }) {
  const [period, setPeriod] = useState("daily");
  const staffRoster = employeeRoster(users);
  const allStaff = staffRoster.filter(u => u.status === "active");
  const liveRoster = isExecutiveRole(currentUser.role)
    ? activeAttendanceRoster(users, currentUser.role)
    : allStaff;
  const visibleIds = attendanceVisibleUserIds(users, currentUser.role);
  const pendingShort = shortLeaveRequests.filter(r =>
    r.status === "pending" && canApproveShortLeaveRequest(currentUser, r, users, roles)
    && !(isExecutiveRole(currentUser.role) && isHrAdminRequest(r, users))
  );

  function changeShortStatus(id, newStatus) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canApproveShortLeaveRequest(currentUser, req, users, roles)) return;
    const prev = req.status;
    if (prev === newStatus) return;
    if (newStatus === "approved" && prev !== "approved") {
      setAttendance(a => applyApprovedShortLeave(a, users, req));
    }
    if (prev === "approved" && newStatus !== "approved") {
      setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    }
    setShortLeaveRequests(rs => rs.map(r => r.id === id ? {
      ...r,
      status: newStatus,
      reviewedBy: currentUser.name,
      reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function deleteShort(id) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(currentUser, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    if (req.status === "approved") setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    setShortLeaveRequests(rs => rs.filter(r => r.id !== id));
  }

  const checkedInNow = liveRoster.filter(u => { const r = getUserTodayRecord(attendance, u.id); return r?.checkIn && !r?.checkOut; });
  const lateToday = liveRoster.filter(u => { const r = getUserTodayRecord(attendance, u.id); return r?.checkIn && isLateCheckIn(r.checkIn, u); });
  const autoToday = attendance.filter(r => r.date === todayKey() && r.autoCheckout && visibleIds.has(r.userId));

  const reportRows = filterAttendanceByPeriod(attendance, period)
    .filter(r => visibleIds.has(r.userId))
    .map(r => {
      const user = users.find(u => u.id === r.userId);
      return user ? { ...r, name: user.name, dept: user.dept || user.role || "—", shift: formatShiftRange(user), user } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date) || (a.name || "").localeCompare(b.name || ""));

  const periodTotalMs = reportRows.reduce((sum, r) => sum + (r.workingMs || calcNetWorkingMs(r)), 0);

  return (
    <div className="space-y-5">
      {isExecutiveRole(currentUser.role) && (
        <HrAdminOversightPanel
          users={users}
          attendance={attendance}
          shortLeaveRequests={shortLeaveRequests}
          leaveRequests={leaveRequests}
          currentUser={currentUser}
          setAttendance={setAttendance}
          setShortLeaveRequests={setShortLeaveRequests}
          setLeaveRequests={setLeaveRequests}
          setUsers={setUsers}
          roles={roles}
        />
      )}

      {pendingShort.length > 0 && (
        <Card className="p-5 border-amber-200 bg-amber-50/30">
          <STitle right={<Pill tone="amber">{pendingShort.length} pending</Pill>}>Short leave approvals</STitle>
          <div className="divide-y divide-amber-100">
            {pendingShort.map(r => (
              <div key={r.id} className="py-3 flex items-center gap-3 flex-wrap">
                <Avatar name={r.empName} />
                <div className="flex-1 min-w-48">
                  <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                  <div className="text-xs text-slate-500">
                    {formatDate(r.date)} · {r.fromTime} – {r.toTime} · {r.minutes} min
                  </div>
                  {r.reason && <div className="text-xs text-slate-400 mt-0.5 italic">"{r.reason}"</div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => changeShortStatus(r.id, "approved")}
                    className="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#16a34a" }}>
                    Approve
                  </button>
                  <button onClick={() => changeShortStatus(r.id, "rejected")}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-white">
                    Reject
                  </button>
                  <button onClick={() => deleteShort(r.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                    title="Delete record">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Checked in now", value: checkedInNow.length, icon: LogIn },
          { label: "Late today", value: lateToday.length, icon: AlertTriangle },
          { label: "Auto checkouts", value: autoToday.length, icon: Clock },
          { label: "Absent today", value: liveRoster.filter(u => !getUserTodayRecord(attendance, u.id)?.checkIn).length, icon: Users },
          { label: `${period} hours`, value: formatDurationMs(periodTotalMs), icon: BadgeCheck },
        ].map(k => (
          <Card key={k.label} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">{k.label}</span>
              <span className="p-1.5 rounded-lg" style={{ background: B.darkLight, color: B.dark }}><k.icon size={14} /></span>
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: B.dark }}>{k.value}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <STitle>Live attendance — today</STitle>
          <span className="text-xs text-slate-400">{formatDate(todayKey())}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Employee", "Shift", "Check in", "Check out", "Break", "Short leave", "Hours", "Status", "Notes"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liveRoster.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No employees on file.</td></tr>
              ) : liveRoster.map(u => {
                const r = getUserTodayRecord(attendance, u.id);
                const ds = dayStatusPill(r ? (r.dayStatus || computeDayStatus(u, r)) : "Absent");
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} size={7} />
                        <div>
                          <div className="font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.dept || u.role || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{formatShiftRange(u)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r?.checkIn)}
                      {r?.checkIn && isLateCheckIn(r.checkIn, u) && <Pill tone="amber">Late</Pill>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r?.checkOut)}
                      {r?.autoCheckout && <Pill tone="amber">Auto</Pill>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatDurationMs(calcTotalBreakMs(r))}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {(r?.shortLeaves || []).filter(sl => sl.status === "approved").length
                        ? r.shortLeaves.filter(sl => sl.status === "approved").map(sl => `${formatTime(sl.start)}–${formatTime(sl.end)}`).join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, u)}</td>
                    <td className="px-4 py-3"><Pill tone={ds.tone}>{ds.label}</Pill></td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {r?.breakStart && !r?.breakEnd ? "On break" : r?.autoCheckout ? "Auto checkout" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <STitle right={<span className="text-xs text-slate-400">Total: {formatDurationMs(periodTotalMs)}</span>}>Attendance reports</STitle>
          <div className="flex gap-1 p-1 rounded-lg bg-slate-100">
            {["daily", "weekly", "monthly"].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className="px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors"
                style={period === p ? { background: B.dark, color: B.white } : { color: B.dark }}>{p}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Date", "Employee", "Shift", "Check in", "Check out", "Break", "Hours", "Status", "Auto"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No records for this {period} period.</td></tr>
              ) : reportRows.map(r => {
                const ds = dayStatusPill(r.dayStatus || computeDayStatus(r.user, r));
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-700">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{r.shift}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r.checkIn)}
                      {r.checkIn && isLateCheckIn(r.checkIn, r.user) && <Pill tone="amber">Late</Pill>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatTime(r.checkOut)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatDurationMs(calcTotalBreakMs(r))}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, r.user)}</td>
                    <td className="px-4 py-3"><Pill tone={ds.tone}>{ds.label}</Pill></td>
                    <td className="px-4 py-3">{r.autoCheckout ? <Pill tone="amber">Yes</Pill> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ─── ATTENDANCE (end) ─── */

/* ─── SHORT LEAVE ─── */
function ShortLeavePage({ currentUser, requests, setRequests, users, attendance, setAttendance, roles }) {
  const [form, setForm] = useState({ date: todayKey(), from: "", to: "", reason: "" });
  const [msg, setMsg] = useState("");
  const canSubmit = canSelfSubmitLeave(currentUser.role);
  const visibleReqs = visibleShortLeaveRequests(requests, currentUser, users, roles);
  const listHasApprovals = visibleReqs.some(r => canApproveShortLeaveRequest(currentUser, r, users, roles));

  function changeStatus(id, newStatus) {
    const req = requests.find(r => r.id === id);
    if (!req || !canApproveShortLeaveRequest(currentUser, req, users, roles)) return;
    const prev = req.status;
    if (prev === newStatus) return;
    if (newStatus === "approved" && prev !== "approved") {
      setAttendance(a => applyApprovedShortLeave(a, users, req));
    }
    if (prev === "approved" && newStatus !== "approved") {
      setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    }
    setRequests(rs => rs.map(r => r.id === id ? {
      ...r,
      status: newStatus,
      reviewedBy: currentUser.name,
      reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function deleteRequest(id) {
    const req = requests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(currentUser, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    if (req.status === "approved") setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    setRequests(rs => rs.filter(r => r.id !== id));
  }

  function submit() {
    if (!form.date || !form.from || !form.to) {
      setMsg("error:Please select date, start time, and end time.");
      return;
    }
    if (!form.reason.trim()) {
      setMsg("error:Please provide a reason for short leave.");
      return;
    }
    const me = users.find(u => u.id === currentUser.id) || currentUser;
    const built = buildShortLeaveRequest(me, form.date, form.from, form.to, form.reason);
    if (built.error) {
      setMsg("error:" + built.error);
      return;
    }
    setRequests(p => [...p, built.request]);
    setForm({ date: todayKey(), from: "", to: "", reason: "" });
    setMsg(isHrAdminRole(currentUser.role)
      ? "ok:Short leave request submitted. An executive will review it."
      : "ok:Short leave request submitted. HR will review it shortly.");
    setTimeout(() => setMsg(""), 4000);
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {canSubmit && (
      <Card className="p-5">
        <STitle>Submit short leave request</STitle>
        <p className="text-xs text-slate-500 mb-4">
          {isHrAdminRole(currentUser.role)
            ? "Request partial-day leave. Executives must approve before it is applied to your attendance."
            : "Request partial-day leave (e.g. doctor visit, personal errand). HR must approve before it is applied to your attendance."}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput label="Date" type="date" value={form.date} onChange={v => setForm({ ...form, date: v })} required />
          <div />
          <TextInput label="From time" type="time" value={form.from} onChange={v => setForm({ ...form, from: v })} required />
          <TextInput label="To time" type="time" value={form.to} onChange={v => setForm({ ...form, to: v })} required />
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Reason <span className="text-red-500">*</span></label>
            <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={2}
              placeholder="e.g. Doctor appointment, bank visit…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none resize-none" />
          </div>
        </div>
        {msg.startsWith("error:") && <div className="mt-3"><ErrBox msg={msg.replace("error:", "")} /></div>}
        {msg.startsWith("ok:")    && <div className="mt-3"><OkBox  msg={msg.replace("ok:", "")} /></div>}
        <div className="mt-4"><Btn onClick={submit}><Send size={14} />Submit request</Btn></div>
      </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold" style={{ color: B.dark }}>
            {listHasApprovals ? "Short leave requests" : "My short leave requests"}
          </h3>
        </div>
        {visibleReqs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No short leave requests yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {[...visibleReqs].reverse().map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                <Avatar name={r.empName} />
                <div className="flex-1 min-w-44">
                  <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                  <div className="text-xs text-slate-500">
                    {formatDate(r.date)} · {r.fromTime} – {r.toTime} · {r.minutes} min
                  </div>
                  {r.reason && <div className="text-xs text-slate-400 mt-0.5 italic">"{r.reason}"</div>}
                  {r.reviewedBy && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      Reviewed by {r.reviewedBy} · {r.reviewedOn}
                    </div>
                  )}
                </div>
                {r.status === "pending"  && <Pill tone="amber"><Timer size={12} />Pending</Pill>}
                {r.status === "approved" && <Pill tone="green"><Check size={12} />Approved</Pill>}
                {r.status === "rejected" && <Pill tone="red"><X size={12} />Rejected</Pill>}
                {canApproveShortLeaveRequest(currentUser, r, users, roles) && r.status === "pending" && (
                  <div className="flex gap-2">
                    <button onClick={() => changeStatus(r.id, "approved")}
                      className="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#16a34a" }}>
                      Approve
                    </button>
                    <button onClick={() => changeStatus(r.id, "rejected")}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50">
                      Reject
                    </button>
                  </div>
                )}
                {canDeleteShortLeaveRecord(currentUser, r, users, roles) && (
                  <button onClick={() => deleteRequest(r.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                    title="Delete record">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─── LEAVE ─── */
function LeavePage({ currentUser, requests, setRequests, users, setUsers, roles }) {
  const [form, setForm] = useState({ type: "Annual", from: "", to: "", note: "" });
  const [msg,  setMsg]  = useState("");
  const canSubmit = canSelfSubmitLeave(currentUser.role);
  const me      = users.find(u => u.id === currentUser.id) || currentUser;
  const visibleReqs = visibleLeaveRequests(requests, currentUser, users, roles);
  const listHasApprovals = visibleReqs.some(r => canApproveLeaveRequest(currentUser, r, users, roles));

  function balanceFor(user, type) {
    return type === "Sick" ? (user.sickBalance ?? 8) : (user.leaveBalance ?? 15);
  }

  function adjustBalance(userId, type, delta) {
    setUsers(us => us.map(u => {
      if (u.id !== userId) return u;
      if (type === "Sick") return { ...u, sickBalance: Math.max(0, (u.sickBalance ?? 8) + delta) };
      return { ...u, leaveBalance: Math.max(0, (u.leaveBalance ?? 15) + delta) };
    }));
  }

  function submitLeave() {
    if (!form.from || !form.to) { setMsg("error:Please select both From and To dates."); return; }
    const days = Math.max(1, Math.ceil((new Date(form.to) - new Date(form.from)) / 86400000) + 1);
    const available = balanceFor(me, form.type);
    if (days > available) {
      setMsg(`error:Insufficient balance. You have ${available} ${form.type === "Sick" ? "sick" : "annual"} day${available !== 1 ? "s" : ""} remaining, but requested ${days}.`);
      return;
    }
    setRequests(p => [...p, { id: "l" + Date.now(), userId: currentUser.id, empName: currentUser.name, ...form, days, status: "pending", submitted: new Date().toLocaleDateString() }]);
    setForm({ type: "Annual", from: "", to: "", note: "" });
    setMsg(isHrAdminRole(currentUser.role)
      ? "ok:Leave request submitted for executive approval."
      : "ok:Leave request submitted.");
    setTimeout(() => setMsg(""), 4000);
  }

  // Status transitions with automatic balance adjustment:
  // pending  → approved : deduct days
  // approved → rejected : restore days
  // rejected → approved : deduct days
  function changeStatus(id, newStatus) {
    const req = requests.find(r => r.id === id);
    if (!req || !canApproveLeaveRequest(currentUser, req, users, roles)) return;
    const prev = req.status;
    if (prev === newStatus) return;
    if (newStatus === "approved" && prev !== "approved") adjustBalance(req.userId, req.type, -req.days);
    if (prev === "approved" && newStatus !== "approved")  adjustBalance(req.userId, req.type, +req.days);
    setRequests(p => p.map(r => r.id === id ? {
      ...r, status: newStatus, reviewedBy: currentUser.name, reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function deleteRequest(id) {
    const req = requests.find(r => r.id === id);
    if (!req || !canDeleteLeaveRecord(currentUser, req, users, roles)) return;
    if (!window.confirm(`Delete this leave request from ${req.empName}?`)) return;
    if (req.status === "approved") adjustBalance(req.userId, req.type, +req.days);
    setRequests(p => p.filter(r => r.id !== id));
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {canSubmit && (
      <>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-slate-400">Annual leave balance</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: B.dark }}>{me.leaveBalance ?? 15} <span className="text-sm font-normal text-slate-400">days</span></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-400">Sick leave balance</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: B.dark }}>{me.sickBalance ?? 8} <span className="text-sm font-normal text-slate-400">days</span></div>
        </Card>
      </div>

      <Card className="p-5">
        <STitle>Submit leave request</STitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectInput label="Leave type" value={form.type} onChange={v => setForm({ ...form, type: v })}
            options={[{ value: "Annual", label: "Annual leave" }, { value: "Sick", label: "Sick leave" }, { value: "Casual", label: "Casual leave (uses annual balance)" }]} />
          <div />
          <TextInput label="From date" type="date" value={form.from} onChange={v => setForm({ ...form, from: v })} required />
          <TextInput label="To date"   type="date" value={form.to}   onChange={v => setForm({ ...form, to: v })}   required />
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Reason (optional)</label>
            <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2} placeholder="Brief reason for the request…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none resize-none" />
          </div>
        </div>
        {msg.startsWith("error:") && <div className="mt-3"><ErrBox msg={msg.replace("error:", "")} /></div>}
        {msg.startsWith("ok:")    && <div className="mt-3"><OkBox  msg={msg.replace("ok:", "")} /></div>}
        <div className="mt-3"><Btn onClick={submitLeave}><Send size={14} />Submit request</Btn></div>
      </Card>
      </>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold" style={{ color: B.dark }}>{listHasApprovals ? "Leave requests" : "My requests"}</h3>
        </div>
        {visibleReqs.length === 0
          ? <div className="p-8 text-center text-slate-400 text-sm">No leave requests yet.</div>
          : (
            <div className="divide-y divide-slate-100">
              {visibleReqs.map(r => (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                  <Avatar name={r.empName} />
                  <div className="flex-1 min-w-40">
                    <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                    <div className="text-xs text-slate-500">{r.type} · {r.from} → {r.to} · {r.days} day{r.days !== 1 ? "s" : ""}</div>
                    {r.note && <div className="text-xs text-slate-400 mt-0.5 italic">"{r.note}"</div>}
                  </div>
                  {r.status === "pending"  && <Pill tone="amber"><Timer size={12} />Pending</Pill>}
                  {r.status === "approved" && <Pill tone="green"><Check size={12} />Approved</Pill>}
                  {r.status === "rejected" && <Pill tone="slate"><X size={12} />Rejected</Pill>}
                  {canApproveLeaveRequest(currentUser, r, users, roles) && r.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => changeStatus(r.id, "approved")}
                        className="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#16a34a" }}>
                        Approve
                      </button>
                      <button onClick={() => changeStatus(r.id, "rejected")}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg">
                        Reject
                      </button>
                    </div>
                  )}
                  {canApproveLeaveRequest(currentUser, r, users, roles) && r.status !== "pending" && (
                    <button
                      onClick={() => changeStatus(r.id, r.status === "approved" ? "rejected" : "approved")}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50"
                      title="Change decision">
                      Change to {r.status === "approved" ? "Rejected" : "Approved"}
                    </button>
                  )}
                  {canDeleteLeaveRecord(currentUser, r, users, roles) && (
                    <button
                      onClick={() => deleteRequest(r.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                      title="Delete request">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        }
      </Card>
    </div>
  );
}

/* ─── EXECUTIVES (HR Admin only) ─── */
const EXECUTIVE_POSITIONS = [
  "CEO", "CTO", "COO", "CFO", "CMO", "Team Lead", "Director", "VP", "Other",
];

function ExecutivesPage({ users, setUsers }) {
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [editTgt, setEditTgt] = useState(null);
  const [delTgt, setDelTgt] = useState(null);
  const [resetTgt, setResetTgt] = useState(null);
  const [resetResult, setResetResult] = useState("");
  const [ferr, setFerr] = useState("");
  const blank = { name: "", email: "", phone: "", title: "CEO", password: "", status: "active" };
  const [form, setForm] = useState(blank);

  const executives = users.filter(u => u.role === "Executive");
  const list = executives.filter(u =>
    (u.name + u.email + u.phone + u.title).toLowerCase().includes(q.toLowerCase())
  );

  function openAdd() { setForm(blank); setFerr(""); setAddOpen(true); }
  function openEdit(u) { setEditTgt(u); setForm({ name: u.name, email: u.email, phone: u.phone || "", title: u.title || "CEO", password: "", status: u.status || "active" }); setFerr(""); setEditOpen(true); }
  function openDel(u) { setDelTgt(u); setDelOpen(true); }
  function openReset(u) { setResetTgt(u); setResetResult(""); setResetOpen(true); }

  function saveAdd() {
    const email = form.email.trim();
    if (!form.name.trim() || !email) { setFerr("Full name and email are required."); return; }
    if (!form.password || form.password.length < 8) { setFerr("Password must be at least 8 characters."); return; }
    if (users.find(u => u.email.trim().toLowerCase() === email.toLowerCase())) { setFerr("This email is already in use."); return; }
    const newUser = {
      id: genId(),
      name: form.name.trim(),
      email,
      phone: form.phone.trim(),
      title: form.title,
      role: "Executive",
      dept: "Executive",
      team: "Leadership",
      type: "Full-time",
      hired: todayKey(),
      salary: "",
      status: "active",
      password: form.password,
      leaveBalance: 0,
      sickBalance: 0,
      skills: [],
      firstLogin: true,
    };
    setUsers(p => [...p, newUser]);
    setAddOpen(false);
    alert(`Executive account created.\n\nEmail: ${email}\nPassword: ${form.password}\n\nShare these credentials securely.`);
  }

  function saveEdit() {
    if (!form.name.trim() || !form.email.trim()) { setFerr("Full name and email are required."); return; }
    if (users.find(u => u.email.toLowerCase() === form.email.toLowerCase() && u.id !== editTgt.id)) { setFerr("This email is already in use."); return; }
    setUsers(p => p.map(u => u.id === editTgt.id ? {
      ...u,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      title: form.title,
      status: form.status,
      ...(form.password ? { password: form.password, firstLogin: false, tempPassword: undefined } : {}),
    } : u));
    setEditOpen(false);
  }

  function toggleStatus(u) {
    setUsers(p => p.map(x => x.id === u.id ? { ...x, status: x.status === "active" ? "inactive" : "active" } : x));
  }

  function confirmDel() {
    setUsers(p => p.filter(u => u.id !== delTgt.id));
    setDelOpen(false);
  }

  function doPasswordReset() {
    const tempPw = genTempPw();
    setUsers(p => p.map(u => u.id === resetTgt.id ? { ...u, password: tempPw, firstLogin: true, tempPassword: tempPw } : u));
    setResetResult(`New temporary password: ${tempPw}`);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search executives…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        <Btn onClick={openAdd}><UserPlus size={14} />Add executive</Btn>
      </div>

      <div className="mb-4 p-4 rounded-xl text-sm flex gap-3 items-start" style={{ background: B.darkLight, color: B.dark, border: `1px solid ${B.darkBorder}` }}>
        <Briefcase size={16} className="mt-0.5 shrink-0" />
        <div>
          <b>Executives</b> have broad read and approval access across attendance, leave, policies, and assets — but cannot create or delete employee accounts or change system settings. Permissions are enforced via the RBAC roles stored in PostgreSQL.
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2.5 font-medium">Executive</th>
              <th className="px-4 py-2.5 font-medium hidden md:table-cell">Position</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Phone</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map(u => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} />
                    <div>
                      <div className="font-medium text-slate-800">{u.name}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell"><Pill tone="dark">{u.title || "Executive"}</Pill></td>
                <td className="px-4 py-3 hidden sm:table-cell text-slate-600">{u.phone || "—"}</td>
                <td className="px-4 py-3">
                  <Pill tone={u.status === "active" ? "green" : "slate"}>{u.status === "active" ? "Active" : "Inactive"}</Pill>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => toggleStatus(u)} className="px-2 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500" title={u.status === "active" ? "Deactivate" : "Activate"}>
                      {u.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => openReset(u)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400" title="Reset password"><RefreshCw size={14} /></button>
                    <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400" title="Edit"><Edit2 size={14} /></button>
                    <button onClick={() => openDel(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No executives yet. Click "Add executive" to create one.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add executive" wide>
        <div className="space-y-3">
          <ErrBox msg={ferr} />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Full name" value={form.name} onChange={v => setForm({ ...form, name: v })} required Icon={User} />
            <TextInput label="Phone number" value={form.phone} onChange={v => setForm({ ...form, phone: v })} Icon={Phone} />
            <TextInput label="Email" type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} required Icon={Mail} />
            <SelectInput label="Position / role" value={form.title} onChange={v => setForm({ ...form, title: v })}
              options={EXECUTIVE_POSITIONS.map(p => ({ value: p, label: p }))} required />
            <div className="col-span-2">
              <PwInput label="Login password" value={form.password} onChange={v => setForm({ ...form, password: v })} placeholder="Min. 8 characters" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Btn onClick={saveAdd}><UserPlus size={14} />Create executive</Btn>
          <Btn variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit executive" wide>
        <div className="space-y-3">
          <ErrBox msg={ferr} />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Full name" value={form.name} onChange={v => setForm({ ...form, name: v })} required Icon={User} />
            <TextInput label="Phone number" value={form.phone} onChange={v => setForm({ ...form, phone: v })} Icon={Phone} />
            <TextInput label="Email" type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} required Icon={Mail} />
            <SelectInput label="Position / role" value={form.title} onChange={v => setForm({ ...form, title: v })}
              options={EXECUTIVE_POSITIONS.map(p => ({ value: p, label: p }))} required />
            <SelectInput label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })}
              options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive (blocked)" }]} />
            <div className="col-span-2">
              <PwInput label="New password (optional)" value={form.password} onChange={v => setForm({ ...form, password: v })} placeholder="Leave blank to keep current" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Btn onClick={saveEdit}><Save size={14} />Save changes</Btn>
          <Btn variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Delete executive">
        <p className="text-sm text-slate-600 mb-4">Permanently remove <b>{delTgt?.name}</b>? This cannot be undone.</p>
        <div className="flex gap-2">
          <Btn variant="danger" onClick={confirmDel}><Trash2 size={14} />Delete</Btn>
          <Btn variant="ghost" onClick={() => setDelOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset credentials">
        <p className="text-sm text-slate-600 mb-4">Generate a new temporary password for <b>{resetTgt?.name}</b>.</p>
        <Btn onClick={doPasswordReset}><RefreshCw size={14} />Generate new password</Btn>
        {resetResult && <div className="mt-3 p-3 rounded-lg text-sm font-mono bg-emerald-50 border border-emerald-200 text-emerald-800">{resetResult}</div>}
      </Modal>
    </div>
  );
}

/* ─── ANNOUNCEMENTS ─── */
function AnnouncementsPage({ currentUser, anns, setAnns, roles }) {
  const canManage = can(currentUser.role, "manage_announcements", roles);
  const [addOpen, setAddOpen] = useState(false);
  const [nt, setNt] = useState(""); const [nb, setNb] = useState("");

  function addAnn() {
    if (!nt.trim()) return;
    setAnns(p => [{ id: "a" + Date.now(), title: nt, body: nb, date: new Date().toLocaleDateString(), author: currentUser.name }, ...p]);
    setNt(""); setNb(""); setAddOpen(false);
  }

  function deleteAnn(id) {
    if (!window.confirm("Delete this announcement?")) return;
    setAnns(p => p.filter(a => a.id !== id));
  }

  return (
    <div className="max-w-2xl space-y-4">
      {canManage && <Btn onClick={() => setAddOpen(true)}><Plus size={14} />New announcement</Btn>}
      {anns.length === 0 && (
        <Card className="p-8 text-center text-slate-400 text-sm">No announcements yet.</Card>
      )}
      {anns.map(a => (
        <Card key={a.id} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: B.dark }}>{a.title}</div>
              <div className="text-sm text-slate-500 mt-1">{a.body}</div>
              <div className="mt-2 text-xs text-slate-400">{a.author} · {a.date}</div>
            </div>
            {canManage && (
              <button onClick={() => deleteAnn(a.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 shrink-0"
                title="Delete announcement">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </Card>
      ))}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New announcement">
        <div className="space-y-3">
          <TextInput label="Title" value={nt} onChange={setNt} required placeholder="Announcement title" />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Message</label>
            <textarea value={nb} onChange={e => setNb(e.target.value)} rows={4} placeholder="Message body…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none resize-none" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Btn onClick={addAnn}><Send size={14} />Publish</Btn>
          <Btn variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}

/* ─── COMPANY POLICIES ─── */
const POLICY_CATEGORIES = [
  "Attendance", "Leave", "Code of Conduct", "IT", "Security", "HR", "Finance", "General",
];

function PoliciesPage({ currentUser, policies, setPolicies, roles }) {
  const canManage = can(currentUser.role, "manage_policies", roles);
  const [catFilter, setCatFilter] = useState("All");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [ferr, setFerr] = useState("");
  const blank = { title: "", category: "General", body: "" };
  const [form, setForm] = useState(blank);

  const categories = ["All", ...POLICY_CATEGORIES.filter(c => policies.some(p => p.category === c))];
  const list = policies
    .filter(p => catFilter === "All" || p.category === catFilter)
    .filter(p => (p.title + p.body + p.category).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  const viewing = policies.find(p => p.id === viewId);

  function openAdd() {
    setEditId(null);
    setForm(blank);
    setFerr("");
    setOpen(true);
  }

  function openEdit(p) {
    setEditId(p.id);
    setForm({ title: p.title, category: p.category, body: p.body || "" });
    setFerr("");
    setOpen(true);
  }

  function savePolicy() {
    if (!form.title.trim()) { setFerr("Policy title is required."); return; }
    if (!form.body.trim()) { setFerr("Policy content is required."); return; }
    const now = new Date().toLocaleString();
    if (editId) {
      setPolicies(prev => prev.map(p =>
        p.id === editId
          ? { ...p, title: form.title.trim(), category: form.category, body: form.body.trim(), version: (p.version || 1) + 1, updatedAt: now, updatedBy: currentUser.name }
          : p
      ));
    } else {
      setPolicies(prev => [{
        id: "pol-" + Date.now(),
        title: form.title.trim(),
        category: form.category,
        body: form.body.trim(),
        version: 1,
        updatedAt: now,
        updatedBy: currentUser.name,
        createdAt: now,
      }, ...prev]);
    }
    setOpen(false);
  }

  function deletePolicy(id) {
    if (!window.confirm("Delete this policy?")) return;
    setPolicies(prev => prev.filter(p => p.id !== id));
    if (viewId === id) setViewId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search policies…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {canManage && <Btn onClick={openAdd}><Plus size={14} />New policy</Btn>}
      </div>

      {!canManage && (
        <div className="p-3 rounded-xl text-sm flex gap-2 items-start" style={{ background: B.darkLight, color: B.dark, border: `1px solid ${B.darkBorder}` }}>
          <FileText size={16} className="mt-0.5 shrink-0" />
          <span>You always see the latest published version of each policy. When HR updates a policy, the version number increases and changes appear here immediately.</span>
        </div>
      )}

      {list.length === 0 ? (
        <Card className="p-8 text-center text-slate-400 text-sm">No policies found.</Card>
      ) : (
        <div className="grid gap-3">
          {list.map(p => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => setViewId(p.id)} className="text-left flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-semibold" style={{ color: B.dark }}>{p.title}</span>
                    <Pill tone="slate">{p.category}</Pill>
                    <Pill tone="blue">v{p.version || 1}</Pill>
                  </div>
                  <p className="text-sm text-slate-500 line-clamp-2">{p.body}</p>
                  <div className="mt-2 text-xs text-slate-400">
                    Updated {p.updatedAt || "—"}{p.updatedBy ? ` · ${p.updatedBy}` : ""}
                  </div>
                </button>
                {canManage && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400" title="Edit"><Edit2 size={15} /></button>
                    <button onClick={() => deletePolicy(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={15} /></button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? "Edit policy" : "New policy"} wide>
        <div className="space-y-3">
          <ErrBox msg={ferr} />
          <TextInput label="Title" value={form.title} onChange={v => setForm({ ...form, title: v })} required placeholder="e.g. Remote work attendance policy" />
          <SelectInput label="Category" value={form.category} onChange={v => setForm({ ...form, category: v })}
            options={POLICY_CATEGORIES.map(c => ({ value: c, label: c }))} required />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Policy content <span className="text-red-500">*</span></label>
            <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={10}
              placeholder="Write the full policy text…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 resize-y" />
          </div>
          {editId && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Saving will publish a new version. Employees will see this content immediately.
            </p>
          )}
          <div className="flex gap-2">
            <Btn onClick={savePolicy}><Save size={14} />{editId ? "Update policy" : "Publish policy"}</Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewId(null)} title={viewing?.title || "Policy"} wide>
        {viewing && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Pill tone="slate">{viewing.category}</Pill>
              <Pill tone="blue">Version {viewing.version || 1}</Pill>
            </div>
            <div className="text-xs text-slate-400">
              Last updated {viewing.updatedAt || "—"}{viewing.updatedBy ? ` by ${viewing.updatedBy}` : ""}
            </div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border-t border-slate-100 pt-3">
              {viewing.body}
            </div>
            {canManage && (
              <div className="flex gap-2 pt-2">
                <Btn size="sm" onClick={() => { setViewId(null); openEdit(viewing); }}><Edit2 size={13} />Edit</Btn>
                <Btn size="sm" variant="ghost" onClick={() => deletePolicy(viewing.id)}><Trash2 size={13} />Delete</Btn>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ─── COMPANY ASSETS ─── */
const ASSET_TYPES = [
  "Laptop", "PC", "Monitor", "Keyboard", "Mouse", "Headphones", "Mobile Phone", "Access Card", "Other",
];
const ASSET_CONDITIONS = ["New", "Good", "Fair", "Poor", "Damaged"];

function AssetsPage({ currentUser, users, assets, setAssets, roles }) {
  const canManage = can(currentUser.role, "manage_assets", roles);
  const canViewAll = can(currentUser.role, "view_all_assets", roles);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [ferr, setFerr] = useState("");
  const blank = {
    name: "", assetType: "Laptop", serialNumber: "", condition: "Good", remarks: "",
    assignedTo: "", assignedDate: "", returnDate: "",
  };
  const [form, setForm] = useState(blank);

  const employeeOptions = [
    { value: "", label: "Unassigned (available)" },
    ...users.filter(u => u.status === "active" && (isStaffRole(u.role) || isHrAdminRole(u.role))).map(u => ({ value: u.id, label: `${u.name} · ${u.dept || u.role}` })),
  ];

  const visible = canViewAll
    ? assets
    : assets.filter(a => a.assignedTo === currentUser.id && a.status === "assigned");

  const list = visible
    .filter(a => statusFilter === "All" || a.status === statusFilter)
    .filter(a => {
      const assignee = users.find(u => u.id === a.assignedTo);
      return (a.name + a.serialNumber + a.assetType + (assignee?.name || "")).toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function openAdd() {
    setEditId(null);
    setForm({ ...blank, assignedDate: todayKey() });
    setFerr("");
    setOpen(true);
  }

  function openEdit(a) {
    setEditId(a.id);
    setForm({
      name: a.name,
      assetType: a.assetType || "Other",
      serialNumber: a.serialNumber || "",
      condition: a.condition || "Good",
      remarks: a.remarks || "",
      assignedTo: a.assignedTo || "",
      assignedDate: a.assignedDate || "",
      returnDate: a.returnDate || "",
    });
    setFerr("");
    setOpen(true);
  }

  function deriveStatus(assignedTo, returnDate) {
    if (returnDate) return "returned";
    if (assignedTo) return "assigned";
    return "available";
  }

  function saveAsset() {
    if (!form.name.trim()) { setFerr("Asset name is required."); return; }
    if (!form.serialNumber.trim()) { setFerr("Asset ID / serial number is required."); return; }
    const assignedTo = form.assignedTo || null;
    if (assignedTo && !form.assignedDate) { setFerr("Assignment date is required when assigning an asset."); return; }
    const status = deriveStatus(assignedTo, form.returnDate);
    const now = new Date().toLocaleString();
    const payload = {
      name: form.name.trim(),
      assetType: form.assetType,
      serialNumber: form.serialNumber.trim(),
      condition: form.condition,
      remarks: form.remarks.trim(),
      assignedTo,
      assignedDate: assignedTo || form.returnDate ? form.assignedDate : "",
      returnDate: form.returnDate || "",
      status,
      updatedAt: now,
    };
    if (editId) {
      setAssets(prev => prev.map(a => a.id === editId ? { ...a, ...payload } : a));
    } else {
      setAssets(prev => [{ id: "ast-" + Date.now(), ...payload }, ...prev]);
    }
    setOpen(false);
  }

  function deleteAsset(id) {
    if (!window.confirm("Delete this asset record?")) return;
    setAssets(prev => prev.filter(a => a.id !== id));
  }

  function markReturned(a) {
    const returnDate = todayKey();
    setAssets(prev => prev.map(x =>
      x.id === a.id
        ? { ...x, returnDate, status: "returned", updatedAt: new Date().toLocaleString() }
        : x
    ));
  }

  function statusTone(status) {
    if (status === "assigned") return "green";
    if (status === "returned") return "blue";
    return "slate";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={canViewAll ? "Search assets…" : "Search my assets…"}
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        {canManage && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
            {["All", "available", "assigned", "returned"].map(s => (
              <option key={s} value={s}>{s === "All" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        )}
        {canManage && <Btn onClick={openAdd}><Plus size={14} />Add asset</Btn>}
      </div>

      {!canViewAll && (
        <div className="p-3 rounded-xl text-sm flex gap-2 items-start" style={{ background: B.darkLight, color: B.dark, border: `1px solid ${B.darkBorder}` }}>
          <Package size={16} className="mt-0.5 shrink-0" />
          <span>These are company assets currently assigned to you. Updates made by HR appear here immediately.</span>
        </div>
      )}

      {list.length === 0 ? (
        <Card className="p-8 text-center text-slate-400 text-sm">
          {canViewAll ? "No assets recorded yet." : "No company assets are currently assigned to you."}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-semibold">Asset</th>
                  <th className="px-4 py-3 font-semibold">Type / ID</th>
                  {canViewAll && <th className="px-4 py-3 font-semibold">Assigned to</th>}
                  <th className="px-4 py-3 font-semibold">Assigned</th>
                  <th className="px-4 py-3 font-semibold">Returned</th>
                  <th className="px-4 py-3 font-semibold">Condition</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {canManage && <th className="px-4 py-3 font-semibold" />}
                </tr>
              </thead>
              <tbody>
                {list.map(a => {
                  const assignee = users.find(u => u.id === a.assignedTo);
                  return (
                    <tr key={a.id} className="border-b border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{a.name}</div>
                        {a.remarks && <div className="text-xs text-slate-400 mt-0.5">{a.remarks}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div>{a.assetType}</div>
                        <div className="text-xs font-mono text-slate-400">{a.serialNumber || "—"}</div>
                      </td>
                      {canViewAll && (
                        <td className="px-4 py-3">{assignee ? assignee.name : <span className="text-slate-400">—</span>}</td>
                      )}
                      <td className="px-4 py-3">{a.assignedDate || "—"}</td>
                      <td className="px-4 py-3">{a.returnDate || "—"}</td>
                      <td className="px-4 py-3">{a.condition || "—"}</td>
                      <td className="px-4 py-3"><Pill tone={statusTone(a.status)}>{a.status}</Pill></td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            {a.status === "assigned" && (
                              <button onClick={() => markReturned(a)} className="px-2 py-1 text-xs rounded-lg hover:bg-blue-50 text-slate-500" title="Mark returned">Return</button>
                            )}
                            <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400"><Edit2 size={14} /></button>
                            <button onClick={() => deleteAsset(a.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? "Edit asset" : "Add company asset"} wide>
        <div className="space-y-3">
          <ErrBox msg={ferr} />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Asset name" value={form.name} onChange={v => setForm({ ...form, name: v })} required placeholder="e.g. Dell Latitude 5540" />
            <SelectInput label="Asset type" value={form.assetType} onChange={v => setForm({ ...form, assetType: v })}
              options={ASSET_TYPES.map(t => ({ value: t, label: t }))} required />
            <TextInput label="Asset ID / serial number" value={form.serialNumber} onChange={v => setForm({ ...form, serialNumber: v })} required placeholder="e.g. SN-ABC-12345" />
            <SelectInput label="Condition" value={form.condition} onChange={v => setForm({ ...form, condition: v })}
              options={ASSET_CONDITIONS.map(c => ({ value: c, label: c }))} />
            <SelectInput label="Assigned to" value={form.assignedTo} onChange={v => setForm({ ...form, assignedTo: v })}
              options={employeeOptions} />
            <TextInput label="Assignment date" type="date" value={form.assignedDate} onChange={v => setForm({ ...form, assignedDate: v })} />
            <TextInput label="Return date" type="date" value={form.returnDate} onChange={v => setForm({ ...form, returnDate: v })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
            <textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} rows={3}
              placeholder="Optional notes (charger included, desk location, etc.)"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none" />
          </div>
          <div className="flex gap-2">
            <Btn onClick={saveAsset}><Save size={14} />{editId ? "Save changes" : "Add asset"}</Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─── PAYROLL ─── */
function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function workingDaysInMonth(key) {
  const [y, m] = key.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow !== 0) count++; // Sunday off
  }
  return count;
}

function presentDaysInMonth(attendance, userId, key) {
  return attendance.filter(r => r.userId === userId && r.date.startsWith(key) && r.checkIn).length;
}

function lateDaysInMonth(attendance, userId, key, users) {
  const user = users.find(u => u.id === userId);
  if (!user) return 0;
  return attendance.filter(r => r.userId === userId && r.date.startsWith(key) && r.checkIn && isLateCheckIn(r.checkIn, user)).length;
}

function PayrollPage({ currentUser, users, attendance, payroll, setPayroll, company, roles }) {
  const canManage = can(currentUser.role, "manage_payroll", roles);
  const canViewOrgPayroll = can(currentUser.role, "view_payroll", roles) && isExecutiveRole(currentUser.role);
  const [month, setMonth] = useState(monthKey());
  const [genFor, setGenFor] = useState(null);   // user being generated
  const [slipView, setSlipView] = useState(null); // slip being viewed
  const [genForm, setGenForm] = useState({ basic: "", allowance: "0", bonus: "0", deduction: "0", note: "" });
  const [genErr, setGenErr] = useState("");

  const staff = canManage
    ? users.filter(u => u.status === "active" && isStaffRole(u.role))
    : activePayrollRoster(users, currentUser.role);
  const monthSlips = payroll.filter(s => s.month === month);
  const mySlips = payroll.filter(s => s.userId === currentUser.id).sort((a, b) => b.month.localeCompare(a.month));

  function openGenerate(u) {
    const existing = monthSlips.find(s => s.userId === u.id);
    if (existing) { setSlipView(existing); return; }
    const numericSalary = parseFloat(String(u.salary || "").replace(/[^0-9.]/g, "")) || 0;
    setGenForm({ basic: numericSalary ? String(numericSalary) : "", allowance: "0", bonus: "0", deduction: "0", note: "" });
    setGenErr("");
    setGenFor(u);
  }

  function generateSlip() {
    const basic = parseFloat(genForm.basic) || 0;
    if (basic <= 0) { setGenErr("Enter a valid basic salary."); return; }
    const workDays    = workingDaysInMonth(month);
    const presentDays = presentDaysInMonth(attendance, genFor.id, month);
    const lateDays    = lateDaysInMonth(attendance, genFor.id, month, users);
    const absentDays  = Math.max(0, workDays - presentDays);
    const perDay      = basic / workDays;
    const absentDeduction = Math.round(perDay * absentDays);
    const allowance   = parseFloat(genForm.allowance) || 0;
    const bonus       = parseFloat(genForm.bonus) || 0;
    const otherDeduction = parseFloat(genForm.deduction) || 0;
    const net = Math.round(basic + allowance + bonus - absentDeduction - otherDeduction);

    const slip = {
      id: "slip-" + Date.now(),
      userId: genFor.id,
      empName: genFor.name,
      empEmail: genFor.email,
      empTitle: genFor.title || genFor.role,
      month,
      workDays, presentDays, absentDays, lateDays,
      basic, allowance, bonus, absentDeduction, otherDeduction, net,
      note: genForm.note,
      bank: genFor.bank || null,
      generatedBy: currentUser.name,
      generatedOn: new Date().toLocaleDateString(),
      status: "generated",
    };
    setPayroll(p => [...p, slip]);
    setGenFor(null);
    setSlipView(slip);
  }

  function markPaid(id) {
    setPayroll(p => p.map(s => s.id === id ? { ...s, status: "paid", paidOn: new Date().toLocaleDateString() } : s));
    setSlipView(v => v && v.id === id ? { ...v, status: "paid", paidOn: new Date().toLocaleDateString() } : v);
  }

  function deleteSlip(id) {
    if (!window.confirm("Delete this salary slip?")) return;
    setPayroll(p => p.filter(s => s.id !== id));
    setSlipView(null);
  }

  const cur = company.currency || "PKR";

  /* ---------- Salary slip modal (shared) ---------- */
  const SlipModal = () => slipView && (
    <Modal open={true} onClose={() => setSlipView(null)} title="Salary slip" wide>
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        {/* Slip header */}
        <div className="p-5 flex items-center justify-between" style={{ background: B.dark }}>
          <AdforceLogo boxWidth={180} boxHeight={40} />
          <div className="text-right text-white">
            <div className="text-sm font-bold">Salary Slip</div>
            <div className="text-xs opacity-70">{monthLabel(slipView.month)}</div>
          </div>
        </div>
        {/* Employee info */}
        <div className="p-5 grid grid-cols-2 gap-3 text-sm border-b border-slate-100">
          <div><div className="text-xs text-slate-400">Employee</div><div className="font-medium text-slate-800">{slipView.empName}</div></div>
          <div><div className="text-xs text-slate-400">Designation</div><div className="font-medium text-slate-800">{slipView.empTitle}</div></div>
          <div><div className="text-xs text-slate-400">Email</div><div className="font-medium text-slate-800 text-xs">{slipView.empEmail}</div></div>
          <div><div className="text-xs text-slate-400">Status</div>
            {slipView.status === "paid"
              ? <Pill tone="green"><Check size={12} />Paid{slipView.paidOn ? ` · ${slipView.paidOn}` : ""}</Pill>
              : <Pill tone="amber"><Timer size={12} />Generated (unpaid)</Pill>}
          </div>
        </div>
        {/* Attendance summary */}
        <div className="px-5 py-3 grid grid-cols-4 gap-2 text-center border-b border-slate-100 bg-slate-50">
          {[["Working days", slipView.workDays], ["Present", slipView.presentDays], ["Absent", slipView.absentDays], ["Late", slipView.lateDays]].map(([l, v]) => (
            <div key={l}><div className="text-xs text-slate-400">{l}</div><div className="text-sm font-bold tabular-nums" style={{ color: B.dark }}>{v}</div></div>
          ))}
        </div>
        {/* Amounts */}
        <div className="p-5 space-y-2 text-sm">
          {[
            ["Basic salary",        slipView.basic,           false],
            ["Allowance",           slipView.allowance,       false],
            ["Bonus",               slipView.bonus,           false],
            ["Absent deduction",    -slipView.absentDeduction, true],
            ["Other deduction",     -slipView.otherDeduction,  true],
          ].filter(([, v]) => v !== 0).map(([l, v, isDed]) => (
            <div key={l} className="flex justify-between border-b border-slate-50 pb-2">
              <span className="text-slate-500">{l}</span>
              <span className={`font-medium tabular-nums ${isDed ? "text-red-600" : "text-slate-800"}`}>
                {v < 0 ? "-" : ""}{cur} {Math.abs(v).toLocaleString()}
              </span>
            </div>
          ))}
          <div className="flex justify-between pt-2">
            <span className="font-bold" style={{ color: B.dark }}>Net salary</span>
            <span className="font-bold text-lg tabular-nums" style={{ color: B.dark }}>{cur} {slipView.net.toLocaleString()}</span>
          </div>
          {slipView.note && <div className="text-xs text-slate-400 italic pt-1">Note: {slipView.note}</div>}
        </div>
        {/* Bank details */}
        {slipView.bank && (slipView.bank.bankName || slipView.bank.accountNo) && (
          <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-2">
            <Landmark size={13} />
            {slipView.bank.bankName} · {slipView.bank.accountTitle} · {slipView.bank.iban || slipView.bank.accountNo}
          </div>
        )}
        <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between">
          <span>Generated by {slipView.generatedBy} on {slipView.generatedOn}</span>
          <span>Adforce Solutions</span>
        </div>
      </div>
      <div className="flex gap-2 mt-4 flex-wrap">
        {canManage && slipView.status !== "paid" && (
          <Btn onClick={() => markPaid(slipView.id)}><Check size={14} />Mark as paid</Btn>
        )}
        <Btn variant="ghost" onClick={() => window.print()}><Receipt size={14} />Print / Save PDF</Btn>
        {canManage && (
          <Btn variant="danger" onClick={() => deleteSlip(slipView.id)}><Trash2 size={14} />Delete slip</Btn>
        )}
        <Btn variant="ghost" onClick={() => setSlipView(null)}>Close</Btn>
      </div>
    </Modal>
  );

  /* ---------- EMPLOYEE VIEW ---------- */
  if (!canManage && !canViewOrgPayroll) {
    return (
      <div className="max-w-2xl space-y-4">
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold" style={{ color: B.dark }}>My salary slips</h3>
          </div>
          {mySlips.length === 0
            ? <div className="p-8 text-center text-slate-400 text-sm">No salary slips yet. Slips appear here once HR generates them.</div>
            : (
              <div className="divide-y divide-slate-100">
                {mySlips.map(s => (
                  <button key={s.id} onClick={() => setSlipView(s)}
                    className="w-full px-5 py-3 flex items-center gap-3 hover:bg-slate-50 text-left">
                    <div className="p-2 rounded-lg" style={{ background: B.darkLight, color: B.dark }}><Wallet size={16} /></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">{monthLabel(s.month)}</div>
                      <div className="text-xs text-slate-400">{s.presentDays}/{s.workDays} days present</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums" style={{ color: B.dark }}>{cur} {s.net.toLocaleString()}</div>
                      {s.status === "paid" ? <Pill tone="green">Paid</Pill> : <Pill tone="amber">Pending</Pill>}
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </button>
                ))}
              </div>
            )
          }
        </Card>
        <SlipModal />
      </div>
    );
  }

  /* ---------- EXECUTIVE READ-ONLY ORG VIEW ---------- */
  if (canViewOrgPayroll && !canManage) {
    return (
      <div className="space-y-5">
        <div className="p-4 rounded-xl text-sm flex gap-3 items-start" style={{ background: B.darkLight, color: B.dark, border: `1px solid ${B.darkBorder}` }}>
          <Eye size={16} className="mt-0.5 shrink-0" />
          <div><b>View only.</b> Review salary slips and payroll records for employees and HR Admin. Generating or editing slips is restricted to HR Admin.</div>
        </div>
        <Card className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <STitle>Payroll month</STitle>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {[
              ["People", staff.length],
              ["Slips generated", monthSlips.length],
              ["Total payout", cur + " " + monthSlips.reduce((s, x) => s + x.net, 0).toLocaleString()],
            ].map(([l, v]) => (
              <div key={l} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-400">{l}</div>
                <div className="text-lg font-bold tabular-nums" style={{ color: B.dark }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold" style={{ color: B.dark }}>Salary slips — {monthLabel(month)}</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Name", "Role", "Listed salary", "Present / Working", "Late", "Slip", ""].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No active people on file.</td></tr>
              ) : staff.map(u => {
                const slip = monthSlips.find(s => s.userId === u.id);
                const present = presentDaysInMonth(attendance, u.id, month);
                const late = lateDaysInMonth(attendance, u.id, month, users);
                const workDays = workingDaysInMonth(month);
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} size={7} />
                        <div className="font-medium text-slate-800">{u.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Pill tone={isHrAdminRole(u.role) ? "dark" : "slate"}>{u.role}</Pill></td>
                    <td className="px-4 py-3 text-slate-600">{u.salary || "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{present} / {workDays}</td>
                    <td className="px-4 py-3">
                      {late > 0 ? <Pill tone="amber">{late} late</Pill> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {slip
                        ? (slip.status === "paid" ? <Pill tone="green"><Check size={12} />Paid</Pill> : <Pill tone="blue">Generated</Pill>)
                        : <Pill tone="slate">Not generated</Pill>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {slip && (
                        <Btn size="sm" variant="ghost" onClick={() => setSlipView(slip)}>View slip</Btn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <SlipModal />
      </div>
    );
  }

  /* ---------- ADMIN VIEW ---------- */
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <STitle>Payroll month</STitle>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none" />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {[
            ["Employees", staff.length],
            ["Slips generated", monthSlips.length],
            ["Total payout", cur + " " + monthSlips.reduce((s, x) => s + x.net, 0).toLocaleString()],
          ].map(([l, v]) => (
            <div key={l} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-400">{l}</div>
              <div className="text-lg font-bold tabular-nums" style={{ color: B.dark }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold" style={{ color: B.dark }}>Generate slips — {monthLabel(month)}</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
              {["Employee", "Present / Working", "Late days", "Slip", ""].map(h => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No active employees.</td></tr>
            ) : staff.map(u => {
              const slip = monthSlips.find(s => s.userId === u.id);
              const present = presentDaysInMonth(attendance, u.id, month);
              const late = lateDaysInMonth(attendance, u.id, month, users);
              const workDays = workingDaysInMonth(month);
              return (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={u.name} size={7} />
                      <div>
                        <div className="font-medium text-slate-800">{u.name}</div>
                        <div className="text-xs text-slate-400">{u.title || u.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{present} / {workDays}</td>
                  <td className="px-4 py-3">
                    {late > 0 ? <Pill tone="amber">{late} late</Pill> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {slip
                      ? (slip.status === "paid" ? <Pill tone="green"><Check size={12} />Paid</Pill> : <Pill tone="blue">Generated</Pill>)
                      : <Pill tone="slate">Not generated</Pill>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Btn size="sm" variant={slip ? "ghost" : "primary"} onClick={() => openGenerate(u)}>
                      {slip ? "View slip" : "Generate"}
                    </Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Generate modal */}
      {genFor && (
        <Modal open={true} onClose={() => setGenFor(null)} title={`Generate slip — ${genFor.name} (${monthLabel(month)})`}>
          <div className="space-y-4">
            <div className="p-3 rounded-lg text-xs grid grid-cols-3 gap-2 text-center" style={{ background: B.darkLight, color: B.dark }}>
              <div><b>{workingDaysInMonth(month)}</b><br />working days</div>
              <div><b>{presentDaysInMonth(attendance, genFor.id, month)}</b><br />present</div>
              <div><b>{lateDaysInMonth(attendance, genFor.id, month, users)}</b><br />late</div>
            </div>
            <TextInput label={`Basic salary (${cur})`} type="number" value={genForm.basic} onChange={v => setGenForm({ ...genForm, basic: v })} required placeholder="e.g. 80000" />
            <div className="grid grid-cols-3 gap-3">
              <TextInput label="Allowance" type="number" value={genForm.allowance} onChange={v => setGenForm({ ...genForm, allowance: v })} />
              <TextInput label="Bonus" type="number" value={genForm.bonus} onChange={v => setGenForm({ ...genForm, bonus: v })} />
              <TextInput label="Deduction" type="number" value={genForm.deduction} onChange={v => setGenForm({ ...genForm, deduction: v })} />
            </div>
            <TextInput label="Note (optional)" value={genForm.note} onChange={v => setGenForm({ ...genForm, note: v })} placeholder="e.g. Eid bonus included" />
            <div className="p-3 rounded-lg text-xs bg-amber-50 border border-amber-200 text-amber-800">
              Absent days are deducted automatically: (basic ÷ working days) × absent days. Sundays are off.
            </div>
            {genErr && <ErrBox msg={genErr} />}
            <div className="flex gap-2">
              <Btn onClick={generateSlip}><Wallet size={14} />Generate slip</Btn>
              <Btn variant="ghost" onClick={() => setGenFor(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      <SlipModal />
    </div>
  );
}

/* ─── NAV ─── */
const NAV = [
  { id: "home",          label: "Home",          icon: LayoutDashboard, permission: "view_dashboard" },
  { id: "people",        label: "People",         icon: Users,           permission: "view_people" },
  { id: "executives",    label: "Executives",     icon: Briefcase,       permission: "manage_executives" },
  { id: "attendance",    label: "Attendance",     icon: Clock,           permission: "view_attendance" },
  { id: "shortleave",    label: "Short Leave",    icon: Timer,           permission: "view_leave" },
  { id: "payroll",       label: "Payroll",        icon: Wallet,          permission: "view_payroll" },
  { id: "leave",         label: "Leave",          icon: Plane,           permission: "view_leave" },
  { id: "policies",      label: "Policies",       icon: FileText,        permission: "view_policies" },
  { id: "assets",        label: "Assets",         icon: Package,         permission: "view_assets" },
  { id: "announcements", label: "Announcements",  icon: Megaphone,       permission: "view_announcements" },
  { id: "myprofile",     label: "My Profile",     icon: User,            permission: null },
  { id: "settings",      label: "Settings",       icon: Settings,        permission: null },
];

const TITLES = {
  home:          ["Home",            "Adforce Solutions HR Portal"],
  payroll:       ["Payroll",         "Salary slips and payments"],
  people:        ["People",          "Employees, access & bank details"],
  executives:    ["Executives",      "Manage executive accounts & access"],
  attendance:    ["Attendance",      "Shift check-in, breaks & reports"],
  shortleave:    ["Short Leave",     "Partial-day leave requests"],
  leave:         ["Leave",           "Requests and approvals"],
  policies:      ["Company Policies","Latest HR policies by category"],
  assets:        ["Company Assets",  "Equipment assignment and tracking"],
  announcements: ["Announcements",   "Company-wide posts"],
  myprofile:     ["My Profile",      "Your information and password"],
  settings:      ["Settings",        "Account, security, preferences"],
};

/* ─── APP SHELL ─── */
export default function AdforceHR() {
  const [users,         setUsers]         = useState([]);
  const [attendance,    setAttendance]    = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [shortLeaveRequests, setShortLeaveRequests] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [payroll,       setPayroll]       = useState([]);
  const [policies,      setPolicies]      = useState([]);
  const [assets,        setAssets]        = useState([]);
  const [roles,         setRoles]         = useState([]);
  const [company,       setCompany]       = useState(DEFAULT_COMPANY);
  const [session,       setSession]       = useState(loadSession);
  const [route,         setRoute]         = useState("home");
  const [roleMenu,      setRoleMenu]      = useState(false);
  const [dbStatus,      setDbStatus]      = useState("loading"); // loading | ready | error
  const loadedRef = useRef(false);

  /* ── Load everything from PostgreSQL on startup ── */
  useEffect(() => {
    apiBootstrap()
      .then(d => {
        setUsers(d.users || []);
        setAttendance(d.attendance || []);
        setLeaveRequests(d.leave || []);
        setShortLeaveRequests(d.shortLeave || []);
        setAnnouncements(d.announcements || []);
        setPayroll(d.payroll || []);
        setPolicies(d.policies || []);
        setAssets(d.assets || []);
        setRoles(d.roles || []);
        setCompany({ ...DEFAULT_COMPANY, ...(d.company || {}) });
        loadedRef.current = true;
        setDbStatus("ready");
      })
      .catch(e => {
        console.error("Database connection failed:", e);
        setDbStatus("error");
      });
  }, []);

  /* ── Sync each collection to PostgreSQL when it changes ── */
  useEffect(() => { if (loadedRef.current) apiSave("users", users); }, [users]);
  useEffect(() => { if (loadedRef.current) apiSave("attendance", attendance); }, [attendance]);
  useEffect(() => { if (loadedRef.current) apiSave("leave", leaveRequests); }, [leaveRequests]);
  useEffect(() => { if (loadedRef.current) apiSave("short-leave", shortLeaveRequests); }, [shortLeaveRequests]);
  useEffect(() => { if (loadedRef.current) apiSave("announcements", announcements); }, [announcements]);
  useEffect(() => { if (loadedRef.current) apiSave("payroll", payroll); }, [payroll]);
  useEffect(() => { if (loadedRef.current) apiSave("policies", policies); }, [policies]);
  useEffect(() => { if (loadedRef.current) apiSave("assets", assets); }, [assets]);
  useEffect(() => { if (loadedRef.current) apiSave("company", company); }, [company]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const tick = () => {
      setAttendance(prev => {
        const next = applyAutoCheckouts(prev, users);
        return next === prev ? prev : next;
      });
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [users]);

  /* ── Session stays in browser localStorage ── */
  useEffect(() => {
    if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [session]);

  const currentUser = session ? users.find(u => u.id === session.userId) : null;

  function handleLogin(u)  { setSession({ userId: u.id }); setRoute("home"); }
  function handleLogout()  { setSession(null); setRoute("home"); setRoleMenu(false); }
  function handleFirstLoginDone(newPw) {
    setUsers(us => us.map(u => u.id === session.userId ? { ...u, password: newPw, firstLogin: false, tempPassword: undefined } : u));
  }

  /* ── Database status screens ── */
  if (dbStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: B.dark }}>
        <div className="text-center">
          <AdforceLogo boxWidth={200} boxHeight={80} align="center" className="mx-auto" />
          <div className="mt-6 flex items-center justify-center gap-2 text-white/70 text-sm">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Connecting to database...
          </div>
        </div>
      </div>
    );
  }

  if (dbStatus === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: B.dark }}>
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: B.redLight }}>
              <AlertTriangle size={20} style={{ color: B.red }} />
            </div>
            <h2 className="text-lg font-bold" style={{ color: B.dark }}>Cannot connect to database</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">The app could not reach the backend server. Make sure it is running:</p>
          <div className="p-4 rounded-lg bg-slate-900 text-emerald-400 text-xs font-mono space-y-1 mb-4">
            <div># In a separate terminal:</div>
            <div>cd server</div>
            <div>npm run dev</div>
          </div>
          <p className="text-xs text-slate-400 mb-4">Also check PostgreSQL is running (Windows Services → postgresql) and server/.env has the correct password.</p>
          <Btn onClick={() => window.location.reload()}><RefreshCw size={14} />Retry connection</Btn>
        </div>
      </div>
    );
  }

  if (!session || !currentUser) return <LoginPage users={users} onLogin={handleLogin} />;
  if (currentUser.firstLogin)   return <ForcePasswordChange onDone={handleFirstLoginDone} />;

  const role = currentUser.role;
  const nav  = NAV.filter(n => {
    if (n.id === "myprofile") return isStaffRole(role);
    if (!n.permission) return true;
    return can(role, n.permission, roles);
  });
  const [title, sub] = TITLES[route] || TITLES.home;

  return (
    <div className="min-h-screen bg-slate-50 flex" style={{ fontFamily: "Inter,ui-sans-serif,system-ui,sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-16 lg:w-56 flex flex-col shrink-0 sticky top-0 h-screen" style={{ background: B.dark }}>
        <div className="h-14 px-3 flex items-center justify-center lg:justify-start border-b border-white/10 overflow-hidden shrink-0">
          <div className="hidden lg:block">
            <AdforceLogo boxWidth={176} boxHeight={36} />
          </div>
          <div className="block lg:hidden">
            <AdforceLogo boxWidth={48} boxHeight={28} />
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map(n => (
            <button key={n.id} onClick={() => setRoute(n.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              style={route === n.id
                ? { background: "rgba(255,255,255,0.15)", color: B.white, fontWeight: 600 }
                : { color: "rgba(255,255,255,0.6)" }}>
              <n.icon size={16} className="shrink-0" />
              <span className="hidden lg:inline">{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-2 border-t border-white/10">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/10"
            style={{ color: "rgba(255,255,255,0.6)" }}>
            <LogOut size={16} className="shrink-0" />
            <span className="hidden lg:inline">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 sticky top-0 z-30">
          <div className="flex-1" />
          <div className="relative">
            <button onClick={() => setRoleMenu(!roleMenu)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
              <Avatar name={currentUser.name} size={7} />
              <div className="text-left hidden sm:block">
                <div className="text-xs font-medium text-slate-800 leading-tight">{currentUser.name}</div>
                <div className="text-xs text-slate-400 leading-tight">{role}</div>
              </div>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
            {roleMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50">
                <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-100">{currentUser.email}</div>
                <button onClick={() => { setRoute("settings"); setRoleMenu(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2" style={{ color: B.dark }}>
                  <Settings size={14} />Settings
                </button>
                <button onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                  <LogOut size={14} />Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto">
          <div className="mb-5">
            <h1 className="text-xl font-bold" style={{ color: B.dark }}>{title}</h1>
            <p className="text-sm text-slate-400">{sub}</p>
          </div>
          {route === "home"          && <Dashboard      currentUser={currentUser} users={users} setRoute={setRoute} attendance={attendance} setAttendance={setAttendance} shortLeaveRequests={shortLeaveRequests} setShortLeaveRequests={setShortLeaveRequests} leaveRequests={leaveRequests} setLeaveRequests={setLeaveRequests} setUsers={setUsers} roles={roles} />}
          {route === "people"        && <PeoplePage     users={users} setUsers={setUsers} currentUser={currentUser} attendance={attendance} setAttendance={setAttendance} payroll={payroll} setPayroll={setPayroll} leaveRequests={leaveRequests} setLeaveRequests={setLeaveRequests} shortLeaveRequests={shortLeaveRequests} setShortLeaveRequests={setShortLeaveRequests} roles={roles} />}
          {route === "executives"    && <ExecutivesPage users={users} setUsers={setUsers} />}
          {route === "attendance"    && <AttendancePage currentUser={currentUser} users={users} attendance={attendance} setAttendance={setAttendance} shortLeaveRequests={shortLeaveRequests} setShortLeaveRequests={setShortLeaveRequests} leaveRequests={leaveRequests} setLeaveRequests={setLeaveRequests} setUsers={setUsers} roles={roles} />}
          {route === "shortleave"    && <ShortLeavePage currentUser={currentUser} requests={shortLeaveRequests} setRequests={setShortLeaveRequests} users={users} attendance={attendance} setAttendance={setAttendance} roles={roles} />}
          {route === "payroll"       && <PayrollPage    currentUser={currentUser} users={users} attendance={attendance} payroll={payroll} setPayroll={setPayroll} company={company} roles={roles} />}
          {route === "leave"         && <LeavePage      currentUser={currentUser} requests={leaveRequests} setRequests={setLeaveRequests} users={users} setUsers={setUsers} roles={roles} />}
          {route === "policies"      && <PoliciesPage   currentUser={currentUser} policies={policies} setPolicies={setPolicies} roles={roles} />}
          {route === "assets"        && <AssetsPage     currentUser={currentUser} users={users} assets={assets} setAssets={setAssets} roles={roles} />}
          {route === "announcements" && <AnnouncementsPage currentUser={currentUser} anns={announcements} setAnns={setAnnouncements} roles={roles} />}
          {route === "myprofile"     && <MyProfilePage  currentUser={currentUser} users={users} setUsers={setUsers} onLogout={handleLogout} />}
          {route === "settings"      && <SettingsPage   currentUser={currentUser} users={users} setUsers={setUsers} onLogout={handleLogout} company={company} setCompany={setCompany} roles={roles} />}
        </main>
      </div>
    </div>
  );
}