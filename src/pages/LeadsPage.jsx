import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Trash2, Pencil, X, Settings2, ArrowLeft, Send, ExternalLink,
} from "lucide-react";
import { B } from "../brand.jsx";
import { isExecutiveRole, hasStaffPortalRole, monthKey } from "../utils.js";
import { Card, STitle, Pill, Modal, TextInput, SelectInput, Btn, ErrBox } from "../components/ui.jsx";
import {
  apiFetchLeads, apiCreateLead, apiUpdateLead, apiDeleteLead,
  apiFetchLeadNotes, apiAddLeadNote,
  apiFetchLeadChannels, apiCreateLeadChannel, apiDeleteLeadChannel,
  apiFetchLeadPayments, apiCreateLeadPayment, apiUpdateLeadPayment, apiDeleteLeadPayment,
  apiFetchAllLeadPayments,
} from "../api.js";

export const LEAD_STAGES = ["First Call", "In Consideration", "On Boarded"];
export const LEAD_STATUSES = ["Completed", "Off Boarded", "On Hold"];
export const FILTER_CHIPS = ["All", ...LEAD_STAGES, ...LEAD_STATUSES];
export const PAYMENT_METHODS = ["Bank Transfer", "PayPal", "Wise", "Cash", "Upwork", "Other"];
export const PAYMENT_STATUSES = ["Received", "Pending", "Partial", "Overdue"];
export const PAYMENT_CURRENCIES = ["USD", "PKR", "GBP"];

function todayPkt() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

function dateKeyFromIso(iso) {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return String(iso).slice(0, 10);
  try {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function leadDateKey(lead) {
  return dateKeyFromIso(lead.leadDate) || dateKeyFromIso(lead.createdAt);
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

function formatMoney(amount, currency = "USD") {
  const n = Number(amount) || 0;
  try {
    return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  } catch {
    return `${currency} ${n}`;
  }
}

function ensureUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function stageTone(stage) {
  if (stage === "First Call") return "slate";
  if (stage === "In Consideration") return "blue";
  if (stage === "On Boarded") return "green";
  return "slate";
}

function statusTone(status) {
  if (status === "Completed") return "green";
  if (status === "Off Boarded") return "blue";
  if (status === "On Hold") return "orange";
  return "slate";
}

function paymentStatusTone(status) {
  if (status === "Received") return "green";
  if (status === "Pending") return "amber";
  if (status === "Partial") return "blue";
  if (status === "Overdue") return "red";
  return "slate";
}

function emptyLeadForm() {
  return {
    leadDate: todayPkt(),
    assignedTo: "",
    clientName: "",
    businessName: "",
    channel: "",
    stage: "First Call",
    status: "",
    rate: "",
    monthlyRevenue: "",
    workSummary: "",
    businessWebsite: "",
    socialHandleUrl: "",
  };
}

function emptyPaymentForm() {
  return {
    paymentDate: todayPkt(),
    amount: "",
    currency: "USD",
    paymentMethod: "Bank Transfer",
    paymentStatus: "Pending",
    notes: "",
  };
}

function FilterChips({ value, onChange, counts }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTER_CHIPS.map(tab => {
        const active = value === tab;
        const count = counts?.[tab];
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              active ? "border-transparent text-white" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
            style={active ? { background: B.dark, color: B.white } : undefined}
          >
            {tab}{count != null ? ` (${count})` : ""}
          </button>
        );
      })}
    </div>
  );
}

function ManageSourcesModal({ open, onClose, items, onAdd, onDelete }) {
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
    <Modal open={open} onClose={onClose} title="Manage Sources">
      <div className="space-y-4">
        {error && <ErrBox msg={error} />}
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="New source…"
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
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function FieldArea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900"
      />
    </label>
  );
}

