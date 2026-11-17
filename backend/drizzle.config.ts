import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle", // migration SQL files live here and ARE committed to git
  dbCredentials: { url: process.env.DATABASE_URL! },
});
