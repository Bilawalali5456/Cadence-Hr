export const API_URL = "/api";
export const SESSION_STORAGE_KEY = "adforce-hr-session"; // login session stays in browser

export async function apiBootstrap() {
  const res = await fetch(`${API_URL}/bootstrap`);
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

export async function apiSave(collection, data) {
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

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
