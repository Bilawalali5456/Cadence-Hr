import { apiSendNotificationEmail } from "./api.js";
import { formatDate, isStaffRole } from "./utils.js";

let _seq = 0;

export function createNotification({ userId, title, body, type, link }) {
  _seq += 1;
  return {
    id: `ntf-${Date.now()}-${_seq}`,
    userId,
    title,
    body: body || "",
    type,
    read: false,
    createdAt: new Date().toISOString(),
    link: (link || "").replace(/^\//, ""),
  };
}

export function formatTimeAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < 60000) return "Just now";
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  if (ms < 604800000) return `${Math.floor(ms / 86400000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function notificationsForUser(notifications, userId) {
  return (notifications || [])
    .filter(n => n && n.userId === userId)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function unreadCountForUser(notifications, userId) {
  return notificationsForUser(notifications, userId).filter(n => !n.read).length;
}

export function activeEmployeesAndManagers(users) {
  return (users || []).filter(u =>
    u && u.status === "active" && (u.role === "Employee" || u.role === "Manager")
  );
}

export function activeEmployees(users) {
  return (users || []).filter(u => u && u.status === "active" && isStaffRole(u.role));
}

export function buildAnnouncementNotifications(users, announcementTitle) {
  return activeEmployeesAndManagers(users).map(u =>
    createNotification({
      userId: u.id,
      title: "New Announcement",
      body: announcementTitle,
      type: "announcement",
      link: "announcements",
    })
  );
}

export function buildPolicyNotifications(users, policyTitle) {
  return activeEmployees(users).map(u =>
    createNotification({
      userId: u.id,
      title: "New Policy Added",
      body: policyTitle,
      type: "policy",
      link: "policies",
    })
  );
}

export function buildLeaveStatusNotification(req, newStatus) {
  if (!req || (newStatus !== "approved" && newStatus !== "rejected")) return null;
  const label = newStatus === "approved" ? "Approved" : "Rejected";
  const dates = `${formatDate(req.from)} – ${formatDate(req.to)}`;
  return createNotification({
    userId: req.userId,
    title: `Leave ${label}`,
    body: `Your ${req.type} leave request for ${dates} has been ${newStatus}.`,
    type: "leave",
    link: "leave",
  });
}

export function buildWarningNotification(userId, reason) {
  return createNotification({
    userId,
    title: "New Notice",
    body: reason.trim(),
    type: "warning",
    link: "myprofile",
  });
}

export async function sendAnnouncementEmails(users, { title, body }) {
  const recipients = activeEmployeesAndManagers(users);
  const subject = `Adforce HR — ${title}`;
  const portalLink = "https://hr.adforcesolutions.com";
  await Promise.allSettled(recipients.map(u => {
    if (!u.email) return Promise.resolve();
    return apiSendNotificationEmail({
      to: u.email,
      name: u.name,
      subject,
      body: `${title}\n\n${body || ""}`.trim(),
      link: portalLink,
    });
  }));
}

export async function sendPolicyEmails(users, { title, body }) {
  const recipients = activeEmployees(users);
  const subject = `Adforce HR — New policy: ${title}`;
  const portalLink = "https://hr.adforcesolutions.com";
  await Promise.allSettled(recipients.map(u => {
    if (!u.email) return Promise.resolve();
    return apiSendNotificationEmail({
      to: u.email,
      name: u.name,
      subject,
      body: body ? `${title}\n\n${body}` : title,
      link: portalLink,
    });
  }));
}
