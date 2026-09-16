import React, { useEffect, useMemo, useState } from "react";
import { FileText, AlertTriangle } from "lucide-react";
import { B } from "../brand.jsx";
import { Card, Pill, Avatar, SelectInput } from "../components/ui.jsx";
import { apiFetchTeamMembers, apiFetchWeeklyReports } from "../api.js";

function mondayOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x.toISOString().slice(0, 10);
}

function fridayOfWeek(mondayKey) {
  const x = new Date(`${mondayKey}T12:00:00`);
  x.setDate(x.getDate() + 4);
  return x.toISOString().slice(0, 10);
}

function weekOptions(count = 12) {
  const opts = [];
  let cur = mondayOfWeek();
  for (let i = 0; i < count; i++) {
    const end = fridayOfWeek(cur);
    opts.push({ value: cur, label: `${cur} → ${end}` });
    const d = new Date(`${cur}T12:00:00`);
    d.setDate(d.getDate() - 7);
    cur = d.toISOString().slice(0, 10);
  }
  return opts;
}

export function TeamReportsPage({ currentUser }) {
  const [week, setWeek] = useState(mondayOfWeek());
  const [members, setMembers] = useState([]);
  const [reports, setReports] = useState([]);
  const [err, setErr] = useState("");
  const weeks = useMemo(() => weekOptions(16), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [team, reps] = await Promise.all([
          apiFetchTeamMembers(),
          apiFetchWeeklyReports(week),
        ]);
        if (cancelled) return;
        setMembers(team || []);
        setReports(reps || []);
        setErr("");
      } catch (e) {
        if (!cancelled) setErr(e.message || "Failed to load team reports");
      }
    })();
    return () => { cancelled = true; };
  }, [week, currentUser?.id]);

  const byEmp = useMemo(() => {
    const m = new Map();
    for (const r of reports) m.set(r.employeeId, r);
    return m;
  }, [reports]);

  const missing = members.filter(m => !byEmp.has(m.id));
  const thisWeek = week === mondayOfWeek();

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <SelectInput
            label="Week (Monday start)"
            value={week}
            onChange={setWeek}
            options={weeks}
          />
        </div>
        {thisWeek && missing.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={14} />
            {missing.length} member{missing.length !== 1 ? "s" : ""} missing this week's report
          </div>
        )}
      </Card>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>
      )}

      {thisWeek && missing.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-100 bg-amber-50">
            <h3 className="text-sm font-semibold text-amber-900">Missing reports</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {missing.map(m => (
              <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                <Avatar name={m.name} />
                <div className="flex-1 text-sm font-medium text-slate-800">{m.name}</div>
                <Pill tone="amber">Missing</Pill>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
          <FileText size={14} style={{ color: B.dark }} />
          <h3 className="text-sm font-semibold" style={{ color: B.dark }}>Submitted reports</h3>
        </div>
        {reports.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">No reports submitted for this week.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reports.map(r => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar name={r.employeeName || "Employee"} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800">{r.employeeName}</div>
                    <div className="text-xs text-slate-400">
                      {r.weekStart} → {r.weekEnd}
                      {r.submittedAt ? ` · ${new Date(r.submittedAt).toLocaleString()}` : ""}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap pl-11">{r.reportText}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
