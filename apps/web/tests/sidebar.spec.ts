import { expect, type Page, test } from "@playwright/test";

const destinations = [
  { label: "Dashboard", href: "/overview", region: null, query: null },
  {
    label: "Employees",
    href: "/employees",
    region: "Employees",
    query: "employees.list",
  },
  {
    label: "Attendance & DTR",
    href: "/attendance",
    region: "Attendance and DTR",
    query: "employees.list",
  },
  {
    label: "Leave management",
    href: "/leaves",
    region: "Leave management",
    query: "employees.list",
  },
  {
    label: "Holiday calendar",
    href: "/holidays",
    region: "Holiday calendar",
    query: "holidays.list",
  },
  {
    label: "Process payroll",
    href: "/process-payroll",
    region: "Process payroll run",
    query: null,
  },
  {
    label: "Payroll runs & payslips",
    href: "/payroll-runs",
    region: "Payroll runs",
    query: "payroll.listRuns",
  },
  {
    label: "Year-end tax",
    href: "/year-end-tax",
    region: "Year-end tax",
    query: "employees.list",
  },
];

async function workspace(page: Page, role = "HR_ADMIN", login = true) {
  let signedIn = false;
  const requests: string[] = [];
  const mutations: string[] = [];
  const user = {
    id: "sidebar-user",
    organizationId: "sidebar-organization",
    name: "Sidebar Tester",
    email: "sidebar@test.invalid",
    role,
  };
  await page.route("**/trpc/**", async (route) => {
    const paths = (
      new URL(route.request().url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");
    const results = paths.map((path) => {
      requests.push(path);
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
      if (route.request().method() === "POST") mutations.push(path);
      const json =
        path === "auth.me"
          ? user
          : path === "employees.list" ||
              path === "payroll.listRuns" ||
              path === "holidays.list"
            ? []
            : path === "employees.getRegistrationOptions"
              ? {
                  branches: [
                    {
                      id: "11111111-1111-4111-8111-111111111111",
                      name: "Test office",
                      code: "TEST",
                    },
                  ],
                  departments: [
                    {
                      id: "22222222-2222-4222-8222-222222222222",
                      name: "Test department",
                      code: "TEST",
                    },
                  ],
                }
              : null;
      return { result: { data: { json } } };
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(paths.length === 1 ? results[0] : results),
    });
  });
  if (login) {
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await expect(page.getByText("Signed in as")).toBeVisible();
  }
  return { requests, mutations };
}

test("sidebar routes replace page content, share the layout and preserve history/collapse", async ({
  page,
}) => {
  const exceptions: string[] = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  const { mutations, requests } = await workspace(page);
  const nav = page.getByRole("navigation", { name: "Payroll navigation" });
  await expect(nav).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(requests).not.toContain("employees.list");
  expect(requests).not.toContain("payroll.listRuns");
  for (const { label, href } of destinations) {
    await expect(
      nav.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("href", href);
  }
  await page.evaluate(() =>
    Reflect.set(
      window,
      "testWorkspaceSidebar",
      document.querySelector('[data-slot="sidebar-container"]'),
    ),
  );
  await nav.getByRole("link", { name: "Employees", exact: true }).click();
  await expect(page).toHaveURL(/\/employees$/);
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const editor = page.getByRole("region", {
    name: "Create employee",
    exact: true,
  });
  await editor.getByLabel("First name").fill("Unsaved sidebar draft");
  await page.keyboard.press("Escape");
  await nav
    .getByRole("link", { name: "Attendance & DTR", exact: true })
    .click();
  await expect(page).toHaveURL(/\/attendance$/);
  await expect(
    nav.getByRole("link", { name: "Attendance & DTR", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-slot="breadcrumb-page"]')).toHaveText(
    "Attendance & DTR",
  );
  await expect(
    page.getByRole("region", { name: "Attendance and DTR", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Employees", exact: true }),
  ).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        Reflect.get(window, "testWorkspaceSidebar") ===
        document.querySelector('[data-slot="sidebar-container"]'),
    ),
  ).toBe(true);
  await nav.getByRole("link", { name: "Employees", exact: true }).click();
  await expect(page).toHaveURL(/\/employees$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/attendance$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/employees$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/attendance$/);
  await page.mouse.move(800, 100);
  await expect(
    nav.getByRole("link", { name: "Attendance & DTR", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(mutations).toEqual([]);

  const sidebar = page.locator('[data-slot="sidebar"][data-state]');
  await page
    .getByRole("button", { name: "Toggle navigation", exact: true })
    .click();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await expect
    .poll(() =>
      page
        .locator('[data-slot="sidebar-container"]')
        .evaluate((element) =>
          Math.round(element.getBoundingClientRect().width),
        ),
    )
    .toBe(66);
  const accountButton = page.getByRole("button", {
    name: "Account: Sidebar Tester",
    exact: true,
  });
  await expect(accountButton).toBeVisible();
  await accountButton.click();
  await expect(
    page.getByRole("menuitem", { name: "Account", exact: true }),
  ).toBeVisible();
  // Security, Attendance and Holidays live outside the dropdown (settings
  // rail and sidebar), so they stay out of the account menu.
  await expect(
    page.getByRole("menuitem", { name: "Security & 2FA" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "My Attendance" }),
  ).toHaveCount(0);
  // Holidays lives in the sidebar for every role, so it stays out of the
  // account dropdown to avoid a redundant entry.
  await expect(
    page.getByRole("menuitem", { name: "Holidays & Calendar" }),
  ).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(
    (await page.context().cookies()).find(
      (cookie) => cookie.name === "sidebar_state",
    )?.value,
  ).toBe("false");
  await nav
    .getByRole("link", { name: "Payroll runs & payslips", exact: true })
    .click();
  await expect(page).toHaveURL(/\/payroll-runs$/);
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await expect(
    page.getByRole("region", { name: "Payroll runs", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/attendance$/);
  await page.mouse.move(800, 100);
  await nav
    .getByRole("link", { name: "Payroll runs & payslips", exact: true })
    .hover();
  await expect(page.locator('[data-slot="tooltip-content"]')).toBeVisible();
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText(
    "Payroll runs & payslips",
  );
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await expect(page.locator('[data-slot="breadcrumb-page"]')).toHaveText(
    "Attendance & DTR",
  );
  await page.keyboard.press("Control+b");
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  await page.goto("/year-end-tax");
  await expect(
    nav.getByRole("link", { name: "Year-end tax", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-slot="breadcrumb-page"]')).toHaveText(
    "Year-end tax",
  );
  await expect(
    page.getByRole("heading", { name: "Year-end tax", exact: true }),
  ).toBeInViewport();
  const accountBtn = page.getByRole("button", { name: /^Account:/ });
  await accountBtn.click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(nav).toHaveCount(0);
  expect(exceptions).toEqual([]);
});

test("sidebar profile dropdown navigates to account settings and signs out", async ({
  page,
}) => {
  const exceptions: string[] = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  await workspace(page);

  const accountButton = page.getByRole("button", {
    name: "Account: Sidebar Tester",
    exact: true,
  });
  await expect(accountButton).toBeVisible();

  // The account dropdown holds a single Account shortcut; Security and
  // Attendance live in the settings rail instead of the dropdown.
  await accountButton.click();
  await expect(page.getByRole("menuitem", { name: "Account" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Security & 2FA" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "My Attendance" }),
  ).toHaveCount(0);

  // Test opening profile dropdown and navigating to Account
  const profileItem = page.getByRole("menuitem", { name: "Account" });
  await profileItem.click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(
    page.getByRole("navigation", { name: "Profile settings" }),
  ).toHaveCount(1);

  // Test navigating between settings pages through the rail
  const rail = page.getByRole("navigation", { name: "Profile settings" });
  await rail.getByRole("link", { name: "Security", exact: true }).click();
  await expect(page).toHaveURL(/\/security$/);
  await expect(
    page.getByRole("navigation", { name: "Profile settings" }),
  ).toHaveCount(1);
  await rail.getByRole("link", { name: "Attendance", exact: true }).click();
  await expect(page).toHaveURL(/\/my-attendance$/);
  await expect(
    page.getByRole("navigation", { name: "Profile settings" }),
  ).toHaveCount(1);

  // Test log out from profile dropdown
  await accountButton.click();
  const logoutItem = page.getByRole("menuitem", { name: "Log out" });
  await expect(logoutItem).toBeVisible();
  await logoutItem.click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Login to your account" }),
  ).toBeVisible();
  expect(exceptions).toEqual([]);
});

test("mobile sidebar closes on navigation, Escape and the explicit close control without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const exceptions: string[] = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  await workspace(page);
  const toggle = page.getByRole("button", {
    name: "Toggle navigation",
    exact: true,
  });
  const nav = page.getByRole("navigation", { name: "Payroll navigation" });
  await expect(nav).toHaveCount(0);
  await toggle.click();
  const drawer = page.getByRole("dialog", { name: "Sidebar", exact: true });
  await expect(drawer).toBeVisible();
  await nav
    .getByRole("link", { name: "Leave management", exact: true })
    .click();
  await expect(page).toHaveURL(/\/leaves$/);
  await expect(drawer).toHaveCount(0);
  await toggle.click();
  await expect(
    nav.getByRole("link", { name: "Leave management", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page
    .getByRole("button", { name: "Close navigation", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(exceptions).toEqual([]);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`${colorScheme} theme keeps inset geometry, icon alignment and mobile width consistent`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1280, height: 900 });
    await workspace(page);
    if (colorScheme === "dark")
      await expect(page.locator("html")).toHaveClass(/dark/);
    else await expect(page.locator("html")).not.toHaveClass(/dark/);
    const metrics = await page.evaluate(() => {
      const element = (selector: string) => {
        const result = document.querySelector<HTMLElement>(selector);
        if (!result) throw new Error(`Missing ${selector}`);
        return result;
      };
      const header = element('[data-slot="sidebar-inset"] > header');
      const main = element('[data-slot="sidebar-inset"]');
      const brand = element(
        '[aria-label="Payroll workspace"] [aria-hidden="true"]',
      );
      const headerBox = header.getBoundingClientRect();
      const brandBox = brand.getBoundingClientRect();
      return {
        headerHeight: headerBox.height,
        headerCenter: headerBox.top + headerBox.height / 2,
        brandCenter: brandBox.top + brandBox.height / 2,
        mainRadius: getComputedStyle(main).borderTopLeftRadius,
        headerRadius: getComputedStyle(header).borderTopLeftRadius,
        mainBackground: getComputedStyle(main).backgroundColor,
        headerBackground: getComputedStyle(header).backgroundColor,
        wrapperBackground: getComputedStyle(
          element('[data-slot="sidebar-wrapper"]'),
        ).backgroundColor,
        sidebarBackground: getComputedStyle(
          element('[data-slot="sidebar-inner"]'),
        ).backgroundColor,
      };
    });
    expect(metrics.headerHeight).toBe(64);
    expect(
      Math.abs(metrics.headerCenter - metrics.brandCenter),
    ).toBeLessThanOrEqual(1);
    expect(metrics.headerRadius).toBe(metrics.mainRadius);
    expect(metrics.headerBackground).toBe(metrics.mainBackground);
    expect(metrics.wrapperBackground).toBe(metrics.sidebarBackground);
    await expect(
      page.locator(".text-slate-400, .border-slate-700"),
    ).toHaveCount(0);

    const toggle = page.getByRole("button", {
      name: "Toggle navigation",
      exact: true,
    });
    await toggle.click();
    await expect
      .poll(() =>
        page
          .locator('[data-slot="sidebar-container"]')
          .evaluate((element) =>
            Math.round(element.getBoundingClientRect().width),
          ),
      )
      .toBe(66);
    await expect
      .poll(() =>
        page
          .locator('[data-slot="sidebar-inset"] > header')
          .evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBe(48);
    const account = page.getByRole("button", {
      name: "Account: Sidebar Tester",
      exact: true,
    });
    await expect(account).toBeVisible();
    const centers = await page.evaluate(() => {
      const selectors = [
        '[aria-label="Payroll workspace"]',
        '[aria-label="Account: Sidebar Tester"]',
        'nav[aria-label="Payroll navigation"] a[href="/employees"]',
      ];
      return selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const box = element.getBoundingClientRect();
        return { width: box.width, center: box.left + box.width / 2 };
      });
    });
    for (const box of centers) {
      expect(box.width).toBe(32);
      expect(
        Math.abs(box.center - (centers[0]?.center ?? 0)),
      ).toBeLessThanOrEqual(1);
    }
    await toggle.click();

    for (const width of [700, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(
        page.getByRole("navigation", { name: "Payroll navigation" }),
      ).toHaveCount(0);
      await toggle.click();
      const drawer = page.getByRole("dialog", { name: "Sidebar", exact: true });
      await expect(drawer).toBeVisible();
      await expect
        .poll(() =>
          drawer.evaluate((element) =>
            Number(getComputedStyle(element).opacity),
          ),
        )
        .toBe(1);
      expect((await drawer.boundingBox())?.width).toBe(288);
      await expect(account).toBeInViewport();
      await expect(
        page.getByRole("link", { name: "Payroll workspace", exact: true }),
      ).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page
        .getByRole("button", { name: "Close navigation", exact: true })
        .click();
      await expect(drawer).toHaveCount(0);
    }
  });
}

for (const role of ["UNASSIGNED", "ANONYMOUS"]) {
  test(`${role} cannot see staff sidebar destinations or fetch staff lists`, async ({
    page,
  }) => {
    const { requests } = await workspace(page, role);
    for (const { href } of destinations) {
      await page.goto(href);
      await expect(page.getByText("No staff records available")).toBeVisible();
      await expect(page.locator("#workspace-content h1")).toHaveCount(0);
    }
    await expect(page.getByText("No staff records available")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Payroll navigation" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Toggle navigation", exact: true }),
    ).toHaveCount(0);
    expect(requests).not.toContain("employees.list");
    expect(requests).not.toContain("payroll.listRuns");
  });
}

test("anonymous direct page access redirects to sign-in without staff reads", async ({
  page,
}) => {
  const { requests } = await workspace(page, "HR_ADMIN", false);
  for (const { href } of destinations) {
    await page.goto(href);
    await expect(
      page.getByRole("heading", { name: "Login to your account" }),
    ).toBeVisible();
    await expect(page).toHaveURL("/");
  }
  await expect(
    page.getByRole("heading", { name: "Login to your account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Payroll navigation" }),
  ).toHaveCount(0);
  expect(requests).not.toContain("employees.list");
  expect(requests).not.toContain("payroll.listRuns");
});

for (const destination of destinations) {
  test(`direct load and reload of ${destination.href} renders only that page`, async ({
    page,
  }) => {
    const { requests } = await workspace(page);
    requests.length = 0;
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      else await page.goto(destination.href);
      await expect(
        page.getByRole("heading", {
          name: destination.label,
          exact: true,
          level: 1,
        }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("navigation", { name: "Payroll navigation" })
          .getByRole("link", { name: destination.label, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.locator('[data-slot="breadcrumb-page"]')).toHaveText(
        destination.label,
      );
      if (destination.region)
        await expect(
          page.getByRole("region", { name: destination.region, exact: true }),
        ).toBeVisible();
      for (const other of destinations) {
        if (other.href !== destination.href && other.region)
          await expect(
            page.getByRole("region", { name: other.region, exact: true }),
          ).toHaveCount(0);
      }
    }
    if (destination.query) expect(requests).toContain(destination.query);
    if (destination.query !== "employees.list")
      expect(requests).not.toContain("employees.list");
    if (destination.query !== "payroll.listRuns")
      expect(requests).not.toContain("payroll.listRuns");
  });
}
