import React, { useState } from "react";
import { Search, Trash2, Edit2, Save, Plus, FileText } from "lucide-react";
import { B } from "../brand.jsx";
import { can, isHrAdminRole, isExecutiveRole } from "../utils.js";
import { Pill, Card, Modal, TextInput, SelectInput, Btn, ErrBox } from "../components/ui.jsx";
import { buildPolicyNotifications, sendPolicyEmails } from "../notifications.js";

export const POLICY_CATEGORIES = [
  "Attendance", "Leave", "Code of Conduct", "IT", "Security", "HR", "Finance", "General",
];

export function PoliciesPage({ currentUser, policies, setPolicies, roles, users = [], notifications, setNotifications }) {
  const canManage =
    can(currentUser.role, "manage_policies", roles) ||
    isHrAdminRole(currentUser.role) ||
    isExecutiveRole(currentUser.role);
  const [catFilter, setCatFilter] = useState("All");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [ferr, setFerr] = useState("");
  const blank = { title: "", category: "General", body: "" };
  const [form, setForm] = useState(blank);

  const categories = ["All", ...POLICY_CATEGORIES.filter(c => (policies || []).some(p => p && p.category === c))];
  const list = (policies || [])
    .filter(p => p && p.title)
    .filter(p => catFilter === "All" || p.category === catFilter)
    .filter(p => (p.title + (p.body || "") + (p.category || "")).toLowerCase().includes(q.toLowerCase()))
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
      const policy = {
        id: "pol-" + Date.now(),
        title: form.title.trim(),
        category: form.category,
        body: form.body.trim(),
        version: 1,
        updatedAt: now,
        updatedBy: currentUser.name,
        createdAt: now,
      };
      setPolicies(prev => [policy, ...prev]);
      const newNotes = buildPolicyNotifications(users, policy.title);
      if (newNotes.length && setNotifications) setNotifications(prev => [...prev, ...newNotes]);
      sendPolicyEmails(users, { title: policy.title, body: policy.body }).catch(e => console.error("Policy emails failed:", e));
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
