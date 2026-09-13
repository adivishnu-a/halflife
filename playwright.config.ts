import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against a real dev server and the real database. The Python
 * function is pointed at a dead port on purpose: every review in these tests
 * goes through the TypeScript fallback, which proves the app works when the
 * function is down.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "BETTER_AUTH_URL=http://localhost:3100 PY_API_ORIGIN=http://127.0.0.1:9 npx next dev --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
