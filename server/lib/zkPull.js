/**
 * ZKTeco SenseFace Pull SDK service (TCP port 4370 via zklib-js).
 * zklib-js is loaded lazily so a missing package / LAN failure cannot crash the API.
 */

import { createRequire } from "module";
import { syncAttendanceFromLogs } from "./attendanceSync.js";

const require = createRequire(import.meta.url);

const DEVICE_IP = process.env.ZK_DEVICE_IP || "192.168.1.2";
const DEVICE_PORT = parseInt(process.env.ZK_DEVICE_PORT || "4370", 10);
const DEVICE_TIMEOUT = parseInt(process.env.ZK_DEVICE_TIMEOUT || "10000", 10);
const DEVICE_INPORT = parseInt(process.env.ZK_DEVICE_INPORT || "5200", 10);
const DEVICE_SERIAL = process.env.ZK_DEVICE_SERIAL || "NYU7253801377";
const PULL_INTERVAL_MS = parseInt(process.env.ZK_PULL_INTERVAL_MS || String(2 * 60 * 1000), 10);

const PUNCH_TYPES = {
  0: "check_in",
  1: "check_out",
  2: "break_out",
  3: "break_in",
  4: "ot_in",
  5: "ot_out",
};

const VERIFY_METHODS = {
  0: "password",
  1: "fingerprint",
  2: "card",
  3: "password",
  4: "card",
  15: "face",
};

export const pullStatus = {
  lastPullAt: null,
  nextPullAt: null,
  lastPullOk: false,
  lastError: null,
  lastLogCount: 0,
  lastInserted: 0,
  lastUserCount: 0,
  pulling: false,
  deviceIp: DEVICE_IP,
  devicePort: DEVICE_PORT,
  intervalMs: PULL_INTERVAL_MS,
};

let ZKLib = null;
let zkLoadError = null;

function formatErr(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.toast && typeof err.toast === "function") {
    try { return err.toast(); } catch (_) { /* fall through */ }
  }
  if (err.getError && typeof err.getError === "function") {
    try { return JSON.stringify(err.getError()); } catch (_) { /* fall through */ }
  }
  if (err.err?.message) return `${err.command || "ZK"}: ${err.err.message}`;
  if (err.message && typeof err.message === "string") return err.message;
  try { return JSON.stringify(err); } catch (_) { return String(err); }
}

function log(msg, detail = "") {
  console.log(`[zk-pull ${new Date().toISOString()}] ${msg}${detail ? ` — ${detail}` : ""}`);
}

function loadZkLib() {
  if (ZKLib) return ZKLib;

  // Always retry — do not permanently cache load failure (npm install may fix it without restart)
  try {
    // Drop cached zklib modules so a newly installed package is picked up
    for (const key of Object.keys(require.cache)) {
      if (key.includes("zklib-js")) delete require.cache[key];
    }

    const utils = require("zklib-js/utils.js");

    function parseZkTime(time) {
      let t = time;
      const second = t % 60;
      t = (t - second) / 60;
      const minute = t % 60;
      t = (t - minute) / 60;
      const hour = t % 24;
      t = (t - hour) / 24;
      const day = (t % 31) + 1;
      t = (t - (day - 1)) / 31;
      const month = t % 12;
      t = (t - month) / 12;
      const year = t + 2000;
      return new Date(year, month, day, hour, minute, second);
    }

    utils.decodeRecordData40 = (recordData) => {
      const deviceUserId = recordData
        .slice(2, 2 + 9)
        .toString("ascii")
        .split("\0")
        .shift();
      return {
        userSn: recordData.readUIntLE(0, 2),
        deviceUserId,
        state: recordData[26] ?? 0,
        type: recordData[28] ?? 0,
        recordTime: parseZkTime(recordData.readUInt32LE(27)),
      };
    };

    // Reload TCP/UDP after patching the decoder
    for (const key of Object.keys(require.cache)) {
      if (key.includes("zklib-js") && (key.includes("zklibtcp") || key.includes("zklibudp") || key.endsWith("zklib.js"))) {
        delete require.cache[key];
      }
    }

    ZKLib = require("zklib-js");
    zkLoadError = null;
    if (pullStatus.lastError && String(pullStatus.lastError).includes("Failed to load zklib-js")) {
      pullStatus.lastError = null;
    }
    return ZKLib;
  } catch (e) {
    zkLoadError = `Failed to load zklib-js: ${formatErr(e)}. Run: cd server && npm install`;
    log("LOAD_ERROR", zkLoadError);
    throw new Error(zkLoadError);
  }
}

