import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Trash2, Pencil, X, Settings2, ArrowLeft, Send,
} from "lucide-react";
import { B } from "../brand.jsx";
import { isExecutiveRole, hasStaffPortalRole, monthKey } from "../utils.js";
import { Card, STitle, Pill, Modal, TextInput, SelectInput, Btn, ErrBox } from "../components/ui.jsx";
import {
  apiFetchLeads, apiCreateLead, apiUpdateLead, apiDeleteLead,
  apiFetchLeadNotes, apiAddLeadNote,
  apiFetchLeadChannels, apiCreateLeadChannel, apiDeleteLeadChannel,
  apiFetchLeadDepartments, apiCreateLeadDepartment, apiDeleteLeadDepartment,
} from "../api.js";

export const LEAD_STAGES = [
  "New",
  "Contacted",
  "Proposal Sent",
  "Negotiation",
  "Won",
  "Lost",
];

const STAGE_TONE = {
  New: "blue",
  Contacted: "amber",
  "Proposal Sent": "orange",
  Negotiation: "purple",
  Won: "green",
  Lost: "red",
};

const STAGE_CHIP_STYLE = {
  New: { bg: "#2563EB", fg: "#fff" },
  Contacted: { bg: "#EAB308", fg: "#1e293b" },
  "Proposal Sent": { bg: "#EA580C", fg: "#fff" },
  Negotiation: { bg: "#7C3AED", fg: "#fff" },
  Won: { bg: "#16A34A", fg: "#fff" },
  Lost: { bg: "#DC2626", fg: "#fff" },
};

function stageTone(stage) {
  return STAGE_TONE[stage] || "slate";
}

