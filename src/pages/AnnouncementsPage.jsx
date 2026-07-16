import React, { useState } from "react";
import { Send, Trash2, Plus } from "lucide-react";
import { B } from "../brand.jsx";
import { can } from "../utils.js";
import { Card, Modal, TextInput, Btn } from "../components/ui.jsx";

export function AnnouncementsPage({ currentUser, anns, setAnns, roles }) {
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
