import { expect, type Page, test } from "@playwright/test";
import { leaveSchedule } from "../lib/leave-schedule";

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
  leaveType: "SIL",
  startDate: "2026-09-10T00:00:00.000Z",
  endDate: "2026-09-10T00:00:00.000Z",
  daysCount: "0.5",
  partialDate: "2026-09-10T00:00:00.000Z",
  isPaid: true,
  reason: "Half-day family errand",
  status: "PENDING",
  approvedById: null as string | null,
  rejectedById: null as string | null,
  rejectionReason: null as string | null,
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};
function apiError(code: string, message: string) {
  return {
    error: { json: { message, code: -32000, data: { code, httpStatus: 400 } } },
  };
}
async function mockLeaves(
  page: Page,
  options: {
    role?: string;
    self?: boolean;
    empty?: boolean;
    balanceFailures?: number;
    requestFailures?: number;
    saveFailure?: boolean;
    conflict?: boolean;
    refreshFailure?: boolean;
    blockDecision?: Promise<void>;
  } = {},
) {
  let signedIn = false;
  let rows = options.empty ? [] : [{ ...original }];
  let balanceValue = "5";
  let balanceFailures = options.balanceFailures ?? 0;
  let requestFailures = options.requestFailures ?? 0;
  let saveFailure = options.saveFailure ?? false;
  let conflict = options.conflict ?? false;
  let balanceReads = 0;
  let requestReads = 0;
  const calls: string[] = [];
  const saves: { path: string; payload: Record<string, unknown> }[] = [];
  const reads: Record<string, unknown>[] = [];
  const user = {
    id: "user-1",
    organizationId: "org-1",
    name: "Test staff",
    email: "staff@test.invalid",
    role: options.role ?? "HR_ADMIN",
    ...(options.self ? { employeeId: employee.id } : {}),
  };
  await page.route("**/trpc/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const paths = (url.pathname.split("/trpc/")[1] ?? "").split(",");
    if (
      paths.some((path) =>
        ["leaves.approve", "leaves.reject"].includes(path),
      ) &&
      options.blockDecision
    )
      await options.blockDecision;
    const results = paths.map((path, index) => {
      calls.push(path);
      if (path === "auth.login") {
        signedIn = true;
        return { result: { data: { json: { user } } } };
      }
      if (path === "auth.logout") {
        signedIn = false;
        return { result: { data: { json: { success: true } } } };
      }
      if (!signedIn) return apiError("UNAUTHORIZED", "Unauthorized");
      if (path.startsWith("leaves.") && request.method() === "GET") {
        const payload = JSON.parse(url.searchParams.get("input") ?? "{}")[
          String(index)
        ].json;
        reads.push(payload);
        if (path === "leaves.getBalances") {
          balanceReads++;
          if (
            balanceFailures-- > 0 ||
            (options.refreshFailure && balanceReads > 1)
          )
            return apiError("INTERNAL_SERVER_ERROR", "Read failed");
          const balances = options.empty
            ? []
            : [
                {
                  id: "balance-1",
                  employeeId: employee.id,
                  leaveType: "SIL",
                  year: 2026,
                  totalCredits: "5",
                  usedCredits: String(5 - Number(balanceValue)),
                  balance: balanceValue,
                },
              ];
          return { result: { data: { json: balances } } };
        }
        requestReads++;
        if (
          requestFailures-- > 0 ||
          (options.refreshFailure && requestReads > 1)
        )
          return apiError("INTERNAL_SERVER_ERROR", "Read failed");
        return {
          result: {
            data: {
              json: payload.status
                ? rows.filter((row) => row.status === payload.status)
                : rows,
            },
          },
        };
      }
      if (
        ["leaves.request", "leaves.approve", "leaves.reject"].includes(path)
      ) {
        const payload = request.postDataJSON()[String(index)].json;
        saves.push({ path, payload });
        if (saveFailure) {
          saveFailure = false;
          return apiError("INTERNAL_SERVER_ERROR", "Private connection detail");
        }
        if (conflict) {
          conflict = false;
          return apiError(
            "CONFLICT",
            "Paid leave requires an existing balance with enough available days",
          );
        }
        if (path === "leaves.request") {
          const saved = {
            ...original,
            ...payload,
            id: "33333333-3333-4333-8333-333333333333",
            startDate: `${payload.startDate}T00:00:00.000Z`,
            endDate: `${payload.endDate}T00:00:00.000Z`,
            partialDate: payload.partialDate
              ? `${payload.partialDate}T00:00:00.000Z`
              : null,
            daysCount: String(payload.daysCount),
            status: "PENDING",
          };
          rows = [...rows, saved];
          return { result: { data: { json: saved } } };
        }
        const old =
          rows.find((row) => row.id === payload.requestId) ?? original;
        const saved =
          path === "leaves.approve"
            ? { ...old, status: "APPROVED", approvedById: user.id }
            : {
                ...old,
                status: "REJECTED",
                rejectionReason: String(payload.rejectionReason),
                rejectedById: user.id,
              };
        if (path === "leaves.approve")
          balanceValue = String(Number(balanceValue) - Number(old.daysCount));
        rows = rows.map((row) => (row.id === saved.id ? saved : row));
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
  return { calls, saves, reads };
}
async function load(page: Page) {
  const section = page.getByRole("region", {
    name: "Leave management",
    exact: true,
  });
  await section
    .getByLabel("Leave employee", { exact: true })
    .selectOption(employee.id);
  await section.getByLabel("Leave year").fill("2026");
  await section
    .getByRole("button", { name: "Load leave records", exact: true })
    .click();
  return section;
}
async function newRequest(page: Page, paid = true) {
  await page
    .getByRole("button", { name: "New leave request", exact: true })
    .click();
  const form = page.getByRole("region", {
    name: "File leave request",
    exact: true,
  });
  await form.getByLabel("Pay treatment").selectOption(paid ? "PAID" : "UNPAID");
  if (paid)
    await form.getByLabel("Leave type", { exact: true }).selectOption("SIL");
  else
    await form.getByLabel("Leave type", { exact: true }).fill("SPECIAL_UNPAID");
  await form.getByLabel("Leave start date").fill("2026-09-14");
  await form.getByLabel("Leave end date").fill("2026-09-14");
  await form
    .getByLabel("Leave reason", { exact: true })
    .fill("Private family errand draft");
  return form;
}
test("leave schedule uses calendar weekdays and one named half-day, not browser timezone", () => {
  expect(leaveSchedule("2026-09-11", "2026-09-14", true, "2026-09-14")).toEqual(
    { days: 1.5, error: null },
  );
  expect(
    leaveSchedule("2026-09-12", "2026-09-13", false, "").error,
  ).toBeTruthy();
  expect(
    leaveSchedule("2026-12-31", "2027-01-01", false, "").error,
  ).toBeTruthy();
  expect(
    leaveSchedule("2026-09-11", "2026-09-14", true, "2026-09-12").error,
  ).toBeTruthy();
});
test("loads persisted balances/history and files an explicit paid half-day without storing drafts", async ({
  page,
}) => {
  const { saves, reads } = await mockLeaves(page);
  const section = await load(page);
  await expect(
    section.getByText("5 available · 0 used · 5 credited day(s)"),
  ).toBeVisible();
  const form = await newRequest(page);
  await form
    .getByRole("checkbox", {
      name: "One half-day within this request",
      exact: true,
    })
    .focus();
  await form
    .getByRole("checkbox", {
      name: "One half-day within this request",
      exact: true,
    })
    .press("Space");
  await form.getByLabel("Half-day date", { exact: true }).fill("2026-09-14");
  await expect(
    form.getByText("Requested days: 0.5", { exact: true }),
  ).toBeVisible();
  await form
    .getByRole("button", { name: "File leave request", exact: true })
    .click();
  await expect(
    section.getByText(
      "Leave request filed as pending. No credits were deducted.",
    ),
  ).toBeVisible();
  expect(saves[0]).toEqual({
    path: "leaves.request",
    payload: {
      employeeId: employee.id,
      leaveType: "SIL",
      startDate: "2026-09-14",
      endDate: "2026-09-14",
      daysCount: 0.5,
      partialDate: "2026-09-14",
      isPaid: true,
      reason: "Private family errand draft",
    },
  });
  expect(reads).toContainEqual({ employeeId: employee.id, year: 2026 });
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toContain("Private family errand draft");
});
test("empty balances do not suggest default credits and permit explicit unpaid requests", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, { empty: true });
  const section = await load(page);
  await expect(
    section.getByText(/No leave balances are recorded/),
  ).toBeVisible();
  const form = await newRequest(page, false);
  await form
    .getByRole("button", { name: "File leave request", exact: true })
    .click();
  await expect(
    section.getByText(/Leave request filed as pending/),
  ).toBeVisible();
  expect(saves[0]?.payload).toMatchObject({
    isPaid: false,
    leaveType: "SPECIAL_UNPAID",
    daysCount: 1,
  });
  expect(saves[0]?.payload).not.toHaveProperty("partialDate");
});
test("weekend-only ranges and invalid half dates are rejected before calling the API", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page);
  await load(page);
  const form = await newRequest(page);
  await form.getByLabel("Leave start date").fill("2026-09-12");
  await form.getByLabel("Leave end date").fill("2026-09-13");
  await form
    .getByRole("button", { name: "File leave request", exact: true })
    .click();
  await expect(
    form.getByText(
      "The request must include a scheduled Monday–Friday workday.",
    ),
  ).toBeVisible();
  expect(saves).toHaveLength(0);
});
test("HR approves through confirmation and refetches the persisted balance", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page);
  const section = await load(page);
  await section
    .getByRole("button", { name: "Review approval", exact: true })
    .click();
  const decision = page.getByRole("region", {
    name: "Leave decision",
    exact: true,
  });
  await expect(
    decision.getByRole("heading", { name: "Confirm leave approval" }),
  ).toBeVisible();
  await decision
    .getByRole("button", { name: "Confirm approval", exact: true })
    .click();
  await expect(
    section.getByText("Leave request recorded as APPROVED."),
  ).toBeVisible();
  await expect(
    section.getByText("4.5 available · 0.5 used · 5 credited day(s)"),
  ).toBeVisible();
  expect(saves).toEqual([
    { path: "leaves.approve", payload: { requestId: original.id } },
  ]);
});
test("rejection requires a reason and shows the persisted rejection provenance", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page);
  const section = await load(page);
  await section
    .getByRole("button", { name: "Reject request", exact: true })
    .click();
  const decision = page.getByRole("region", {
    name: "Leave decision",
    exact: true,
  });
  await decision
    .getByLabel("Rejection reason", { exact: true })
    .fill("Wrong dates; please refile the corrected request");
  await decision
    .getByRole("button", { name: "Confirm rejection", exact: true })
    .click();
  await expect(
    section.getByText("Leave request recorded as REJECTED."),
  ).toBeVisible();
  await expect(
    section.getByText(
      "Rejection reason: Wrong dates; please refile the corrected request",
    ),
  ).toBeVisible();
  expect(saves[0]).toEqual({
    path: "leaves.reject",
    payload: {
      requestId: original.id,
      rejectionReason: "Wrong dates; please refile the corrected request",
    },
  });
});
test("payroll specialist reads/files but cannot approve or reject", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, { role: "PAYROLL_SPECIALIST" });
  const section = await load(page);
  await expect(
    section.getByText(/This staff role can file and read/),
  ).toBeVisible();
  await expect(
    section.getByRole("button", { name: "Review approval", exact: true }),
  ).toHaveCount(0);
  await expect(
    section.getByRole("button", { name: "Reject request", exact: true }),
  ).toHaveCount(0);
  const form = await newRequest(page);
  await form
    .getByRole("button", { name: "File leave request", exact: true })
    .click();
  await expect(
    section.getByText(/Leave request filed as pending/),
  ).toBeVisible();
  expect(saves[0]?.path).toBe("leaves.request");
});
test("linked HR cannot review their own leave for approval", async ({
  page,
}) => {
  await mockLeaves(page, { self: true });
  const section = await load(page);
  await expect(
    section.getByText(
      "Your own employee leave request requires another approver.",
    ),
  ).toBeVisible();
  await expect(
    section.getByRole("button", { name: "Review approval", exact: true }),
  ).toHaveCount(0);
});
test("read errors have independent retry controls", async ({ page }) => {
  await mockLeaves(page, { balanceFailures: 1, requestFailures: 1 });
  const section = await load(page);
  await section
    .getByRole("button", { name: "Retry balances", exact: true })
    .click();
  await section
    .getByRole("button", { name: "Retry requests", exact: true })
    .click();
  await expect(
    section.getByText("5 available · 0 used · 5 credited day(s)"),
  ).toBeVisible();
  await expect(
    section.getByRole("heading", { name: "SIL · PENDING", exact: true }),
  ).toBeVisible();
});
test("failed filing keeps entries and allows a safe explicit retry", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, { saveFailure: true });
  const section = await load(page);
  const form = await newRequest(page);
  await form
    .getByRole("button", { name: "File leave request", exact: true })
    .click();
  await expect(form.getByText(/Your entries have been kept/)).toBeVisible();
  await expect(form.getByLabel("Leave reason", { exact: true })).toHaveValue(
    "Private family errand draft",
  );
  await form
    .getByRole("button", { name: "File leave request", exact: true })
    .click();
  await expect(
    section.getByText(/Leave request filed as pending/),
  ).toBeVisible();
  expect(saves).toHaveLength(2);
});
test("background refresh failures keep cached records and the unpaid draft intact", async ({
  page,
}) => {
  await mockLeaves(page, { refreshFailure: true });
  const section = await load(page);
  const form = await newRequest(page, false);
  await section
    .getByRole("button", { name: "Load leave records", exact: true })
    .click();
  await expect(section.getByText(/Request refresh failed/)).toBeVisible();
  await expect(form.getByLabel("Leave reason", { exact: true })).toHaveValue(
    "Private family errand draft",
  );
  await expect(form.getByLabel("Leave type", { exact: true })).toHaveValue(
    "SPECIAL_UNPAID",
  );
});
test("approval conflicts remain visible without replacing the loaded decision", async ({
  page,
}) => {
  await mockLeaves(page, { conflict: true });
  const section = await load(page);
  await section
    .getByRole("button", { name: "Review approval", exact: true })
    .click();
  const decision = page.getByRole("region", {
    name: "Leave decision",
    exact: true,
  });
  await decision
    .getByRole("button", { name: "Confirm approval", exact: true })
    .click();
  await expect(
    decision.getByText(
      "Paid leave requires an existing balance with enough available days",
    ),
  ).toBeVisible();
  await expect(
    decision.getByRole("button", {
      name: "Cancel leave decision",
      exact: true,
    }),
  ).toBeEnabled();
});
test("saving a decision disables cancellation and employee/year changes", async ({
  page,
}) => {
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockLeaves(page, { blockDecision: blocked });
  const section = await load(page);
  await section
    .getByRole("button", { name: "Review approval", exact: true })
    .click();
  const decision = page.getByRole("region", {
    name: "Leave decision",
    exact: true,
  });
  await decision
    .getByRole("button", { name: "Confirm approval", exact: true })
    .click();
  await expect(
    decision.getByRole("button", {
      name: "Cancel leave decision",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    section.getByLabel("Leave employee", { exact: true }),
  ).toBeDisabled();
  await expect(section.getByLabel("Leave year")).toBeDisabled();
  release();
  await expect(section.getByText(/recorded as APPROVED/)).toBeVisible();
});
test("mobile leave cards fit without horizontal overflow and status filters reach the API", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { reads } = await mockLeaves(page);
  const section = await load(page);
  await section.getByLabel("Request status").selectOption("PENDING");
  await expect(
    section.getByRole("heading", { name: "SIL · PENDING", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      reads.some(
        (input) =>
          input.status === "PENDING" &&
          input.year === 2026 &&
          input.employeeId === employee.id,
      ),
    )
    .toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
