import React, { useState } from "react";
import { Check, X, Send, Timer, Trash2 } from "lucide-react";
import { B } from "../brand.jsx";
import { isHrAdminRole, canSelfSubmitLeave, visibleShortLeaveRequests, canApproveShortLeaveRequest, canOverrideLeaveDecision, canDeleteShortLeaveRecord, buildShortLeaveRequest, applyApprovedShortLeave, removeShortLeaveFromAttendance, todayKey, formatDate } from "../utils.js";
import { Pill, Avatar, Card, STitle, TextInput, Btn, ErrBox, OkBox } from "../components/ui.jsx";

export function ShortLeavePage({ currentUser, requests = [], setRequests, users, attendance, setAttendance, roles }) {
  const [form, setForm] = useState({ date: todayKey(), from: "", to: "", reason: "" });
  const [msg, setMsg] = useState("");
  const canSubmit = canSelfSubmitLeave(currentUser.role);
  const visibleReqs = visibleShortLeaveRequests(requests, currentUser, users, roles);
  const listHasApprovals = visibleReqs.some(r => canApproveShortLeaveRequest(currentUser, r, users, roles));

  function changeStatus(id, newStatus) {
    const req = requests.find(r => r.id === id);
    if (!req) return;
    const allowed = req.status === "pending"
      ? canApproveShortLeaveRequest(currentUser, req, users, roles)
      : canOverrideLeaveDecision(currentUser);
    if (!allowed) return;
    const prev = req.status;
    if (prev === newStatus) return;
    if (newStatus === "approved" && prev !== "approved") {
      setAttendance(a => applyApprovedShortLeave(a, users, req));
    }
    if (prev === "approved" && newStatus !== "approved") {
      setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    }
    setRequests(rs => rs.map(r => r.id === id ? {
      ...r,
      status: newStatus,
      reviewedBy: currentUser.name,
      reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function deleteRequest(id) {
    const req = requests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(currentUser, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    if (req.status === "approved") setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    setRequests(rs => rs.filter(r => r.id !== id));
  }

  function submit() {
    if (!form.date || !form.from || !form.to) {
      setMsg("error:Please select date, start time, and end time.");
      return;
    }
    if (!form.reason.trim()) {
      setMsg("error:Please provide a reason for short leave.");
      return;
    }
    const me = users.find(u => u.id === currentUser.id) || currentUser;
    const built = buildShortLeaveRequest(me, form.date, form.from, form.to, form.reason);
    if (built.error) {
      setMsg("error:" + built.error);
      return;
    }
    setRequests(p => [...p, built.request]);
    setForm({ date: todayKey(), from: "", to: "", reason: "" });
    setMsg(isHrAdminRole(currentUser.role)
      ? "ok:Short leave request submitted. An executive will review it."
      : "ok:Short leave request submitted. HR will review it shortly.");
    setTimeout(() => setMsg(""), 4000);
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {canSubmit && (
      <Card className="p-5">
        <STitle>Submit short leave request</STitle>
        <p className="text-xs text-slate-500 mb-4">
          {isHrAdminRole(currentUser.role)
            ? "Request partial-day leave. Executives must approve before it is applied to your attendance."
            : "Request partial-day leave (e.g. doctor visit, personal errand). HR must approve before it is applied to your attendance."}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput label="Date" type="date" value={form.date} onChange={v => setForm({ ...form, date: v })} required />
          <div />
          <TextInput label="From time" type="time" value={form.from} onChange={v => setForm({ ...form, from: v })} required />
          <TextInput label="To time" type="time" value={form.to} onChange={v => setForm({ ...form, to: v })} required />
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Reason <span className="text-red-500">*</span></label>
            <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={2}
              placeholder="e.g. Doctor appointment, bank visit…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none resize-none" />
          </div>
        </div>
        {msg.startsWith("error:") && <div className="mt-3"><ErrBox msg={msg.replace("error:", "")} /></div>}
        {msg.startsWith("ok:")    && <div className="mt-3"><OkBox  msg={msg.replace("ok:", "")} /></div>}
        <div className="mt-4"><Btn onClick={submit}><Send size={14} />Submit request</Btn></div>
      </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold" style={{ color: B.dark }}>
            {listHasApprovals ? "Short leave requests" : "My short leave requests"}
          </h3>
        </div>
        {visibleReqs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No short leave requests yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {[...visibleReqs].reverse().map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                <Avatar name={r.empName} />
                <div className="flex-1 min-w-44">
                  <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                  <div className="text-xs text-slate-500">
                    {formatDate(r.date)} · {r.fromTime} – {r.toTime} · {r.minutes} min
                  </div>
                  {r.reason && <div className="text-xs text-slate-400 mt-0.5 italic">"{r.reason}"</div>}
                  {r.reviewedBy && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      Reviewed by {r.reviewedBy} · {r.reviewedOn}
                    </div>
                  )}
                </div>
                {r.status === "pending"  && <Pill tone="amber"><Timer size={12} />Pending</Pill>}
                {r.status === "approved" && <Pill tone="green"><Check size={12} />Approved</Pill>}
                {r.status === "rejected" && <Pill tone="red"><X size={12} />Rejected</Pill>}
                {canApproveShortLeaveRequest(currentUser, r, users, roles) && r.status === "pending" && (
                  <div className="flex gap-2">
                    <button onClick={() => changeStatus(r.id, "approved")}
                      className="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#16a34a" }}>
                      Approve
                    </button>
                    <button onClick={() => changeStatus(r.id, "rejected")}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50">
                      Reject
                    </button>
                  </div>
                )}
                {canOverrideLeaveDecision(currentUser) && r.status !== "pending" && (
                  <button
                    onClick={() => changeStatus(r.id, r.status === "approved" ? "rejected" : "approved")}
                    className="px-3 py-1.5 text-xs font-medium border border-amber-300 text-amber-800 bg-amber-50 rounded-lg hover:bg-amber-100"
                    title="Executive override — change HR decision">
                    Override → {r.status === "approved" ? "Rejected" : "Approved"}
                  </button>
                )}
                {canDeleteShortLeaveRecord(currentUser, r, users, roles) && (
                  <button onClick={() => deleteRequest(r.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                    title="Delete record">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
