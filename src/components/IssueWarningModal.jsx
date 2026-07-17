import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { todayKey } from "../utils.js";
import { Modal, SelectInput, Btn, ErrBox } from "./ui.jsx";

export const WARNING_TYPE_OPTIONS = [
  { value: "verbal", label: "Verbal Warning" },
  { value: "written", label: "Written Warning" },
  { value: "final", label: "Final Warning" },
];

export function warningTypeLabel(type) {
  const t = String(type || "verbal").toLowerCase();
  if (t === "written") return "Written Warning";
  if (t === "final") return "Final Warning";
  return "Verbal Warning";
}

export function warningTypeTone(type) {
  const t = String(type || "verbal").toLowerCase();
  if (t === "written") return "orange";
  if (t === "final") return "red";
  return "amber";
}

export function warningTypeShort(type) {
  const t = String(type || "verbal").toLowerCase();
  if (t === "written") return "Written";
  if (t === "final") return "Final";
  return "Verbal";
}

/**
 * Shared “Issue Warning” modal for People and Dashboard Late Alerts.
 * onSubmit({ type, reason, date }) — parent persists warning + notification + email.
 */
export function IssueWarningModal({ open, onClose, employee, issuedBy, onSubmit, defaultReason = "" }) {
  const [type, setType] = useState("verbal");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayKey());
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType("verbal");
    setReason(defaultReason || "");
    setDate(todayKey());
    setErr("");
    setSending(false);
  }, [open, employee?.id, defaultReason]);

  async function handleSubmit() {
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setErr("Reason must be at least 10 characters.");
      return;
    }
    if (!employee?.id) {
      setErr("No employee selected.");
      return;
    }
    setSending(true);
    setErr("");
    try {
      await onSubmit({ type, reason: trimmed, date: date || todayKey() });
      onClose();
    } catch (e) {
      setErr(e?.message || "Failed to issue warning.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Issue Warning — ${employee?.name || ""}`}>
      <div className="space-y-4">
        <div className="flex gap-2 items-start p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
          <p>The employee will receive an email and an in-app notification. Please acknowledge this warning in My Profile.</p>
        </div>
        <SelectInput
          label="Type"
          value={type}
          onChange={setType}
          options={WARNING_TYPE_OPTIONS}
        />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Reason <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            placeholder="Describe the warning (minimum 10 characters)…"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Issued by</label>
            <input
              type="text"
              value={issuedBy || ""}
              readOnly
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-600"
            />
          </div>
        </div>
        <ErrBox msg={err} />
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={onClose} disabled={sending}>Cancel</Btn>
          <Btn onClick={handleSubmit} disabled={sending}>
            <AlertTriangle size={14} />
            {sending ? "Issuing…" : "Issue warning"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
