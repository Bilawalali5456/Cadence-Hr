/**
 * Permanently delete an employee and all related records.
 * Monthly summaries are computed — no separate table.
 * Breaks and correction logs live on attendance rows.
 * WFH requests are leave_requests with type = 'WFH'.
 */
export async function deleteEmployeeCascade(pool, userId) {
  if (!userId) return { ok: false, error: "Employee id is required." };

  const client = await pool.connect();
  const counts = {};

  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query("SELECT id, name FROM users WHERE id = $1", [userId]);
    if (!existing.length) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Employee not found." };
    }

    const { rows: pinRows } = await client.query(
      "SELECT biometric_pin FROM biometric_user_map WHERE employee_id = $1",
      [userId]
    );
    const pins = pinRows.map((r) => r.biometric_pin).filter(Boolean);

    counts.attendanceLogs = (await client.query(
      "DELETE FROM attendance_logs WHERE employee_id = $1",
      [userId]
    )).rowCount;

    counts.deviceUserMapping = (await client.query(
      "DELETE FROM device_user_mapping WHERE employee_id = $1",
      [userId]
    )).rowCount;

    counts.biometricUserMap = (await client.query(
      "DELETE FROM biometric_user_map WHERE employee_id = $1",
      [userId]
    )).rowCount;

    if (pins.length) {
      counts.biometricLogs = (await client.query(
        "DELETE FROM biometric_logs WHERE pin = ANY($1::text[])",
        [pins]
      )).rowCount;
    } else {
      counts.biometricLogs = 0;
    }

    counts.attendance = (await client.query(
      "DELETE FROM attendance WHERE user_id = $1",
      [userId]
    )).rowCount;

    counts.leaveRequests = (await client.query(
      "DELETE FROM leave_requests WHERE user_id = $1",
      [userId]
    )).rowCount;

    counts.shortLeaveRequests = (await client.query(
      "DELETE FROM short_leave_requests WHERE user_id = $1",
      [userId]
    )).rowCount;

    counts.payroll = (await client.query(
      "DELETE FROM payroll WHERE user_id = $1",
      [userId]
    )).rowCount;

    counts.notifications = (await client.query(
      "DELETE FROM notifications WHERE user_id = $1",
      [userId]
    )).rowCount;

    counts.warnings = (await client.query(
      "DELETE FROM warnings WHERE user_id = $1",
      [userId]
    )).rowCount;

    counts.assetsUnassigned = (await client.query(
      `UPDATE assets
       SET assigned_to = NULL, status = 'available',
           return_date = COALESCE(NULLIF(return_date, ''), TO_CHAR(NOW(), 'YYYY-MM-DD'))
       WHERE assigned_to = $1`,
      [userId]
    )).rowCount;

    counts.users = (await client.query(
      "DELETE FROM users WHERE id = $1",
      [userId]
    )).rowCount;

    await client.query("COMMIT");
    return { ok: true, name: existing[0].name, counts };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
