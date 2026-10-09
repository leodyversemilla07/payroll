import { expect, type Page, test } from "@playwright/test";

test.use({ timezoneId: "America/New_York" });

const mockInitialPolicies = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    organizationId: "org-1",
    leaveType: "SIL",
    annualCredits: "5",
    accrualFrequency: "ANNUAL",
    carryoverPolicy: "NO_CARRYOVER",
    maxCarryoverDays: null as string | null,
    eligibleAfterMonths: 12,
    isActive: true,
    createdById: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const mockEmployees = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    firstName: "Maria",
    lastName: "Santos",
    employeeNumber: "EMP-001",
    employmentStatus: "ACTIVE",
  },
];

async function mockPolicies(
  page: Page,
  options: {
    role?: string;
    initialPolicies?: typeof mockInitialPolicies;
  } = {},
) {
  let signedIn = false;
  let policies = [...(options.initialPolicies ?? mockInitialPolicies)];
  const requests: { path: string; method: string }[] = [];
  const mutations: { path: string; payload: Record<string, unknown> }[] = [];

  const user = {
    id: "user-1",
    organizationId: "org-1",
    name: "Staff",
    email: "staff@test.invalid",
    role: options.role ?? "HR_ADMIN",
    employeeId: undefined,
  };

  await page.route("**/trpc/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const paths = (url.pathname.split("/trpc/")[1] ?? "").split(",");

    const results = paths.map((path, index) => {
      requests.push({ path, method: request.method() });

      if (path === "auth.login") {
        signedIn = true;
        return { result: { data: { json: { user } } } };
      }
      if (path === "auth.me") {
        return { result: { data: { json: signedIn ? user : null } } };
      }
      if (!signedIn) {
        return {
          error: {
            json: {
              message: "Unauthorized",
              code: -32000,
              data: { code: "UNAUTHORIZED", httpStatus: 401 },
            },
          },
        };
      }

      if (request.method() === "GET") {
        if (path === "leaves.listPolicies") {
          return { result: { data: { json: policies } } };
        }
        if (path === "employees.list") {
          return { result: { data: { json: mockEmployees } } };
        }
        if (path === "leaves.getBalances") {
          return { result: { data: { json: [] } } };
        }
        if (path === "leaves.listCreditChanges") {
          return { result: { data: { json: [] } } };
        }
        if (path === "leaves.listRequests") {
          return { result: { data: { json: [] } } };
        }
        if (path === "leaves.listPendingRequests") {
          return { result: { data: { json: [] } } };
        }
        return { result: { data: { json: null } } };
      }

      // POST / Mutation
      const rawBody = request.postDataJSON();
      const payload = rawBody?.[String(index)]?.json ?? {};
      mutations.push({ path, payload });

      if (path === "leaves.createPolicy") {
        const created = {
          id: `new-policy-${Date.now()}`,
          organizationId: "org-1",
          leaveType: payload.leaveType,
          annualCredits: String(payload.annualCredits),
          accrualFrequency: payload.accrualFrequency,
          carryoverPolicy: payload.carryoverPolicy,
          maxCarryoverDays: payload.maxCarryoverDays
            ? String(payload.maxCarryoverDays)
            : null,
          eligibleAfterMonths: payload.eligibleAfterMonths,
          isActive: payload.isActive ?? true,
          createdById: user.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        policies.push(created);
        return { result: { data: { json: created } } };
      }

      if (path === "leaves.updatePolicy") {
        const idx = policies.findIndex((p) => p.id === payload.id);
        const current = policies[idx];
        if (current) {
          const updated = {
            ...current,
            annualCredits: payload.annualCredits
              ? String(payload.annualCredits)
              : current.annualCredits,
            accrualFrequency:
              payload.accrualFrequency ?? current.accrualFrequency,
            carryoverPolicy: payload.carryoverPolicy ?? current.carryoverPolicy,
            maxCarryoverDays:
              payload.maxCarryoverDays !== undefined
                ? payload.maxCarryoverDays
                  ? String(payload.maxCarryoverDays)
                  : null
                : current.maxCarryoverDays,
            eligibleAfterMonths:
              payload.eligibleAfterMonths ?? current.eligibleAfterMonths,
            isActive: payload.isActive ?? current.isActive,
            updatedAt: new Date().toISOString(),
          };
          policies[idx] = updated;
          return { result: { data: { json: updated } } };
        }
      }

      if (path === "leaves.deletePolicy") {
        const toDelete = policies.find((p) => p.id === payload.id);
        policies = policies.filter((p) => p.id !== payload.id);
        return {
          result: {
            data: {
              json: { id: payload.id, leaveType: toDelete?.leaveType ?? "SIL" },
            },
          },
        };
      }

      if (path === "leaves.runAccrual") {
        const dryRun = payload.dryRun ?? false;
        return {
          result: {
            data: {
              json: {
                year: payload.year,
                frequency: payload.frequency,
                period: payload.period ?? 1,
                dryRun,
                totalEmployees: 1,
                eligibleCount: 1,
                processedCount: 1,
                totalCreditsAccrued: 1.25,
                items: [
                  {
                    employeeId: "11111111-1111-4111-8111-111111111111",
                    employeeNumber: "EMP-001",
                    employeeName: "Maria Santos",
                    leaveType: payload.leaveType ?? "VACATION",
                    tenureMonths: 18,
                    creditsToAccrue: 1.25,
                    previousBalance: 5,
                    newBalance: 6.25,
                    status: "ACCRUED",
                    message: dryRun
                      ? "Preview: would accrue 1.25 credits"
                      : "Successfully accrued 1.25 credits",
                  },
                ],
              },
            },
          },
        };
      }

      if (path === "leaves.runCarryover") {
        const dryRun = payload.dryRun ?? false;
        return {
          result: {
            data: {
              json: {
                fromYear: payload.fromYear,
                toYear: payload.toYear,
                dryRun,
                totalEvaluated: 1,
                processedCount: 1,
                totalCreditsCarriedOver: 5,
                items: [
                  {
                    employeeId: "11111111-1111-4111-8111-111111111111",
                    employeeNumber: "EMP-001",
                    employeeName: "Maria Santos",
                    leaveType: payload.leaveType ?? "VACATION",
                    unusedFromPriorYear: 7,
                    carriedOver: 5,
                    previousBalance: 0,
                    newBalance: 5,
                    status: "CARRIED_OVER",
                    message: dryRun
                      ? "Preview: would carry over 5 day(s)"
                      : "Successfully carried over 5 day(s)",
                  },
                ],
              },
            },
          },
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
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText("Signed in as")).toBeVisible();
  await page.goto("/leaves");

  return { requests, mutations };
}

test("HR_ADMIN views leave policies, creates a new VACATION policy, and sees it in table", async ({
  page,
}) => {
  const state = await mockPolicies(page);

  const section = page.getByRole("region", {
    name: "Leave policies and accrual",
    exact: true,
  });
  await expect(section).toBeVisible();
  await expect(section.getByText("SIL")).toBeVisible();
  await expect(section.getByText("5 days")).toBeVisible();

  // Click New Policy
  await section
    .getByRole("button", { name: "New Policy", exact: true })
    .click();

  const form = section.getByRole("form", {
    name: "Create leave policy",
    exact: true,
  });
  await expect(form).toBeVisible();

  await form.getByLabel("Leave Policy Code").fill("VACATION");
  await form.getByLabel("Annual Credits (Days / Year)").fill("15");
  await form.getByLabel("Accrual Frequency").click();
  await page.getByRole("option", { name: /Monthly/ }).click();
  await form.getByLabel("Year-End Carryover Policy").click();
  await page.getByRole("option", { name: /Capped/ }).click();
  await form.getByLabel("Maximum Carryover Days").fill("5");
  await form.getByLabel("Eligible After Tenure (Months)").fill("6");

  await form.getByRole("button", { name: "Save Policy", exact: true }).click();

  // Verify form closed and notification appeared
  await expect(form).toHaveCount(0);
  await expect(
    section.getByText('Leave policy for "VACATION" created successfully.'),
  ).toBeVisible();

  expect(state.mutations[0]).toMatchObject({
    path: "leaves.createPolicy",
    payload: {
      leaveType: "VACATION",
      annualCredits: 15,
      accrualFrequency: "MONTHLY",
      carryoverPolicy: "CAPPED",
      maxCarryoverDays: 5,
      eligibleAfterMonths: 6,
    },
  });

  await expect(
    section.getByRole("cell", { name: "VACATION", exact: true }),
  ).toBeVisible();
});

test("HR_ADMIN edits and deletes a leave policy", async ({ page }) => {
  const state = await mockPolicies(page);

  const section = page.getByRole("region", {
    name: "Leave policies and accrual",
    exact: true,
  });
  await expect(section).toBeVisible();

  // Click edit SIL
  await section.getByRole("button", { name: "Edit SIL" }).click();

  const editForm = section.getByRole("form", {
    name: "Edit leave policy",
    exact: true,
  });
  await expect(editForm).toBeVisible();

  await editForm.getByLabel("Annual Credits (Days / Year)").fill("7.5");
  await editForm
    .getByRole("button", { name: "Save Changes", exact: true })
    .click();

  await expect(editForm).toHaveCount(0);
  await expect(
    section.getByText('Leave policy for "SIL" updated successfully.'),
  ).toBeVisible();

  expect(state.mutations[0]).toMatchObject({
    path: "leaves.updatePolicy",
    payload: {
      annualCredits: 7.5,
    },
  });

  // Delete SIL policy
  page.on("dialog", (dialog) => dialog.accept());
  await section.getByRole("button", { name: "Delete SIL" }).click();

  await expect(section.getByText('Policy "SIL" deleted.')).toBeVisible();
  expect(
    state.mutations.find((m) => m.path === "leaves.deletePolicy"),
  ).toBeDefined();
});

test("HR_ADMIN previews accrual with dryRun and executes accrual", async ({
  page,
}) => {
  const state = await mockPolicies(page);

  const section = page.getByRole("region", {
    name: "Leave policies and accrual",
    exact: true,
  });

  await section.getByRole("button", { name: "Run Accrual" }).click();

  const accrualPanel = section.getByRole("region", {
    name: "Run leave accrual",
    exact: true,
  });
  await expect(accrualPanel).toBeVisible();

  // 1. Preview
  await accrualPanel
    .getByRole("button", { name: "Preview Accrual", exact: true })
    .click();

  const results = section.getByRole("region", {
    name: "Accrual results",
    exact: true,
  });
  await expect(results).toBeVisible();
  await expect(results.getByText("Preview Results")).toBeVisible();
  await expect(results.getByText("Maria Santos (EMP-001)")).toBeVisible();
  await expect(results.getByRole("cell", { name: "+1.25" })).toBeVisible();

  expect(state.mutations[0]).toMatchObject({
    path: "leaves.runAccrual",
    payload: {
      dryRun: true,
    },
  });

  // 2. Execute
  await accrualPanel
    .getByRole("button", { name: "Execute Accrual", exact: true })
    .click();

  await expect(
    section.getByText(/Accrual executed successfully for 1 employee/),
  ).toBeVisible();

  expect(state.mutations[1]).toMatchObject({
    path: "leaves.runAccrual",
    payload: {
      dryRun: false,
    },
  });
});

test("HR_ADMIN previews carryover with dryRun and executes carryover", async ({
  page,
}) => {
  const state = await mockPolicies(page);

  const section = page.getByRole("region", {
    name: "Leave policies and accrual",
    exact: true,
  });

  await section.getByRole("button", { name: "Year-End Carryover" }).click();

  const carryoverPanel = section.getByRole("region", {
    name: "Run leave carryover",
    exact: true,
  });
  await expect(carryoverPanel).toBeVisible();

  // 1. Preview
  await carryoverPanel
    .getByRole("button", { name: "Preview Carryover", exact: true })
    .click();

  const results = section.getByRole("region", {
    name: "Carryover results",
    exact: true,
  });
  await expect(results).toBeVisible();
  await expect(results.getByText("Preview Results")).toBeVisible();
  await expect(results.getByText("Maria Santos (EMP-001)")).toBeVisible();
  await expect(results.getByRole("cell", { name: "+5 days" })).toBeVisible();

  expect(state.mutations[0]).toMatchObject({
    path: "leaves.runCarryover",
    payload: {
      dryRun: true,
    },
  });

  // 2. Execute
  await carryoverPanel
    .getByRole("button", { name: "Execute Carryover", exact: true })
    .click();

  await expect(
    section.getByText(/Carryover executed successfully for 1 employee/),
  ).toBeVisible();

  expect(state.mutations[1]).toMatchObject({
    path: "leaves.runCarryover",
    payload: {
      dryRun: false,
    },
  });
});

test("PAYROLL_SPECIALIST can view policies but cannot see management buttons", async ({
  page,
}) => {
  await mockPolicies(page, { role: "PAYROLL_SPECIALIST" });

  const section = page.getByRole("region", {
    name: "Leave policies and accrual",
    exact: true,
  });
  await expect(section).toBeVisible();
  await expect(section.getByText("SIL")).toBeVisible();

  await expect(section.getByRole("button", { name: "New Policy" })).toHaveCount(
    0,
  );
  await expect(
    section.getByRole("button", { name: "Run Accrual" }),
  ).toHaveCount(0);
  await expect(
    section.getByRole("button", { name: "Year-End Carryover" }),
  ).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Edit SIL" })).toHaveCount(
    0,
  );
  await expect(section.getByRole("button", { name: "Delete SIL" })).toHaveCount(
    0,
  );
});
