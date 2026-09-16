import React, { useEffect, useMemo, useState } from "react";
import { Send, FileText } from "lucide-react";
import { B } from "../brand.jsx";
import { Card, Btn, ErrBox, OkBox } from "../components/ui.jsx";
import { apiFetchMyWeeklyReports, apiSubmitWeeklyReport, apiUpdateWeeklyReport } from "../api.js";

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

function formatWeekLabel(weekStart) {
  const end = fridayOfWeek(weekStart);
  return `${weekStart} → ${end}`;
}

export function WeeklyReportPage({ currentUser }) {
  const me = currentUser;
  const hasTeamLead = !!(me?.teamLeadId);
  const weekStart = mondayOfWeek();
  const weekEnd = fridayOfWeek(weekStart);
  const [text, setText] = useState("");
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const nextMonday = useMemo(() => {
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() + 7);
    return d;
  }, [weekStart]);
  const canEdit = new Date() < nextMonday;

  useEffect(() => {
    if (!hasTeamLead) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await apiFetchMyWeeklyReports();
        if (cancelled) return;
        setHistory(rows || []);
        const thisWeek = (rows || []).find(r => r.weekStart === weekStart);
        setCurrent(thisWeek || null);
        setText(thisWeek?.reportText || "");
      } catch (e) {
        if (!cancelled) setMsg(`error:${e.message || "Failed to load reports"}`);
      }
    })();
    return () => { cancelled = true; };
  }, [hasTeamLead, weekStart]);

  if (!hasTeamLead) {
    return (
      <Card className="p-8 text-center text-sm text-slate-400">
        Weekly reports are available once HR assigns you a Team Lead.
      </Card>
    );
  }

  async function submit() {
    const reportText = text.trim();
    if (!reportText) { setMsg("error:Please write your weekly report before submitting."); return; }
    if (!canEdit) { setMsg("error:This week's report can no longer be edited."); return; }
    setBusy(true);
    setMsg("");
    try {
      if (current?.id) {
        const res = await apiUpdateWeeklyReport(current.id, { reportText });
        setCurrent(res.report);
        setHistory(h => h.map(r => r.id === res.report.id ? res.report : r));
        setMsg("ok:Report updated.");
      } else {
        const res = await apiSubmitWeeklyReport({ weekStart, reportText });
        setCurrent(res.report);
        setHistory(h => [res.report, ...h.filter(r => r.weekStart !== weekStart)]);
        setMsg("ok:Report submitted.");
      }
    } catch (e) {
      setMsg(`error:${e.message || "Failed to save report"}`);
    } finally {
      setBusy(false);
    }
  }

  const past = history.filter(r => r.weekStart !== weekStart);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 rounded-lg bg-slate-100"><FileText size={16} style={{ color: B.dark }} /></div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: B.dark }}>This week</h3>
            <p className="text-xs text-slate-400">{formatWeekLabel(weekStart)} (Mon–Fri)</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Summarize the work you completed this week. Weekend work can be mentioned in the text.
          Visible only to your Team Lead and Executive.
        </p>
        <textarea
          className="w-full min-h-[140px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={!canEdit || busy}
          placeholder="What did you work on this week?"
        />
        {msg.startsWith("error:") && <div className="mt-3"><ErrBox msg={msg.replace("error:", "")} /></div>}
        {msg.startsWith("ok:") && <div className="mt-3"><OkBox msg={msg.replace("ok:", "")} /></div>}
        <div className="mt-3">
          <Btn onClick={submit} disabled={busy || !canEdit}>
            <Send size={14} />{current ? (busy ? "Saving…" : "Update report") : (busy ? "Submitting…" : "Submit report")}
          </Btn>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold" style={{ color: B.dark }}>Previous weeks</h3>
        </div>
        {past.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">No previous reports yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {past.map(r => (
              <div key={r.id} className="px-5 py-3">
                <div className="text-xs font-medium text-slate-600 mb-1">{formatWeekLabel(r.weekStart)}</div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">{r.reportText}</div>
                {r.submittedAt && (
                  <div className="text-[11px] text-slate-400 mt-1">
                    Submitted {new Date(r.submittedAt).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
