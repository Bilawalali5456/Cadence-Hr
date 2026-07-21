import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Fingerprint, RefreshCw, Smile, Wifi, WifiOff } from "lucide-react";
import {
  apiBiometricLogs, apiBiometricMap, apiBiometricProcess, apiBiometricStatus,
  apiBiometricUnmap, apiBiometricUsers, apiBiometricPull, apiRefreshAttendance,
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

export function BiometricPage({ currentUser, users, setAttendance }) {
  const [status, setStatus] = useState(null);
  const [bioUsers, setBioUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [mapSel, setMapSel] = useState({});
  const [methodFilter, setMethodFilter] = useState("all");
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
        apiBiometricLogs(currentUser.id, today, methodFilter),
      ]);
      setStatus(st);
      setBioUsers(Array.isArray(bu) ? bu : []);
      setLogs(Array.isArray(lg) ? lg : []);
    } catch (e) {
      setErr(e.message || "Failed to load biometric data");
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, today, methodFilter]);

  useEffect(() => { load(); }, [load]);

  async function handlePullNow() {
    setErr("");
    setPulling(true);
    try {
      const r = await apiBiometricPull(currentUser.id);
      if (r.ok) {
        setOk(`Pull OK — ${r.inserted || 0} new logs, ${r.userCount || 0} users, ${r.logCount || 0} total on device.`);
      } else {
        setErr(r.error || "Pull failed — is the API on the same network as 192.168.1.2?");
      }
      setTimeout(() => setOk(""), 6000);
      if (setAttendance) {
        try {
          const att = await apiRefreshAttendance();
          setAttendance(att);
        } catch (_) { /* */ }
      }
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setPulling(false);
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
  const pull = status?.pull || {};
  const connected = status?.connected;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Btn variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh
        </Btn>
        <Btn onClick={handlePullNow} disabled={pulling || !currentUser?.id}>
          <RefreshCw size={14} className={pulling ? "animate-spin" : ""} />
          {pulling ? "Pulling…" : "Pull now"}
        </Btn>
      </div>

      <ErrBox msg={err} />
      <OkBox msg={ok} />

      <Card className="p-5">
        <STitle>Device status (Pull SDK)</STitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-400">Pull status</div>
            <div className="flex items-center gap-2 mt-1">
              {connected ? <Wifi size={16} className="text-emerald-600" /> : <WifiOff size={16} className="text-amber-500" />}
              <Pill tone={connected ? "green" : "amber"}>
                {connected ? "Connected" : "Offline / unreachable"}
              </Pill>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              OK if last pull succeeded within 5 minutes
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Device</div>
            <div className="text-sm font-medium mt-1 font-mono">
              {pull.deviceIp || "192.168.1.2"}:{pull.devicePort || 4370}
            </div>
            <div className="text-xs text-slate-400">{device?.serial_number || "NYU7253801377"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Last pull</div>
            <div className="text-sm font-medium mt-1">{formatDateTime(pull.lastPullAt)}</div>
            <div className="text-xs text-slate-400">
              {pull.lastPullOk
                ? `${pull.lastInserted ?? 0} new · ${pull.lastLogCount ?? 0} on device · ${pull.lastUserCount ?? 0} users`
                : (pull.lastError || "—")}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Next scheduled pull</div>
            <div className="text-sm font-medium mt-1">{formatDateTime(pull.nextPullAt)}</div>
            <div className="text-xs text-slate-400">
              Every {Math.round((pull.intervalMs || 120000) / 60000)} min
            </div>
          </div>
        </div>
        {!connected && (
          <p className="text-xs text-amber-700 mt-4">
            The API must reach the kiosk on the office LAN (192.168.1.2:4370). A Hostinger VPS cannot
            reach that IP unless you run the API on-site or via VPN.
          </p>
        )}
      </Card>

      <Card className="p-5 overflow-x-auto">
        <STitle right={<Pill tone="dark"><Fingerprint size={12} />Machine users</Pill>}>
          PIN → Employee mapping
        </STitle>
        <p className="text-xs text-slate-500 mb-4">
          Users are loaded from the device on each pull. Map each PIN to a portal employee.
        </p>
        {(bioUsers || []).length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No users yet — click Pull now.</p>
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
                <tr key={u.pin} className="border-b border-slate-50 last:border-0">
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
        <STitle
          right={
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
            >
              <option value="all">All methods</option>
              <option value="face">Face</option>
              <option value="fingerprint">Fingerprint</option>
              <option value="card">Card</option>
              <option value="password">Password</option>
            </select>
          }
        >
          Today&apos;s scans ({today})
        </STitle>
        {(logs || []).length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No scans recorded today.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">Employee</th>
                <th className="py-2 font-medium">PIN</th>
                <th className="py-2 font-medium">Time</th>
                <th className="py-2 font-medium">Method</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(logs || []).map(log => (
                <tr key={log.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5">{log.employeeName || <span className="text-slate-400">Unmapped</span>}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
