import React, { useState, useEffect } from "react";
import { Users, AlertTriangle, BadgeCheck, Trash2, LogIn, Pencil, X } from "lucide-react";
import { B } from "../brand.jsx";
import { isHrOpsRole, isExecutiveRole, employeeRoster, isHrAdminRequest, canChangeShortLeaveRequestStatus, canDeleteShortLeaveRecord, activeAttendanceRoster, getUserShift, formatShiftRange, formatDurationMs, breakSessionCount, isOnBreak, isBreakExceeded, calcNetWorkingMs, calcLiveWorkingMs, isLateCheckIn, resolveDayStatus, dayStatusPill, displayWorkingHours, displayBreakTime, todayKey, formatTime, formatDate, getUserTodayRecord, formatCheckOutDisplay, computeMonthlyAttendanceSummary, monthKey, monthLabel, attendanceMonthOptions, employeeAttendanceMonthOptions, clampMonthKey, ATTENDANCE_MONTH_FLOOR, isWfhAttendance, buildApprovalDecision, flattenCorrectionAuditLog, formatCorrectionChangeSummary, effectiveCheckOut, monthDateRange, eachDateInRange, scheduledWorkDatesForUser } from "../utils.js";
import { Pill, Avatar, Card, STitle } from "../components/ui.jsx";
import { ApprovalReviewMeta, ApprovalStatusBadge, ApprovalActionButtons } from "../components/ApprovalControls.jsx";
import { AttendanceCorrectionModal } from "../components/AttendanceCorrectionModal.jsx";
import { HrAdminOversightPanel } from "./Dashboard.jsx";
import { apiUpdateShortLeaveRequest, apiDeleteShortLeaveRequest, apiFetchAttendance, apiUpdateAttendance, apiFetchShortLeave } from "../api.js";

/** Load attendance for the UI selection; re-poll so App refresh never replaces with "today/month". */
function useScopedAttendanceFetch(viewMode, month, selectedDate, setAttendance) {
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const params = viewMode === "monthly" ? { month } : { date: selectedDate };
        const list = await apiFetchAttendance(params);
        if (!cancelled) setAttendance?.(list);
      } catch (e) {
        console.error("Failed to fetch attendance:", e?.message || e);
      }
    }
    load();
    const id = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [viewMode, month, selectedDate, setAttendance]);
}

function CheckOutCell({ record, user, dateKey, now = new Date() }) {
  const mode = formatCheckOutDisplay(record, user, dateKey, now);
  if (mode === "—") return "—";
  if (mode === "Missing") return <span className="text-orange-600 font-medium">Missing</span>;
  return (
    <>
      {formatTime(record?.checkOut)}
      {record?.checkOutMethod ? <span className="text-[10px] text-slate-400 ml-1">{record.checkOutMethod}</span> : null}
    </>
  );
}

function getRecordForDate(attendance, userId, user, dateKey, now = new Date()) {
  if (dateKey === todayKey(now) && user) {
    return getUserTodayRecord(attendance, userId, user, now);
  }
  return (attendance || []).find(r => r && r.userId === userId && r.date === dateKey) || null;
}

function isApprovedLeaveDay(userId, dateKey, leaveRequests, user, holidays) {
  for (const lr of leaveRequests || []) {
    if (!lr || lr.userId !== userId || lr.status !== "approved" || lr.type === "WFH") continue;
    if (dateKey < lr.from || dateKey > lr.to) continue;
    if (user && !scheduledWorkDatesForUser(user, dateKey, dateKey, holidays).includes(dateKey)) continue;
    return true;
  }
  return false;
}

