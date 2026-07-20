/**
 * ZKTeco ADMS (Push Protocol) — device endpoints + attendance processing.
 */

const ADMS_DEVICE_NAME = process.env.BIOMETRIC_DEVICE_NAME || "SenseFace2A";

function admsOk(extra = "") {
  return `OK${extra ? `\r\n${extra}` : ""}\r\n`;
}

function admsText(res, body, status = 200) {
  res.status(status).type("text/plain").send(body.endsWith("\r\n") ? body : `${body}\r\n`);
}

function splitLines(body) {
  if (!body || typeof body !== "string") return [];
  return body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
}

function parseAttLogLine(line) {
  const parts = line.split("\t");
  if (parts.length < 2) return null;
  const pin = String(parts[0] || "").trim();
  const tsRaw = String(parts[1] || "").trim();
  if (!pin || !tsRaw) return null;
  const scanTime = parseZktTime(tsRaw);
  if (!scanTime) return null;
  return {
    pin,
    scanTime,
    status: parseInt(parts[2], 10) || 0,
    verifyType: parseInt(parts[3], 10) || 0,
  };
}

function parseZktTime(raw) {
  const s = String(raw).trim();
  if (!s) return null;
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function dateKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function genAttId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getUserShift(user) {
  const s = (user?.shift && typeof user.shift === "object") ? user.shift : {};
  return {
    shiftStart: s.shiftStart || "09:00",
    shiftEnd: s.shiftEnd || "18:00",
    graceMinutes: s.graceMinutes ?? 15,
    breakMinutes: s.breakMinutes ?? 60,
    checkoutGraceMinutes: s.checkoutGraceMinutes ?? 10,
  };
}

function shiftDateTime(dateKey, hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const d = new Date(`${dateKey}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

function isWeekendDateKey(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isLateCheckIn(checkInIso, user) {
  if (!checkInIso || !user) return false;
  const d = new Date(checkInIso);
  const dateKey = dateKeyFromDate(d);
  if (isWeekendDateKey(dateKey)) return false;
  const shift = getUserShift(user);
  const start = shiftDateTime(dateKey, shift.shiftStart);
  const lateCutoff = new Date(start.getTime() + shift.graceMinutes * 60000);
  return d > lateCutoff;
}

function computeWorkingMs(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const ms = new Date(checkOut) - new Date(checkIn);
  return ms > 0 ? ms : null;
}

function computeDayStatus(user, checkIn, checkOut) {
  const dateKey = dateKeyFromDate(new Date(checkIn));
  if (!checkIn) return "Absent";
  const late = isLateCheckIn(checkIn, user);
  if (!checkOut) return late ? "Late" : "On Time";
  const net = computeWorkingMs(checkIn, checkOut) || 0;
  const shift = getUserShift(user);
  const start = shiftDateTime(dateKey, shift.shiftStart);
  let end = shiftDateTime(dateKey, shift.shiftEnd);
  if (end <= start) end = new Date(end.getTime() + 86400000);
  const expectedNet = Math.max(0, end - start - shift.breakMinutes * 60000);
  if (expectedNet > 0 && net < expectedNet * 0.5) return "Half Day";
  if (late) return "Late";
  return "On Time";
}

async function logRawRequest(pool, { serial, method, path, query, body }) {
  try {
    await pool.query(
      `INSERT INTO biometric_raw_logs (device_serial, request_method, request_path, query_params, request_body)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        serial || null,
        method || "",
        path || "",
        query ? JSON.stringify(query) : "",
        body != null ? String(body).slice(0, 50000) : "",
      ]
    );
  } catch (e) {
    console.error("[biometric] raw log error:", e.message);
  }
}

