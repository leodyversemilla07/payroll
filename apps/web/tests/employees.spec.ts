import { expect, type Page, test } from "@playwright/test";

const branch = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Main office",
  code: "HQ",
};
const department = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Operations",
  code: "OPS",
};
const employee = {
  id: "33333333-3333-4333-8333-333333333333",
  employeeNumber: "EMP-TEST-001",
  firstName: "Ana",
  lastName: "Santos",
  email: "ana@test.invalid",
  contactNumber: "09170000000",
  residentialAddress: "Makati City",
  dateOfBirth: "1995-01-01",
  gender: "Female",
  civilStatus: "Single",
  hireDate: "2026-01-01",
  employmentType: "PROBATIONARY",
  employmentStatus: "ACTIVE",
  payBasis: "MONTHLY",
  tin: "123-456-789-012",
  sssNo: "12-3456789-0",
  philhealthNo: "12-345678901-2",
  pagibigNo: "1234-5678-9012",
  bankName: "Test Bank",
  bankAccountNumber: "1234567890",
  bankAccountName: "Ana Santos",
  isManagerial: false,
  branch,
  department,
  compensation: {
    basicRateMonthlyCents: 3000025,
    basicRateDailyCents: 137932,
    basicRateHourlyCents: 17241,
    isTaxExempt: false,
    effectiveDate: "2026-01-01",
  },
};

function apiError(code: string, message: string) {
  return {
    error: {
      json: {
        message,
        code: -32000,
        data: { code, httpStatus: code === "UNAUTHORIZED" ? 401 : 400 },
      },
    },
  };
}

