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
  isAttendanceInProgress,
  resolveDayStatus,
  dayStatusPill,
  displayWorkingHours,
  todayKey,
  getPublicHoliday,
  formatTime,
  getUserTodayRecord,
  canManualCheckIn,
  isApprovedWfhDay,
  isWfhAttendance,
  isHrEmployeeRole,
} from "../utils.js";
import { apiStartBreak, apiEndBreak, apiBreakStatus, apiWfhCheckin, apiWfhCheckout } from "../api.js";
import { Pill, Card, STitle, Btn, ErrBox } from "./ui.jsx";

function upsertAttendanceRecord(list, record) {
  if (!record?.id) return list || [];
  const arr = list || [];
  const idx = arr.findIndex(r => r?.id === record.id || (r?.userId === record.userId && r?.date === record.date));
  if (idx >= 0) {
    const next = [...arr];
    next[idx] = record;
    return next;
  }
  return [...arr, record];
}

export function EmployeeShiftPanel({ user, attendance, setAttendance, holidays = [], leaveRequests = [], compact = false }) {
  const [err, setErr] = useState("");
  const [breakBusy, setBreakBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const today = getUserTodayRecord(attendance, user.id, user, now);
  const key = today?.date || todayKey(now);
  const shift = getUserShift(user, key);
  const bounds = getShiftBounds(user, key);
  const publicHoliday = getPublicHoliday(key, holidays);
  const dayOff = bounds.off || publicHoliday;
  const showManualCheckIn = canManualCheckIn(user, key, leaveRequests, holidays);
  const role = user?.role;
  const canUseBreakButtons = role === "Employee" || role === "Manager" || isHrEmployeeRole(role);
  const checkedIn = today?.checkIn && isAttendanceInProgress(user, today, key, now);
  const onBreak = isOnBreak(today);
  const daySt = dayStatusPill(resolveDayStatus(user, today, key, holidays, now));
  const breakExceeded = isBreakExceeded(today, shift.breakMinutes, now);
  const showBreakButton = canUseBreakButtons && !dayOff && (
    onBreak || (today?.checkIn && !today?.checkOut)
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await apiBreakStatus(key);
        if (cancelled || !status.record) return;
        setAttendance(prev => upsertAttendanceRecord(prev, status.record));
      } catch (e) {
        console.error("Break status load failed:", e?.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, [user.id, key, setAttendance]);

  useEffect(() => {
    const tickBreakTimer = canUseBreakButtons && onBreak;
    if (!checkedIn && !tickBreakTimer) return undefined;
    const intervalMs = tickBreakTimer ? 1000 : 30000;
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [checkedIn, onBreak, today?.breakStart, canUseBreakButtons]);

  async function handleWfhCheckin() {
    setErr("");
    try {
      const record = await apiWfhCheckin();
      setNow(new Date());
      setAttendance(prev => upsertAttendanceRecord(prev, record));
    } catch (e) {
      setErr(e.message || "WFH check-in failed");
    }
  }

  async function handleWfhCheckout() {
    setErr("");
    try {
      const record = await apiWfhCheckout();
      setNow(new Date());
      setAttendance(prev => upsertAttendanceRecord(prev, record));
    } catch (e) {
      setErr(e.message || "WFH check-out failed");
    }
  }

  async function handleBreakToggle() {
    setErr("");
    setBreakBusy(true);
    try {
      const data = onBreak ? await apiEndBreak(key) : await apiStartBreak(key);
      setNow(new Date());
      if (data.record) {
        setAttendance(prev => upsertAttendanceRecord(prev, data.record));
      }
    } catch (e) {
      setErr(e.message || "Break action failed");
    } finally {
      setBreakBusy(false);
    }
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <Card className={compact ? "p-4" : "p-6"}>
        <STitle right={
          <span className="inline-flex items-center gap-1">
            {(today?.source !== "leave" && daySt.label !== "On Leave" && (isApprovedWfhDay(user.id, key, leaveRequests, holidays, user) || isWfhAttendance(today, user.id, key, leaveRequests, holidays, user))) && <Pill tone="blue">WFH</Pill>}
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
            <b>Your shift today:</b> {formatShiftRange(user, key)} · Late grace {shift.graceMinutes}m · Checkout grace {shift.checkoutGraceMinutes ?? 20}m · Break {shift.breakMinutes}m · Checkout window until {formatTime(bounds.checkoutDeadline.toISOString())}
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
                disabled={breakBusy}
                onClick={handleBreakToggle}
              >
                <Coffee size={13} />{onBreak ? "End Break" : "Start Break"}
              </Btn>
            )}
          </div>
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-center">
            <div className="text-xs text-blue-600">Check out</div>
            <div className="font-semibold text-blue-800 tabular-nums mt-1">
              {daySt.label === "Working"
                ? "—"
                : formatTime(today?.checkOut)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
            <div className="text-xs text-slate-500">Working hours</div>
            <div className="font-semibold tabular-nums mt-1" style={{ color: B.dark }}>{displayWorkingHours(today, user, now)}</div>
            {checkedIn && <div className="text-[10px] text-slate-400 mt-0.5">Excludes break</div>}
          </div>
        </div>
        )}

        {!dayOff && showManualCheckIn && (checkedIn || !today?.checkIn) && (
          <div className="flex flex-wrap gap-2 justify-center mb-3">
            {!checkedIn && (
              <Btn onClick={handleWfhCheckin}>
                <LogIn size={14} />Check-in (WFH)
              </Btn>
            )}
            {checkedIn && !onBreak && (
              <Btn onClick={handleWfhCheckout} variant="danger">
                <LogOut size={14} />Check-out (WFH)
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

        {!dayOff && today?.checkOut && daySt.label !== "Working" && (
          <div className="text-sm text-center text-slate-500 mt-2">
            Shift complete · <b>{displayWorkingHours(today, user)}</b> net working time
          </div>
        )}
      </Card>
    </div>
  );
}
