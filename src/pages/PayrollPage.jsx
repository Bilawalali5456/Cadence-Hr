import React, { useState } from "react";
import { Wallet, Receipt, ChevronRight, Check, Timer, Trash2, Eye, Save, Landmark } from "lucide-react";
import { B, AdforceLogo } from "../brand.jsx";
import { can, isStaffRole, isHrAdminRole, isExecutiveRole, activePayrollRoster, monthKey, monthLabel, workingDaysInMonth, presentDaysInMonth, lateDaysInMonth, leaveDaysInMonth } from "../utils.js";
import { Pill, Avatar, Card, STitle, Modal, TextInput, Btn, ErrBox } from "../components/ui.jsx";

export function PayrollPage({ currentUser, users, attendance, payroll, setPayroll, company, roles, leaveRequests = [] }) {
  const canManage = can(currentUser.role, "manage_payroll", roles);
  const canViewOrgPayroll = can(currentUser.role, "view_payroll", roles) && isExecutiveRole(currentUser.role);
  const [month, setMonth] = useState(monthKey());
  const [genFor, setGenFor] = useState(null);   // user being generated
  const [slipView, setSlipView] = useState(null); // slip being viewed
  const [genForm, setGenForm] = useState({ basic: "", allowance: "0", bonus: "0", deduction: "0", note: "" });
  const [genErr, setGenErr] = useState("");

  const staff = canManage
    ? users.filter(u => u.status === "active" && isStaffRole(u.role))
    : activePayrollRoster(users, currentUser.role);
  const monthSlips = payroll.filter(s => s.month === month);
  const mySlips = payroll.filter(s => s.userId === currentUser.id).sort((a, b) => b.month.localeCompare(a.month));

  function openGenerate(u) {
    const existing = monthSlips.find(s => s.userId === u.id);
    if (existing) { setSlipView(existing); return; }
    const numericSalary = parseFloat(String(u.salary || "").replace(/[^0-9.]/g, "")) || 0;
    setGenForm({ basic: numericSalary ? String(numericSalary) : "", allowance: "0", bonus: "0", deduction: "0", note: "" });
    setGenErr("");
    setGenFor(u);
  }

  function generateSlip() {
    const basic = parseFloat(genForm.basic) || 0;
    if (basic <= 0) { setGenErr("Enter a valid basic salary."); return; }
    const workDays    = workingDaysInMonth(month);
    const presentDays = presentDaysInMonth(attendance, genFor.id, month);
    const lateDays    = lateDaysInMonth(attendance, genFor.id, month, users);
    const paidLeaveDays = leaveDaysInMonth(leaveRequests, genFor.id, month, "paid");
    const unpaidLeaveDays = leaveDaysInMonth(leaveRequests, genFor.id, month, "unpaid");
    const absentDays  = Math.max(0, workDays - presentDays - paidLeaveDays);
    const perDay      = workDays > 0 ? basic / workDays : 0;
    const absentDeduction = Math.round(perDay * absentDays);
    const unpaidLeaveDeduction = Math.round(perDay * unpaidLeaveDays);
    const allowance   = parseFloat(genForm.allowance) || 0;
    const bonus       = parseFloat(genForm.bonus) || 0;
    const otherDeduction = parseFloat(genForm.deduction) || 0;
    const net = Math.round(basic + allowance + bonus - absentDeduction - unpaidLeaveDeduction - otherDeduction);

    const slip = {
      id: "slip-" + Date.now(),
      userId: genFor.id,
      empName: genFor.name,
      empEmail: genFor.email,
      empTitle: genFor.title || genFor.role,
      month,
      workDays, presentDays, absentDays, lateDays, paidLeaveDays, unpaidLeaveDays,
      basic, allowance, bonus, absentDeduction, unpaidLeaveDeduction, otherDeduction, net,
      note: genForm.note,
      bank: genFor.bank || null,
      generatedBy: currentUser.name,
      generatedOn: new Date().toLocaleDateString(),
      status: "generated",
    };
    setPayroll(p => [...p, slip]);
    setGenFor(null);
    setSlipView(slip);
  }

  function markPaid(id) {
    setPayroll(p => p.map(s => s.id === id ? { ...s, status: "paid", paidOn: new Date().toLocaleDateString() } : s));
    setSlipView(v => v && v.id === id ? { ...v, status: "paid", paidOn: new Date().toLocaleDateString() } : v);
  }

  function deleteSlip(id) {
    if (!window.confirm("Delete this salary slip?")) return;
    setPayroll(p => p.filter(s => s.id !== id));
    setSlipView(null);
  }

  const cur = company.currency || "PKR";

  /* ---------- Salary slip modal (shared) ---------- */
  const SlipModal = () => slipView && (
    <Modal open={true} onClose={() => setSlipView(null)} title="Salary slip" wide>
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        {/* Slip header */}
        <div className="p-5 flex items-center justify-between" style={{ background: B.dark }}>
          <AdforceLogo boxWidth={180} boxHeight={40} />
          <div className="text-right text-white">
            <div className="text-sm font-bold">Salary Slip</div>
            <div className="text-xs opacity-70">{monthLabel(slipView.month)}</div>
          </div>
        </div>
        {/* Employee info */}
        <div className="p-5 grid grid-cols-2 gap-3 text-sm border-b border-slate-100">
          <div><div className="text-xs text-slate-400">Employee</div><div className="font-medium text-slate-800">{slipView.empName}</div></div>
          <div><div className="text-xs text-slate-400">Designation</div><div className="font-medium text-slate-800">{slipView.empTitle}</div></div>
          <div><div className="text-xs text-slate-400">Email</div><div className="font-medium text-slate-800 text-xs">{slipView.empEmail}</div></div>
          <div><div className="text-xs text-slate-400">Status</div>
            {slipView.status === "paid"
              ? <Pill tone="green"><Check size={12} />Paid{slipView.paidOn ? ` · ${slipView.paidOn}` : ""}</Pill>
              : <Pill tone="amber"><Timer size={12} />Generated (unpaid)</Pill>}
          </div>
        </div>
        {/* Attendance summary */}
        <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center border-b border-slate-100 bg-slate-50">
          {[["Working days", slipView.workDays], ["Present", slipView.presentDays], ["Paid leave", slipView.paidLeaveDays ?? 0], ["Absent", slipView.absentDays], ["Late", slipView.lateDays]].map(([l, v]) => (
            <div key={l}><div className="text-xs text-slate-400">{l}</div><div className="text-sm font-bold tabular-nums" style={{ color: B.dark }}>{v}</div></div>
          ))}
        </div>
        {/* Amounts */}
        <div className="p-5 space-y-2 text-sm">
          {[
            ["Basic salary",        slipView.basic,           false],
            ["Allowance",           slipView.allowance,       false],
            ["Bonus",               slipView.bonus,           false],
            ["Absent deduction",    -(slipView.absentDeduction || 0), true],
            [`Unpaid leave deduction (${slipView.unpaidLeaveDays || 0} days)`, -(slipView.unpaidLeaveDeduction || 0), true],
            ["Other deduction",     -(slipView.otherDeduction || 0),  true],
          ].filter(([, v]) => v !== 0).map(([l, v, isDed]) => (
            <div key={l} className="flex justify-between border-b border-slate-50 pb-2">
              <span className="text-slate-500">{l}</span>
              <span className={`font-medium tabular-nums ${isDed ? "text-red-600" : "text-slate-800"}`}>
                {v < 0 ? "-" : ""}{cur} {Math.abs(v).toLocaleString()}
              </span>
            </div>
          ))}
          <div className="flex justify-between pt-2">
            <span className="font-bold" style={{ color: B.dark }}>Net salary</span>
            <span className="font-bold text-lg tabular-nums" style={{ color: B.dark }}>{cur} {slipView.net.toLocaleString()}</span>
          </div>
          {slipView.note && <div className="text-xs text-slate-400 italic pt-1">Note: {slipView.note}</div>}
        </div>
        {/* Bank details */}
        {slipView.bank && (slipView.bank.bankName || slipView.bank.accountNo) && (
          <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-2">
            <Landmark size={13} />
            {slipView.bank.bankName} · {slipView.bank.accountTitle} · {slipView.bank.iban || slipView.bank.accountNo}
          </div>
        )}
        <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between">
          <span>Generated by {slipView.generatedBy} on {slipView.generatedOn}</span>
          <span>Adforce Solutions</span>
        </div>
      </div>
      <div className="flex gap-2 mt-4 flex-wrap">
        {canManage && slipView.status !== "paid" && (
          <Btn onClick={() => markPaid(slipView.id)}><Check size={14} />Mark as paid</Btn>
        )}
        <Btn variant="ghost" onClick={() => window.print()}><Receipt size={14} />Print / Save PDF</Btn>
        {canManage && (
          <Btn variant="danger" onClick={() => deleteSlip(slipView.id)}><Trash2 size={14} />Delete slip</Btn>
        )}
        <Btn variant="ghost" onClick={() => setSlipView(null)}>Close</Btn>
      </div>
    </Modal>
  );

  /* ---------- EMPLOYEE VIEW ---------- */
  if (!canManage && !canViewOrgPayroll) {
    return (
      <div className="max-w-2xl space-y-4">
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold" style={{ color: B.dark }}>My salary slips</h3>
          </div>
          {mySlips.length === 0
            ? <div className="p-8 text-center text-slate-400 text-sm">No salary slips yet. Slips appear here once HR generates them.</div>
            : (
              <div className="divide-y divide-slate-100">
                {mySlips.map(s => (
                  <button key={s.id} onClick={() => setSlipView(s)}
                    className="w-full px-5 py-3 flex items-center gap-3 hover:bg-slate-50 text-left">
                    <div className="p-2 rounded-lg" style={{ background: B.darkLight, color: B.dark }}><Wallet size={16} /></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">{monthLabel(s.month)}</div>
                      <div className="text-xs text-slate-400">{s.presentDays}/{s.workDays} days present</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums" style={{ color: B.dark }}>{cur} {s.net.toLocaleString()}</div>
                      {s.status === "paid" ? <Pill tone="green">Paid</Pill> : <Pill tone="amber">Pending</Pill>}
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </button>
                ))}
              </div>
            )
          }
        </Card>
        <SlipModal />
      </div>
    );
  }

  /* ---------- EXECUTIVE READ-ONLY ORG VIEW ---------- */
  if (canViewOrgPayroll && !canManage) {
    return (
      <div className="space-y-5">
        <div className="p-4 rounded-xl text-sm flex gap-3 items-start" style={{ background: B.darkLight, color: B.dark, border: `1px solid ${B.darkBorder}` }}>
          <Eye size={16} className="mt-0.5 shrink-0" />
          <div><b>View only.</b> Review salary slips and payroll records for employees and HR Admin. Generating or editing slips is restricted to HR Admin.</div>
        </div>
        <Card className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <STitle>Payroll month</STitle>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {[
              ["People", staff.length],
              ["Slips generated", monthSlips.length],
              ["Total payout", cur + " " + monthSlips.reduce((s, x) => s + x.net, 0).toLocaleString()],
            ].map(([l, v]) => (
              <div key={l} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-400">{l}</div>
                <div className="text-lg font-bold tabular-nums" style={{ color: B.dark }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold" style={{ color: B.dark }}>Salary slips — {monthLabel(month)}</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Name", "Role", "Listed salary", "Present / Working", "Late", "Slip", ""].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No active people on file.</td></tr>
              ) : staff.map(u => {
                const slip = monthSlips.find(s => s.userId === u.id);
                const present = presentDaysInMonth(attendance, u.id, month);
                const late = lateDaysInMonth(attendance, u.id, month, users);
                const workDays = workingDaysInMonth(month);
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} size={7} />
                        <div className="font-medium text-slate-800">{u.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Pill tone={isHrAdminRole(u.role) ? "dark" : "slate"}>{u.role}</Pill></td>
                    <td className="px-4 py-3 text-slate-600">{u.salary || "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{present} / {workDays}</td>
                    <td className="px-4 py-3">
                      {late > 0 ? <Pill tone="amber">{late} late</Pill> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {slip
                        ? (slip.status === "paid" ? <Pill tone="green"><Check size={12} />Paid</Pill> : <Pill tone="blue">Generated</Pill>)
                        : <Pill tone="slate">Not generated</Pill>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {slip && (
                        <Btn size="sm" variant="ghost" onClick={() => setSlipView(slip)}>View slip</Btn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <SlipModal />
      </div>
    );
  }

  /* ---------- ADMIN VIEW ---------- */
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <STitle>Payroll month</STitle>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none" />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {[
            ["Employees", staff.length],
            ["Slips generated", monthSlips.length],
            ["Total payout", cur + " " + monthSlips.reduce((s, x) => s + x.net, 0).toLocaleString()],
          ].map(([l, v]) => (
            <div key={l} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-400">{l}</div>
              <div className="text-lg font-bold tabular-nums" style={{ color: B.dark }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold" style={{ color: B.dark }}>Generate slips — {monthLabel(month)}</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
              {["Employee", "Present / Working", "Late days", "Slip", ""].map(h => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No active employees.</td></tr>
            ) : staff.map(u => {
              const slip = monthSlips.find(s => s.userId === u.id);
              const present = presentDaysInMonth(attendance, u.id, month);
              const late = lateDaysInMonth(attendance, u.id, month, users);
              const workDays = workingDaysInMonth(month);
              return (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={u.name} size={7} />
                      <div>
                        <div className="font-medium text-slate-800">{u.name}</div>
                        <div className="text-xs text-slate-400">{u.title || u.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{present} / {workDays}</td>
                  <td className="px-4 py-3">
                    {late > 0 ? <Pill tone="amber">{late} late</Pill> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {slip
                      ? (slip.status === "paid" ? <Pill tone="green"><Check size={12} />Paid</Pill> : <Pill tone="blue">Generated</Pill>)
                      : <Pill tone="slate">Not generated</Pill>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Btn size="sm" variant={slip ? "ghost" : "primary"} onClick={() => openGenerate(u)}>
                      {slip ? "View slip" : "Generate"}
                    </Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Generate modal */}
      {genFor && (
        <Modal open={true} onClose={() => setGenFor(null)} title={`Generate slip — ${genFor.name} (${monthLabel(month)})`}>
          <div className="space-y-4">
            <div className="p-3 rounded-lg text-xs grid grid-cols-3 gap-2 text-center" style={{ background: B.darkLight, color: B.dark }}>
              <div><b>{workingDaysInMonth(month)}</b><br />working days</div>
              <div><b>{presentDaysInMonth(attendance, genFor.id, month)}</b><br />present</div>
              <div><b>{lateDaysInMonth(attendance, genFor.id, month, users)}</b><br />late</div>
            </div>
            <TextInput label={`Basic salary (${cur})`} type="number" value={genForm.basic} onChange={v => setGenForm({ ...genForm, basic: v })} required placeholder="e.g. 80000" />
            <div className="grid grid-cols-3 gap-3">
              <TextInput label="Allowance" type="number" value={genForm.allowance} onChange={v => setGenForm({ ...genForm, allowance: v })} />
              <TextInput label="Bonus" type="number" value={genForm.bonus} onChange={v => setGenForm({ ...genForm, bonus: v })} />
              <TextInput label="Deduction" type="number" value={genForm.deduction} onChange={v => setGenForm({ ...genForm, deduction: v })} />
            </div>
            <TextInput label="Note (optional)" value={genForm.note} onChange={v => setGenForm({ ...genForm, note: v })} placeholder="e.g. Eid bonus included" />
            <div className="p-3 rounded-lg text-xs bg-amber-50 border border-amber-200 text-amber-800">
              Absent days are deducted automatically: (basic ÷ working days) × absent days. Sundays are off.
            </div>
            {genErr && <ErrBox msg={genErr} />}
            <div className="flex gap-2">
              <Btn onClick={generateSlip}><Wallet size={14} />Generate slip</Btn>
              <Btn variant="ghost" onClick={() => setGenFor(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      <SlipModal />
    </div>
  );
}
