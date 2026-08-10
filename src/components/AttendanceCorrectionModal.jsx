import React, { useEffect, useState } from "react";
import {
  applyAttendanceCorrection,
  clearAttendanceCorrection,
  canCorrectAttendance,
  formatCorrectionChangeSummary,
  formatDate,
  timeInputFromIso,
  normalizeTimeTo24Hour,
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
  const [busy, setBusy] = useState(false);

  const user = target?.user;
  const record = target?.record;
  const dateKey = target?.dateKey;
  const canEdit = canCorrectAttendance(currentUser, record);
  const isCorrected = !!(record?.manuallyCorrected);

  useEffect(() => {
    if (!open || !target) return;
    setCheckInTime(normalizeTimeTo24Hour(timeInputFromIso(record?.checkIn)));
    setCheckOutTime(normalizeTimeTo24Hour(timeInputFromIso(record?.checkOut)));
    setReason("");
    setErr("");
    setBusy(false);
  }, [open, target, record?.checkIn, record?.checkOut]);

  if (!open || !target || !user) return null;

  function onCheckInChange(v) {
    setCheckInTime(normalizeTimeTo24Hour(v) || v);
  }

  function onCheckOutChange(v) {
    setCheckOutTime(normalizeTimeTo24Hour(v) || v);
  }

  async function save() {
    if (!canEdit || busy) return;
    setErr("");
    const result = applyAttendanceCorrection(
      attendance,
      user.id,
      dateKey,
      user,
      currentUser,
      {
        checkInTime: normalizeTimeTo24Hour(checkInTime),
        checkOutTime: normalizeTimeTo24Hour(checkOutTime),
        reason,
      },
      holidays,
    );
    if (result.error) {
      setErr(result.error);
      return;
    }
    setBusy(true);
    try {
      const updated = result.attendance.find(r => r && r.userId === user.id && r.date === dateKey);
      if (persistAttendance && updated) {
        await persistAttendance(updated);
      }
      setAttendance(result.attendance);
      onClose();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCorrection() {
    if (!canEdit || busy || !isCorrected) return;
    if (!window.confirm(
      "Delete this manual correction and restore the original biometric check-in/check-out times?"
    )) return;
    setErr("");
    const result = clearAttendanceCorrection(
      attendance,
      user.id,
      dateKey,
      user,
      holidays,
    );
    if (result.error) {
      setErr(result.error);
      return;
    }
    setBusy(true);
    try {
      const updated = result.attendance.find(r => r && r.userId === user.id && r.date === dateKey);
      if (persistAttendance && updated) {
        await persistAttendance(updated);
      }
      setAttendance(result.attendance);
      onClose();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Manual attendance correction" wide>
      <div className="p-5 space-y-4">
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
              onChange={e => onCheckInChange(e.target.value)}
              disabled={!canEdit || busy}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Check-out time</label>
            <input
              type="time"
              value={checkOutTime}
              onChange={e => onCheckOutChange(e.target.value)}
              disabled={!canEdit || busy}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 disabled:bg-slate-100"
            />
            <p className="text-[11px] text-slate-400 mt-1">12:00 AM = midnight (00:00). Overnight 12:00 AM–5:00 AM is saved as next morning.</p>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Reason for correction <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            disabled={!canEdit || busy}
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
                    {entry.by} ({entry.byRole || "Admin"}) · {new Date(entry.at).toLocaleString()}
                  </div>
                  <div className="italic mt-0.5">"{entry.reason}"</div>
                  <div className="text-slate-500 mt-0.5">{formatCorrectionChangeSummary(entry.changes)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <ErrBox msg={err} />
        <div className="flex justify-between gap-2 pt-2 flex-wrap">
          <div>
            {canEdit && isCorrected && (
              <Btn variant="danger" onClick={deleteCorrection} disabled={busy}>
                {busy ? "Working…" : "Delete correction"}
              </Btn>
            )}
          </div>
          <div className="flex gap-2 ml-auto">
            <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
            {canEdit && <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save correction"}</Btn>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
