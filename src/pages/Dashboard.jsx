import React from "react";
import { Users, ChevronRight, AlertTriangle, UserPlus, Timer, Trash2, Building, LogIn } from "lucide-react";
import { B } from "../brand.jsx";
import { DEFAULT_ANNUAL_LEAVE, can, isHrAdminRole, isExecutiveRole, employeeRoster, isHrAdminRequest, canApproveShortLeaveRequest, canApproveLeaveRequest, canDeleteShortLeaveRecord, activeAttendanceRoster, formatShiftRange, resolveDayStatus, dayStatusPill, applyApprovedShortLeave, removeShortLeaveFromAttendance, leavePaidDays, leaveUnpaidDays, formatTime, formatDate, getUserTodayRecord } from "../utils.js";
import { Pill, Avatar, Card, STitle } from "../components/ui.jsx";
import { EmployeeShiftPanel } from "../components/EmployeeShiftPanel.jsx";

export function HrAdminOversightPanel({
  users, attendance, shortLeaveRequests, leaveRequests,
  currentUser, setAttendance, setShortLeaveRequests, setLeaveRequests, setUsers, roles,
}) {
  const pendingShort = shortLeaveRequests.filter(r => r.status === "pending" && isHrAdminRequest(r, users));
  const pendingLeave = leaveRequests.filter(r => r.status === "pending" && isHrAdminRequest(r, users));
  if (pendingShort.length === 0 && pendingLeave.length === 0) return null;

  function adjustBalance(userId, type, delta) {
    if (type === "Unpaid") return;
    setUsers(us => us.map(u => {
      if (u.id !== userId) return u;
      return { ...u, leaveBalance: Math.max(0, (u.leaveBalance ?? DEFAULT_ANNUAL_LEAVE) + delta) };
    }));
  }

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
      ...r, status: newStatus, reviewedBy: currentUser.name, reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function changeLeaveStatus(id, newStatus) {
    const req = leaveRequests.find(r => r.id === id);
    if (!req || !canApproveLeaveRequest(currentUser, req, users, roles)) return;
    const prev = req.status;
    if (prev === newStatus) return;
    const paid = leavePaidDays(req);
    if (newStatus === "approved" && prev !== "approved") adjustBalance(req.userId, req.type, -paid);
    if (prev === "approved" && newStatus !== "approved") adjustBalance(req.userId, req.type, +paid);
    setLeaveRequests(p => p.map(r => r.id === id ? {
      ...r, status: newStatus, reviewedBy: currentUser.name, reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function deleteShortLeave(id) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(currentUser, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    if (req.status === "approved") setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    setShortLeaveRequests(rs => rs.filter(r => r.id !== id));
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
                        {r.type === "Unpaid" ? "Unpaid Leave" : "Annual Leave"} · {r.from} → {r.to} · {r.days} day{r.days !== 1 ? "s" : ""}
                      </div>
                      {r.note && <div className="text-xs text-slate-400 italic">"{r.note}"</div>}
                    </div>
                    {(r.payTag === "Unpaid" || leaveUnpaidDays(r) > 0)
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
export function Dashboard({ currentUser, users, setRoute, attendance, setAttendance, shortLeaveRequests, setShortLeaveRequests, leaveRequests, setLeaveRequests, setUsers, roles, holidays = [] }) {
  const role = currentUser.role;
  const me   = users.find(u => u.id === currentUser.id) || currentUser;
  const opsDashboard = can(role, "view_attendance_reports", roles) && can(role, "view_people", roles);

  if ((role === "Employee" || role === "Manager") && !opsDashboard) {
    return (
      <div className="space-y-5 max-w-3xl">
        <div className="p-6 rounded-2xl text-white" style={{ background: B.dark }}>
          <div className="text-lg font-bold">Welcome, {me.name.split(" ")[0]}</div>
          <div className="text-sm opacity-70 mt-0.5">{me.title || me.role} · Shift {formatShiftRange(me)}</div>
        </div>
        <EmployeeShiftPanel user={me} attendance={attendance} setAttendance={setAttendance} holidays={holidays} compact />
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
            {[["Attendance history", "attendance"], ["Submit leave request", "leave"], ["My profile", "myprofile"], ["Account settings", "settings"]].map(([l, r]) => (
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

  const pendingShort = shortLeaveRequests.filter(r =>
    r.status === "pending" && canApproveShortLeaveRequest(me, r, users, roles)
    && !(isExecutiveRole(role) && isHrAdminRequest(r, users))
  );

  function approveShort(id, status) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canApproveShortLeaveRequest(me, req, users, roles)) return;
    if (status === "approved") setAttendance(a => applyApprovedShortLeave(a, users, req));
    setShortLeaveRequests(rs => rs.map(r => r.id === id ? {
      ...r, status, reviewedBy: currentUser.name, reviewedOn: new Date().toLocaleString(),
    } : r));
  }

  function deleteShort(id) {
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req || !canDeleteShortLeaveRecord(me, req, users, roles)) return;
    if (!window.confirm(`Delete this short leave record for ${req.empName}?`)) return;
    if (req.status === "approved") setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    setShortLeaveRequests(rs => rs.filter(r => r.id !== id));
  }

  return (
    <div className="space-y-5">
      {isHrAdminRole(role) && (
        <EmployeeShiftPanel user={me} attendance={attendance} setAttendance={setAttendance} holidays={holidays} compact />
      )}
      <div className="p-6 rounded-2xl text-white" style={{ background: B.dark }}>
        <div className="text-lg font-bold">Welcome, {me.name.split(" ")[0]}</div>
        <div className="text-sm opacity-70 mt-0.5">
          {role === "Executive" ? `${me.title || "Executive"} · Executive Portal` : "Adforce Solutions · HR Admin Portal"}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total employees",  value: staffRoster.length,                                    icon: Users },
          { label: "Checked in now",   value: checkedInNow.length,                             icon: LogIn },
          { label: "Departments",      value: [...new Set(staffRoster.map(u => u.dept).filter(Boolean))].length, icon: Building },
          { label: "Pending setup",    value: staffRoster.filter(u => u.firstLogin).length,          icon: AlertTriangle },
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
        />
      )}

      {pendingShort.length > 0 && (
        <Card className="p-5 border-amber-200">
          <STitle right={
            <button onClick={() => setRoute("shortleave")} className="text-xs hover:underline" style={{ color: B.dark }}>View all</button>
          }>Pending short leave requests</STitle>
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
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveShort(r.id, "approved")}
                    className="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#16a34a" }}>
                    Approve
                  </button>
                  <button onClick={() => approveShort(r.id, "rejected")}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50">
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

      {todayRoster.length > 0 && (
        <Card className="p-5">
          <STitle right={
            <button onClick={() => setRoute("attendance")} className="text-xs hover:underline" style={{ color: B.dark }}>Full reports</button>
          }>Today's attendance</STitle>
          <div className="divide-y divide-slate-100">
            {todayRoster.map(u => {
              const r = getUserTodayRecord(attendance, u.id);
              const ds = dayStatusPill(resolveDayStatus(u, r, r.date, holidays));
              return (
                <div key={u.id} className="py-2.5 flex items-center gap-3">
                  <Avatar name={u.name} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-400">
                      {formatShiftRange(u)} · {r?.checkIn ? `In ${formatTime(r.checkIn)}` : "Not checked in"}
                      {r?.checkOut ? ` · Out ${formatTime(r.checkOut)}` : ""}
                      {r?.autoCheckout ? " (auto)" : ""}
                    </div>
                  </div>
                  <Pill tone={ds.tone}>{ds.label}</Pill>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {isHrAdminRole(role) && staffRoster.length === 0 && (
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
                  <div className="text-sm font-medium text-slate-800">{u.name}</div>
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
                  <div className="text-sm font-medium text-slate-800">{u.name}</div>
                  <div className="text-xs text-slate-400">{u.role} · {u.dept || "—"}</div>
                </div>
                {u.status === "active" ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Inactive</Pill>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