function LeadFormModal({ open, onClose, title, initial, channels, assignees, onSave }) {
  const [form, setForm] = useState(emptyLeadForm());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      ...emptyLeadForm(),
      ...initial,
      leadDate: initial?.leadDate || leadDateKey(initial || {}) || todayPkt(),
      assignedTo: initial?.assignedTo || "",
      channel: initial?.channel || channels[0]?.name || "",
      stage: initial?.stage || "First Call",
      status: initial?.status || "",
      workSummary: initial?.workSummary || initial?.description || "",
      businessName: initial?.businessName || "",
      monthlyRevenue: initial?.monthlyRevenue || "",
      businessWebsite: initial?.businessWebsite || "",
      socialHandleUrl: initial?.socialHandleUrl || "",
      rate: initial?.rate || "",
      clientName: initial?.clientName || "",
    });
  }, [open, initial, channels]);

  function set(key, value) {
    setForm(f => {
      const next = { ...f, [key]: value };
      if (key === "stage" && value !== "On Boarded") next.status = "";
      return next;
    });
  }

  async function save() {
    if (!form.clientName.trim()) { setError("Client name is required"); return; }
    if (!form.channel) { setError("Source is required"); return; }
    setBusy(true);
    setError("");
    try {
      await onSave({
        leadDate: form.leadDate,
        assignedTo: form.assignedTo || null,
        clientName: form.clientName.trim(),
        businessName: form.businessName.trim(),
        channel: form.channel,
        stage: form.stage,
        status: form.stage === "On Boarded" ? (form.status || null) : null,
        rate: form.rate.trim(),
        monthlyRevenue: form.monthlyRevenue.trim(),
        workSummary: form.workSummary.trim(),
        businessWebsite: form.businessWebsite.trim(),
        socialHandleUrl: form.socialHandleUrl.trim(),
      });
      onClose();
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  const sourceOpts = [
    { value: "", label: "Select source…" },
    ...channels.map(c => ({ value: c.name, label: c.name })),
  ];
  const assigneeOpts = [
    { value: "", label: "Unassigned" },
    ...assignees.map(u => ({ value: u.id, label: u.name })),
  ];

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="space-y-3">
        {error && <ErrBox msg={error} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextInput label="Date" type="date" value={form.leadDate} onChange={v => set("leadDate", v)} required />
          <SelectInput label="DC — Assign to Employee" value={form.assignedTo} onChange={v => set("assignedTo", v)} options={assigneeOpts} />
        </div>
        <TextInput label="Client Name" value={form.clientName} onChange={v => set("clientName", v)} required />
        <TextInput label="Business Name" value={form.businessName} onChange={v => set("businessName", v)} placeholder="Optional" />
        <SelectInput label="Source" value={form.channel} onChange={v => set("channel", v)} options={sourceOpts} required />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectInput
            label="Opportunity"
            value={form.stage}
            onChange={v => set("stage", v)}
            options={LEAD_STAGES.map(s => ({ value: s, label: s }))}
          />
          {form.stage === "On Boarded" && (
            <SelectInput
              label="Status"
              value={form.status || ""}
              onChange={v => set("status", v)}
              options={[
                { value: "", label: "Select status…" },
                ...LEAD_STATUSES.map(s => ({ value: s, label: s })),
              ]}
            />
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextInput label="Rate" value={form.rate} onChange={v => set("rate", v)} placeholder='e.g. "30$ per video"' />
          <TextInput label="Monthly Revenue" value={form.monthlyRevenue} onChange={v => set("monthlyRevenue", v)} placeholder='e.g. "$400"' />
        </div>
        <FieldArea label="Work Summary" value={form.workSummary} onChange={v => set("workSummary", v)} />
        <TextInput label="Business Website" value={form.businessWebsite} onChange={v => set("businessWebsite", v)} placeholder="https://…" />
        <TextInput label="Social Handle URL" value={form.socialHandleUrl} onChange={v => set("socialHandleUrl", v)} placeholder="Instagram / LinkedIn / YouTube…" />
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function PaymentFormModal({ open, onClose, title, initial, onSave }) {
  const [form, setForm] = useState(emptyPaymentForm());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      ...emptyPaymentForm(),
      ...initial,
      amount: initial?.amount != null ? String(initial.amount) : "",
      paymentDate: initial?.paymentDate || todayPkt(),
    });
  }, [open, initial]);

  async function save() {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount)) { setError("Amount is required"); return; }
    if (!form.paymentDate) { setError("Date is required"); return; }
    setBusy(true);
    setError("");
    try {
      await onSave({
        paymentDate: form.paymentDate,
        amount,
        currency: form.currency,
        paymentMethod: form.paymentMethod,
        paymentStatus: form.paymentStatus,
        notes: form.notes.trim(),
      });
      onClose();
    } catch (e) {
      setError(e.message || "Failed to save payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {error && <ErrBox msg={error} />}
        <TextInput label="Date" type="date" value={form.paymentDate} onChange={v => setForm(f => ({ ...f, paymentDate: v }))} required />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Amount" type="number" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} required />
          <SelectInput
            label="Currency"
            value={form.currency}
            onChange={v => setForm(f => ({ ...f, currency: v }))}
            options={PAYMENT_CURRENCIES.map(c => ({ value: c, label: c }))}
          />
        </div>
        <SelectInput
          label="Method"
          value={form.paymentMethod}
          onChange={v => setForm(f => ({ ...f, paymentMethod: v }))}
          options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))}
        />
        <SelectInput
          label="Status"
          value={form.paymentStatus}
          onChange={v => setForm(f => ({ ...f, paymentStatus: v }))}
          options={PAYMENT_STATUSES.map(s => ({ value: s, label: s }))}
        />
        <FieldArea label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} rows={2} placeholder="Transaction ID, reference…" />
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-slate-800 mt-0.5 break-words">{value || "—"}</div>
    </div>
  );
}

