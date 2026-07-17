import React, { useState, useMemo } from "react";
import { Calendar, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { B } from "../brand.jsx";
import { isHrAdminRole, todayKey, formatDate, getHolidayOnDate, upcomingHolidays, remainingPublicHolidaysThisYear } from "../utils.js";
import { Pill, Card, STitle, Modal, TextInput, SelectInput, Btn, ErrBox } from "../components/ui.jsx";

const TYPE_OPTIONS = [
  { value: "public", label: "Public Holiday" },
  { value: "optional", label: "Optional Holiday" },
];

function typeLabel(type) {
  return type === "optional" ? "Optional Holiday" : "Public Holiday";
}

function typeTone(type) {
  return type === "optional" ? "amber" : "blue";
}

function MonthCalendar({ holidays, monthDate, onPrev, onNext }) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const today = todayKey();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <STitle>Calendar view</STitle>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrev} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold min-w-[140px] text-center" style={{ color: B.dark }}>{monthLabel}</span>
          <button type="button" onClick={onNext} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400 mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="aspect-square" />;
          const dateKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hol = getHolidayOnDate(dateKey, holidays);
          const isToday = dateKey === today;
          const isPast = dateKey < today;
          return (
            <div
              key={dateKey}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm border relative ${
                hol
                  ? hol.type === "public"
                    ? "bg-blue-50 border-blue-200 text-blue-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                  : isPast
                    ? "bg-slate-50 border-slate-100 text-slate-400"
                    : "bg-white border-slate-100 text-slate-700"
              } ${isToday ? "ring-2 ring-slate-800 ring-offset-1" : ""}`}
              title={hol ? `${hol.title} (${typeLabel(hol.type)})` : undefined}
            >
              <span className={`font-semibold tabular-nums ${isToday ? "underline" : ""}`}>{day}</span>
              {hol && <span className="w-1.5 h-1.5 rounded-full mt-0.5" style={{ background: hol.type === "public" ? B.dark : "#d97706" }} />}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-200" /> Public holiday</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" /> Optional holiday</span>
      </div>
    </Card>
  );
}

export function HolidaysPage({ currentUser, holidays, setHolidays }) {
  const canManage = isHrAdminRole(currentUser.role);
  const today = todayKey();
  const year = new Date().getFullYear();

  const [open, setOpen] = useState(false);
  const [ferr, setFerr] = useState("");
  const [form, setForm] = useState({ title: "", date: "", type: "public" });
  const [calMonth, setCalMonth] = useState(() => new Date());

  const sorted = useMemo(
    () => [...holidays].sort((a, b) => a.date.localeCompare(b.date)),
    [holidays]
  );

  const upcoming = useMemo(() => upcomingHolidays(holidays, today), [holidays, today]);
  const remainingCount = remainingPublicHolidaysThisYear(holidays, year);

  function openAdd() {
    setForm({ title: "", date: "", type: "public" });
    setFerr("");
    setOpen(true);
  }

  function saveHoliday() {
    if (!form.title.trim()) { setFerr("Holiday title is required."); return; }
    if (!form.date) { setFerr("Date is required."); return; }
    if (holidays.some(h => h.date === form.date && h.title.toLowerCase() === form.title.trim().toLowerCase())) {
      setFerr("A holiday with this title and date already exists.");
      return;
    }
    setHolidays(prev => [...prev, {
      id: "hol-" + Date.now(),
      title: form.title.trim(),
      date: form.date,
      type: form.type,
    }]);
    setOpen(false);
  }

  function deleteHoliday(id) {
    if (!window.confirm("Delete this holiday?")) return;
    setHolidays(prev => prev.filter(h => h.id !== id));
  }

  function shiftMonth(delta) {
    setCalMonth(d => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  if (canManage) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Btn onClick={openAdd}><Plus size={14} />Add Holiday</Btn>
          <span className="text-sm text-slate-500">{sorted.length} holiday{sorted.length !== 1 ? "s" : ""} on file</span>
        </div>

        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <STitle>All holidays</STitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-200">
                  {["Date", "Title", "Type", ""].map(h => (
                    <th key={h || "act"} className="px-4 py-2.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No holidays yet. Add your first company holiday.</td></tr>
                ) : sorted.map(h => {
                  const past = h.date < today;
                  return (
                    <tr key={h.id} className={`border-b border-slate-100 last:border-0 ${past ? "opacity-50 bg-slate-50/50" : ""}`}>
                      <td className="px-4 py-3 tabular-nums text-slate-600 whitespace-nowrap">{formatDate(h.date)}</td>
                      <td className={`px-4 py-3 font-medium ${past ? "text-slate-500" : "text-slate-800"}`}>{h.title}</td>
                      <td className="px-4 py-3"><Pill tone={typeTone(h.type)}>{typeLabel(h.type)}</Pill></td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => deleteHoliday(h.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Modal open={open} onClose={() => setOpen(false)} title="Add Holiday">
          <div className="space-y-4">
            <TextInput label="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Independence Day" />
            <TextInput label="Date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <SelectInput label="Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} options={TYPE_OPTIONS} />
            <ErrBox msg={ferr} />
            <div className="flex gap-2 justify-end pt-2">
              <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
              <Btn onClick={saveHoliday}>Save holiday</Btn>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl" style={{ background: B.darkLight, color: B.dark }}>
            <Calendar size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-400">Public holidays remaining in {year}</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: B.dark }}>{remainingCount}</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-50 text-blue-700">
            <Calendar size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-400">Upcoming holidays</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: B.dark }}>{upcoming.length}</div>
          </div>
        </Card>
      </div>

      <MonthCalendar
        holidays={holidays}
        monthDate={calMonth}
        onPrev={() => shiftMonth(-1)}
        onNext={() => shiftMonth(1)}
      />

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <STitle>Upcoming holidays</STitle>
        </div>
        {upcoming.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">No upcoming holidays scheduled.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {upcoming.map(h => (
              <div key={h.id} className="px-5 py-3 flex items-center gap-4 flex-wrap">
                <div className="text-sm tabular-nums text-slate-500 min-w-[120px]">{formatDate(h.date)}</div>
                <div className="flex-1 font-medium text-slate-800">{h.title}</div>
                <Pill tone={typeTone(h.type)}>{typeLabel(h.type)}</Pill>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
