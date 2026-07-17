export const API_URL = "/api";
export const SESSION_STORAGE_KEY = "adforce-hr-session"; // login session stays in browser
export const HOLIDAYS_STORAGE_KEY = "adforce-hr-holidays";

export async function apiBootstrap() {
  const res = await fetch(`${API_URL}/bootstrap`);
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

export async function apiSave(collection, data) {
  try {
    const res = await fetch(`${API_URL}/${collection}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) console.error(`Failed to sync ${collection}:`, res.status);
  } catch (e) {
    console.error(`Failed to sync ${collection}:`, e);
  }
}

export async function apiFetchNotifications() {
  const res = await fetch(`${API_URL}/notifications`);
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

export async function apiMarkNotificationRead(id) {
  const res = await fetch(`${API_URL}/notifications/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error("Failed to mark notification read");
  return res.json();
}

export async function apiMarkAllNotificationsRead(userId) {
  const res = await fetch(`${API_URL}/notifications/read-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("Failed to mark all notifications read");
  return res.json();
}

export async function apiSendNotificationEmail({ to, name, subject, body, link }) {
  const res = await fetch(`${API_URL}/send-notification-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, name, subject, body, link }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to send notification email");
  return data;
}

export async function apiSendCredentials({ to, name, email, password, role, isReset = false }) {
  const res = await fetch(`${API_URL}/send-credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, name, email, password, role, isReset }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to send email");
  return data;
}

export async function apiLogin(email, password) {
  const res = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Login failed");
  return data;
}

export async function apiChangePassword({ userId, currentPassword, newPassword }) {
  const res = await fetch(`${API_URL}/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  return safeList(list).filter(r => r && r.userId && r.date);
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
