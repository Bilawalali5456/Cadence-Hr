import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Fingerprint, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { B } from "../brand.jsx";
import {
  apiBiometricLogs, apiBiometricMap, apiBiometricProcess, apiBiometricStatus,
  apiBiometricUnmap, apiBiometricUsers, apiBiometricPullLogs, apiRefreshAttendance,
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
  const [serverTest, setServerTest] = useState(null);
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

  async function testAdmsServer() {
    setServerTest(null);
    setErr("");
    try {
      const res = await fetch("/iclock/cdata?SN=PORTALTEST&options=all&pushver=2.4.1");
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!text.includes("GET OPTION FROM:")) throw new Error("Invalid ADMS response");
      setServerTest({ ok: true, preview: text.split("\n").slice(0, 3).join(" · ") });
    } catch (e) {
      setServerTest({ ok: false, error: e.message });
      setErr(`ADMS server test failed: ${e.message}`);
    }
  }

  async function handlePullLogs() {
    setErr("");
    try {
      await apiBiometricPullLogs(currentUser.id, device?.serial_number || "NYU7253801377");
      setOk("Pull commands queued (CHECK + DATA QUERY ATTLOG). Wait ~30–60s for the device to poll, then Refresh.");
      setTimeout(() => setOk(""), 8000);
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
  const diagnosis = status?.diagnosis || "";
  const stats = status?.stats || {};
  const pollingNoAttlog = diagnosis === "polling_no_attlog" || diagnosis === "offline_no_attlog";

  const setupSteps = [
    { label: "Server mode", value: "ADMS / Cloud Server (Push)" },
    { label: "Enable domain name", value: "ON" },
    { label: "Proxy server", value: "OFF" },
    { label: "Server address", value: "hrms.adforcesolutions.com" },
    { label: "Port", value: "80" },
    { label: "HTTPS / SSL", value: "OFF (plain HTTP only)" },
    { label: "Path (if separate field)", value: "/iclock/cdata" },
    { label: "Expected serial", value: "NYU7253801377" },
  ];

  const troubleshooting = [
    "Server-side ADMS is working — use “Test ADMS server” above to confirm.",
    "Your device (192.168.1.2) must reach the internet on outbound port 80.",
    "On the device: Menu → Comm → Network test / ping — verify DNS and gateway.",
    "If domain fails: set Enable Domain Name OFF, use your VPS public IP as server address, port 80, path /iclock/cdata.",
    "If one URL field only: enter http://hrms.adforcesolutions.com/iclock/cdata — do not also fill a separate path.",
    "Set device time: Menu → System → Date/Time → sync or use NTP (pool.ntp.org).",
    "After saving cloud settings, reboot the device and wait 60 seconds, then click Refresh.",
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Btn variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh
        </Btn>
        <Btn variant="ghost" onClick={testAdmsServer}>Test ADMS server</Btn>
        <Btn variant="ghost" onClick={handlePullLogs} disabled={!currentUser?.id}>
          Pull logs from device
        </Btn>
      </div>

      <ErrBox msg={err} />
      <OkBox msg={ok} />

      {serverTest?.ok && (
        <OkBox msg={`ADMS server reachable — ${serverTest.preview}`} />
      )}

      <Card className="p-5">
        <STitle>Device setup (after reset)</STitle>
        <p className="text-xs text-slate-500 mb-3">
          On the SenseFace 2A: Menu → Comm → Cloud Server / ADMS. Use these exact values.
          Some firmware builds auto-append <code className="bg-slate-100 px-1 rounded">/iclock/cdata</code> —
          if connection fails, try entering only <code className="bg-slate-100 px-1 rounded">hrms.adforcesolutions.com</code> in the server field with port 80.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {setupSteps.map(s => (
            <div key={s.label} className="flex gap-2 border border-slate-100 rounded-lg px-3 py-2">
              <span className="text-slate-400 shrink-0">{s.label}:</span>
              <span className="font-medium font-mono text-xs break-all">{s.value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-amber-700 mt-3">
          SenseFace 2A · {device?.serial_number || "NYU7253801377"} · firmware ZAM70-NF24HA-Ver3.3.12
          — after saving, reboot the device. The portal should show serial NYU7253801377 as Connected.
        </p>
      </Card>

      {pollingNoAttlog && (
        <Card className="p-5 border-amber-300 bg-amber-50">
          <STitle>Why punch data is missing</STitle>
          <p className="text-sm text-slate-700 mb-3">
            The machine <strong>is contacting the server</strong> (heartbeat /{" "}
            <code className="bg-white px-1 rounded text-xs">getrequest</code>),
            but it has <strong>never sent attendance punches</strong> (
            <code className="bg-white px-1 rounded text-xs">POST /iclock/cdata?table=ATTLOG</code>).
            That is why scans do not appear here or in attendance.
          </p>
          <ul className="text-sm space-y-2 list-disc pl-5 text-slate-700 mb-3">
            <li>ATTLOG POSTs received: <strong>{stats.attlogPosts ?? 0}</strong></li>
            <li>Punches stored: <strong>{stats.punchCount ?? 0}</strong> (today: {stats.todayPunches ?? 0})</li>
            <li>Pending device commands: <strong>{stats.pendingCommands ?? 0}</strong></li>
          </ul>
          <p className="text-sm text-slate-700 mb-2">Do this now:</p>
          <ol className="text-sm space-y-1 list-decimal pl-5 text-slate-700 mb-3">
            <li>Click <strong>Pull logs from device</strong> above.</li>
            <li>On the machine, scan one face (create a new punch).</li>
            <li>Wait 60 seconds, then click <strong>Refresh</strong>.</li>
            <li>In recent requests below, look for a line with <strong>POST</strong> and <strong>ATTLOG</strong>.</li>
          </ol>
          <p className="text-xs text-slate-500">
            If you only ever see GET getrequest / GET cdata — the machine is online but not uploading logs.
            On device: Comm → Cloud Server → confirm Realtime/Push is enabled, then reboot the device.
          </p>
        </Card>
      )}

      {!connected && !pollingNoAttlog && (
        <Card className="p-5 border-amber-200 bg-amber-50/50">
          <STitle>Device not reaching server — check the office network</STitle>
          <p className="text-xs text-slate-600 mb-3">
            Settings on the machine look correct. The most common cause is the kiosk LAN (192.168.1.x)
            cannot reach the public server on port 80, or DNS cannot resolve the domain.
          </p>
          <ul className="text-sm space-y-2 list-disc pl-5 text-slate-700">
            {troubleshooting.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
          <p className="text-xs text-slate-500 mt-4">
            From any PC on the same office Wi‑Fi, open a browser to{" "}
            <code className="bg-white px-1 rounded">http://hrms.adforcesolutions.com/iclock/cdata?SN=LANTEST</code>
            {" "}— you should see plain text starting with <code className="bg-white px-1 rounded">GET OPTION FROM:</code>.
            If that fails, the device cannot connect either.
          </p>
        </Card>
      )}

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
        {recentIclock.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-xs text-slate-400 mb-2">Recent /iclock requests seen by server</div>
            <ul className="text-xs space-y-1 font-mono">
              {recentIclock.map((r, i) => (
                <li key={i} className="text-slate-600">
                  {formatDateTime(r.at)} · {r.method} {r.path} · SN={r.serial || "?"}
                </li>
              ))}
            </ul>
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