async function upsertDevice(pool, serial, req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  const info = req.query.info || req.query.deviceName || "";
  const model = req.query.model || req.query.platform || "";
  const firmware = req.query.pushver || req.query.firmware || req.query.FirmVer || "";

  await pool.query(
    `INSERT INTO biometric_devices (serial_number, device_name, model, firmware_version, ip_address, last_seen, is_active)
     VALUES ($1, $2, $3, $4, $5, NOW(), true)
     ON CONFLICT (serial_number) DO UPDATE SET
       device_name = COALESCE(NULLIF(EXCLUDED.device_name, ''), biometric_devices.device_name),
       model = COALESCE(NULLIF(EXCLUDED.model, ''), biometric_devices.model),
       firmware_version = COALESCE(NULLIF(EXCLUDED.firmware_version, ''), biometric_devices.firmware_version),
       ip_address = EXCLUDED.ip_address,
       last_seen = NOW(),
       is_active = true`,
    [serial, info || ADMS_DEVICE_NAME, model, firmware, ip]
  );
}

async function insertAttLogs(pool, serial, body) {
  let count = 0;
  for (const line of splitLines(body)) {
    const row = parseAttLogLine(line);
    if (!row) continue;
    const dup = await pool.query(
      `SELECT id FROM biometric_logs
       WHERE device_serial = $1 AND pin = $2 AND scan_time = $3 LIMIT 1`,
      [serial, row.pin, row.scanTime]
    );
    if (dup.rows.length) continue;
    await pool.query(
      `INSERT INTO biometric_logs (device_serial, pin, scan_time, status, verify_type, processed)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [serial, row.pin, row.scanTime, row.status, row.verifyType]
    );
    count += 1;
  }
  return count;
}

function parseOperLogUser(line) {
  const s = line.trim();
  if (!s) return null;

  // USER PIN=1 Name=John ...
  if (/^USER\s/i.test(s) || s.includes("PIN=")) {
    const pinM = s.match(/PIN[=:\s]+(\S+)/i);
    const nameM = s.match(/Name[=:\s]+([^\t]+?)(?:\t|$|Pri=|Passwd=|Card=|Grp=)/i)
      || s.match(/Name[=:\s]+(.+?)$/i);
    const pin = pinM ? pinM[1].trim() : null;
    const name = nameM ? nameM[1].trim() : "";
    if (pin) return { pin, name };
  }

  // Tab-separated: PIN\tName\t...
  if (s.includes("\t")) {
    const parts = s.split("\t");
    const pin = String(parts[0] || "").trim();
    const name = String(parts[1] || "").trim();
    if (pin && /^\d+$/.test(pin)) return { pin, name };
  }

  return null;
}

async function insertOperLogUsers(pool, body) {
  let count = 0;
  for (const line of splitLines(body)) {
    if (/^OPLOG/i.test(line) && !line.includes("PIN")) continue;
    const user = parseOperLogUser(line);
    if (!user) continue;
    await pool.query(
      `INSERT INTO biometric_user_map (employee_id, biometric_pin, employee_name, enrolled, enrolled_at)
       VALUES ('', $1, $2, true, NOW())
       ON CONFLICT (biometric_pin) DO UPDATE SET
         employee_name = COALESCE(NULLIF(EXCLUDED.employee_name, ''), biometric_user_map.employee_name),
         enrolled = true,
         enrolled_at = COALESCE(biometric_user_map.enrolled_at, NOW())`,
      [user.pin, user.name || ""]
    );
    count += 1;
  }
  return count;
}

export async function processBiometricAttendance(pool) {
  const { rows: logs } = await pool.query(
    `SELECT * FROM biometric_logs WHERE processed = false ORDER BY scan_time ASC`
  );
  if (!logs.length) return { processed: 0, attendanceUpdated: 0 };

  const { rows: maps } = await pool.query(
    `SELECT biometric_pin, employee_id FROM biometric_user_map WHERE employee_id IS NOT NULL AND employee_id != ''`
  );
  const pinToUser = new Map(maps.map(m => [String(m.biometric_pin), m.employee_id]));

  const { rows: users } = await pool.query(`SELECT id, shift FROM users WHERE status = 'active'`);
  const userById = new Map(users.map(u => [u.id, u]));

  const groups = new Map();
  for (const log of logs) {
    const pin = String(log.pin);
    const userId = pinToUser.get(pin);
    if (!userId) continue;
    const scanTime = new Date(log.scan_time);
    const dateKey = dateKeyFromDate(scanTime);
    const key = `${userId}|${dateKey}`;
    if (!groups.has(key)) groups.set(key, { userId, dateKey, scans: [] });
    groups.get(key).scans.push({ scanTime, logId: log.id });
  }

  let attendanceUpdated = 0;
  const processedLogIds = new Set();

  for (const [, group] of groups) {
    const user = userById.get(group.userId);
    if (!user) continue;

    group.scans.sort((a, b) => a.scanTime - b.scanTime);
    const checkIn = group.scans[0].scanTime.toISOString();
    const checkOut = group.scans.length > 1
      ? group.scans[group.scans.length - 1].scanTime.toISOString()
      : null;

    const late = isLateCheckIn(checkIn, user);
    const status = computeDayStatus(user, checkIn, checkOut);
    const workingMs = checkOut ? computeWorkingMs(checkIn, checkOut) : null;

    const existing = await pool.query(
      `SELECT * FROM attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
      [group.userId, group.dateKey]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO attendance (
           id, user_id, date, check_in, check_out, breaks, short_leaves,
           auto_checkout, working_ms, total_break_ms, status, late, source
         ) VALUES ($1,$2,$3,$4,$5,'[]','[]',false,$6,0,$7,$8,'biometric')`,
        [genAttId(), group.userId, group.dateKey, checkIn, checkOut, workingMs, status, late]
      );
      attendanceUpdated += 1;
    } else {
      const row = existing.rows[0];
      const source = row.source || "manual";
      let newCheckIn = row.check_in;
      let newCheckOut = row.check_out;

      if (source === "biometric") {
        newCheckIn = checkIn;
        newCheckOut = checkOut;
      } else {
        if (!newCheckIn) newCheckIn = checkIn;
        if (!newCheckOut && checkOut) newCheckOut = checkOut;
        else if (checkOut && new Date(checkOut) > new Date(newCheckOut || 0)) newCheckOut = checkOut;
      }

      const finalLate = isLateCheckIn(newCheckIn, user);
      const finalStatus = computeDayStatus(user, newCheckIn, newCheckOut);
      const finalWorkingMs = newCheckOut ? computeWorkingMs(newCheckIn, newCheckOut) : null;
      const newSource = source === "manual" ? "manual" : "biometric";

      await pool.query(
        `UPDATE attendance SET
           check_in = $1, check_out = $2, working_ms = $3, status = $4, late = $5, source = $6
         WHERE id = $7`,
        [newCheckIn, newCheckOut, finalWorkingMs, finalStatus, finalLate, newSource, row.id]
      );
      attendanceUpdated += 1;
    }

    for (const s of group.scans) processedLogIds.add(s.logId);
  }

  if (processedLogIds.size) {
    await pool.query(
      `UPDATE biometric_logs SET processed = true WHERE id = ANY($1::int[])`,
      [[...processedLogIds]]
    );
  }

  return { processed: processedLogIds.size, attendanceUpdated };
}

export function startBiometricProcessor(pool) {
  const intervalMs = 5 * 60 * 1000;
  setInterval(async () => {
    try {
      const r = await processBiometricAttendance(pool);
      if (r.attendanceUpdated > 0) {
        console.log(`[biometric] interval: ${r.processed} logs → ${r.attendanceUpdated} attendance rows`);
      }
    } catch (e) {
      console.error("[biometric] interval error:", e.message);
    }
  }, intervalMs);
  console.log("[biometric] attendance processor scheduled every 5 minutes");
}

/** HR Admin / Executive auth for /api/biometric/* */
export function requireBiometricAdmin(pool) {
  return async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"] || req.query.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required (X-User-Id)" });
      const { rows } = await pool.query("SELECT id, role FROM users WHERE id = $1", [userId]);
      if (!rows[0] || !["HR Admin", "Executive"].includes(rows[0].role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      req.authUser = rows[0];
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

export function registerBiometricRoutes(app, pool) {
  const auth = requireBiometricAdmin(pool);

  /* ─── ADMS device protocol (no auth) ─── */
  app.get("/iclock/cdata", async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    console.log("[biometric] GET /iclock/cdata", serial, req.query);
    await logRawRequest(pool, {
      serial,
      method: "GET",
      path: "/iclock/cdata",
      query: req.query,
      body: "",
    });

    if (!serial) {
      return admsText(res, admsOk());
    }

    try {
      await upsertDevice(pool, serial, req);
      const stamp = req.query.Stamp || req.query.stamp || "0";
      const opstamp = req.query.OpStamp || req.query.opstamp || "0";
      const body = [
        `GET OPTION FROM: ${ADMS_DEVICE_NAME}`,
        `Stamp=${stamp}`,
        `OpStamp=${opstamp}`,
        "ErrorDelay=60",
        "Delay=30",
        "TransTimes=00:00;14:05",
        "TransInterval=1",
        "TransFlag=TransData AttLog\tOpLog\tAttPhoto\tEnrollUser\tEnrollFP\tFPImag",
        "Realtime=1",
        "Encrypt=0",
      ].join("\r\n") + "\r\n";
      admsText(res, body);
    } catch (e) {
      console.error("[biometric] GET cdata error:", e.message);
      admsText(res, admsOk());
    }
  });

  app.post("/iclock/cdata", async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    const table = String(req.query.table || req.query.Table || "").toUpperCase();
    const body = typeof req.body === "string" ? req.body : (req.body ? String(req.body) : "");
    console.log("[biometric] POST /iclock/cdata", serial, table, `${String(body).slice(0, 200)}...`);
    await logRawRequest(pool, {
      serial,
      method: "POST",
      path: "/iclock/cdata",
      query: req.query,
      body,
    });

    try {
      if (serial) await upsertDevice(pool, serial, req);

      if (table === "ATTLOG") {
        const n = await insertAttLogs(pool, serial, body);
        console.log(`[biometric] inserted ${n} ATTLOG rows`);
        const r = await processBiometricAttendance(pool);
        console.log(`[biometric] processed ${r.processed} logs, ${r.attendanceUpdated} attendance updates`);
      } else if (table === "OPERLOG") {
        const n = await insertOperLogUsers(pool, body);
        console.log(`[biometric] synced ${n} OPERLOG users`);
      }

      admsText(res, admsOk());
    } catch (e) {
      console.error("[biometric] POST cdata error:", e.message);
      admsText(res, admsOk());
    }
  });

  app.get("/iclock/getrequest", async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    console.log("[biometric] GET /iclock/getrequest", serial);
    await logRawRequest(pool, {
      serial,
      method: "GET",
      path: "/iclock/getrequest",
      query: req.query,
      body: "",
    });

    try {
      if (serial) {
        await pool.query(
          `UPDATE biometric_devices SET last_seen = NOW(), is_active = true WHERE serial_number = $1`,
          [serial]
        );
      }

      const { rows } = await pool.query(
        `SELECT id, command_data FROM device_commands
         WHERE device_serial = $1 AND status = 'pending'
         ORDER BY id ASC LIMIT 1`,
        [serial]
      );

      if (rows.length) {
        const cmd = rows[0];
        await pool.query(
          `UPDATE device_commands SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [cmd.id]
        );
        admsText(res, `C:${cmd.id}:${cmd.command_data || ""}\r\n`);
        return;
      }

      admsText(res, admsOk());
    } catch (e) {
      console.error("[biometric] getrequest error:", e.message);
      admsText(res, admsOk());
    }
  });

  app.post("/iclock/devicecmd", async (req, res) => {
    const serial = String(req.query.SN || req.query.sn || "").trim();
    const body = typeof req.body === "string" ? req.body : (req.body ? String(req.body) : "");
    console.log("[biometric] POST /iclock/devicecmd", serial, body);
    await logRawRequest(pool, {
      serial,
      method: "POST",
      path: "/iclock/devicecmd",
      query: req.query,
      body,
    });

    try {
      const idM = String(body).match(/ID=([0-9]+)/i) || String(body).match(/^([0-9]+)/);
      const cmdId = idM ? parseInt(idM[1], 10) : null;
      if (cmdId) {
        await pool.query(
          `UPDATE device_commands SET status = 'completed', completed_at = NOW(), result = $1 WHERE id = $2`,
          [String(body).slice(0, 2000), cmdId]
        );
      }
      admsText(res, admsOk());
    } catch (e) {
      console.error("[biometric] devicecmd error:", e.message);
      admsText(res, admsOk());
    }
  });

  /* ─── Portal API (authenticated) ─── */
  app.get("/api/biometric/status", auth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT serial_number, device_name, model, firmware_version, ip_address, last_seen, is_active
         FROM biometric_devices ORDER BY last_seen DESC NULLS LAST LIMIT 1`
      );
      const device = rows[0] || null;
      const connected = device?.last_seen
        && (Date.now() - new Date(device.last_seen).getTime()) < 10 * 60 * 1000;
      res.json({ device, connected: !!connected });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/biometric/logs", auth, async (req, res) => {
    try {
      const date = req.query.date || dateKeyFromDate(new Date());
      const { rows } = await pool.query(
        `SELECT bl.id, bl.pin, bl.scan_time, bl.status, bl.verify_type, bl.processed,
                bm.employee_id, bm.employee_name, u.name AS portal_name
         FROM biometric_logs bl
         LEFT JOIN biometric_user_map bm ON bm.biometric_pin = bl.pin
         LEFT JOIN users u ON u.id = bm.employee_id
         WHERE bl.scan_time::date = $1::date
         ORDER BY bl.scan_time DESC`,
        [date]
      );
      res.json(rows.map(r => ({
        id: r.id,
        pin: r.pin,
        scanTime: r.scan_time,
        status: r.status,
        verifyType: r.verify_type,
        processed: r.processed,
        employeeId: r.employee_id || "",
        employeeName: r.portal_name || r.employee_name || "",
      })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/biometric/users", auth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT bm.*, u.name AS portal_name, u.email AS portal_email
         FROM biometric_user_map bm
         LEFT JOIN users u ON u.id = bm.employee_id
         ORDER BY CAST(NULLIF(regexp_replace(bm.biometric_pin, '[^0-9]', '', 'g'), '') AS INTEGER) NULLS LAST, bm.biometric_pin`
      );
      res.json(rows.map(r => ({
        pin: r.biometric_pin,
        name: r.employee_name || "",
        employeeId: r.employee_id || "",
        portalName: r.portal_name || "",
        portalEmail: r.portal_email || "",
        enrolled: r.enrolled,
        enrolledAt: r.enrolled_at,
        mapped: !!(r.employee_id && r.employee_id !== ""),
      })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/biometric/map", auth, async (req, res) => {
    try {
      const { pin, employee_id: employeeId } = req.body || {};
      if (!pin || !employeeId) {
        return res.status(400).json({ error: "pin and employee_id are required" });
      }
      const { rows: users } = await pool.query("SELECT name FROM users WHERE id = $1", [employeeId]);
      if (!users.length) return res.status(404).json({ error: "Employee not found" });

      await pool.query(
        `INSERT INTO biometric_user_map (employee_id, biometric_pin, employee_name, enrolled, enrolled_at)
         VALUES ($1, $2, $3, true, NOW())
         ON CONFLICT (biometric_pin) DO UPDATE SET
           employee_id = EXCLUDED.employee_id,
           employee_name = COALESCE(biometric_user_map.employee_name, EXCLUDED.employee_name),
           enrolled = true`,
        [employeeId, String(pin), users[0].name]
      );

      await processBiometricAttendance(pool);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/biometric/map/:pin", auth, async (req, res) => {
    try {
      await pool.query(
        `UPDATE biometric_user_map SET employee_id = '' WHERE biometric_pin = $1`,
        [req.params.pin]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/biometric/unmatched", auth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT biometric_pin AS pin, employee_name AS name, enrolled, enrolled_at
         FROM biometric_user_map
         WHERE employee_id IS NULL OR employee_id = ''
         ORDER BY biometric_pin`
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/biometric/raw-logs", auth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const { rows } = await pool.query(
        `SELECT id, device_serial, request_method, request_path, query_params, request_body, created_at
         FROM biometric_raw_logs ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/biometric/process", auth, async (_req, res) => {
    try {
      const r = await processBiometricAttendance(pool);
      res.json({ ok: true, ...r });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
