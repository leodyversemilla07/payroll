/**
 * End-to-end payroll workflow screen tour with all five user roles.
 *
 * Target: isolated browser stage (synthetic data only).
 *   Web: http://localhost:3001  API: http://localhost:4001
 *   DB:  local payroll_browser (Payroll Browser Sandbox org)
 *
 * Story: an employee files a leave → manager approves → HR reviews staff
 * records → the maker re-runs September's second cutoff (cancel, trigger)
 * → HR approves (checker) → the maker disburses → the employee gets
 * notified and views payslips → the system admin reviews compliance.
 * Every mutating step is guarded by visibility checks so re-runs degrade
 * to a read-only tour instead of failing.
 *
 * Usage: node scripts/record-payroll-workflow.mjs
 * Output: recordings/payroll-workflow-end-to-end.{webm,mp4}
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
  console.log(`🔑 Signing in as ${roleLabel} (${email})...`);
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

async function openRunByCutoffIfVisible(
  runsRegion,
  cutoffLabel,
  waitMs = 4000,
) {
  try {
    const row = runsRegion.getByRole("row", { name: cutoffLabel });
    await row.waitFor({ state: "visible", timeout: waitMs });
    await row.getByRole("button", { name: "Review" }).click();
    return true;
  } catch {
    return false;
  }
}

async function run() {
  console.log("🎬 Recording end-to-end payroll workflow tour...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: recordingsDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  try {
    // ── ACT 1 · EMPLOYEE files a leave ──────────────────────────────
    await loginAs(page, "employee@sandbox.test", "EMPLOYEE");
    console.log("📍 [1] Employee dashboard + profile...");
    await sleep(2000);
    await smoothScroll(page, 400, 10, 60);
    await sleep(1500);

    await page.getByRole("button", { name: /^Account:/ }).click();
    await sleep(800);
    await page.getByRole("menuitem", { name: "Account" }).click();
    await sleep(2500);

    console.log("📍 [1] Filing a vacation leave...");
    if (
      await clickIfVisible(
        page.getByRole("button", { name: "File Leave Request" }),
      )
    ) {
      await sleep(1200);
      // Later takes reuse the script: walk November weekdays until one files
      // cleanly (earlier takes may already own a date).
      const candidates = [
        "2026-11-18",
        "2026-11-19",
        "2026-11-20",
        "2026-11-23",
        "2026-11-24",
      ];
      for (const day of candidates) {
        await page.getByLabel("Start Date").fill(day);
        await page.getByLabel("End Date").fill(day);
        await page.getByLabel("Number of Days").fill("1");
        await page
          .getByLabel("Reason for Leave")
          .fill("Family trip to Palawan with my kids");
        await sleep(600);
        await page.getByRole("button", { name: "Submit Request" }).click();
        await sleep(2200);
        const filed = await page
          .getByText("Leave request submitted successfully")
          .first()
          .isVisible()
          .catch(() => false);
        if (filed) break;
      }
      await sleep(800);
    }
    await smoothScroll(page, 500, 10, 60);
    await sleep(1500);
    await logout(page);

    // ── ACT 2 · MANAGER approves the leave ──────────────────────────
    await loginAs(page, "manager@sandbox.test", "DEPARTMENT_MANAGER");
    console.log("📍 [2] Manager approves team leave...");
    await goNav(page, "Leave management");
    const approvals = page.getByRole("region", {
      name: "Pending leave approvals",
    });
    // Approve our tour employee's own request so their notifications story
    // stays continuous; fall back to the first pending request.
    if (
      await clickIfVisible(
        approvals.getByRole("button", {
          name: "Approve leave for Synthetic Andrea Santos 0009",
        }),
        2500,
      )
    ) {
      await sleep(2500);
    } else if (
      await clickIfVisible(
        approvals.getByRole("button", { name: "Approve", exact: true }),
        4000,
      )
    ) {
      await sleep(2500);
    }
    await smoothScroll(page, 300, 8, 60);
    await sleep(1500);
    await logout(page);

    // ── ACT 3 · HR reviews staff records ────────────────────────────
    await loginAs(page, "hr@sandbox.test", "HR_ADMIN");
    console.log("📍 [3] HR dashboard (200 staff)...");
    await sleep(2000);
    await smoothScroll(page, 400, 10, 60);
    await sleep(1500);

    console.log("📍 [3] Employee directory → View DTR deep link...");
    await goNav(page, "Employees");
    const directory = page.getByRole("region", {
      name: "Employees",
      exact: true,
    });
    await directory
      .getByRole("button", { name: /Synthetic/ })
      .first()
      .click();
    await sleep(2500);
    const details = page.getByRole("region", {
      name: "Employee details",
      exact: true,
    });
    if (await clickIfVisible(details.getByRole("link", { name: "View DTR" }))) {
      await sleep(2500);
      const dtr = page.getByRole("region", {
        name: "Attendance and DTR",
        exact: true,
      });
      await page.getByLabel("DTR start date").fill("2026-10-01");
      await page.getByLabel("DTR end date").fill("2026-10-02");
      await sleep(600);
      await dtr.getByRole("button", { name: "Load DTR", exact: true }).click();
      await sleep(3000);
      await smoothScroll(page, 400, 10, 60);
      await sleep(1500);
    }

    console.log("📍 [3] Loans + holidays review...");
    await goNav(page, "Loans & Advances");
    await smoothScroll(page, 400, 10, 60);
    await sleep(1500);
    await goNav(page, "Holiday calendar");
    await smoothScroll(page, 300, 8, 60);
    await sleep(1500);
    await logout(page);

    // ── ACT 4 · MAKER re-runs September's second cutoff ─────────────
    await loginAs(page, "payroll@sandbox.test", "PAYROLL_SPECIALIST");
    console.log("📍 [4] Maker: cutoff readiness + trigger form...");
    await goNav(page, "Process payroll");
    await smoothScroll(page, 400, 10, 60);
    await sleep(2000);

    console.log("📍 [4] Maker: cancel + re-trigger September second cutoff...");
    await goNav(page, "Payroll runs & payslips");
    const runs = page.getByRole("region", { name: "Payroll runs" });
    if (await openRunByCutoffIfVisible(runs, /Sep 16, 2026 – Sep 30, 2026/)) {
      await sleep(2500);
      const detailsCard = page.getByRole("region", { name: "Run details" });
      if (
        await clickIfVisible(
          detailsCard.getByRole("button", { name: "Cancel run", exact: true }),
          2500,
        )
      ) {
        await sleep(1000);
        await clickIfVisible(
          detailsCard.getByRole("button", {
            name: "Confirm cancel",
            exact: true,
          }),
          2500,
        );
        await sleep(3000);
      }
    }

    await goNav(page, "Process payroll");
    const triggerForm = page.getByRole("region", {
      name: "Process payroll run",
    });
    await triggerForm.getByLabel("Cutoff", { exact: true }).click();
    await sleep(800);
    await page.getByRole("option", { name: "Second cutoff" }).click();
    await sleep(500);
    await triggerForm.getByLabel("Regular run cutoff start").fill("2026-09-16");
    await triggerForm.getByLabel("Regular run cutoff end").fill("2026-09-30");
    await triggerForm.getByLabel("Regular run payment date").fill("2026-10-01");
    await sleep(800);
    if (
      await clickIfVisible(
        triggerForm.getByRole("button", {
          name: "Process regular run",
          exact: true,
        }),
        2500,
      )
    ) {
      await sleep(8000);
    }
    await logout(page);

    // ── ACT 5 · CHECKER approves ────────────────────────────────────
    await loginAs(page, "hr@sandbox.test", "HR_ADMIN (checker)");
    console.log("📍 [5] Checker approves the run...");
    await goNav(page, "Payroll runs & payslips");
    const runs2 = page.getByRole("region", { name: "Payroll runs" });
    if (await openRunByCutoffIfVisible(runs2, /Sep 16, 2026 – Sep 30, 2026/)) {
      await sleep(2500);
      const detailsCard = page.getByRole("region", { name: "Run details" });
      if (
        await clickIfVisible(
          detailsCard.getByRole("button", { name: "Approve run", exact: true }),
          2500,
        )
      ) {
        await sleep(3000);
      }
    }
    await logout(page);

    // ── ACT 6 · MAKER disburses ─────────────────────────────────────
    await loginAs(
      page,
      "payroll@sandbox.test",
      "PAYROLL_SPECIALIST (disburse)",
    );
    console.log("📍 [6] Maker disburses + reviews payslips...");
    await goNav(page, "Payroll runs & payslips");
    const runs3 = page.getByRole("region", { name: "Payroll runs" });
    if (await openRunByCutoffIfVisible(runs3, /Sep 16, 2026 – Sep 30, 2026/)) {
      await sleep(2500);
      const detailsCard = page.getByRole("region", { name: "Run details" });
      if (
        await clickIfVisible(
          detailsCard.getByRole("button", {
            name: "Disburse run",
            exact: true,
          }),
          2500,
        )
      ) {
        await sleep(3000);
      }
      await smoothScroll(page, 500, 10, 60);
      await sleep(2000);
    }
    await logout(page);

    // ── ACT 7 · EMPLOYEE gets notified ──────────────────────────────
    await loginAs(page, "employee@sandbox.test", "EMPLOYEE (payday)");
    console.log("📍 [7] Employee notifications + payslips...");
    await page.getByRole("button", { name: /^Account:/ }).click();
    await sleep(800);
    await page.getByRole("menuitem", { name: /Notifications/ }).click();
    await sleep(2500);
    await smoothScroll(page, 300, 8, 60);
    await sleep(1500);
    await page.getByRole("button", { name: /^Account:/ }).click();
    await sleep(800);
    await page.getByRole("menuitem", { name: "Account" }).click();
    await sleep(2500);
    await smoothScroll(page, 600, 12, 50);
    await sleep(2000);
    await logout(page);

    // ── ACT 8 · SYSTEM ADMIN compliance review + finale ─────────────
    await loginAs(page, "admin@sandbox.test", "SUPER_ADMIN");
    console.log("📍 [8] System admin: year-end tax + compliance...");
    await goNav(page, "Year-end tax");
    await smoothScroll(page, 500, 12, 50);
    await sleep(2000);
    await smoothScroll(page, 500, 12, 50);
    await sleep(2000);
    console.log("📍 [8] Finale on the dashboard...");
    await goNav(page, "Dashboard");
    await sleep(3000);

    console.log("✅ End-to-end workflow tour completed!");
  } catch (error) {
    console.error("⚠️ Error during workflow tour:", error);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      const videoPath = await video.path();
      console.log(`🎥 Raw recording: ${videoPath}`);
      const targetWebm = path.join(
        recordingsDir,
        "payroll-workflow-end-to-end.webm",
      );
      const targetMp4 = path.join(
        recordingsDir,
        "payroll-workflow-end-to-end.mp4",
      );
      fs.copyFileSync(videoPath, targetWebm);
      console.log(`✨ WebM: ${targetWebm}`);
      try {
        execSync(
          `ffmpeg -y -i "${targetWebm}" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p "${targetMp4}"`,
          { stdio: "inherit" },
        );
        console.log(`🎉 MP4: ${targetMp4}`);
      } catch (ffmpegErr) {
        console.warn("⚠️ ffmpeg conversion failed:", ffmpegErr.message);
      }
    }
  }
}

run().catch(console.error);
