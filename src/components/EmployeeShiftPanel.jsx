import React, { useState } from "react";
import { LogOut, LogIn, Coffee } from "lucide-react";
import { B } from "../brand.jsx";
import {
  getUserShift,
  getShiftBounds,
  formatShiftRange,
  formatDurationMs,
  calcTotalBreakMs,
  resolveDayStatus,
  dayStatusPill,
  performCheckIn,
  performCheckOut,
  performBreakStart,
  performBreakEnd,
  displayWorkingHours,
  todayKey,
  getPublicHoliday,
  formatTime,
  getUserTodayRecord,
  canManualCheckIn,
  isApprovedWfhDay,
  isWfhAttendance,
} from "../utils.js";
import { Pill, Card, STitle, Btn, ErrBox } from "./ui.jsx";

export function EmployeeShiftPanel({ user, attendance, setAttendance, holidays = [], leaveRequests = [], compact = false }) {
  const [err, setErr] = useState("");
  const today = getUserTodayRecord(attendance, user.id);
  const key = todayKey();
  const shift = getUserShift(user, key);
  const bounds = getShiftBounds(user, key);
  const publicHoliday = getPublicHoliday(key, holidays);
  const dayOff = bounds.off || publicHoliday;
  const showManualActions = canManualCheckIn(user, key, leaveRequests, holidays);
  const checkedIn = today?.checkIn && !today?.checkOut;
  const onBreak = today?.breakStart && !today?.breakEnd;
  const daySt = dayStatusPill(resolveDayStatus(user, today, key, holidays));
  const breakMs = calcTotalBreakMs(today);

  function run(action) {
    setErr("");
    const result = action();
    if (result.error) { setErr(result.error); return; }
    setAttendance(result.attendance);
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <Card className={compact ? "p-4" : "p-6"}>
        <STitle right={
          <span className="inline-flex items-center gap-1">
            {(isApprovedWfhDay(user.id, key, leaveRequests, holidays, user) || isWfhAttendance(today, user.id, key, leaveRequests, holidays, user)) && <Pill tone="blue">WFH</Pill>}
            <Pill tone={daySt.tone}>{daySt.label}</Pill>
          </span>
        }>
          {compact ? "Today's attendance" : "Shift attendance"}
        </STitle>
        {bounds.off ? (
          <div className="mb-4 p-3 rounded-lg text-sm bg-blue-50 border border-blue-100 text-blue-800">
            Today is off in your assigned shift — check-in is not available.
          </div>
        ) : publicHoliday ? (
          <div className="mb-4 p-3 rounded-lg text-sm bg-blue-50 border border-blue-100 text-blue-800">
            Public Holiday — {publicHoliday.title}. Check-in is not available today.
          </div>
        ) : (
          <div className="text-xs text-slate-500 mb-4 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <b>Your shift today:</b> {formatShiftRange(user, key)} · Grace {shift.graceMinutes}m · Break {shift.breakMinutes}m · Checkout by {formatTime(bounds.checkoutDeadline.toISOString())}
          </div>
        )}
        <ErrBox msg={err} />
        {!dayOff && (
        <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-3 mb-4 text-sm`}>
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-center">
            <div className="text-xs text-emerald-600">Check in</div>
            <div className="font-semibold text-emerald-800 tabular-nums mt-1">{formatTime(today?.checkIn)}</div>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-center">
            <div className="text-xs text-blue-600">Check out</div>
            <div className="font-semibold text-blue-800 tabular-nums mt-1">
              {formatTime(today?.checkOut)}
              {today?.autoCheckout && <span className="block text-[10px] text-blue-500 mt-0.5">Auto</span>}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-center">
            <div className="text-xs text-amber-600">Break</div>
            <div className="font-semibold text-amber-800 tabular-nums mt-1">{formatDurationMs(breakMs)}</div>
            <div className="text-[10px] text-amber-600">of {shift.breakMinutes}m</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
            <div className="text-xs text-slate-500">Working hours</div>
            <div className="font-semibold tabular-nums mt-1" style={{ color: B.dark }}>{displayWorkingHours(today, user)}</div>
          </div>
        </div>
        )}

        {!dayOff && showManualActions && !today?.checkOut && (
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {!checkedIn && (
              <Btn onClick={() => run(() => performCheckIn(attendance, user.id, user, new Date(), holidays, leaveRequests))}>
                <LogIn size={14} />Check in
              </Btn>
            )}
            {checkedIn && !onBreak && (
              <Btn onClick={() => run(() => performCheckOut(attendance, user.id, user))} variant="danger">
                <LogOut size={14} />Check out
              </Btn>
            )}
            {checkedIn && (
              onBreak ? (
                <Btn onClick={() => run(() => performBreakEnd(attendance, user.id, user))} variant="ghost">
                  <Coffee size={14} />End break
                </Btn>
              ) : (
                <Btn onClick={() => run(() => performBreakStart(attendance, user.id, user))} variant="ghost">
                  <Coffee size={14} />Start break
                </Btn>
              )
            )}
          </div>
        )}
        {!dayOff && !showManualActions && !today?.checkIn && (
          <p className="text-xs text-center text-slate-400 mb-4">Use the office biometric device to check in, or submit a Work from Home request for approved WFH days.</p>
        )}

        {!dayOff && today?.shortLeaves?.filter(sl => sl.status === "approved").length > 0 && (
          <div className="text-xs text-slate-500 space-y-1 mb-2">
            <b>Approved short leave today:</b>
            {today.shortLeaves.filter(sl => sl.status === "approved").map(sl => (
              <div key={sl.id} className="flex justify-between p-2 rounded bg-white border border-slate-100">
                <span>{formatTime(sl.start)} – {formatTime(sl.end)}</span>
                <span className="text-slate-400">{sl.reason || "—"}</span>
              </div>
            ))}
          </div>
        )}

        {!dayOff && today?.checkOut && (
          <div className="text-sm text-center text-slate-500 mt-2">
            Shift complete · <b>{displayWorkingHours(today, user)}</b> net working time
            {today.autoCheckout && <span className="text-amber-600"> · Auto checkout applied</span>}
          </div>
        )}
      </Card>
    </div>
  );
}
