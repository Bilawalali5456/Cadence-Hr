import React from "react";
import { Clock, User, Shield, Phone, Mail, Landmark } from "lucide-react";
import { SHIFT_WEEKDAYS, SHIFT_DAY_LABELS, formatCnicInput } from "../utils.js";
import { TextInput, SelectInput, ErrBox } from "./ui.jsx";

export function EmployeeForm({ form, setForm, ferr, lockRole = false }) {
  return (
    <div className="space-y-3">
      <ErrBox msg={ferr} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Full name"  value={form.name}   onChange={v => setForm({ ...form, name: v })}   required Icon={User} />
        <TextInput label="Work email" type="email" value={form.email}  onChange={v => setForm({ ...form, email: v })}  required Icon={Mail} />
        <TextInput label="Phone"      value={form.phone}  onChange={v => setForm({ ...form, phone: v })}  Icon={Phone} />
        <TextInput label="CNIC" value={form.cnic || ""} onChange={v => setForm({ ...form, cnic: formatCnicInput(v) })} required Icon={Shield} placeholder="12345-1234567-1" />
        <TextInput label="Job title"  value={form.title}  onChange={v => setForm({ ...form, title: v })} />
        <TextInput label="Department" value={form.dept}   onChange={v => setForm({ ...form, dept: v })}  placeholder="e.g. Sales" />
        <TextInput label="Team"       value={form.team}   onChange={v => setForm({ ...form, team: v })}  placeholder="e.g. North" />
        {lockRole ? (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
            <div className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700">HR Admin</div>
          </div>
        ) : (
          <SelectInput label="Role" value={form.role} onChange={v => setForm({ ...form, role: v })}
            options={[{ value: "Employee", label: "Employee" }, { value: "Manager", label: "Manager" }]} />
        )}
        <SelectInput label="Employment type" value={form.type} onChange={v => setForm({ ...form, type: v })}
          options={[{ value: "Full-time", label: "Full-time" }, { value: "Part-time", label: "Part-time" }, { value: "Contractor", label: "Contractor" }]} />
        <TextInput label="Hire date" type="date" value={form.hired} onChange={v => setForm({ ...form, hired: v })} />
        <TextInput label="Salary"    value={form.salary}  onChange={v => setForm({ ...form, salary: v })}  placeholder="e.g. 80,000 PKR" />
        <SelectInput label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })}
          options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive (blocked)" }]} />
        <SelectInput label="Work mode" value={form.workMode || "office"} onChange={v => setForm({ ...form, workMode: v })}
          options={[{ value: "office", label: "Office (biometric)" }, { value: "wfh", label: "Work from Home (manual check-in)" }]} />
        <SelectInput label="Marital status" value={form.maritalStatus || ""} onChange={v => setForm({ ...form, maritalStatus: v })}
          options={[{ value: "", label: "Select…" }, { value: "Married", label: "Married" }, { value: "Unmarried", label: "Unmarried" }]} />
      </div>
      <div className="pt-2 border-t border-slate-100">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Phone size={13} />Emergency contact
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Guardian name" value={form.guardianName || ""} onChange={v => setForm({ ...form, guardianName: v })} placeholder="e.g. Father / Mother" />
          <TextInput label="Emergency contact name" value={form.emergencyContactName || ""} onChange={v => setForm({ ...form, emergencyContactName: v })} Icon={User} />
          <TextInput label="Emergency contact number" value={form.emergencyContactPhone || ""} onChange={v => setForm({ ...form, emergencyContactPhone: v })} Icon={Phone} placeholder="+92-300-0000000" />
          <TextInput label="Relationship with emergency contact" value={form.emergencyContactRelation || ""} onChange={v => setForm({ ...form, emergencyContactRelation: v })} placeholder="e.g. Spouse, Parent, Sibling" />
        </div>
      </div>
      <div className="pt-2 border-t border-slate-100">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Clock size={13} />Official duty schedule
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <TextInput label="Late grace (minutes)" type="number" value={String(form.graceMinutes ?? 15)} onChange={v => setForm({ ...form, graceMinutes: parseInt(v) || 0 })} />
          <TextInput label="Break duration (minutes)" type="number" value={String(form.breakMinutes ?? 60)} onChange={v => setForm({ ...form, breakMinutes: parseInt(v) || 0 })} />
          <TextInput label="Checkout grace (minutes)" type="number" value={String(form.checkoutGraceMinutes ?? 10)} onChange={v => setForm({ ...form, checkoutGraceMinutes: parseInt(v) || 0 })} />
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 font-medium">Off</th>
                <th className="px-3 py-2 font-medium">Start</th>
                <th className="px-3 py-2 font-medium">End</th>
              </tr>
            </thead>
            <tbody>
              {SHIFT_WEEKDAYS.map(day => {
                const row = form.weeklySchedule?.[day] || { off: false, shiftStart: "09:00", shiftEnd: "18:00" };
                return (
                  <tr key={day} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-700">{SHIFT_DAY_LABELS[day]}</td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!!row.off}
                        onChange={e => setForm({
                          ...form,
                          weeklySchedule: {
                            ...(form.weeklySchedule || {}),
                            [day]: { ...row, off: e.target.checked },
                          },
                        })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="time"
                        disabled={!!row.off}
                        value={row.shiftStart || "09:00"}
                        onChange={e => setForm({
                          ...form,
                          weeklySchedule: {
                            ...(form.weeklySchedule || {}),
                            [day]: { ...row, shiftStart: e.target.value },
                          },
                        })}
                        className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5 disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="time"
                        disabled={!!row.off}
                        value={row.shiftEnd || "18:00"}
                        onChange={e => setForm({
                          ...form,
                          weeklySchedule: {
                            ...(form.weeklySchedule || {}),
                            [day]: { ...row, shiftEnd: e.target.value },
                          },
                        })}
                        className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5 disabled:bg-slate-100"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-2">Set separate timings for each weekday (Mon–Fri). Saturday and Sunday are always treated as off. Mark a weekday Off to exclude it from Late, Early Leave, Short Hours, and Absent calculations.</p>
        {(form.workMode || "office") === "office" && (
          <label className="flex items-center gap-2 mt-3 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.manualCheckInEnabled}
              onChange={e => setForm({ ...form, manualCheckInEnabled: e.target.checked })}
            />
            Allow manual check-in (override for office employees who cannot use the biometric device today)
          </label>
        )}
      </div>
      <div className="pt-2 border-t border-slate-100">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Landmark size={13} />Bank details
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Bank name"      value={form.bankName    || ""} onChange={v => setForm({ ...form, bankName: v })}     placeholder="e.g. HBL" />
          <TextInput label="Branch"         value={form.bankBranch  || ""} onChange={v => setForm({ ...form, bankBranch: v })}   placeholder="e.g. Gulberg" />
          <TextInput label="Account number" value={form.bankAccount || ""} onChange={v => setForm({ ...form, bankAccount: v })}  placeholder="e.g. 1234567890" />
          <TextInput label="IBAN"           value={form.bankIban    || ""} onChange={v => setForm({ ...form, bankIban: v })}     placeholder="PK00XXXX..." />
        </div>
      </div>
    </div>
  );
}
