import React, { useState } from "react";
import { Check, X, Send, Timer, Trash2 } from "lucide-react";
import { B } from "../brand.jsx";
import { DEFAULT_ANNUAL_LEAVE, isHrAdminRole, canSelfSubmitLeave, visibleLeaveRequests, canApproveLeaveRequest, canDeleteLeaveRecord, countWorkingDaysInclusive, leavePaidDays, leaveUnpaidDays, computeLeavePaySplit } from "../utils.js";
import { Pill, Avatar, Card, STitle, TextInput, SelectInput, Btn, ErrBox, OkBox } from "../components/ui.jsx";

export function LeavePage({ currentUser, requests, setRequests, users, setUsers, roles }) {
  const [form, setForm] = useState({ type: "Annual", from: "", to: "", note: "" });
  const [msg,  setMsg]  = useState("");
  const canSubmit = canSelfSubmitLeave(currentUser.role);
  const me      = users.find(u => u.id === currentUser.id) || currentUser;
  const available = me.leaveBalance ?? DEFAULT_ANNUAL_LEAVE;
  const previewDays = (form.from && form.to)
    ? countWorkingDaysInclusive(form.from, form.to)
    : 0;
  const previewSplit = previewDays > 0
    ? computeLeavePaySplit(form.type, previewDays, available)
    : null;
  const visibleReqs = visibleLeaveRequests(requests, currentUser, users, roles);
  const listHasApprovals = visibleReqs.some(r => canApproveLeaveRequest(currentUser, r, users, roles));

  function adjustBalance(userId, type, delta) {
    if (type === "Unpaid" || delta === 0) return;
    setUsers(us => us.map(u => {
      if (u.id !== userId) return u;
      return { ...u, leaveBalance: Math.max(0, (u.leaveBalance ?? DEFAULT_ANNUAL_LEAVE) + delta) };
    }));
  }

  function submitLeave() {
    if (!form.from || !form.to) { setMsg("error:Please select both From and To dates."); return; }
    const days = countWorkingDaysInclusive(form.from, form.to);
    if (days <= 0) {
      setMsg("error:Selected dates fall on weekend only. Choose at least one working day (Mon–Fri).");
      return;
    }
    const split = computeLeavePaySplit(form.type, days, available);
    const warn = split.unpaidDays > 0
      ? `warn:You have insufficient leave balance. ${split.unpaidDays} day${split.unpaidDays !== 1 ? "s" : ""} will be deducted from your salary as unpaid leave.`
      : "";
    setRequests(p => [...p, {
      id: "l" + Date.now(),
      userId: currentUser.id,
      empName: currentUser.name,
      type: form.type,
      from: form.from,
      to: form.to,
      note: form.note,
      days,
      paidDays: split.paidDays,
      unpaidDays: split.unpaidDays,
      payTag: split.payTag,
      status: "pending",
      submitted: new Date().toLocaleDateString(),
    }]);
    setForm({ type: "Annual", from: "", to: "", note: "" });
    setMsg(warn || (isHrAdminRole(currentUser.role)
      ? "ok:Leave request submitted for executive approval."
      : "ok:Leave request submitted."));
    setTimeout(() => setMsg(""), 6000);
  }

  function changeStatus(id, newStatus) {
    const req = requests.find(r => r.id === id);
    if (!req || !canApproveLeaveRequest(currentUser, req, users, roles)) return;
    const prev = req.status;
    if (prev === newStatus) return;
    const paid = leavePaidDays(req);
    if (newStatus === "approved" && prev !== "approved") adjustBalance(req.userId, req.type, -paid);
    if (prev === "approved" && newStatus !== "approved")  adjustBalance(req.userId, req.type, +paid);
    setRequests(p => p.map(r => r.id === id ? {
      ...r, status: newStatus, reviewedBy: currentUser.name, reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function deleteRequest(id) {
    const req = requests.find(r => r.id === id);
    if (!req || !canDeleteLeaveRecord(currentUser, req, users, roles)) return;
    if (!window.confirm(`Delete this leave request from ${req.empName}?`)) return;
    if (req.status === "approved") adjustBalance(req.userId, req.type, +leavePaidDays(req));
    setRequests(p => p.filter(r => r.id !== id));
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {canSubmit && (
      <>
      <div className="grid grid-cols-1 gap-3 max-w-xs">
        <Card className="p-4">
          <div className="text-xs text-slate-400">Annual leave balance</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: B.dark }}>
            {available} <span className="text-sm font-normal text-slate-400">of {DEFAULT_ANNUAL_LEAVE} days</span>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <STitle>Submit leave request</STitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectInput label="Leave type" value={form.type} onChange={v => setForm({ ...form, type: v })}
            options={[
              { value: "Annual", label: "Annual Leave" },
              { value: "Unpaid", label: "Unpaid Leave" },
            ]} />
          <div className="flex items-end">
            <div className="text-xs text-slate-500 pb-2">
              Remaining balance: <b style={{ color: B.dark }}>{available} days</b>
              {previewDays > 0 && <> · Requesting <b>{previewDays}</b> working day{previewDays !== 1 ? "s" : ""}</>}
            </div>
          </div>
          <TextInput label="From date" type="date" value={form.from} onChange={v => setForm({ ...form, from: v })} required />
          <TextInput label="To date"   type="date" value={form.to}   onChange={v => setForm({ ...form, to: v })}   required />
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Reason (optional)</label>
            <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2} placeholder="Brief reason for the request…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none resize-none" />
          </div>
        </div>
        {previewSplit?.unpaidDays > 0 && (
          <div className="mt-3 p-3 rounded-lg text-xs bg-amber-50 border border-amber-200 text-amber-800">
            You have insufficient leave balance. {previewSplit.unpaidDays} day{previewSplit.unpaidDays !== 1 ? "s" : ""} will be deducted from your salary as unpaid leave.
          </div>
        )}
        {msg.startsWith("error:") && <div className="mt-3"><ErrBox msg={msg.replace("error:", "")} /></div>}
        {msg.startsWith("warn:") && (
          <div className="mt-3 p-3 rounded-lg text-sm bg-amber-50 border border-amber-200 text-amber-800">{msg.replace("warn:", "")}</div>
        )}
        {msg.startsWith("ok:")    && <div className="mt-3"><OkBox  msg={msg.replace("ok:", "")} /></div>}
        <div className="mt-3"><Btn onClick={submitLeave}><Send size={14} />Submit request</Btn></div>
      </Card>
      </>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold" style={{ color: B.dark }}>{listHasApprovals ? "Leave requests" : "My requests"}</h3>
        </div>
        {visibleReqs.length === 0
          ? <div className="p-8 text-center text-slate-400 text-sm">No leave requests yet.</div>
          : (
            <div className="divide-y divide-slate-100">
              {visibleReqs.map(r => (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                  <Avatar name={r.empName} />
                  <div className="flex-1 min-w-40">
                    <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                    <div className="text-xs text-slate-500">{r.type === "Unpaid" ? "Unpaid Leave" : "Annual Leave"} · {r.from} → {r.to} · {r.days} day{r.days !== 1 ? "s" : ""}</div>
                    {r.note && <div className="text-xs text-slate-400 mt-0.5 italic">"{r.note}"</div>}
                  </div>
                  {(r.payTag === "Unpaid" || leaveUnpaidDays(r) > 0)
                    ? <Pill tone="red">Unpaid</Pill>
                    : <Pill tone="green">Paid</Pill>}
                  {r.status === "pending"  && <Pill tone="amber"><Timer size={12} />Pending</Pill>}
                  {r.status === "approved" && <Pill tone="green"><Check size={12} />Approved</Pill>}
                  {r.status === "rejected" && <Pill tone="slate"><X size={12} />Rejected</Pill>}
                  {canApproveLeaveRequest(currentUser, r, users, roles) && r.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => changeStatus(r.id, "approved")}
                        className="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#16a34a" }}>
                        Approve
                      </button>
                      <button onClick={() => changeStatus(r.id, "rejected")}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg">
                        Reject
                      </button>
                    </div>
                  )}
                  {canApproveLeaveRequest(currentUser, r, users, roles) && r.status !== "pending" && (
                    <button
                      onClick={() => changeStatus(r.id, r.status === "approved" ? "rejected" : "approved")}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50"
                      title="Change decision">
                      Change to {r.status === "approved" ? "Rejected" : "Approved"}
                    </button>
                  )}
                  {canDeleteLeaveRecord(currentUser, r, users, roles) && (
                    <button
                      onClick={() => deleteRequest(r.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                      title="Delete request">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        }
      </Card>
    </div>
  );
}
