import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Fingerprint, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { B } from "../brand.jsx";
import {
  apiBiometricLogs, apiBiometricMap, apiBiometricProcess, apiBiometricStatus,
  apiBiometricUnmap, apiBiometricUsers, apiRefreshAttendance,
} from "../api.js";
import { employeeRoster, todayKey, formatTime } from "../utils.js";
import { Pill, Card, STitle, Btn, ErrBox, OkBox } from "../components/ui.jsx";

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function scanTypeLabel(log, dayScans) {
  const list = (dayScans || []).filter(s => s.pin === log.pin).sort(
    (a, b) => new Date(a.scanTime) - new Date(b.scanTime)
  );
  if (list.length <= 1) return "In";
  const first = list[0]?.scanTime;
  const last = list[list.length - 1]?.scanTime;
  if (log.scanTime === first) return "In";
  if (log.scanTime === last) return "Out";
  return "Scan";
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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Btn variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh
        </Btn>
      </div>

      <ErrBox msg={err} />
      <OkBox msg={ok} />

      <Card className="p-5">
        <STitle>Device status</STitle>
        {loading && !device ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : !device ? (
          <div className="flex items-center gap-3 text-slate-500">
            <WifiOff size={20} />
            <span className="text-sm">No device has connected yet. Set Cloud Server to <code className="text-xs bg-slate-100 px-1 rounded">http://hrms.adforcesolutions.com/iclock/cdata</code> (HTTP only — the device cannot follow HTTPS redirects)</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-400">Status</div>
              <div className="flex items-center gap-2 mt-1">
                {connected ? <Wifi size={16} className="text-emerald-600" /> : <WifiOff size={16} className="text-amber-500" />}
                <Pill tone={connected ? "green" : "amber"}>{connected ? "Connected" : "Offline"}</Pill>
              </div>
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
        <STitle right={<Pill tone="dark"><Fingerprint size={12} />Machine users</Pill>}>PIN → Employee mapping</STitle>
        <p className="text-xs text-slate-500 mb-4">
          Users enrolled on the ZKTeco device appear here automatically. Map each PIN (1–25) to the matching portal employee.
        </p>
        {(bioUsers || []).length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No machine users synced yet. Users appear after the device pushes OPERLOG data.</p>
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
        <STitle>Today&apos;s biometric scans ({today})</STitle>
        {(logs || []).length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No scans recorded today.</p>
        ) : (
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">Time</th>
                <th className="py-2 font-medium">PIN</th>
                <th className="py-2 font-medium">Employee</th>
                <th className="py-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {(logs || []).map(log => (
                <tr key={log.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 tabular-nums">{formatDateTime(log.scanTime)}</td>
                  <td className="py-2.5 font-mono">{log.pin}</td>
                  <td className="py-2.5">{log.employeeName || <span className="text-slate-400">Unmapped</span>}</td>
                  <td className="py-2.5">
                    <Pill tone={scanTypeLabel(log, logs) === "In" ? "green" : scanTypeLabel(log, logs) === "Out" ? "blue" : "slate"}>
                      {scanTypeLabel(log, logs)}
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