function formatMoney(amount, currency) {
  const n = Number(amount) || 0;
  const cur = currency || "PKR";
  try {
    return `${cur} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  } catch {
    return `${cur} ${n}`;
  }
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-PK", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

function dateKeyFromIso(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function emptyLeadForm() {
  return {
    clientName: "",
    channel: "",
    department: "",
    assignedTo: "",
    amount: "0",
    currency: "PKR",
    description: "",
    contactInfo: "",
    notes: "",
    stage: "New",
  };
}

function StageFilterChips({ value, onChange, counts }) {
  const items = [{ id: "All", label: "All" }, ...LEAD_STAGES.map(s => ({ id: s, label: s }))];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(tab => {
        const active = value === tab.id;
        const count = counts?.[tab.id];
        const chip = STAGE_CHIP_STYLE[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              active ? "border-transparent text-white" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
            style={active
              ? (chip ? { background: chip.bg, color: chip.fg } : { background: B.dark, color: B.white })
              : undefined}
          >
            {tab.label}{count != null ? ` (${count})` : ""}
          </button>
        );
      })}
    </div>
  );
}

function computeStats(leads) {
  const month = monthKey();
  const thisMonth = leads.filter(l => dateKeyFromIso(l.createdAt).startsWith(month));
  const wonMonth = leads.filter(l =>
    l.stage === "Won" && dateKeyFromIso(l.updatedAt || l.createdAt).startsWith(month)
  );
  const lostMonth = leads.filter(l =>
    l.stage === "Lost" && dateKeyFromIso(l.updatedAt || l.createdAt).startsWith(month)
  );
  let revenuePkr = 0;
  let revenueUsd = 0;
  for (const l of wonMonth) {
    if ((l.currency || "PKR") === "USD") revenueUsd += Number(l.amount) || 0;
    else revenuePkr += Number(l.amount) || 0;
  }
  const byChannel = {};
  const byDept = {};
  const byEmployee = {};
  for (const l of thisMonth) {
    byChannel[l.channel] = (byChannel[l.channel] || 0) + 1;
    byDept[l.department] = (byDept[l.department] || 0) + 1;
    const who = l.assignedToName || "Unassigned";
    byEmployee[who] = (byEmployee[who] || 0) + 1;
  }
  return {
    totalMonth: thisMonth.length,
    won: wonMonth.length,
    lost: lostMonth.length,
    revenuePkr,
    revenueUsd,
    byChannel,
    byDept,
    byEmployee,
  };
}

function ManageListModal({ open, onClose, title, items, onAdd, onDelete }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setError(""); }
  }, [open]);

  async function add() {
    const n = name.trim();
    if (!n) { setError("Name is required"); return; }
    setBusy(true);
    setError("");
    try {
      await onAdd(n);
      setName("");
    } catch (e) {
      setError(e.message || "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {error && <ErrBox msg={error} />}
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="New name…"
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
            onKeyDown={e => { if (e.key === "Enter") add(); }}
          />
          <Btn onClick={add} disabled={busy}>{busy ? "…" : "Add"}</Btn>
        </div>
        <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {(items || []).map(item => (
            <li key={item.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-800">
                {item.name}
                {item.isDefault && <span className="ml-2 text-[10px] text-slate-400">default</span>}
              </span>
              {!item.isDefault && (
                <button
                  type="button"
                  className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                  onClick={() => onDelete(item.id)}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
          {(items || []).length === 0 && (
            <li className="py-6 text-center text-slate-400 text-sm">No items yet.</li>
          )}
        </ul>
      </div>
    </Modal>
  );
}

function LeadFormModal({
  open, onClose, title, initial, channels, departments, assignees, onSave, allowStage,
}) {
  const [form, setForm] = useState(emptyLeadForm());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      ...emptyLeadForm(),
      ...initial,
      amount: String(initial?.amount ?? "0"),
      assignedTo: initial?.assignedTo || "",
      channel: initial?.channel || channels[0]?.name || "",
      department: initial?.department || departments[0]?.name || "",
    });
  }, [open, initial, channels, departments]);

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.clientName.trim()) { setError("Client name is required"); return; }
    if (!form.channel) { setError("Channel is required"); return; }
    if (!form.department) { setError("Department is required"); return; }
    setBusy(true);
    setError("");
    try {
      await onSave({
        clientName: form.clientName.trim(),
        channel: form.channel,
        department: form.department,
        assignedTo: form.assignedTo || null,
        amount: Number(form.amount) || 0,
        currency: form.currency || "PKR",
        description: form.description.trim(),
        contactInfo: form.contactInfo.trim(),
        notes: form.notes.trim(),
        ...(allowStage ? { stage: form.stage } : {}),
      });
      onClose();
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  const channelOpts = [
    { value: "", label: "Select channel…" },
    ...channels.map(c => ({ value: c.name, label: c.name })),
  ];
  const deptOpts = [
    { value: "", label: "Select department…" },
    ...departments.map(d => ({ value: d.name, label: d.name })),
  ];
  const assigneeOpts = [
    { value: "", label: "Unassigned" },
    ...assignees.map(u => ({ value: u.id, label: u.name })),
  ];

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="space-y-3">
        {error && <ErrBox msg={error} />}
        <TextInput label="Client Name" value={form.clientName} onChange={v => set("clientName", v)} required />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectInput label="Channel" value={form.channel} onChange={v => set("channel", v)} options={channelOpts} required />
          <SelectInput label="Department" value={form.department} onChange={v => set("department", v)} options={deptOpts} required />
        </div>
        <SelectInput label="Assign to" value={form.assignedTo} onChange={v => set("assignedTo", v)} options={assigneeOpts} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextInput label="Amount" type="number" value={form.amount} onChange={v => set("amount", v)} />
          <SelectInput
            label="Currency"
            value={form.currency}
            onChange={v => set("currency", v)}
            options={[{ value: "PKR", label: "PKR" }, { value: "USD", label: "USD" }]}
          />
        </div>
        {allowStage && (
          <SelectInput
            label="Stage"
            value={form.stage}
            onChange={v => set("stage", v)}
            options={LEAD_STAGES.map(s => ({ value: s, label: s }))}
          />
        )}
        <FieldArea label="Description" value={form.description} onChange={v => set("description", v)} />
        <TextInput label="Contact Info" value={form.contactInfo} onChange={v => set("contactInfo", v)} placeholder="Email, phone, profile link…" />
        <FieldArea label="Notes" value={form.notes} onChange={v => set("notes", v)} />
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function FieldArea({ label, value, onChange, placeholder }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900"
      />
    </label>
  );
}

function LeadDetail({
  lead, isExec, onBack, onUpdated, onDeleted, channels, departments, assignees,
}) {
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [stage, setStage] = useState(lead.stage);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const loadNotes = useCallback(async () => {
    try {
      const list = await apiFetchLeadNotes(lead.id);
      setNotes(list);
    } catch (e) {
      setError(e.message || "Failed to load notes");
    }
  }, [lead.id]);

  useEffect(() => {
    setStage(lead.stage);
    loadNotes();
  }, [lead, loadNotes]);

  async function changeStage(nextStage) {
    if (nextStage === lead.stage) return;
    setBusy(true);
    setError("");
    try {
      const updated = await apiUpdateLead(lead.id, { stage: nextStage });
      setStage(updated.stage);
      onUpdated(updated);
      await loadNotes();
    } catch (e) {
      setError(e.message || "Failed to update stage");
      setStage(lead.stage);
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    const text = noteText.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    try {
      await apiAddLeadNote(lead.id, text);
      setNoteText("");
      await loadNotes();
    } catch (e) {
      setError(e.message || "Failed to add note");
    } finally {
      setBusy(false);
    }
  }

  async function removeLead() {
    if (!window.confirm(`Delete lead "${lead.clientName}"?`)) return;
    setBusy(true);
    try {
      await apiDeleteLead(lead.id);
      onDeleted(lead.id);
    } catch (e) {
      setError(e.message || "Failed to delete");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={14} /> Back to list
      </button>

      {error && <ErrBox msg={error} />}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{lead.clientName}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill tone={stageTone(lead.stage)}>{lead.stage}</Pill>
              <Pill tone="slate">{lead.channel}</Pill>
              <Pill tone="slate">{lead.department}</Pill>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isExec && (
              <>
                <Btn variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil size={14} className="mr-1" /> Edit
                </Btn>
                <Btn variant="ghost" size="sm" onClick={removeLead} disabled={busy}>
                  <Trash2 size={14} className="mr-1" /> Delete
                </Btn>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <InfoRow label="Amount" value={formatMoney(lead.amount, lead.currency)} />
          <InfoRow label="Assigned to" value={lead.assignedToName || "Unassigned"} />
          <InfoRow label="Contact" value={lead.contactInfo || "—"} />
          <InfoRow label="Added" value={formatWhen(lead.createdAt)} />
          <InfoRow label="Added by" value={lead.addedByName || "—"} />
          <InfoRow label="Updated" value={formatWhen(lead.updatedAt)} />
        </div>
        {lead.description && (
          <div className="mt-4">
            <div className="text-xs text-slate-400 mb-1">Description</div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{lead.description}</p>
          </div>
        )}
        {isExec && lead.notes && (
          <div className="mt-4">
            <div className="text-xs text-slate-400 mb-1">Internal notes</div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{lead.notes}</p>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-slate-100">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Update stage</label>
          <select
            value={stage}
            disabled={busy}
            onChange={e => changeStage(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
          >
            {LEAD_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </Card>

      <Card className="p-5">
        <STitle>Activity log</STitle>
        <div className="mt-3 flex gap-2">
          <input
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note or update…"
            className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2"
            onKeyDown={e => { if (e.key === "Enter") addNote(); }}
          />
          <Btn onClick={addNote} disabled={busy || !noteText.trim()}>
            <Send size={14} />
          </Btn>
        </div>
        <ul className="mt-4 space-y-3 max-h-80 overflow-y-auto">
          {notes.length === 0 && (
            <li className="text-sm text-slate-400 text-center py-6">No activity yet.</li>
          )}
          {notes.map(n => (
            <li key={n.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-slate-700">{n.userName || "System"}</span>
                <span className="text-[11px] text-slate-400">{formatWhen(n.createdAt)}</span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.note}</p>
              {n.stageFrom && n.stageTo && (
                <div className="mt-1.5 flex gap-1.5">
                  <Pill tone={stageTone(n.stageFrom)}>{n.stageFrom}</Pill>
                  <span className="text-xs text-slate-400 self-center">→</span>
                  <Pill tone={stageTone(n.stageTo)}>{n.stageTo}</Pill>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {isExec && (
        <LeadFormModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="Edit lead"
          initial={lead}
          channels={channels}
          departments={departments}
          assignees={assignees}
          allowStage
          onSave={async (payload) => {
            const updated = await apiUpdateLead(lead.id, payload);
            onUpdated(updated);
            await loadNotes();
          }}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-slate-800 mt-0.5 break-words">{value}</div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1" style={{ color: B.dark }}>{value}</div>
    </Card>
  );
}

function BreakdownCard({ title, map }) {
  const entries = Object.entries(map || {}).sort((a, b) => b[1] - a[1]);
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-slate-500 mb-2">{title}</div>
      {entries.length === 0 ? (
        <div className="text-sm text-slate-400">No data this month.</div>
      ) : (
        <ul className="space-y-1.5">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between text-sm">
              <span className="text-slate-700 truncate pr-2">{k}</span>
              <span className="font-medium tabular-nums text-slate-900">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * @param {{ currentUser: object, users?: array, mode?: "executive" | "employee" }} props
 */
export function LeadsPage({ currentUser, users = [], mode }) {
  const isExec = mode === "executive" || isExecutiveRole(currentUser?.role);
  const [leads, setLeads] = useState([]);
  const [channels, setChannels] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [manageChannels, setManageChannels] = useState(false);
  const [manageDepts, setManageDepts] = useState(false);

  const assignees = useMemo(
    () => (users || []).filter(u =>
      u && u.status === "active" && hasStaffPortalRole(u.role)
    ).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [users]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [leadList, ch, dep] = await Promise.all([
        apiFetchLeads(),
        apiFetchLeadChannels(),
        apiFetchLeadDepartments(),
      ]);
      setLeads(leadList);
      setChannels(ch);
      setDepartments(dep);
    } catch (e) {
      setError(e.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const stageCounts = useMemo(() => {
    const counts = { All: leads.length };
    for (const s of LEAD_STAGES) counts[s] = 0;
    for (const l of leads) counts[l.stage] = (counts[l.stage] || 0) + 1;
    return counts;
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (stageFilter !== "All" && l.stage !== stageFilter) return false;
      if (channelFilter && l.channel !== channelFilter) return false;
      if (deptFilter && l.department !== deptFilter) return false;
      if (assigneeFilter && (l.assignedTo || "") !== assigneeFilter) return false;
      if (q && !(l.clientName || "").toLowerCase().includes(q)) return false;
      const created = dateKeyFromIso(l.createdAt);
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
      return true;
    });
  }, [leads, stageFilter, channelFilter, deptFilter, assigneeFilter, search, dateFrom, dateTo]);

  const selected = selectedId ? leads.find(l => l.id === selectedId) : null;
  const stats = useMemo(() => (isExec ? computeStats(leads) : null), [isExec, leads]);

  if (selected) {
    return (
      <LeadDetail
        lead={selected}
        isExec={isExec}
        channels={channels}
        departments={departments}
        assignees={assignees}
        onBack={() => setSelectedId(null)}
        onUpdated={(updated) => {
          setLeads(list => list.map(l => l.id === updated.id ? updated : l));
        }}
        onDeleted={(id) => {
          setLeads(list => list.filter(l => l.id !== id));
          setSelectedId(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrBox msg={error} />}

      {isExec && stats && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Leads this month" value={stats.totalMonth} />
            <StatCard label="Won / Lost" value={`${stats.won} / ${stats.lost}`} />
            <StatCard label="Revenue PKR" value={formatMoney(stats.revenuePkr, "PKR")} />
            <StatCard label="Revenue USD" value={formatMoney(stats.revenueUsd, "USD")} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <BreakdownCard title="Leads per channel (this month)" map={stats.byChannel} />
            <BreakdownCard title="Leads per department (this month)" map={stats.byDept} />
            <BreakdownCard title="Leads per employee (this month)" map={stats.byEmployee} />
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <STitle>{isExec ? "Leads pipeline" : "My leads"}</STitle>
          <div className="flex flex-wrap items-center gap-2">
            {isExec && (
              <>
                <button
                  type="button"
                  onClick={() => setManageChannels(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-300 text-slate-600 hover:bg-slate-50"
                >
                  <Settings2 size={13} /> Channels
                </button>
                <button
                  type="button"
                  onClick={() => setManageDepts(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-300 text-slate-600 hover:bg-slate-50"
                >
                  <Settings2 size={13} /> Departments
                </button>
                <Btn size="sm" onClick={() => setAddOpen(true)}>
                  <Plus size={14} className="mr-1" /> Add lead
                </Btn>
              </>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 space-y-3">
          <StageFilterChips value={stageFilter} onChange={setStageFilter} counts={stageCounts} />
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search client name…"
                className="w-full text-sm border border-slate-300 rounded-lg pl-8 pr-3 py-2"
              />
            </div>
            {isExec && (
              <>
                <select
                  value={channelFilter}
                  onChange={e => setChannelFilter(e.target.value)}
                  className="text-sm border border-slate-300 rounded-lg px-2 py-2"
                >
                  <option value="">All channels</option>
                  {channels.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <select
                  value={deptFilter}
                  onChange={e => setDeptFilter(e.target.value)}
                  className="text-sm border border-slate-300 rounded-lg px-2 py-2"
                >
                  <option value="">All departments</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
                <select
                  value={assigneeFilter}
                  onChange={e => setAssigneeFilter(e.target.value)}
                  className="text-sm border border-slate-300 rounded-lg px-2 py-2"
                >
                  <option value="">All assignees</option>
                  {assignees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="text-sm border border-slate-300 rounded-lg px-2 py-2"
                  title="From date"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="text-sm border border-slate-300 rounded-lg px-2 py-2"
                  title="To date"
                />
                {(channelFilter || deptFilter || assigneeFilter || dateFrom || dateTo || search) && (
                  <button
                    type="button"
                    onClick={() => {
                      setChannelFilter("");
                      setDeptFilter("");
                      setAssigneeFilter("");
                      setDateFrom("");
                      setDateTo("");
                      setSearch("");
                    }}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    title="Clear filters"
                  >
                    <X size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Client", "Channel", "Department", "Stage", "Amount", ...(isExec ? ["Assigned"] : []), "Added"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isExec ? 7 : 6} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={isExec ? 7 : 6} className="px-4 py-10 text-center text-slate-400">No leads found.</td></tr>
              ) : filtered.map(l => (
                <tr
                  key={l.id}
                  className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50/80"
                  onClick={() => setSelectedId(l.id)}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">{l.clientName}</td>
                  <td className="px-4 py-3 text-slate-600">{l.channel}</td>
                  <td className="px-4 py-3 text-slate-600">{l.department}</td>
                  <td className="px-4 py-3"><Pill tone={stageTone(l.stage)}>{l.stage}</Pill></td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{formatMoney(l.amount, l.currency)}</td>
                  {isExec && (
                    <td className="px-4 py-3 text-slate-600">{l.assignedToName || "—"}</td>
                  )}
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateKeyFromIso(l.createdAt) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {isExec && (
        <>
          <LeadFormModal
            open={addOpen}
            onClose={() => setAddOpen(false)}
            title="Add lead"
            initial={emptyLeadForm()}
            channels={channels}
            departments={departments}
            assignees={assignees}
            onSave={async (payload) => {
              const created = await apiCreateLead(payload);
              setLeads(list => [created, ...list]);
            }}
          />
          <ManageListModal
            open={manageChannels}
            onClose={() => setManageChannels(false)}
            title="Manage channels"
            items={channels}
            onAdd={async (name) => {
              const created = await apiCreateLeadChannel(name);
              setChannels(list => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
            }}
            onDelete={async (id) => {
              await apiDeleteLeadChannel(id);
              setChannels(list => list.filter(c => c.id !== id));
            }}
          />
          <ManageListModal
            open={manageDepts}
            onClose={() => setManageDepts(false)}
            title="Manage departments"
            items={departments}
            onAdd={async (name) => {
              const created = await apiCreateLeadDepartment(name);
              setDepartments(list => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
            }}
            onDelete={async (id) => {
              await apiDeleteLeadDepartment(id);
              setDepartments(list => list.filter(d => d.id !== id));
            }}
          />
        </>
      )}
    </div>
  );
}