function LinkRow({ label, url }) {
  const href = ensureUrl(url);
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mt-0.5 break-all">
          {url} <ExternalLink size={12} />
        </a>
      ) : (
        <div className="text-slate-800 mt-0.5">—</div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] text-slate-400 leading-tight">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-1" style={{ color: B.dark }}>{value}</div>
    </Card>
  );
}

function paymentTotals(payments) {
  let billed = 0;
  let received = 0;
  let pending = 0;
  const byCurrency = {};
  for (const p of payments || []) {
    const amt = Number(p.amount) || 0;
    const cur = p.currency || "USD";
    if (!byCurrency[cur]) byCurrency[cur] = { billed: 0, received: 0, pending: 0 };
    byCurrency[cur].billed += amt;
    billed += amt;
    if (p.paymentStatus === "Received") {
      received += amt;
      byCurrency[cur].received += amt;
    } else if (p.paymentStatus === "Pending" || p.paymentStatus === "Partial" || p.paymentStatus === "Overdue") {
      pending += amt;
      byCurrency[cur].pending += amt;
    }
  }
  return { billed, received, pending, byCurrency };
}

function computeDashboardStats(leads, allPayments) {
  const month = monthKey();
  const total = leads.length;
  const newThisMonth = leads.filter(l => leadDateKey(l).startsWith(month)).length;
  const firstCall = leads.filter(l => l.stage === "First Call").length;
  const inConsideration = leads.filter(l => l.stage === "In Consideration").length;
  const onBoardedStage = leads.filter(l => l.stage === "On Boarded").length;
  const completed = leads.filter(l => l.status === "Completed").length;
  const offBoarded = leads.filter(l => l.status === "Off Boarded").length;
  const onHold = leads.filter(l => l.status === "On Hold").length;
  const totals = paymentTotals(allPayments);
  const conversion = total > 0 ? Math.round((onBoardedStage / total) * 1000) / 10 : 0;
  return {
    total,
    newThisMonth,
    firstCall,
    inConsideration,
    onBoarded: onBoardedStage,
    completed,
    offBoarded,
    onHold,
    revenueReceived: totals.received,
    paymentPending: totals.pending,
    conversion,
    byCurrency: totals.byCurrency,
  };
}

