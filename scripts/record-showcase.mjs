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

async function humanType(locator, text, delayMs = 60) {
  await locator.click();
  for (const char of text) {
    await locator.pressSequentially(char, { delay: delayMs });
  }
}

async function run() {
  console.log(
    "🎬 Starting Philippine Payroll Platform Showcase Screen Recording...",
  );
  console.log(`📁 Video output directory: ${recordingsDir}`);

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: recordingsDir,
      size: { width: 1440, height: 900 },
    },
    colorScheme: "dark", // Dark theme looks sleek for modern SaaS portfolios
  });

  const page = await context.newPage();

  try {
    // ==========================================
    // SCENE 1: Landing Page & Sign In
    // ==========================================
    console.log("📍 [Scene 1] Navigating to Sign In...");
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await sleep(1500);

    const emailInput = page.locator("#email");
    const passwordInput = page.locator("#password");

    console.log("⌨️ Typing admin credentials...");
    await humanType(emailInput, "admin@sweldoph.local", 40);
    await sleep(500);

    await humanType(passwordInput, "AdminPassword123!", 40);
    await sleep(500);

    // Toggle show password to demonstrate polished UX
    const showPasswordBtn = page
      .locator('button[title*="password"], button[aria-label*="password"]')
      .first();
    if (await showPasswordBtn.isVisible()) {
      await showPasswordBtn.click();
      await sleep(1000);
      await showPasswordBtn.click();
      await sleep(500);
    }

    console.log("🚀 Submitting Login...");
    const loginButton = page.locator('button[type="submit"]:has-text("Login")');
    await loginButton.click();

    await page.waitForURL("**/portal**", { timeout: 15000 });
    await sleep(2500);

    // ==========================================
    // SCENE 2: Executive Dashboard & Analytics
    // ==========================================
    console.log("📍 [Scene 2] Executive Dashboard & Overview...");
    await sleep(2000);

    // Highlight metric cards
    await smoothScroll(page, 300, 10, 60);
    await sleep(2000);

    // Scroll to recent payroll runs
    await smoothScroll(page, 400, 10, 60);
    await sleep(2500);

    // Scroll back to top
    await smoothScroll(page, -700, 10, 50);
    await sleep(1500);

    // ==========================================
    // SCENE 3: Employee Directory & Pay Basis
    // ==========================================
    console.log("📍 [Scene 3] Navigating to Employees Directory...");
    await page.click('a[href="/portal/employees"]');
    await page.waitForURL("**/portal/employees**", { timeout: 10000 });
    await sleep(2000);

    // Interactive Data Table search showcase
    const searchInput = page.locator('input[placeholder*="Search employees"]');
    if (await searchInput.isVisible()) {
      await humanType(searchInput, "Ana", 60);
      await sleep(1500);
      await searchInput.fill("");
      await sleep(1000);
    }

    // Scroll through employees list
    await smoothScroll(page, 200, 6, 60);
    await sleep(1500);

    // Showcase Action Dropdown Menu & slide-over details drawer
    const actionMenuBtn = page
      .locator(
        'button:has([class*="lucide-more-horizontal"]), button:has-text("Open menu")',
      )
      .first();
    if (await actionMenuBtn.isVisible()) {
      await actionMenuBtn.click();
      await sleep(1500);
      const viewDetailsItem = page
        .locator('div[data-slot="dropdown-menu-item"]:has-text("View details")')
        .first();
      if (await viewDetailsItem.isVisible()) {
        await viewDetailsItem.click();
        await sleep(2000);
        await page.keyboard.press("PageDown");
        await sleep(1500);
        await page.keyboard.press("Escape");
        await sleep(1000);
      } else {
        await page.keyboard.press("Escape");
      }
    } else {
      const firstRowBtn = page.locator("table tbody tr button").first();
      if (await firstRowBtn.isVisible()) {
        await firstRowBtn.click();
        await sleep(2000);
        await page.keyboard.press("Escape");
        await sleep(1000);
      }
    }

    await smoothScroll(page, -200, 6, 50);
    await sleep(1000);

    // ==========================================
    // SCENE 4: Attendance, DTR & Biometrics
    // ==========================================
    console.log("📍 [Scene 4] Navigating to Attendance & DTR...");
    await page.click('a[href="/portal/attendance"]');
    await page.waitForURL("**/portal/attendance**", { timeout: 10000 });
    await sleep(2500);

    // Scroll through DTR table
    await smoothScroll(page, 400, 10, 60);
    await sleep(2000);

    // Check if biometric import button is present
    const importToggleBtn = page
      .locator(
        'button:has-text("Import Biometrics CSV"), button:has-text("Biometric Import")',
      )
      .first();
    if (await importToggleBtn.isVisible()) {
      await importToggleBtn.click();
      await sleep(2000);
      await smoothScroll(page, 300, 8, 50);
      await sleep(2000);
      await smoothScroll(page, -300, 8, 50);
      await sleep(1000);
    }

    await smoothScroll(page, -400, 10, 50);
    await sleep(1000);

    // ==========================================
    // SCENE 5: Leave Management & Carryover
    // ==========================================
    console.log("📍 [Scene 5] Navigating to Leave Management...");
    await page.click('a[href="/portal/leaves"]');
    await page.waitForURL("**/portal/leaves**", { timeout: 10000 });
    await sleep(2500);

    await smoothScroll(page, 350, 10, 60);
    await sleep(2000);
    await smoothScroll(page, -350, 10, 50);
    await sleep(1000);

    // ==========================================
    // SCENE 6: Loans Management & Amortization
    // ==========================================
    console.log("📍 [Scene 6] Navigating to Loans Management...");
    await page.click('a[href="/portal/loans"]');
    await page.waitForURL("**/portal/loans**", { timeout: 10000 });
    await sleep(2500);

    await smoothScroll(page, 300, 8, 60);
    await sleep(2000);
    await smoothScroll(page, -300, 8, 50);
    await sleep(1000);

    // ==========================================
    // SCENE 7: Process Payroll (Maker-Checker Wizard & Cutoff Scheduler)
    // ==========================================
    console.log("📍 [Scene 7] Navigating to Process Payroll...");
    await page.click('a[href="/portal/process-payroll"]');
    await page.waitForURL("**/portal/process-payroll**", { timeout: 10000 });
    await sleep(2500);

    // Show the Cutoff Scheduler Alert Card
    await smoothScroll(page, 200, 6, 60);
    await sleep(2500);

    // Click "Use Current Cutoff" button if present
    const useCutoffBtn = page
      .locator(
        'button:has-text("Use Current Cutoff"), button:has-text("Autofill")',
      )
      .first();
    if (await useCutoffBtn.isVisible()) {
      await useCutoffBtn.click();
      await sleep(1500);
    }

    await smoothScroll(page, 400, 10, 60);
    await sleep(2500);
    await smoothScroll(page, -600, 10, 50);
    await sleep(1000);

    // ==========================================
    // SCENE 8: Payroll Runs Registry & Payslips
    // ==========================================
    console.log("📍 [Scene 8] Navigating to Payroll Runs & Payslips...");
    await page.click('a[href="/portal/payroll-runs"]');
    await page.waitForURL("**/portal/payroll-runs**", { timeout: 10000 });
    await sleep(2500);

    await smoothScroll(page, 350, 10, 60);
    await sleep(2500);

    // View first run breakdown if available
    const viewRunBtn = page
      .locator(
        'button:has-text("View"), button:has-text("Details"), a:has-text("View")',
      )
      .first();
    if (await viewRunBtn.isVisible()) {
      await viewRunBtn.click();
      await sleep(2000);
      await smoothScroll(page, 300, 8, 50);
      await sleep(2000);
    }

    await smoothScroll(page, -650, 10, 50);
    await sleep(1000);

    // ==========================================
    // SCENE 9: Year-End Tax, BIR 2316, 1604-C & DOLE
    // ==========================================
    console.log("📍 [Scene 9] Navigating to Year-End Tax & Compliance...");
    await page.click('a[href="/portal/year-end-tax"]');
    await page.waitForURL("**/portal/year-end-tax**", { timeout: 10000 });
    await sleep(2500);

    // Scroll to show tax annualization table
    await smoothScroll(page, 350, 10, 60);
    await sleep(2500);

    // Scroll to show the Annual Compliance Transmittals (BIR 1604-C & DOLE BWC)
    await smoothScroll(page, 450, 10, 60);
    await sleep(3500);

    await smoothScroll(page, -800, 12, 50);
    await sleep(1500);

    // ==========================================
    // SCENE 10: Smooth Finale back to Overview
    // ==========================================
    console.log("📍 [Scene 10] Returning to Executive Dashboard for finale...");
    await page.click('a[href="/portal"]');
    await page.waitForURL("**/portal", { timeout: 10000 });
    await sleep(3000);

    console.log("✅ Showcase walkthrough completed successfully!");
  } catch (error) {
    console.error("⚠️ Error during showcase walkthrough:", error);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();

    if (video) {
      const videoPath = await video.path();
      console.log(`🎥 Raw Playwright recording saved to: ${videoPath}`);

      const targetWebm = path.join(
        recordingsDir,
        "philippine-payroll-showcase.webm",
      );
      const targetMp4 = path.join(
        recordingsDir,
        "philippine-payroll-showcase.mp4",
      );

      fs.copyFileSync(videoPath, targetWebm);
      console.log(`✨ Exported WebM video: ${targetWebm}`);

      try {
        console.log(
          "🔄 Converting to high-definition H.264 MP4 with ffmpeg...",
        );
        execSync(
          `ffmpeg -y -i "${targetWebm}" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p "${targetMp4}"`,
          { stdio: "inherit" },
        );
        console.log(`🎉 Masterpiece MP4 video ready: ${targetMp4}`);
      } catch (ffmpegErr) {
        console.warn(
          "⚠️ ffmpeg conversion skipped or failed:",
          ffmpegErr.message,
        );
      }
    }
  }
}

run().catch(console.error);