/** Status badge for admin drill-down — Late shows on check-in only; column uses Present. */
function drillDownStatusPill(status, record) {
  let label = status;
  // Only remap legacy day-status "Late" → Present. Do not override Short Hours / Early Leave when late=true.
  if (status === "Late") {
    label = "Present";
  }
  if (label === "On Time") label = "Present";
  const toneMap = {
    Present: "green",
    Working: "blue",
    Absent: "red",
    "Early Leave": "orange",
    "On Leave": "blue",
    "Missing Checkout": "yellow",
    "Short Hours": "orange",
    Off: "slate",
    "Public Holiday": "blue",
  };
  if (record?.autoCheckout || status === "Auto Checkout") {
    return { tone: "yellow", label: "Missing Checkout" };
  }
  return { tone: toneMap[label] || "slate", label: label || "—" };
}

function resolveDrillDownDayStatus(user, record, dateKey, leaveRequests, holidays, now) {
  if (isApprovedLeaveDay(user?.id, dateKey, leaveRequests, user, holidays) && !record?.checkIn) {
    return "On Leave";
  }
  return resolveDayStatus(user, record, dateKey, holidays, now);
}

function adminDailyStatus(user, record, dateKey, holidays, now) {
  // Day status stays Present when late=true; Late is only the check-in badge.
  return resolveDayStatus(user, record, dateKey, holidays, now);
}

function employeeDetailDateRange(user, month) {
  const { start, end } = monthDateRange(month);
  const today = todayKey();
  let rangeStart = start;
  let rangeEnd = end;
  if (user?.hired) {
    if (user.hired > end) return { rangeStart: null, rangeEnd: null };
    if (user.hired > rangeStart) rangeStart = user.hired;
  }
  if (rangeEnd > today) rangeEnd = today;
  if (rangeStart > rangeEnd) return { rangeStart: null, rangeEnd: null };
  return { rangeStart, rangeEnd };
}

