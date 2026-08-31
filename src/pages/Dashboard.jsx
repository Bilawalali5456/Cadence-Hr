import React, { useState } from "react";
import { Users, ChevronRight, AlertTriangle, UserPlus, Timer, Trash2, Clock, LogIn, LogOut } from "lucide-react";
import { B } from "../brand.jsx";
import { DEFAULT_ANNUAL_LEAVE, can, isAdminRole, isHrEmployeeRole, isHrOpsRole, isExecutiveRole, employeeRoster, isHrAdminRequest, canChangeShortLeaveRequestStatus, canChangeLeaveRequestStatus, canDeleteShortLeaveRecord, activeAttendanceRoster, formatShiftRange, resolveDayStatus, dayStatusPill, leavePaidDays, leaveUnpaidDays, leaveTypeLabel, formatTime, formatDate, getUserTodayRecord, todayKey, monthKey, lateDaysInMonth, genId, isStaffRole, hasOwnAttendance, isManagerDesignation, buildApprovalDecision, effectiveCheckOut, formatDurationMs, calcNetWorkingMs, calcLiveWorkingMs } from "../utils.js";
import { buildLeaveStatusNotification, buildWarningNotification } from "../notifications.js";
import { apiSendWarningEmail, apiUpdateLeaveRequest, apiUpdateUser, apiUpdateShortLeaveRequest, apiDeleteShortLeaveRequest, apiCreateWarning, apiWfhCheckin, apiWfhCheckout, apiFetchShortLeave, apiFetchLeave, apiFetchAttendance } from "../api.js";
import { Pill, Avatar, Card, STitle, Btn, ErrBox, OkBox, UserDisplayName } from "../components/ui.jsx";
import { ApprovalReviewMeta, ApprovalStatusBadge, ApprovalActionButtons } from "../components/ApprovalControls.jsx";
import { EmployeeShiftPanel } from "../components/EmployeeShiftPanel.jsx";
import { IssueWarningModal, warningTypeLabel } from "../components/IssueWarningModal.jsx";

function upsertAtt(list, record) {
  if (!record?.id) return list || [];
  const arr = list || [];
  const idx = arr.findIndex(r => r?.id === record.id || (r?.userId === record.userId && r?.date === record.date));
  if (idx >= 0) {
    const next = [...arr];
    next[idx] = record;
    return next;
  }
  return [...arr, record];
}

