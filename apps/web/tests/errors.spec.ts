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