function AdminEmployeeAttendanceDetail({
  user,
  month,
  onMonthChange,
  monthOptions,
  onBack,
  leaveRequests,
  holidays,
  now,
}) {
  const [employeeAttendance, setEmployeeAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetchAttendance({ month, userId: user.id })
      .then(list => {
        if (!cancelled) setEmployeeAttendance(Array.isArray(list) ? list : []);
      })
      .catch(e => {
        console.error("Failed to fetch employee attendance:", e?.message || e);
        if (!cancelled) setEmployeeAttendance([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [month, user.id]);

  const summary = computeMonthlyAttendanceSummary(user, employeeAttendance, leaveRequests, month, holidays);
  const { rangeStart, rangeEnd } = employeeDetailDateRange(user, month);
  const today = todayKey(now);
  const recordByDate = Object.fromEntries(
    (employeeAttendance || [])
      .filter(r => r && r.userId === user.id && r.date)
      .map(r => [r.date, r])
  );

  const dailyRows = rangeStart && rangeEnd
    ? eachDateInRange(rangeStart, rangeEnd)
        .map(dateKey => {
          const record = recordByDate[dateKey] || null;
          const isToday = dateKey === today;
          const rowNow = isToday ? now : new Date(`${dateKey}T23:59:59`);
          const status = resolveDrillDownDayStatus(user, record, dateKey, leaveRequests, holidays, rowNow);
          return { dateKey, record, status, rowNow, isToday };
        })
        .reverse()
    : [];

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back
      </button>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{user.name}</h2>
            <p className="text-sm text-slate-500 mt-1">{formatShiftRange(user, today)}</p>
          </div>
          <select
            value={month}
            onChange={e => onMonthChange(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
          >
            {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 text-sm">
          {[
            ["Present", summary.totalPresentDays],
            ["Absent", summary.totalAbsentDays],
            ["Late", summary.totalLateDays],
            ["Working / Required", `${formatDurationMs(summary.totalWorkingMs)} / ${formatDurationMs(summary.totalRequiredMs)}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-400">{label}</div>
              <div className="text-lg font-semibold text-slate-800 mt-1 tabular-nums">{value}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <STitle>Daily attendance — {monthLabel(month)}</STitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Date", "Check-in", "Check-out", "Working hours", "Status"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : dailyRows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No days in this period.</td></tr>
              ) : dailyRows.map(({ dateKey, record, status, rowNow }) => {
                const ds = drillDownStatusPill(status, record);
                const showLate = record?.checkIn && (record.late || isLateCheckIn(record.checkIn, user, holidays));
                return (
                  <tr key={dateKey} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-700">{formatDate(dateKey)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {formatTime(record?.checkIn)}
                        {showLate && <Pill tone="red">Late</Pill>}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      <CheckOutCell record={record} user={user} dateKey={dateKey} now={rowNow} />
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">
                      {displayWorkingHours(record, user, rowNow)}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={ds.tone}>{ds.label}</Pill>
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

export function AttendancePage({ currentUser, users, attendance, setAttendance, shortLeaveRequests, setShortLeaveRequests, leaveRequests, setLeaveRequests, setUsers, roles, holidays = [], notifications, setNotifications }) {
  const me = users.find(u => u.id === currentUser.id) || currentUser;

  const isAdminView =
    isHrOpsRole(currentUser.role) ||
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

  return <EmployeeAttendanceHistory user={me} attendance={attendance} setAttendance={setAttendance} leaveRequests={leaveRequests} holidays={holidays} />;
}

export function EmployeeAttendanceHistory({ user, attendance, setAttendance, leaveRequests = [], holidays = [] }) {
  const monthOptions = employeeAttendanceMonthOptions(user);
  const [viewMode, setViewMode] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(() => todayKey());
  const [month, setMonth] = useState(() => clampMonthKey(monthKey(), monthOptions));
  const [now, setNow] = useState(() => new Date());

  useScopedAttendanceFetch(viewMode, month, selectedDate, setAttendance);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const isToday = selectedDate === todayKey(now);
  const dailyRecord = viewMode === "daily"
    ? getRecordForDate(attendance, user.id, user, selectedDate, now)
    : null;
  const history = (attendance || [])
    .filter(r => r && r.userId === user.id && r.date && r.date >= ATTENDANCE_MONTH_FLOOR)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);
  const monthSummary = computeMonthlyAttendanceSummary(user, attendance, leaveRequests, month, holidays);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex gap-1 p-1 rounded-lg bg-slate-100 w-fit">
        {[
          { id: "daily", label: "Daily View" },
          { id: "monthly", label: "Monthly Summary" },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setViewMode(tab.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
            style={viewMode === tab.id ? { background: B.dark, color: B.white } : { color: B.dark }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {viewMode === "monthly" ? (
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
            ["Break time", formatDurationMs(monthSummary.totalBreakMs)],
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
      ) : (
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <STitle>Daily attendance</STitle>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value || todayKey())}
            className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Date", "Check in", "Break", "Check out", "Working hours", "Status"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const r = dailyRecord;
                const dateKey = selectedDate;
                const liveNow = isToday ? now : new Date(`${dateKey}T23:59:59`);
                const ds = dayStatusPill(resolveDayStatus(user, r, dateKey, holidays, isToday ? now : liveNow), r);
                return (
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-3 text-slate-700">{formatDate(dateKey)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r?.checkIn)}
                      {r?.checkInMethod ? <span className="text-[10px] text-slate-400 ml-1">{r.checkInMethod}</span> : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{displayBreakTime(r, liveNow)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      <CheckOutCell record={r} user={user} dateKey={dateKey} now={liveNow} />
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, user, liveNow)}</td>
                    <td className="px-4 py-3">
                      <Pill tone={ds.tone}>{ds.label}</Pill>
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      {viewMode === "monthly" && (
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200"><STitle>My attendance history</STitle></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                {["Date", "Check in", "Break", "Check out", "Working hours", "Status"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No attendance records yet.</td></tr>
              ) : history.map(r => {
                const dateKey = r?.date ?? todayKey();
                const ds = dayStatusPill(resolveDayStatus(user, r, dateKey, holidays), r);
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-700">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(r.checkIn)}
                      {r.checkInMethod ? <span className="text-[10px] text-slate-400 ml-1">{r.checkInMethod}</span> : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{displayBreakTime(r)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      <CheckOutCell record={r} user={user} dateKey={dateKey} />
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, user)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 flex-wrap">
                        <Pill tone={ds.tone}>{ds.label}</Pill>
                        {(r?.source === "wfh" || isWfhAttendance(r, user.id, r.date, leaveRequests, holidays, user)) && <Pill tone="blue">WFH</Pill>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      )}
    </div>
  );
}

/** @deprecated Use EmployeeAttendanceHistory — kept as alias for any external imports */
export function EmployeeAttendanceFull(props) {
  return <EmployeeAttendanceHistory {...props} />;
}

export function AdminAttendanceView({ users, attendance, setAttendance, shortLeaveRequests, setShortLeaveRequests, leaveRequests, setLeaveRequests, setUsers, currentUser, roles, holidays = [], setNotifications }) {
  const [viewMode, setViewMode] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(() => todayKey());
  const [month, setMonth] = useState(() => clampMonthKey(monthKey(), attendanceMonthOptions(users)));
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [detailUser, setDetailUser] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [monthlySearch, setMonthlySearch] = useState("");
  useScopedAttendanceFetch(viewMode, month, selectedDate, setAttendance);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const canManageCorrections = isHrOpsRole(currentUser.role) || isExecutiveRole(currentUser.role);
  const correctionAudit = isExecutiveRole(currentUser.role)
    ? flattenCorrectionAuditLog(attendance, users)
    : [];
  const staffRoster = employeeRoster(users || []);
  const allStaff = staffRoster.filter(u => u && u.status === "active");
  const liveRoster = (isExecutiveRole(currentUser.role)
    ? activeAttendanceRoster(users || [], currentUser.role)
    : allStaff
  ).filter(u => u && u.id);
  const today = todayKey();
  const isSelectedToday = selectedDate === today;
  const pendingShort = (shortLeaveRequests || []).filter(r =>
    r && r.status === "pending"
    && canChangeShortLeaveRequestStatus(currentUser, r, users, roles)
    && !(isExecutiveRole(currentUser.role) && isHrAdminRequest(r, users))
  );

  async function refreshShortLeaveAndAttendance() {
    const params = viewMode === "monthly" ? { month } : { date: selectedDate };
    const [shortLeave, att] = await Promise.all([
      apiFetchShortLeave(),
      apiFetchAttendance(params),
    ]);
    setShortLeaveRequests(shortLeave);
    setAttendance(att);
  }

  async function changeShortStatus(id, newStatus) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canChangeShortLeaveRequestStatus(currentUser, req, users, roles)) return;
    const prev = req.status;
    if (prev === newStatus) return;
    const patch = buildApprovalDecision(currentUser, newStatus);
    const nextReq = { ...req, ...patch, status: newStatus };
    try {
      await apiUpdateShortLeaveRequest(id, nextReq);
      await refreshShortLeaveAndAttendance();
    } catch (e) {
      console.error("Short leave approval persist failed:", e.message || e);
    }
  }

  async function deleteShort(id) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(currentUser, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    try {
      await apiDeleteShortLeaveRequest(id);
      await refreshShortLeaveAndAttendance();
    } catch (e) {
      console.error("Short leave delete failed:", e.message || e);
    }
  }

  const monthOptions = attendanceMonthOptions(users);
  const monthlyRows = liveRoster
    .map(u => ({
      user: u,
      summary: computeMonthlyAttendanceSummary(u, attendance, leaveRequests, month, holidays),
    }))
    .sort((a, b) => (a.user.name || "").localeCompare(b.user.name || ""));

  const normalizedMonthlySearch = monthlySearch.trim().toLowerCase();
  const filteredMonthlyRows = normalizedMonthlySearch
    ? monthlyRows.filter(({ user }) => String(user?.name || "").toLowerCase().includes(normalizedMonthlySearch))
    : monthlyRows;

  const dailyStatusOrder = ["All", "Working", "Present", "WFH", "Late", "Absent", "Early Leave", "Missing Checkout", "On Leave"];
  const dailyRows = liveRoster
    .map(u => {
      const rowDate = selectedDate;
      const record = getRecordForDate(attendance, u.id, u, rowDate, now);
      const liveNow = isSelectedToday ? now : new Date(`${rowDate}T23:59:59`);
      const shiftCfg = getUserShift(u, rowDate);
      const status = adminDailyStatus(u, record, rowDate, holidays, isSelectedToday ? now : liveNow);
      return {
        user: u,
        rowDate,
        record,
        liveNow,
        shiftCfg,
        status,
        ds: dayStatusPill(status, record),
        breakOver: isBreakExceeded(record, shiftCfg.breakMinutes),
      };
    })
    .sort((a, b) => (a.user.name || "").localeCompare(b.user.name || ""));

  const isWfhRow = (row) => {
    const r = row?.record;
    return (
      r?.source === "wfh" ||
      r?.checkInMethod === "wfh" ||
      r?.check_in_method === "wfh" ||
      (r?.checkIn && r?.source === "wfh") ||
      // Also match the same condition used for the WFH badge in the table.
      isWfhAttendance(r, row.user.id, row.rowDate, leaveRequests, holidays, row.user)
    );
  };
  const wfhCount = dailyRows.reduce((sum, row) => sum + (isWfhRow(row) ? 1 : 0), 0);
  const lateCount = dailyRows.reduce((sum, row) => sum + (row.record?.late === true ? 1 : 0), 0);

  const statusCounts = dailyRows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  // Late is a check-in flag, not a day status — count via record.late.
  statusCounts.Late = lateCount;
  const chipOptions = dailyStatusOrder.filter(status => {
    if (status === "All") return true;
    if (status === "WFH") return wfhCount > 0;
    if (status === "Late") return lateCount > 0;
    return (statusCounts[status] || 0) > 0;
  });
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredDailyRows = dailyRows.filter(row => {
    if (statusFilter !== "All") {
      if (statusFilter === "WFH") {
        if (!isWfhRow(row)) return false;
      } else if (statusFilter === "Late") {
        if (row.record?.late !== true) return false;
      } else if (row.status !== statusFilter) {
        return false;
      }
    }
    if (normalizedSearch && !String(row.user.name || "").toLowerCase().includes(normalizedSearch)) return false;
    return true;
  });

  useEffect(() => {
    if (!chipOptions.includes(statusFilter)) {
      setStatusFilter("All");
    }
  }, [chipOptions, statusFilter]);

  const checkedInCount = dailyRows.reduce((sum, row) => sum + (row.record?.checkIn != null ? 1 : 0), 0);
  const absentCount = dailyRows.reduce((sum, row) => sum + (row.status === "Absent" ? 1 : 0), 0);
  const totalHoursMs = dailyRows.reduce((sum, row) => {
    const ms = row.record?.workingMs;
    return sum + (typeof ms === "number" && Number.isFinite(ms) ? ms : 0);
  }, 0);

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
        leaveRequests={leaveRequests}
        persistAttendance={(updatedRecord) => apiUpdateAttendance(updatedRecord.id, updatedRecord)}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Checked in", value: checkedInCount, icon: LogIn },
          { label: "Late", value: lateCount, icon: AlertTriangle },
          { label: "Absent", value: absentCount, icon: Users },
          { label: "Total hours", value: formatDurationMs(totalHoursMs), icon: BadgeCheck },
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

      <div className="flex gap-1 p-1 rounded-lg bg-slate-100 w-fit">
        {[
          { id: "daily", label: "Daily View" },
          { id: "monthly", label: "Monthly Summary" },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setViewMode(tab.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
            style={viewMode === tab.id ? { background: B.dark, color: B.white } : { color: B.dark }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {viewMode === "monthly" ? (
      detailUser ? (
        <AdminEmployeeAttendanceDetail
          user={detailUser}
          month={month}
          onMonthChange={setMonth}
          monthOptions={monthOptions}
          onBack={() => setDetailUser(null)}
          leaveRequests={leaveRequests}
          holidays={holidays}
          now={now}
        />
      ) : (
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
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/40">
          <div className="relative">
            <input
              type="text"
              value={monthlySearch}
              onChange={e => setMonthlySearch(e.target.value)}
              placeholder="Search employee name..."
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 pr-10"
            />
            {monthlySearch && (
              <button
                type="button"
                onClick={() => setMonthlySearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Clear employee search"
              >
                <X size={14} />
              </button>
            )}
          </div>
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
              ) : filteredMonthlyRows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No employees found.</td></tr>
              ) : filteredMonthlyRows.map(({ user, summary }) => (
                <tr
                  key={user.id}
                  className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50/80"
                  onClick={() => setDetailUser(user)}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setDetailUser(user); }}
                      className="text-left font-medium text-slate-800 hover:underline underline-offset-2"
                      style={{ color: B.dark }}
                    >
                      {user.name}
                    </button>
                  </td>
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
      )
      ) : (
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <STitle>Daily attendance</STitle>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value || todayKey())}
              className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
            />
            <span className="text-xs text-slate-400">
              First scan = Check-in · Last scan = Check-out after shift end
            </span>
          </div>
        </div>
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/40">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name..."
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 pr-10"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {chipOptions.map(status => {
              const active = statusFilter === status;
              const count = status === "All"
                ? dailyRows.length
                : status === "WFH"
                  ? wfhCount
                  : status === "Late"
                    ? lateCount
                    : (statusCounts[status] || 0);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className="rounded-full transition-colors"
                  style={!active ? { border: `1px solid ${B.darkBorder}` } : undefined}
                >
                  <Pill tone={active ? "dark" : "slate"}>{status} {count}</Pill>
                </button>
              );
            })}
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
              {liveRoster.length === 0 ? (
                <tr><td colSpan={canManageCorrections ? 8 : 7} className="px-4 py-8 text-center text-slate-400">No employees on file.</td></tr>
              ) : filteredDailyRows.length === 0 ? (
                <tr><td colSpan={canManageCorrections ? 8 : 7} className="px-4 py-8 text-center text-slate-400">No employees found.</td></tr>
              ) : filteredDailyRows.map(({ user: u, rowDate, record: r, liveNow, breakOver, ds }) => {
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
                      {r?.checkIn && isLateCheckIn(r.checkIn, u, holidays) && <Pill tone="orange">Late</Pill>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {!r?.checkIn ? "—" : (
                        <div className="text-xs">
                          <div className={`tabular-nums font-medium ${breakOver ? "text-red-600" : ""}`}>
                            {displayBreakTime(r, liveNow)}
                          </div>
                          {breakSessionCount(r) > 0 && (
                            <div className="text-slate-400">{breakSessionCount(r)} break{breakSessionCount(r) === 1 ? "" : "s"}</div>
                          )}
                          {breakOver && <Pill tone="red">Over</Pill>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      <CheckOutCell record={r} user={u} dateKey={rowDate} now={liveNow} />
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{displayWorkingHours(r, u, liveNow)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 flex-wrap">
                        {isOnBreak(r) && <Pill tone="amber">On Break</Pill>}
                        <Pill tone={ds.tone}>{ds.label}</Pill>
                        {r?.manuallyCorrected && <Pill tone="purple">Corrected</Pill>}
                        {(r?.source === "wfh" || isWfhAttendance(r, u.id, rowDate, leaveRequests, holidays, u)) && <Pill tone="blue">WFH</Pill>}
                      </span>
                    </td>
                    {canManageCorrections && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setCorrectionTarget({ user: u, record: r, dateKey: rowDate })}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                          title="Edit attendance"
                        >
                          <Pencil size={12} />Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      )}

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
