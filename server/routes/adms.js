/**
 * ZKTeco ADMS device-facing routes (/iclock/*)
 * Device initiates all communication — plain text only, never JSON.
 * Responses use res.writeHead + res.end only (no res.send/set).
 */

import express from "express";
import {
  admsOk, endAdmsPlain, endAdmsOk, splitLines, parseAttLogLine, parseOperLogUserLine,
  logRawRequest, logAdms, logPostCdataVerbose, logAdmsResponseBytes,
} from "../lib/admsHelpers.js";
import { syncAttendanceFromLogs } from "../lib/attendanceSync.js";

function serialFromQuery(req, fallback = "unknown") {
  const raw = req.query.SN || req.query.sn || fallback;
  const trimmed = String(raw).trim();
  return trimmed || fallback;
}

function handshakeBody(sn) {
  const serial = String(sn || "").trim() || "unknown";
  return (
    "GET OPTION FROM: " + serial + "\r\n" +
    "ATTLOGStamp=0\r\n" +
    "OPERLOGStamp=0\r\n" +
    "ATTPHOTOStamp=0\r\n" +
    "ErrorDelay=30\r\n" +
    "Delay=5\r\n" +
    "TransTimes=00:00;14:05\r\n" +
    "TransInterval=1\r\n" +
    "TransFlag=TransData AttLog OpLog\r\n" +
    "Realtime=1\r\n" +
    "Encrypt=0\r\n" +
    "TimeZone=5\r\n" +
    "ServerVer=2.4.1\r\n"
  );
}

async function upsertDevice(pool, serial, req) {
  if (!serial || serial === "unknown") return;
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  const pushver = req.query.pushver || req.query.PushVer || "";
  try {
    await pool.query(
      `INSERT INTO biometric_devices (serial_number, device_name, firmware_version, ip_address, last_seen, is_active, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), true, NOW())
       ON CONFLICT (serial_number) DO UPDATE SET
         firmware_version = COALESCE(NULLIF(EXCLUDED.firmware_version, ''), biometric_devices.firmware_version),
         ip_address = EXCLUDED.ip_address,
         last_seen = NOW(),
         updated_at = NOW(),
         is_active = true`,
      [serial, serial, pushver, ip]
    );
  } catch (e) {
    console.error("[adms] upsertDevice extended failed, using minimal:", e.message);
    await pool.query(
      `INSERT INTO biometric_devices (serial_number, device_name, last_seen, is_active)
       VALUES ($1, $2, NOW(), true)
       ON CONFLICT (serial_number) DO UPDATE SET
         last_seen = NOW(),
         is_active = true`,
      [serial, serial]
    );
  }
}

async function resolveEmployeeId(pool, deviceSerial, deviceUserId) {
  const { rows } = await pool.query(
    `SELECT employee_id FROM device_user_mapping
     WHERE device_serial_number = $1 AND device_user_id = $2 LIMIT 1`,
    [deviceSerial, deviceUserId]
  );
  return rows[0]?.employee_id || null;
}

async function insertAttendanceLog(pool, serial, parsed) {
  const employeeId = await resolveEmployeeId(pool, serial, parsed.deviceUserId);

  const dup = await pool.query(
    `SELECT id, employee_id FROM attendance_logs
     WHERE device_serial_number = $1 AND device_user_id = $2 AND punch_time = $3 LIMIT 1`,
    [serial, parsed.deviceUserId, parsed.punchTime]
  );

  if (dup.rows.length) {
    return { inserted: false, duplicate: true, employeeId: dup.rows[0].employee_id || employeeId };
  }

  await pool.query(
    `INSERT INTO attendance_logs (
       employee_id, device_user_id, device_serial_number, punch_time, punch_type,
       verify_method, raw_data, is_duplicate, synced_to_attendance
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,false,false)`,
    [
      employeeId, parsed.deviceUserId, serial, parsed.punchTime,
      parsed.punchType, parsed.verifyMethod, parsed.rawData,
    ]
  );

  if (!employeeId) {
    logAdms("UNMAPPED_PUNCH", `SN=${serial} user=${parsed.deviceUserId} time=${parsed.punchTime.toISOString()}`);
  }

  return { inserted: true, duplicate: false, employeeId };
}

async function processAttLogBody(pool, serial, body) {
  let inserted = 0;
  let duplicates = 0;

  for (const line of splitLines(body)) {
    const parsed = parseAttLogLine(line);
    if (!parsed) {
      logAdms("ATTLOG_PARSE_SKIP", `line=<<${line}>>`);
      continue;
    }

    try {
      const r = await insertAttendanceLog(pool, serial, parsed);
      if (r.duplicate) duplicates += 1;
      else if (r.inserted) inserted += 1;
    } catch (e) {
      console.error("[adms] insert log error (continuing):", e.message);
    }
  }

  return { inserted, duplicates };
}

