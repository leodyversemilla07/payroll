import { defineConfig } from "@playwright/test";

// Mocked browser suite: UI against tRPC request interception (page.route).
// Follows the official Playwright configuration template:
// fullyParallel + forbidOnly + CI retries + trace on-first-retry.
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // Run all tests in parallel.
  fullyParallel: true,

  // Fail the build on CI if test.only is left in source.
  forbidOnly: !!process.env.CI,

  // Retry on CI only.
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel workers on CI for a stable shared webServer.
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI
    ? [["blob"], ["list"]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    // Trace viewer on CI retries; screenshots on failure. Traces are
    // performance-heavy, so never record them on every test.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm start --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
