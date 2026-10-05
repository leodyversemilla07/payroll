import { expect, test } from "@playwright/test";

const user = {
  id: "u1",
  organizationId: "o1",
  name: "Payroll Admin",
  email: "admin@example.com",
  role: "SUPER_ADMIN",
};
const employee = {
  id: "e1",
  firstName: "Ana",
  lastName: "Santos",
  employeeNumber: "EMP-001",
  employmentStatus: "ACTIVE",
};
const runA = {
  id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  paymentDate: "2026-09-30T00:00:00.000Z",
  cutoffStartDate: "2026-09-16T00:00:00.000Z",
  cutoffEndDate: "2026-09-30T00:00:00.000Z",
  status: "AUDITED",
  cutoffSequence: "SECOND_CUTOFF",
  totalGrossCents: 120000,
  totalDeductionsCents: 20000,
  totalNetCents: 100000,
  _count: { payslips: 0 },
};

// Exercise the payroll run lifecycle UI against mocked tRPC: trigger a run,
// approve it, cancel it, then disburse the remaining run.
test("trigger, approve, cancel and disburse payroll runs", async ({ page }) => {
  let signedIn = false;
  const mutations: string[] = [];
  let runs: Record<string, typeof runA> = { [runA.id]: { ...runA } };
  function runIdFromRequest(
    method: string,
    url: string,
    postData: unknown,
  ): string | null {
    try {
      const raw = new URL(url).searchParams.get("input");
      if (raw) {
        const parsed = JSON.parse(raw) as Record<
          string,
          { json?: { runId?: string } } | { runId?: string }
        >;
        // httpBatchLink batches GET inputs as {"0": {"json": ...}, ...}.
        for (const value of Object.values(parsed)) {
          const runId =
            (value as { json?: { runId?: string } }).json?.runId ??
            (value as { runId?: string }).runId;
          if (runId) return runId;
        }
      }
      if (method === "POST" && postData) {
        const body = postData as Record<string, { json?: { runId?: string } }>;
        const first = Object.values(body)[0]?.json?.runId;
        return first ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }
  await page.route("**/trpc/**", async (route) => {
    const paths = (
      new URL(route.request().url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");
    const isMutation = route.request().method() === "POST";
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
      if (isMutation) mutations.push(path);
      if (path === "auth.me") return { result: { data: { json: user } } };
      if (path === "employees.list")
        return { result: { data: { json: [employee] } } };
      if (path === "payroll.listRuns")
        return { result: { data: { json: Object.values(runs) } } };
      if (path === "payroll.getRunDetails") {
        const run = runIdFromRequest(
          route.request().method(),
          route.request().url(),
          route.request().postDataJSON(),
        );
        const found = (run && runs[run]) ?? null;
        if (!found) return { result: { data: { json: null } } };
        return { result: { data: { json: { ...found, payslips: [] } } } };
      }
      if (path === "payroll.triggerRun") {
        const created = {
          ...runA,
          id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
          status: "AUDITED",
        };
        runs = { [created.id]: created, ...runs };
        return { result: { data: { json: created } } };
      }
      if (path === "payroll.triggerThirteenthMonthRun") {
        return { result: { data: { json: { ...runA, status: "AUDITED" } } } };
      }
      if (path === "payroll.approveRun") {
        const id = runIdFromRequest(
          route.request().method(),
          route.request().url(),
          route.request().postDataJSON(),
        );
        const run = (id && runs[id]) ?? null;
        if (!run) return { result: { data: { json: null } } };
        run.status = "APPROVED";
        return { result: { data: { json: run } } };
      }
      if (path === "payroll.disburseRun") {
        const id = runIdFromRequest(
          route.request().method(),
          route.request().url(),
          route.request().postDataJSON(),
        );
        const run = (id && runs[id]) ?? null;
        if (!run) return { result: { data: { json: null } } };
        run.status = "DISBURSED";
        return { result: { data: { json: run } } };
      }
      if (path === "payroll.cancelRun") {
        const id = runIdFromRequest(
          route.request().method(),
          route.request().url(),
          route.request().postDataJSON(),
        );
        if (id) delete runs[id];
        return {
          result: { data: { json: { success: true, runId: id } } },
        };
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
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Payroll navigation" });
  await nav
    .getByRole("link", { name: "Payroll runs & payslips", exact: true })
    .click();
  const runsRegion = page.getByRole("region", { name: "Payroll runs" });
  await expect(runsRegion).toBeVisible();
  await nav.getByRole("link", { name: "Process payroll", exact: true }).click();

  const processRegion = page.getByRole("region", {
    name: "Process payroll run",
  });
  await processRegion.getByLabel("Cutoff", { exact: true }).click();
  await page.getByRole("option", { name: /Second cutoff/ }).click();
  await processRegion.getByLabel("Regular run cutoff start").fill("2026-10-16");
  await processRegion.getByLabel("Regular run cutoff end").fill("2026-10-31");
  await processRegion.getByLabel("Regular run payment date").fill("2026-11-01");
  const triggerRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().includes("payroll.triggerRun"),
  );
  await processRegion
    .getByRole("button", { name: "Process regular run" })
    .click();
  await expect(processRegion.getByText("Run processed.")).toBeVisible();
  expect(mutations).toContain("payroll.triggerRun");
  expect((await triggerRequest).postDataJSON()["0"].json).toMatchObject({
    cutoffSequence: "SECOND_CUTOFF",
    cutoffStartDate: "2026-10-16",
    cutoffEndDate: "2026-10-31",
    paymentDate: "2026-11-01",
  });

  // The triggered run is newest-first in the mock list; open run details.
  await page
    .getByRole("link", { name: "Review payroll runs", exact: true })
    .click();
  await runsRegion.getByRole("button").first().click();
  const details = page.getByRole("region", { name: "Run details" });
  await expect(
    details.getByRole("button", { name: "Approve run" }),
  ).toBeVisible();
  await details.getByRole("button", { name: "Approve run" }).click();
  await expect(details.getByText("Run approved.")).toBeVisible();
  expect(mutations).toContain("payroll.approveRun");

  await details.getByRole("button", { name: "Cancel run" }).click();
  await details.getByRole("button", { name: "Confirm cancel" }).click();
  await expect(details).toHaveCount(0);
  expect(mutations).toContain("payroll.cancelRun");

  // One run remains: approve then disburse it to the point of no return.
  await runsRegion.getByRole("button").first().click();
  await expect(
    page
      .getByRole("region", { name: "Run details" })
      .getByRole("button", { name: "Approve run" }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Run details" })
    .getByRole("button", { name: "Approve run" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Run details" })
      .getByText("Run approved."),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Run details" })
    .getByRole("button", { name: "Disburse run" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Run details" })
      .getByText("Run disbursed."),
  ).toBeVisible();
  expect(mutations).toContain("payroll.disburseRun");
  await expect(
    page
      .getByRole("region", { name: "Run details" })
      .getByText("Disbursed runs cannot be cancelled."),
  ).toBeVisible();
});
