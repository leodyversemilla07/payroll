import { type BrowserContext, expect, type Page, test } from "@playwright/test";

type Person = {
  id: string;
  organizationId: string;
  role: string;
  employeeId: string | null;
  name: string;
  email: string;
};
const owner = (p: Person) =>
  JSON.stringify([p.id, p.organizationId, p.role, p.employeeId]);
async function cookie(context: BrowserContext, token: string) {
  await context.addCookies([
    {
      name: "principal_test_session",
      value: token,
      url: "http://localhost:4000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
async function setup(page: Page) {
  const people: Record<string, Person> & { alpha: Person; beta: Person } = {
    alpha: {
      id: "user-alpha",
      organizationId: "org-alpha",
      role: "HR_ADMIN",
      employeeId: null,
      name: "Alpha Account",
      email: "alpha@test.invalid",
    },
    beta: {
      id: "user-beta",
      organizationId: "org-beta",
      role: "HR_ADMIN",
      employeeId: null,
      name: "Beta Account",
      email: "beta@test.invalid",
    },
  };
  const state = {
    people,
    acceptedWrites: 0,
    failBusiness: false,
    failAuth: false,
    alphaName: "Alpha Private Employee",
    checks: 0,
    headers: [] as string[],
    delayAlpha: false,
  };
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.context().route("**/trpc/**", async (route) => {
    const headers = await route.request().allHeaders();
    const token =
      /principal_test_session=([^;]+)/.exec(headers.cookie ?? "")?.[1] ?? "";
    const account = people[token] ? { ...people[token] } : null;
    const paths = (
      new URL(route.request().url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");
    const error = (code: string, message: string, httpStatus: number) => ({
      error: { json: { message, code: -32001, data: { code, httpStatus } } },
    });
    const expected = headers["x-payroll-principal"];
    if (expected) state.headers.push(expected);
    const results = paths.map((path) => {
      if (!account)
        return error("UNAUTHORIZED", "Authentication is required", 401);
      if (path === "auth.me") {
        state.checks++;
        return state.failAuth
          ? error("INTERNAL_SERVER_ERROR", "Synthetic session outage", 500)
          : { result: { data: { json: account } } };
      }
      if (expected !== owner(account))
        return error("UNAUTHORIZED", "Session changed", 401);
      if (state.failBusiness)
        return error(
          "INTERNAL_SERVER_ERROR",
          "Synthetic data fetch failed",
          500,
        );
      if (path === "payroll.triggerRun") state.acceptedWrites++;
      const json =
        path === "employees.list"
          ? [
              {
                id: `employee-${token}`,
                employeeNumber: `EMP-${token}`,
                firstName:
                  token === "alpha" ? state.alphaName : "Beta Private Employee",
                lastName: "",
                employmentStatus: "ACTIVE",
              },
            ]
          : path === "employees.getRegistrationOptions"
            ? {
                branches: [
                  {
                    id: "11111111-1111-4111-8111-111111111111",
                    name: "Synthetic HQ",
                    code: "HQ",
                  },
                ],
                departments: [
                  {
                    id: "22222222-2222-4222-8222-222222222222",
                    name: "Synthetic HR",
                    code: "HR",
                  },
                ],
              }
            : null;
      return { result: { data: { json } } };
    });
    if (
      state.delayAlpha &&
      token === "alpha" &&
      paths.includes("employees.list")
    ) {
      state.delayAlpha = false;
      await delayed;
    }
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paths.length === 1 ? results[0] : results),
      });
    } catch (error) {
      if (!route.request().failure()) throw error;
    }
  });
  await cookie(page.context(), "alpha");
  return { state, release };
}
async function focusRecheck(page: Page) {
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
}
async function watchMixedIdentity(page: Page) {
  await page.evaluate(() => {
    const state = { mixed: false };
    Object.assign(window, { principalTest: state });
    new MutationObserver(() => {
      const text = document.body.textContent ?? "";
      if (
        text.includes("Beta Account") &&
        text.includes("Alpha Private Employee")
      )
        state.mixed = true;
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

test("another tab's account change cannot reuse cached employees, even if the new fetch fails", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto("/portal/employees");
  await expect(
    page.getByText("Alpha Private Employee", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  await page
    .getByLabel("First name", { exact: true })
    .fill("Alpha unsaved draft");
  await watchMixedIdentity(page);
  const other = await page.context().newPage();
  await other.goto("about:blank");
  state.failBusiness = true;
  await cookie(page.context(), "beta");
  await page.bringToFront();
  await focusRecheck(page);
  await expect(page.getByText("Signed in as")).toContainText("Beta Account");
  await expect(
    page.getByText("Alpha Private Employee", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("First name", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { principalTest: { mixed: boolean } })
          .principalTest.mixed,
    ),
  ).toBe(false);
  expect(state.headers).toContain(owner(state.people.beta));
  state.failBusiness = false;
  state.alphaName = "Fresh Alpha Record";
  await cookie(page.context(), "alpha");
  await focusRecheck(page);
  await expect(
    page.getByText("Fresh Alpha Record", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("");
  await other.close();
});

for (const change of ["organization", "role", "employee link"] as const) {
  test(`the same user ID gets a fresh business cache after a ${change} change`, async ({
    page,
  }) => {
    const { state } = await setup(page);
    await page.goto("/portal/employees");
    await expect(
      page.getByText("Alpha Private Employee", { exact: true }),
    ).toBeVisible();
    if (change === "organization")
      state.people.alpha.organizationId = "new-org";
    if (change === "role") state.people.alpha.role = "PAYROLL_SPECIALIST";
    if (change === "employee link")
      state.people.alpha.employeeId = "linked-employee";
    state.failBusiness = true;
    await focusRecheck(page);
    await expect
      .poll(() => state.headers.includes(owner(state.people.alpha)))
      .toBe(true);
    await expect(
      page.getByText("Alpha Private Employee", { exact: true }),
    ).toHaveCount(0);
    if (change === "role")
      await expect(
        page.getByRole("button", { name: "Add employee", exact: true }),
      ).toHaveCount(0);
  });
}

test("late responses belonging to the old account cannot repopulate the new account's cache", async ({
  page,
}) => {
  const { state, release } = await setup(page);
  state.delayAlpha = true;
  await page.goto("/portal/employees");
  await expect
    .poll(() => state.headers.includes(owner(state.people.alpha)))
    .toBe(true);
  await cookie(page.context(), "beta");
  await focusRecheck(page);
  await expect(
    page.getByText("Beta Private Employee", { exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByText("Alpha Private Employee", { exact: true }),
  ).toHaveCount(0);
});

test("expired sessions discard business records instead of leaving cached data behind", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/portal/employees");
  await expect(
    page.getByText("Alpha Private Employee", { exact: true }),
  ).toBeVisible();
  await page.context().clearCookies();
  await focusRecheck(page);
  await expect(
    page.getByRole("heading", { name: "Login to your account" }),
  ).toBeVisible();
  await expect(
    page.getByText("Alpha Private Employee", { exact: true }),
  ).toHaveCount(0);
});

test("same-principal session and data outages preserve an unsaved editor", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto("/portal/employees");
  await expect(
    page.getByText("Alpha Private Employee", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  await page
    .getByLabel("First name", { exact: true })
    .fill("Retained same-account draft");
  state.failBusiness = true;
  state.failAuth = true;
  const before = state.checks;
  await focusRecheck(page);
  await expect.poll(() => state.checks).toBeGreaterThan(before);
  await expect(
    page.getByRole("button", { name: "Retry choices", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue(
    "Retained same-account draft",
  );
});

test("a stale account mutation is rejected and rechecks authentication without a focus event", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.people.alpha.role = "SUPER_ADMIN";
  state.people.beta.role = "SUPER_ADMIN";
  await page.goto("/portal/process-payroll");
  await expect(page.getByText("Signed in as")).toContainText("Alpha Account");
  await page
    .getByLabel("Regular run cutoff start", { exact: true })
    .fill("2026-09-01");
  await page
    .getByLabel("Regular run cutoff end", { exact: true })
    .fill("2026-09-15");
  await page
    .getByLabel("Regular run payment date", { exact: true })
    .fill("2026-09-15");
  await cookie(page.context(), "beta");
  await page
    .getByRole("button", { name: "Process regular run", exact: true })
    .click();
  await expect(page.getByText("Signed in as")).toContainText("Beta Account");
  expect(state.acceptedWrites).toBe(0);
  await expect(
    page.getByLabel("Regular run cutoff start", { exact: true }),
  ).toHaveValue("");
});