async function mockPortal(
  page: Page,
  options: {
    role?: string;
    empty?: boolean;
    createFailures?: number;
    optionsFailures?: number;
    detailFailures?: number;
    missingDetails?: boolean;
    noStructure?: boolean;
    longReference?: boolean;
    blockCreate?: Promise<void>;
  } = {},
) {
  let signedIn = false;
  let employees = options.empty
    ? []
    : [
        {
          ...employee,
          employeeNumber: options.longReference
            ? `EMP-2026-${employee.id}`
            : employee.employeeNumber,
        },
      ];
  let createFailures = options.createFailures ?? 0;
  let optionsFailures = options.optionsFailures ?? 0;
  let detailFailures = options.detailFailures ?? 0;
  const requests: string[] = [];
  const creations: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const user = {
    id: "u1",
    organizationId: "o1",
    name: "Test HR",
    email: "hr@test.invalid",
    role: options.role ?? "HR_ADMIN",
  };
  await page.route("**/trpc/**", async (route) => {
    const request = route.request();
    const paths = (
      new URL(request.url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");
    if (paths.includes("employees.create") && options.blockCreate)
      await options.blockCreate;
    const results = paths.map((path, index) => {
      requests.push(path);
      if (path === "auth.login") {
        signedIn = true;
        return { result: { data: { json: { user } } } };
      }
      if (path === "auth.logout") {
        signedIn = false;
        return { result: { data: { json: { success: true } } } };
      }
      if (!signedIn) return apiError("UNAUTHORIZED", "Unauthorized");
      if (path === "employees.getRegistrationOptions") {
        if (optionsFailures-- > 0)
          return apiError("INTERNAL_SERVER_ERROR", "Options unavailable");
        return {
          result: {
            data: {
              json: {
                branches: options.noStructure ? [] : [branch],
                departments: [department],
              },
            },
          },
        };
      }
      if (path === "employees.getById") {
        if (detailFailures-- > 0)
          return apiError("INTERNAL_SERVER_ERROR", "Details unavailable");
        return {
          result: {
            data: { json: options.missingDetails ? null : employees[0] },
          },
        };
      }
      if (path === "employees.create") {
        const payload = request.postDataJSON()[String(index)].json;
        creations.push(payload);
        if (createFailures-- > 0)
          return apiError("CONFLICT", "Duplicate email");
        const basis = payload.payBasis ?? "MONTHLY";
        let monthlyCents = 0;
        let dailyCents = 0;
        let hourlyCents = 0;
        if (basis === "DAILY") {
          dailyCents = Math.round((payload.dailyBasicRatePesos ?? 0) * 100);
          monthlyCents = Math.round((dailyCents * 261) / 12);
          hourlyCents = Math.round(dailyCents / 8);
        } else if (basis === "HOURLY") {
          hourlyCents = Math.round((payload.hourlyBasicRatePesos ?? 0) * 100);
          dailyCents = hourlyCents * 8;
          monthlyCents = Math.round((dailyCents * 261) / 12);
        } else {
          monthlyCents = Math.round((payload.monthlyBasicRatePesos ?? 0) * 100);
          dailyCents = Math.round((monthlyCents * 12) / 261);
          hourlyCents = Math.round(dailyCents / 8);
        }
        employees = [
          {
            ...employee,
            ...payload,
            payBasis: basis,
            employeeNumber: "EMP-TEST-NEW",
            compensation: {
              basicRateMonthlyCents: monthlyCents,
              basicRateDailyCents: dailyCents,
              basicRateHourlyCents: hourlyCents,
              isTaxExempt: payload.isTaxExempt ?? false,
              effectiveDate: "2026-01-01",
            },
          },
        ];
        return { result: { data: { json: employees[0] } } };
      }
      if (path === "employees.update") {
        const payload = request.postDataJSON()[String(index)].json;
        updates.push(payload);
        const currentEmp = employees[0] ?? employee;
        const basis = payload.payBasis ?? currentEmp.payBasis ?? "MONTHLY";
        let monthlyCents = Number(
          currentEmp.compensation?.basicRateMonthlyCents ?? 0,
        );
        let dailyCents = Number(
          currentEmp.compensation?.basicRateDailyCents ?? 0,
        );
        let hourlyCents = Number(
          currentEmp.compensation?.basicRateHourlyCents ?? 0,
        );
        if (
          payload.payBasis ||
          payload.monthlyBasicRatePesos !== undefined ||
          payload.dailyBasicRatePesos !== undefined ||
          payload.hourlyBasicRatePesos !== undefined
        ) {
          if (basis === "DAILY") {
            dailyCents = Math.round((payload.dailyBasicRatePesos ?? 0) * 100);
            monthlyCents = Math.round((dailyCents * 261) / 12);
            hourlyCents = Math.round(dailyCents / 8);
          } else if (basis === "HOURLY") {
            hourlyCents = Math.round((payload.hourlyBasicRatePesos ?? 0) * 100);
            dailyCents = hourlyCents * 8;
            monthlyCents = Math.round((dailyCents * 261) / 12);
          } else if (payload.monthlyBasicRatePesos !== undefined) {
            monthlyCents = Math.round(payload.monthlyBasicRatePesos * 100);
            dailyCents = Math.round((monthlyCents * 12) / 261);
            hourlyCents = Math.round(dailyCents / 8);
          }
        }
        employees = [
          {
            ...currentEmp,
            ...payload,
            payBasis: basis,
            compensation: {
              basicRateMonthlyCents: monthlyCents,
              basicRateDailyCents: dailyCents,
              basicRateHourlyCents: hourlyCents,
              isTaxExempt:
                payload.isTaxExempt ??
                currentEmp.compensation?.isTaxExempt ??
                false,
              effectiveDate: "2026-01-01",
            },
          },
        ];
        return { result: { data: { json: employees[0] } } };
      }
      const json =
        path === "auth.me"
          ? user
          : path === "employees.list"
            ? employees
            : path === "payroll.listRuns"
              ? []
              : null;
      return { result: { data: { json } } };
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(paths.length === 1 ? results[0] : results),
    });
  });
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText("Signed in as")).toBeVisible();
  await page.goto("/portal/employees");
  if (["HR_ADMIN", "SUPER_ADMIN", "PAYROLL_SPECIALIST"].includes(user.role)) {
    await expect(
      page.getByRole("region", { name: "Employees", exact: true }),
    ).toBeVisible();
  } else {
    await expect(page.getByText("No staff records available")).toBeVisible();
  }
  return { requests, creations, updates };
}

async function fillEmployee(page: Page) {
  const form = page.getByRole("region", {
    name: "Create employee",
    exact: true,
  });
  const values = {
    "First name": "Ana",
    "Last name": "Santos",
    "Employee email": "ana@test.invalid",
    "Contact number": "09170000000",
    "Residential address": "Makati City",
    "Date of birth": "1995-01-01",
    Gender: "Female",
    "Civil status": "Single",
    "Hire date": "2026-01-01",
    "Monthly basic rate (PHP)": "30000.25",
    TIN: employee.tin,
    "SSS number": employee.sssNo,
    "PhilHealth number": employee.philhealthNo,
    "Pag-IBIG number": employee.pagibigNo,
    "Bank name": "Test Bank",
    "Bank account number": employee.bankAccountNumber,
    "Bank account name": "Ana Santos",
  };
  for (const [label, value] of Object.entries(values))
    await form.getByLabel(label, { exact: true }).fill(value);
  await form.getByLabel("Branch", { exact: true }).click();
  await page.getByRole("option", { name: /Main office/ }).click();
  await form.getByLabel("Department", { exact: true }).click();
  await page.getByRole("option", { name: /Operations/ }).click();
  await form.getByLabel("Employment type", { exact: true }).click();
  await page.getByRole("option", { name: "PROBATIONARY" }).click();
  return form;
}

test("HR creates an employee with explicit choices and sees the saved profile", async ({
  page,
}) => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = await mockPortal(page, { empty: true, blockCreate: blocked });
  await page.getByRole("button", { name: "Add employee" }).click();
  const form = page.getByRole("region", {
    name: "Create employee",
    exact: true,
  });
  await expect(form.getByLabel("Branch", { exact: true })).toContainText(
    "Select a branch",
  );
  await expect(form.getByLabel("Department", { exact: true })).toContainText(
    "Select a department",
  );
  await form
    .getByRole("button", { name: "Create employee", exact: true })
    .click();
  expect(state.creations).toHaveLength(0);
  await fillEmployee(page);
  await form.getByLabel("Hire date").fill("1990-01-01");
  await form
    .getByRole("button", { name: "Create employee", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText(
    "hire date cannot precede date of birth",
  );
  expect(state.creations).toHaveLength(0);
  await form.getByLabel("Hire date").fill("2026-01-01");
  await form
    .getByRole("checkbox", {
      name: "Managerial employee (PD 851 exclusion)",
      exact: true,
    })
    .check();
  await form
    .getByRole("button", { name: "Create employee", exact: true })
    .click();
  await expect(
    form.getByRole("button", { name: "Creating employee…" }),
  ).toBeDisabled();
  await expect(form.getByLabel("First name")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Cancel employee creation" }),
  ).toBeDisabled();
  release();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "No login account was created." }),
  ).toContainText(
    "Employee EMP-TEST-NEW created. No login account was created.",
  );
  expect(state.creations).toHaveLength(1);
  expect(state.creations[0]).toMatchObject({
    branchId: branch.id,
    departmentId: department.id,
    firstName: "Ana",
    employmentType: "PROBATIONARY",
    monthlyBasicRatePesos: 30000.25,
    isManagerial: true,
    isTaxExempt: false,
  });
  expect(state.creations[0]).not.toHaveProperty("organizationId");
  const details = page.getByRole("region", {
    name: "Employee details",
    exact: true,
  });
  await expect(details).toContainText("₱30,000.25");
  await expect(details).toContainText("Main office");
  await expect(details).toContainText("•••• 7890");
  await expect(details).not.toContainText(employee.bankAccountNumber);
  await expect(details).not.toContainText(employee.tin);
  await expect(form).toHaveCount(0);
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(
    page.getByRole("heading", { name: "Login to your account" }),
  ).toBeVisible();
  await expect(details).toHaveCount(0);
  await expect(page.getByText("Ana Santos")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toContain(employee.bankAccountNumber);
});