function LeadDetail({
  lead, isExec, onBack, onUpdated, onDeleted, channels, assignees,
}) {
  const [notes, setNotes] = useState([]);
  const [payments, setPayments] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [stage, setStage] = useState(lead.stage);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editPay, setEditPay] = useState(null);

  const loadNotes = useCallback(async () => {
    const list = await apiFetchLeadNotes(lead.id);
    setNotes(list);
  }, [lead.id]);

  const loadPayments = useCallback(async () => {
    const list = await apiFetchLeadPayments(lead.id);
    setPayments(list);
  }, [lead.id]);

  useEffect(() => {
    setStage(lead.stage);
    setError("");
    Promise.all([loadNotes(), loadPayments()]).catch(e => setError(e.message || "Failed to load"));
  }, [lead, loadNotes, loadPayments]);

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

  const totals = paymentTotals(payments);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft size={14} /> Back to list
      </button>
      {error && <ErrBox msg={error} />}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{lead.clientName}</h2>
            {lead.businessName && <p className="text-sm text-slate-500 mt-0.5">{lead.businessName}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill tone={stageTone(lead.stage)}>{lead.stage}</Pill>
              {lead.status && <Pill tone={statusTone(lead.status)}>{lead.status}</Pill>}
              <Pill tone="slate">{lead.channel}</Pill>
            </div>
          </div>
          {isExec && (
            <div className="flex flex-wrap gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} className="mr-1" /> Edit
              </Btn>
              <Btn variant="ghost" size="sm" onClick={removeLead} disabled={busy}>
                <Trash2 size={14} className="mr-1" /> Delete
              </Btn>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <InfoRow label="Date" value={leadDateKey(lead)} />
          <InfoRow label="DC" value={lead.assignedToName || "Unassigned"} />
          <InfoRow label="Client Name" value={lead.clientName} />
          <InfoRow label="Business Name" value={lead.businessName} />
          <InfoRow label="Source" value={lead.channel} />
          <InfoRow label="Opportunity" value={lead.stage} />
          {lead.stage === "On Boarded" && <InfoRow label="Status" value={lead.status || "—"} />}
          <InfoRow label="Rate" value={lead.rate} />
          <InfoRow label="Monthly Revenue" value={lead.monthlyRevenue} />
          <LinkRow label="Business Website" url={lead.businessWebsite} />
          <LinkRow label="Social Handle URL" url={lead.socialHandleUrl} />
        </div>
        {lead.workSummary && (
          <div className="mt-4">
            <div className="text-xs text-slate-400 mb-1">Work Summary</div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{lead.workSummary}</p>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-slate-100">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Update opportunity</label>
          <select
            value={stage}
            disabled={busy}
            onChange={e => changeStage(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
          >
            {LEAD_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {!isExec && (
            <p className="text-[11px] text-slate-400 mt-1">Status (Completed / Off Boarded / On Hold) can only be set by Executive.</p>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <STitle>Payments</STitle>
          {isExec && (
            <Btn size="sm" onClick={() => { setEditPay(null); setPayOpen(true); }}>
              <Plus size={14} className="mr-1" /> Add Payment
            </Btn>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Date", "Amount", "Currency", "Method", "Status", "Notes", ...(isExec ? [""] : [])].map(h => (
                  <th key={h || "actions"} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={isExec ? 7 : 6} className="px-3 py-8 text-center text-slate-400">No payments yet.</td></tr>
              ) : payments.map(p => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">{p.paymentDate}</td>
                  <td className="px-3 py-2 tabular-nums">{Number(p.amount).toLocaleString()}</td>
                  <td className="px-3 py-2">{p.currency}</td>
                  <td className="px-3 py-2">{p.paymentMethod || "—"}</td>
                  <td className="px-3 py-2"><Pill tone={paymentStatusTone(p.paymentStatus)}>{p.paymentStatus}</Pill></td>
                  <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">{p.notes || "—"}</td>
                  {isExec && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button type="button" className="p-1 text-slate-400 hover:text-slate-700" onClick={() => { setEditPay(p); setPayOpen(true); }}>
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="p-1 text-slate-400 hover:text-red-600"
                        onClick={async () => {
                          if (!window.confirm("Delete this payment?")) return;
                          await apiDeleteLeadPayment(p.id);
                          await loadPayments();
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm border-t border-slate-100 pt-3">
          <span>Total Billed: <strong className="tabular-nums">{totals.billed.toLocaleString()}</strong></span>
          <span>Total Received: <strong className="tabular-nums text-emerald-700">{totals.received.toLocaleString()}</strong></span>
          <span>Total Pending: <strong className="tabular-nums text-amber-700">{totals.pending.toLocaleString()}</strong></span>
        </div>
        {!isExec && (
          <p className="text-[11px] text-slate-400 mt-2">Payments are view-only. Contact Executive to record payments.</p>
        )}
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
          <Btn onClick={addNote} disabled={busy || !noteText.trim()}><Send size={14} /></Btn>
        </div>
        <ul className="mt-4 space-y-3 max-h-80 overflow-y-auto">
          {notes.length === 0 && <li className="text-sm text-slate-400 text-center py-6">No activity yet.</li>}
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
        <>
          <LeadFormModal
            open={editOpen}
            onClose={() => setEditOpen(false)}
            title="Edit lead"
            initial={lead}
            channels={channels}
            assignees={assignees}
            onSave={async (payload) => {
              const updated = await apiUpdateLead(lead.id, payload);
              onUpdated(updated);
              await loadNotes();
            }}
          />
          <PaymentFormModal
            open={payOpen}
            onClose={() => { setPayOpen(false); setEditPay(null); }}
            title={editPay ? "Edit payment" : "Add payment"}
            initial={editPay || emptyPaymentForm()}
            onSave={async (payload) => {
              if (editPay?.id) await apiUpdateLeadPayment(editPay.id, payload);
              else await apiCreateLeadPayment(lead.id, payload);
              await loadPayments();
            }}
          />
        </>
      )}
    </div>
  );
}

function monthOptionsFromLeads(leads) {
  const set = new Set([monthKey()]);
  for (const l of leads) {
    const d = leadDateKey(l);
    if (d.length >= 7) set.add(d.slice(0, 7));
  }
  return [...set].sort().reverse();
}

function ReportsPanel({ leads, assignees }) {
  const [tab, setTab] = useState("monthly");
  const [month, setMonth] = useState(monthKey());
  const [payStatus, setPayStatus] = useState("");
  const [payEmployee, setPayEmployee] = useState("");
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState("");
  const months = monthOptionsFromLeads(leads);

  useEffect(() => {
    let cancelled = false;
    apiFetchAllLeadPayments({
      month,
      status: payStatus || undefined,
      employeeId: payEmployee || undefined,
    })
      .then(list => { if (!cancelled) setPayments(list); })
      .catch(e => { if (!cancelled) setError(e.message || "Failed to load payments"); });
    return () => { cancelled = true; };
  }, [month, payStatus, payEmployee, tab]);

  const monthLeads = useMemo(
    () => leads.filter(l => leadDateKey(l).startsWith(month)),
    [leads, month]
  );

  const monthly = useMemo(() => {
    const onBoarded = monthLeads.filter(l => l.stage === "On Boarded").length;
    const conversion = monthLeads.length > 0 ? Math.round((onBoarded / monthLeads.length) * 1000) / 10 : 0;
    const stageBreakdown = {};
    for (const s of LEAD_STAGES) stageBreakdown[s] = 0;
    for (const l of monthLeads) stageBreakdown[l.stage] = (stageBreakdown[l.stage] || 0) + 1;
    const monthPayments = payments.filter(p => String(p.paymentDate || "").startsWith(month));
    const totals = paymentTotals(monthPayments);
    return { onBoarded, conversion, stageBreakdown, totals, newLeads: monthLeads.length };
  }, [monthLeads, payments, month]);

  const dcRows = useMemo(() => {
    const map = new Map();
    for (const l of monthLeads) {
      const key = l.assignedTo || "__none__";
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: l.assignedToName || "Unassigned",
          total: 0,
          firstCall: 0,
          inConsideration: 0,
          onBoarded: 0,
          completed: 0,
        });
      }
      const row = map.get(key);
      row.total += 1;
      if (l.stage === "First Call") row.firstCall += 1;
      if (l.stage === "In Consideration") row.inConsideration += 1;
      if (l.stage === "On Boarded") row.onBoarded += 1;
      if (l.status === "Completed") row.completed += 1;
    }
    const payByEmp = {};
    for (const p of payments) {
      const key = p.assignedTo || "__none__";
      if (!payByEmp[key]) payByEmp[key] = { received: 0, pending: 0 };
      const amt = Number(p.amount) || 0;
      if (p.paymentStatus === "Received") payByEmp[key].received += amt;
      else if (p.paymentStatus === "Pending" || p.paymentStatus === "Partial" || p.paymentStatus === "Overdue") {
        payByEmp[key].pending += amt;
      }
    }
    return [...map.values()]
      .map(r => ({
        ...r,
        revenue: payByEmp[r.id]?.received || 0,
        pending: payByEmp[r.id]?.pending || 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [monthLeads, payments]);

  const sourceRows = useMemo(() => {
    const map = new Map();
    for (const l of monthLeads) {
      const key = l.channel || "Unknown";
      if (!map.has(key)) map.set(key, { source: key, total: 0, onBoarded: 0 });
      const row = map.get(key);
      row.total += 1;
      if (l.stage === "On Boarded") row.onBoarded += 1;
    }
    const payBySource = {};
    const leadSource = Object.fromEntries(leads.map(l => [l.id, l.channel]));
    for (const p of payments) {
      const src = leadSource[p.leadId] || "Unknown";
      if (!payBySource[src]) payBySource[src] = 0;
      if (p.paymentStatus === "Received") payBySource[src] += Number(p.amount) || 0;
    }
    return [...map.values()]
      .map(r => ({ ...r, revenue: payBySource[r.source] || 0 }))
      .sort((a, b) => b.total - a.total);
  }, [monthLeads, payments, leads]);

  const payTotals = useMemo(() => {
    let received = 0;
    let pending = 0;
    let overdue = 0;
    for (const p of payments) {
      const amt = Number(p.amount) || 0;
      if (p.paymentStatus === "Received") received += amt;
      else if (p.paymentStatus === "Overdue") overdue += amt;
      else if (p.paymentStatus === "Pending" || p.paymentStatus === "Partial") pending += amt;
    }
    return { received, pending, overdue };
  }, [payments]);

  const tabs = [
    { id: "monthly", label: "Monthly Summary" },
    { id: "dc", label: "DC Report" },
    { id: "source", label: "Source Report" },
    { id: "payment", label: "Payment Report" },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <STitle>Reports</STitle>
        <select value={month} onChange={e => setMonth(e.target.value)} className="text-sm border border-slate-300 rounded-lg px-2 py-1.5">
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="px-5 py-2 border-b border-slate-100 flex flex-wrap gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-md"
            style={tab === t.id ? { background: B.dark, color: B.white } : { color: B.dark }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-5">
        {error && <div className="mb-3"><ErrBox msg={error} /></div>}

        {tab === "monthly" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="New leads" value={monthly.newLeads} />
              <StatCard label="On Boarded" value={monthly.onBoarded} />
              <StatCard label="Conversion" value={`${monthly.conversion}%`} />
              <StatCard label="Revenue received" value={monthly.totals.received.toLocaleString()} />
            </div>
            <StatCard label="Payment pending" value={monthly.totals.pending.toLocaleString()} />
            <div>
              <div className="text-xs font-medium text-slate-500 mb-2">Stage-wise breakdown</div>
              <ul className="space-y-1.5">
                {LEAD_STAGES.map(s => (
                  <li key={s} className="flex justify-between text-sm">
                    <span>{s}</span>
                    <span className="font-medium tabular-nums">{monthly.stageBreakdown[s] || 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {tab === "dc" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b">
                  {["Employee", "Total", "First Call", "In Consideration", "On Boarded", "Completed", "Revenue Received", "Payment Pending"].map(h => (
                    <th key={h} className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dcRows.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No data.</td></tr>
                ) : dcRows.map(r => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 tabular-nums">{r.total}</td>
                    <td className="px-3 py-2 tabular-nums">{r.firstCall}</td>
                    <td className="px-3 py-2 tabular-nums">{r.inConsideration}</td>
                    <td className="px-3 py-2 tabular-nums">{r.onBoarded}</td>
                    <td className="px-3 py-2 tabular-nums">{r.completed}</td>
                    <td className="px-3 py-2 tabular-nums">{r.revenue.toLocaleString()}</td>
                    <td className="px-3 py-2 tabular-nums">{r.pending.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "source" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b">
                  {["Source", "Total Leads", "On Boarded", "Revenue Received"].map(h => (
                    <th key={h} className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sourceRows.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">No data.</td></tr>
                ) : sourceRows.map(r => (
                  <tr key={r.source} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium">{r.source}</td>
                    <td className="px-3 py-2 tabular-nums">{r.total}</td>
                    <td className="px-3 py-2 tabular-nums">{r.onBoarded}</td>
                    <td className="px-3 py-2 tabular-nums">{r.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "payment" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <select value={payStatus} onChange={e => setPayStatus(e.target.value)} className="text-sm border border-slate-300 rounded-lg px-2 py-1.5">
                <option value="">All statuses</option>
                {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={payEmployee} onChange={e => setPayEmployee(e.target.value)} className="text-sm border border-slate-300 rounded-lg px-2 py-1.5">
                <option value="">All employees</option>
                {assignees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>Total Received: <strong className="text-emerald-700">{payTotals.received.toLocaleString()}</strong></span>
              <span>Total Pending: <strong className="text-amber-700">{payTotals.pending.toLocaleString()}</strong></span>
              <span>Total Overdue: <strong className="text-red-600">{payTotals.overdue.toLocaleString()}</strong></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b">
                    {["Date", "Client", "DC", "Amount", "Currency", "Method", "Status", "Notes"].map(h => (
                      <th key={h} className="px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No payments.</td></tr>
                  ) : payments.map(p => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap">{p.paymentDate}</td>
                      <td className="px-3 py-2">{p.clientName || "—"}</td>
                      <td className="px-3 py-2">{p.assignedToName || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{Number(p.amount).toLocaleString()}</td>
                      <td className="px-3 py-2">{p.currency}</td>
                      <td className="px-3 py-2">{p.paymentMethod || "—"}</td>
                      <td className="px-3 py-2"><Pill tone={paymentStatusTone(p.paymentStatus)}>{p.paymentStatus}</Pill></td>
                      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{p.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function LeadsPage({ currentUser, users = [], mode }) {
  const isExec = mode === "executive" || isExecutiveRole(currentUser?.role);
  const [view, setView] = useState("pipeline"); // pipeline | reports
  const [leads, setLeads] = useState([]);
  const [channels, setChannels] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [manageSources, setManageSources] = useState(false);

  const assignees = useMemo(
    () => (users || [])
      .filter(u => u && u.status === "active" && hasStaffPortalRole(u.role))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [users]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const tasks = [apiFetchLeads(), apiFetchLeadChannels()];
      if (isExec) tasks.push(apiFetchAllLeadPayments({}));
      const [leadList, ch, pays] = await Promise.all(tasks);
      setLeads(leadList);
      setChannels(ch);
      if (isExec) setAllPayments(Array.isArray(pays) ? pays : []);
    } catch (e) {
      setError(e.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [isExec]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filterCounts = useMemo(() => {
    const counts = { All: leads.length };
    for (const s of LEAD_STAGES) counts[s] = 0;
    for (const s of LEAD_STATUSES) counts[s] = 0;
    for (const l of leads) {
      counts[l.stage] = (counts[l.stage] || 0) + 1;
      if (l.status) counts[l.status] = (counts[l.status] || 0) + 1;
    }
    return counts;
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (filter !== "All") {
        if (LEAD_STAGES.includes(filter) && l.stage !== filter) return false;
        if (LEAD_STATUSES.includes(filter) && l.status !== filter) return false;
      }
      if (sourceFilter && l.channel !== sourceFilter) return false;
      if (assigneeFilter && (l.assignedTo || "") !== assigneeFilter) return false;
      if (q) {
        const hay = `${l.clientName || ""} ${l.businessName || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, filter, sourceFilter, assigneeFilter, search]);

  const selected = selectedId ? leads.find(l => l.id === selectedId) : null;
  const stats = useMemo(
    () => (isExec ? computeDashboardStats(leads, allPayments) : null),
    [isExec, leads, allPayments]
  );

  if (selected) {
    return (
      <LeadDetail
        lead={selected}
        isExec={isExec}
        channels={channels}
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

      {isExec && (
        <div className="flex gap-1 p-1 rounded-lg bg-slate-100 w-fit">
          {[
            { id: "pipeline", label: "Pipeline" },
            { id: "reports", label: "Reports" },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className="px-3 py-1.5 text-xs font-medium rounded-md"
              style={view === t.id ? { background: B.dark, color: B.white } : { color: B.dark }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {isExec && view === "reports" && (
        <ReportsPanel leads={leads} assignees={assignees} />
      )}

      {view === "pipeline" && (
        <>
          {isExec && stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              <StatCard label="Total Leads" value={stats.total} />
              <StatCard label="New This Month" value={stats.newThisMonth} />
              <StatCard label="First Call" value={stats.firstCall} />
              <StatCard label="In Consideration" value={stats.inConsideration} />
              <StatCard label="On Boarded" value={stats.onBoarded} />
              <StatCard label="Completed" value={stats.completed} />
              <StatCard label="Off Boarded" value={stats.offBoarded} />
              <StatCard label="On Hold" value={stats.onHold} />
              <StatCard label="Total Revenue" value={stats.revenueReceived.toLocaleString()} />
              <StatCard label="Payment Pending" value={stats.paymentPending.toLocaleString()} />
              <StatCard label="Conversion Rate" value={`${stats.conversion}%`} />
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
                      onClick={() => setManageSources(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-300 text-slate-600 hover:bg-slate-50"
                    >
                      <Settings2 size={13} /> Manage Sources
                    </button>
                    <Btn size="sm" onClick={() => setAddOpen(true)}>
                      <Plus size={14} className="mr-1" /> Add lead
                    </Btn>
                  </>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 space-y-3">
              <FilterChips value={filter} onChange={setFilter} counts={filterCounts} />
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search client or business…"
                    className="w-full text-sm border border-slate-300 rounded-lg pl-8 pr-3 py-2"
                  />
                </div>
                {isExec && (
                  <>
                    <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="text-sm border border-slate-300 rounded-lg px-2 py-2">
                      <option value="">All sources</option>
                      {channels.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="text-sm border border-slate-300 rounded-lg px-2 py-2">
                      <option value="">All DCs</option>
                      {assignees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    {(sourceFilter || assigneeFilter || search) && (
                      <button type="button" onClick={() => { setSourceFilter(""); setAssigneeFilter(""); setSearch(""); }} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                        <X size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[960px]">
                <thead>
                  <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                    {(isExec
                      ? ["Date", "DC", "Client", "Business Name", "Source", "Opportunity", "Status", "Rate", "Monthly"]
                      : ["Client", "Business Name", "Source", "Opportunity", "Rate", "Monthly"]
                    ).map(h => (
                      <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No leads found.</td></tr>
                  ) : filtered.map(l => (
                    <tr
                      key={l.id}
                      className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50/80"
                      onClick={() => setSelectedId(l.id)}
                    >
                      {isExec && <td className="px-4 py-3 whitespace-nowrap text-slate-600">{leadDateKey(l) || "—"}</td>}
                      {isExec && <td className="px-4 py-3 text-slate-600">{l.assignedToName || "—"}</td>}
                      <td className="px-4 py-3 font-medium text-slate-800">{l.clientName}</td>
                      <td className="px-4 py-3 text-slate-600">{l.businessName || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{l.channel}</td>
                      <td className="px-4 py-3"><Pill tone={stageTone(l.stage)}>{l.stage}</Pill></td>
                      {isExec && (
                        <td className="px-4 py-3">
                          {l.status ? <Pill tone={statusTone(l.status)}>{l.status}</Pill> : <span className="text-slate-400">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 text-slate-700">{l.rate || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{l.monthlyRevenue || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {isExec && (
        <>
          <LeadFormModal
            open={addOpen}
            onClose={() => setAddOpen(false)}
            title="Add lead"
            initial={emptyLeadForm()}
            channels={channels}
            assignees={assignees}
            onSave={async (payload) => {
              const created = await apiCreateLead(payload);
              setLeads(list => [created, ...list]);
            }}
          />
          <ManageSourcesModal
            open={manageSources}
            onClose={() => setManageSources(false)}
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
        </>
      )}
    </div>
  );
}
