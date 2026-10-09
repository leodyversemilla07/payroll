import { expect, type Page, test } from "@playwright/test";

const sampleHoliday = {
  id: "44444444-4444-4444-8444-444444444444",
  organizationId: "org-1",
  date: "2026-12-25T00:00:00.000Z",
  name: "Christmas Day",
  dayType: "REGULAR_HOLIDAY",
  isRecurring: true,
  createdById: "user-1",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function apiError(code: string, message: string) {
  return {
    error: { json: { message, code: -32000, data: { code, httpStatus: 400 } } },
  };
}

async function mockHolidaysPortal(
  page: Page,
  options: {
    role?: string;
    initialHolidays?: (typeof sampleHoliday)[];
    conflictOnCreate?: boolean;
  } = {},
) {
  let signedIn = false;
  let holidays = options.initialHolidays ?? [sampleHoliday];
  const requests: string[] = [];
  const mutations: Array<{ path: string; payload: unknown }> = [];

  const user = {
    id: "user-1",
    organizationId: "org-1",
    name: "Holiday Tester",
    email: "staff@test.invalid",
    role: options.role ?? "HR_ADMIN",
  };

  await page.route("**/trpc/**", async (route) => {
    const request = route.request();
    const paths = (
      new URL(request.url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");

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

      if (path === "holidays.list") {
        return { result: { data: { json: holidays } } };
      }

      if (path === "holidays.create") {
        const payload = request.postDataJSON()[String(index)].json;
        mutations.push({ path, payload });
        if (options.conflictOnCreate) {
          return apiError(
            "CONFLICT",
            "A holiday is already configured for this date",
          );
        }
        const created = {
          id: `new-${Date.now()}`,
          organizationId: user.organizationId,
          ...payload,
          date: `${payload.date}T00:00:00.000Z`,
          createdById: user.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        holidays = [...holidays, created];
        return { result: { data: { json: created } } };
      }

      if (path === "holidays.update") {
        const payload = request.postDataJSON()[String(index)].json;
        mutations.push({ path, payload });
        const existing = holidays.find((h) => h.id === payload.id);
        const updated = {
          ...existing,
          ...payload,
          updatedAt: new Date().toISOString(),
        };
        holidays = holidays.map((h) => (h.id === payload.id ? updated : h));
        return { result: { data: { json: updated } } };
      }

      if (path === "holidays.delete") {
        const payload = request.postDataJSON()[String(index)].json;
        mutations.push({ path, payload });
        const deleted = holidays.find((h) => h.id === payload.id);
        holidays = holidays.filter((h) => h.id !== payload.id);
        return { result: { data: { json: deleted } } };
      }

      if (path === "holidays.populatePresets") {
        const payload = request.postDataJSON()[String(index)].json;
        mutations.push({ path, payload });
        const presets = [
          sampleHoliday,
          {
            id: "preset-nyd",
            organizationId: user.organizationId,
            date: `${payload.year}-01-01T00:00:00.000Z`,
            name: "New Year's Day",
            dayType: "REGULAR_HOLIDAY",
            isRecurring: true,
            createdById: user.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "preset-labor",
            organizationId: user.organizationId,
            date: `${payload.year}-05-01T00:00:00.000Z`,
            name: "Labor Day",
            dayType: "REGULAR_HOLIDAY",
            isRecurring: true,
            createdById: user.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
        holidays = presets;
        return {
          result: {
            data: { json: { addedCount: 2, holidays: presets } },
          },
        };
      }

      const json =
        path === "auth.me"
          ? user
          : path === "employees.list" || path === "payroll.listRuns"
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
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText("Signed in as")).toBeVisible();
  await page.goto("/holidays");

  return { requests, mutations };
}

test("HR_ADMIN views holiday list, creates new holiday, and sees it in table", async ({
  page,
}) => {
  const state = await mockHolidaysPortal(page);

  const section = page.getByRole("region", {
    name: "Holiday calendar",
    exact: true,
  });
  await expect(section).toBeVisible();
  await expect(section.getByText("Christmas Day")).toBeVisible();
  await expect(
    section.getByText("REGULAR HOLIDAY", { exact: true }),
  ).toBeVisible();

  // Click Add holiday
  await page.getByRole("button", { name: "Add holiday", exact: true }).click();

  const addForm = page.getByRole("region", {
    name: "Add holiday",
    exact: true,
  });
  await expect(addForm).toBeVisible();

  await addForm.getByLabel("Holiday date").fill("2026-06-12");
  await addForm.getByLabel("Holiday name").fill("Independence Day");
  await addForm.getByLabel("Day type classification").click();
  await page.getByRole("option", { name: "Regular Holiday" }).click();
  await addForm
    .getByRole("checkbox", { name: "Repeats annually on this month and day" })
    .check();

  await addForm
    .getByRole("button", { name: "Save holiday", exact: true })
    .click();

  // Verify form closed and notification appeared
  await expect(addForm).toHaveCount(0);
  await expect(
    section
      .getByRole("status")
      .filter({ hasText: 'Holiday "Independence Day" created successfully.' }),
  ).toBeVisible();

  expect(state.mutations).toHaveLength(1);
  expect(state.mutations[0]).toMatchObject({
    path: "holidays.create",
    payload: {
      date: "2026-06-12",
      name: "Independence Day",
      dayType: "REGULAR_HOLIDAY",
      isRecurring: true,
    },
  });

  await expect(
    section.getByRole("cell", { name: "Independence Day", exact: true }),
  ).toBeVisible();
});

test("HR_ADMIN edits and deletes a holiday", async ({ page }) => {
  const state = await mockHolidaysPortal(page);

  const section = page.getByRole("region", {
    name: "Holiday calendar",
    exact: true,
  });

  // Open the row actions menu for Christmas Day and edit
  await section.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Edit holiday" }).click();

  const editForm = page.getByRole("region", {
    name: "Edit holiday",
    exact: true,
  });
  await expect(editForm).toBeVisible();

  await editForm.getByLabel("Holiday name").fill("Christmas Day (National)");
  await editForm
    .getByRole("button", { name: "Save changes", exact: true })
    .click();

  await expect(editForm).toHaveCount(0);
  await expect(
    section.getByRole("status").filter({
      hasText: 'Holiday "Christmas Day (National)" updated successfully.',
    }),
  ).toBeVisible();

  expect(state.mutations[0]).toMatchObject({
    path: "holidays.update",
    payload: {
      name: "Christmas Day (National)",
    },
  });

  await section.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Delete holiday" }).click();

  const deleteDialog = page.getByRole("alertdialog");
  await expect(deleteDialog).toBeVisible();
  await deleteDialog
    .getByRole("button", { name: "Delete holiday", exact: true })
    .click();

  await expect(
    section
      .getByRole("status")
      .filter({ hasText: 'Holiday "Christmas Day (National)" deleted.' }),
  ).toBeVisible();
  expect(
    state.mutations.find((m) => m.path === "holidays.delete"),
  ).toBeDefined();
});

test("HR_ADMIN auto-populates Philippine statutory presets", async ({
  page,
}) => {
  const state = await mockHolidaysPortal(page, { initialHolidays: [] });

  const section = page.getByRole("region", {
    name: "Holiday calendar",
    exact: true,
  });

  // Since list is empty, preset button is available
  await page
    .getByRole("button", { name: /Populate .* Presets/i })
    .first()
    .click();

  await expect(
    section
      .getByRole("status")
      .filter({ hasText: "Added 2 Philippine statutory holiday(s)" }),
  ).toBeVisible();

  expect(state.mutations[0]).toMatchObject({
    path: "holidays.populatePresets",
  });

  await expect(section.getByText("New Year's Day")).toBeVisible();
  await expect(section.getByText("Labor Day")).toBeVisible();
});

test("PAYROLL_SPECIALIST can view holidays in read-only mode without edit or add controls", async ({
  page,
}) => {
  await mockHolidaysPortal(page, { role: "PAYROLL_SPECIALIST" });

  const section = page.getByRole("region", {
    name: "Holiday calendar",
    exact: true,
  });
  await expect(section).toBeVisible();
  await expect(section.getByText("Christmas Day")).toBeVisible();

  // Add and action buttons should not be present
  await expect(page.getByRole("button", { name: "Add holiday" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: /Populate .* Presets/i }),
  ).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Open menu" })).toHaveCount(
    0,
  );
});
