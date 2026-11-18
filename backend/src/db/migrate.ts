// Applies any new migrations from the drizzle/ folder, then exits.
// The deployed server runs this before every start (npm run start:prod), so the database
// schema is always up to date without running drizzle-kit by hand.
import "dotenv/config";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client";

async function main() {
  // dist/db/migrate.js -> ../../drizzle  (same from src/db/migrate.ts)
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  console.log("[migrate] database is up to date");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
