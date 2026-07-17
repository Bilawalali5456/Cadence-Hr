import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import { B } from "../brand.jsx";
import {
  DEFAULT_ANNUAL_LEAVE, employeeRoster, isLateCheckIn, isNonWorkingDay,
  enumerateWorkingDays, todayKey, monthKey, monthLabel, leavePaidDays, leaveUnpaidDays,
} from "../utils.js";
import { Card, STitle, Pill } from "../components/ui.jsx";

const PIE_COLORS = ["#001520", "#c70b07", "#0f4c75", "#16a34a", "#eab308", "#8b5cf6", "#ec4899"];
const TABS = ["Attendance", "Leave", "Headcount", "Payroll"];
const RANGE_OPTS = [
  { id: "this", label: "This Month" },
  { id: "last", label: "Last Month" },
  { id: "last3", label: "Last 3 Months" },
];

function EmptyState({ msg = "No data available for this period" }) {
  return (
    <div className="h-[300px] flex items-center justify-center text-sm text-slate-400 bg-slate-50 rounded-lg">
      {msg}
    </div>
  );
}

function fmtNum(n) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function rangeBounds(preset) {
  const now = new Date();
  const endToday = todayKey(now);
  if (preset === "last") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: todayKey(start), end: todayKey(end) };
  }
  if (preset === "last3") {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { start: todayKey(start), end: endToday };
  }
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end: endToday };
}

function inRange(dateKey, start, end) {
  if (!dateKey) return false;
  return dateKey >= start && dateKey <= end;
}

function ChartTooltip({ active, payload, label, suffix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      {label != null && <div className="font-medium text-slate-700 mb-1">{label}</div>}
      {(payload || []).filter(Boolean).map((p, i) => (
        <div key={i} style={{ color: p.color || B.dark }}>
          {p.name}: {fmtNum(p.value)}{suffix}
        </div>
      ))}
    </div>
  );
}

