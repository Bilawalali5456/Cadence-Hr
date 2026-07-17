import React, { useState } from "react";
import { Users, Search, X, AlertTriangle, UserPlus, Trash2, Edit2, Eye, Save, Phone, Mail, RefreshCw } from "lucide-react";
import { B } from "../brand.jsx";
import { apiSendCredentials } from "../api.js";
import { DEFAULT_ANNUAL_LEAVE, can, isStaffRole, isHrAdminRole, canManageHrAdmin, canEditPerson, canDeletePerson, canResetPersonCredentials, sortHrAdminFirst, peopleRoster, getUserShift, formatShiftRange, formatDurationMs, calcTotalBreakMs, isLateCheckIn, resolveDayStatus, dayStatusPill, removeShortLeaveFromAttendance, displayWorkingHours, leavePaidDays, leaveUnpaidDays, formatTime, formatDate, getUserTodayRecord, todayKey, genId, genTempPw, normalizeCnic, isValidCnic, encryptSensitive, getUserCnic, cnicDigitsForUser, monthLabel } from "../utils.js";
import { Pill, Avatar, Card, Modal, TextInput, Btn, OkBox } from "../components/ui.jsx";
import { EmployeeForm } from "../components/EmployeeForm.jsx";

export function PeoplePage({
  users, setUsers, currentUser, attendance, setAttendance,
  payroll = [], setPayroll, leaveRequests = [], setLeaveRequests,
  shortLeaveRequests = [], setShortLeaveRequests, roles, holidays = [],
}) {
  const canManage = can(currentUser.role, "manage_employees", roles);
  const readOnly = !canManage;
  const [q,         setQ]         = useState("");
  const [sel,       setSel]       = useState(null);
  const [selTab,    setSelTab]    = useState("Overview");
  const [addOpen,   setAddOpen]   = useState(false);
  const [editOpen,  setEditOpen]  = useState(false);
  const [delOpen,   setDelOpen]   = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [editTgt,   setEditTgt]   = useState(null);
  const [delTgt,    setDelTgt]    = useState(null);
  const [resetTgt,  setResetTgt]  = useState(null);
  const [resetResult, setResetResult] = useState("");
  const [newEmail,  setNewEmail]  = useState("");
  const [ferr,      setFerr]      = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [pageOk, setPageOk] = useState("");

  const blank = {
    name: "", email: "", phone: "", title: "", dept: "", team: "", type: "Full-time", hired: "", salary: "",
    status: "active", role: "Employee", bankName: "", bankBranch: "", bankAccount: "", bankIban: "",
    guardianName: "", maritalStatus: "", emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelation: "", cnic: "",
    shiftStart: "09:00", shiftEnd: "18:00", graceMinutes: 15, breakMinutes: 60, checkoutGraceMinutes: 10,
  };
  const [form, setForm] = useState(blank);

  const roster = peopleRoster(users, currentUser.role);
  const list = sortHrAdminFirst(roster.filter(u =>
    (u.name + u.email + u.dept + u.role).toLowerCase().includes(q.toLowerCase())
  ));

  function openAdd()    { setForm(blank); setFerr(""); setAddOpen(true); }
  function openEdit(u) {
    const s = getUserShift(u);
    setEditTgt(u);
    setForm({ ...u, cnic: getUserCnic(u), shiftStart: s.shiftStart, shiftEnd: s.shiftEnd, graceMinutes: s.graceMinutes, breakMinutes: s.breakMinutes, checkoutGraceMinutes: s.checkoutGraceMinutes });
    setFerr("");
    setEditOpen(true);
  }
  function openDel(u)   { setDelTgt(u);  setDelOpen(true); }
  function openReset(u) { setResetTgt(u); setResetResult(""); setNewEmail(""); setResetOpen(true); }

  function saveAdd() {
    const email = form.email.trim();
    if (!form.name.trim() || !email) { setFerr("Full name and work email are required."); return; }
    if (!isValidCnic(form.cnic)) { setFerr("A valid 13-digit CNIC is required (format: XXXXX-XXXXXXX-X)."); return; }
    const cnicDigits = normalizeCnic(form.cnic);
    if (users.find(u => cnicDigitsForUser(u) === cnicDigits)) { setFerr("This CNIC is already registered to another employee."); return; }
    if (users.find(u => u.email.trim().toLowerCase() === email.toLowerCase())) { setFerr("This email already exists."); return; }
    const tempPw  = genTempPw();
    const { shiftStart, shiftEnd, graceMinutes, breakMinutes, checkoutGraceMinutes, cnic, ...rest } = form;
    const newUser = {
      ...rest, name: form.name.trim(), email, cnicEnc: encryptSensitive(cnicDigits),
      shift: { shiftStart, shiftEnd, graceMinutes, breakMinutes, checkoutGraceMinutes },
      id: genId(), password: tempPw, leaveBalance: DEFAULT_ANNUAL_LEAVE, skills: [], firstLogin: true, tempPassword: tempPw,
    };
    setEmailSending(true);
    setFerr("");
    setUsers(p => [...p, newUser]);
    apiSendCredentials({
      to: email,
      name: form.name.trim(),
      email,
      password: tempPw,
      role: rest.role || "Employee",
    })
      .then(() => {
        setAddOpen(false);
        setPageOk(`Login credentials sent to ${email}. They must change their password on first login.`);
        setTimeout(() => setPageOk(""), 6000);
      })
      .catch(e => {
        setFerr(`Account was created, but the email could not be sent: ${e.message}`);
      })
      .finally(() => setEmailSending(false));
  }

  function saveEdit() {
    if (!canEditPerson(currentUser, editTgt, roles)) { setFerr("You do not have permission to edit this account."); return; }
    if (!form.name || !form.email) { setFerr("Full name and work email are required."); return; }
    if (!isValidCnic(form.cnic)) { setFerr("A valid 13-digit CNIC is required (format: XXXXX-XXXXXXX-X)."); return; }
    const cnicDigits = normalizeCnic(form.cnic);
    if (users.find(u => cnicDigitsForUser(u) === cnicDigits && u.id !== editTgt.id)) { setFerr("This CNIC is already registered to another employee."); return; }
    if (users.find(u => u.email.toLowerCase() === form.email.toLowerCase() && u.id !== editTgt.id)) { setFerr("This email is already used by another account."); return; }
    const { shiftStart, shiftEnd, graceMinutes, breakMinutes, checkoutGraceMinutes, password, tempPassword, cnic, ...rest } = form;
    const updated = {
      ...rest,
      role: isHrAdminRole(editTgt.role) ? "HR Admin" : rest.role,
      cnicEnc: encryptSensitive(cnicDigits),
      shift: { shiftStart: shiftStart || "09:00", shiftEnd: shiftEnd || "18:00", graceMinutes: graceMinutes ?? 15, breakMinutes: breakMinutes ?? 60, checkoutGraceMinutes: checkoutGraceMinutes ?? 10 },
    };
    setUsers(p => p.map(u => u.id === editTgt.id ? { ...u, ...updated } : u));
    if (sel?.id === editTgt.id) setSel(s => ({ ...s, ...updated }));
    setEditOpen(false);
  }

  function confirmDel() {
    if (!canDeletePerson(currentUser, delTgt, roles)) return;
    setUsers(p => p.filter(u => u.id !== delTgt.id));
    if (sel?.id === delTgt.id) setSel(null);
    setDelOpen(false);
  }

  function doPasswordReset() {
    if (!canResetPersonCredentials(currentUser, resetTgt, roles)) return;
    const tempPw = genTempPw();
    setEmailSending(true);
    setResetResult("");
    setUsers(p => p.map(u => u.id === resetTgt.id ? { ...u, password: tempPw, firstLogin: true, tempPassword: tempPw } : u));
    apiSendCredentials({
      to: resetTgt.email,
      name: resetTgt.name,
      email: resetTgt.email,
      password: tempPw,
      role: resetTgt.role,
      isReset: true,
    })
      .then(() => {
        setResetResult(`A new temporary password was emailed to ${resetTgt.email}. They must change it on next login.`);
      })
      .catch(e => {
        setResetResult(`Password was reset, but the email could not be sent: ${e.message}`);
      })
      .finally(() => setEmailSending(false));
  }

  function doEmailChange() {
    if (!canResetPersonCredentials(currentUser, resetTgt, roles)) return;
    if (!newEmail) return;
    if (users.find(u => u.email.toLowerCase() === newEmail.toLowerCase() && u.id !== resetTgt.id)) {
      setResetResult("Error: This email is already in use."); return;
    }
    setUsers(p => p.map(u => u.id === resetTgt.id ? { ...u, email: newEmail } : u));
    setResetResult(`Email updated to: ${newEmail}`);
    setNewEmail("");
  }

  function managingSel() {
    return sel && canManageHrAdmin(currentUser, sel, roles);
  }

  function updateSelBalances(leaveBalance) {
    if (!managingSel()) return;
    setUsers(us => us.map(u => u.id === sel.id ? { ...u, leaveBalance } : u));
    setSel(s => ({ ...s, leaveBalance }));
  }

  function deleteAttendanceRecord(recordId) {
    if (!managingSel() || !setAttendance) return;
    if (!window.confirm("Delete this attendance record?")) return;
    setAttendance(a => a.filter(r => r.id !== recordId));
  }

  function deleteLeaveRecord(id) {
    if (!managingSel() || !setLeaveRequests) return;
    const req = leaveRequests.find(r => r.id === id);
    if (!req) return;
    if (!window.confirm(`Delete this leave request?`)) return;
    if (req.status === "approved") {
      const paid = leavePaidDays(req);
      setUsers(us => us.map(u => {
        if (u.id !== sel.id) return u;
        return { ...u, leaveBalance: (u.leaveBalance ?? DEFAULT_ANNUAL_LEAVE) + paid };
      }));
      setSel(s => ({
        ...s,
        leaveBalance: (s.leaveBalance ?? DEFAULT_ANNUAL_LEAVE) + paid,
      }));
    }
    setLeaveRequests(p => p.filter(r => r.id !== id));
  }

  function deleteShortLeaveRecord(id) {
    if (!managingSel() || !setShortLeaveRequests) return;
    const req = shortLeaveRequests.find(r => r.id === id);
    if (!req) return;
    if (!window.confirm(`Delete this short leave record?`)) return;
    if (req.status === "approved" && setAttendance) {
      setAttendance(a => removeShortLeaveFromAttendance(a, users, req));
    }
    setShortLeaveRequests(rs => rs.filter(r => r.id !== id));
  }

  function deletePayrollSlip(id) {
    if (!managingSel() || !setPayroll) return;
    if (!window.confirm("Delete this salary slip?")) return;
    setPayroll(p => p.filter(s => s.id !== id));
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employees…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        {canManage && <Btn onClick={openAdd}><UserPlus size={14} />Add employee</Btn>}
      </div>

      {pageOk && <div className="mb-4"><OkBox msg={pageOk} /></div>}

      {readOnly && (
        <div className="mb-4 p-4 rounded-xl text-sm flex gap-3 items-start" style={{ background: B.darkLight, color: B.dark, border: `1px solid ${B.darkBorder}` }}>
          <Eye size={16} className="mt-0.5 shrink-0" />
          <div><b>View only</b> for employees. Executives have full management access over HR Admin accounts — profile, shift, credentials, attendance, leave, and payroll records.</div>
        </div>
      )}

      {canManage && roster.length === 0 && (
        <div className="mb-4 p-4 rounded-xl text-sm flex gap-3 items-start" style={{ background: B.darkLight, color: B.dark, border: `1px solid ${B.darkBorder}` }}>
          <Users size={16} className="mt-0.5 shrink-0" />
          <div>
            <b>No employees yet.</b> Click "Add employee" to get started. Login credentials are emailed automatically — they must change their password on first login.
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2.5 font-medium">Employee</th>
              <th className="px-4 py-2.5 font-medium hidden md:table-cell">Role</th>
              <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Shift</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Today</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map(u => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <button onClick={() => { setSel(u); setSelTab("Overview"); }} className="flex items-center gap-3 text-left">
                    <Avatar name={u.name} />
                    <div>
                      <div className="font-medium text-slate-800">{u.name}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </div>
                  </button>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <Pill tone={u.role === "HR Admin" ? "dark" : "slate"}>{u.role}</Pill>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-slate-500 text-xs tabular-nums">{formatShiftRange(u)}</td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {(() => {
                    const r = getUserTodayRecord(attendance, u.id);
                    const ds = dayStatusPill(resolveDayStatus(u, r, r?.date ?? todayKey(), holidays));
                    return <Pill tone={ds.tone}>{ds.label}</Pill>;
                  })()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    {canManage && isStaffRole(u.role) && (
                      <>
                        <button onClick={() => openReset(u)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600" title="Reset credentials"><RefreshCw size={14} /></button>
                        <button onClick={() => openEdit(u)}  className="p-1.5 rounded-lg hover:bg-blue-50  text-slate-400 hover:text-blue-600"  title="Edit"><Edit2 size={14} /></button>
                        {u.id !== currentUser.id && (
                          <button onClick={() => openDel(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
                        )}
                      </>
                    )}
                    {canManageHrAdmin(currentUser, u, roles) && (
                      <>
                        <button onClick={() => openReset(u)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600" title="Reset credentials"><RefreshCw size={14} /></button>
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Edit HR Admin"><Edit2 size={14} /></button>
                        <button onClick={() => openDel(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Remove HR Admin"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No employees found.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Add */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add new employee" wide>
        <EmployeeForm form={form} setForm={setForm} ferr={ferr} />
        <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: B.darkLight, color: B.dark }}>
          A temporary password will be generated and emailed to the work address above. They must change it on first login.
        </div>
        <div className="flex gap-2 mt-4">
          <Btn onClick={saveAdd} disabled={emailSending}><UserPlus size={14} />{emailSending ? "Sending email…" : "Add employee"}</Btn>
          <Btn variant="ghost" onClick={() => setAddOpen(false)} disabled={emailSending}>Cancel</Btn>
        </div>
      </Modal>

      {/* Edit */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={isHrAdminRole(editTgt?.role) ? "Edit HR Admin" : "Edit employee"} wide>
        <EmployeeForm form={form} setForm={setForm} ferr={ferr} lockRole={isHrAdminRole(editTgt?.role)} />
        <div className="flex gap-2 mt-4">
          <Btn onClick={saveEdit}><Save size={14} />Save changes</Btn>
          <Btn variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      {/* Delete */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title={isHrAdminRole(delTgt?.role) ? "Remove HR Admin" : "Delete employee"}>
        <div className="flex gap-3 items-start p-3 rounded-lg border mb-4" style={{ background: B.redLight, borderColor: B.redBorder }}>
          <AlertTriangle size={18} style={{ color: B.red }} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium" style={{ color: B.red }}>Permanently remove {delTgt?.name}?</p>
            <p className="text-xs text-red-600 mt-1">This cannot be undone. The account and associated profile data will be removed from the system.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Btn variant="danger" onClick={confirmDel}><Trash2 size={14} />Delete</Btn>
          <Btn variant="ghost"  onClick={() => setDelOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      {/* Reset credentials */}
      <Modal open={resetOpen} onClose={() => { setResetOpen(false); setNewEmail(""); setResetResult(""); }} title={`Reset credentials — ${resetTgt?.name}`}>
        <div className="space-y-5">
          <div className="p-3 rounded-lg text-sm" style={{ background: B.darkLight, color: B.dark }}>
            Reset this employee's <b>password</b> or update their <b>email address</b>.
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-1">Reset password</h4>
            <p className="text-xs text-slate-500 mb-3">Generates a new temporary password and emails it to the employee. They must change it on next login.</p>
            <Btn onClick={doPasswordReset} disabled={emailSending}><RefreshCw size={14} />{emailSending ? "Sending email…" : "Email new temporary password"}</Btn>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Change email address</h4>
            <div className="flex gap-2">
              <div className="flex-1">
                <TextInput value={newEmail} onChange={setNewEmail} placeholder="new@adforce.com" Icon={Mail} />
              </div>
              <Btn onClick={doEmailChange} size="sm"><Save size={13} /></Btn>
            </div>
          </div>

          {resetResult && (
            <div className={`p-3 rounded-lg text-sm ${resetResult.includes("could not be sent") || resetResult.startsWith("Error") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>
              {resetResult}
            </div>
          )}
        </div>
      </Modal>

      {/* Profile slide-over */}
      {sel && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setSel(null)} />
          <div className="absolute inset-y-0 right-0 w-full sm:w-[480px] bg-white shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={sel.name} size={12} />
                  <div>
                    <div className="text-lg font-semibold" style={{ color: B.dark }}>{sel.name}</div>
                    <div className="text-sm text-slate-500">{sel.title || sel.role} · {sel.dept}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {canEditPerson(currentUser, sel, roles) && (
                    <button onClick={() => openEdit(sel)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400" title="Edit"><Edit2 size={15} /></button>
                  )}
                  {canResetPersonCredentials(currentUser, sel, roles) && (
                    <button onClick={() => openReset(sel)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400" title="Reset credentials"><RefreshCw size={15} /></button>
                  )}
                  {canDeletePerson(currentUser, sel, roles) && (
                    <button onClick={() => openDel(sel)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Remove"><Trash2 size={15} /></button>
                  )}
                  <button onClick={() => setSel(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
                </div>
              </div>
              <div className="flex gap-1 mt-4 border-b border-slate-100 -mb-5 flex-wrap">
                {["Overview", "Personal", "Shift", "Bank", "Access", "Leave", ...(readOnly ? ["Salary", "Attendance"] : [])].map(t => (
                  <button key={t} onClick={() => setSelTab(t)}
                    className="px-3 py-2 text-sm border-b-2 -mb-px"
                    style={selTab === t ? { borderColor: B.dark, color: B.dark, fontWeight: 600 } : { borderColor: "transparent", color: "#64748b" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-sm">
              {selTab === "Overview" && (
                <div className="space-y-3">
                  {[["Email", sel.email], ["Phone", sel.phone || "—"], ["CNIC", getUserCnic(sel) || "—"], ["Marital status", sel.maritalStatus || "—"], ["Role", sel.role], ["Team", sel.team || "—"], ["Type", sel.type], ["Hired", sel.hired || "—"], ["Status", sel.status], ...(readOnly && sel.salary ? [["Salary", sel.salary]] : [])].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-slate-400">{k}</span>
                      <span className="font-medium text-slate-800">{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {selTab === "Personal" && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Emergency contact</div>
                  {[["Guardian name", sel.guardianName || "—"], ["Contact name", sel.emergencyContactName || "—"], ["Contact number", sel.emergencyContactPhone || "—"], ["Relationship", sel.emergencyContactRelation || "—"]].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-slate-50 pb-2 gap-4">
                      <span className="text-slate-400 shrink-0">{k}</span>
                      <span className="font-medium text-slate-800 text-right">{v}</span>
                    </div>
                  ))}
                  {!sel.guardianName && !sel.emergencyContactName && !sel.emergencyContactPhone && (
                    <p className="text-xs text-slate-400 p-3 rounded-lg bg-slate-50">No emergency contact details on file. Edit the employee to add them.</p>
                  )}
                </div>
              )}
              {selTab === "Shift" && (
                <div className="space-y-3">
                  {[["Shift time", formatShiftRange(sel)], ["Late grace", `${getUserShift(sel).graceMinutes} min`], ["Break allowance", `${getUserShift(sel).breakMinutes} min`], ["Checkout grace", `${getUserShift(sel).checkoutGraceMinutes} min after shift end`]].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-slate-50 pb-2 gap-4">
                      <span className="text-slate-400 shrink-0">{k}</span>
                      <span className="font-medium text-slate-800 text-right">{v}</span>
                    </div>
                  ))}
                  {managingSel() && (
                    <Btn size="sm" onClick={() => openEdit(sel)}><Edit2 size={13} />Edit shift & schedule</Btn>
                  )}
                </div>
              )}
              {selTab === "Bank" && (
                <div className="space-y-3">
                  {[["Bank name", sel.bankName || "—"], ["Branch", sel.bankBranch || "—"], ["Account number", sel.bankAccount || "—"], ["IBAN", sel.bankIban || "—"]].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-slate-50 pb-2 gap-4">
                      <span className="text-slate-400 shrink-0">{k}</span>
                      <span className="font-medium text-slate-800 text-right break-all">{v}</span>
                    </div>
                  ))}
                  {!sel.bankName && !sel.bankAccount && (
                    <p className="text-xs text-slate-400 p-3 rounded-lg bg-slate-50">No bank details on file. Edit the employee to add them.</p>
                  )}
                </div>
              )}
              {selTab === "Access" && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg" style={{ background: B.darkLight }}>
                    <div className="text-xs font-medium mb-1" style={{ color: B.dark }}>Role</div>
                    <Pill tone={sel.role === "HR Admin" ? "dark" : "slate"}>{sel.role}</Pill>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-400">First login pending</span>
                    <span className="font-medium">{sel.firstLogin ? "Yes" : "No"}</span>
                  </div>
                  {sel.firstLogin && sel.tempPassword && (
                    <div className="p-3 rounded-lg text-xs font-mono bg-amber-50 border border-amber-200 text-amber-800">
                      Temp password: {sel.tempPassword}
                    </div>
                  )}
                  {canResetPersonCredentials(currentUser, sel, roles) && (
                    <Btn size="sm" onClick={() => openReset(sel)}><RefreshCw size={13} />Reset credentials</Btn>
                  )}
                </div>
              )}
              {selTab === "Leave" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {managingSel() ? (
                      <div className="grid grid-cols-1 gap-3">
                        <TextInput label="Annual balance (days)" type="number" value={String(sel.leaveBalance ?? DEFAULT_ANNUAL_LEAVE)}
                          onChange={v => updateSelBalances(Math.max(0, parseInt(v) || 0))} />
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-400">Annual balance</span><span className="font-medium">{sel.leaveBalance ?? DEFAULT_ANNUAL_LEAVE} of {DEFAULT_ANNUAL_LEAVE} days</span></div>
                      </>
                    )}
                  </div>
                  {(readOnly || managingSel()) && (
                    <>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Leave requests</div>
                        {(leaveRequests || []).filter(r => r && r.userId === sel.id).length === 0 ? (
                          <p className="text-xs text-slate-400 p-3 rounded-lg bg-slate-50">No leave requests on file.</p>
                        ) : (
                          <div className="space-y-2">
                            {(leaveRequests || []).filter(r => r && r.userId === sel.id).map(r => (
                              <div key={r.id} className="p-3 rounded-lg border border-slate-100 text-xs flex items-start gap-2">
                                <div className="flex-1">
                                  <div className="font-medium text-slate-800">{r.type} · {r.from} → {r.to} · {r.days} day{r.days !== 1 ? "s" : ""}</div>
                                  {r.note && <div className="text-slate-400 italic mt-0.5">"{r.note}"</div>}
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {(r.payTag === "Unpaid" || leaveUnpaidDays(r) > 0)
                                      ? <Pill tone="red">Unpaid</Pill>
                                      : <Pill tone="green">Paid</Pill>}
                                    {r.status === "pending" && <Pill tone="amber">Pending</Pill>}
                                    {r.status === "approved" && <Pill tone="green">Approved</Pill>}
                                    {r.status === "rejected" && <Pill tone="slate">Rejected</Pill>}
                                  </div>
                                </div>
                                {managingSel() && (
                                  <button onClick={() => deleteLeaveRecord(r.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={13} /></button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Short leave requests</div>
                        {(shortLeaveRequests || []).filter(r => r && r.userId === sel.id).length === 0 ? (
                          <p className="text-xs text-slate-400 p-3 rounded-lg bg-slate-50">No short leave requests on file.</p>
                        ) : (
                          <div className="space-y-2">
                            {(shortLeaveRequests || []).filter(r => r && r.userId === sel.id).map(r => (
                              <div key={r.id} className="p-3 rounded-lg border border-slate-100 text-xs flex items-start gap-2">
                                <div className="flex-1">
                                  <div className="font-medium text-slate-800">{formatDate(r.date)} · {r.fromTime} – {r.toTime} · {r.minutes} min</div>
                                  {r.reason && <div className="text-slate-400 italic mt-0.5">"{r.reason}"</div>}
                                  <div className="mt-1">
                                    {r.status === "pending" && <Pill tone="amber">Pending</Pill>}
                                    {r.status === "approved" && <Pill tone="green">Approved</Pill>}
                                    {r.status === "rejected" && <Pill tone="red">Rejected</Pill>}
                                  </div>
                                </div>
                                {managingSel() && (
                                  <button onClick={() => deleteShortLeaveRecord(r.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={13} /></button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {selTab === "Salary" && readOnly && (
                <div className="space-y-4">
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-400">Listed salary</span>
                    <span className="font-medium text-slate-800">{sel.salary || "—"}</span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Salary slips</div>
                    {payroll.filter(s => s.userId === sel.id).length === 0 ? (
                      <p className="text-xs text-slate-400 p-3 rounded-lg bg-slate-50">No salary slips generated yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {[...payroll.filter(s => s.userId === sel.id)].sort((a, b) => b.month.localeCompare(a.month)).map(s => (
                          <div key={s.id} className="p-3 rounded-lg border border-slate-100 flex items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium text-slate-800">{monthLabel(s.month)}</div>
                              <div className="text-xs text-slate-400">{s.presentDays}/{s.workDays} days present · Net {s.net?.toLocaleString()}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {s.status === "paid" ? <Pill tone="green">Paid</Pill> : <Pill tone="amber">Generated</Pill>}
                              {managingSel() && (
                                <button onClick={() => deletePayrollSlip(s.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete slip"><Trash2 size={13} /></button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {selTab === "Attendance" && readOnly && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                    <div className="font-medium text-slate-700 mb-1">Today's shift · {formatShiftRange(sel)}</div>
                    {(() => {
                      const r = getUserTodayRecord(attendance, sel.id);
                      const ds = dayStatusPill(resolveDayStatus(sel, r, r?.date ?? todayKey(), holidays));
                      return (
                        <div className="flex flex-wrap gap-2 items-center text-slate-600">
                          <span>In {formatTime(r?.checkIn)}</span>
                          <span>· Out {formatTime(r?.checkOut)}</span>
                          <span>· Break {formatDurationMs(calcTotalBreakMs(r))}</span>
                          <span>· Hours {displayWorkingHours(r, sel)}</span>
                          <Pill tone={ds.tone}>{ds.label}</Pill>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <table className="w-full text-xs min-w-[520px]">
                      <thead>
                        <tr className="text-left text-slate-400 bg-slate-50 border-b border-slate-100">
                          {["Date", "In", "Out", "Break", "Hours", "Status", ...(managingSel() ? [""] : [])].map(h => (
                            <th key={h || "actions"} className="px-3 py-2 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(attendance || []).filter(r => r && r.userId === sel.id && r.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).length === 0 ? (
                          <tr><td colSpan={managingSel() ? 7 : 6} className="px-3 py-6 text-center text-slate-400">No attendance records yet.</td></tr>
                        ) : (attendance || []).filter(r => r && r.userId === sel.id && r.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(r => {
                          const ds = dayStatusPill(resolveDayStatus(sel, r, r?.date ?? todayKey(), holidays));
                          return (
                            <tr key={r.id} className="border-b border-slate-50 last:border-0">
                              <td className="px-3 py-2">{formatDate(r.date)}</td>
                              <td className="px-3 py-2 tabular-nums">{formatTime(r.checkIn)}{r.checkIn && isLateCheckIn(r.checkIn, sel, holidays) && <Pill tone="amber">Late</Pill>}</td>
                              <td className="px-3 py-2 tabular-nums">{formatTime(r.checkOut)}{r.autoCheckout && <Pill tone="amber">Auto</Pill>}</td>
                              <td className="px-3 py-2 tabular-nums">{formatDurationMs(calcTotalBreakMs(r))}</td>
                              <td className="px-3 py-2 tabular-nums">{displayWorkingHours(r, sel)}</td>
                              <td className="px-3 py-2"><Pill tone={ds.tone}>{ds.label}</Pill></td>
                              {managingSel() && (
                                <td className="px-3 py-2">
                                  <button onClick={() => deleteAttendanceRecord(r.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete record"><Trash2 size={13} /></button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