/** WFH portal check-in / check-out for attendance-tracked roles on approved WFH days. */
function WfhPortalActions({ user, attendance, setAttendance, leaveRequests }) {
  const [wfhLoading, setWfhLoading] = useState(false);
  const [wfhMsg, setWfhMsg] = useState("");
  const role = user?.role;
  const canWfhRole = hasOwnAttendance(role);
  const today = todayKey();
  const myToday = getUserTodayRecord(attendance, user.id, user);
  const hasWfhToday = (leaveRequests || []).some(r =>
    r && r.userId === user.id && r.type === "WFH" && r.status === "approved"
    && r.from && r.to && r.from <= today && r.to >= today
  );
  const showWfhCheckin = canWfhRole && hasWfhToday
    && myToday?.source !== "biometric"
    && (!myToday || (myToday.source === "wfh" && !myToday.checkIn && !myToday.checkOut));
  const showWfhCheckout = canWfhRole
    && myToday?.source === "wfh"
    && !!myToday.checkIn
    && !myToday.checkOut;

  if (!showWfhCheckin && !showWfhCheckout) return null;

  async function handleWfhCheckin() {
    setWfhMsg("");
    setWfhLoading(true);
    try {
      const record = await apiWfhCheckin();
      setAttendance(prev => upsertAtt(prev, record));
      setWfhMsg("ok:WFH check-in recorded.");
      setTimeout(() => setWfhMsg(""), 4000);
    } catch (e) {
      setWfhMsg(`error:${e.message || "Check-in failed"}`);
    } finally {
      setWfhLoading(false);
    }
  }

  async function handleWfhCheckout() {
    setWfhMsg("");
    setWfhLoading(true);
    try {
      const record = await apiWfhCheckout();
      setAttendance(prev => upsertAtt(prev, record));
      setWfhMsg("ok:WFH check-out recorded.");
      setTimeout(() => setWfhMsg(""), 4000);
    } catch (e) {
      setWfhMsg(`error:${e.message || "Check-out failed"}`);
    } finally {
      setWfhLoading(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div>
          <div className="text-sm font-semibold" style={{ color: B.dark }}>Work from Home</div>
          <div className="text-xs text-slate-500">Approved WFH day — check in/out from the portal</div>
        </div>
        <Pill tone="blue">WFH</Pill>
      </div>
      {wfhMsg.startsWith("ok:") && <OkBox msg={wfhMsg.slice(3)} />}
      {wfhMsg.startsWith("error:") && <ErrBox msg={wfhMsg.slice(6)} />}
      <div className="flex flex-wrap gap-2 mt-2">
        {showWfhCheckin && (
          <Btn disabled={wfhLoading} onClick={handleWfhCheckin}>
            <LogIn size={14} />{wfhLoading ? "Checking in…" : "Check-in (WFH)"}
          </Btn>
        )}
        {showWfhCheckout && (
          <Btn variant="danger" disabled={wfhLoading} onClick={handleWfhCheckout}>
            <LogOut size={14} />{wfhLoading ? "Checking out…" : "Check-out (WFH)"}
          </Btn>
        )}
      </div>
    </Card>
  );
}

export function HrAdminOversightPanel({
  users, attendance, shortLeaveRequests, leaveRequests,
  currentUser, setAttendance, setShortLeaveRequests, setLeaveRequests, setUsers, roles,
  setNotifications,
}) {
  const pendingShort = (shortLeaveRequests || []).filter(r => r && r.status === "pending" && isHrAdminRequest(r, users));
  const pendingLeave = (leaveRequests || []).filter(r => r && r.status === "pending" && isHrAdminRequest(r, users));
  if (pendingShort.length === 0 && pendingLeave.length === 0) return null;

  async function adjustBalanceAndPersist(userId, type, delta) {
    if (type === "Unpaid" || type === "WFH") return;
    const current = users.find(u => u.id === userId)?.leaveBalance ?? DEFAULT_ANNUAL_LEAVE;
    const next = Math.max(0, current + delta);
    setUsers(us => us.map(u => (u.id === userId ? { ...u, leaveBalance: next } : u)));
    try {
      await apiUpdateUser(userId, { leaveBalance: next });
    } catch (e) {
      console.error("Persist leaveBalance failed:", e.message || e);
    }
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
      const [shortLeave, att] = await Promise.all([
        apiFetchShortLeave(),
        apiFetchAttendance({ month: monthKey() }),
      ]);
      setShortLeaveRequests(shortLeave);
      setAttendance(att);
    } catch (e) {
      console.error("Short leave approval persist failed:", e.message || e);
    }
  }

  async function changeLeaveStatus(id, newStatus) {
    const req = leaveRequests.find(r => r.id === id);
    if (!req || !canChangeLeaveRequestStatus(currentUser, req, users, roles)) return;
    const prev = req.status;
    if (prev === newStatus) return;
    const paid = leavePaidDays(req);
    const patch = buildApprovalDecision(currentUser, newStatus);
    const nextReq = { ...req, ...patch, status: newStatus };
    const note = buildLeaveStatusNotification(req, newStatus);
    if (note && setNotifications) setNotifications(prev => [...prev, note]);
    try {
      if (newStatus === "approved" && prev !== "approved") await adjustBalanceAndPersist(req.userId, req.type, -paid);
      if (prev === "approved" && newStatus !== "approved") await adjustBalanceAndPersist(req.userId, req.type, +paid);
      await apiUpdateLeaveRequest(id, nextReq);
      const [leave, att] = await Promise.all([
        apiFetchLeave(),
        apiFetchAttendance({ month: monthKey() }),
      ]);
      setLeaveRequests(leave);
      setAttendance(att);
    } catch (e) {
      console.error("Leave approval persist failed:", e.message || e);
    }
  }

  async function deleteShortLeave(id) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(currentUser, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    try {
      await apiDeleteShortLeaveRequest(id);
      const [shortLeave, att] = await Promise.all([
        apiFetchShortLeave(),
        apiFetchAttendance({ month: monthKey() }),
      ]);
      setShortLeaveRequests(shortLeave);
      setAttendance(att);
    } catch (e) {
      console.error("Short leave delete failed:", e.message || e);
    }
  }

  return (
    <Card className="p-5 border-indigo-200 bg-amber-50/30">
      <STitle right={<Pill tone="dark">HR Admin approvals</Pill>}>Pending HR Admin requests</STitle>
      <p className="text-xs text-slate-500 mb-4">
        Approve or reject HR Admin leave and short leave here. Full profiles, attendance, and payroll are available under People, Attendance, and Payroll.
      </p>

      {(pendingShort.length > 0 || pendingLeave.length > 0) && (
        <div className="space-y-4">
          {pendingShort.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-2">Pending short leave</div>
              <div className="divide-y divide-slate-100">
                {pendingShort.map(r => (
                  <div key={r.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-44">
                      <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                      <div className="text-xs text-slate-500">
                        {formatDate(r.date)} · {r.fromTime} – {r.toTime} · {r.minutes} min
                      </div>
                      {r.reason && <div className="text-xs text-slate-400 italic">"{r.reason}"</div>}
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
                      <button onClick={() => deleteShortLeave(r.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                        title="Delete record">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pendingLeave.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-2">Pending leave</div>
              <div className="divide-y divide-slate-100">
                {pendingLeave.map(r => (
                  <div key={r.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-44">
                      <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                      <div className="text-xs text-slate-500">
                        {leaveTypeLabel(r.type)} · {r.from} → {r.to} · {r.days} day{r.days !== 1 ? "s" : ""}
                      </div>
                      {r.note && <div className="text-xs text-slate-400 italic">"{r.note}"</div>}
                    </div>
                    {r.type === "WFH"
                      ? <Pill tone="blue">WFH</Pill>
                      : (r.payTag === "Unpaid" || leaveUnpaidDays(r) > 0)
                        ? <Pill tone="red">Unpaid</Pill>
                        : <Pill tone="green">Paid</Pill>}
                    <div className="flex gap-2">
                      <button onClick={() => changeLeaveStatus(r.id, "approved")}
                        className="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#16a34a" }}>
                        Approve
                      </button>
                      <button onClick={() => changeLeaveStatus(r.id, "rejected")}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-white">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ─── DASHBOARD ─── */
export function Dashboard({ currentUser, users, setRoute, attendance, setAttendance, shortLeaveRequests, setShortLeaveRequests, leaveRequests, setLeaveRequests, setUsers, roles, holidays = [], notifications, setNotifications, warnings = [], setWarnings }) {
  const role = currentUser.role;
  const me   = users.find(u => u.id === currentUser.id) || currentUser;
  const opsDashboard = can(role, "view_attendance_reports", roles) && can(role, "view_people", roles);
  const canIssueWarnings = can(role, "manage_employees", roles);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnTgt, setWarnTgt] = useState(null);
  const [warnDefaultReason, setWarnDefaultReason] = useState("");

  if ((isStaffRole(role) || isAdminRole(role)) && !opsDashboard) {
    const quickActions = isAdminRole(role)
      ? [
          ["Submit leave request", "leave"],
          ["Submit short leave", "shortleave"],
          ["My payroll slip", "payroll"],
          ["Attendance history", "attendance"],
          ["Announcements", "announcements"],
          ["Company policies", "policies"],
          ["My profile", "myprofile"],
          ["Account settings", "settings"],
        ]
      : [
          ["Submit leave request", "leave"],
          ["My profile", "myprofile"],
          ["Account settings", "settings"],
          ["Attendance history", "attendance"],
        ];
    return (
      <div className="space-y-5 max-w-3xl">
        <div className="p-6 rounded-2xl text-white" style={{ background: B.dark }}>
          <div className="text-lg font-bold">Welcome, {me.name.split(" ")[0]}</div>
          <div className="text-sm opacity-70 mt-0.5">
            {isAdminRole(role)
              ? `${me.title || "Admin"} · Admin Portal`
              : `${me.title || (isManagerDesignation(me) ? "Manager" : me.role)} · Shift ${formatShiftRange(me)}`}
          </div>
        </div>
        <EmployeeShiftPanel user={me} attendance={attendance} setAttendance={setAttendance} holidays={holidays} leaveRequests={leaveRequests} compact />
        <WfhPortalActions user={me} attendance={attendance} setAttendance={setAttendance} leaveRequests={leaveRequests} />
        <div className="grid grid-cols-1 gap-4 max-w-xs">
          <Card className="p-4">
            <div className="text-xs text-slate-400">Annual leave</div>
            <div className="text-3xl font-bold mt-1" style={{ color: B.dark }}>{me.leaveBalance ?? DEFAULT_ANNUAL_LEAVE}</div>
            <div className="text-xs text-slate-500">of {DEFAULT_ANNUAL_LEAVE} days</div>
          </Card>
        </div>
        <Card className="p-4">
          <STitle>Quick actions</STitle>
          <div className="space-y-2">
            {quickActions.map(([l, r]) => (
              <button key={r} onClick={() => setRoute(r)}
                className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium flex items-center justify-between border border-slate-200 hover:bg-slate-50"
                style={{ color: B.dark }}>
                {l}<ChevronRight size={16} />
              </button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!opsDashboard) return null;

  // HR Admin & Executive operations dashboard
  const staffRoster = employeeRoster(users);
  const allStaff = staffRoster.filter(u => u.status === "active");
  const todayRoster = isExecutiveRole(role)
    ? activeAttendanceRoster(users, role)
    : allStaff;
  const checkedInNow = todayRoster.filter(u => {
    const r = getUserTodayRecord(attendance, u.id);
    return r?.checkIn && !r?.checkOut;
  });

  const pendingShort = (shortLeaveRequests || []).filter(r =>
    r && r.status === "pending"
    && canChangeShortLeaveRequestStatus(me, r, users, roles)
    && !(isExecutiveRole(role) && isHrAdminRequest(r, users))
  );

  const totalHoursTodayMs = todayRoster.reduce((sum, u) => {
    const r = getUserTodayRecord(attendance, u.id, u);
    if (!r?.checkIn) return sum;
    if (r.workingMs != null) return sum + Number(r.workingMs);
    if (r.checkOut) return sum + (calcNetWorkingMs(r) || 0);
    return sum + (calcLiveWorkingMs(r) || 0);
  }, 0);

  async function approveShort(id, status) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canChangeShortLeaveRequestStatus(me, req, users, roles)) return;
    const prev = req.status;
    if (prev === status) return;
    const patch = buildApprovalDecision(currentUser, status);
    const nextReq = { ...req, ...patch, status };
    try {
      await apiUpdateShortLeaveRequest(id, nextReq);
      const [shortLeave, att] = await Promise.all([
        apiFetchShortLeave(),
        apiFetchAttendance({ month: monthKey() }),
      ]);
      setShortLeaveRequests(shortLeave);
      setAttendance(att);
    } catch (e) {
      console.error("Short leave approval persist failed:", e.message || e);
    }
  }

  async function deleteShort(id) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(me, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    try {
      await apiDeleteShortLeaveRequest(id);
      const [shortLeave, att] = await Promise.all([
        apiFetchShortLeave(),
        apiFetchAttendance({ month: monthKey() }),
      ]);
      setShortLeaveRequests(shortLeave);
      setAttendance(att);
    } catch (e) {
      console.error("Short leave delete failed:", e.message || e);
    }
  }

  const thisMonth = monthKey();
  const lateAlerts = allStaff
    .map(u => ({ user: u, lateCount: lateDaysInMonth(attendance, u.id, thisMonth, users, holidays) }))
    .filter(a => a.lateCount >= 3)
    .sort((a, b) => b.lateCount - a.lateCount);

  function openLateWarning(user, lateCount) {
    if (!canIssueWarnings || !isStaffRole(user.role)) return;
    setWarnTgt(user);
    setWarnDefaultReason(`Repeated late arrivals: ${lateCount} late check-ins this month.`);
    setWarnOpen(true);
  }

  async function issueWarning({ type, reason, date }) {
    const emp = warnTgt;
    if (!emp || !canIssueWarnings || !setWarnings) return;
    const warning = {
      id: genId(),
      userId: emp.id,
      type: String(type || "verbal").toLowerCase(),
      reason,
      date: date || todayKey(),
      issuedBy: currentUser.name,
      acknowledged: false,
    };
    try {
      const saved = await apiCreateWarning(warning);
      setWarnings(prev => [saved || warning, ...(prev || []).filter(w => w && w.userId)]);
      const note = buildWarningNotification(emp.id, warning.type, reason);
      if (setNotifications) setNotifications(prev => [...(prev || []), note]);
      if (emp.email) {
        return apiSendWarningEmail({
          to: emp.email,
          name: emp.name,
          warningType: warningTypeLabel(warning.type),
          reason,
          date: warning.date,
        }).catch(() => {});
      }
    } catch (e) {
      console.error("issueWarning failed:", e?.message || e);
    }
  }

  return (
    <div className="space-y-5">
      {hasOwnAttendance(role) && (
        <>
          <EmployeeShiftPanel user={me} attendance={attendance} setAttendance={setAttendance} holidays={holidays} leaveRequests={leaveRequests} compact />
          <WfhPortalActions user={me} attendance={attendance} setAttendance={setAttendance} leaveRequests={leaveRequests} />
        </>
      )}
      <div className="p-6 rounded-2xl text-white" style={{ background: B.dark }}>
        <div className="text-lg font-bold">Welcome, {me.name.split(" ")[0]}</div>
        <div className="text-sm opacity-70 mt-0.5">
          {role === "Executive"
            ? `${me.title || "Executive"} · Executive Portal`
            : role === "HR Employee"
              ? "Adforce Solutions · HR Employee Portal"
              : "Adforce Solutions · HR Admin Portal"}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total employees",   value: staffRoster.length,                           icon: Users },
          { label: "Checked in now",    value: checkedInNow.length,                          icon: LogIn },
          { label: "Total hours today", value: formatDurationMs(totalHoursTodayMs),          icon: Clock },
          { label: "Pending setup",     value: staffRoster.filter(u => u.firstLogin).length, icon: AlertTriangle },
        ].map(k => (
          <Card key={k.label} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">{k.label}</span>
              <span className="p-1.5 rounded-lg" style={{ background: B.darkLight, color: B.dark }}><k.icon size={14} /></span>
            </div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: B.dark }}>{k.value}</div>
          </Card>
        ))}
      </div>

      {canIssueWarnings && lateAlerts.length > 0 && (
        <Card className="p-5 border-amber-200">
          <STitle>Late Alerts</STitle>
          <p className="text-xs text-slate-500 mb-3">Employees with 3 or more late arrivals this month</p>
          <div className="divide-y divide-slate-100">
            {lateAlerts.map(({ user, lateCount }) => (
              <div key={user.id} className="py-3 flex items-center gap-3 flex-wrap">
                <Avatar name={user.name} />
                <div className="flex-1 min-w-44">
                  <div className="text-sm font-medium text-slate-800"><UserDisplayName user={user} /></div>
                  <div className="text-xs text-slate-500">{lateCount} late arrivals this month</div>
                </div>
                <Pill tone="amber">{lateCount} late</Pill>
                <Btn size="sm" onClick={() => openLateWarning(user, lateCount)}>
                  <AlertTriangle size={13} />Issue Warning
                </Btn>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isExecutiveRole(role) && (
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
        <Card className="p-5 border-amber-200">
          <STitle right={
            <button onClick={() => setRoute("shortleave")} className="text-xs hover:underline" style={{ color: B.dark }}>View all</button>
          }>Short leave approvals</STitle>
          <div className="divide-y divide-slate-100">
            {pendingShort.slice(0, 5).map(r => (
              <div key={r.id} className="py-3 flex items-center gap-3 flex-wrap">
                <Avatar name={r.empName} />
                <div className="flex-1 min-w-44">
                  <div className="text-sm font-medium text-slate-800">{r.empName}</div>
                  <div className="text-xs text-slate-500">
                    {formatDate(r.date)} · {r.fromTime} – {r.toTime} · {r.minutes} min
                  </div>
                  {r.reason && <div className="text-xs text-slate-400 italic">"{r.reason}"</div>}
                  <ApprovalReviewMeta req={r} />
                </div>
                <ApprovalStatusBadge req={r} />
                <ApprovalActionButtons
                  req={r}
                  canChange={canChangeShortLeaveRequestStatus(me, r, users, roles)}
                  onApprove={() => approveShort(r.id, "approved")}
                  onReject={() => approveShort(r.id, "rejected")}
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

      {todayRoster.length > 0 && (
        <Card className="p-5">
          <STitle right={
            <button onClick={() => setRoute("attendance")} className="text-xs hover:underline" style={{ color: B.dark }}>Full reports</button>
          }>Today's attendance</STitle>
          <div className="divide-y divide-slate-100">
            {todayRoster.map(u => {
              const r = getUserTodayRecord(attendance, u.id);
              const dateKey = r?.date ?? todayKey();
              const status = resolveDayStatus(u, r, dateKey, holidays);
              const ds = dayStatusPill(status);
              const outIso = effectiveCheckOut(r, u, dateKey);
              const inLabel = r?.checkIn ? `In ${formatTime(r.checkIn)}` : "Not checked in";
              let outLabel = "";
              if (status === "Working") outLabel = " · Working";
              else if (outIso) outLabel = ` · Out ${formatTime(outIso)}`;
              else if (r?.lastScan && r.lastScan !== r.checkIn) outLabel = ` · Last scan ${formatTime(r.lastScan)}`;
              return (
                <div key={u.id} className="py-2.5 flex items-center gap-3">
                  <Avatar name={u.name} />
                  <div className="flex-1 min-w-0">
                    <UserDisplayName user={u} className="text-sm font-medium text-slate-800" />
                    <div className="text-xs text-slate-400">
                      {formatShiftRange(u)} · {inLabel}{outLabel}
                      {r?.autoCheckout && outIso ? " (auto)" : ""}
                    </div>
                  </div>
                  <Pill tone={ds.tone}>{ds.label}</Pill>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {isHrOpsRole(role) && staffRoster.length === 0 && (
        <Card className="p-8 text-center">
          <UserPlus size={36} className="mx-auto mb-3 text-slate-300" />
          <div className="text-slate-600 font-medium mb-1">No employees yet</div>
          <div className="text-slate-400 text-sm mb-4">Add your first employee to get started.</div>
          <button onClick={() => setRoute("people")}
            className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg"
            style={{ background: B.dark }}>
            Add first employee
          </button>
        </Card>
      )}

      {staffRoster.filter(u => u.firstLogin).length > 0 && (
        <Card className="p-5">
          <STitle>Pending first login</STitle>
          <div className="divide-y divide-slate-100">
            {staffRoster.filter(u => u.firstLogin).map(u => (
              <div key={u.id} className="py-2.5 flex items-center gap-3">
                <Avatar name={u.name} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800"><UserDisplayName user={u} className="text-sm font-medium text-slate-800" /></div>
                  <div className="text-xs text-slate-400">{u.email}</div>
                </div>
                <Pill tone="amber"><Timer size={12} />Setup pending</Pill>
              </div>
            ))}
          </div>
        </Card>
      )}

      {staffRoster.length > 0 && (
        <Card className="p-5">
          <STitle right={
            <button onClick={() => setRoute("people")} className="text-xs hover:underline" style={{ color: B.dark }}>View all</button>
          }>Recent employees</STitle>
          <div className="divide-y divide-slate-100">
            {staffRoster.slice(-4).reverse().map(u => (
              <div key={u.id} className="py-2.5 flex items-center gap-3">
                <Avatar name={u.name} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800"><UserDisplayName user={u} className="text-sm font-medium text-slate-800" /></div>
                  <div className="text-xs text-slate-400">{u.role} · {u.dept || "—"}</div>
                </div>
                {u.status === "active" ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Inactive</Pill>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <IssueWarningModal
        open={warnOpen}
        onClose={() => { setWarnOpen(false); setWarnTgt(null); setWarnDefaultReason(""); }}
        employee={warnTgt}
        issuedBy={currentUser.name}
        defaultReason={warnDefaultReason}
        onSubmit={issueWarning}
      />
    </div>
  );
}
