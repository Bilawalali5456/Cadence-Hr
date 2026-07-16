import React, { useState } from "react";
import { Users, Clock, Check, AlertTriangle, BadgeCheck, Trash2, LogOut, LogIn } from "lucide-react";
import { B } from "../brand.jsx";
import { can, isHrAdminRole, isExecutiveRole, employeeRoster, isHrAdminRequest, canApproveShortLeaveRequest, canDeleteShortLeaveRecord, attendanceVisibleUserIds, activeAttendanceRoster, formatShiftRange, formatDurationMs, calcTotalBreakMs, calcNetWorkingMs, isLateCheckIn, resolveDayStatus, dayStatusPill, applyApprovedShortLeave, removeShortLeaveFromAttendance, displayWorkingHours, todayKey, isWeekendDate, formatTime, formatDate, getUserTodayRecord, filterAttendanceByPeriod } from "../utils.js";
import { Pill, Avatar, Card, STitle, Btn, ErrBox } from "../components/ui.jsx";
import { EmployeeShiftPanel } from "../components/EmployeeShiftPanel.jsx";
import { HrAdminOversightPanel } from "./Dashboard.jsx";

export function AttendancePage({ currentUser, users, attendance, setAttendance, shortLeaveRequests, setShortLeaveRequests, leaveRequests, setLeaveRequests, setUsers, roles }) {
  const me = users.find(u => u.id === currentUser.id) || currentUser;
  const showReports = can(currentUser.role, "view_attendance_reports", roles);

  if (isHrAdminRole(currentUser.role) && showReports) {
    return (
      <div className="space-y-5">
        <EmployeeAttendanceFull user={me} attendance={attendance} setAttendance={setAttendance} />
        <AdminAttendanceView
          users={users}
          attendance={attendance}
          setAttendance={setAttendance}
          shortLeaveRequests={shortLeaveRequests}
          setShortLeaveRequests={setShortLeaveRequests}
          leaveRequests={leaveRequests}
          setLeaveRequests={setLeaveRequests}
          setUsers={setUsers}
          currentUser={currentUser}
          roles={roles}
        />
      </div>
    );
  }

  if (showReports) {
    return (
      <AdminAttendanceView
        users={users}
        attendance={attendance}
        setAttendance={setAttendance}
        shortLeaveRequests={shortLeaveRequests}
        setShortLeaveRequests={setShortLeaveRequests}
        leaveRequests={leaveRequests}
        setLeaveRequests={setLeaveRequests}
        setUsers={setUsers}
        currentUser={currentUser}
        roles={roles}
      />
    );
  }

  return <EmployeeAttendanceFull user={me} attendance={attendance} setAttendance={setAttendance} />;
}

