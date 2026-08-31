import { monthKey } from "./utils.js";

export const API_URL = "/api";
export const SESSION_STORAGE_KEY = "adforce-hr-session"; // login session stays in browser
export const HOLIDAYS_STORAGE_KEY = "adforce-hr-holidays";

/** Auth headers for API calls. Sends Bearer + X-Session-Token (nginx often strips Authorization). */
function authHeaders() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    const session = raw ? JSON.parse(raw) : null;
    const token = session?.token;
    if (!token) return {};
    return {
      Authorization: `Bearer ${token}`,
      "X-Session-Token": token,
    };
  } catch {
    return {};
  }
}

/** Same-origin fetch that always sends cookies (session cookie backup). */
function apiFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: { ...(options.headers || {}) },
  });
}

/** Save login session token immediately (before React state updates). */
export function persistSessionToken(userId, token) {
  if (!userId || !token) return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ userId, token }));
}

export async function apiBootstrap() {
  const res = await apiFetch(`${API_URL}/bootstrap?v=${Date.now()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

async function apiGetJson(path) {
  const res = await apiFetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status} (${path})`);
  }
  return res.json();
}

export async function apiFetchUsers({ selfOnly = false } = {}) {
  // HR Admin / Executive: GET /api/users returns full roster.
  // Employee / Manager: never call the roster endpoint (403) — fetch own profile only.
  if (!selfOnly) {
    try {
      const res = await apiFetch(`${API_URL}/users`, { headers: authHeaders() });
      if (res.ok) return await res.json();
      if (res.status !== 401 && res.status !== 403) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      // 403/401: fall through to own profile (avoids throwing; browser may still log 403 if we hit roster)
    } catch (e) {
      // Network / parse errors — try own profile next
    }
  }
  const s = loadSession();
  if (!s?.userId) throw new Error("Missing session for fetching own user");
  const self = await apiGetJson(`/users/${encodeURIComponent(s.userId)}`);
  return Array.isArray(self) ? self : [self];
}

export async function apiFetchAttendance(params = {}) {
  const q = new URLSearchParams();
  if (params.month) q.set("month", params.month);
  if (params.date) q.set("date", params.date);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.userId) q.set("userId", params.userId);
  const qs = q.toString() ? `?${q}` : "";
  const data = await apiGetJson(`/attendance${qs}`);
  return sanitizeAttendance(data);
}

export async function apiFetchLatePenalties(month) {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  const data = await apiGetJson(`/late-penalties${q}`);
  return Array.isArray(data) ? data : [];
}

export async function apiFetchMyLatePenalty(month) {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  return apiGetJson(`/late-penalties/me${q}`);
}

export async function apiFetchLeave() {
  return sanitizeLeaveRequests(await apiGetJson("/leave"));
}

export async function apiFetchShortLeave() {
  return sanitizeShortLeaveRequests(await apiGetJson("/short-leave"));
}

export async function apiFetchPayroll() {
  const data = await apiGetJson("/payroll");
  return Array.isArray(data) ? data : [];
}

export async function apiGetPayroll(params = {}) {
  const q = new URLSearchParams();
  if (params.month) q.set("month", params.month);
  if (params.userId) q.set("userId", params.userId);
  const qs = q.toString() ? `?${q}` : "";
  const data = await apiGetJson(`/payroll${qs}`);
  return Array.isArray(data) ? data : [];
}

export async function apiCreatePayroll(slip) {
  const res = await apiFetch(`${API_URL}/payroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(slip),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Create payroll failed (${res.status})`);
  return body.slip || null;
}

export async function apiUpdatePayroll(id, patch) {
  const res = await apiFetch(`${API_URL}/payroll/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Update payroll failed (${res.status})`);
  return body.slip || null;
}

export async function apiDeletePayroll(id) {
  const res = await apiFetch(`${API_URL}/payroll/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Delete payroll failed (${res.status})`);
  return true;
}

export async function apiFetchHolidays() {
  return sanitizeHolidays(await apiGetJson("/holidays"));
}

export async function apiGetHolidays() {
  return apiFetchHolidays();
}

