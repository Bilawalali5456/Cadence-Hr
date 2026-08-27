import React, { useEffect, useState } from "react";
import {
  applyAttendanceCorrection,
  clearAttendanceCorrection,
  canCorrectAttendance,
  formatCorrectionChangeSummary,
  formatDate,
  timeInputFromIso,
  normalizeTimeTo24Hour,
  isApprovedWfhDay,
} from "../utils.js";
import { Modal, Btn, ErrBox } from "./ui.jsx";

/** Approved WFH leave covering dateKey (from/to or from_date/to_date). */
function hasApprovedWfhLeave(leaveRequests, userId, dateKey) {
  const key = String(dateKey || "").slice(0, 10);
  if (!userId || !key) return false;
  return (leaveRequests || []).some(r => {
    if (!r || r.userId !== userId || r.type !== "WFH" || r.status !== "approved") return false;
    const from = String(r.from || r.from_date || "").slice(0, 10);
    const to = String(r.to || r.to_date || "").slice(0, 10);
    return from && to && from <= key && key <= to;
  });
}

export function AttendanceCorrectionModal({
  open,
  onClose,
  target,
  currentUser,
  attendance,
  setAttendance,
  holidays = [],
  leaveRequests = [],
  persistAttendance,
}) {
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [reason, setReason] = useState("");
  const [markAsWfh, setMarkAsWfh] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const user = target?.user;
  const record = target?.record;
  const dateKey = target?.dateKey;
  const canEdit = canCorrectAttendance(currentUser, record);
  const isCorrected = !!(record?.manuallyCorrected);
  const approvedWfh = !!(user && dateKey && (
    hasApprovedWfhLeave(leaveRequests, user.id, dateKey)
    || isApprovedWfhDay(user.id, dateKey, leaveRequests, holidays, user)
  ));

  useEffect(() => {
    if (!open || !target) return;
    setCheckInTime(normalizeTimeTo24Hour(timeInputFromIso(record?.checkIn)));
    setCheckOutTime(normalizeTimeTo24Hour(timeInputFromIso(record?.checkOut)));
    setReason("");
    setMarkAsWfh(approvedWfh || record?.source === "wfh");
    setErr("");
    setBusy(false);
  }, [open, target, record?.checkIn, record?.checkOut, record?.source, approvedWfh]);

  if (!open || !target || !user) return null;

  function onCheckInChange(v) {
    setCheckInTime(normalizeTimeTo24Hour(v) || v);
  }

  function onCheckOutChange(v) {
    setCheckOutTime(normalizeTimeTo24Hour(v) || v);
  }

  async function save(e) {
    e?.preventDefault?.();
    if (busy) return;
    if (!canEdit) {
      setErr("You do not have permission to correct attendance.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const in24 = normalizeTimeTo24Hour(checkInTime);
      const out24 = normalizeTimeTo24Hour(checkOutTime);
      const result = applyAttendanceCorrection(
        attendance,
        user.id,
        dateKey,
        user,
        currentUser,
        {
          checkInTime: in24,
          checkOutTime: out24,
          reason,
          markAsWfh,
        },
        holidays,
      );
      if (result.error) {
        setErr(result.error);
        return;
      }
      const updated = result.record
        || result.attendance.find(r => r && r.userId === user.id && r.date === dateKey);
      if (!updated) {
        setErr("Could not build the corrected attendance record.");
        return;
      }
      if (persistAttendance) {
        await persistAttendance(updated);
      }
      setAttendance(result.attendance);
      onClose();
    } catch (e) {
      console.error("[attendance-correction] save failed", e);
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCorrection(e) {
    e?.preventDefault?.();
    if (busy || !isCorrected) return;
    if (!canEdit) {
      setErr("You do not have permission to delete this correction.");
      return;
    }
    if (!window.confirm(
      "Delete this manual correction and restore the original biometric check-in/check-out times?"
    )) return;
    setErr("");
    setBusy(true);
    try {
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
      const updated = result.record
        || result.attendance.find(r => r && r.userId === user.id && r.date === dateKey);
      if (!updated) {
        setErr("Could not restore the attendance record.");
        return;
      }
      if (persistAttendance) {
        await persistAttendance(updated);
      }
      setAttendance(result.attendance);
      onClose();
    } catch (e) {
      console.error("[attendance-correction] delete failed", e);
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Manual attendance correction" wide>
      <form
        className="p-5 space-y-4"
        onSubmit={save}
        noValidate
      >
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
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={markAsWfh}
            onChange={e => setMarkAsWfh(e.target.checked)}
            disabled={!canEdit || busy}
            className="mt-0.5 rounded border-slate-300"
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">Mark as WFH day</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              {approvedWfh
                ? "Approved WFH leave found for this date — attendance will be tagged as WFH."
                : "No approved WFH leave for this date. You can still mark this attendance as WFH."}
            </span>
          </span>
        </label>
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
              <Btn type="button" variant="danger" onClick={deleteCorrection} disabled={busy}>
                {busy ? "Working…" : "Delete correction"}
              </Btn>
            )}
          </div>
          <div className="flex gap-2 ml-auto">
            <Btn type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
            {canEdit && (
              <Btn type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save correction"}
              </Btn>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
