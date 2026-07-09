import pg from "pg";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("✗ DATABASE_URL missing. Copy .env.example to .env and set your PostgreSQL password.");
  process.exit(1);
}

// Parse out the database name; connect to "postgres" db first to create it
const url = new URL(dbUrl);
const dbName = url.pathname.slice(1);
const adminUrl = new URL(dbUrl);
adminUrl.pathname = "/postgres";

async function main() {
  // Step 1: create database if it doesn't exist
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${dbName}`);
    console.log(`✓ Database "${dbName}" created`);
  } else {
    console.log(`✓ Database "${dbName}" already exists`);
  }
  await admin.end();

  // Step 2: run schema
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
  await client.query(schema);
  console.log("✓ Tables created + default admin seeded");
  console.log("");
  console.log("Setup complete! Now run: npm run dev");
  await client.end();
}

main().catch((e) => {
  console.error("✗ Setup failed:", e.message);
  console.error("");
  console.error("Common fixes:");
  console.error("1. Is PostgreSQL running? Check Windows Services for 'postgresql'");
  console.error("2. Is the password in .env correct?");
  console.error("3. Default user is usually 'postgres' with the password you set during install");
  process.exit(1);
});