export async function apiCreateHoliday(data) {
  const res = await apiFetch(`${API_URL}/holidays`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Create holiday failed (${res.status})`);
  const list = sanitizeHolidays(body.holiday ? [body.holiday] : []);
  return list[0] || body.holiday || null;
}

export async function apiUpdateHoliday(id, patch) {
  const res = await apiFetch(`${API_URL}/holidays/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Update holiday failed (${res.status})`);
  const list = sanitizeHolidays(body.holiday ? [body.holiday] : []);
  return list[0] || body.holiday || null;
}

export async function apiDeleteHoliday(id) {
  const res = await apiFetch(`${API_URL}/holidays/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Delete holiday failed (${res.status})`);
  return true;
}

export async function apiFetchPolicies() {
  const data = await apiGetJson("/policies");
  return Array.isArray(data) ? data : [];
}

export async function apiGetPolicies() {
  return apiFetchPolicies();
}

export async function apiCreatePolicy(data) {
  const res = await apiFetch(`${API_URL}/policies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Create policy failed (${res.status})`);
  return body.policy || null;
}

export async function apiUpdatePolicy(id, patch) {
  const res = await apiFetch(`${API_URL}/policies/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Update policy failed (${res.status})`);
  return body.policy || null;
}

export async function apiDeletePolicy(id) {
  const res = await apiFetch(`${API_URL}/policies/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Delete policy failed (${res.status})`);
  return true;
}

export async function apiFetchAssets() {
  const data = await apiGetJson("/assets");
  return Array.isArray(data) ? data : [];
}

export async function apiGetAssets() {
  return apiFetchAssets();
}

export async function apiCreateAsset(data) {
  const res = await apiFetch(`${API_URL}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Create asset failed (${res.status})`);
  return body.asset || null;
}

export async function apiUpdateAsset(id, patch) {
  const res = await apiFetch(`${API_URL}/assets/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Update asset failed (${res.status})`);
  return body.asset || null;
}

export async function apiDeleteAsset(id) {
  const res = await apiFetch(`${API_URL}/assets/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Delete asset failed (${res.status})`);
  return true;
}

export async function apiFetchAnnouncements() {
  return sanitizeAnnouncements(await apiGetJson("/announcements"));
}

// REST announcement CRUD (granular endpoints)
export async function apiGetAnnouncements() {
  return apiFetchAnnouncements();
}

export async function apiCreateAnnouncement(data) {
  const res = await apiFetch(`${API_URL}/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Create announcement failed (${res.status})`);
  return sanitizeAnnouncements(body.announcement ? [body.announcement] : []).at(0) || body.announcement || null;
}

export async function apiUpdateAnnouncement(id, patch) {
  const res = await apiFetch(`${API_URL}/announcements/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Update announcement failed (${res.status})`);
  return sanitizeAnnouncements(body.announcement ? [body.announcement] : []).at(0) || body.announcement || null;
}

export async function apiDeleteAnnouncement(id) {
  const res = await apiFetch(`${API_URL}/announcements/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Delete announcement failed (${res.status})`);
  return true;
}

export async function apiFetchWarnings() {
  return sanitizeWarnings(await apiGetJson("/warnings"));
}

export async function apiFetchBadges() {
  const res = await apiFetch(`${API_URL}/badges`, { headers: authHeaders() });
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

export async function apiMarkBadgeSeen(tab) {
  const res = await apiFetch(`${API_URL}/badges/seen`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ tab }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Mark badge seen failed (${res.status})`);
  }
  return res.json();
}

export async function apiGetWarnings(params = {}) {
  const q = new URLSearchParams();
  if (params.userId) q.set("userId", params.userId);
  const qs = q.toString() ? `?${q}` : "";
  return sanitizeWarnings(await apiGetJson(`/warnings${qs}`));
}

export async function apiCreateWarning(data) {
  const res = await apiFetch(`${API_URL}/warnings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Create warning failed (${res.status})`);
  const list = sanitizeWarnings(body.warning ? [body.warning] : []);
  return list[0] || body.warning || null;
}

export async function apiUpdateWarning(id, patch) {
  const res = await apiFetch(`${API_URL}/warnings/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Update warning failed (${res.status})`);
  const list = sanitizeWarnings(body.warning ? [body.warning] : []);
  return list[0] || body.warning || null;
}