function createDevice() {
  const Lib = loadZkLib();
  return new Lib(DEVICE_IP, DEVICE_PORT, DEVICE_TIMEOUT, DEVICE_INPORT);
}

async function withDevice(fn) {
  const zk = createDevice();
  try {
    await zk.createSocket();
    return await fn(zk);
  } finally {
    try {
      await zk.disconnect();
    } catch (_) { /* ignore */ }
  }
}

function normalizeLog(r) {
  const pin = String(r.deviceUserId ?? r.userId ?? r.visitorId ?? "").trim();
  const rawTime = r.recordTime ?? r.timestamp ?? r.attTime;
  const punchTime = rawTime instanceof Date ? rawTime : new Date(rawTime);
  return {
    deviceUserId: pin,
    punchTime,
    state: Number(r.state ?? r.status ?? 0) || 0,
    type: Number(r.type ?? r.verify ?? r.verifyType ?? 0) || 0,
  };
}

function normalizeUser(u) {
  const deviceUserId = parseInt(String(u.userId ?? u.uid ?? "").trim(), 10);
  return {
    deviceUserId,
    name: String(u.name || "").trim(),
  };
}

async function upsertDeviceRow(pool, info = {}) {
  await pool.query(
    `INSERT INTO biometric_devices (serial_number, device_name, model, firmware_version, ip_address, last_seen, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), true, NOW())
     ON CONFLICT (serial_number) DO UPDATE SET
       device_name = COALESCE(NULLIF(EXCLUDED.device_name, ''), biometric_devices.device_name),
       model = COALESCE(NULLIF(EXCLUDED.model, ''), biometric_devices.model),
       firmware_version = COALESCE(NULLIF(EXCLUDED.firmware_version, ''), biometric_devices.firmware_version),
       ip_address = EXCLUDED.ip_address,
       last_seen = NOW(),
       updated_at = NOW(),
       is_active = true`,
    [
      DEVICE_SERIAL,
      info.name || "SenseFace 2A",
      "SenseFace 2A",
      info.firmware || "",
      DEVICE_IP,
    ]
  );
}

async function saveEnrolledUsers(pool, users) {
  for (const u of users) {
    if (!Number.isFinite(u.deviceUserId)) continue;
    await pool.query(
      `INSERT INTO device_enrolled_users (device_serial_number, device_user_id, name, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (device_serial_number, device_user_id) DO UPDATE SET
         name = COALESCE(NULLIF(EXCLUDED.name, ''), device_enrolled_users.name),
         updated_at = NOW()`,
      [DEVICE_SERIAL, u.deviceUserId, u.name || ""]
    );
  }
}

async function resolveEmployeeId(pool, deviceUserId) {
  const { rows } = await pool.query(
    `SELECT employee_id FROM device_user_mapping
     WHERE device_serial_number = $1 AND device_user_id = $2 LIMIT 1`,
    [DEVICE_SERIAL, deviceUserId]
  );
  return rows[0]?.employee_id || null;
}

async function saveAttendanceLogs(pool, records) {
  let inserted = 0;
  let duplicates = 0;

  for (const rec of records) {
    const pin = parseInt(String(rec.deviceUserId || "").trim(), 10);
    if (!Number.isFinite(pin) || !rec.punchTime || Number.isNaN(rec.punchTime.getTime())) continue;

    const punchType = PUNCH_TYPES[rec.state] || "check_in";
    const verifyMethod = VERIFY_METHODS[rec.type] || "unknown";
    const employeeId = await resolveEmployeeId(pool, pin);
    const rawData = JSON.stringify({
      deviceUserId: pin,
      punchTime: rec.punchTime.toISOString(),
      state: rec.state,
      type: rec.type,
      source: "zk-pull",
    });

    const dup = await pool.query(
      `SELECT id FROM attendance_logs
       WHERE device_serial_number = $1 AND device_user_id = $2 AND punch_time = $3 LIMIT 1`,
      [DEVICE_SERIAL, pin, rec.punchTime]
    );
    if (dup.rows.length) {
      duplicates += 1;
      continue;
    }

    await pool.query(
      `INSERT INTO attendance_logs (
         employee_id, device_user_id, device_serial_number, punch_time, punch_type,
         verify_method, raw_data, is_duplicate, synced_to_attendance
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,false,false)`,
      [employeeId, pin, DEVICE_SERIAL, rec.punchTime, punchType, verifyMethod, rawData]
    );
    inserted += 1;
  }

  return { inserted, duplicates };
}

