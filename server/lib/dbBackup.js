import { spawn } from "child_process";
import { createWriteStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, "..", "backups");

function backupStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function pgDumpBackup(filename) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not configured");

  await mkdir(BACKUP_DIR, { recursive: true });
  const outfile = path.join(BACKUP_DIR, filename);

  return new Promise((resolve, reject) => {
    const out = createWriteStream(outfile);
    const proc = spawn("pg_dump", ["--no-owner", "--no-acl", dbUrl], {
      env: process.env,
      shell: process.platform === "win32",
    });
    proc.stdout.pipe(out);
    let err = "";
    proc.stderr.on("data", (chunk) => { err += chunk.toString(); });
    proc.on("error", reject);
    out.on("error", reject);
    proc.on("close", (code) => {
      out.end();
      if (code === 0) resolve({ path: outfile, filename, format: "sql" });
      else reject(new Error(err.trim() || `pg_dump exited with code ${code}`));
    });
  });
}

const LOGICAL_TABLES = [
  "users", "attendance", "leave_requests", "short_leave_requests", "payroll",
  "notifications", "warnings", "assets", "biometric_user_map", "device_user_mapping", "device_user_mapping_audit", "user_sessions",
  "attendance_logs", "biometric_logs",
];

async function logicalJsonBackup(pool, filename) {
  await mkdir(BACKUP_DIR, { recursive: true });
  const outfile = path.join(BACKUP_DIR, filename);
  const tables = {};
  for (const table of LOGICAL_TABLES) {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table}`);
      tables[table] = rows;
    } catch {
      tables[table] = [];
    }
  }
  await writeFile(outfile, JSON.stringify({
    exportedAt: new Date().toISOString(),
    format: "logical-json",
    tables,
  }, null, 2), "utf8");
  return { path: outfile, filename, format: "json" };
}

/** Create a full database backup before destructive operations. */
export async function createDatabaseBackup(pool, reason = "backup") {
  const safeReason = String(reason).replace(/[^\w.-]+/g, "_").slice(0, 40);
  const sqlName = `adforce_hr-${backupStamp()}-${safeReason}.sql`;
  try {
    return await pgDumpBackup(sqlName);
  } catch (e) {
    console.warn("pg_dump backup failed, falling back to logical JSON backup:", e.message);
    const jsonName = sqlName.replace(/\.sql$/, ".json");
    return logicalJsonBackup(pool, jsonName);
  }
}
