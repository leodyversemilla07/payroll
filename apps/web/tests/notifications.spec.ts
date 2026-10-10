import { expect, type Page, test } from "@playwright/test";

type NotificationRow = {
  id: string;
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

const sampleNotifications: NotificationRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "org-1",
    userId: "user-1",
    type: "LEAVE_APPROVED",
    title: "Leave request approved",
    body: "Your 3 day(s) of VACATION leave was approved.",
    entityType: "LeaveRequest",
    entityId: "req-1",
    isRead: false,
    readAt: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    organizationId: "org-1",
    userId: "user-1",
    type: "RUN_TRIGGERED",
    title: "Payroll run ready for review",
    body: "Cutoff 2026-09-16 – 2026-09-30 was calculated.",
    entityType: "PayrollRun",
    entityId: "run-1",
    isRead: false,
    readAt: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    organizationId: "org-1",
    userId: "user-1",
    type: "RUN_DISBURSED",
    title: "Payslips ready",
    body: "Your payslip is available.",
    entityType: "PayrollRun",
    entityId: "run-0",
    isRead: true,
    readAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
];

function apiError(code: string, message: string) {
  return {
    error: { json: { message, code: -32000, data: { code, httpStatus: 400 } } },
  };
}

async function mockNotificationsPortal(
  page: Page,
  options: {
    role?: string;
    initialNotifications?: NotificationRow[];
  } = {},
) {
  let signedIn = false;
  let notifications = options.initialNotifications ?? [...sampleNotifications];
  const mutations: Array<{ path: string; payload: unknown }> = [];

  const user = {
    id: "user-1",
    organizationId: "org-1",
    name: "Notify Tester",
    email: "staff@test.invalid",
    role: options.role ?? "HR_ADMIN",
  };

  await page.route("**/trpc/**", async (route) => {
    const request = route.request();
    const paths = (
      new URL(request.url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");

    const results = paths.map((path, index) => {
      if (path === "auth.login") {
        signedIn = true;
        return { result: { data: { json: { user } } } };
      }
      if (path === "auth.logout") {
        signedIn = false;
        return { result: { data: { json: { success: true } } } };
      }
      if (!signedIn) return apiError("UNAUTHORIZED", "Unauthorized");

      if (path === "notifications.list") {
        return { result: { data: { json: notifications } } };
      }

      if (path === "notifications.unreadCount") {
        return {
          result: {
            data: { json: notifications.filter((n) => !n.isRead).length },
          },
        };
      }

      if (path === "notifications.markRead") {
        const payload = request.postDataJSON()[String(index)].json;
        mutations.push({ path, payload });
        notifications = notifications.map((n) =>
          n.id === payload.id
            ? { ...n, isRead: true, readAt: new Date().toISOString() }
            : n,
        );
        return {
          result: {
            data: { json: notifications.find((n) => n.id === payload.id) },
          },
        };
      }

      if (path === "notifications.markAllRead") {
        mutations.push({ path, payload: {} });
        notifications = notifications.map((n) =>
          n.isRead
            ? n
            : { ...n, isRead: true, readAt: new Date().toISOString() },
        );
        return { result: { data: { json: notifications.length } } };
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
  await page.goto("/notifications");

  return { mutations };
}

test("HR_ADMIN views notifications, opens one, and marks all read", async ({
  page,
}) => {
  const state = await mockNotificationsPortal(page);

  const section = page.getByRole("region", {
    name: "Notifications",
    exact: true,
  });
  await expect(section).toBeVisible();
  await expect(section.getByText("Leave request approved")).toBeVisible();
  await expect(section.getByText("Payroll run ready for review")).toBeVisible();

  // Opening an unread notification marks it read and follows the entity link
  await section
    .getByRole("button", { name: /Leave request approved \(unread\)/ })
    .click();
  await expect(page).toHaveURL(/\/leaves$/);
  expect(state.mutations).toContainEqual({
    path: "notifications.markRead",
    payload: { id: "11111111-1111-4111-8111-111111111111" },
  });

  // Back on the center, marking all read clears the remaining unread dot
  await page.goto("/notifications");
  await page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await expect(section.getByRole("button", { name: /\(unread\)/ })).toHaveCount(
    0,
  );
  expect(state.mutations).toContainEqual({
    path: "notifications.markAllRead",
    payload: {},
  });
});

test("empty inbox renders the empty state", async ({ page }) => {
  await mockNotificationsPortal(page, { initialNotifications: [] });

  const section = page.getByRole("region", {
    name: "Notifications",
    exact: true,
  });
  await expect(section.getByText("No notifications")).toBeVisible();
});

test("EMPLOYEE sees the center and the dropdown badge", async ({ page }) => {
  await mockNotificationsPortal(page, { role: "EMPLOYEE" });

  const section = page.getByRole("region", {
    name: "Notifications",
    exact: true,
  });
  await expect(section).toBeVisible();

  await page
    .getByRole("button", { name: "Account: Notify Tester", exact: true })
    .click();
  const item = page.getByRole("menuitem", { name: /Notifications/ });
  await expect(item).toBeVisible();
  await expect(item.getByLabel("2 unread notifications")).toBeVisible();
});
