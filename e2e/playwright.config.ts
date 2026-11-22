// Playwright starts a test backend (fresh database) and a production build of the website,
// then a real Chromium browser clicks through JobPulse.
// Run: cd e2e && npm test        (needs the Docker database running)
import { defineConfig, devices } from "@playwright/test";

const BACKEND_PORT = 4100;
const WEB_PORT = 3100;
const isWindows = process.platform === "win32";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // one shared database and one owner account
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node start-backend.mjs",
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      env: { E2E_BACKEND_PORT: String(BACKEND_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "ignore",
    },
    {
      // A production build, exactly like the deployed site: /api is forwarded to the backend.
      command: isWindows
        ? `cd ..\\frontend && npx next build && npx next start -p ${WEB_PORT}`
        : `cd ../frontend && npx next build && npx next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: { BACKEND_URL: `http://localhost:${BACKEND_PORT}` },
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: "ignore",
    },
  ],
});
