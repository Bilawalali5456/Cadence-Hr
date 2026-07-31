import React, { useState } from "react";
import { Send, Trash2, Plus, Pencil } from "lucide-react";
import { B } from "../brand.jsx";
import { can, isHrOpsRole, isExecutiveRole } from "../utils.js";
import { buildAnnouncementNotifications, sendAnnouncementEmails } from "../notifications.js";
import { Card, Modal, TextInput, Btn } from "../components/ui.jsx";
import { apiCreateAnnouncement, apiUpdateAnnouncement, apiDeleteAnnouncement } from "../api.js";

export function AnnouncementsPage({ currentUser, anns = [], setAnns, roles, users = [], notifications, setNotifications }) {
  const list = (anns || []).filter(a => a && a.id);
  const canManage =
    can(currentUser.role, "manage_announcements", roles) ||
    isHrOpsRole(currentUser.role) ||
    isExecutiveRole(currentUser.role);
  const [addOpen, setAddOpen] = useState(false);
  const [nt, setNt] = useState("");
  const [nb, setNb] = useState("");
  const [err, setErr] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [et, setEt] = useState("");
  const [eb, setEb] = useState("");
  const [edate, setEdate] = useState("");

  async function addAnn() {
    setErr("");
    if (!nt.trim()) return;
    const title = nt.trim();
    const body = nb.trim();
    const date = new Date().toLocaleDateString();
    try {
      const saved = await apiCreateAnnouncement({ title, body, date, author: currentUser.name });
      if (!saved) throw new Error("Announcement was not saved.");
      setAnns(p => [saved, ...p]);
      const newNotes = buildAnnouncementNotifications(users, title);
      if (newNotes.length && setNotifications) setNotifications(prev => [...prev, ...newNotes]);
      sendAnnouncementEmails(users, { title, body }).catch(e => console.error("Announcement emails failed:", e));
      setNt("");
      setNb("");
      setAddOpen(false);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function deleteAnn(id) {
    if (!window.confirm("Delete this announcement?")) return;
    setErr("");
    try {
      await apiDeleteAnnouncement(id);
      setAnns(p => p.filter(a => a.id !== id));
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  function openEdit(a) {
    setErr("");
    setEditId(a.id);
    setEt(a.title || "");
    setEb(a.body || "");
    setEdate(a.date || new Date().toLocaleDateString());
    setEditOpen(true);
  }

  async function saveEdit() {
    setErr("");
    if (!editId) return;
    const title = et.trim();
    const body = eb.trim();
    if (!title || !body) return;
    try {
      const saved = await apiUpdateAnnouncement(editId, { title, body, date: edate, author: currentUser.name });
      setAnns(p => p.map(x => (x.id === editId ? saved : x)));
      setEditOpen(false);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {canManage && <Btn onClick={() => setAddOpen(true)}><Plus size={14} />New announcement</Btn>}
      {list.length === 0 && (
        <Card className="p-8 text-center text-slate-400 text-sm">No announcements yet.</Card>
      )}
      {list.map(a => (
        <Card key={a.id} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: B.dark }}>{a.title}</div>
              <div className="text-sm text-slate-500 mt-1">{a.body}</div>
              <div className="mt-2 text-xs text-slate-400">{a.author} · {a.date}</div>
            </div>
            {canManage && (
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(a)}
                  className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-700"
                  title="Edit announcement">
                  <Pencil size={15} />
                </button>
                <button onClick={() => deleteAnn(a.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                  title="Delete announcement">
                  <Trash2 size={15} />
                </button>
              </div>
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
          <p className="text-xs text-slate-400">All active employees and managers will be notified by email and in-app alert.</p>
          {err ? <div className="text-xs text-red-600">{err}</div> : null}
        </div>
        <div className="flex gap-2 mt-4">
          <Btn onClick={addAnn}><Send size={14} />Publish</Btn>
          <Btn variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit announcement">
        <div className="space-y-3">
          <TextInput label="Title" value={et} onChange={setEt} required placeholder="Announcement title" />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Message</label>
            <textarea value={eb} onChange={e => setEb(e.target.value)} rows={4} placeholder="Message body…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none resize-none" />
          </div>
          <p className="text-xs text-slate-400">Published date: {edate}</p>
          {err ? <div className="text-xs text-red-600">{err}</div> : null}
        </div>
        <div className="flex gap-2 mt-4">
          <Btn onClick={saveEdit}><Pencil size={14} />Save</Btn>
          <Btn variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}
