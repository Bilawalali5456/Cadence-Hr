import React, { useState, useEffect } from "react";
import { Users, Clock, AlertTriangle, BadgeCheck, Trash2, LogIn, Pencil } from "lucide-react";
import { B } from "../brand.jsx";
import { isHrAdminRole, isExecutiveRole, employeeRoster, isHrAdminRequest, canChangeShortLeaveRequestStatus, canDeleteShortLeaveRecord, attendanceVisibleUserIds, activeAttendanceRoster, getUserShift, formatShiftRange, formatDurationMs, formatBreakUsage, breakSessionCount, isOnBreak, isBreakExceeded, calcNetWorkingMs, isLateCheckIn, resolveDayStatus, dayStatusPill, applyApprovedShortLeave, removeShortLeaveFromAttendance, displayWorkingHours, todayKey, formatTime, formatDate, getUserTodayRecord, filterAttendanceByPeriod, formatCheckOutDisplay, computeMonthlyAttendanceSummary, monthKey, monthLabel, attendanceMonthOptions, employeeAttendanceMonthOptions, clampMonthKey, ATTENDANCE_MONTH_FLOOR, isWfhAttendance, buildApprovalDecision, canCorrectAttendance, flattenCorrectionAuditLog, formatCorrectionChangeSummary, effectiveCheckOut } from "../utils.js";
import { Pill, Avatar, Card, STitle } from "../components/ui.jsx";
import { ApprovalReviewMeta, ApprovalStatusBadge, ApprovalActionButtons } from "../components/ApprovalControls.jsx";
import { AttendanceCorrectionModal } from "../components/AttendanceCorrectionModal.jsx";
import { HrAdminOversightPanel } from "./Dashboard.jsx";

function CheckOutCell({ record, user, dateKey, now = new Date() }) {
  const mode = formatCheckOutDisplay(record, user, dateKey, now);
  if (mode === "—") return "—";
  if (mode === "Missing") return <span className="text-amber-600 font-medium">Missing</span>;
  if (mode === "InProgress") {
    const scan = record?.checkOut || record?.lastScan;
    return (
      <>
        {formatTime(scan)}
        <span className="text-[10px] text-emerald-600 ml-1">in progress</span>
      </>
    );
  }
  return (
    <>
      {formatTime(record?.checkOut)}
      {record?.checkOutMethod ? <span className="text-[10px] text-slate-400 ml-1">{record.checkOutMethod}</span> : null}
      {record?.autoCheckout && <Pill tone="amber">Auto checkout</Pill>}
    </>
  );
}

export function AttendancePage({ currentUser, users, attendance, setAttendance, shortLeaveRequests, setShortLeaveRequests, leaveRequests, setLeaveRequests, setUsers, roles, holidays = [], notifications, setNotifications }) {
  const me = users.find(u => u.id === currentUser.id) || currentUser;
  if (currentUser.role === "Manager") {
    return (
      <div className="max-w-lg mx-auto p-6 text-center text-sm text-slate-600">
        Attendance reports are only available to HR Admin and Executive roles.
      </div>
    );
  }

  const isAdminView =
    isHrAdminRole(currentUser.role) ||
    isExecutiveRole(currentUser.role);

  // HR Admin / Executive: org-wide attendance reports (check-in lives on Home)
  if (isAdminView) {
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
        holidays={holidays}
        setNotifications={setNotifications}
      />
    );
  }

  return <EmployeeAttendanceHistory user={me} attendance={attendance} leaveRequests={leaveRequests} holidays={holidays} />;
}

