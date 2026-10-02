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
  debitedBalanceId: null as string | null,
  debitedDays: null as string | null,
  refundedDays: null as string | null,
  cancelledById: null as string | null,
  cancellationReason: null as string | null,
  cancelledFromStatus: null as string | null,
  cancelledAt: null as string | null,
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
    blockCredits?: Promise<void>;
    initialUsed?: number;
    creditConflict?: boolean;
    commitThenError?: boolean;
    historyFailures?: number;
    approved?: boolean;
    legacyDebit?: boolean;
    cancellationConflict?: boolean;
    cancellationCommitThenError?: boolean;
    blockCancellation?: Promise<void>;
  } = {},
) {
  let signedIn = false;
  let rows = options.empty
    ? []
    : [
        {
          ...original,
          status: options.approved ? "APPROVED" : "PENDING",
          approvedById: options.approved ? "original-approver" : null,
          debitedDays: options.approved && !options.legacyDebit ? "0.5" : null,
          debitedBalanceId:
            options.approved && !options.legacyDebit ? "balance-1" : null,
        },
      ];
  let cancellationConflict = options.cancellationConflict ?? false;
  let cancellationCommitThenError =
    options.cancellationCommitThenError ?? false;
  let totalValue = "5";
  let usedValue = String(options.initialUsed ?? (options.approved ? 0.5 : 0));
  let balanceValue = String(Number(totalValue) - Number(usedValue));
  let revision = 0;
  let hasBalance = !options.empty;
  let leaveTypeValue = "SIL";
  let creditConflict = options.creditConflict ?? false;
  let commitThenError = options.commitThenError ?? false;
  let historyFailures = options.historyFailures ?? 0;
  const changes: Record<string, unknown>[] = [];
  const operations = new Map<string, Record<string, unknown>>();
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
    if (paths.includes("leaves.setCredits") && options.blockCredits)
      await options.blockCredits;
    if (
      paths.some((path) =>
        ["leaves.withdraw", "leaves.cancelApproved"].includes(path),
      ) &&
      options.blockCancellation
    )
      await options.blockCancellation;
    function creditBalance() {
      return {
        id: "balance-1",
        employeeId: employee.id,
        leaveType: leaveTypeValue,
        year: 2026,
        totalCredits: totalValue,
        usedCredits: usedValue,
        balance: balanceValue,
        revision,
      };
    }
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
          const balances = hasBalance ? [creditBalance()] : [];
          return { result: { data: { json: balances } } };
        }
        if (path === "leaves.listCreditChanges") {
          if (historyFailures-- > 0)
            return apiError("INTERNAL_SERVER_ERROR", "History failed");
          return { result: { data: { json: changes } } };
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
      if (["leaves.withdraw", "leaves.cancelApproved"].includes(path)) {
        const payload = request.postDataJSON()[String(index)].json;
        saves.push({ path, payload });
        const old =
          rows.find((row) => row.id === payload.requestId) ?? original;
        if (old.status === "CANCELLED")
          return { result: { data: { json: old } } };
        if (cancellationConflict) {
          cancellationConflict = false;
          usedValue = "0.5";
          balanceValue = String(Number(totalValue) - 0.5);
          revision++;
          rows = rows.map((row) =>
            row.id === old.id
              ? {
                  ...row,
                  status: "APPROVED",
                  approvedById: "other-approver",
                  debitedDays: "0.5",
                  debitedBalanceId: "balance-1",
                }
              : row,
          );
          return apiError(
            "CONFLICT",
            "Leave status changed. Reload requests before cancelling; pending withdrawal cannot reverse an approval.",
          );
        }
        if (path === "leaves.withdraw" && old.status !== "PENDING")
          return apiError(
            "CONFLICT",
            "Pending withdrawal cannot reverse an approval",
          );
        if (path === "leaves.cancelApproved" && old.isPaid && !old.debitedDays)
          return apiError(
            "UNPROCESSABLE_CONTENT",
            "This approval has no matching recorded debit provenance. Reconcile legacy usage manually; cancellation cannot guess a credit refund.",
          );
        const refundedDays =
          path === "leaves.cancelApproved" && old.isPaid
            ? old.debitedDays
            : null;
        if (refundedDays) {
          usedValue = String(Number(usedValue) - Number(refundedDays));
          balanceValue = String(Number(balanceValue) + Number(refundedDays));
          revision++;
        }
        const saved = {
          ...old,
          status: "CANCELLED",
          cancelledFromStatus: old.status,
          cancelledById: user.id,
          cancellationReason: String(payload.reason),
          cancelledAt: "2026-09-10T08:00:00.000Z",
          refundedDays,
        };
        rows = rows.map((row) => (row.id === old.id ? saved : row));
        if (cancellationCommitThenError) {
          cancellationCommitThenError = false;
          return apiError(
            "INTERNAL_SERVER_ERROR",
            "Successful cancellation response was lost",
          );
        }
        return { result: { data: { json: saved } } };
      }
      if (path === "leaves.setCredits") {
        const payload = request.postDataJSON()[String(index)].json;
        saves.push({ path, payload });
        const replay = operations.get(payload.operationId);
        if (replay)
          return {
            result: {
              data: {
                json: { ...replay, replayed: true, balance: creditBalance() },
              },
            },
          };
        if (saveFailure) {
          saveFailure = false;
          return apiError("INTERNAL_SERVER_ERROR", "Private credit failure");
        }
        if (creditConflict) {
          creditConflict = false;
          usedValue = "1";
          balanceValue = String(Number(totalValue) - 1);
          revision++;
          return apiError(
            "CONFLICT",
            "Leave credits changed. Reload balances before starting another adjustment.",
          );
        }
        const change = {
          id: payload.operationId,
          kind: hasBalance ? "ADJUSTMENT" : "ALLOCATION",
          previousTotalCredits: hasBalance ? totalValue : null,
          totalCredits: String(payload.totalCredits),
          usedCredits: usedValue,
          availableBalance: String(
            Number(payload.totalCredits) - Number(usedValue),
          ),
          sourceReference: payload.sourceReference,
          reason: payload.reason,
          actorId: user.id,
          balance: { leaveType: payload.leaveType, year: payload.year },
          createdAt: "2026-09-10T08:00:00.000Z",
          revision: revision + 1,
        };
        totalValue = String(payload.totalCredits);
        balanceValue = change.availableBalance;
        leaveTypeValue = String(payload.leaveType);
        revision++;
        hasBalance = true;
        changes.push(change);
        const result = { balance: creditBalance(), change, replayed: false };
        operations.set(payload.operationId, result);
        if (commitThenError) {
          commitThenError = false;
          return apiError(
            "INTERNAL_SERVER_ERROR",
            "Successful commit response was lost",
          );
        }
        return { result: { data: { json: result } } };
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
            ? {
                ...old,
                status: "APPROVED",
                approvedById: user.id,
                debitedDays: old.daysCount,
                debitedBalanceId: "balance-1",
              }
            : {
                ...old,
                status: "REJECTED",
                rejectionReason: String(payload.rejectionReason),
                rejectedById: user.id,
              };
        if (path === "leaves.approve") {
          balanceValue = String(Number(balanceValue) - Number(old.daysCount));
          usedValue = String(Number(usedValue) + Number(old.daysCount));
          revision++;
        }
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

async function creditEditor(page: Page, allocate = false) {
  const section = page.getByRole("region", {
    name: "Leave management",
    exact: true,
  });
  if (allocate)
    await section
      .getByRole("button", { name: "Allocate leave credits", exact: true })
      .click();
  else {
    await section
      .getByLabel("Recorded balance to adjust")
      .selectOption("balance-1");
    await section
      .getByRole("button", { name: "Adjust recorded credits", exact: true })
      .click();
  }
  const editor = page.getByRole("region", {
    name: "Leave credit editor",
    exact: true,
  });
  if (allocate) await editor.getByLabel("Credit leave type").fill("VACATION");
  await editor.getByLabel("Credit source reference").fill("POLICY-2026-REVIEW");
  await editor
    .getByLabel("Credit adjustment reason")
    .fill("Private eligibility review draft");
  return editor;
}
test("HR records explicit allocation with provenance and no default amount", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, { empty: true });
  const section = await load(page);
  const editor = await creditEditor(page, true);
  await expect(editor.getByLabel("Total credited days")).toHaveValue("");
  await editor.getByLabel("Total credited days").fill("5.5");
  await editor
    .getByRole("button", { name: "Record leave credits", exact: true })
    .click();
  await expect(
    section.getByText("Leave credits recorded. Used credits were not reset."),
  ).toBeVisible();
  await expect(
    section.getByText("5.5 available · 0 used · 5.5 credited day(s)"),
  ).toBeVisible();
  expect(saves[0]?.payload).toMatchObject({
    employeeId: employee.id,
    year: 2026,
    leaveType: "VACATION",
    totalCredits: 5.5,
    expectedRevision: null,
    sourceReference: "POLICY-2026-REVIEW",
    reason: "Private eligibility review draft",
  });
  expect(String(saves[0]?.payload.operationId)).toMatch(/^[0-9a-f-]{36}$/);
  await section
    .getByRole("button", { name: "Credit change history", exact: true })
    .click();
  await expect(
    section.getByText("VACATION · ALLOCATION", { exact: true }),
  ).toBeVisible();
  await expect(
    section.getByText("Source reference: POLICY-2026-REVIEW"),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toContain("Private eligibility review draft");
});
test("adjustment keeps recorded usage and submits the loaded revision", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, { initialUsed: 2.5 });
  const section = await load(page);
  const editor = await creditEditor(page);
  await expect(editor.getByLabel("Credit leave type")).toHaveAttribute(
    "readonly",
    "",
  );
  await editor.getByLabel("Total credited days").fill("4.5");
  await expect(editor.getByText(/Available after save: 2 day/)).toBeVisible();
  await editor
    .getByRole("button", { name: "Record leave credits", exact: true })
    .click();
  await expect(
    section.getByText("2 available · 2.5 used · 4.5 credited day(s)"),
  ).toBeVisible();
  expect(saves[0]?.payload).toMatchObject({
    expectedRevision: 0,
    totalCredits: 4.5,
    leaveType: "SIL",
  });
  expect(saves[0]?.payload).not.toHaveProperty("usedCredits");
});
test("credit totals below usage or finer than half-days do not submit", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, { initialUsed: 2.5 });
  await load(page);
  const editor = await creditEditor(page);
  for (const value of ["1", "3.25"]) {
    await editor.getByLabel("Total credited days").fill(value);
    await editor
      .getByRole("button", { name: "Record leave credits", exact: true })
      .click();
    expect(saves).toHaveLength(0);
  }
});
test("credit changes are hidden for payroll specialists and linked HR self-records", async ({
  page,
}) => {
  await mockLeaves(page, { role: "PAYROLL_SPECIALIST" });
  let section = await load(page);
  await expect(
    section.getByRole("button", {
      name: "Allocate leave credits",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    section.getByRole("button", {
      name: "Adjust recorded credits",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.unroute("**/trpc/**");
  await mockLeaves(page, { self: true });
  section = await load(page);
  await expect(
    section.getByRole("button", {
      name: "Allocate leave credits",
      exact: true,
    }),
  ).toHaveCount(0);
});
test("lost successful credit responses retry the same operation without a duplicate", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, { commitThenError: true });
  const section = await load(page);
  const editor = await creditEditor(page);
  await editor.getByLabel("Total credited days").fill("6");
  await editor
    .getByRole("button", { name: "Record leave credits", exact: true })
    .click();
  await expect(editor.getByText(/outcome is uncertain/)).toBeVisible();
  await expect(editor.getByLabel("Credit adjustment reason")).toHaveValue(
    "Private eligibility review draft",
  );
  await editor
    .getByRole("button", { name: "Record leave credits", exact: true })
    .click();
  await expect(
    section.getByText(
      "Previously recorded credit change confirmed; no duplicate adjustment was created.",
    ),
  ).toBeVisible();
  expect(saves).toHaveLength(2);
  expect(saves[0]?.payload.operationId).toBe(saves[1]?.payload.operationId);
  await section
    .getByRole("button", { name: "Credit change history", exact: true })
    .click();
  await expect(
    section.getByText("SIL · ADJUSTMENT", { exact: true }),
  ).toHaveCount(1);
});
test("credit conflicts require explicit discard and reload before a new adjustment", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, { creditConflict: true });
  const section = await load(page);
  let editor = await creditEditor(page);
  await editor.getByLabel("Total credited days").fill("6");
  await editor
    .getByRole("button", { name: "Record leave credits", exact: true })
    .click();
  await expect(
    editor.getByText(
      "Leave credits changed. Reload balances before starting another adjustment.",
    ),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Record leave credits", exact: true }),
  ).toBeDisabled();
  await expect(section.getByLabel("Leave year")).toBeDisabled();
  await editor
    .getByRole("button", {
      name: "Discard draft and reload balances",
      exact: true,
    })
    .click();
  await expect(
    section.getByText("4 available · 1 used · 5 credited day(s)"),
  ).toBeVisible();
  editor = await creditEditor(page);
  await editor.getByLabel("Total credited days").fill("6");
  await editor
    .getByRole("button", { name: "Record leave credits", exact: true })
    .click();
  await expect(section.getByText(/Leave credits recorded/)).toBeVisible();
  expect(saves[1]?.payload.expectedRevision).toBe(1);
  expect(saves[1]?.payload.operationId).not.toBe(saves[0]?.payload.operationId);
});
test("background balance failures leave the credit snapshot and draft intact", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, { refreshFailure: true });
  const section = await load(page);
  const editor = await creditEditor(page);
  await editor.getByLabel("Total credited days").fill("6");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(section.getByText(/Balance refresh failed/)).toBeVisible();
  await expect(editor.getByLabel("Credit source reference")).toHaveValue(
    "POLICY-2026-REVIEW",
  );
  await expect(editor.getByLabel("Total credited days")).toHaveValue("6");
  await editor
    .getByRole("button", { name: "Record leave credits", exact: true })
    .click();
  await expect(section.getByText(/Leave credits recorded/)).toBeVisible();
  expect(saves[0]?.payload.expectedRevision).toBe(0);
});
test("saving credits disables cancellation and prevents switching to leave decisions", async ({
  page,
}) => {
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockLeaves(page, { blockCredits: blocked });
  const section = await load(page);
  const editor = await creditEditor(page);
  await editor.getByLabel("Total credited days").fill("6");
  await editor
    .getByRole("button", { name: "Record leave credits", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Cancel credit editor", exact: true }),
  ).toBeDisabled();
  await expect(
    section.getByRole("button", { name: "Review approval", exact: true }),
  ).toBeDisabled();
  await expect(editor.getByLabel("Credit source reference")).toBeDisabled();
  release();
  await expect(section.getByText(/Leave credits recorded/)).toBeVisible();
});
test("mobile credit history has retry and fits without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockLeaves(page, { historyFailures: 1 });
  const section = await load(page);
  await section
    .getByRole("button", { name: "Credit change history", exact: true })
    .click();
  await section
    .getByRole("button", { name: "Retry credit history", exact: true })
    .click();
  await expect(
    section.getByText("No credit changes are recorded in this history."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

async function cancellationForm(page: Page, approved = false) {
  const section = page.getByRole("region", {
    name: "Leave management",
    exact: true,
  });
  await section
    .getByRole("button", {
      name: approved ? "Reverse approved leave" : "Withdraw request",
      exact: true,
    })
    .click();
  const form = page.getByRole("region", {
    name: "Leave cancellation",
    exact: true,
  });
  await form
    .getByLabel("Cancellation reason", { exact: true })
    .fill("Private leave cancellation draft");
  return form;
}
test("payroll specialist withdraws pending leave without changing credits", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, { role: "PAYROLL_SPECIALIST" });
  const section = await load(page);
  const form = await cancellationForm(page);
  await form
    .getByRole("button", { name: "Confirm withdrawal", exact: true })
    .click();
  await expect(
    section.getByText(/Leave request recorded as CANCELLED/),
  ).toBeVisible();
  await expect(
    section.getByText("5 available · 0 used · 5 credited day(s)"),
  ).toBeVisible();
  await expect(
    section.getByText("Cancellation reason: Private leave cancellation draft"),
  ).toBeVisible();
  expect(saves).toEqual([
    {
      path: "leaves.withdraw",
      payload: {
        requestId: original.id,
        reason: "Private leave cancellation draft",
      },
    },
  ]);
  await expect(section.getByText(/Recorded credit restoration:/)).toHaveCount(
    0,
  );
});
test("HR reverses approved half-day leave with recorded restoration and retained approval", async ({
  page,
}) => {
  const { saves, reads } = await mockLeaves(page, { approved: true });
  const section = await load(page);
  const form = await cancellationForm(page, true);
  await expect(form.getByText(/original recorded debit, once/)).toBeVisible();
  await form
    .getByRole("button", { name: "Confirm approved reversal", exact: true })
    .click();
  await expect(
    section.getByText(/Leave request recorded as CANCELLED/),
  ).toBeVisible();
  await expect(
    section.getByText("5 available · 0 used · 5 credited day(s)"),
  ).toBeVisible();
  await expect(
    section.getByText("Recorded credit restoration: 0.5 day(s)"),
  ).toBeVisible();
  await expect(
    section.getByText("Approved by user: original-approver"),
  ).toBeVisible();
  expect(saves[0]?.path).toBe("leaves.cancelApproved");
  await section.getByLabel("Request status").selectOption("CANCELLED");
  await expect(
    section.getByRole("heading", { name: "SIL · CANCELLED", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => reads.some((read) => read.status === "CANCELLED"))
    .toBeTruthy();
});
test("approved reversal is hidden for specialists and linked-self administrators", async ({
  page,
}) => {
  await mockLeaves(page, { approved: true, role: "PAYROLL_SPECIALIST" });
  let section = await load(page);
  await expect(
    section.getByRole("heading", { name: "SIL · APPROVED", exact: true }),
  ).toBeVisible();
  await expect(
    section.getByRole("button", {
      name: "Reverse approved leave",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.unroute("**/trpc/**");
  await mockLeaves(page, { approved: true, self: true });
  section = await load(page);
  await expect(
    section.getByRole("heading", { name: "SIL · APPROVED", exact: true }),
  ).toBeVisible();
  await expect(
    section.getByRole("button", {
      name: "Reverse approved leave",
      exact: true,
    }),
  ).toHaveCount(0);
});
test("legacy paid approvals fail closed without discarding the cancellation reason", async ({
  page,
}) => {
  await mockLeaves(page, { approved: true, legacyDebit: true });
  const section = await load(page);
  const form = await cancellationForm(page, true);
  await form
    .getByRole("button", { name: "Confirm approved reversal", exact: true })
    .click();
  await expect(
    form.getByText(/approval has no matching recorded debit provenance/),
  ).toBeVisible();
  await expect(
    form.getByLabel("Cancellation reason", { exact: true }),
  ).toHaveValue("Private leave cancellation draft");
  await expect(
    section.getByText("4.5 available · 0.5 used · 5 credited day(s)"),
  ).toBeVisible();
});
test("stale specialist withdrawal cannot escalate to reversing a new approval", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, {
    role: "PAYROLL_SPECIALIST",
    cancellationConflict: true,
  });
  const section = await load(page);
  const form = await cancellationForm(page);
  await form
    .getByRole("button", { name: "Confirm withdrawal", exact: true })
    .click();
  await expect(
    form.getByText(/pending withdrawal cannot reverse an approval/),
  ).toBeVisible();
  await expect(
    form.getByLabel("Cancellation reason", { exact: true }),
  ).toHaveValue("Private leave cancellation draft");
  await form
    .getByRole("button", { name: "Close and reload requests", exact: true })
    .click();
  await expect(
    section.getByRole("heading", { name: "SIL · APPROVED", exact: true }),
  ).toBeVisible();
  await expect(
    section.getByRole("button", {
      name: "Reverse approved leave",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(saves.every((save) => save.path === "leaves.withdraw")).toBeTruthy();
});
test("lost cancellation responses retry without restoring credits a second time", async ({
  page,
}) => {
  const { saves } = await mockLeaves(page, {
    approved: true,
    cancellationCommitThenError: true,
  });
  const section = await load(page);
  const form = await cancellationForm(page, true);
  await form
    .getByRole("button", { name: "Confirm approved reversal", exact: true })
    .click();
  await expect(form.getByText(/outcome is uncertain/)).toBeVisible();
  await form
    .getByRole("button", { name: "Confirm approved reversal", exact: true })
    .click();
  await expect(
    section.getByText(/Leave request recorded as CANCELLED/),
  ).toBeVisible();
  await expect(
    section.getByText("5 available · 0 used · 5 credited day(s)"),
  ).toBeVisible();
  expect(saves).toHaveLength(2);
});
test("background request failures keep the cancellation draft and do not persist it", async ({
  page,
}) => {
  await mockLeaves(page, { approved: true, refreshFailure: true });
  const section = await load(page);
  const form = await cancellationForm(page, true);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(section.getByText(/Request refresh failed/)).toBeVisible();
  await expect(
    form.getByLabel("Cancellation reason", { exact: true }),
  ).toHaveValue("Private leave cancellation draft");
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toContain("Private leave cancellation draft");
});
test("cancellation in flight blocks closing, credit edits and changing filters", async ({
  page,
}) => {
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockLeaves(page, { approved: true, blockCancellation: blocked });
  const section = await load(page);
  const form = await cancellationForm(page, true);
  await expect(
    section.getByLabel("Leave employee", { exact: true }),
  ).toBeDisabled();
  await expect(section.getByLabel("Leave year")).toBeDisabled();
  await form
    .getByRole("button", { name: "Confirm approved reversal", exact: true })
    .click();
  await expect(
    form.getByRole("button", { name: "Close cancellation", exact: true }),
  ).toBeDisabled();
  await expect(
    section.getByLabel("Leave employee", { exact: true }),
  ).toBeDisabled();
  await expect(
    section.getByRole("button", {
      name: "Allocate leave credits",
      exact: true,
    }),
  ).toBeDisabled();
  release();
  await expect(
    section.getByText(/Leave request recorded as CANCELLED/),
  ).toBeVisible();
});
test("mobile cancellation and long stored reasons fit without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockLeaves(page, { approved: true });
  const section = await load(page);
  const form = await cancellationForm(page, true);
  await form
    .getByLabel("Cancellation reason", { exact: true })
    .fill("x".repeat(400));
  await form
    .getByRole("button", { name: "Confirm approved reversal", exact: true })
    .click();
  await expect(
    section.getByRole("heading", { name: "SIL · CANCELLED", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
