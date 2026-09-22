import React, { useState, useEffect, useMemo } from "react";
import { Wallet, Receipt, ChevronRight, Check, Timer, Trash2, Eye, Landmark, Download, Loader2 } from "lucide-react";
import { B, AdforceLogo } from "../brand.jsx";
import {
  can, isStaffRole, isHrEmployeeRole, isHrAdminRole, isExecutiveRole,
  activePayrollRoster, monthKey, monthLabel, workingDaysInMonth,
  presentDaysInMonth, lateDaysInMonth, parseSalaryAmount,
} from "../utils.js";
import { Pill, Avatar, Card, STitle, Modal, Btn, ErrBox, UserDisplayName } from "../components/ui.jsx";
import {
  apiGetPayroll, apiGeneratePayrollSlip, apiGenerateAllPayroll,
  apiDownloadBankSheet, apiUpdatePayroll, apiDeletePayroll, apiFetchAttendance,
} from "../api.js";

function money(n, cur = "PKR") {
  const v = Number(n) || 0;
  return `${cur} ${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function PayslipCard({ slip, currency = "PKR" }) {
  if (!slip) return null;
  const cur = currency;
  const fuel = Number(slip.fuelAllowance ?? 0);
  const mobile = Number(slip.mobilePackage ?? 0);
  const basic = Number(slip.basicSalary ?? slip.basic ?? 0);
  const gross = Number(slip.grossSalary ?? slip.gross ?? (basic + fuel + mobile));
  const absentDed = Number(slip.absentDeduction || 0);
  const lateDed = Number(slip.latePenaltyDeduction || 0);
  const tax = Number(slip.incomeTax || 0);
  const totalDed = Number(slip.totalDeductions ?? (absentDed + lateDed + tax));
  const net = Number(slip.net || 0);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="p-5 flex items-center justify-between" style={{ background: B.dark }}>
        <AdforceLogo boxWidth={180} boxHeight={40} />
        <div className="text-right text-white">
          <div className="text-sm font-bold">Salary Slip</div>
          <div className="text-xs opacity-70">{slip.monthLabel || monthLabel(slip.month)}</div>
        </div>
      </div>

      <div className="p-5 grid grid-cols-2 gap-3 text-sm border-b border-slate-100">
        <div>
          <div className="text-xs text-slate-400">Employee</div>
          <div className="font-medium text-slate-800">{slip.empName}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Designation</div>
          <div className="font-medium text-slate-800">{slip.empTitle || "—"}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Employee ID</div>
          <div className="font-medium text-slate-800 text-xs">{slip.empId || slip.userId}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Status</div>
          {slip.status === "paid"
            ? <Pill tone="green"><Check size={12} />Paid{slip.paidOn ? ` · ${slip.paidOn}` : ""}</Pill>
            : <Pill tone="amber"><Timer size={12} />Generated</Pill>}
        </div>
      </div>

      <div className="p-5 border-b border-slate-100">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Earnings</div>
        <div className="space-y-2 text-sm">
          <Row label="Basic Salary" value={money(basic, cur)} />
          <Row label="Fuel Allowance" value={money(fuel, cur)} />
          <Row label="Mobile Package" value={money(mobile, cur)} />
          <Row label="Gross Salary" value={money(gross, cur)} bold />
        </div>
      </div>

      <div className="p-5 border-b border-slate-100">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Deductions</div>
        <div className="space-y-2 text-sm">
          <Row label={`Absent Days (${slip.absentDays ?? 0})`} value={`-${money(absentDed, cur)}`} danger />
          <Row
            label={`Late Penalty (${slip.latePenaltyDays ?? 0} day${(slip.latePenaltyDays || 0) === 1 ? "" : "s"})`}
            value={`-${money(lateDed, cur)}`}
            danger
          />
          <Row label="Income Tax" value={money(tax, cur)} danger={tax > 0} />
          <Row label="Total Deductions" value={`-${money(totalDed, cur)}`} bold danger />
        </div>
      </div>

      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center" style={{ background: B.darkLight }}>
        <span className="font-bold" style={{ color: B.dark }}>Net Salary</span>
        <span className="font-bold text-xl tabular-nums" style={{ color: B.dark }}>{money(net, cur)}</span>
      </div>

      <div className="px-5 py-3 text-xs text-slate-500 grid grid-cols-2 sm:grid-cols-3 gap-2 border-b border-slate-100">
        <div>Working Days: <b className="text-slate-800">{slip.workDays ?? "—"}</b></div>
        <div>Present: <b className="text-slate-800">{slip.presentDays ?? "—"}</b></div>
        <div>Late: <b className="text-slate-800">{slip.lateDays ?? "—"}</b></div>
        <div>Leaves: <b className="text-slate-800">{slip.leaveDays ?? slip.paidLeaveDays ?? "—"}</b></div>
        <div>Absent: <b className="text-slate-800">{slip.absentDays ?? "—"}</b></div>
        <div>Payable Days: <b className="text-slate-800">{slip.payableDays ?? "—"}</b></div>
      </div>

      {slip.bank && (slip.bank.bankName || slip.bank.accountNo) && (
        <div className="px-5 py-3 text-xs text-slate-500 flex items-center gap-2 border-b border-slate-100">
          <Landmark size={13} />
          {[slip.bank.bankName, slip.bank.accountTitle, slip.bank.accountNo || slip.bank.iban].filter(Boolean).join(" · ")}
        </div>
      )}

      <div className="px-5 py-3 text-xs text-slate-400 flex justify-between">
        <span>Generated by {slip.generatedBy || "HR"} on {slip.generatedOn || "—"}</span>
        <span>Adforce Solutions</span>
      </div>
    </div>
  );
}

function Row({ label, value, bold, danger }) {
  return (
    <div className={`flex justify-between ${bold ? "pt-1 border-t border-slate-100" : ""}`}>
      <span className={bold ? "font-semibold text-slate-800" : "text-slate-500"}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-bold" : "font-medium"} ${danger ? "text-red-600" : "text-slate-800"}`}>
        {value}
      </span>
    </div>
  );
}