export function ReportsPage({ users = [], attendance = [], leaveRequests = [], payroll = [], holidays = [] }) {
  const [tab, setTab] = useState("Attendance");
  const [range, setRange] = useState("this");

  const staff = useMemo(
    () => (employeeRoster(users) || []).filter(u => u && u.id),
    [users]
  );

  const { start, end } = useMemo(() => rangeBounds(range), [range]);

  const workingDays = useMemo(
    () => enumerateWorkingDays(start, end, holidays) || [],
    [start, end, holidays]
  );

  /* ── Attendance metrics ── */
  const attendanceMetrics = useMemo(() => {
    const byDept = {};
    const lateByUser = {};
    const absentByUser = {};

    for (const u of staff) {
      const dept = (u.dept || "Unassigned").trim() || "Unassigned";
      if (!byDept[dept]) byDept[dept] = { present: 0, capacity: 0, employees: 0 };
      byDept[dept].employees += 1;
      byDept[dept].capacity += workingDays.length;

      const presentDates = new Set(
        (attendance || [])
          .filter(r => r && r.userId === u.id && r.checkIn && inRange(r.date, start, end) && !isNonWorkingDay(r.date, holidays))
          .map(r => r.date)
      );
      byDept[dept].present += presentDates.size;

      let late = 0;
      for (const r of (attendance || []).filter(x => x && x.userId === u.id && x.checkIn && inRange(x.date, start, end))) {
        if (isLateCheckIn(r.checkIn, u, holidays)) late += 1;
      }
      if (late > 0) lateByUser[u.id] = { user: u, late };

      let absent = 0;
      for (const d of workingDays) {
        if (!presentDates.has(d)) absent += 1;
      }
      if (absent > 0) absentByUser[u.id] = { user: u, absent };
    }

    const deptBars = Object.entries(byDept)
      .map(([name, v]) => ({
        name,
        pct: v.capacity > 0 ? Math.round((v.present / v.capacity) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.pct - a.pct);

    const topLate = Object.values(lateByUser)
      .sort((a, b) => b.late - a.late)
      .slice(0, 5);

    const topAbsent = Object.values(absentByUser)
      .sort((a, b) => b.absent - a.absent)
      .slice(0, 5);

    return { deptBars, topLate, topAbsent };
  }, [staff, attendance, workingDays, start, end, holidays]);

  /* ── Leave metrics ── */
  const leaveMetrics = useMemo(() => {
    let paid = 0;
    let unpaid = 0;
    const byDept = {};

    for (const r of (leaveRequests || []).filter(x => x && x.status === "approved" && x.userId)) {
      const p = leavePaidDays(r);
      const u = leaveUnpaidDays(r);
      paid += p;
      unpaid += u;
      const user = (users || []).find(x => x && x.id === r.userId);
      const dept = (user?.dept || "Unassigned").trim() || "Unassigned";
      byDept[dept] = (byDept[dept] || 0) + p + u;
    }

    const pie = [
      ...(paid > 0 ? [{ name: "Paid", value: paid, color: "#16a34a" }] : []),
      ...(unpaid > 0 ? [{ name: "Unpaid", value: unpaid, color: "#c70b07" }] : []),
    ];

    const deptBars = Object.entries(byDept)
      .map(([name, days]) => ({ name, days }))
      .sort((a, b) => b.days - a.days);

    const lowBalance = staff
      .map(u => ({
        user: u,
        balance: u.leaveBalance ?? DEFAULT_ANNUAL_LEAVE,
      }))
      .filter(x => x.balance <= 0 || x.balance < 3)
      .sort((a, b) => a.balance - b.balance);

    return { pie, deptBars, lowBalance, paid, unpaid };
  }, [leaveRequests, users, staff]);

  /* ── Headcount metrics ── */
  const headcountMetrics = useMemo(() => {
    const byDept = {};
    const byType = { "Full-time": 0, "Part-time": 0, Contractor: 0 };
    let active = 0;
    let inactive = 0;
    const thisMonth = monthKey();
    let newHires = 0;

    for (const u of staff) {
      const dept = (u.dept || "Unassigned").trim() || "Unassigned";
      byDept[dept] = (byDept[dept] || 0) + 1;
      const t = u.type || "Full-time";
      if (t in byType) byType[t] += 1;
      else byType["Full-time"] += 1;
      if (u.status === "active") active += 1;
      else inactive += 1;
      if (u.hired && String(u.hired).startsWith(thisMonth)) newHires += 1;
    }

    const deptPie = Object.entries(byDept)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const typeBars = Object.entries(byType).map(([name, count]) => ({ name, count }));

    return { deptPie, typeBars, active, inactive, newHires };
  }, [staff]);

  /* ── Payroll metrics ── */
  const payrollMetrics = useMemo(() => {
    const thisMonth = monthKey();
    const monthSlips = (payroll || []).filter(s => s && s.month === thisMonth && typeof s.net === "number");
    const nets = monthSlips.map(s => Number(s.net) || 0);
    const totalNet = nets.reduce((a, b) => a + b, 0);
    const avg = nets.length ? totalNet / nets.length : 0;
    const highest = nets.length ? Math.max(...nets) : 0;
    const lowest = nets.length ? Math.min(...nets) : 0;

    const deptMap = {};
    for (const s of monthSlips) {
      const user = (users || []).find(u => u && u.id === s.userId);
      const dept = (user?.dept || s.dept || "Unassigned").trim() || "Unassigned";
      if (!deptMap[dept]) deptMap[dept] = { dept, count: 0, basic: 0, net: 0 };
      deptMap[dept].count += 1;
      deptMap[dept].basic += Number(s.basic) || 0;
      deptMap[dept].net += Number(s.net) || 0;
    }
    const deptTable = Object.values(deptMap).sort((a, b) => b.net - a.net);

    const monthTotals = {};
    for (const s of (payroll || []).filter(x => x && x.month && typeof x.net === "number")) {
      monthTotals[s.month] = (monthTotals[s.month] || 0) + (Number(s.net) || 0);
    }
    const last6Keys = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      last6Keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    }
    const monthBars = last6Keys
      .filter(k => monthTotals[k] != null)
      .map(k => ({
        name: monthLabel(k).replace(/ \d{4}$/, "").slice(0, 3) + " " + k.slice(2, 4),
        month: k,
        total: monthTotals[k],
      }));

    return { totalNet, avg, highest, lowest, deptTable, monthBars, slipCount: monthSlips.length };
  }, [payroll, users]);

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-slate-200 flex-wrap">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-sm border-b-2 -mb-px"
            style={tab === t ? { borderColor: B.dark, color: B.dark, fontWeight: 600 } : { borderColor: "transparent", color: "#64748b" }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Attendance" && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTS.map(o => (
              <button
                key={o.id}
                onClick={() => setRange(o.id)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                style={range === o.id
                  ? { background: B.dark, color: B.white, borderColor: B.dark }
                  : { background: B.white, color: B.dark, borderColor: "#e2e8f0" }}
              >
                {o.label}
              </button>
            ))}
          </div>

          <Card className="p-5">
            <STitle>Department attendance %</STitle>
            {attendanceMetrics.deptBars.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={attendanceMetrics.deptBars} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip suffix="%" />} />
                  <Bar dataKey="pct" name="Attendance %" fill="#001520" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="p-5 overflow-hidden">
              <STitle>Top Late Arrivals</STitle>
              {attendanceMetrics.topLate.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No data available for this period</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                      <th className="py-2 font-medium">Employee</th>
                      <th className="py-2 font-medium">Department</th>
                      <th className="py-2 font-medium text-right">Late count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceMetrics.topLate.map(({ user, late }) => (
                      <tr key={user.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5 font-medium text-slate-800">{user.name}</td>
                        <td className="py-2.5 text-slate-500">{user.dept || "—"}</td>
                        <td className="py-2.5 text-right"><Pill tone="amber">{late}</Pill></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card className="p-5 overflow-hidden">
              <STitle>Most Absences</STitle>
              {attendanceMetrics.topAbsent.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No data available for this period</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                      <th className="py-2 font-medium">Employee</th>
                      <th className="py-2 font-medium">Department</th>
                      <th className="py-2 font-medium text-right">Absent days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceMetrics.topAbsent.map(({ user, absent }) => (
                      <tr key={user.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5 font-medium text-slate-800">{user.name}</td>
                        <td className="py-2.5 text-slate-500">{user.dept || "—"}</td>
                        <td className="py-2.5 text-right"><Pill tone="slate">{absent}</Pill></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "Leave" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="p-5">
              <STitle>Paid vs Unpaid leaves</STitle>
              {leaveMetrics.pie.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={leaveMetrics.pie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {leaveMetrics.pie.map((entry, i) => (
                        <Cell key={entry.name} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-5">
              <STitle>Leave days by department</STitle>
              {leaveMetrics.deptBars.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={leaveMetrics.deptBars} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="days" name="Leave days" fill="#c70b07" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <STitle>Low leave balance</STitle>
            {leaveMetrics.lowBalance.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No employees with low leave balance</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {leaveMetrics.lowBalance.map(({ user, balance }) => (
                  <div
                    key={user.id}
                    className="p-3 rounded-lg border border-amber-200 bg-amber-50"
                  >
                    <div className="text-sm font-medium text-slate-800">{user.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{user.dept || "—"}</div>
                    <div className="text-sm font-semibold text-amber-800 mt-2">
                      Balance: {balance} day{balance === 1 ? "" : "s"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "Headcount" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="text-xs text-slate-400">Total Active</div>
              <div className="text-2xl font-bold mt-1 text-emerald-700 tabular-nums">{headcountMetrics.active}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-400">Total Inactive</div>
              <div className="text-2xl font-bold mt-1 text-slate-500 tabular-nums">{headcountMetrics.inactive}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-400">New Hires This Month</div>
              <div className="text-2xl font-bold mt-1 text-blue-700 tabular-nums">{headcountMetrics.newHires}</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="p-5">
              <STitle>Department headcount</STitle>
              {headcountMetrics.deptPie.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={headcountMetrics.deptPie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {headcountMetrics.deptPie.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-5">
              <STitle>Employment type</STitle>
              {staff.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={headcountMetrics.typeBars} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Employees" fill="#001520" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "Payroll" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total Payroll This Month", value: fmtMoney(payrollMetrics.totalNet) },
              { label: "Average Salary", value: fmtMoney(payrollMetrics.avg) },
              { label: "Highest Salary", value: fmtMoney(payrollMetrics.highest) },
              { label: "Lowest Salary", value: fmtMoney(payrollMetrics.lowest) },
            ].map(c => (
              <Card key={c.label} className="p-4">
                <div className="text-xs text-slate-400">{c.label}</div>
                <div className="text-xl font-bold mt-1 tabular-nums" style={{ color: B.dark }}>{c.value}</div>
              </Card>
            ))}
          </div>

          <Card className="p-5 overflow-x-auto">
            <STitle>Department payroll summary</STitle>
            {payrollMetrics.deptTable.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No data available for this period</p>
            ) : (
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-2 font-medium">Department</th>
                    <th className="py-2 font-medium text-right">Employee Count</th>
                    <th className="py-2 font-medium text-right">Total Basic</th>
                    <th className="py-2 font-medium text-right">Total Net</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollMetrics.deptTable.map(row => (
                    <tr key={row.dept} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 font-medium text-slate-800">{row.dept}</td>
                      <td className="py-2.5 text-right tabular-nums">{row.count}</td>
                      <td className="py-2.5 text-right tabular-nums">{fmtMoney(row.basic)}</td>
                      <td className="py-2.5 text-right tabular-nums font-medium">{fmtMoney(row.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="p-5">
            <STitle>Monthly payroll (last 6 months)</STitle>
            {payrollMetrics.monthBars.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={payrollMetrics.monthBars} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtMoney(v)} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs">
                          <div className="font-medium text-slate-700 mb-1">{label}</div>
                          <div style={{ color: B.dark }}>Total: {fmtMoney(payload[0]?.value)}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="total" name="Total net" fill="#001520" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
