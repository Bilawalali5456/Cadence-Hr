/**
 * Biometric / ZK pull admin API (JSON for HRMS frontend)
 */

import { syncAttendanceFromLogs } from "../lib/attendanceSync.js";
import { pullFromDevice, getPullStatus } from "../lib/zkPull.js";

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

export function registerAttendanceApi(app, pool) {
  const auth = requireHrAdmin(pool);

  app.get("/api/biometric/status", auth, async (_req, res) => {
    try {
      const pull = getPullStatus();
      const { rows } = await pool.query(
        `SELECT * FROM biometric_devices ORDER BY last_seen DESC NULLS LAST LIMIT 1`
      );
      res.json({
        device: rows[0] || null,
        connected: pull.connected,
        pull,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/biometric/pull", auth, async (_req, res) => {
    try {
      const result = await pullFromDevice(pool);
      res.json({ ...result, pull: getPullStatus() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/biometric/logs", auth, async (req, res) => {
    try {
      const date = req.query.date || dateKey(new Date());
      const method = String(req.query.method || "all").toLowerCase();
      const params = [date];
      let methodSql = "";
      if (method && method !== "all") {
        params.push(method);
        methodSql = ` AND al.verify_method = $2`;
      }

      const { rows } = await pool.query(
        `SELECT al.*, u.name AS portal_name, deu.name AS enrolled_name
         FROM attendance_logs al
         LEFT JOIN users u ON u.id = al.employee_id
         LEFT JOIN device_enrolled_users deu
           ON deu.device_serial_number = al.device_serial_number
          AND deu.device_user_id = al.device_user_id
         WHERE al.punch_time::date = $1::date AND al.is_duplicate = false
         ${methodSql}
         ORDER BY al.punch_time DESC`,
        params
      );

      res.json(rows.map(r => ({
        id: r.id,
        pin: String(r.device_user_id),
        scanTime: r.punch_time,
        punchType: r.punch_type,
        verifyMethod: r.verify_method,
        employeeId: r.employee_id || "",
        employeeName: r.portal_name || r.enrolled_name || "",
      })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/biometric/users", auth, async (_req, res) => {
    try {
      const { rows: enrolled } = await pool.query(
        `SELECT deu.device_user_id AS pin, deu.name, deu.device_serial_number,
                dm.employee_id, u.name AS portal_name, u.email AS portal_email
         FROM device_enrolled_users deu
         LEFT JOIN device_user_mapping dm
           ON dm.device_serial_number = deu.device_serial_number
          AND dm.device_user_id = deu.device_user_id
         LEFT JOIN users u ON u.id = dm.employee_id
         ORDER BY deu.device_user_id`
      );

      const { rows: mappedOnly } = await pool.query(
        `SELECT dm.device_user_id AS pin, dm.device_serial_number, dm.employee_id,
                u.name AS portal_name, u.email AS portal_email
         FROM device_user_mapping dm
         LEFT JOIN users u ON u.id = dm.employee_id
         WHERE NOT EXISTS (
           SELECT 1 FROM device_enrolled_users deu
           WHERE deu.device_serial_number = dm.device_serial_number
             AND deu.device_user_id = dm.device_user_id
         )
         ORDER BY dm.device_user_id`
      );

      const users = [
        ...enrolled.map(r => ({
          pin: String(r.pin),
          name: r.name || "",
          employeeId: r.employee_id || "",
          portalName: r.portal_name || "",
          portalEmail: r.portal_email || "",
          deviceSerial: r.device_serial_number,
          mapped: !!r.employee_id,
        })),
        ...mappedOnly.map(r => ({
          pin: String(r.pin),
          name: "",
          employeeId: r.employee_id || "",
          portalName: r.portal_name || "",
          portalEmail: r.portal_email || "",
          deviceSerial: r.device_serial_number,
          mapped: !!r.employee_id,
        })),
      ];

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
        serial = rows[0]?.serial_number || process.env.ZK_DEVICE_SERIAL || "NYU7253801377";
      }

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
        serial = rows[0]?.serial_number || process.env.ZK_DEVICE_SERIAL || "NYU7253801377";
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
}
