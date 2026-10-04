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

const overviewData = {
  employees: {
    total: 10,
    active: 8,
    onLeave: 1,
    resigned: 1,
    terminated: 0,
    other: 0,
  },
  payroll: {
    latestRun: {
      id: runId,
      status: "AUDITED",
      cutoffStartDate: "2026-09-16T00:00:00.000Z",
      cutoffEndDate: "2026-09-30T00:00:00.000Z",
      paymentDate: "2026-09-30T00:00:00.000Z",
      cutoffSequence: "SECOND_CUTOFF",
      totalGrossCents: 120000,
      totalNetCents: 100000,
      totalDeductionsCents: 20000,
      totalEmployerCostCents: 130000,
      payslipCount: 1,
    },
    recentRuns: [
      {
        id: runId,
        status: "AUDITED",
        cutoffStartDate: "2026-09-16T00:00:00.000Z",
        cutoffEndDate: "2026-09-30T00:00:00.000Z",
        paymentDate: "2026-09-30T00:00:00.000Z",
        cutoffSequence: "SECOND_CUTOFF",
        totalGrossCents: 120000,
        totalNetCents: 100000,
        totalDeductionsCents: 20000,
        payslipCount: 1,
        createdAt: "2026-09-30T00:00:00.000Z",
      },
    ],
  },
  leaves: {
    pendingCount: 2,
  },
  loans: {
    activeCount: 1,
    totalOutstandingCents: 500000,
  },
  audit: [],
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
          : path === "dashboard.getOverview"
            ? overviewData
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
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Dashboard metrics" }),
  ).toBeVisible();
  await expect(page.getByText("8 / 10 total")).toBeVisible();
  await expect(page.getByText("Recent Payroll Runs")).toBeVisible();
  await expect(page.getByText("Signed in as")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Payroll navigation" });
  await nav.getByRole("link", { name: "Employees", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Employees" }).getByText("Ana Santos"),
  ).toBeVisible();
  await nav
    .getByRole("link", { name: "Payroll runs & payslips", exact: true })
    .click();
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

test("removed demo returns 404 and sign-in has no demo link", async ({
  page,
}) => {
  const response = await page.goto("/demo");
  expect(response?.status()).toBe(404);
  await page.goto("/");
  await expect(page.locator('a[href="/demo"]')).toHaveCount(0);
});

test("overview page displays error banner when dashboard metrics fail to load and recovers on retry", async ({
  page,
}) => {
  let failOverview = true;
  await page.route("**/trpc/**", async (route) => {
    const paths = (
      new URL(route.request().url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");
    const results = paths.map((path) => {
      if (path === "auth.login" || path === "auth.me") {
        return { result: { data: { json: user } } };
      }
      if (path === "dashboard.getOverview") {
        if (failOverview) {
          return {
            error: {
              json: {
                message: "Internal server error",
                code: -32603,
                data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
              },
            },
          };
        }
        return { result: { data: { json: overviewData } } };
      }
      return { result: { data: { json: null } } };
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(paths.length === 1 ? results[0] : results),
    });
  });

  await page.goto("/");
  await page.getByLabel("Email").fill("staff@example.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();

  await expect(
    page.getByText("Dashboard statistics unavailable"),
  ).toBeVisible();

  // Navigation cards are still accessible even when stats fail
  await expect(
    page.getByRole("link", { name: "Open Employees" }),
  ).toBeVisible();

  // Retry loading overview
  failOverview = false;
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(
    page.getByRole("region", { name: "Dashboard metrics" }),
  ).toBeVisible();
  await expect(page.getByText("8 / 10 total")).toBeVisible();
});