export async function apiDeleteWarning(id) {
  const res = await apiFetch(`${API_URL}/warnings/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Delete warning failed (${res.status})`);
  return true;
}

export async function apiFetchCompany() {
  const data = await apiGetJson("/company");
  return data && typeof data === "object" ? data : {};
}

export async function apiUpdateCompany(patch) {
  const res = await apiFetch(`${API_URL}/company`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Update company failed (${res.status})`);
  return body.company || patch;
}

export async function apiFetchShifts() {
  const data = await apiGetJson("/shifts");
  return Array.isArray(data) ? data : [];
}

export async function apiCreateShift(data) {
  const res = await apiFetch(`${API_URL}/shifts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Create shift failed (${res.status})`);
  return body.shift || null;
}

export async function apiUpdateShift(id, patch) {
  const res = await apiFetch(`${API_URL}/shifts/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Update shift failed (${res.status})`);
  return body.shift || null;
}

export async function apiDeleteShift(id) {
  const res = await apiFetch(`${API_URL}/shifts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Delete shift failed (${res.status})`);
  return true;
}

export async function apiFetchRoles() {
  const data = await apiGetJson("/roles");
  return Array.isArray(data) ? data : [];
}

export async function apiCreateUser(userData) {
  const res = await apiFetch(`${API_URL}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(userData),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Create user failed (${res.status})`);
  return data;
}

export async function apiUpdateUser(userId, patch) {
  const res = await apiFetch(`${API_URL}/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Update user failed (${res.status})`);
  return data;
}

export async function apiCreateAttendance(record) {
  const res = await apiFetch(`${API_URL}/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(record),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Create attendance failed (${res.status})`);
  return data;
}

export async function apiUpdateAttendance(id, patch) {
  const res = await apiFetch(`${API_URL}/attendance/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Update attendance failed (${res.status})`);
  return data;
}

export async function apiStartBreak(date) {
  const res = await apiFetch(`${API_URL}/attendance/break/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ date }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to start break");
  if (data.record) data.record = sanitizeAttendance([data.record])[0] || data.record;
  return data;
}

export async function apiEndBreak(date) {
  const res = await apiFetch(`${API_URL}/attendance/break/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ date }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to end break");
  if (data.record) data.record = sanitizeAttendance([data.record])[0] || data.record;
  return data;
}

export async function apiWfhCheckin() {
  const res = await apiFetch(`${API_URL}/attendance/wfh-checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `WFH check-in failed (${res.status})`);
  const list = sanitizeAttendance([data]);
  return list[0] || data;
}

export async function apiWfhCheckout() {
  const res = await apiFetch(`${API_URL}/attendance/wfh-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `WFH check-out failed (${res.status})`);
  const list = sanitizeAttendance([data]);
  return list[0] || data;
}

export async function apiBreakStatus(date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  const res = await apiFetch(`${API_URL}/attendance/break/status${q}`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to get break status");
  if (data.record) data.record = sanitizeAttendance([data.record])[0] || data.record;
  return data;
}

export async function apiCreateLeaveRequest(payload) {
  const res = await apiFetch(`${API_URL}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Create leave failed (${res.status})`);
  return data;
}

export async function apiUpdateLeaveRequest(id, patch) {
  const res = await apiFetch(`${API_URL}/leave/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Update leave failed (${res.status})`);
  return data;
}

export async function apiDeleteLeaveRequest(id) {
  const res = await apiFetch(`${API_URL}/leave/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Delete leave failed (${res.status})`);
  return data;
}

export async function apiCreateShortLeaveRequest(payload) {
  const res = await apiFetch(`${API_URL}/short-leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Create short-leave failed (${res.status})`);
  return data;
}

export async function apiUpdateShortLeaveRequest(id, patch) {
  const res = await apiFetch(`${API_URL}/short-leave/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Update short-leave failed (${res.status})`);
  return data;
}

export async function apiDeleteShortLeaveRequest(id) {
  const res = await apiFetch(`${API_URL}/short-leave/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Delete short-leave failed (${res.status})`);
  return data;
}

/** Last sync error message per collection (for UI debugging). */
export const syncErrors = {};

export async function apiSave(collection, data) {
  try {
    const res = await apiFetch(`${API_URL}/${collection}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.error || `HTTP ${res.status}`;
      syncErrors[collection] = msg;
      console.error(`Failed to sync ${collection}:`, msg);
      return { ok: false, status: res.status, error: msg };
    }
    delete syncErrors[collection];
    return { ok: true };
  } catch (e) {
    syncErrors[collection] = e.message || String(e);
    console.error(`Failed to sync ${collection}:`, e);
    return { ok: false, error: e.message || String(e) };
  }
}

