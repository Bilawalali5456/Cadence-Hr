/** Overtime tracking retired — table kept in DB but unused. */
export function isOvertimeEligibleDate() {
  return false;
}

export function calcExtraMinutesBeyondShift() {
  return 0;
}

export function overtimeToJs() {
  return null;
}

export async function syncOvertimeForAttendance() {
  return null;
}

export async function syncOvertimeForRange() {
  return [];
}

export async function fetchOvertimeRequests() {
  return [];
}
