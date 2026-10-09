import pkg from "../apps/web/node_modules/@playwright/test/index.js";

const { chromium } = pkg;

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const artifactDir =
  "C:/Users/Leodyver/.gemini/antigravity-cli/brain/1bc9dbda-c156-4aef-ad4c-d336da5b19c7";
const addHolidayScreenshot = path.resolve(artifactDir, "holiday-add-sheet.png");
const editHolidayScreenshot = path.resolve(
  artifactDir,
  "holiday-edit-sheet.png",
);

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  const page = await context.newPage();

  console.log("Navigating to login...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.locator("#email").fill("hr@sweldoph.local");
  await page.locator("#password").fill("AdminPassword123!");
  await page.locator('button[type="submit"]:has-text("Login")').click();
  await page.waitForURL("**/portal**", { timeout: 15000 });

  console.log("Navigating to holidays...");
  await page.goto("http://localhost:3000/portal/holidays", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1000);

  console.log("Clicking Add holiday button...");
  await page.getByRole("button", { name: "Add holiday" }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: addHolidayScreenshot, fullPage: false });
  console.log(`Saved Add Holiday screenshot to ${addHolidayScreenshot}`);

  // Close Add holiday sheet
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Click Edit on the first holiday row if exists
  const editButtons = page.locator('button[aria-label^="Edit "]');
  if ((await editButtons.count()) > 0) {
    console.log("Opening edit holiday sheet...");
    await editButtons.first().click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: editHolidayScreenshot, fullPage: false });
    console.log(`Saved Edit Holiday screenshot to ${editHolidayScreenshot}`);
  }

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
