import React, { useState, useRef, useEffect } from "react";
import { Bell, Megaphone, FileText, Plane, AlertTriangle } from "lucide-react";
import { B } from "../brand.jsx";
import { apiMarkNotificationRead, apiMarkAllNotificationsRead } from "../api.js";
import { notificationsForUser, unreadCountForUser, formatTimeAgo } from "../notifications.js";

const TYPE_ICONS = {
  announcement: Megaphone,
  policy: FileText,
  leave: Plane,
  warning: AlertTriangle,
};

const MAX_SHOWN = 50;

export function NotificationBell({ currentUser, notifications, setNotifications, setRoute }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const mine = notificationsForUser(notifications, currentUser.id);
  const unread = unreadCountForUser(notifications, currentUser.id);
  const shown = mine.slice(0, MAX_SHOWN);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function markRead(id) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    apiMarkNotificationRead(id).catch(e => console.error("mark read failed:", e));
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n =>
      n.userId === currentUser.id ? { ...n, read: true } : n
    ));
    apiMarkAllNotificationsRead(currentUser.id).catch(e => console.error("mark all read failed:", e));
  }

  function openNotification(n) {
    if (!n) return;
    markRead(n.id);
    setOpen(false);
    const route = (n.link || "").replace(/^\//, "");
    if (route) setRoute(route);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: B.red }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(100vw-2rem,380px)] bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold" style={{ color: B.dark }}>Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-medium hover:underline" style={{ color: B.dark }}>
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-400">No notifications yet.</div>
            ) : shown.map(n => {
              if (!n) return null;
              const Icon = TYPE_ICONS[n.type] || Bell;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotification(n)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 flex gap-3 ${
                    !n.read ? "border-l-4 border-l-blue-500 bg-blue-50/30" : "border-l-4 border-l-transparent"
                  }`}
                >
                  <div className="shrink-0 mt-0.5 p-1.5 rounded-lg bg-slate-100 text-slate-600">
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{n.title}</span>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                    </div>
                    {n.body && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">{formatTimeAgo(n.createdAt)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
