import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import {
  ArrowDownRight, ArrowUpRight, Download, Loader2, Plus, Pencil, Trash2, Search, Tag,
} from "lucide-react";
import { B } from "../brand.jsx";
import { monthKey, todayKey } from "../utils.js";
import { Card, STitle, Pill, Btn, Modal, TextInput, SelectInput, Field } from "../components/ui.jsx";
import {
  apiFetchFinanceSummary,
  apiFetchFinanceYearly,
  apiFetchExpenseCategories,
  apiCreateExpense,
  apiUpdateExpense,
  apiDeleteExpense,
  apiCreateExpenseCategory,
  apiDeleteExpenseCategory,
  apiDownloadFinanceReport,
} from "../api.js";

const PIE_COLORS = ["#001520", "#c70b07", "#0f4c75", "#16a34a", "#eab308", "#8b5cf6", "#ec4899", "#0891b2", "#f97316", "#64748b"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthOptions(count = 24) {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value: key, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` });
  }
  return opts;
}

function formatMoney(amount, currency = "PKR") {
  const n = Number(amount) || 0;
  const abs = Math.abs(n).toLocaleString("en-PK", { maximumFractionDigits: 0 });
  const sign = n < 0 ? "-" : "";
  return `${sign}${currency} ${abs}`;
}

function formatMoneyDual(pkr, usd) {
  const parts = [];
  if (pkr || (!usd && !pkr)) parts.push(formatMoney(pkr, "PKR"));
  if (usd) parts.push(formatMoney(usd, "USD"));
  return parts.join(" · ");
}

function emptyExpenseForm(today = todayKey()) {
  return {
    date: today,
    category: "Software",
    amount: "",
    currency: "PKR",
    description: "",
  };
}

export function FinancePage({ currentUser, onOpenLead }) {
  const [month, setMonth] = useState(monthKey());
  const [tab, setTab] = useState("overview"); // overview | yearly | categories
  const [summary, setSummary] = useState(null);
  const [yearly, setYearly] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyExpenseForm());
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catBusy, setCatBusy] = useState(false);

  const monthOpts = useMemo(() => monthOptions(36), []);
  const year = Number(String(month).slice(0, 4)) || new Date().getFullYear();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sum, cats] = await Promise.all([
        apiFetchFinanceSummary(month),
        apiFetchExpenseCategories(),
      ]);
      setSummary(sum);
      setCategories(cats);
    } catch (e) {
      setError(e?.message || "Failed to load finance data");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== "yearly") return;
    let cancelled = false;
    apiFetchFinanceYearly(year)
      .then(data => { if (!cancelled) setYearly(data); })
      .catch(() => { if (!cancelled) setYearly(null); });
    return () => { cancelled = true; };
  }, [tab, year]);

  const expenses = useMemo(() => {
    let list = summary?.expensesList || [];
    if (categoryFilter !== "All") {
      list = list.filter(e => e.category === categoryFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(e =>
        String(e.description || "").toLowerCase().includes(q) ||
        String(e.category || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [summary, categoryFilter, search]);

  const pieData = useMemo(() => {
    return (summary?.byCategory || [])
      .filter(c => (c.pkr || 0) > 0 || (c.usd || 0) > 0)
      .map(c => ({
        name: c.category,
        value: (c.pkr || 0) + (c.usd || 0),
        pkr: c.pkr,
        usd: c.usd,
      }));
  }, [summary]);

  const categoryOptions = useMemo(() => {
    const names = categories.map(c => c.name);
    return [
      { value: "All", label: "All categories" },
      ...names.map(n => ({ value: n, label: n })),
    ];
  }, [categories]);

  const formCategoryOptions = useMemo(
    () => categories.map(c => ({ value: c.name, label: c.name })),
    [categories]
  );

  function openAdd() {
    setEditing(null);
    const defaultCat = categories.find(c => c.name === "Software")?.name
      || categories[0]?.name
      || "Miscellaneous";
    setForm({ ...emptyExpenseForm(), category: defaultCat });
    setFormOpen(true);
  }

  function openEdit(row) {
    if (row.isAuto) return;
    setEditing(row);
    setForm({
      date: row.date || todayKey(),
      category: row.category,
      amount: String(row.amount ?? ""),
      currency: row.currency || "PKR",
      description: row.description || "",
    });
    setFormOpen(true);
  }

  async function saveExpense() {
    const amount = Number(form.amount);
    if (!form.category) return window.alert("Category is required");
    if (!Number.isFinite(amount) || amount < 0) return window.alert("Enter a valid amount");
    if (!form.date) return window.alert("Date is required");
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        category: form.category,
        amount,
        currency: form.currency,
        description: form.description,
      };
      if (editing) await apiUpdateExpense(editing.id, payload);
      else await apiCreateExpense(payload);
      setFormOpen(false);
      await load();
    } catch (e) {
      window.alert(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeExpense(row) {
    if (row.isAuto) return;
    if (!window.confirm(`Delete expense "${row.description || row.category}"?`)) return;
    try {
      await apiDeleteExpense(row.id);
      await load();
    } catch (e) {
      window.alert(e?.message || "Delete failed");
    }
  }

  async function downloadReport() {
    setDownloading(true);
    try {
      await apiDownloadFinanceReport(month);
    } catch (e) {
      window.alert(e?.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setCatBusy(true);
    try {
      await apiCreateExpenseCategory(name);
      setNewCatName("");
      const cats = await apiFetchExpenseCategories();
      setCategories(cats);
    } catch (e) {
      window.alert(e?.message || "Could not add category");
    } finally {
      setCatBusy(false);
    }
  }

  async function removeCategory(cat) {
    if (cat.isDefault) return;
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;
    setCatBusy(true);
    try {
      await apiDeleteExpenseCategory(cat.id);
      const cats = await apiFetchExpenseCategories();
      setCategories(cats);
    } catch (e) {
      window.alert(e?.message || "Could not delete category");
    } finally {
      setCatBusy(false);
    }
  }

  const net = summary?.netProfit?.pkr ?? 0;
  const profitChange = summary?.comparison?.profit;
  const prev = summary?.previousMonth;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {["overview", "yearly", "categories"].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                tab === t ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              style={tab === t ? { background: B.dark } : undefined}
            >
              {t === "overview" ? "Monthly" : t === "yearly" ? "Yearly Trend" : "Categories"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput
            value={month}
            onChange={setMonth}
            options={monthOpts}
          />
          <Btn variant="ghost" onClick={downloadReport} disabled={downloading || loading}>
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download Report
          </Btn>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>
      )}

      {loading && !summary ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-12 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading finance…
        </div>
      ) : null}

      {tab === "overview" && summary && (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Total Revenue (IN)</div>
              <div className="mt-1 text-xl font-semibold text-emerald-700">{formatMoney(summary.revenue?.pkr)}</div>
              {summary.revenue?.usd ? (
                <div className="text-xs text-slate-500 mt-0.5">{formatMoney(summary.revenue.usd, "USD")}</div>
              ) : null}
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Total Expenses (OUT)</div>
              <div className="mt-1 text-xl font-semibold text-red-700">{formatMoney(summary.expenses?.pkr)}</div>
              {summary.expenses?.usd ? (
                <div className="text-xs text-slate-500 mt-0.5">{formatMoney(summary.expenses.usd, "USD")}</div>
              ) : null}
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Net Profit / Loss</div>
              <div className={`mt-1 text-xl font-semibold ${net >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {formatMoney(net)}
              </div>
              {summary.netProfit?.usd ? (
                <div className={`text-xs mt-0.5 ${summary.netProfit.usd >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatMoney(summary.netProfit.usd, "USD")}
                </div>
              ) : null}
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">vs Last Month</div>
              <div className={`mt-1 text-xl font-semibold flex items-center gap-1 ${
                (profitChange?.amount ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"
              }`}>
                {(profitChange?.amount ?? 0) >= 0
                  ? <ArrowUpRight size={20} />
                  : <ArrowDownRight size={20} />}
                {formatMoney(Math.abs(profitChange?.amount || 0))}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {profitChange?.percent != null ? `${profitChange.percent}%` : "—"} · prev {formatMoney(prev?.netProfit?.pkr || 0)}
              </div>
            </Card>
          </div>

          {/* Month comparison */}
          <Card className="p-4">
            <STitle>Month Comparison</STitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="py-2 font-medium">Metric</th>
                    <th className="py-2 font-medium">This Month</th>
                    <th className="py-2 font-medium">Last Month</th>
                    <th className="py-2 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {[
                    { label: "Revenue", cur: summary.revenue?.pkr, prev: prev?.revenue?.pkr, cmp: summary.comparison?.revenue, invert: false },
                    { label: "Expenses", cur: summary.expenses?.pkr, prev: prev?.expenses?.pkr, cmp: summary.comparison?.expenses, invert: true },
                    { label: "Profit", cur: summary.netProfit?.pkr, prev: prev?.netProfit?.pkr, cmp: summary.comparison?.profit, invert: false },
                  ].map(row => {
                    const better = row.invert
                      ? (row.cmp?.amount ?? 0) <= 0
                      : (row.cmp?.amount ?? 0) >= 0;
                    return (
                      <tr key={row.label} className="border-b border-slate-50">
                        <td className="py-2.5 font-medium text-slate-700">{row.label}</td>
                        <td className="py-2.5">{formatMoney(row.cur)}</td>
                        <td className="py-2.5 text-slate-500">{formatMoney(row.prev)}</td>
                        <td className={`py-2.5 ${better ? "text-emerald-700" : "text-red-700"}`}>
                          <span className="inline-flex items-center gap-0.5">
                            {(row.cmp?.amount ?? 0) >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {formatMoney(Math.abs(row.cmp?.amount || 0))}
                            {row.cmp?.percent != null ? ` (${row.cmp.percent}%)` : ""}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Breakdown + chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <STitle>Expense Breakdown</STitle>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {(summary.byCategory || []).length === 0 && (
                  <div className="text-sm text-slate-400 py-6 text-center">No expenses this month</div>
                )}
                {(summary.byCategory || []).map(c => (
                  <div key={c.category} className="flex items-center justify-between gap-2 text-sm border-b border-slate-50 py-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 truncate">{c.category}</div>
                      <div className="text-[11px] text-slate-400">{c.count} entr{c.count === 1 ? "y" : "ies"}</div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums font-medium text-slate-700">
                      {formatMoneyDual(c.pkr, c.usd)}
                      {c.category === "Salaries" && summary.salaryTotal > 0 ? (
                        <div className="text-[10px] text-amber-600 font-normal">Auto from Payroll</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <STitle>Category Distribution</STitle>
              {pieData.length === 0 ? (
                <div className="text-sm text-slate-400 py-16 text-center">No data to chart</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={false}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatMoney(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* Expense list */}
          <Card className="p-4">
            <STitle right={
              <Btn onClick={openAdd}><Plus size={14} /> Add Expense</Btn>
            }>
              Expenses
            </STitle>
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search description…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <SelectInput value={categoryFilter} onChange={setCategoryFilter} options={categoryOptions} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Category</th>
                    <th className="py-2 font-medium">Description</th>
                    <th className="py-2 font-medium text-right">Amount</th>
                    <th className="py-2 font-medium">Currency</th>
                    <th className="py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400">No expenses found</td></tr>
                  )}
                  {expenses.map(row => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="py-2.5 tabular-nums text-slate-600">{row.date}</td>
                      <td className="py-2.5">
                        <span className="font-medium text-slate-800">{row.category}</span>
                        {row.isAuto && <Pill tone="amber">Auto from Payroll</Pill>}
                      </td>
                      <td className="py-2.5 text-slate-600 max-w-xs truncate">{row.description || "—"}</td>
                      <td className="py-2.5 text-right tabular-nums font-medium">{Number(row.amount).toLocaleString("en-PK")}</td>
                      <td className="py-2.5 text-slate-500">{row.currency}</td>
                      <td className="py-2.5 text-right">
                        {row.isAuto ? (
                          <span className="text-[11px] text-slate-400">Protected</span>
                        ) : (
                          <span className="inline-flex gap-1">
                            <button type="button" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" onClick={() => openEdit(row)}>
                              <Pencil size={14} />
                            </button>
                            <button type="button" className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" onClick={() => removeExpense(row)}>
                              <Trash2 size={14} />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Revenue list */}
          <Card className="p-4">
            <STitle>Revenue (from Leads — read only)</STitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Client</th>
                    <th className="py-2 font-medium text-right">Amount</th>
                    <th className="py-2 font-medium">Currency</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {(summary.revenueEntries || []).length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400">No received payments this month</td></tr>
                  )}
                  {(summary.revenueEntries || []).map(r => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="py-2.5 tabular-nums text-slate-600">{r.date}</td>
                      <td className="py-2.5 font-medium text-slate-800">{r.clientName}</td>
                      <td className="py-2.5 text-right tabular-nums">{Number(r.amount).toLocaleString("en-PK")}</td>
                      <td className="py-2.5 text-slate-500">{r.currency}</td>
                      <td className="py-2.5"><Pill tone="green">{r.status}</Pill></td>
                      <td className="py-2.5 text-right">
                        {r.leadId && typeof onOpenLead === "function" ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-blue-600 hover:underline"
                            onClick={() => onOpenLead(r.leadId)}
                          >
                            Open lead
                          </button>
                        ) : r.leadId ? (
                          <span className="text-[11px] text-slate-400">{r.leadId}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === "yearly" && (
        <Card className="p-4">
          <STitle>Yearly Trend — {year}</STitle>
          {!yearly ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading year…
            </div>
          ) : (
            <>
              <div className="h-64 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(yearly.months || []).map(m => ({
                    name: m.label.slice(0, 3),
                    Revenue: m.revenue?.pkr || 0,
                    Expenses: m.expenses?.pkr || 0,
                    Profit: m.netProfit?.pkr || 0,
                  }))}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => formatMoney(v)} />
                    <Legend />
                    <Bar dataKey="Revenue" fill="#16a34a" />
                    <Bar dataKey="Expenses" fill="#c70b07" />
                    <Bar dataKey="Profit" fill="#001520" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                      <th className="py-2 font-medium">Month</th>
                      <th className="py-2 font-medium text-right">Revenue</th>
                      <th className="py-2 font-medium text-right">Expenses</th>
                      <th className="py-2 font-medium text-right">Profit</th>
                      <th className="py-2 font-medium text-right">Running Total</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {(yearly.months || []).map(m => (
                      <tr key={m.month} className="border-b border-slate-50">
                        <td className="py-2 font-medium text-slate-700">{m.label}</td>
                        <td className="py-2 text-right text-emerald-700">{formatMoney(m.revenue?.pkr)}</td>
                        <td className="py-2 text-right text-red-700">{formatMoney(m.expenses?.pkr)}</td>
                        <td className={`py-2 text-right font-medium ${(m.netProfit?.pkr || 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {formatMoney(m.netProfit?.pkr)}
                        </td>
                        <td className="py-2 text-right text-slate-600">{formatMoney(m.runningTotal?.pkr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {tab === "categories" && (
        <Card className="p-4">
          <STitle>Manage Categories</STitle>
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Tag size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="New category name"
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
                onKeyDown={e => { if (e.key === "Enter") addCategory(); }}
              />
            </div>
            <Btn onClick={addCategory} disabled={catBusy || !newCatName.trim()}>
              {catBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Category
            </Btn>
          </div>
          <div className="divide-y divide-slate-100">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between py-2.5 gap-2">
                <div>
                  <span className="text-sm font-medium text-slate-800">{cat.name}</span>
                  {cat.isDefault && <Pill tone="slate">Default</Pill>}
                </div>
                {!cat.isDefault && (
                  <button
                    type="button"
                    disabled={catBusy}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                    onClick={() => removeCategory(cat)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit Expense" : "Add Expense"}
      >
        <div className="space-y-3">
          <TextInput label="Date" type="date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} required />
          <SelectInput
            label="Category"
            value={form.category}
            onChange={v => setForm(f => ({ ...f, category: v }))}
            options={formCategoryOptions}
            required
          />
          <TextInput
            label="Amount"
            type="number"
            value={form.amount}
            onChange={v => setForm(f => ({ ...f, amount: v }))}
            required
          />
          <SelectInput
            label="Currency"
            value={form.currency}
            onChange={v => setForm(f => ({ ...f, currency: v }))}
            options={[
              { value: "PKR", label: "PKR" },
              { value: "USD", label: "USD" },
            ]}
          />
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="e.g. GitHub Team Plan, September office rent"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Btn>
            <Btn onClick={saveExpense} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing ? "Save" : "Add Expense"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
