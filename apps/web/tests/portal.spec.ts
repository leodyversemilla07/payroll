import { expect, test } from "@playwright/test";

const runId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const user = {
  id: "u1",
  organizationId: "o1",
  name: "Payroll Tester",
  email: "staff@example.com",
  role: "PAYROLL_SPECIALIST",
};
const employee = {
  id: "e1",
  firstName: "Ana",
  lastName: "Santos",
  employeeNumber: "EMP-001",
  employmentStatus: "ACTIVE",
};
const run = {
  id: runId,
  paymentDate: "2026-09-30T00:00:00.000Z",
  cutoffStartDate: "2026-09-16T00:00:00.000Z",
  cutoffEndDate: "2026-09-30T00:00:00.000Z",
  status: "AUDITED",
  cutoffSequence: "SECOND_CUTOFF",
  totalGrossCents: 120000,
  totalDeductionsCents: 20000,
  totalNetCents: 100000,
  _count: { payslips: 1 },
};
const slip = {
  id: "s1",
  employee,
  employeeId: employee.id,
  basicPayCents: 120000,
  paidLeavePayCents: 0,
  overtimePayCents: 0,
  nightDiffPayCents: 0,
  holidayPayCents: 0,
  restDayPayCents: 0,
  taxableAllowancesCents: 0,
  nonTaxableAllowancesCents: 0,
  grossPayCents: 120000,
  bonusPaidCents: 0,
  tardinessDeductionCents: 0,
  undertimeDeductionCents: 0,
  absenceDeductionCents: 0,
  sssEmployeeCents: 0,
  sssWispEmployeeCents: 0,
  philhealthEmployeeCents: 0,
  pagibigEmployeeCents: 0,
  withholdingTaxCents: 20000,
  loanDeductionsCents: 0,
  otherDeductionsCents: 0,
  totalDeductionsCents: 20000,
  netPayCents: 100000,
};

// Exercise the real browser UI, tRPC batch transport and auth transitions without a database.
test("sign in, read API-backed lists and payslip, then sign out", async ({
  page,
}) => {
  let signedIn = false;
  await page.route("**/trpc/**", async (route) => {
    const paths = (
      new URL(route.request().url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");
    const results = paths.map((path) => {
      if (path === "auth.login") {
        signedIn = true;
        return { result: { data: { json: { user } } } };
      }
      if (path === "auth.logout") {
        signedIn = false;
        return { result: { data: { json: { success: true } } } };
      }
      if (!signedIn)
        return {
          error: {
            json: {
              message: "Unauthorized",
              code: -32001,
              data: { code: "UNAUTHORIZED", httpStatus: 401 },
            },
          },
        };
      const json =
        path === "auth.me"
          ? user
          : path === "employees.list"
            ? [employee]
            : path === "payroll.listRuns"
              ? [run]
              : path === "payroll.getRunDetails"
                ? { ...run, payslips: [slip] }
                : null;
      return { result: { data: { json } } };
    });
    await route.fulfill({
      status: !signedIn && paths.includes("auth.me") ? 401 : 200,
      contentType: "application/json",
      body: JSON.stringify(paths.length === 1 ? results[0] : results),
    });
  });

  await page.goto("/");
  await expect(page).toHaveTitle("Payroll");
  await expect(
    page.getByRole("heading", { name: "Login to your account" }),
  ).toBeVisible();
  const loginCard = page.locator('[data-slot="card"]');
  await expect(loginCard).toBeVisible();
  await expect(loginCard.locator('[data-slot="field"]')).toHaveCount(3);
  await expect(
    loginCard.getByText("Don't have an account? Sign up"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Login with Google" }),
  ).toBeDisabled();
  await expect(page.getByRole("link", { name: "Sign up" })).toHaveCount(0);
  await expect(page.getByRole("note")).toContainText(
    "Not validated for live payroll",
  );
  await page.getByLabel("Email").fill("staff@example.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Payroll", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Signed in as")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Employees" }).getByText("Ana Santos"),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Payroll runs" })
    .getByRole("button")
    .first()
    .click();
  await page
    .getByRole("region", { name: "Run details" })
    .getByRole("button", { name: /Ana Santos/ })
    .click();
  await expect(
    page
      .getByRole("article", { name: "Payslip detail" })
      .getByText("₱1,000.00")
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Login to your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("");
  await expect(page.getByText("Ana Santos")).toHaveCount(0);
});

test("demo is explicitly separate from persisted payroll", async ({ page }) => {
  await page.goto("/demo");
  await expect(page).toHaveTitle("Payroll");
  await expect(page.getByRole("banner")).toContainText("Payroll");
  await expect(page.getByRole("note")).toContainText("DEMO ONLY");
  await expect(page.getByRole("note")).toContainText("Nothing here is saved");
});