async function processOperLogBody(pool, serial, body) {
  let saved = 0;
  for (const line of splitLines(body)) {
    const user = parseOperLogUserLine(line);
    if (!user) continue;
    try {
      await pool.query(
        `INSERT INTO device_enrolled_users (device_serial_number, device_user_id, name, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (device_serial_number, device_user_id) DO UPDATE SET
           name = COALESCE(NULLIF(EXCLUDED.name, ''), device_enrolled_users.name),
           updated_at = NOW()`,
        [serial, user.pin, user.name || ""]
      );
      saved += 1;
    } catch (e) {
      console.error("[adms] OPERLOG user save error:", e.message);
    }
  }
  return { saved };
}

function createAdmsRouter(pool) {
  const router = express.Router();

  router.get("/ping", (_req, res) => {
    endAdmsOk(res);
  });

  router.get("/test-handshake", (req, res) => {
    const sn = serialFromQuery(req, "NYU7253801377");
    const body = handshakeBody(sn);
    logAdmsResponseBytes("test-handshake", body);
    endAdmsPlain(res, body);
  });

  /** GET /iclock/cdata — device registration / handshake */
  router.get("/cdata", async (req, res) => {
    const sn = serialFromQuery(req);
    console.log("HANDSHAKE from:", sn, "at", new Date().toISOString());

    try {
      await logRawRequest(pool, { serial: sn, method: "GET", path: "/iclock/cdata", query: req.query, body: "" });
      await upsertDevice(pool, sn, req);
    } catch (e) {
      console.error("[adms] handshake DB error:", e.message);
    }

    const body = handshakeBody(sn);
    logAdmsResponseBytes("cdata", body);
    endAdmsPlain(res, body);
  });

  /** POST /iclock/cdata — ATTLOG / OPERLOG push */
  router.post("/cdata", async (req, res) => {
    const sn = serialFromQuery(req);
    const table = String(req.query.table || req.query.Table || "").toUpperCase();
    const body = typeof req.body === "string" ? req.body : (req.body != null ? String(req.body) : "");
    console.log("POST DATA from:", sn, "table:", table, "body:", body);

    logPostCdataVerbose(req, body);

    try {
      await logRawRequest(pool, {
        serial: sn,
        method: "POST",
        path: "/iclock/cdata",
        query: req.query,
        body,
      });
      await upsertDevice(pool, sn, req);

      if (table === "ATTLOG") {
        const r = await processAttLogBody(pool, sn, body);
        logAdms("ATTLOG", `inserted=${r.inserted} duplicates=${r.duplicates} SN=${sn}`);
        try {
          await syncAttendanceFromLogs(pool);
        } catch (e) {
          console.error("[adms] sync after ATTLOG failed:", e.message);
        }
      } else if (table === "OPERLOG") {
        const r = await processOperLogBody(pool, sn, body);
        logAdms("OPERLOG", `users_saved=${r.saved} lines=${splitLines(body).length}`);
      }
    } catch (e) {
      console.error("[adms] POST cdata processing error:", e.message);
    }

    endAdmsOk(res);
  });

  /** GET /iclock/getrequest — device command poll */
  router.get("/getrequest", async (req, res) => {
    const sn = serialFromQuery(req);
    console.log("POLL from:", sn, "at", new Date().toISOString());

    try {
      await logRawRequest(pool, { serial: sn, method: "GET", path: "/iclock/getrequest", query: req.query, body: "" });
      await upsertDevice(pool, sn, req);
    } catch (e) {
      console.error("[adms] getrequest DB error:", e.message);
    }

    endAdmsOk(res);
  });

  /** POST /iclock/devicecmd */
  router.post("/devicecmd", async (req, res) => {
    const sn = serialFromQuery(req);
    const body = typeof req.body === "string" ? req.body : (req.body != null ? String(req.body) : "");
    logAdms("POST /iclock/devicecmd", `SN=${sn} body=<<${body}>>`);

    try {
      await logRawRequest(pool, { serial: sn, method: "POST", path: "/iclock/devicecmd", query: req.query, body });
    } catch (e) {
      console.error("[adms] devicecmd error:", e.message);
    }

    endAdmsOk(res);
  });

  return router;
}

export function registerAdmsRoutes(app, pool) {
  const admsRouter = createAdmsRouter(pool);
  app.use("/iclock", admsRouter);
  app.use("/ICLOCK", admsRouter);
  app.use("/iClock", admsRouter);
}
