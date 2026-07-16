import React, { useState } from "react";
import { Search, Trash2, Edit2, Save, Plus, Phone, Package } from "lucide-react";
import { B } from "../brand.jsx";
import { can, isStaffRole, isHrAdminRole, todayKey } from "../utils.js";
import { Pill, Card, Modal, TextInput, SelectInput, Btn, ErrBox } from "../components/ui.jsx";

export const ASSET_TYPES = [
  "Laptop", "PC", "Monitor", "Keyboard", "Mouse", "Headphones", "Mobile Phone", "Access Card", "Other",
];
export const ASSET_CONDITIONS = ["New", "Good", "Fair", "Poor", "Damaged"];

export function AssetsPage({ currentUser, users, assets, setAssets, roles }) {
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
