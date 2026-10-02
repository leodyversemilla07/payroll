import { expect, type Page, test } from "@playwright/test";
import { fromManilaInput, toManilaInput } from "../lib/attendance-time";

test.use({ timezoneId: "America/New_York" });
const employee = {
  id: "11111111-1111-4111-8111-111111111111",
  firstName: "Ana",
  lastName: "Santos",
  employeeNumber: "EMP-001",
  employmentStatus: "ACTIVE",
};
const original = {
  id: "22222222-2222-4222-8222-222222222222",
  employeeId: employee.id,
  date: "2026-09-10T00:00:00.000Z",
  dayType: "REGULAR_WORKDAY",
  timeIn: "2026-09-10T00:00:00.000Z",
  timeOut: "2026-09-10T09:00:00.000Z",
  actualWorkedMinutes: 480,
  tardinessMinutes: 0,
  undertimeMinutes: 0,
  overtimeMinutes: 0,
  nightDiffMinutes: 0,
  restDayOTMinutes: 0,
  specialHolidayMinutes: 0,
  regularHolidayMinutes: 0,
  isAbsent: false,
  isApproved: false,
  remarks: null,
  createdAt: "2026-09-10T08:00:00.000Z",
  updatedAt: "2026-09-10T08:00:00.000Z",
};
function apiError(code: string, message: string) {
  return {
    error: { json: { message, code: -32000, data: { code, httpStatus: 400 } } },
  };
}
async function mockDtr(
  page: Page,
  options: {
    role?: string;
    empty?: boolean;
    readFailures?: number;
    saveFailures?: number;
    conflictOnce?: boolean;
    refreshFailure?: boolean;
    premium?: boolean;
    blockSave?: Promise<void>;
  } = {},
) {
  let signedIn = false;
  let rows = options.empty
    ? []
    : [
        {
          ...original,
          dayType: options.premium ? "DOUBLE_HOLIDAY" : original.dayType,
        },
      ];
  let readFailures = options.readFailures ?? 0;
  let saveFailures = options.saveFailures ?? 0;
  let conflict = options.conflictOnce ?? false;
  let reads = 0;
  const requests: string[] = [];
  const saves: Record<string, unknown>[] = [];
  const user = {
    id: "u1",
    organizationId: "o1",
    name: "Test staff",
    email: "staff@test.invalid",
    role: options.role ?? "HR_ADMIN",
  };
  await page.route("**/trpc/**", async (route) => {
    const request = route.request();
    const paths = (
      new URL(request.url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");
    if (paths.includes("timekeeping.adjustAttendance") && options.blockSave)
      await options.blockSave;
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
      if (path === "timekeeping.getDTR") {
        reads++;
        if (readFailures-- > 0 || (options.refreshFailure && reads === 2))
          return apiError("INTERNAL_SERVER_ERROR", "Read failed");
        return { result: { data: { json: rows } } };
      }
      if (path === "timekeeping.adjustAttendance") {
        const payload = request.postDataJSON()[String(index)].json;
        saves.push(payload);
        if (saveFailures-- > 0)
          return apiError("INTERNAL_SERVER_ERROR", "Save failed");
        if (conflict) {
          conflict = false;
          rows = [
            {
              ...original,
              actualWorkedMinutes: 450,
              updatedAt: "2026-09-10T09:00:00.000Z",
            },
          ];
          return apiError(
            "CONFLICT",
            "Attendance changed since it was loaded. Reload the DTR before correcting it.",
          );
        }
        const saved = {
          ...original,
          ...payload,
          date: `${payload.date}T00:00:00.000Z`,
          updatedAt: "2026-09-10T10:00:00.000Z",
        };
        rows = [...rows.filter((row) => row.date !== saved.date), saved];
        return { result: { data: { json: saved } } };
      }
      const json =
        path === "auth.me"
          ? user
          : path === "employees.list"
            ? [employee]
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
  await page.goto("/portal/attendance");
  return { requests, saves };
}
async function loadDtr(page: Page) {
  const section = page.getByRole("region", {
    name: "Attendance and DTR",
    exact: true,
  });
  await section.getByLabel("DTR employee").selectOption(employee.id);
  await section.getByLabel("DTR start date").fill("2026-09-01");
  await section.getByLabel("DTR end date").fill("2026-09-15");
  await section.getByRole("button", { name: "Load DTR", exact: true }).click();
  return section;
}
async function editDtr(page: Page) {
  await page
    .getByRole("region", { name: "Attendance 2026-09-10", exact: true })
    .getByRole("button", { name: "Correct attendance", exact: true })
    .click();
  return page.getByRole("region", {
    name: "Attendance correction",
    exact: true,
  });
}

test("Manila conversion preserves timestamps independently of browser timezone", () => {
  expect(toManilaInput("2026-09-09T16:01:02.123Z")).toBe(
    "2026-09-10T00:01:02.123",
  );
  expect(fromManilaInput("2026-09-10T00:01:02.123")).toBe(
    "2026-09-09T16:01:02.123Z",
  );
  expect(fromManilaInput("")).toBeNull();
});

test("load and correct DTR using Manila punches, explicit totals and the loaded version", async ({
  page,
}) => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = await mockDtr(page, {
    role: "PAYROLL_SPECIALIST",
    blockSave: blocked,
  });
  const section = await loadDtr(page);
  const row = page.getByRole("region", {
    name: "Attendance 2026-09-10",
    exact: true,
  });
  await expect(row).toContainText("8:00 AM");
  const editor = await editDtr(page);
  await expect(editor.getByLabel("Time in (Asia/Manila)")).toHaveValue(
    "2026-09-10T08:00",
  );
  await expect(
    editor.getByRole("checkbox", { name: "Approve for payroll", exact: true }),
  ).not.toBeChecked();
  await editor
    .getByLabel("Total worked minutes (including overtime)")
    .fill("450");
  await editor.getByLabel("Tardiness minutes").fill("30");
  await editor.getByLabel("Time in (Asia/Manila)").fill("2026-09-10T08:30");
  await editor
    .getByLabel("Correction reason")
    .fill("Arrival verified against the signed attendance sheet");
  await editor.getByRole("checkbox", { name: "Approve for payroll" }).check();
  await editor
    .getByRole("button", { name: "Save attendance", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Saving attendance…" }),
  ).toBeDisabled();
  await expect(section.getByLabel("DTR employee")).toBeDisabled();
  await expect(
    editor.getByRole("button", { name: "Cancel attendance correction" }),
  ).toBeDisabled();
  release();
  await expect(
    section
      .getByRole("status")
      .filter({ hasText: "saved with a correction audit" }),
  ).toBeVisible();
  expect(state.saves).toHaveLength(1);
  expect(state.saves[0]).toMatchObject({
    employeeId: employee.id,
    date: "2026-09-10",
    expectedUpdatedAt: original.updatedAt,
    timeIn: "2026-09-10T00:30:00.000Z",
    timeOut: original.timeOut,
    actualWorkedMinutes: 450,
    tardinessMinutes: 30,
    isApproved: true,
  });
  expect(state.saves[0]).not.toHaveProperty("organizationId");
  await expect(editor).toHaveCount(0);
  await expect(row).toContainText("450");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Login to your account" }),
  ).toBeVisible();
  await expect(section).toHaveCount(0);
});

test("rejects inverted ranges and inconsistent corrections without sending writes", async ({
  page,
}) => {
  const state = await mockDtr(page);
  const section = page.getByRole("region", {
    name: "Attendance and DTR",
    exact: true,
  });
  await section.getByLabel("DTR employee").selectOption(employee.id);
  await section.getByLabel("DTR start date").fill("2026-09-10");
  await section.getByLabel("DTR end date").fill("2026-09-09");
  await section.getByRole("button", { name: "Load DTR", exact: true }).click();
  await expect(section.getByRole("alert")).toContainText("ordered date range");
  expect(state.requests).not.toContain("timekeeping.getDTR");
  await loadDtr(page);
  const editor = await editDtr(page);
  await editor
    .getByLabel("Correction reason")
    .fill("Verified attendance values from signed sheet");
  await editor.getByLabel("Overtime minutes").fill("600");
  await editor
    .getByRole("button", { name: "Save attendance", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText(
    "cannot exceed total worked minutes",
  );
  await editor.getByLabel("Overtime minutes").fill("0");
  await editor.getByRole("checkbox", { name: "Absent", exact: true }).check();
  await editor
    .getByRole("button", { name: "Save attendance", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText(
    "An absent day cannot also contain punches",
  );
  expect(state.saves).toHaveLength(0);
});

test("new empty-range records never presume a full shift or approval", async ({
  page,
}) => {
  const state = await mockDtr(page, { empty: true });
  const section = await loadDtr(page);
  await expect(
    section.getByText(
      "No DTR records for the selected range. Missing dates still require reconciliation.",
    ),
  ).toBeVisible();
  await section
    .getByRole("button", { name: "Add attendance record", exact: true })
    .click();
  const editor = page.getByRole("region", {
    name: "Attendance correction",
    exact: true,
  });
  await expect(
    editor.getByLabel("Total worked minutes (including overtime)"),
  ).toHaveValue("");
  await expect(
    editor.getByRole("checkbox", { name: "Approve for payroll", exact: true }),
  ).not.toBeChecked();
  await editor.getByLabel("Attendance date").fill("2026-09-11");
  await editor
    .getByLabel("Day type", { exact: true })
    .selectOption("REGULAR_WORKDAY");
  await editor
    .getByLabel("Total worked minutes (including overtime)")
    .fill("0");
  await editor
    .getByLabel("Correction reason")
    .fill("Confirmed absence against approved attendance register");
  await editor.getByRole("checkbox", { name: "Absent", exact: true }).check();
  await editor
    .getByRole("button", { name: "Save attendance", exact: true })
    .click();
  await expect(
    section
      .getByRole("status")
      .filter({ hasText: "saved with a correction audit" }),
  ).toBeVisible();
  expect(state.saves[0]).toMatchObject({
    expectedUpdatedAt: null,
    actualWorkedMinutes: 0,
    timeIn: null,
    timeOut: null,
    isAbsent: true,
    isApproved: false,
  });
});

test("stale corrections retain the draft until explicit reload and discard", async ({
  page,
}) => {
  const state = await mockDtr(page, { conflictOnce: true });
  await loadDtr(page);
  const editor = await editDtr(page);
  await editor
    .getByLabel("Total worked minutes (including overtime)")
    .fill("420");
  await editor
    .getByLabel("Correction reason")
    .fill("Verified minutes before another staff update");
  await editor
    .getByRole("button", { name: "Save attendance", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText(
    "Attendance changed since it was loaded",
  );
  await expect(
    editor.getByLabel("Total worked minutes (including overtime)"),
  ).toHaveValue("420");
  expect(state.saves).toHaveLength(1);
  await editor
    .getByRole("button", { name: "Reload DTR and discard this draft" })
    .click();
  await expect(editor).toHaveCount(0);
  const fresh = await editDtr(page);
  await expect(
    fresh.getByLabel("Total worked minutes (including overtime)"),
  ).toHaveValue("450");
  await fresh
    .getByLabel("Correction reason")
    .fill("Verified after reloading the latest attendance version");
  await fresh
    .getByRole("button", { name: "Save attendance", exact: true })
    .click();
  await expect(fresh).toHaveCount(0);
  expect(state.saves[1]).toMatchObject({
    expectedUpdatedAt: "2026-09-10T09:00:00.000Z",
    actualWorkedMinutes: 450,
  });
});

test("DTR query errors retry without showing fake empty attendance", async ({
  page,
}) => {
  await mockDtr(page, { readFailures: 1 });
  const section = await loadDtr(page);
  await expect(section.getByRole("alert")).toContainText(
    "Could not load DTR records",
  );
  await expect(section.getByText(/No DTR records/)).toHaveCount(0);
  await section.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    section.getByRole("region", { name: "Attendance 2026-09-10", exact: true }),
  ).toBeVisible();
});

test("background refresh errors and save errors preserve an attendance draft", async ({
  page,
}) => {
  const state = await mockDtr(page, { refreshFailure: true, saveFailures: 1 });
  const section = await loadDtr(page);
  const editor = await editDtr(page);
  await editor
    .getByLabel("Correction reason")
    .fill("Verified draft that must survive a background error");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    section.getByRole("alert").filter({ hasText: "DTR refresh failed" }),
  ).toBeVisible();
  await expect(editor.getByLabel("Correction reason")).toHaveValue(
    "Verified draft that must survive a background error",
  );
  await editor
    .getByRole("button", { name: "Save attendance", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText(
    "Your entries have been kept",
  );
  expect(state.saves).toHaveLength(1);
  await editor
    .getByRole("button", { name: "Save attendance", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(state.saves).toHaveLength(2);
});

test("double-holiday rows are read-only and attendance fits a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockDtr(page, { premium: true });
  const section = await loadDtr(page);
  const row = section.getByRole("region", {
    name: "Attendance 2026-09-10",
    exact: true,
  });
  await expect(row).toContainText(
    "Double holidays and legacy premium breakdowns require manual reconciliation",
  );
  await expect(
    row.getByRole("button", { name: "Correct attendance", exact: true }),
  ).toHaveCount(0);
  await section
    .getByRole("button", { name: "Add attendance record", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

for (const role of ["EMPLOYEE", "DEPARTMENT_MANAGER"]) {
  test(`${role} does not mount staff attendance management`, async ({
    page,
  }) => {
    const state = await mockDtr(page, { role });
    await expect(
      page.getByRole("region", { name: "Attendance and DTR", exact: true }),
    ).toHaveCount(0);
    expect(state.requests).not.toContain("timekeeping.getDTR");
  });
}
