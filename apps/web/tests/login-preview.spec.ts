import { expect, test } from "@playwright/test";

test("shadcn login preview uses the configured components without authenticating", async ({
  page,
}) => {
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/trpc/")) apiCalls.push(request.url());
  });

  await page.goto("/login-preview");
  await expect(
    page.getByRole("heading", { name: "Login to your account" }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="card"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="field"]')).toHaveCount(3);
  await expect(page.locator('[data-slot="input"]')).toHaveCount(2);
  await expect(page.getByRole("note")).toContainText("UI preview only");

  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByLabel("Password").fill("example-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/login-preview$/);
  expect(apiCalls).toEqual([]);
});

test("shadcn login preview uses the existing system theme", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login-preview");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("heading", { name: "Login to your account" }),
  ).toBeVisible();
});
