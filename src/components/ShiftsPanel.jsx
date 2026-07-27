import React, { useState } from "react";
import { Clock, Plus, Edit2, Trash2, Save } from "lucide-react";
import {
  SHIFT_WEEKDAYS,
  SHIFT_DAY_LABELS,
  DEFAULT_SHIFT,
  DEFAULT_WEEKLY_SCHEDULE,
  createBlankShiftTemplate,
  normalizeWeeklySchedule,
} from "../utils.js";
import { Card, Modal, TextInput, Btn, ErrBox, Pill } from "./ui.jsx";

function shiftSummaryLine(shift) {
  const cfg = {
    shiftStart: "09:00",
    shiftEnd: "18:00",
    weeklySchedule: normalizeWeeklySchedule(shift),
  };
  const parts = SHIFT_WEEKDAYS.map(day => {
    const row = cfg.weeklySchedule[day];
    if (row?.off) return null;
    return `${SHIFT_DAY_LABELS[day].slice(0, 3)} ${row.shiftStart}–${row.shiftEnd}`;
  }).filter(Boolean);
  return parts.length ? parts.join(" · ") : "No working days configured";
}

export function ShiftsPanel({ shifts, setShifts, users = [] }) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [ferr, setFerr] = useState("");
  const [form, setForm] = useState(createBlankShiftTemplate());

  function openAdd() {
    setEditId(null);
    setForm(createBlankShiftTemplate());
    setFerr("");
    setOpen(true);
  }

  function openEdit(shift) {
    setEditId(shift.id);
    setForm({
      ...shift,
      weeklySchedule: normalizeWeeklySchedule(shift),
    });
    setFerr("");
    setOpen(true);
  }

  function saveShift() {
    if (!form.name?.trim()) {
      setFerr("Shift name is required.");
      return;
    }
    const weeklySchedule = normalizeWeeklySchedule({ weeklySchedule: form.weeklySchedule });
    const hasWorkDay = SHIFT_WEEKDAYS.some(day => !weeklySchedule[day]?.off);
    if (!hasWorkDay) {
      setFerr("At least one weekday (Mon–Fri) must be a working day.");
      return;
    }
    const payload = {
      ...form,
      name: form.name.trim(),
      graceMinutes: parseInt(form.graceMinutes, 10) || 0,
      breakMinutes: parseInt(form.breakMinutes, 10) || 0,
      checkoutGraceMinutes: parseInt(form.checkoutGraceMinutes, 10) ?? DEFAULT_SHIFT.checkoutGraceMinutes,
      weeklySchedule,
    };
    setShifts(prev => {
      let next = editId
        ? prev.map(s => (s.id === editId ? { ...payload, id: editId } : s))
        : [...prev, payload];
      if (payload.isDefault) {
        next = next.map(s => ({ ...s, isDefault: s.id === payload.id }));
      }
      return next;
    });
    setOpen(false);
  }

  function deleteShift(id) {
    const inUse = (users || []).some(u => u.shiftId === id);
    if (inUse) {
      window.alert("This shift is assigned to one or more employees. Reassign them before deleting.");
      return;
    }
    const target = (shifts || []).find(s => s.id === id);
    if (target?.isDefault) {
      window.alert("Cannot delete the default shift. Set another shift as default first.");
      return;
    }
    if (!window.confirm("Delete this shift?")) return;
    setShifts(prev => prev.filter(s => s.id !== id));
  }

  function setDefault(id) {
    setShifts(prev => prev.map(s => ({ ...s, isDefault: s.id === id })));
  }

  const list = [...(shifts || [])].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Define reusable work shifts with day-wise timings (Mon–Fri). Saturday and Sunday are always off. Assign shifts to employees from People.
        </p>
        <Btn onClick={openAdd}><Plus size={14} />New shift</Btn>
      </div>

      {list.length === 0 ? (
        <Card className="p-8 text-center text-slate-400 text-sm">No shifts configured yet.</Card>
      ) : (
        <div className="grid gap-3">
          {list.map(shift => (
            <Card key={shift.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-800">{shift.name}</span>
                    {shift.isDefault && <Pill tone="blue">Default</Pill>}
                  </div>
                  <p className="text-xs text-slate-500 mb-2">{shiftSummaryLine(shift)}</p>
                  <div className="text-xs text-slate-400">
                    Grace {shift.graceMinutes ?? 15}m · Break {shift.breakMinutes ?? 60}m
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!shift.isDefault && (
                    <button type="button" onClick={() => setDefault(shift.id)} className="px-2 py-1 text-xs rounded-lg hover:bg-slate-100 text-slate-500" title="Set as default">
                      Default
                    </button>
                  )}
                  <button type="button" onClick={() => openEdit(shift)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400" title="Edit"><Edit2 size={15} /></button>
                  <button type="button" onClick={() => deleteShift(shift.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={15} /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? "Edit shift" : "New shift"} wide>
        <div className="space-y-3">
          <ErrBox msg={ferr} />
          <TextInput label="Shift name" value={form.name} onChange={v => setForm({ ...form, name: v })} required placeholder="e.g. Sales · Fri late" />
          <div className="grid grid-cols-3 gap-3">
            <TextInput label="Grace period (minutes)" type="number" value={String(form.graceMinutes ?? 15)} onChange={v => setForm({ ...form, graceMinutes: parseInt(v, 10) || 0 })} />
            <TextInput label="Break duration (minutes)" type="number" value={String(form.breakMinutes ?? 60)} onChange={v => setForm({ ...form, breakMinutes: parseInt(v, 10) || 0 })} />
            <TextInput label="Checkout grace (minutes)" type="number" value={String(form.checkoutGraceMinutes ?? 10)} onChange={v => setForm({ ...form, checkoutGraceMinutes: parseInt(v, 10) || 0 })} />
          </div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Clock size={13} />Day-wise schedule (Mon–Fri)
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
                  const row = form.weeklySchedule?.[day] || DEFAULT_WEEKLY_SCHEDULE[day];
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
          <p className="text-xs text-slate-400">Each weekday can have different hours. Saturday and Sunday are always off for every shift.</p>
          {!editId && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={!!form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })} />
              Set as default shift for new employees
            </label>
          )}
          <div className="flex gap-2">
            <Btn onClick={saveShift}><Save size={14} />{editId ? "Save shift" : "Create shift"}</Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