export async function apiDeleteEmployee(userId) {
  const res = await apiFetch(`${API_URL}/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Delete failed (${res.status})`);
  return body;
}

/** Remove an employee from all in-memory collections after server cascade delete. */
export function purgeEmployeeClientState(userId, setters = {}) {
  const {
    setUsers,
    setAttendance,
    setLeaveRequests,
    setShortLeaveRequests,
    setPayroll,
    setNotifications,
    setWarnings,
    setAssets,
  } = setters;
  if (setUsers) setUsers((p) => p.filter((u) => u.id !== userId));
  if (setAttendance) setAttendance((p) => p.filter((r) => r?.userId !== userId));
  if (setLeaveRequests) setLeaveRequests((p) => p.filter((r) => r?.userId !== userId));
  if (setShortLeaveRequests) setShortLeaveRequests((p) => p.filter((r) => r?.userId !== userId));
  if (setPayroll) setPayroll((p) => p.filter((s) => s?.userId !== userId));
  if (setNotifications) setNotifications((p) => p.filter((n) => n?.userId !== userId));
  if (setWarnings) setWarnings((p) => p.filter((w) => w?.userId !== userId));
  if (setAssets) {
    setAssets((p) => p.map((a) => (
      a?.assignedTo === userId
        ? { ...a, assignedTo: null, status: "available" }
        : a
    )));
  }
}

