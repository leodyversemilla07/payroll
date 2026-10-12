/**
 * A Day in the Life: daily workflow screen recording with real users.
 *
 * Target: isolated browser stage (synthetic data only).
 *   Web: http://localhost:3001  API: http://localhost:4001
 *   DB:  local payroll_browser (Payroll Browser Sandbox org)
 *
 * Story (payday-week Thursday, HR admin as the primary user):
 *   1. HR morning: dashboard KPIs, attention queue, notifications.
 *   2. HR clears the leave-approvals queue.
 *   3. HR reviews team attendance for the open cutoff.
 *   4. Payroll specialist checks readiness and triggers the run.
 *   5. HR (checker) approves the run and reviews payslip totals.
 *   6. Payroll specialist disburses; run becomes immutable.
 *   7. Employee payday: notifications + own payslip.
 *   8. HR end-of-day dashboard check.
 * Every mutating step is guarded by visibility checks so re-runs degrade
 * to a read-only tour instead of failing.
 *
 * Usage: node scripts/record-daily-workflow.mjs
 * Output: recordings/daily-workflow.{webm,mp4} (gitignored)
 */
import pkg from "../apps/web/node_modules/@playwright/test/index.js";

const { chromium } = pkg;

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const recordingsDir = path.resolve(rootDir, "recordings");

const BASE = "http://localhost:3001";
const PASSWORD = "SandboxDemo123!";

if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function smoothScroll(page, distance, steps = 10, delay = 50) {
  const step = distance / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate(
      (d) => window.scrollBy({ top: d, behavior: "smooth" }),
      step,
    );
    await sleep(delay);
  }
}

async function humanType(locator, text, delayMs = 45) {
  await locator.click();
  for (const char of text) {
    await locator.pressSequentially(char, { delay: delayMs });
  }
}

async function loginAs(page, email, roleLabel) {
  console.log(`Signing in as ${roleLabel} (${email})...`);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await sleep(1200);
  await humanType(page.getByLabel("Email", { exact: true }), email, 30);
  await sleep(400);
  await humanType(page.getByLabel("Password", { exact: true }), PASSWORD, 30);
  await sleep(400);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByText("Signed in as").waitFor({ timeout: 20000 });
  await sleep(2000);
}

async function logout(page) {
  await page.getByRole("button", { name: /^Account:/ }).click();
  await sleep(800);
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await page
    .getByRole("heading", { name: "Login to your account" })
    .waitFor({ timeout: 15000 });
  await sleep(1200);
}

async function goNav(page, name) {
  await page
    .getByRole("navigation", { name: "Payroll navigation" })
    .getByRole("link", { name, exact: true })
    .click();
  await sleep(2500);
}

async function clickIfVisible(locator, waitMs = 2500) {
  try {
    await locator.first().waitFor({ state: "visible", timeout: waitMs });
    await locator.first().click();
    return true;
  } catch {
    return false;
  }
}

