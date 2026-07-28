import React, { useState, useEffect } from "react";
import { LogOut, LogIn, Coffee } from "lucide-react";
import { B } from "../brand.jsx";
import {
  getUserShift,
  getShiftBounds,
  formatShiftRange,
  formatDurationMs,
  formatBreakUsage,
  formatBreakTimer,
  isOnBreak,
  isBreakExceeded,
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
  const [now, setNow] = useState(() => new Date());
  const today = getUserTodayRecord(attendance, user.id);
  const key = todayKey();
  const shift = getUserShift(user, key);
  const bounds = getShiftBounds(user, key);
  const publicHoliday = getPublicHoliday(key, holidays);
  const dayOff = bounds.off || publicHoliday;
  const showManualCheckIn = canManualCheckIn(user, key, leaveRequests, holidays);
  const checkedIn = today?.checkIn && !today?.checkOut;
  const onBreak = isOnBreak(today);
  const daySt = dayStatusPill(resolveDayStatus(user, today, key, holidays, now));
  const breakExceeded = isBreakExceeded(today, shift.breakMinutes, now);
  const showBreakButton = today?.checkIn && !today?.checkOut && !dayOff;
  const checkoutMode = today?.checkIn && !today?.checkOut && today?.lastScan && today.lastScan !== today.checkIn
    ? "lastScan"
    : today?.checkOut
      ? "final"
      : "none";

  useEffect(() => {
    if (!checkedIn) return undefined;
    const intervalMs = onBreak ? 1000 : 30000;
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [checkedIn, onBreak, today?.breakStart]);

  function run(action) {
    setErr("");
    const result = action();
    if (result.error) { setErr(result.error); return; }
    setNow(new Date());
    setAttendance(result.attendance);
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <Card className={compact ? "p-4" : "p-6"}>
        <STitle right={
          <span className="inline-flex items-center gap-1">
            {(isApprovedWfhDay(user.id, key, leaveRequests, holidays, user) || isWfhAttendance(today, user.id, key, leaveRequests, holidays, user)) && <Pill tone="blue">WFH</Pill>}
            {onBreak && <Pill tone="amber">On Break</Pill>}
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
            <b>Your shift today:</b> {formatShiftRange(user, key)} · Grace {shift.graceMinutes}m · Break allowance {shift.breakMinutes}m · Checkout by {formatTime(bounds.checkoutDeadline.toISOString())}
          </div>
        )}
        <ErrBox msg={err} />
        {!dayOff && (
        <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-3 mb-4 text-sm`}>
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-center">
            <div className="text-xs text-emerald-600">Check in</div>
            <div className="font-semibold text-emerald-800 tabular-nums mt-1">{formatTime(today?.checkIn)}</div>
          </div>
          <div className={`p-3 rounded-lg border text-center flex flex-col ${breakExceeded ? "bg-red-50 border-red-100" : onBreak ? "bg-amber-100 border-amber-200" : "bg-amber-50 border-amber-100"}`}>
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              <span className={`text-xs ${breakExceeded ? "text-red-600" : "text-amber-600"}`}>Break</span>
              {onBreak && <Pill tone="amber">On Break</Pill>}
            </div>
            <div className={`font-semibold tabular-nums mt-1 ${breakExceeded ? "text-red-800" : "text-amber-800"}`}>
              {today?.checkIn ? formatBreakUsage(today, shift.breakMinutes, now) : "—"}
            </div>
            {onBreak && (
              <div className="text-xl font-bold tabular-nums text-amber-700 mt-1 tracking-tight">
                {formatBreakTimer(today.breakStart, now)}
              </div>
            )}
            {breakExceeded && !onBreak && today?.checkIn && (
              <div className="text-[10px] text-red-600 mt-0.5">Over allowance</div>
            )}
            {showBreakButton && (
              <Btn
                size="sm"
                variant={onBreak ? "accent" : "primary"}
                className="w-full mt-2 justify-center"
                onClick={() => run(() =>
                  onBreak
                    ? performBreakEnd(attendance, user.id, user, new Date(), holidays)
                    : performBreakStart(attendance, user.id, user)
                )}
              >
                <Coffee size={13} />{onBreak ? "End Break" : "Start Break"}
              </Btn>
            )}
          </div>
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-center">
            <div className="text-xs text-blue-600">{checkoutMode === "lastScan" ? "Last scan" : "Check out"}</div>
            <div className="font-semibold text-blue-800 tabular-nums mt-1">
              {checkoutMode === "lastScan"
                ? formatTime(today?.lastScan)
                : formatTime(today?.checkOut)}
              {checkoutMode === "final" && today?.autoCheckout && (
                <span className="block text-[10px] text-blue-500 mt-0.5">Auto</span>
              )}
            </div>
            {checkoutMode === "lastScan" && today?.lastScanMethod && (
              <div className="text-[10px] text-blue-500 mt-0.5">{today.lastScanMethod}</div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
            <div className="text-xs text-slate-500">Working hours</div>
            <div className="font-semibold tabular-nums mt-1" style={{ color: B.dark }}>{displayWorkingHours(today, user, now)}</div>
            {checkedIn && !today?.checkOut && <div className="text-[10px] text-slate-400 mt-0.5">Excludes break</div>}
          </div>
        </div>
        )}

        {!dayOff && showManualCheckIn && !today?.checkOut && (
          <div className="flex flex-wrap gap-2 justify-center mb-3">
            {!checkedIn && (
              <Btn onClick={() => run(() => performCheckIn(attendance, user.id, user, new Date(), holidays, leaveRequests))}>
                <LogIn size={14} />Check in
              </Btn>
            )}
            {checkedIn && !onBreak && (
              <Btn onClick={() => run(() => performCheckOut(attendance, user.id, user, new Date(), holidays))} variant="danger">
                <LogOut size={14} />Check out
              </Btn>
            )}
          </div>
        )}

        {!dayOff && !showManualCheckIn && !today?.checkIn && (
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

        {!dayOff && ((today?.breaks || []).length > 0 || onBreak) && (
          <div className="text-xs text-slate-500 space-y-1 mb-2">
            <b>Breaks today ({(today?.breaks || []).length + (onBreak ? 1 : 0)}):</b>
            {(today?.breaks || []).map((b, i) => (
              <div key={i} className="flex justify-between p-2 rounded bg-white border border-slate-100 tabular-nums">
                <span>{formatTime(b.start)} – {formatTime(b.end)}</span>
                <span className="text-slate-400">{formatDurationMs(new Date(b.end) - new Date(b.start))}</span>
              </div>
            ))}
            {onBreak && (
              <div className="flex justify-between p-2 rounded bg-amber-50 border border-amber-100 tabular-nums">
                <span>{formatTime(today.breakStart)} – now</span>
                <span className="text-amber-600 font-medium">{formatBreakTimer(today.breakStart, now)}</span>
              </div>
            )}
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