export function EmployeeAttendanceHistory({ user, attendance, leaveRequests = [], holidays = [] }) {
  const monthOptions = employeeAttendanceMonthOptions(user);
  const [month, setMonth] = useState(() => clampMonthKey(monthKey(), monthOptions));
  const history = (attendance || [])
    .filter(r => r && r.userId === user.id && r.date && r.date >= ATTENDANCE_MONTH_FLOOR)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);
  const monthSummary = computeMonthlyAttendanceSummary(user, attendance, leaveRequests, month, holidays);

  return (
    <div className="space-y-5 max-w-3xl">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <STitle>Monthly summary</STitle>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
          >
            {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            ["Present days", monthSummary.totalPresentDays],
            ["Absent days", monthSummary.totalAbsentDays],
            ["Late days", monthSummary.totalLateDays],
            ["Approved leave", monthSummary.approvedLeaveDays],
            ["Working hours", formatDurationMs(monthSummary.totalWorkingMs)],
            ["Required hours", formatDurationMs(monthSummary.totalRequiredMs)],
            ["Payable days", monthSummary.payableDays],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-400">{label}</div>
              <div className="text-lg font-semibold text-slate-800 mt-1">{value}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200"><STitle>My attendance history</STitle></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Date", "Check in", "Check out", "Working Hours", "Status"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No attendance records yet.</td></tr>
              ) : history.map(r => {
                const dateKey = r?.date ?? todayKey();
                const ds = dayStatusPill(resolveDayStatus(user, r, dateKey, holidays));
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-700">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r.checkIn)}
                      {r.checkInMethod ? <span className="text-[10px] text-slate-400 ml-1">{r.checkInMethod}</span> : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      <CheckOutCell record={r} user={user} dateKey={dateKey} />
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, user)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 flex-wrap">
                        <Pill tone={ds.tone}>{ds.label}</Pill>
                        {isWfhAttendance(r, user.id, r.date, leaveRequests, holidays, user) && <Pill tone="blue">WFH</Pill>}
                      </span>
                    </td>
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

/** @deprecated Use EmployeeAttendanceHistory — kept as alias for any external imports */
export function EmployeeAttendanceFull(props) {
  return <EmployeeAttendanceHistory {...props} />;
}

export function AdminAttendanceView({ users, attendance, setAttendance, shortLeaveRequests, setShortLeaveRequests, leaveRequests, setLeaveRequests, setUsers, currentUser, roles, holidays = [], setNotifications }) {
  const [period, setPeriod] = useState("daily");
  const [month, setMonth] = useState(() => clampMonthKey(monthKey(), attendanceMonthOptions(users)));
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const canManageCorrections = isHrAdminRole(currentUser.role) || isExecutiveRole(currentUser.role);
  const correctionAudit = isExecutiveRole(currentUser.role)
    ? flattenCorrectionAuditLog(attendance, users)
    : [];
  const staffRoster = employeeRoster(users || []);
  const allStaff = staffRoster.filter(u => u && u.status === "active");
  const liveRoster = (isExecutiveRole(currentUser.role)
    ? activeAttendanceRoster(users || [], currentUser.role)
    : allStaff
  ).filter(u => u && u.id);
  const visibleIds = attendanceVisibleUserIds(users || [], currentUser.role);
  const today = todayKey();
  const pendingShort = (shortLeaveRequests || []).filter(r =>
    r && canChangeShortLeaveRequestStatus(currentUser, r, users, roles)
    && !(isExecutiveRole(currentUser.role) && isHrAdminRequest(r, users))
  );

  function changeShortStatus(id, newStatus) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canChangeShortLeaveRequestStatus(currentUser, req, users, roles)) return;
    const prev = req.status;
    if (prev === newStatus) return;
    if (newStatus === "approved" && prev !== "approved") {
      setAttendance(a => applyApprovedShortLeave(a, users, req));
    }
    if (prev === "approved" && newStatus !== "approved") {
      setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    }
    setShortLeaveRequests(rs => rs.map(r => r.id === id ? { ...r, ...buildApprovalDecision(currentUser, newStatus) } : r));
  }

  function deleteShort(id) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(currentUser, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    if (req.status === "approved") setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    setShortLeaveRequests(rs => rs.filter(r => r.id !== id));
  }

  const checkedInNow = liveRoster.filter(u => { const r = getUserTodayRecord(attendance, u.id, u); return r?.checkIn && !effectiveCheckOut(r, u, r?.date || todayKey()); });
  const lateToday = liveRoster.filter(u => { const r = getUserTodayRecord(attendance, u.id, u); return r?.checkIn && isLateCheckIn(r.checkIn, u, holidays); });
  const autoToday = (attendance || []).filter(r => r && r.date === todayKey() && r.autoCheckout && visibleIds.has(r.userId));
  const absentTodayCount = liveRoster.filter(u => {
    const r = getUserTodayRecord(attendance, u.id, u);
    return resolveDayStatus(u, r, r?.date || today, holidays) === "Absent";
  }).length;

  const reportRows = filterAttendanceByPeriod(attendance || [], period)
    .filter(r => r && r.userId && visibleIds.has(r.userId))
    .map(r => {
      const user = (users || []).find(u => u && u.id === r.userId);
      return user ? { ...r, name: user.name, dept: user.dept || user.role || "—", shift: formatShiftRange(user, r.date), user } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (a.name || "").localeCompare(b.name || ""));

  const periodTotalMs = reportRows.reduce((sum, r) => sum + (r.workingMs || calcNetWorkingMs(r)), 0);
  const monthOptions = attendanceMonthOptions(users);
  const monthlyRows = liveRoster
    .map(u => ({
      user: u,
      summary: computeMonthlyAttendanceSummary(u, attendance, leaveRequests, month, holidays),
    }))
    .sort((a, b) => (a.user.name || "").localeCompare(b.user.name || ""));

  return (
    <div className="space-y-5">
      <AttendanceCorrectionModal
        open={!!correctionTarget}
        onClose={() => setCorrectionTarget(null)}
        target={correctionTarget}
        currentUser={currentUser}
        attendance={attendance}
        setAttendance={setAttendance}
        holidays={holidays}
      />
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
          setNotifications={setNotifications}
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
                  <ApprovalReviewMeta req={r} />
                </div>
                <ApprovalStatusBadge req={r} />
                <ApprovalActionButtons
                  req={r}
                  canChange={canChangeShortLeaveRequestStatus(currentUser, r, users, roles)}
                  onApprove={() => changeShortStatus(r.id, "approved")}
                  onReject={() => changeShortStatus(r.id, "rejected")}
                />
                <button onClick={() => deleteShort(r.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                  title="Delete record">
                  <Trash2 size={14} />
                </button>
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
          { label: "Absent today", value: absentTodayCount, icon: Users },
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
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <STitle>Monthly attendance summary</STitle>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
          >
            {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1180px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Employee", "Present", "Absent", "Late", "Approved leave", "Working hours", "Break time", "Required hours", "Payable days"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlyRows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No employees on file.</td></tr>
              ) : monthlyRows.map(({ user, summary }) => (
                <tr key={user.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-800">{user.name}</td>
                  <td className="px-4 py-3">{summary.totalPresentDays}</td>
                  <td className="px-4 py-3">{summary.totalAbsentDays}</td>
                  <td className="px-4 py-3">{summary.totalLateDays}</td>
                  <td className="px-4 py-3">{summary.approvedLeaveDays}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDurationMs(summary.totalWorkingMs)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDurationMs(summary.totalBreakMs)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDurationMs(summary.totalRequiredMs)}</td>
                  <td className="px-4 py-3">{summary.payableDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <STitle>Daily attendance — today</STitle>
          <span className="text-xs text-slate-400">
            First scan = Check-in · Last scan = Check-out · {formatDate(todayKey())}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Employee", "Date", "Check-in", "Break", "Check-out", "Working Hours", "Status", ...(canManageCorrections ? [""] : [])].map(h => (
                  <th key={h || "actions"} className="px-4 py-2.5 font-medium">{h || "Actions"}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liveRoster.length === 0 ? (
                <tr><td colSpan={canManageCorrections ? 8 : 7} className="px-4 py-8 text-center text-slate-400">No employees on file.</td></tr>
              ) : liveRoster.map(u => {
                const r = getUserTodayRecord(attendance, u.id, u, now);
                const rowDate = r?.date || today;
                const shiftCfg = getUserShift(u, rowDate);
                const ds = dayStatusPill(resolveDayStatus(u, r, rowDate, holidays, now));
                const breakOver = isBreakExceeded(r, shiftCfg.breakMinutes);
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} size={7} />
                        <div>
                          <div className="font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400">{formatShiftRange(u, rowDate)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(rowDate)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r?.checkIn)}
                      {r?.checkInMethod ? <span className="text-[10px] text-slate-400 ml-1">{r.checkInMethod}</span> : null}
                      {r?.checkIn && isLateCheckIn(r.checkIn, u, holidays) && <Pill tone="amber">Late</Pill>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {!r?.checkIn ? "—" : (
                        <div className="text-xs">
                          <div className={`tabular-nums font-medium ${breakOver ? "text-red-600" : ""}`}>
                            {formatBreakUsage(r, shiftCfg.breakMinutes)}
                          </div>
                          <div className="text-slate-400">{breakSessionCount(r)} break{breakSessionCount(r) === 1 ? "" : "s"}</div>
                          {breakOver && <Pill tone="red">Over</Pill>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      <CheckOutCell record={r} user={u} dateKey={rowDate} now={now} />
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, u, now)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 flex-wrap">
                        {isOnBreak(r) && <Pill tone="amber">On Break</Pill>}
                        <Pill tone={ds.tone}>{ds.label}</Pill>
                        {r?.manuallyCorrected && <Pill tone="purple">Corrected</Pill>}
                        {isWfhAttendance(r, u.id, rowDate, leaveRequests, holidays, u) && <Pill tone="blue">WFH</Pill>}
                      </span>
                    </td>
                    {canManageCorrections && (
                      <td className="px-4 py-3">
                        {canCorrectAttendance(currentUser, r) && (
                          <button
                            type="button"
                            onClick={() => setCorrectionTarget({ user: u, record: r, dateKey: rowDate })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                            title="Edit attendance"
                          >
                            <Pencil size={12} />Edit
                          </button>
                        )}
                      </td>
                    )}
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
          <table className="w-full text-sm min-w-[980px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Employee", "Date", "Check-in", "Break", "Check-out", "Working Hours", "Status", ...(canManageCorrections ? [""] : [])].map(h => (
                  <th key={h || "actions"} className="px-4 py-2.5 font-medium">{h || "Actions"}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 ? (
                <tr><td colSpan={canManageCorrections ? 8 : 7} className="px-4 py-8 text-center text-slate-400">No records for this {period} period.</td></tr>
              ) : reportRows.map(r => {
                const dateKey = r?.date ?? todayKey();
                const shiftCfg = getUserShift(r.user, dateKey);
                const ds = dayStatusPill(resolveDayStatus(r.user, r, dateKey, holidays, dateKey === today ? now : undefined));
                const breakOver = isBreakExceeded(r, shiftCfg.breakMinutes);
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r.checkIn)}
                      {r.checkInMethod ? <span className="text-[10px] text-slate-400 ml-1">{r.checkInMethod}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {!r.checkIn ? "—" : (
                        <div className="text-xs">
                          <div className={`tabular-nums font-medium ${breakOver ? "text-red-600" : ""}`}>
                            {formatBreakUsage(r, shiftCfg.breakMinutes)}
                          </div>
                          <div className="text-slate-400">{breakSessionCount(r)} break{breakSessionCount(r) === 1 ? "" : "s"}</div>
                          {breakOver && <Pill tone="red">Over</Pill>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      <CheckOutCell record={r} user={r.user} dateKey={dateKey} />
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, r.user)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 flex-wrap">
                        {isOnBreak(r) && <Pill tone="amber">On Break</Pill>}
                        <Pill tone={ds.tone}>{ds.label}</Pill>
                        {r.manuallyCorrected && <Pill tone="purple">Corrected</Pill>}
                        {isWfhAttendance(r, r.userId, r.date, leaveRequests, holidays, r.user) && <Pill tone="blue">WFH</Pill>}
                      </span>
                    </td>
                    {canManageCorrections && (
                      <td className="px-4 py-3">
                        {canCorrectAttendance(currentUser, r) && (
                          <button
                            type="button"
                            onClick={() => setCorrectionTarget({ user: r.user, record: r, dateKey: r.date })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                            title="Edit attendance"
                          >
                            <Pencil size={12} />Edit
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {correctionAudit.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <STitle>Attendance correction audit log</STitle>
            <p className="text-xs text-slate-500 mt-1">All manual corrections across the organization, including those made by Admin.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[960px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                  {["When", "Employee", "Date", "Corrected by", "Reason", "Changes"].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {correctionAudit.slice(0, 50).map(entry => (
                  <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(entry.at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{entry.employeeName}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {entry.by}
                      <span className="text-xs text-slate-400 ml-1">({entry.byRole === "Executive" ? "Executive" : "Admin"})</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px]">{entry.reason}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatCorrectionChangeSummary(entry.changes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── ATTENDANCE (end) ─── */
