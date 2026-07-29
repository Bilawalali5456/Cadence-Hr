import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import { syncAttendanceFromLogs } from "../lib/attendanceSync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const before = await pool.query(
    "SELECT COUNT(*)::int AS count FROM attendance_logs WHERE synced_to_attendance = false AND is_duplicate = false"
  );

  await pool.query("BEGIN");
  await pool.query(
    "UPDATE attendance_logs SET synced_to_attendance = false, updated_at = NOW() WHERE employee_id IS NOT NULL"
  );
  await pool.query("DELETE FROM attendance");
  await pool.query("COMMIT");

  const afterFlag = await pool.query(
    "SELECT COUNT(*)::int AS count FROM attendance_logs WHERE synced_to_attendance = false AND is_duplicate = false"
  );

  const sync = await syncAttendanceFromLogs(pool);
  const sample = await pool.query(
    "SELECT user_id, date, check_in, check_out, status FROM attendance WHERE date IN ($1, $2) ORDER BY user_id, date LIMIT 20",
    ["2026-07-28", "2026-07-29"]
  );

  console.log(JSON.stringify({
    beforeUnsynced: before.rows[0].count,
    afterUnsynced: afterFlag.rows[0].count,
    sync,
    sample: sample.rows,
  }, null, 2));
} catch (err) {
  try {
    await pool.query("ROLLBACK");
  } catch {}
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
