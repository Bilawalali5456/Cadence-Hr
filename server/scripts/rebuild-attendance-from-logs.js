import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import {
  syncAttendanceFromLogs,
  computeNetWorkingMs,
  computeMissingCheckoutWorkingMs,
  computeBreakMs,
} from "../lib/attendanceSync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const before = await pool.query(
    "SELECT COUNT(*)::int AS count FROM attendance_logs WHERE synced_to_attendance = false AND is_duplicate = false"
  );

  // Preserve portal break / short-leave data across rebuild (biometric re-insert wipes these).
  const { rows: breakSnapshots } = await pool.query(
    `SELECT user_id, date, breaks, break_start, break_end, total_break_ms, short_leaves
     FROM attendance
     WHERE breaks IS NOT NULL
        OR break_start IS NOT NULL
        OR break_end IS NOT NULL
        OR COALESCE(total_break_ms, 0) > 0
        OR short_leaves IS NOT NULL`
  );
  const breakByKey = new Map(
    breakSnapshots.map(r => [`${r.user_id}|${String(r.date).slice(0, 10)}`, r])
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

  // Restore saved break / short-leave fields onto rebuilt rows and fix working_ms.
  const { rows: users } = await pool.query(`SELECT id, shift FROM users WHERE status = 'active'`);
  const userById = new Map(users.map(u => [u.id, u]));
  let breaksRestored = 0;

  for (const [key, saved] of breakByKey) {
    const [userId, dateKey] = key.split("|");
    const { rows } = await pool.query(
      `SELECT id, check_in, check_out, status FROM attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
      [userId, dateKey]
    );
    if (!rows.length) continue;
    const row = rows[0];
    const breaks = saved.breaks ?? [];
    const shortLeaves = saved.short_leaves ?? [];
    const breakStart = saved.break_start || null;
    const breakEnd = saved.break_end || null;
    const totalBreakMs = computeBreakMs(breaks, breakStart, breakEnd)
      || Number(saved.total_break_ms) || 0;

    let workingMs = null;
    if (row.check_in && row.check_out) {
      workingMs = computeNetWorkingMs(row.check_in, row.check_out, breaks, shortLeaves, breakStart, breakEnd);
    } else if (row.check_in && !row.check_out && row.status !== "Working") {
      const user = userById.get(userId);
      if (user) {
        workingMs = computeMissingCheckoutWorkingMs(
          row.check_in, user, dateKey, breaks, shortLeaves, breakStart, breakEnd
        );
      }
    } else if (row.check_in && row.status === "Working") {
      workingMs = computeNetWorkingMs(
        row.check_in, new Date().toISOString(), breaks, shortLeaves, breakStart, breakEnd
      );
    }

    await pool.query(
      `UPDATE attendance SET
         breaks = $1::jsonb,
         break_start = $2,
         break_end = $3,
         total_break_ms = $4,
         short_leaves = $5::jsonb,
         working_ms = COALESCE($6, working_ms)
       WHERE id = $7`,
      [
        JSON.stringify(Array.isArray(breaks) ? breaks : []),
        breakStart,
        breakEnd,
        totalBreakMs,
        JSON.stringify(Array.isArray(shortLeaves) ? shortLeaves : []),
        workingMs,
        row.id,
      ]
    );
    breaksRestored += 1;
  }

  const sample = await pool.query(
    "SELECT user_id, date, check_in, check_out, status, total_break_ms FROM attendance WHERE date IN ($1, $2) ORDER BY user_id, date LIMIT 20",
    ["2026-07-28", "2026-07-29"]
  );

  console.log(JSON.stringify({
    beforeUnsynced: before.rows[0].count,
    afterUnsynced: afterFlag.rows[0].count,
    breakSnapshotsSaved: breakSnapshots.length,
    breaksRestored,
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
