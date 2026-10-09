import pkg from "../apps/web/node_modules/@playwright/test/index.js";

const { chromium } = pkg;

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const topScreenshotPath = path.resolve(
  __dirname,
  "../recordings/sheet-current.png",
);
const bottomScreenshotPath = path.resolve(
  __dirname,
  "../recordings/sheet-scrolled.png",
);

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });
  const page = await context.newPage();

  console.log("Navigating to login...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.locator("#email").fill("admin@sweldoph.local");
  await page.locator("#password").fill("AdminPassword123!");
  await page.locator('button[type="submit"]:has-text("Login")').click();
  await page.waitForURL("**/portal**", { timeout: 15000 });

  console.log("Navigating to employees...");
  await page.goto("http://localhost:3000/portal/employees", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2000);

  console.log("Opening employee details sheet...");
  const firstEmployeeBtn = page.locator("table tbody tr button").first();
  await firstEmployeeBtn.click();
  await page.waitForTimeout(1500);

  console.log("Taking top screenshot...");
  await page.screenshot({ path: topScreenshotPath, fullPage: false });
  console.log(`Saved top screenshot to ${topScreenshotPath}`);

  console.log("Scrolling sheet container down...");
  const scrollResult = await page.evaluate(() => {
    const scrollContainer = document.querySelector(
      '[role="region"][aria-label="Employee details"] .overflow-y-auto',
    );
    if (!scrollContainer) return { error: "Container not found" };
    const beforeTop = scrollContainer.scrollTop;
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    return {
      beforeTop,
      afterTop: scrollContainer.scrollTop,
      scrollHeight: scrollContainer.scrollHeight,
      clientHeight: scrollContainer.clientHeight,
    };
  });
  console.log("Scroll metrics:", scrollResult);

  await page.waitForTimeout(500);
  console.log("Taking bottom screenshot...");
  await page.screenshot({ path: bottomScreenshotPath, fullPage: false });
  console.log(`Saved bottom screenshot to ${bottomScreenshotPath}`);

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
