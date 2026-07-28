/**
 * PIN → employee mapping helpers.
 * Mappings are only created/updated via manual map API or employee deletion.
 * OPERLOG / ATTLOG sync must never remove or overwrite existing mappings.
 */

const MAPPING_LOOKUP_SQL = `
  SELECT employee_id, device_serial_number
  FROM device_user_mapping
  WHERE device_user_id = $1
  ORDER BY CASE WHEN device_serial_number = $2 THEN 0 ELSE 1 END,
           updated_at DESC NULLS LAST,
           id DESC
  LIMIT 1
`;

/** Resolve employee for a device PIN, preferring the current device serial. */
export async function resolveMappedEmployeeId(pool, deviceSerial, deviceUserId) {
  const pin = parseInt(deviceUserId, 10);
  if (!Number.isFinite(pin)) return null;
  const { rows } = await pool.query(MAPPING_LOOKUP_SQL, [pin, String(deviceSerial || "")]);
  return rows[0]?.employee_id || null;
}

export async function getPinMapping(pool, deviceSerial, deviceUserId) {
  const pin = parseInt(deviceUserId, 10);
  if (!Number.isFinite(pin)) return null;
  const { rows } = await pool.query(MAPPING_LOOKUP_SQL, [pin, String(deviceSerial || "")]);
  return rows[0] || null;
}