export function EmployeeAttendanceFull({ user, attendance, setAttendance }) {
  const history = attendance
    .filter(r => r.userId === user.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  return (
    <div className="space-y-5 max-w-3xl">
      <EmployeeShiftPanel user={user} attendance={attendance} setAttendance={setAttendance} />
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200"><STitle>My attendance history</STitle></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Date", "Check in", "Check out", "Break", "Hours", "Status"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No attendance records yet.</td></tr>
              ) : history.map(r => {
                const ds = dayStatusPill(resolveDayStatus(user, r));
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-700">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatTime(r.checkIn)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r.checkOut)}{r.autoCheckout && <Pill tone="amber">Auto</Pill>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatDurationMs(calcTotalBreakMs(r))}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, user)}</td>
                    <td className="px-4 py-3"><Pill tone={ds.tone}>{ds.label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function AdminAttendanceView({ users, attendance, setAttendance, shortLeaveRequests, setShortLeaveRequests, leaveRequests, setLeaveRequests, setUsers, currentUser, roles }) {
  const [period, setPeriod] = useState("daily");
  const staffRoster = employeeRoster(users);
  const allStaff = staffRoster.filter(u => u.status === "active");
  const liveRoster = isExecutiveRole(currentUser.role)
    ? activeAttendanceRoster(users, currentUser.role)
    : allStaff;
  const visibleIds = attendanceVisibleUserIds(users, currentUser.role);
  const pendingShort = shortLeaveRequests.filter(r =>
    r.status === "pending" && canApproveShortLeaveRequest(currentUser, r, users, roles)
    && !(isExecutiveRole(currentUser.role) && isHrAdminRequest(r, users))
  );

  function changeShortStatus(id, newStatus) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canApproveShortLeaveRequest(currentUser, req, users, roles)) return;
    const prev = req.status;
    if (prev === newStatus) return;
    if (newStatus === "approved" && prev !== "approved") {
      setAttendance(a => applyApprovedShortLeave(a, users, req));
    }
    if (prev === "approved" && newStatus !== "approved") {
      setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    }
    setShortLeaveRequests(rs => rs.map(r => r.id === id ? {
      ...r,
      status: newStatus,
      reviewedBy: currentUser.name,
      reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function deleteShort(id) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(currentUser, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    if (req.status === "approved") setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    setShortLeaveRequests(rs => rs.filter(r => r.id !== id));
  }

  const checkedInNow = liveRoster.filter(u => { const r = getUserTodayRecord(attendance, u.id); return r?.checkIn && !r?.checkOut; });
  const lateToday = liveRoster.filter(u => { const r = getUserTodayRecord(attendance, u.id); return r?.checkIn && isLateCheckIn(r.checkIn, u); });
  const autoToday = attendance.filter(r => r.date === todayKey() && r.autoCheckout && visibleIds.has(r.userId));

  const reportRows = filterAttendanceByPeriod(attendance, period)
    .filter(r => visibleIds.has(r.userId))
    .map(r => {
      const user = users.find(u => u.id === r.userId);
      return user ? { ...r, name: user.name, dept: user.dept || user.role || "—", shift: formatShiftRange(user), user } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date) || (a.name || "").localeCompare(b.name || ""));

  const periodTotalMs = reportRows.reduce((sum, r) => sum + (r.workingMs || calcNetWorkingMs(r)), 0);

  return (
    <div className="space-y-5">
      {isExecutiveRole(currentUser.role) && (
        <HrAdminOversightPanel
          users={users}
          attendance={attendance}
          shortLeaveRequests={shortLeaveRequests}
          leaveRequests={leaveRequests}
          currentUser={currentUser}
          setAttendance={setAttendance}
          setShortLeaveRequests={setShortLeaveRequests}
          setLeaveRequests={setLeaveRequests}
          setUsers={setUsers}
          roles={roles}
        />
      )}

      {pendingShort.length > 0 && (
        <Card className="p-5 border-amber-200 bg-amber-50/30">
          <STitle right={<Pill tone="amber">{pendingShort.length} pending</Pill>}>Short leave approvals</STitle>
          <div className="divide-y divide-amber-100">
            {pendingShort.map(r => (
              <div key={r.id} className="py-3 flex items-center gap-3 flex-wrap">
                <Avatar name={r.empName} />
                <div className="flex-1 min-w-48">
                  <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                  <div className="text-xs text-slate-500">
                    {formatDate(r.date)} · {r.fromTime} – {r.toTime} · {r.minutes} min
                  </div>
                  {r.reason && <div className="text-xs text-slate-400 mt-0.5 italic">"{r.reason}"</div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => changeShortStatus(r.id, "approved")}
                    className="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#16a34a" }}>
                    Approve
                  </button>
                  <button onClick={() => changeShortStatus(r.id, "rejected")}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-white">
                    Reject
                  </button>
                  <button onClick={() => deleteShort(r.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                    title="Delete record">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Checked in now", value: checkedInNow.length, icon: LogIn },
          { label: "Late today", value: lateToday.length, icon: AlertTriangle },
          { label: "Auto checkouts", value: autoToday.length, icon: Clock },
          { label: "Absent today", value: isWeekendDate(todayKey()) ? 0 : liveRoster.filter(u => !getUserTodayRecord(attendance, u.id)?.checkIn).length, icon: Users },
          { label: `${period} hours`, value: formatDurationMs(periodTotalMs), icon: BadgeCheck },
        ].map(k => (
          <Card key={k.label} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">{k.label}</span>
              <span className="p-1.5 rounded-lg" style={{ background: B.darkLight, color: B.dark }}><k.icon size={14} /></span>
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: B.dark }}>{k.value}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <STitle>Live attendance — today</STitle>
          <span className="text-xs text-slate-400">{formatDate(todayKey())}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Employee", "Shift", "Check in", "Check out", "Break", "Short leave", "Hours", "Status", "Notes"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liveRoster.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No employees on file.</td></tr>
              ) : liveRoster.map(u => {
                const r = getUserTodayRecord(attendance, u.id);
                const ds = dayStatusPill(resolveDayStatus(u, r));
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} size={7} />
                        <div>
                          <div className="font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.dept || u.role || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{formatShiftRange(u)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r?.checkIn)}
                      {r?.checkIn && isLateCheckIn(r.checkIn, u) && <Pill tone="amber">Late</Pill>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r?.checkOut)}
                      {r?.autoCheckout && <Pill tone="amber">Auto</Pill>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatDurationMs(calcTotalBreakMs(r))}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {(r?.shortLeaves || []).filter(sl => sl.status === "approved").length
                        ? r.shortLeaves.filter(sl => sl.status === "approved").map(sl => `${formatTime(sl.start)}–${formatTime(sl.end)}`).join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, u)}</td>
                    <td className="px-4 py-3"><Pill tone={ds.tone}>{ds.label}</Pill></td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {r?.breakStart && !r?.breakEnd ? "On break" : r?.autoCheckout ? "Auto checkout" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <STitle right={<span className="text-xs text-slate-400">Total: {formatDurationMs(periodTotalMs)}</span>}>Attendance reports</STitle>
          <div className="flex gap-1 p-1 rounded-lg bg-slate-100">
            {["daily", "weekly", "monthly"].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className="px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors"
                style={period === p ? { background: B.dark, color: B.white } : { color: B.dark }}>{p}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Date", "Employee", "Shift", "Check in", "Check out", "Break", "Hours", "Status", "Auto"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No records for this {period} period.</td></tr>
              ) : reportRows.map(r => {
                const ds = dayStatusPill(resolveDayStatus(r.user, r));
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-700">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{r.shift}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r.checkIn)}
                      {r.checkIn && isLateCheckIn(r.checkIn, r.user) && <Pill tone="amber">Late</Pill>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatTime(r.checkOut)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatDurationMs(calcTotalBreakMs(r))}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, r.user)}</td>
                    <td className="px-4 py-3"><Pill tone={ds.tone}>{ds.label}</Pill></td>
                    <td className="px-4 py-3">{r.autoCheckout ? <Pill tone="amber">Yes</Pill> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ─── ATTENDANCE (end) ─── */
