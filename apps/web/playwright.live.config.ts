import { defineConfig } from "@playwright/test";

const databaseUrl = process.env.DATABASE_URL;
if (
  process.env.NODE_ENV !== "test" ||
  process.env.PAYROLL_LIVE_TEST_DATABASE !== "1" ||
  !databaseUrl
) {
  throw new Error(
    "Real browser tests require NODE_ENV=test, PAYROLL_LIVE_TEST_DATABASE=1 and a disposable, migrated DATABASE_URL.",
  );
}
const database = new URL(databaseUrl);
if (
  !["postgresql:", "postgres:"].includes(database.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
  !/^\/payroll_(browser|test)$/.test(database.pathname)
) {
  throw new Error(
    "Real browser tests may only use a local payroll_browser or payroll_test database. Never use a live database.",
  );
}

export default defineConfig({
  testDir: "./tests-live",
  outputDir: "./test-results-live",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3101",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node ../api/dist/main.js",
      url: "http://localhost:4000",
      // Never attach to an API whose database configuration we do not know.
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        PORT: "4000",
        CORS_ORIGIN: "http://localhost:3101",
        AUTH_COOKIE_NAME: "payroll_live_browser_session",
      },
      timeout: 60_000,
    },
    {
      command: "pnpm start --port 3101",
      url: "http://localhost:3101",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
