import React, { useEffect, useState } from "react";
import {
  applyAttendanceCorrection,
  canCorrectAttendance,
  formatCorrectionChangeSummary,
  formatDate,
  timeInputFromIso,
  wasCorrectedByExecutive,
} from "../utils.js";
import { Modal, Btn, ErrBox } from "./ui.jsx";

export function AttendanceCorrectionModal({
  open,
  onClose,
  target,
  currentUser,
  attendance,
  setAttendance,
  holidays = [],
  persistAttendance,
}) {
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");

  const user = target?.user;
  const record = target?.record;
  const dateKey = target?.dateKey;
  const canEdit = canCorrectAttendance(currentUser, record);

  useEffect(() => {
    if (!open || !target) return;
    setCheckInTime(timeInputFromIso(record?.checkIn));
    setCheckOutTime(timeInputFromIso(record?.checkOut));
    setReason("");
    setErr("");
  }, [open, target, record?.checkIn, record?.checkOut]);

  if (!open || !target || !user) return null;

  async function save() {
    setErr("");
    const result = applyAttendanceCorrection(
      attendance,
      user.id,
      dateKey,
      user,
      currentUser,
      { checkInTime, checkOutTime, reason },
      holidays,
    );
    if (result.error) {
      setErr(result.error);
      return;
    }
    try {
      const updated = result.attendance.find(r => r && r.userId === user.id && r.date === dateKey);
      if (persistAttendance && updated) {
        await persistAttendance(updated);
      }
      setAttendance(result.attendance);
      onClose();
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Manual attendance correction" wide>
      <div className="p-5 space-y-4">
        {!canEdit && (
          <div className="p-3 rounded-lg text-sm bg-amber-50 border border-amber-200 text-amber-800">
            This record was corrected by an Executive. Only an Executive can edit it further.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Employee</label>
            <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800">{user.name}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
            <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800">{formatDate(dateKey)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Check-in time</label>
            <input
              type="time"
              value={checkInTime}
              onChange={e => setCheckInTime(e.target.value)}
              disabled={!canEdit}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Check-out time</label>
            <input
              type="time"
              value={checkOutTime}
              onChange={e => setCheckOutTime(e.target.value)}
              disabled={!canEdit}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 disabled:bg-slate-100"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Reason for correction <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            disabled={!canEdit}
            rows={3}
            placeholder='e.g. "Employee forgot to scan checkout"'
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 resize-none disabled:bg-slate-100"
          />
        </div>
        {record?.correctionLog?.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-600 mb-2">Correction history</div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {[...(record.correctionLog || [])].reverse().map(entry => (
                <div key={entry.id} className="text-xs text-slate-600 border-b border-slate-200/80 pb-2 last:border-0 last:pb-0">
                  <div className="font-medium text-slate-800">
                    {entry.by} ({entry.byRole === "Executive" ? "Executive" : "Admin"}) · {new Date(entry.at).toLocaleString()}
                  </div>
                  <div className="italic mt-0.5">"{entry.reason}"</div>
                  <div className="text-slate-500 mt-0.5">{formatCorrectionChangeSummary(entry.changes)}</div>
                </div>
              ))}
            </div>
            {wasCorrectedByExecutive(record) && (
              <p className="text-xs text-amber-700 mt-2">Locked for Admin — last correction by Executive.</p>
            )}
          </div>
        )}
        <ErrBox msg={err} />
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          {canEdit && <Btn onClick={save}>Save correction</Btn>}
        </div>
      </div>
    </Modal>
  );
}
