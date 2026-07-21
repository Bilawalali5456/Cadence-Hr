import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Fingerprint, RefreshCw, Smile, Wifi, WifiOff } from "lucide-react";
import {
  apiBiometricLogs, apiBiometricMap, apiBiometricProcess, apiBiometricStatus,
  apiBiometricUnmap, apiBiometricUsers, apiBiometricClearLogs, apiRefreshAttendance,
} from "../api.js";
import { employeeRoster, todayKey } from "../utils.js";
import { Pill, Card, STitle, Btn, ErrBox, OkBox } from "../components/ui.jsx";

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function punchLabel(type) {
  if (type === "check_out") return "Check-out";
  if (type === "break_out") return "Break-out";
  if (type === "break_in") return "Break-in";
  if (type === "ot_in") return "OT-in";
  if (type === "ot_out") return "OT-out";
  return "Check-in";
}

function MethodIcon({ method }) {
  if (method === "fingerprint") return <Fingerprint size={14} className="inline text-slate-600" />;
  if (method === "face") return <Smile size={14} className="inline text-slate-600" />;
  if (method === "card") return <CreditCard size={14} className="inline text-slate-600" />;
  return <span className="text-slate-400">•</span>;
}

function methodLabel(method) {
  if (method === "fingerprint") return "Fingerprint";
  if (method === "face") return "Face";
  if (method === "card") return "Card";
  if (method === "password") return "Password";
  return method || "Unknown";
}

function querySnippet(query) {
  if (!query) return "";
  try {
    const q = typeof query === "string" ? JSON.parse(query) : query;
    const table = q.table || q.Table || "";
    const sn = q.SN || q.sn || "";
    return [table && `table=${table}`, sn && `SN=${sn}`].filter(Boolean).join(" ");
  } catch {
    return String(query).slice(0, 80);
  }
}