async function run() {
  console.log("Recording daily-workflow tour...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: recordingsDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  try {
    // ── MORNING · HR opens the day ──────────────────────────────
    await loginAs(page, "hr@sandbox.test", "HR_ADMIN");
    console.log("[morning] Dashboard: KPIs + attention queue...");
    await sleep(2000);
    await smoothScroll(page, 500, 10, 60);
    await sleep(1500);

    console.log("[morning] Notifications inbox...");
    await page.getByRole("button", { name: /^Account:/ }).click();
    await sleep(800);
    if (
      await clickIfVisible(
        page.getByRole("menuitem", { name: /Notifications/ }),
      )
    ) {
      await sleep(2500);
      await smoothScroll(page, 300, 8, 60);
      await sleep(1200);
    } else {
      await page.keyboard.press("Escape");
      await sleep(500);
    }

    // ── LEAVE QUEUE · HR clears approvals ───────────────────────
    console.log("[morning] Leave approvals queue...");
    await goNav(page, "Leave management");
    const approvals = page.getByRole("region", {
      name: "Pending leave approvals",
    });
    if (
      await clickIfVisible(
        approvals.getByRole("button", { name: "Approve", exact: true }),
        4000,
      )
    ) {
      console.log("[morning] Approved one pending request.");
      await sleep(2500);
    } else {
      console.log("[morning] Queue already clear; reviewing balances...");
      await smoothScroll(page, 400, 10, 60);
      await sleep(1500);
    }

    // ── ATTENDANCE · spot-check the open cutoff ─────────────────
    console.log("[midday] Attendance spot-check...");
    await goNav(page, "Attendance & DTR");
    const attendance = page.getByRole("region", {
      name: "Attendance and DTR",
      exact: true,
    });
    if (
      await clickIfVisible(
        attendance.getByLabel("DTR employee", { exact: true }),
        3000,
      )
    ) {
      await sleep(800);
      if (
        await clickIfVisible(
          page.getByRole("option", { name: /Synthetic/ }),
          3000,
        )
      ) {
        await sleep(1000);
        await attendance.getByLabel("DTR start date").fill("2026-09-16");
        await attendance.getByLabel("DTR end date").fill("2026-09-30");
        await sleep(600);
        await clickIfVisible(
          attendance.getByRole("button", { name: "Load DTR", exact: true }),
        );
        await sleep(3000);
        await smoothScroll(page, 400, 10, 60);
        await sleep(1500);
      }
    }
    await logout(page);

    // ── MAKER · payroll specialist triggers the run ─────────────
    await loginAs(page, "payroll@sandbox.test", "PAYROLL_SPECIALIST");
    console.log("[afternoon] Maker: readiness + trigger...");
    await goNav(page, "Process payroll");
    await smoothScroll(page, 400, 10, 60);
    await sleep(2000);
    const triggerForm = page.getByRole("region", {
      name: "Process payroll run",
    });
    if (await triggerForm.isVisible().catch(() => false)) {
      await triggerForm.getByLabel("Cutoff", { exact: true }).click();
      await sleep(800);
      await clickIfVisible(page.getByRole("option", { name: "First cutoff" }));
      await sleep(500);
      await triggerForm
        .getByLabel("Regular run cutoff start")
        .fill("2026-09-01");
      await triggerForm.getByLabel("Regular run cutoff end").fill("2026-09-15");
      await triggerForm
        .getByLabel("Regular run payment date")
        .fill("2026-09-16");
      await sleep(800);
      if (
        await clickIfVisible(
          triggerForm.getByRole("button", {
            name: "Process regular run",
            exact: true,
          }),
        )
      ) {
        console.log("[afternoon] Run triggered (or already exists).");
        await sleep(8000);
      }
    }
    await logout(page);

    // ── CHECKER · HR approves ───────────────────────────────────
    await loginAs(page, "hr@sandbox.test", "HR_ADMIN (checker)");
    console.log("[afternoon] Checker: approve + review payslips...");
    await goNav(page, "Payroll runs & payslips");
    const runs = page.getByRole("region", { name: "Payroll runs" });
    try {
      const row = runs.getByRole("row", {
        name: /Sep 1, 2026 .* Sep 15, 2026/,
      });
      await row.waitFor({ state: "visible", timeout: 4000 });
      await row.getByRole("button", { name: "Review" }).click();
      await sleep(2500);
      const detailsCard = page.getByRole("region", { name: "Run details" });
      if (
        await clickIfVisible(
          detailsCard.getByRole("button", { name: "Approve run", exact: true }),
        )
      ) {
        console.log("[afternoon] Run approved.");
        await sleep(3000);
      }
      await smoothScroll(page, 500, 10, 60);
      await sleep(2000);
    } catch {
      console.log(
        "[afternoon] First-cutoff run not actionable; continuing tour.",
      );
    }
    await logout(page);

    // ── DISBURSE · maker closes the run ─────────────────────────
    await loginAs(
      page,
      "payroll@sandbox.test",
      "PAYROLL_SPECIALIST (disburse)",
    );
    console.log("[evening] Disburse the approved run...");
    await goNav(page, "Payroll runs & payslips");
    const runs3 = page.getByRole("region", { name: "Payroll runs" });
    try {
      const row = runs3.getByRole("row", {
        name: /Sep 1, 2026 .* Sep 15, 2026/,
      });
      await row.waitFor({ state: "visible", timeout: 4000 });
      await row.getByRole("button", { name: "Review" }).click();
      await sleep(2500);
      const detailsCard = page.getByRole("region", { name: "Run details" });
      if (
        await clickIfVisible(
          detailsCard.getByRole("button", {
            name: "Disburse run",
            exact: true,
          }),
        )
      ) {
        console.log("[evening] Run disbursed; payslips immutable.");
        await sleep(3000);
      }
    } catch {
      console.log("[evening] Nothing to disburse; continuing tour.");
    }
    await logout(page);

    // ── PAYDAY · employee self-service ──────────────────────────
    await loginAs(page, "employee@sandbox.test", "EMPLOYEE (payday)");
    console.log("[payday] Employee: notifications + own payslip...");
    await page.getByRole("button", { name: /^Account:/ }).click();
    await sleep(800);
    if (
      await clickIfVisible(
        page.getByRole("menuitem", { name: /Notifications/ }),
      )
    ) {
      await sleep(2500);
      await smoothScroll(page, 300, 8, 60);
      await sleep(1200);
    }
    await page.getByRole("button", { name: /^Account:/ }).click();
    await sleep(800);
    if (await clickIfVisible(page.getByRole("menuitem", { name: "Account" }))) {
      await sleep(2500);
      await smoothScroll(page, 600, 12, 50);
      await sleep(2000);
    }
    await logout(page);

    // ── EOD · HR closes the day ─────────────────────────────────
    await loginAs(page, "hr@sandbox.test", "HR_ADMIN (end of day)");
    console.log("[eod] Final dashboard check...");
    await sleep(2000);
    await smoothScroll(page, 500, 12, 50);
    await sleep(2000);

    console.log("Daily-workflow tour completed!");
  } catch (error) {
    console.error("Error during daily-workflow tour:", error);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      const videoPath = await video.path();
      console.log(`Raw recording: ${videoPath}`);
      const targetWebm = path.join(recordingsDir, "daily-workflow.webm");
      const targetMp4 = path.join(recordingsDir, "daily-workflow.mp4");
      fs.copyFileSync(videoPath, targetWebm);
      console.log(`WebM: ${targetWebm}`);
      try {
        execSync(
          `ffmpeg -y -i "${targetWebm}" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p "${targetMp4}"`,
          { stdio: "inherit" },
        );
        console.log(`MP4: ${targetMp4}`);
      } catch (ffmpegErr) {
        console.warn("ffmpeg conversion failed:", ffmpegErr.message);
      }
    }
  }
}

run().catch(console.error);
