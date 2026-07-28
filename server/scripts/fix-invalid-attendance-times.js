import "dotenv/config";
import pg from "pg";

const { Client } = pg;

function normalize24Timestamp(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) 24:(\d{2}):(\d{2})(.*)$/);
  if (!m) return s;
  const [, year, month, day, minute, second, rest = ""] = m;
  const next = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1, 0, Number(minute), Number(second)));
  const p = (n) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${p(next.getUTCMonth() + 1)}-${p(next.getUTCDate())} 00:${minute}:${second}${rest}`;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const summary = {
    attendanceLogs24: 0,
    attendanceRowsFixed: 0,
    appMetaRowsFixed: 0,
  };

  const invalidLogRows = await client.query(
    `SELECT id, employee_id, punch_time::text AS punch_time_text
     FROM attendance_logs
     WHERE punch_time::text LIKE '% 24:%'
     ORDER BY id`
  );
  summary.attendanceLogs24 = invalidLogRows.rows.length;

  const attendanceRows = await client.query(
    `SELECT id, check_in, check_out, break_start, break_end
     FROM attendance
     WHERE COALESCE(check_in, '') LIKE '% 24:%'
        OR COALESCE(check_out, '') LIKE '% 24:%'
        OR COALESCE(break_start, '') LIKE '% 24:%'
        OR COALESCE(break_end, '') LIKE '% 24:%'
     ORDER BY id`
  );

  for (const row of attendanceRows.rows) {
    const next = {
      check_in: row.check_in ? normalize24Timestamp(row.check_in) : null,
      check_out: row.check_out ? normalize24Timestamp(row.check_out) : null,
      break_start: row.break_start ? normalize24Timestamp(row.break_start) : null,
      break_end: row.break_end ? normalize24Timestamp(row.break_end) : null,
    };
    await client.query(
      `UPDATE attendance
       SET check_in = $1, check_out = $2, break_start = $3, break_end = $4
       WHERE id = $5`,
      [next.check_in, next.check_out, next.break_start, next.break_end, row.id]
    );
    summary.attendanceRowsFixed += 1;
  }

  let metaRows = { rows: [] };
  const appMetaExists = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'app_meta'
     ) AS exists`
  );
  if (appMetaExists.rows[0]?.exists) {
    metaRows = await client.query(
      `SELECT key, value
       FROM app_meta
       WHERE value LIKE '% 24:%'`
    );

    for (const row of metaRows.rows) {
      const nextValue = normalize24Timestamp(row.value);
      if (nextValue === row.value) continue;
      await client.query(
        `UPDATE app_meta SET value = $1, updated_at = NOW() WHERE key = $2`,
        [nextValue, row.key]
      );
      summary.appMetaRowsFixed += 1;
    }
  }

  console.log(JSON.stringify({
    ...summary,
    invalidAttendanceLogSamples: invalidLogRows.rows.slice(0, 10),
    fixedAttendanceIds: attendanceRows.rows.slice(0, 20).map((r) => r.id),
    fixedAppMetaKeys: metaRows.rows.slice(0, 20).map((r) => r.key),
  }, null, 2));

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
