import React, { useState } from "react";
import { Briefcase, Search, UserPlus, Trash2, Edit2, User, Save, Phone, Mail, RefreshCw } from "lucide-react";
import { B } from "../brand.jsx";
import { apiSendCredentials } from "../api.js";
import { todayKey, genId, genTempPw } from "../utils.js";
import { Pill, Avatar, Card, Modal, TextInput, SelectInput, PwInput, Btn, ErrBox, OkBox } from "../components/ui.jsx";

export const EXECUTIVE_POSITIONS = [
  "CEO", "CTO", "COO", "CFO", "CMO", "Team Lead", "Director", "VP", "Other",
];

export function ExecutivesPage({ users, setUsers }) {
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
  const [emailSending, setEmailSending] = useState(false);
  const [pageOk, setPageOk] = useState("");
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
      skills: [],
      firstLogin: true,
    };
    setEmailSending(true);
    setFerr("");
    setUsers(p => [...p, newUser]);
    apiSendCredentials({
      to: email,
      name: form.name.trim(),
      email,
      password: form.password,
      role: "Executive",
    })
      .then(() => {
        setAddOpen(false);
        setPageOk(`Login credentials sent to ${email}.`);
        setTimeout(() => setPageOk(""), 6000);
      })
      .catch(e => {
        setFerr(`Account was created, but the email could not be sent: ${e.message}`);
      })
      .finally(() => setEmailSending(false));
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
    setEmailSending(true);
    setResetResult("");
    setUsers(p => p.map(u => u.id === resetTgt.id ? { ...u, password: tempPw, firstLogin: true, tempPassword: tempPw } : u));
    apiSendCredentials({
      to: resetTgt.email,
      name: resetTgt.name,
      email: resetTgt.email,
      password: tempPw,
      role: "Executive",
      isReset: true,
    })
      .then(() => {
        setResetResult(`A new temporary password was emailed to ${resetTgt.email}.`);
      })
      .catch(e => {
        setResetResult(`Password was reset, but the email could not be sent: ${e.message}`);
      })
      .finally(() => setEmailSending(false));
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

      {pageOk && <div className="mb-4"><OkBox msg={pageOk} /></div>}

      <div className="mb-4 p-4 rounded-xl text-sm flex gap-3 items-start" style={{ background: B.darkLight, color: B.dark, border: `1px solid ${B.darkBorder}` }}>
        <Briefcase size={16} className="mt-0.5 shrink-0" />
        <div>
          <b>Executives</b> are the highest authority in the portal — they have all HR Admin capabilities (people, payroll, assets, settings, etc.) plus the ability to override leave decisions and manage HR Admin accounts. Permissions are enforced via the RBAC roles stored in PostgreSQL.
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
          <div className="p-3 rounded-lg text-xs" style={{ background: B.darkLight, color: B.dark }}>
            Login credentials will be emailed to the address above after the account is created.
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Btn onClick={saveAdd} disabled={emailSending}><UserPlus size={14} />{emailSending ? "Sending email…" : "Create executive"}</Btn>
          <Btn variant="ghost" onClick={() => setAddOpen(false)} disabled={emailSending}>Cancel</Btn>
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
        <p className="text-sm text-slate-600 mb-4">Email a new temporary password to <b>{resetTgt?.name}</b> at <b>{resetTgt?.email}</b>.</p>
        <Btn onClick={doPasswordReset} disabled={emailSending}><RefreshCw size={14} />{emailSending ? "Sending email…" : "Email new password"}</Btn>
        {resetResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${resetResult.includes("could not be sent") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>
            {resetResult}
          </div>
        )}
      </Modal>
    </div>
  );
}