export async function pullFromDevice(pool) {
  if (pullStatus.pulling) {
    return { ok: false, error: "Pull already in progress", skipped: true };
  }

  pullStatus.pulling = true;
  const started = Date.now();
  log("start", `${DEVICE_IP}:${DEVICE_PORT}`);

  try {
    const result = await withDevice(async (zk) => {
      let name = "";
      let firmware = "";
      try { name = String(await zk.getDeviceName() || ""); } catch (_) { /* */ }
      try { firmware = String(await zk.getFirmware() || ""); } catch (_) { /* */ }
      await upsertDeviceRow(pool, { name, firmware });

      const usersRaw = await zk.getUsers();
      const users = (Array.isArray(usersRaw) ? usersRaw : usersRaw?.data || []).map(normalizeUser);
      await saveEnrolledUsers(pool, users);

      const logsRaw = await zk.getAttendances();
      const logs = (Array.isArray(logsRaw) ? logsRaw : logsRaw?.data || []).map(normalizeLog);
      const saved = await saveAttendanceLogs(pool, logs);

      try {
        await syncAttendanceFromLogs(pool);
      } catch (e) {
        log("attendance sync warning", formatErr(e));
      }

      return {
        userCount: users.length,
        logCount: logs.length,
        inserted: saved.inserted,
        duplicates: saved.duplicates,
      };
    });

    pullStatus.lastPullAt = new Date().toISOString();
    pullStatus.nextPullAt = new Date(Date.now() + PULL_INTERVAL_MS).toISOString();
    pullStatus.lastPullOk = true;
    pullStatus.lastError = null;
    pullStatus.lastLogCount = result.logCount;
    pullStatus.lastInserted = result.inserted;
    pullStatus.lastUserCount = result.userCount;

    log("ok", `users=${result.userCount} logs=${result.logCount} inserted=${result.inserted} dup=${result.duplicates} ${Date.now() - started}ms`);
    return { ok: true, ...result };
  } catch (err) {
    const msg = formatErr(err);
    pullStatus.lastPullAt = new Date().toISOString();
    pullStatus.nextPullAt = new Date(Date.now() + PULL_INTERVAL_MS).toISOString();
    pullStatus.lastPullOk = false;
    pullStatus.lastError = msg;
    log("FAILED", msg);
    return { ok: false, error: msg };
  } finally {
    pullStatus.pulling = false;
  }
}

let intervalHandle = null;

export function startZkPullService(pool) {
  if (intervalHandle) return;

  pullStatus.nextPullAt = new Date(Date.now() + 2000).toISOString();
  log("scheduler started", `every ${PULL_INTERVAL_MS / 1000}s → ${DEVICE_IP}:${DEVICE_PORT}`);

  // Never let pull crashes take down Express
  const safePull = () => {
    pullFromDevice(pool).catch((e) => {
      log("unhandled pull error", formatErr(e));
    });
  };

  try {
    loadZkLib();
  } catch (e) {
    pullStatus.lastError = formatErr(e);
    log("zklib unavailable — API will still run; pull disabled until npm install", pullStatus.lastError);
  }

  safePull();
  intervalHandle = setInterval(safePull, PULL_INTERVAL_MS);
  if (typeof intervalHandle.unref === "function") intervalHandle.unref();
}

export function getPullStatus() {
  const last = pullStatus.lastPullAt ? new Date(pullStatus.lastPullAt).getTime() : 0;
  const connected = !!(pullStatus.lastPullOk && last > 0 && (Date.now() - last) < 5 * 60 * 1000);
  return { ...pullStatus, connected };
}
