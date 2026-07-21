/**
 * HRMS admin API for biometric attendance (/api/v1/attendance/*)
 * JSON responses for portal frontend.
 */

import { syncAttendanceFromLogs } from "../lib/attendanceSync.js";
import { dateKeyFromDate } from "../lib/admsHelpers.js";
import { queueAttlogPullCommands } from "./adms.js";

export function requireHrAdmin(pool) {
  return async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"] || req.query.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required (X-User-Id header)" });
      const { rows } = await pool.query("SELECT id, role, name FROM users WHERE id = $1", [userId]);
      if (!rows[0] || !["HR Admin", "Executive"].includes(rows[0].role)) {
        return res.status(403).json({ error: "Forbidden — HR Admin or Executive only" });
      }
      req.authUser = rows[0];
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

function mapLogRow(r) {
  return {
    id: r.id,
    employeeId: r.employee_id || null,
    employeeName: r.employee_name || r.portal_name || null,
    deviceUserId: r.device_user_id,
    deviceSerialNumber: r.device_serial_number,
    punchTime: r.punch_time,
    punchType: r.punch_type,
    verifyMethod: r.verify_method,
    isDuplicate: r.is_duplicate,
    rawData: r.raw_data,
    createdAt: r.created_at,
  };
}

export function registerAttendanceApi(app, pool) {
  const auth = requireHrAdmin(pool);

  /** GET /api/v1/attendance/logs */
  app.get("/api/v1/attendance/logs", auth, async (req, res) => {
    try {
      const { date, employee_id: employeeId, from, to } = req.query;
      const conditions = ["al.is_duplicate = false"];
      const params = [];
      let i = 1;

      if (date) {
        conditions.push(`al.punch_time::date = $${i++}::date`);
        params.push(date);
      }
      if (from) {
        conditions.push(`al.punch_time >= $${i++}`);
        params.push(from);
      }
      if (to) {
        conditions.push(`al.punch_time <= $${i++}`);
        params.push(to);
      }
      if (employeeId) {
        conditions.push(`al.employee_id = $${i++}`);
        params.push(employeeId);
      }

      const { rows } = await pool.query(
        `SELECT al.*, u.name AS portal_name, u.name AS employee_name
         FROM attendance_logs al
         LEFT JOIN users u ON u.id = al.employee_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY al.punch_time DESC
         LIMIT 500`,
        params
      );
      res.json(rows.map(mapLogRow));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /api/v1/attendance/devices */
  app.get("/api/v1/attendance/devices", auth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, serial_number, device_name, firmware_version, ip_address,
                last_seen, is_active, attlog_stamp, operlog_stamp, created_at, updated_at
         FROM biometric_devices ORDER BY last_seen DESC NULLS LAST`
      );
      const devices = rows.map(d => ({
        ...d,
        connected: d.last_seen && (Date.now() - new Date(d.last_seen).getTime()) < 10 * 60 * 1000,
      }));
      res.json(devices);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST /api/v1/attendance/device-mapping */
  app.post("/api/v1/attendance/device-mapping", auth, async (req, res) => {
    try {
      const {
        device_user_id: deviceUserId,
        employee_id: employeeId,
        device_serial_number: deviceSerial,
      } = req.body || {};

      if (deviceUserId == null || !employeeId || !deviceSerial) {
        return res.status(400).json({
          error: "device_user_id, employee_id, and device_serial_number are required",
        });
      }

      const { rows: users } = await pool.query("SELECT id, name FROM users WHERE id = $1", [employeeId]);
      if (!users.length) return res.status(404).json({ error: "Employee not found" });

      await pool.query(
        `INSERT INTO device_user_mapping (device_user_id, employee_id, device_serial_number, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (device_serial_number, device_user_id) DO UPDATE SET
           employee_id = EXCLUDED.employee_id,
           updated_at = NOW()`,
        [parseInt(deviceUserId, 10), employeeId, String(deviceSerial)]
      );

      await pool.query(
        `UPDATE attendance_logs SET employee_id = $1, updated_at = NOW()
         WHERE device_serial_number = $2 AND device_user_id = $3 AND employee_id IS NULL`,
        [employeeId, String(deviceSerial), parseInt(deviceUserId, 10)]
      );

      await syncAttendanceFromLogs(pool);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /** DELETE mapping */
  app.delete("/api/v1/attendance/device-mapping/:deviceSerial/:deviceUserId", auth, async (req, res) => {
    try {
      await pool.query(
        `DELETE FROM device_user_mapping
         WHERE device_serial_number = $1 AND device_user_id = $2`,
        [req.params.deviceSerial, parseInt(req.params.deviceUserId, 10)]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /api/v1/attendance/unmapped */
  app.get("/api/v1/attendance/unmapped", auth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT DISTINCT al.device_user_id, al.device_serial_number,
                COUNT(*)::int AS punch_count,
                MAX(al.punch_time) AS last_punch
         FROM attendance_logs al
         LEFT JOIN device_user_mapping dm
           ON dm.device_serial_number = al.device_serial_number
          AND dm.device_user_id = al.device_user_id
         WHERE al.employee_id IS NULL AND dm.id IS NULL AND al.is_duplicate = false
         GROUP BY al.device_user_id, al.device_serial_number
         ORDER BY al.device_user_id`
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /api/v1/attendance/mappings */
  app.get("/api/v1/attendance/mappings", auth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT dm.*, u.name AS employee_name, u.email AS employee_email
         FROM device_user_mapping dm
         LEFT JOIN users u ON u.id = dm.employee_id
         ORDER BY dm.device_serial_number, dm.device_user_id`
      );
      res.json(rows.map(r => ({
        id: r.id,
        deviceUserId: r.device_user_id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        employeeEmail: r.employee_email,
        deviceSerialNumber: r.device_serial_number,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST /api/v1/attendance/sync — manual re-sync */
  app.post("/api/v1/attendance/sync", auth, async (_req, res) => {
    try {
      const r = await syncAttendanceFromLogs(pool);
      res.json({ ok: true, ...r });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST /api/v1/attendance/pull-logs — queue CHECK + DATA QUERY ATTLOG for device */
  app.post("/api/v1/attendance/pull-logs", auth, async (req, res) => {
    try {
      const serial = String(req.body?.serial || req.query.serial || "NYU7253801377").trim();
      await queueAttlogPullCommands(pool, serial, { force: true });
      res.json({ ok: true, serial, queued: ["CHECK", "DATA QUERY ATTLOG"], force: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/biometric/pull-logs", auth, async (req, res) => {
    try {
      const serial = String(req.body?.serial || "NYU7253801377").trim();
      await queueAttlogPullCommands(pool, serial, { force: true });
      res.json({ ok: true, serial });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /api/v1/attendance/raw-logs — debug */
  app.get("/api/v1/attendance/raw-logs", auth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const { rows } = await pool.query(
        `SELECT * FROM biometric_raw_logs ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ─── Legacy /api/biometric/* aliases for existing BiometricPage ─── */
  app.get("/api/biometric/status", auth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM biometric_devices ORDER BY last_seen DESC NULLS LAST LIMIT 1`
      );
      const device = rows[0] || null;
      const connected = device?.last_seen
        && (Date.now() - new Date(device.last_seen).getTime()) < 15 * 60 * 1000;

      const { rows: rawRows } = await pool.query(
        `SELECT device_serial, request_method, request_path, query_params, created_at
         FROM biometric_raw_logs
         WHERE request_path LIKE '/iclock%'
         ORDER BY created_at DESC LIMIT 15`
      );

      const { rows: attCountRows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM attendance_logs WHERE is_duplicate = false`
      );
      const { rows: todayAttRows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM attendance_logs
         WHERE is_duplicate = false AND punch_time::date = CURRENT_DATE`
      );
      const { rows: postAttRows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM biometric_raw_logs
         WHERE request_method = 'POST' AND request_path LIKE '%/cdata%'
           AND (query_params ILIKE '%ATTLOG%' OR query_params ILIKE '%"table":"ATTLOG"%')`
      );
      const { rows: pendingCmd } = await pool.query(
        `SELECT id, command_type, command_data, status, created_at FROM device_commands
         WHERE device_serial = $1 AND status = 'pending' ORDER BY id ASC LIMIT 5`,
        [device?.serial_number || "NYU7253801377"]
      );

      const attlogPosts = postAttRows[0]?.n || 0;
      const punchCount = attCountRows[0]?.n || 0;
      const todayPunches = todayAttRows[0]?.n || 0;
      const isPolling = rawRows.some(r =>
        r.request_method === "GET" && String(r.request_path).includes("getrequest")
        && r.device_serial === (device?.serial_number || "NYU7253801377")
      );

      let diagnosis = "waiting";
      if (!device) diagnosis = "no_device";
      else if (attlogPosts === 0 && punchCount === 0) {
        diagnosis = isPolling
          ? "polling_no_attlog"
          : "offline_no_attlog";
      } else if (todayPunches === 0) {
        diagnosis = "connected_no_today_punches";
      } else {
        diagnosis = "ok";
      }

      res.json({
        device,
        connected: !!connected,
        diagnosis,
        stats: {
          attlogPosts,
          punchCount,
          todayPunches,
          pendingCommands: pendingCmd.length,
        },
        pendingCommands: pendingCmd,
        recentIclockRequests: rawRows.map(r => ({
          serial: r.device_serial,
          method: r.request_method,
          path: r.request_path,
          query: r.query_params,
          at: r.created_at,
        })),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/biometric/logs", auth, async (req, res) => {
    req.query.date = req.query.date || dateKeyFromDate(new Date());
    const date = req.query.date;
    try {
      const { rows } = await pool.query(
        `SELECT al.*, u.name AS portal_name
         FROM attendance_logs al
         LEFT JOIN users u ON u.id = al.employee_id
         WHERE al.punch_time::date = $1::date AND al.is_duplicate = false
         ORDER BY al.punch_time DESC`,
        [date]
      );
      res.json(rows.map(r => ({
        id: r.id,
        pin: String(r.device_user_id),
        scanTime: r.punch_time,
        punchType: r.punch_type,
        verifyMethod: r.verify_method,
        employeeId: r.employee_id || "",
        employeeName: r.portal_name || "",
      })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/biometric/users", auth, async (_req, res) => {
    try {
      const { rows: mapped } = await pool.query(
        `SELECT dm.device_user_id AS pin, dm.employee_id, dm.device_serial_number,
                u.name AS portal_name, u.email AS portal_email
         FROM device_user_mapping dm
         LEFT JOIN users u ON u.id = dm.employee_id
         ORDER BY dm.device_user_id`
      );
      const { rows: unmapped } = await pool.query(
        `SELECT DISTINCT device_user_id AS pin, device_serial_number
         FROM attendance_logs
         WHERE employee_id IS NULL AND is_duplicate = false
         ORDER BY device_user_id`
      );
      const seen = new Set(mapped.map(m => `${m.device_serial_number}:${m.pin}`));
      const users = mapped.map(r => ({
        pin: String(r.pin),
        name: "",
        employeeId: r.employee_id || "",
        portalName: r.portal_name || "",
        portalEmail: r.portal_email || "",
        deviceSerial: r.device_serial_number,
        mapped: !!r.employee_id,
      }));
      for (const u of unmapped) {
        const key = `${u.device_serial_number}:${u.pin}`;
        if (seen.has(key)) continue;
        users.push({
          pin: String(u.pin),
          name: "",
          employeeId: "",
          portalName: "",
          portalEmail: "",
          deviceSerial: u.device_serial_number,
          mapped: false,
        });
      }
      res.json(users);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/biometric/map", auth, async (req, res) => {
    try {
      const { pin, employee_id: employeeId, device_serial_number: deviceSerial } = req.body || {};
      if (!pin || !employeeId) {
        return res.status(400).json({ error: "pin and employee_id are required" });
      }
      let serial = deviceSerial;
      if (!serial) {
        const { rows } = await pool.query(
          `SELECT serial_number FROM biometric_devices ORDER BY last_seen DESC NULLS LAST LIMIT 1`
        );
        serial = rows[0]?.serial_number;
      }
      if (!serial) return res.status(400).json({ error: "No device registered yet" });

      await pool.query(
        `INSERT INTO device_user_mapping (device_user_id, employee_id, device_serial_number, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (device_serial_number, device_user_id) DO UPDATE SET
           employee_id = EXCLUDED.employee_id, updated_at = NOW()`,
        [parseInt(pin, 10), employeeId, serial]
      );

      await pool.query(
        `UPDATE attendance_logs SET employee_id = $1, updated_at = NOW()
         WHERE device_serial_number = $2 AND device_user_id = $3`,
        [employeeId, serial, parseInt(pin, 10)]
      );

      await syncAttendanceFromLogs(pool);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/biometric/map/:pin", auth, async (req, res) => {
    try {
      let serial = req.query.device_serial_number;
      if (!serial) {
        const { rows } = await pool.query(
          `SELECT serial_number FROM biometric_devices ORDER BY last_seen DESC NULLS LAST LIMIT 1`
        );
        serial = rows[0]?.serial_number;
      }
      if (!serial) {
        return res.status(400).json({ error: "device_serial_number required (no registered device found)" });
      }

      await pool.query(
        `DELETE FROM device_user_mapping
         WHERE device_serial_number = $1 AND device_user_id = $2`,
        [String(serial), parseInt(req.params.pin, 10)]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/biometric/process", auth, async (_req, res) => {
    try {
      const r = await syncAttendanceFromLogs(pool);
      res.json({ ok: true, ...r });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/biometric/raw-logs", auth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const { rows } = await pool.query(
        `SELECT * FROM biometric_raw_logs ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
