import { expect, test } from "@playwright/test";

test("invalid credentials never reveal payroll records", async ({ page }) => {
  await page.route("**/trpc/**", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          json: {
            message: "Unauthorized",
            code: -32001,
            data: { code: "UNAUTHORIZED", httpStatus: 401 },
          },
        },
      }),
    });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("unknown@example.com");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("main [role=alert]")).toContainText(
    "Invalid email or password",
  );
  await expect(page.getByRole("region", { name: "Employees" })).toHaveCount(0);
});

test("sign-in draft survives leaving and returning to the browser", async ({
  page,
}) => {
  await page.route("**/trpc/**", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          json: {
            message: "Unauthorized",
            code: -32001,
            data: { code: "UNAUTHORIZED", httpStatus: 401 },
          },
        },
      }),
    });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("unfinished-password");
  const otherTab = await page.context().newPage();
  await otherTab.goto("about:blank");
  await page.bringToFront();
  await expect(page.getByLabel("Email")).toHaveValue("admin@example.com");
  await expect(page.getByLabel("Password")).toHaveValue("unfinished-password");
  // Dev-server refreshes or discarded tabs can remount the sign-in form.
  await page.reload();
  await expect(page.getByLabel("Email")).toHaveValue("admin@example.com");
  await expect(page.getByLabel("Password")).toHaveValue("");
  await otherTab.close();
});

test("API outage has a retry path, not a fake empty payroll", async ({
  page,
}) => {
  await page.route("**/trpc/**", async (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("main [role=alert]")).toContainText(
    "Could not reach the payroll API",
  );
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});
