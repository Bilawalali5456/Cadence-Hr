/**
 * ZKTeco ADMS device-facing routes (/iclock/*)
 * Device initiates all communication — plain text only, never JSON.
 */

import {
  admsOk, sendAdmsText, splitLines, parseAttLogLine,
  buildRegistrationResponse, logRawRequest, logAdms, logPostCdataVerbose,
  logAdmsResponseBytes,
} from "../lib/admsHelpers.js";
import { syncAttendanceFromLogs } from "../lib/attendanceSync.js";

const PRIMARY_DEVICE_SN = "NYU7253801377";

async function upsertDevice(pool, serial, req) {
  if (!serial) return;
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

function attlogQueryCommand(startDate, endDate, separator = "\t") {
  return `DATA QUERY ATTLOG StartTime=${startDate}${separator}EndTime=${endDate}`;
}

function todayRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return {
    start: `${y}-${m}-${d} 00:00:00`,
    end: `${y}-${m}-${d} 23:59:59`,
    yearStart: `${y}-01-01 00:00:00`,
  };
}

/**
 * Queue CHECK then DATA QUERY ATTLOG for the SenseFace.
 * @param {{ force?: boolean, startTime?: string, endTime?: string }} options
 */
export async function queueAttlogPullCommands(pool, serial = PRIMARY_DEVICE_SN, options = {}) {
  const force = !!options.force;
  const { end, yearStart } = todayRange();
  const start = options.startTime || yearStart;
  const endTime = options.endTime || end;

  const commands = [
    { type: "CHECK", data: "CHECK" },
    { type: "DATA_QUERY_ATTLOG", data: attlogQueryCommand(start, endTime, "\t") },
  ];

  for (const cmd of commands) {
    if (!force) {
      const existing = await pool.query(
        `SELECT id FROM device_commands
         WHERE UPPER(TRIM(device_serial)) = UPPER(TRIM($1))
           AND status = 'pending' AND command_data = $2 LIMIT 1`,
        [serial, cmd.data]
      );
      if (existing.rows.length) {
        logAdms("CMD_ALREADY_QUEUED", `SN=${serial} ${cmd.type} id=${existing.rows[0].id}`);
        continue;
      }
    }
    const { rows } = await pool.query(
      `INSERT INTO device_commands (device_serial, command_type, command_data, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [String(serial).trim(), cmd.type, cmd.data]
    );
    logAdms("CMD_QUEUED", `SN=${serial} id=${rows[0].id} ${cmd.type} data=${cmd.data}`);
  }
}

function sendHandshake(res, serial, label = "cdata") {
  const body = buildRegistrationResponse(serial);
  logAdmsResponseBytes(label, body);
  sendAdmsText(res, body);
}

function mountAdmsHandlers(app, pool) {
  app.get(["/iclock/ping", "/ICLOCK/ping"], (_req, res) => {
    sendAdmsText(res, "OK");
  });

  /** Debug: same body as GET /iclock/cdata — open in browser to inspect */
  app.get(["/iclock/test-handshake", "/ICLOCK/test-handshake"], (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "NYU7253801377").trim();
    sendHandshake(res, serial, "test-handshake");
  });

  /** Device registration / handshake */
  app.get(["/iclock/cdata", "/ICLOCK/cdata"], async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    logAdms("GET /iclock/cdata", `SN=${serial} IP=${ip}`);

    try {
      await logRawRequest(pool, { serial, method: "GET", path: "/iclock/cdata", query: req.query, body: "" });
    } catch (_) { /* always respond */ }

    try {
      if (serial) await upsertDevice(pool, serial, req);
      sendHandshake(res, serial || "DEVICE", "cdata");
    } catch (e) {
      console.error("[adms] registration error:", e.message);
      sendHandshake(res, serial || "DEVICE", "cdata-error");
    }
  });

  /** Attendance / operation log push (+ empty-body handshake from some firmware) */
  app.post(["/iclock/cdata", "/ICLOCK/cdata"], async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    const table = String(req.query.table || req.query.Table || "").toUpperCase();
    const stampQ = String(req.query.Stamp || req.query.stamp || "");
    const body = typeof req.body === "string" ? req.body : (req.body != null ? String(req.body) : "");
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";

    logPostCdataVerbose(req, body);

    try {
      await logRawRequest(pool, {
        serial,
        method: "POST",
        path: "/iclock/cdata",
        query: { ...req.query, _headers: req.headers },
        body,
      });
    } catch (_) { /* continue */ }

    if (!table) {
      logAdms("POST /iclock/cdata (handshake)", `SN=${serial} IP=${ip}`);
      try {
        if (serial) await upsertDevice(pool, serial, req);
        sendHandshake(res, serial || "DEVICE", "cdata-post-handshake");
      } catch (e) {
        console.error("[adms] POST handshake error:", e.message);
        sendHandshake(res, serial || "DEVICE", "cdata-post-handshake-error");
      }
      return;
    }

    logAdms("POST /iclock/cdata", `SN=${serial} table=${table} Stamp=${stampQ} bytes=${body.length} IP=${ip}`);

    try {
      if (serial) await upsertDevice(pool, serial, req);

      if (table === "ATTLOG") {
        const r = await processAttLogBody(pool, serial, body);
        logAdms("ATTLOG", `inserted=${r.inserted} duplicates=${r.duplicates}`);
        try {
          await syncAttendanceFromLogs(pool);
        } catch (e) {
          console.error("[adms] sync after ATTLOG failed:", e.message);
        }
      } else if (table === "OPERLOG") {
        logAdms("OPERLOG", `stored raw (${splitLines(body).length} lines)`);
      } else {
        logAdms("POST_UNKNOWN_TABLE", `table=${table} body=<<${body.slice(0, 500)}>>`);
      }
    } catch (e) {
      console.error("[adms] POST cdata processing error:", e.message);
    }

    sendAdmsText(res, admsOk());
  });

  /** Command polling — pending command text, else OK */
  app.get(["/iclock/getrequest", "/ICLOCK/getrequest"], async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    logAdms("GET /iclock/getrequest", `SN=${serial}`);

    try {
      await logRawRequest(pool, { serial, method: "GET", path: "/iclock/getrequest", query: req.query, body: "" });
      if (serial) await upsertDevice(pool, serial, req);

      const { rows } = await pool.query(
        `SELECT id, command_type, command_data FROM device_commands
         WHERE UPPER(TRIM(device_serial)) = UPPER(TRIM($1))
           AND status = 'pending'
         ORDER BY id ASC
         LIMIT 1`,
        [serial]
      );

      logAdms("GETREQUEST_PENDING", `SN=${serial} count=${rows.length}${rows[0] ? ` next=${rows[0].id}:${rows[0].command_data}` : ""}`);

      if (rows.length > 0) {
        const cmd = rows[0];
        const payload = `C:${cmd.id}:${cmd.command_data || ""}`;
        await pool.query(
          `UPDATE device_commands SET status = 'sent', sent_at = NOW() WHERE id = $1 AND status = 'pending'`,
          [cmd.id]
        );
        logAdms("CMD_SENT", `SN=${serial} ${payload}`);
        sendAdmsText(res, payload);
        return;
      }
    } catch (e) {
      console.error("[adms] getrequest error:", e.message);
    }

    sendAdmsText(res, admsOk());
  });

  app.post(["/iclock/devicecmd", "/ICLOCK/devicecmd"], async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    const body = typeof req.body === "string" ? req.body : (req.body != null ? String(req.body) : "");
    logAdms("POST /iclock/devicecmd", `SN=${serial} body=<<${body}>>`);

    try {
      await logRawRequest(pool, { serial, method: "POST", path: "/iclock/devicecmd", query: req.query, body });
      const idM = String(body).match(/ID=([0-9]+)/i) || String(body).match(/^([0-9]+)/);
      const cmdId = idM ? parseInt(idM[1], 10) : null;
      if (cmdId) {
        await pool.query(
          `UPDATE device_commands SET status = 'completed', completed_at = NOW(), result = $1 WHERE id = $2`,
          [String(body).slice(0, 2000), cmdId]
        );
      }
    } catch (e) {
      console.error("[adms] devicecmd error:", e.message);
    }

    sendAdmsText(res, admsOk());
  });
}

export function registerAdmsRoutes(app, pool) {
  mountAdmsHandlers(app, pool);
}