test("creation conflict keeps the form entries and allows a corrected retry", async ({
  page,
}) => {
  const state = await mockPortal(page, { createFailures: 1 });
  await page.getByRole("button", { name: "Add employee" }).click();
  const form = await fillEmployee(page);
  await form
    .getByRole("button", { name: "Create employee", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText(
    "Check the email and retry",
  );
  await expect(form.getByLabel("First name")).toHaveValue("Ana");
  await expect(form.getByLabel("Branch", { exact: true })).toContainText(
    branch.name,
  );
  await form.getByLabel("Employee email").fill("ana.corrected@test.invalid");
  await form
    .getByRole("button", { name: "Create employee", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Employee details", exact: true }),
  ).toContainText("ana.corrected@test.invalid");
  expect(state.creations).toHaveLength(2);
});

test("branch and department loading errors have a working retry", async ({
  page,
}) => {
  await mockPortal(page, { optionsFailures: 1 });
  await page.getByRole("button", { name: "Add employee" }).click();
  const form = page.getByRole("region", {
    name: "Create employee",
    exact: true,
  });
  await expect(form.getByRole("alert")).toContainText(
    "Could not load branches and departments",
  );
  await form.getByRole("button", { name: "Retry" }).click();
  await expect(form.getByLabel("Branch", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel employee creation" }).click();
  await expect(form).toHaveCount(0);
});

test("missing organization setup blocks creation instead of guessing defaults", async ({
  page,
}) => {
  const state = await mockPortal(page, { noStructure: true });
  await page.getByRole("button", { name: "Add employee" }).click();
  const form = page.getByRole("region", {
    name: "Create employee",
    exact: true,
  });
  await expect(form.getByRole("alert")).toContainText(
    "A branch and department must be configured",
  );
  await expect(
    form.getByRole("button", { name: "Create employee", exact: true }),
  ).toHaveCount(0);
  expect(state.creations).toHaveLength(0);
});

test("payroll specialists can read profiles but cannot open HR creation", async ({
  page,
}) => {
  const state = await mockPortal(page, {
    role: "PAYROLL_SPECIALIST",
    detailFailures: 1,
  });
  await expect(page.getByRole("button", { name: "Add employee" })).toHaveCount(
    0,
  );
  await page
    .getByRole("region", { name: "Employees", exact: true })
    .getByRole("button", { name: /Ana Santos/ })
    .click();
  const details = page.getByRole("region", {
    name: "Employee details",
    exact: true,
  });
  await expect(details.getByRole("alert")).toContainText(
    "Could not load employee details",
  );
  await details.getByRole("button", { name: "Retry" }).click();
  await expect(details).toContainText("EMP-TEST-001");
  await expect(details).toContainText("₱30,000.25");
  await details.getByRole("button", { name: "Close employee details" }).click();
  await expect(details).toHaveCount(0);
  expect(state.requests).not.toContain("employees.getRegistrationOptions");
});

test("inaccessible employee detail is not presented as an empty payroll profile", async ({
  page,
}) => {
  await mockPortal(page, { missingDetails: true });
  await page
    .getByRole("region", { name: "Employees", exact: true })
    .getByRole("button", { name: /Ana Santos/ })
    .click();
  await expect(
    page.getByRole("region", { name: "Employee details", exact: true }),
  ).toContainText("Employee not found in this organization.");
});

test("employee profiles and the creation form fit a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockPortal(page, { longReference: true });
  await page
    .getByRole("region", { name: "Employees", exact: true })
    .getByRole("button", { name: /Ana Santos/ })
    .click();
  await expect(
    page.getByRole("region", { name: "Employee details", exact: true }),
  ).toContainText(`EMP-2026-${employee.id}`);
  const fitsViewport = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
  await expect.poll(fitsViewport).toBe(true);
  await page.getByRole("button", { name: "Add employee" }).click();
  await fillEmployee(page);
  await expect.poll(fitsViewport).toBe(true);
});

test("HR edits an existing employee profile and sees updated details", async ({
  page,
}) => {
  const state = await mockPortal(page);
  await page
    .getByRole("region", { name: "Employees", exact: true })
    .getByRole("button", { name: /Ana Santos/ })
    .click();
  const details = page.getByRole("region", {
    name: "Employee details",
    exact: true,
  });
  await expect(details).toContainText("Ana Santos");
  await expect(details).toContainText("₱30,000.25");
  await details.getByRole("button", { name: "Edit employee" }).click();
  await expect(
    details.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();

  await details.getByLabel("First name").fill("Ana Maria");
  await details.getByLabel("Monthly basic rate (PHP)").fill("35000.00");
  await details
    .getByRole("checkbox", {
      name: "Managerial employee (PD 851 exclusion)",
      exact: true,
    })
    .check();
  await details.getByRole("button", { name: "Save changes" }).click();

  await expect(details).toContainText("Ana Maria Santos");
  await expect(details).toContainText("₱35,000.00");
  await expect(details).toContainText("Yes");
  expect(state.updates).toHaveLength(1);
  expect(state.updates[0]).toMatchObject({
    id: employee.id,
    firstName: "Ana Maria",
    monthlyBasicRatePesos: 35000,
    isManagerial: true,
  });
});

test("HR creates a daily-paid employee and views computed rates", async ({
  page,
}) => {
  const state = await mockPortal(page, { empty: true });
  await page.getByRole("button", { name: "Add employee" }).click();
  const form = await fillEmployee(page);
  await form.getByLabel("Pay basis", { exact: true }).click();
  await page.getByRole("option", { name: "Daily" }).click();
  await form
    .getByLabel("Daily basic rate (PHP)", { exact: true })
    .fill("1000.00");
  await form
    .getByRole("button", { name: "Create employee", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "No login account was created." }),
  ).toContainText(
    "Employee EMP-TEST-NEW created. No login account was created.",
  );
  expect(state.creations).toHaveLength(1);
  expect(state.creations[0]).toMatchObject({
    payBasis: "DAILY",
    dailyBasicRatePesos: 1000,
  });
  const details = page.getByRole("region", {
    name: "Employee details",
    exact: true,
  });
  await expect(details).toContainText("DAILY");
  await expect(details).toContainText("₱1,000.00");
});

test("HR updates an employee pay basis to HOURLY", async ({ page }) => {
  const state = await mockPortal(page);
  await page
    .getByRole("region", { name: "Employees", exact: true })
    .getByRole("button", { name: /Ana Santos/ })
    .click();
  const details = page.getByRole("region", {
    name: "Employee details",
    exact: true,
  });
  await details.getByRole("button", { name: "Edit employee" }).click();
  await details.getByLabel("Pay basis", { exact: true }).click();
  await page.getByRole("option", { name: "Hourly" }).click();
  await details
    .getByLabel("Hourly basic rate (PHP)", { exact: true })
    .fill("250.00");
  await details.getByRole("button", { name: "Save changes" }).click();

  await expect(details).toContainText("HOURLY");
  await expect(details).toContainText("₱250.00");
  expect(state.updates[0]).toMatchObject({
    id: employee.id,
    payBasis: "HOURLY",
    hourlyBasicRatePesos: 250,
  });
});

for (const role of ["EMPLOYEE", "DEPARTMENT_MANAGER"]) {
  test(`${role} cannot open staff employee management`, async ({ page }) => {
    const state = await mockPortal(page, { role });
    expect(state.requests).not.toContain("employees.list");
    expect(state.requests).not.toContain("employees.getRegistrationOptions");
    await expect(
      page.getByRole("region", { name: "Employees", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add employee" }),
    ).toHaveCount(0);
  });
}
