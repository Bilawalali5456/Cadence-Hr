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
  isWeekendDate,
  formatTime,
  getUserTodayRecord,
} from "../utils.js";
import { Pill, Card, STitle, Btn, ErrBox } from "./ui.jsx";

export function EmployeeShiftPanel({ user, attendance, setAttendance, compact = false }) {
  const [err, setErr] = useState("");
  const today = getUserTodayRecord(attendance, user.id);
  const shift = getUserShift(user);
  const bounds = getShiftBounds(user, todayKey());
  const weekendOff = isWeekendDate(todayKey());
  const checkedIn = today?.checkIn && !today?.checkOut;
  const onBreak = today?.breakStart && !today?.breakEnd;
  const daySt = dayStatusPill(resolveDayStatus(user, today));
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
        <STitle right={<Pill tone={daySt.tone}>{daySt.label}</Pill>}>
          {compact ? "Today's attendance" : "Shift attendance"}
        </STitle>
        {weekendOff ? (
          <div className="mb-4 p-3 rounded-lg text-sm bg-blue-50 border border-blue-100 text-blue-800">
            Today is a weekend off. Saturday and Sunday are company holidays — check-in is not available.
          </div>
        ) : (
          <div className="text-xs text-slate-500 mb-4 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <b>Your shift:</b> {formatShiftRange(user)} · Grace {shift.graceMinutes}m · Break {shift.breakMinutes}m · Checkout by {formatTime(bounds.checkoutDeadline.toISOString())}
          </div>
        )}
        <ErrBox msg={err} />
        {!weekendOff && (
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

        {!weekendOff && !today?.checkOut && (
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {!checkedIn && (
              <Btn onClick={() => run(() => performCheckIn(attendance, user.id, user))}>
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

        {!weekendOff && today?.shortLeaves?.filter(sl => sl.status === "approved").length > 0 && (
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

        {!weekendOff && today?.checkOut && (
          <div className="text-sm text-center text-slate-500 mt-2">
            Shift complete · <b>{displayWorkingHours(today, user)}</b> net working time
            {today.autoCheckout && <span className="text-amber-600"> · Auto checkout applied</span>}
          </div>
        )}
      </Card>
    </div>
  );
}
