// Prepares a FRESH test database, then starts the backend on it.
// Your real database is never touched: the test one is called jobpulse_e2e (or E2E_DATABASE_URL).
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, "../backend");

function testDatabaseUrl() {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  // Same server and login as backend/.env, but a different database name.
  const env = readFileSync(path.join(backendDir, ".env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("No DATABASE_URL in backend/.env (or set E2E_DATABASE_URL).");
  const url = new URL(line.slice("DATABASE_URL=".length).trim());
  url.pathname = "/jobpulse_e2e";
  return url.toString();
}

const dbUrl = testDatabaseUrl();
const dbName = new URL(dbUrl).pathname.slice(1);
if (!/^[a-z0-9_]*e2e[a-z0-9_]*$/.test(dbName)) {
  throw new Error(`Refusing to reset "${dbName}": the test database name must contain "e2e".`);
}

// 1. drop + create the test database
const admin = new URL(dbUrl);
admin.pathname = "/postgres";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
await client.query(`CREATE DATABASE ${dbName}`);
await client.end();

// 2. tables (migrations) + demo jobs
const env = {
  ...process.env,
  DATABASE_URL: dbUrl,
  PORT: process.env.E2E_BACKEND_PORT ?? "4100",
  COLLECT_DISABLED: "1", // never fetch real job sites during tests
  AI_SERVICE_URL: "http://127.0.0.1:9", // nothing listens here: AI features must fail politely
  AI_SERVICE_TOKEN: "",
  VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
};
const tsx = path.join(backendDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
for (const script of ["src/db/migrate.ts", "src/db/seed.ts"]) {
  const result = spawnSync(tsx, [script], { cwd: backendDir, env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// 3. the backend itself (Playwright stops it when the tests end)
const server = spawn(tsx, ["src/index.ts"], { cwd: backendDir, env, stdio: "inherit", shell: process.platform === "win32" });
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
