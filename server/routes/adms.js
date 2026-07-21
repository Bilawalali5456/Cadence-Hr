/**
 * ZKTeco ADMS device-facing routes (/iclock/*)
 * Device initiates all communication — plain text only, never JSON.
 */

import {
  admsOk, sendAdmsText, splitLines, parseAttLogLine,
  buildRegistrationResponse, logRawRequest, logAdms,
} from "../lib/admsHelpers.js";
import { syncAttendanceFromLogs } from "../lib/attendanceSync.js";

async function upsertDevice(pool, serial, req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  const pushver = req.query.pushver || "";
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
}

async function getDeviceStamps(pool, serial) {
  const { rows } = await pool.query(
    `SELECT attlog_stamp, operlog_stamp, attphoto_stamp FROM biometric_devices WHERE serial_number = $1`,
    [serial]
  );
  if (!rows[0]) return { attlogStamp: 0, operlogStamp: 0, attphotoStamp: 0 };
  return {
    attlogStamp: Number(rows[0].attlog_stamp) || 0,
    operlogStamp: Number(rows[0].operlog_stamp) || 0,
    attphotoStamp: Number(rows[0].attphoto_stamp) || 0,
  };
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
    `SELECT id FROM attendance_logs
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
  let maxStamp = 0;

  for (const line of splitLines(body)) {
    const parsed = parseAttLogLine(line);
    if (!parsed) continue;
    const ts = parsed.punchTime.getTime();
    if (ts > maxStamp) maxStamp = ts;

    try {
      const r = await insertAttendanceLog(pool, serial, parsed);
      if (r.duplicate) duplicates += 1;
      else if (r.inserted) inserted += 1;
    } catch (e) {
      console.error("[adms] insert log error (continuing):", e.message);
    }
  }

  if (maxStamp > 0) {
    await pool.query(
      `UPDATE biometric_devices SET attlog_stamp = GREATEST(COALESCE(attlog_stamp,0), $1), updated_at = NOW()
       WHERE serial_number = $2`,
      [maxStamp, serial]
    ).catch(() => {});
  }

  return { inserted, duplicates };
}

export function registerAdmsRoutes(app, pool) {
  /** Device registration / handshake */
  app.get("/iclock/cdata", async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    logAdms("GET /iclock/cdata", `SN=${serial}`);

    try {
      await logRawRequest(pool, { serial, method: "GET", path: "/iclock/cdata", query: req.query, body: "" });
    } catch (_) { /* always respond OK */ }

    try {
      if (serial) await upsertDevice(pool, serial, req);
      const stamps = serial ? await getDeviceStamps(pool, serial) : {};
      sendAdmsText(res, buildRegistrationResponse(serial, stamps));
    } catch (e) {
      console.error("[adms] registration error:", e.message);
      sendAdmsText(res, buildRegistrationResponse(serial || "DEVICE"));
    }
  });

  /** Attendance / operation log push */
  app.post("/iclock/cdata", async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    const table = String(req.query.table || req.query.Table || "").toUpperCase();
    const body = typeof req.body === "string" ? req.body : (req.body ? String(req.body) : "");
    logAdms("POST /iclock/cdata", `SN=${serial} table=${table} bytes=${body.length}`);

    try {
      await logRawRequest(pool, { serial, method: "POST", path: "/iclock/cdata", query: req.query, body });
    } catch (_) { /* continue */ }

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
        await pool.query(
          `UPDATE biometric_devices SET operlog_stamp = GREATEST(COALESCE(operlog_stamp,0), $1), updated_at = NOW()
           WHERE serial_number = $2`,
          [Date.now(), serial]
        ).catch(() => {});
      }
    } catch (e) {
      console.error("[adms] POST cdata processing error:", e.message);
    }

    sendAdmsText(res, admsOk());
  });

  /** Command polling */
  app.get("/iclock/getrequest", async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    logAdms("GET /iclock/getrequest", `SN=${serial}`);

    try {
      await logRawRequest(pool, { serial, method: "GET", path: "/iclock/getrequest", query: req.query, body: "" });
      if (serial) {
        await pool.query(
          `UPDATE biometric_devices SET last_seen = NOW(), updated_at = NOW(), is_active = true WHERE serial_number = $1`,
          [serial]
        );
      }

      const { rows } = await pool.query(
        `SELECT id, command_data FROM device_commands
         WHERE device_serial = $1 AND status = 'pending' ORDER BY id ASC LIMIT 1`,
        [serial]
      );

      if (rows.length) {
        await pool.query(
          `UPDATE device_commands SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [rows[0].id]
        );
        sendAdmsText(res, `C:${rows[0].id}:${rows[0].command_data || ""}\r\n`);
        return;
      }
    } catch (e) {
      console.error("[adms] getrequest error:", e.message);
    }

    sendAdmsText(res, admsOk());
  });

  /** Command result callback */
  app.post("/iclock/devicecmd", async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    const body = typeof req.body === "string" ? req.body : (req.body ? String(req.body) : "");
    logAdms("POST /iclock/devicecmd", `SN=${serial}`);

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