export async function apiFetchNotifications() {
  const res = await apiFetch(`${API_URL}/notifications`, { headers: authHeaders() });
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

export async function apiMarkNotificationRead(id) {
  const res = await apiFetch(`${API_URL}/notifications/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error("Failed to mark notification read");
  return res.json();
}

export async function apiMarkAllNotificationsRead(userId) {
  const res = await apiFetch(`${API_URL}/notifications/read-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("Failed to mark all notifications read");
  return res.json();
}

export async function apiSendNotificationEmail({ to, name, subject, body, link }) {
  const res = await apiFetch(`${API_URL}/send-notification-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ to, name, subject, body, link }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to send notification email");
  return data;
}

export async function apiSendCredentials({ to, name, email, password, role, isReset = false }) {
  const res = await apiFetch(`${API_URL}/send-credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ to, name, email, password, role, isReset }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || `Failed to send email (${res.status})`;
    console.error(`[api] send-credentials failed role=${role} to=${to}:`, msg);
    throw new Error(msg);
  }
  return data;
}

export async function apiSendWarningEmail({ to, name, warningType, reason, date }) {
  const res = await apiFetch(`${API_URL}/send-warning-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ to, name, warningType, reason, date }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to send warning email");
  return data;
}

export async function apiLogin(email, password) {
  const res = await apiFetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Login failed");
  // Persist token immediately so the next API call is authenticated
  if (data.ok && data.user?.id && data.sessionToken) {
    persistSessionToken(data.user.id, data.sessionToken);
  }
  return data;
}

export async function apiChangePassword({ userId, currentPassword, newPassword }) {
  const res = await apiFetch(`${API_URL}/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ userId, currentPassword, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to change password");
  return data;
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadHolidays() {
  try {
    const raw = localStorage.getItem(HOLIDAYS_STORAGE_KEY);
    return sanitizeHolidays(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

/** Drop null/undefined entries from API or localStorage arrays. */
export function safeList(arr) {
  return Array.isArray(arr) ? arr.filter(Boolean) : [];
}

export function sanitizeHolidays(list) {
  return safeList(list)
    .filter(h => h && h.date && h.title)
    .map(h => ({
      ...h,
      type: String(h.type ?? "public").trim().toLowerCase() === "optional" ? "optional" : "public",
    }));
}

export function sanitizeAttendance(list) {
  return safeList(list)
    .filter(r => r && (r.userId || r.user_id) && r.date != null && r.date !== "")
    .map(r => {
      const date = String(r.date ?? "").slice(0, 10);
      // API attToJs uses `status`; also accept dayStatus / snake_case fallbacks.
      const rawStatus = r.status ?? r.dayStatus ?? r.day_status ?? null;
      const status = rawStatus != null && String(rawStatus).trim() !== ""
        ? String(rawStatus).trim()
        : undefined;
      return {
        ...r,
        userId: r.userId || r.user_id,
        date,
        checkIn: r.checkIn ?? r.check_in ?? null,
        checkOut: r.checkOut ?? r.check_out ?? null,
        status,
        dayStatus: r.dayStatus ?? status,
        late: !!(r.late ?? r.isLate),
      };
    })
    .filter(r => r.userId && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

export function sanitizeLeaveRequests(list) {
  return safeList(list).filter(r => r && r.userId);
}

export function sanitizeShortLeaveRequests(list) {
  return safeList(list).filter(r => r && r.userId && r.date);
}

export function sanitizeAnnouncements(list) {
  return safeList(list).filter(a => a && a.id);
}

export function sanitizeNotifications(list) {
  return safeList(list).filter(n => n && n.id && n.userId && n.title);
}

export function sanitizeWarnings(list) {
  return safeList(list)
    .filter(w => w && (w.userId || w.user_id) && w.reason)
    .map(w => ({
      id: w.id,
      userId: w.userId || w.user_id,
      type: String(w.type || "verbal").toLowerCase(),
      reason: w.reason || "",
      date: w.date || "",
      issuedBy: w.issuedBy || w.issued_by || "",
      acknowledged: !!(w.acknowledged),
    }));
}

function biometricHeaders() {
  return { "Content-Type": "application/json", ...authHeaders() };
}

export async function apiBiometricStatus(userId) {
  const res = await apiFetch(`${API_URL}/biometric/status`, { headers: biometricHeaders() });
  if (!res.ok) throw new Error("Failed to load device status");
  return res.json();
}

export async function apiBiometricLogs(userId, date, method = "all") {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (method && method !== "all") params.set("method", method);
  const q = params.toString() ? `?${params}` : "";
  const res = await apiFetch(`${API_URL}/biometric/logs${q}`, { headers: biometricHeaders() });
  if (!res.ok) throw new Error("Failed to load biometric logs");
  return res.json();
}

export async function apiBiometricUsers(userId) {
  const res = await apiFetch(`${API_URL}/biometric/users`, { headers: biometricHeaders() });
  if (!res.ok) throw new Error("Failed to load biometric users");
  return res.json();
}

export async function apiBiometricMap(pin, employeeId) {
  const res = await apiFetch(`${API_URL}/biometric/map`, {
    method: "POST",
    headers: biometricHeaders(),
    body: JSON.stringify({ pin, employee_id: employeeId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to map user");
  return data;
}

export async function apiBiometricUnmap(pin, deviceSerial) {
  const q = deviceSerial ? `?device_serial_number=${encodeURIComponent(deviceSerial)}` : "";
  const res = await apiFetch(`${API_URL}/biometric/map/${encodeURIComponent(pin)}${q}`, {
    method: "DELETE",
    headers: biometricHeaders(),
  });
  if (!res.ok) throw new Error("Failed to remove mapping");
  return res.json();
}

export async function apiBiometricClearLogs(userId) {
  const res = await apiFetch(`${API_URL}/biometric/raw-logs`, {
    method: "DELETE",
    headers: biometricHeaders(),
  });
  if (!res.ok) throw new Error("Failed to clear logs");
  return res.json();
}

export async function apiBiometricProcess(userId) {
  const res = await apiFetch(`${API_URL}/biometric/process`, {
    method: "POST",
    headers: biometricHeaders(),
  });
  if (!res.ok) throw new Error("Failed to process logs");
  return res.json();
}

export async function apiRefreshAttendance() {
  return apiFetchAttendance({ month: monthKey() });
}
