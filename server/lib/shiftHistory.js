import { karachiDateKey } from "./admsHelpers.js";

export function parseShiftHistory(raw) {
  if (Array.isArray(raw)) return raw.map(e => ({ ...e }));
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(e => ({ ...e })) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function shiftsEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function addDaysToDateKey(dateKey, delta) {
  const [y, m, d] = String(dateKey || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/**
 * When shift changes, archive the previous shift through yesterday (PKT).
 * Current shift lives on users.shift; history holds closed past periods.
 */
export function buildShiftHistoryOnChange(existingHistory, oldShift, hired) {
  const history = parseShiftHistory(existingHistory);
  const today = karachiDateKey(new Date());
  const yesterday = addDaysToDateKey(today, -1);

  if (history.length > 0) {
    const last = history[history.length - 1];
    if (last.to == null || last.to === "") {
      last.to = yesterday;
    }
  }

  let from;
  if (history.length === 0) {
    from = String(hired || "").slice(0, 10) || yesterday;
  } else {
    const last = history[history.length - 1];
    const lastTo = String(last.to || yesterday).slice(0, 10);
    from = addDaysToDateKey(lastTo, 1);
  }

  history.push({
    shift: oldShift,
    from,
    to: yesterday,
  });

  return history;
}