export function PayrollPage({ currentUser, users, attendance: _attendanceProp, payroll, setPayroll, company, roles, leaveRequests = [], holidays = [] }) {
  const canManage = can(currentUser.role, "manage_payroll", roles);
  const isExec = isExecutiveRole(currentUser.role);
  const canViewOrgPayroll = can(currentUser.role, "view_payroll", roles) && isExec;
  const [month, setMonth] = useState(monthKey());
  const [slipView, setSlipView] = useState(null);
  const [genErr, setGenErr] = useState("");
  const [monthAttendance, setMonthAttendance] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);
  const [downloadingBank, setDownloadingBank] = useState(false);

  const staff = canManage
    ? users.filter(u => u.status === "active" && (isStaffRole(u.role) || isHrEmployeeRole(u.role)))
    : activePayrollRoster(users, currentUser.role);
  const monthSlips = payroll.filter(s => s.month === month);
  const mySlips = payroll.filter(s => s.userId === currentUser.id).sort((a, b) => b.month.localeCompare(a.month));
  const myMonthSlip = mySlips.find(s => s.month === month);
  const cur = company.currency || "PKR";

  const monthOptions = useMemo(() => {
    const set = new Set([monthKey()]);
    for (const s of payroll) {
      if (s?.month) set.add(s.month);
    }
    return [...set].sort().reverse();
  }, [payroll]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await apiGetPayroll(canManage || canViewOrgPayroll ? { month } : {});
        if (cancelled) return;
        setPayroll(list);
      } catch (e) {
        console.error("Failed to fetch payroll:", e?.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, [month, setPayroll, canManage, canViewOrgPayroll]);

  useEffect(() => {
    if (!canManage && !canViewOrgPayroll) return;
    let cancelled = false;
    setAttendanceLoading(true);
    (async () => {
      try {
        const list = await apiFetchAttendance({ month });
        if (cancelled) return;
        setMonthAttendance(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setMonthAttendance([]);
      } finally {
        if (!cancelled) setAttendanceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month, canManage, canViewOrgPayroll]);

  async function generateOne(u, { regenerate = false } = {}) {
    if (isHrEmployeeRole(currentUser.role) && u.id === currentUser.id) {
      setGenErr("You cannot generate your own payslip.");
      return;
    }
    setGenErr("");
    setGeneratingId(u.id);
    try {
      const saved = await apiGeneratePayrollSlip({ userId: u.id, month });
      if (!saved) throw new Error("Salary slip was not saved.");
      setPayroll(p => [
        ...p.filter(s => !(s && s.userId === saved.userId && s.month === saved.month)),
        saved,
      ]);
      setSlipView(saved);
    } catch (e) {
      setGenErr(e?.message || String(e));
    } finally {
      setGeneratingId(null);
    }
  }

  async function generateAll() {
    if (!isExec) return;
    const count = staff.length;
    if (!window.confirm(`Generate payslips for ${count} employee${count === 1 ? "" : "s"} for ${monthLabel(month)}?`)) {
      return;
    }
    setGeneratingAll(true);
    setGenErr("");
    try {
      const result = await apiGenerateAllPayroll(month);
      const list = await apiGetPayroll({ month });
      setPayroll(list);
      window.alert(
        `Generated ${result.generated} slips.\nGross: ${money(result.totalGross, cur)}\nDeductions: ${money(result.totalDeductions, cur)}\nNet: ${money(result.totalNet, cur)}`
      );
    } catch (e) {
      setGenErr(e?.message || String(e));
    } finally {
      setGeneratingAll(false);
    }
  }

  async function downloadBank() {
    if (!isExec) return;
    setDownloadingBank(true);
    setGenErr("");
    try {
      await apiDownloadBankSheet(month);
    } catch (e) {
      setGenErr(e?.message || String(e));
    } finally {
      setDownloadingBank(false);
    }
  }

  async function markPaid(id) {
    const slip = payroll.find(s => s && s.id === id) || (slipView && slipView.id === id ? slipView : null);
    if (!slip) return;
    try {
      const saved = await apiUpdatePayroll(id, {
        ...slip,
        status: "paid",
        paidOn: new Date().toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" }),
      });
      if (!saved) throw new Error("Update failed.");
      setPayroll(p => p.map(s => (s && s.id === id ? saved : s)));
      setSlipView(v => (v && v.id === id ? saved : v));
    } catch (e) {
      setGenErr(e?.message || String(e));
    }
  }

  async function deleteSlip(id) {
    if (!window.confirm("Delete this salary slip?")) return;
    setGenErr("");
    try {
      await apiDeletePayroll(id);
      setPayroll(p => p.filter(s => s.id !== id));
      setSlipView(null);
    } catch (e) {
      setGenErr(e?.message || String(e));
    }
  }

  const SlipModal = () => slipView && (
    <Modal open={true} onClose={() => setSlipView(null)} title="Salary slip" wide>
      <PayslipCard slip={slipView} currency={cur} />
      <div className="flex gap-2 mt-4 flex-wrap">
        {canManage && slipView.status !== "paid" && (
          <Btn onClick={() => markPaid(slipView.id)}><Check size={14} />Mark as paid</Btn>
        )}
        {canManage && (
          <Btn variant="ghost" onClick={() => generateOne({ id: slipView.userId, name: slipView.empName }, { regenerate: true })}>
            Regenerate
          </Btn>
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
        <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <STitle>My payslip</STitle>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
          >
            {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </Card>

        {myMonthSlip ? (
          <PayslipCard slip={myMonthSlip} currency={cur} />
        ) : (
          <Card className="p-8 text-center text-sm text-slate-400">
            Payslip for {monthLabel(month)} has not been generated yet.
          </Card>
        )}

        {mySlips.length > 1 && (
          <Card className="overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200">
              <h3 className="text-sm font-semibold" style={{ color: B.dark }}>Past slips</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {mySlips.filter(s => s.month !== month).map(s => (
                <button key={s.id} type="button" onClick={() => { setMonth(s.month); setSlipView(s); }}
                  className="w-full px-5 py-3 flex items-center gap-3 hover:bg-slate-50 text-left">
                  <div className="p-2 rounded-lg" style={{ background: B.darkLight, color: B.dark }}><Wallet size={16} /></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">{monthLabel(s.month)}</div>
                    <div className="text-xs text-slate-400">{s.presentDays}/{s.workDays} days present</div>
                  </div>
                  <div className="text-sm font-bold tabular-nums" style={{ color: B.dark }}>{money(s.net, cur)}</div>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
              ))}
            </div>
          </Card>
        )}
        <SlipModal />
      </div>
    );
  }

  /* ---------- EXECUTIVE / HR MANAGE VIEW ---------- */
  return (
    <div className="space-y-5">
      {genErr && <ErrBox msg={genErr} />}

      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <STitle>Payroll month</STitle>
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none" />
            {isExec && (
              <>
                <Btn onClick={generateAll} disabled={generatingAll || attendanceLoading}>
                  {generatingAll ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />}
                  {generatingAll ? "Generating…" : "Generate All Slips"}
                </Btn>
                {monthSlips.length > 0 && (
                  <Btn variant="ghost" onClick={downloadBank} disabled={downloadingBank}>
                    {downloadingBank ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Download Bank Sheet
                  </Btn>
                )}
              </>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[
            ["Employees", staff.length],
            ["Slips generated", monthSlips.length],
            ["Total payout", money(monthSlips.reduce((s, x) => s + (Number(x.net) || 0), 0), cur)],
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Employee", "Gross", "Fuel", "Mobile", "Tax", "Deductions", "Net", "Slip", ""].map(h => (
                  <th key={h || "actions"} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No active employees.</td></tr>
              ) : attendanceLoading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading attendance…</td></tr>
              ) : staff.map(u => {
                const slip = monthSlips.find(s => s.userId === u.id);
                const isOwnHr = isHrEmployeeRole(currentUser.role) && u.id === currentUser.id;
                const gross = slip
                  ? (slip.grossSalary ?? slip.gross ?? 0)
                  : parseSalaryAmount(u.salary);
                const fuel = slip ? (slip.fuelAllowance ?? 0) : (u.fuelAllowance || 0);
                const mobile = slip ? (slip.mobilePackage ?? 0) : (u.mobilePackage || 0);
                const tax = slip?.incomeTax ?? "—";
                const ded = slip?.totalDeductions ?? "—";
                const net = slip?.net ?? "—";
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} size={7} />
                        <div>
                          <UserDisplayName user={u} />
                          <div className="text-xs text-slate-400">{u.title || u.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{Number(gross).toLocaleString()}</td>
                    <td className="px-4 py-3 tabular-nums">{Number(fuel).toLocaleString()}</td>
                    <td className="px-4 py-3 tabular-nums">{Number(mobile).toLocaleString()}</td>
                    <td className="px-4 py-3 tabular-nums">{tax === "—" ? "—" : Number(tax).toLocaleString()}</td>
                    <td className="px-4 py-3 tabular-nums">{ded === "—" ? "—" : Number(ded).toLocaleString()}</td>
                    <td className="px-4 py-3 tabular-nums font-medium">{net === "—" ? "—" : Number(net).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {slip
                        ? (slip.status === "paid"
                          ? <Pill tone="green"><Check size={12} />Paid</Pill>
                          : <Pill tone="blue">Generated ✅</Pill>)
                        : <Pill tone="slate">Not generated</Pill>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {slip && (
                        <Btn size="sm" variant="ghost" onClick={() => setSlipView(slip)}>View</Btn>
                      )}
                      {canManage && !isOwnHr && (
                        <Btn
                          size="sm"
                          variant={slip ? "ghost" : "primary"}
                          onClick={() => generateOne(u)}
                          disabled={generatingId === u.id || generatingAll}
                        >
                          {generatingId === u.id ? "…" : (slip ? "Regen" : "Generate")}
                        </Btn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <SlipModal />
    </div>
  );
}