export async function logPinMappingAudit(db, entry) {
  const {
    action,
    deviceUserId,
    deviceSerialNumber = null,
    employeeId = null,
    previousEmployeeId = null,
    actorUserId = null,
    actorName = null,
    actorRole = null,
    source = "system",
    details = null,
  } = entry;

  const pin = parseInt(deviceUserId, 10);
  if (!Number.isFinite(pin)) return;

  try {
    await db.query(
      `INSERT INTO device_user_mapping_audit (
         action, device_user_id, device_serial_number, employee_id, previous_employee_id,
         actor_user_id, actor_name, actor_role, source, details
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        action,
        pin,
        deviceSerialNumber,
        employeeId,
        previousEmployeeId,
        actorUserId,
        actorName,
        actorRole,
        source,
        details ? JSON.stringify(details) : null,
      ]
    );
    console.log(
      `[pin-mapping] ${action} pin=${pin} serial=${deviceSerialNumber || "—"} ` +
      `employee=${employeeId || "—"} by=${actorName || actorUserId || "system"} (${source})`
    );
  } catch (e) {
    console.error("[pin-mapping] audit log failed:", e.message);
  }
}

/** Known device serials for a PIN (logs, enrolled users, primary device). */
async function knownSerialsForPin(pool, pin, primarySerial) {
  const { rows } = await pool.query(
    `SELECT DISTINCT serial FROM (
       SELECT device_serial_number AS serial FROM attendance_logs WHERE device_user_id = $1
       UNION
       SELECT device_serial_number FROM device_enrolled_users WHERE device_user_id = $1
       UNION
       SELECT $2::varchar WHERE $2 IS NOT NULL AND $2 <> ''
     ) s
     WHERE serial IS NOT NULL AND serial <> ''`,
    [pin, primarySerial || null]
  );
  return rows.map(r => r.serial);
}

/**
 * Manual map: upsert mapping for all known device serials for this PIN.
 * Never removes mappings for other PINs.
 */
export async function manualMapPin(pool, { pin, employeeId, deviceSerial, actor, source = "manual_map" }) {
  const deviceUserId = parseInt(pin, 10);
  if (!Number.isFinite(deviceUserId) || !employeeId) {
    throw new Error("Invalid pin or employee_id");
  }

  const serials = await knownSerialsForPin(pool, deviceUserId, deviceSerial);
  if (!serials.length) {
    if (!deviceSerial) throw new Error("No device registered yet");
    serials.push(deviceSerial);
  }

  const previous = await getPinMapping(pool, deviceSerial || serials[0], deviceUserId);
  const previousEmployeeId = previous?.employee_id || null;

  for (const serial of serials) {
    await pool.query(
      `INSERT INTO device_user_mapping (device_user_id, employee_id, device_serial_number, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (device_serial_number, device_user_id) DO UPDATE SET
         employee_id = EXCLUDED.employee_id,
         updated_at = NOW()`,
      [deviceUserId, employeeId, serial]
    );
  }

  await logPinMappingAudit(pool, {
    action: previousEmployeeId && previousEmployeeId !== employeeId ? "remap" : "map",
    deviceUserId,
    deviceSerialNumber: deviceSerial || serials[0],
    employeeId,
    previousEmployeeId,
    actorUserId: actor?.id || null,
    actorName: actor?.name || null,
    actorRole: actor?.role || null,
    source,
    details: { serials },
  });

  return { serials, previousEmployeeId };
}

/** Manual unmap — only via explicit API call. */
export async function manualUnmapPin(pool, { pin, deviceSerial, actor, source = "manual_unmap" }) {
  const deviceUserId = parseInt(pin, 10);
  if (!Number.isFinite(deviceUserId)) throw new Error("Invalid pin");

  let serial = deviceSerial;
  if (!serial) {
    const existing = await getPinMapping(pool, "", deviceUserId);
    serial = existing?.device_serial_number;
  }
  if (!serial) return { removed: 0, serial: null, previousEmployeeId: null };

  const { rows: before } = await pool.query(
    `SELECT employee_id FROM device_user_mapping
     WHERE device_serial_number = $1 AND device_user_id = $2`,
    [serial, deviceUserId]
  );
  const previousEmployeeId = before[0]?.employee_id || null;
  if (!previousEmployeeId) return { removed: 0, serial, previousEmployeeId: null };

  const { rowCount } = await pool.query(
    `DELETE FROM device_user_mapping
     WHERE device_user_id = $1 AND device_serial_number = $2`,
    [deviceUserId, serial]
  );

  if (rowCount > 0) {
    await logPinMappingAudit(pool, {
      action: "unmap",
      deviceUserId,
      deviceSerialNumber: serial,
      employeeId: null,
      previousEmployeeId,
      actorUserId: actor?.id || null,
      actorName: actor?.name || null,
      actorRole: actor?.role || null,
      source,
    });
  }

  return { removed: rowCount || 0, previousEmployeeId, serial };
}

/** Employee deletion — remove all mappings for employee (expected cascade). */
export async function deleteMappingsForEmployee(db, employeeId, { actor = null, employeeName = null } = {}) {
  const query = (text, params) => db.query(text, params);

  const { rows } = await query(
    `SELECT device_user_id, device_serial_number, employee_id
     FROM device_user_mapping WHERE employee_id = $1`,
    [employeeId]
  );

  if (!rows.length) return 0;

  for (const row of rows) {
    await logPinMappingAudit(db, {
      action: "delete_employee",
      deviceUserId: row.device_user_id,
      deviceSerialNumber: row.device_serial_number,
      employeeId: null,
      previousEmployeeId: row.employee_id,
      actorUserId: actor?.id || null,
      actorName: actor?.name || null,
      actorRole: actor?.role || null,
      source: "employee_delete",
      details: employeeName ? { employeeName } : null,
    });
  }

  const { rowCount } = await query(
    "DELETE FROM device_user_mapping WHERE employee_id = $1",
    [employeeId]
  );
  return rowCount || 0;
}

/** SQL fragment: lateral join resolving best mapping for a PIN (serial-aware). */
export const PIN_MAPPING_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT dm.employee_id, dm.device_serial_number AS map_serial
    FROM device_user_mapping dm
    WHERE dm.device_user_id = src_pin
    ORDER BY CASE WHEN dm.device_serial_number = src_serial THEN 0 ELSE 1 END,
             dm.updated_at DESC NULLS LAST,
             dm.id DESC
    LIMIT 1
  ) pin_map ON true
`;