export function BiometricPage({ currentUser, users, setAttendance }) {
  const [status, setStatus] = useState(null);
  const [bioUsers, setBioUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [mapSel, setMapSel] = useState({});
  const today = todayKey();

  const staff = useMemo(
    () => employeeRoster(users || []).filter(u => u && u.status === "active"),
    [users]
  );

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    setErr("");
    try {
      const [st, bu, lg] = await Promise.all([
        apiBiometricStatus(currentUser.id),
        apiBiometricUsers(currentUser.id),
        apiBiometricLogs(currentUser.id, today),
      ]);
      setStatus(st);
      setBioUsers(Array.isArray(bu) ? bu : []);
      setLogs(Array.isArray(lg) ? lg : []);
    } catch (e) {
      setErr(e.message || "Failed to load biometric data");
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, today]);

  useEffect(() => { load(); }, [load]);

  async function handleClearLogs() {
    if (!window.confirm("Clear all recent /iclock request logs?")) return;
    try {
      await apiBiometricClearLogs(currentUser.id);
      setOk("Request logs cleared.");
      setTimeout(() => setOk(""), 3000);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleMap(pin) {
    const employeeId = mapSel[pin];
    if (!employeeId) { setErr("Select an employee to map."); return; }
    setErr("");
    try {
      await apiBiometricMap(currentUser.id, pin, employeeId);
      await apiBiometricProcess(currentUser.id);
      if (setAttendance) {
        const att = await apiRefreshAttendance();
        setAttendance(att);
      }
      setOk(`PIN ${pin} mapped successfully.`);
      setTimeout(() => setOk(""), 4000);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleUnmap(pin, deviceSerial) {
    if (!window.confirm(`Remove mapping for PIN ${pin}?`)) return;
    try {
      await apiBiometricUnmap(currentUser.id, pin, deviceSerial || device?.serial_number);
      setOk(`Mapping removed for PIN ${pin}.`);
      setTimeout(() => setOk(""), 4000);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  const device = status?.device;
  const connected = status?.connected;
  const recentIclock = status?.recentIclockRequests || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Btn variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh
        </Btn>
        <Btn variant="ghost" onClick={handleClearLogs} disabled={!currentUser?.id}>
          Clear logs
        </Btn>
      </div>

      <ErrBox msg={err} />
      <OkBox msg={ok} />

      <Card className="p-5">
        <STitle>Device status (ADMS Push)</STitle>
        {loading && !device ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : !device ? (
          <div className="flex items-center gap-3 text-slate-500">
            <WifiOff size={20} />
            <span className="text-sm">No device has connected yet.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-400">Status</div>
              <div className="flex items-center gap-2 mt-1">
                {connected ? <Wifi size={16} className="text-emerald-600" /> : <WifiOff size={16} className="text-amber-500" />}
                <Pill tone={connected ? "green" : "amber"}>{connected ? "Connected" : "Offline"}</Pill>
              </div>
              <div className="text-xs text-slate-400 mt-1">Any /iclock request in the last 5 minutes</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Serial number</div>
              <div className="text-sm font-medium mt-1 font-mono">{device.serial_number || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Model / firmware</div>
              <div className="text-sm font-medium mt-1">{device.model || device.device_name || "SenseFace 2A"}</div>
              <div className="text-xs text-slate-400">{device.firmware_version || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Last seen</div>
              <div className="text-sm font-medium mt-1">{formatDateTime(device.last_seen)}</div>
              <div className="text-xs text-slate-400">{device.ip_address || ""}</div>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5 overflow-x-auto">
        <STitle right={<Btn size="sm" variant="ghost" onClick={handleClearLogs}>Clear logs</Btn>}>
          Recent /iclock requests
        </STitle>
        <p className="text-xs text-slate-500 mb-3">
          POST rows in green mean attendance data arrived. GET rows (gray) are handshake/polling only.
        </p>
        {recentIclock.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No requests logged yet.</p>
        ) : (
          <ul className="text-sm space-y-1.5 font-mono">
            {recentIclock.map((r, i) => {
              const isPost = String(r.method || "").toUpperCase() === "POST";
              return (
                <li
                  key={i}
                  className={`rounded-md px-3 py-2 ${isPost ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-500"}`}
                >
                  <span className="font-semibold">{r.method}</span>
                  {" "}{r.path}
                  {" · "}SN={r.serial || "?"}
                  {querySnippet(r.query) ? ` · ${querySnippet(r.query)}` : ""}
                  {" · "}{formatDateTime(r.at)}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-5 overflow-x-auto">
        <STitle right={<Pill tone="dark"><Fingerprint size={12} />Machine users</Pill>}>
          PIN → Employee mapping
        </STitle>
        <p className="text-xs text-slate-500 mb-4">
          Users arrive via OPERLOG push or appear after ATTLOG scans. Map each PIN to a portal employee.
        </p>
        {(bioUsers || []).length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No machine users yet.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">PIN</th>
                <th className="py-2 font-medium">Name (machine)</th>
                <th className="py-2 font-medium">Mapped employee</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(bioUsers || []).map(u => (
                <tr key={`${u.deviceSerial}:${u.pin}`} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-mono font-medium">{u.pin}</td>
                  <td className="py-2.5">{u.name || "—"}</td>
                  <td className="py-2.5">
                    {u.mapped ? (
                      <span className="font-medium text-slate-800">{u.portalName || u.employeeId}</span>
                    ) : (
                      <select
                        value={mapSel[u.pin] || ""}
                        onChange={e => setMapSel(s => ({ ...s, [u.pin]: e.target.value }))}
                        className="w-full max-w-xs text-sm border border-slate-300 rounded-lg px-2 py-1.5"
                      >
                        <option value="">Select employee…</option>
                        {staff.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.name} · {emp.dept || emp.role}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="py-2.5">
                    {u.mapped ? <Pill tone="green">Mapped</Pill> : <Pill tone="amber">Unmapped</Pill>}
                  </td>
                  <td className="py-2.5 text-right">
                    {u.mapped ? (
                      <Btn size="sm" variant="ghost" onClick={() => handleUnmap(u.pin, u.deviceSerial)}>Unmap</Btn>
                    ) : (
                      <Btn size="sm" onClick={() => handleMap(u.pin)}>Map</Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-5 overflow-x-auto">
        <STitle>Today&apos;s scans ({today})</STitle>
        {(logs || []).length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No scans recorded today.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">PIN</th>
                <th className="py-2 font-medium">Time</th>
                <th className="py-2 font-medium">Method</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Employee</th>
              </tr>
            </thead>
            <tbody>
              {(logs || []).map(log => (
                <tr key={log.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-mono">{log.pin}</td>
                  <td className="py-2.5 tabular-nums">{formatDateTime(log.scanTime)}</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <MethodIcon method={log.verifyMethod} />
                      {methodLabel(log.verifyMethod)}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <Pill tone={log.punchType === "check_out" ? "blue" : "green"}>
                      {punchLabel(log.punchType)}
                    </Pill>
                  </td>
                  <td className="py-2.5">{log.employeeName || <span className="text-slate-400">Unmapped</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
