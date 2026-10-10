import { expect, type Page, test } from "@playwright/test";

// ── Shared mock data ──────────────────────────────────────────────────────────

const employeeUser = {
  id: "u-emp-1",
  organizationId: "org-1",
  name: "Maria Santos",
  email: "maria@example.com",
  role: "EMPLOYEE",
  employeeId: "e-emp-1",
};

const managerUser = {
  id: "u-mgr-1",
  organizationId: "org-1",
  name: "Carlos Reyes",
  email: "carlos@example.com",
  role: "DEPARTMENT_MANAGER",
  employeeId: "e-mgr-1",
};

const hrUser = {
  id: "u-hr-1",
  organizationId: "org-1",
  name: "HR Admin",
  email: "hr@example.com",
  role: "HR_ADMIN",
  employeeId: "e-hr-1",
};

const unlinkedAdminUser = {
  id: "u-admin-1",
  organizationId: "org-1",
  organizationName: "Acme Philippines Technologies Inc.",
  name: "System Administrator",
  email: "sysadmin@example.com",
  role: "SUPER_ADMIN",
  employeeId: undefined,
};

const employeeProfile = {
  id: "e-emp-1",
  employeeNumber: "EMP-2026-001",
  firstName: "Maria",
  middleName: "Cruz",
  lastName: "Santos",
  suffix: null,
  email: "maria@example.com",
  contactNumber: "09171234567",
  dateOfBirth: "1995-06-15T00:00:00.000Z",
  gender: "FEMALE",
  civilStatus: "SINGLE",
  hireDate: "2024-01-10T00:00:00.000Z",
  resignationDate: null,
  terminationDate: null,
  residentialAddress: "123 Rizal Ave, Makati City, Metro Manila",
  employmentStatus: "ACTIVE",
  employmentType: "REGULAR",
  tin: "123-456-789-000",
  sssNo: "33-1234567-8",
  philhealthNo: "12-345678901-2",
  pagibigNo: "1234-5678-9012",
  bankName: "BDO Unibank",
  bankAccountNumber: "001234567890",
  department: { id: "dept-1", name: "Engineering", code: "ENG" },
  branch: { id: "br-1", name: "Head Office" },
  compensation: {
    id: "comp-1",
    employeeId: "e-emp-1",
    basicRateMonthlyCents: 5000000,
    basicRateDailyCents: 192308,
    basicRateHourlyCents: 24038,
    isTaxExempt: false,
    customSssDeductionCents: null,
    customPhilhealthDeductionCents: null,
    customPagibigDeductionCents: null,
    effectiveDate: "2024-01-10T00:00:00.000Z",
  },
  allowances: [],
  leaveBalances: [
    {
      id: "lb-1",
      employeeId: "e-emp-1",
      leaveType: "VACATION",
      totalCredits: "15",
      usedCredits: "3",
      balance: "12",
      year: 2026,
    },
    {
      id: "lb-2",
      employeeId: "e-emp-1",
      leaveType: "SICK",
      totalCredits: "15",
      usedCredits: "1",
      balance: "14",
      year: 2026,
    },
  ],
};

const leaveRequests = [
  {
    id: "lr-1",
    employeeId: "e-emp-1",
    leaveType: "VACATION",
    startDate: "2026-09-20T00:00:00.000Z",
    endDate: "2026-09-22T00:00:00.000Z",
    daysCount: "3",
    partialDate: null,
    debitedDays: "3",
    refundedDays: null,
    status: "APPROVED",
    isPaid: true,
    reason: "Family vacation to Palawan",
    rejectionReason: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "lr-2",
    employeeId: "e-emp-1",
    leaveType: "SICK",
    startDate: "2026-10-05T00:00:00.000Z",
    endDate: "2026-10-05T00:00:00.000Z",
    daysCount: "1",
    partialDate: null,
    debitedDays: null,
    refundedDays: null,
    status: "PENDING",
    isPaid: true,
    reason: "Medical checkup",
    rejectionReason: null,
    createdAt: "2026-10-01T00:00:00.000Z",
  },
];

const employeePayslips = [
  {
    id: "ps-1",
    payrollRunId: "run-1",
    employeeId: "e-emp-1",
    basicPayCents: 2500000,
    paidLeavePayCents: 0,
    overtimePayCents: 50000,
    nightDiffPayCents: 0,
    holidayPayCents: 100000,
    restDayPayCents: 0,
    taxableAllowancesCents: 0,
    nonTaxableAllowancesCents: 100000,
    grossPayCents: 2750000,
    bonusPaidCents: 0,
    tardinessDeductionCents: 5000,
    undertimeDeductionCents: 0,
    absenceDeductionCents: 0,
    sssEmployeeCents: 90000,
    sssWispEmployeeCents: 22500,
    philhealthEmployeeCents: 50000,
    pagibigEmployeeCents: 20000,
    withholdingTaxCents: 150000,
    loanDeductionsCents: 0,
    otherDeductionsCents: 0,
    totalDeductionsCents: 337500,
    netPayCents: 2412500,
    payrollRun: {
      paymentDate: "2026-09-30T00:00:00.000Z",
      cutoffStartDate: "2026-09-16T00:00:00.000Z",
      cutoffEndDate: "2026-09-30T00:00:00.000Z",
      cutoffSequence: "SECOND_CUTOFF",
      status: "DISBURSED",
    },
  },
];

const dtrRecords = [
  {
    id: "dtr-1",
    date: "2026-10-01T00:00:00.000Z",
    dayType: "REGULAR",
    timeIn: "2026-10-01T00:00:00.000Z",
    timeOut: "2026-10-01T09:00:00.000Z",
    actualWorkedMinutes: 480,
    overtimeMinutes: 0,
    tardinessMinutes: 0,
    undertimeMinutes: 0,
    isApproved: true,
  },
  {
    id: "dtr-2",
    date: "2026-10-02T00:00:00.000Z",
    dayType: "REGULAR",
    timeIn: "2026-10-02T00:30:00.000Z",
    timeOut: "2026-10-02T09:30:00.000Z",
    actualWorkedMinutes: 450,
    overtimeMinutes: 0,
    tardinessMinutes: 30,
    undertimeMinutes: 0,
    isApproved: false,
  },
  {
    id: "dtr-3",
    date: "2026-10-03T00:00:00.000Z",
    dayType: "REGULAR",
    timeIn: "2026-10-03T00:00:00.000Z",
    timeOut: "2026-10-03T10:00:00.000Z",
    actualWorkedMinutes: 540,
    overtimeMinutes: 60,
    tardinessMinutes: 0,
    undertimeMinutes: 0,
    isApproved: true,
  },
];

const pendingLeaveRequests = [
  {
    id: "plr-1",
    employeeId: "e-emp-1",
    leaveType: "VACATION",
    startDate: "2026-10-10T00:00:00.000Z",
    endDate: "2026-10-12T00:00:00.000Z",
    daysCount: "3",
    partialDate: null,
    status: "PENDING",
    isPaid: true,
    reason: "Trip to Cebu for family reunion",
    employee: {
      id: "e-emp-1",
      firstName: "Maria",
      lastName: "Santos",
      employeeNumber: "EMP-2026-001",
      department: { id: "dept-1", name: "Engineering", code: "ENG" },
    },
  },
];

const overviewData = {
  employees: {
    total: 10,
    active: 8,
    onLeave: 1,
    resigned: 1,
    terminated: 0,
    other: 0,
  },
  payroll: {
    latestRun: null,
    recentRuns: [],
  },
  leaves: { pendingCount: 1 },
  loans: { activeCount: 0, totalOutstandingCents: 0 },
  audit: [],
};

// ── Mock & Login Helper ───────────────────────────────────────────────────────

async function setupAndLogin(
  page: Page,
  user:
    | typeof employeeUser
    | typeof managerUser
    | typeof hrUser
    | typeof unlinkedAdminUser,
  extraHandlers?: Record<string, unknown>,
) {
  let signedIn = false;

  await page.route("**/trpc/**", async (route) => {
    const request = route.request();
    const paths = (
      new URL(request.url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");

    const results = paths.map((path: string, index: number) => {
      if (path === "auth.login") {
        signedIn = true;
        return { result: { data: { json: { user } } } };
      }
      if (path === "auth.logout") {
        signedIn = false;
        return { result: { data: { json: { success: true } } } };
      }
      if (!signedIn) {
        return {
          error: {
            json: {
              message: "Unauthorized",
              code: -32001,
              data: { code: "UNAUTHORIZED", httpStatus: 401 },
            },
          },
        };
      }

      if (path === "auth.me") {
        return { result: { data: { json: user } } };
      }

      // Check extraHandlers
      if (extraHandlers && path in extraHandlers) {
        const handler = extraHandlers[path];
        if (typeof handler === "function") {
          return {
            result: {
              data: {
                json: (handler as (...args: unknown[]) => unknown)(
                  request,
                  index,
                ),
              },
            },
          };
        }
        return { result: { data: { json: handler } } };
      }

      // Default mock responses
      const data: Record<string, unknown> = {
        "employees.getMyProfile": employeeProfile,
        "employees.list": [],
        "leaves.listRequests": leaveRequests,
        "leaves.getBalances": employeeProfile.leaveBalances,
        "leaves.listPendingRequests": pendingLeaveRequests,
        "payroll.getMyPayslips": employeePayslips,
        "payroll.getMyPayslipById": employeePayslips[0],
        "timekeeping.getMyDTR": dtrRecords,
        "dashboard.getOverview": overviewData,
        "holidays.list": [
          {
            id: "hol-1",
            organizationId: "org-1",
            date: "2026-12-25T00:00:00.000Z",
            name: "Christmas Day",
            dayType: "REGULAR_HOLIDAY",
            isRecurring: true,
          },
        ],
        "compliance.getBir2316Issuance": {
          id: "iss-1",
          status: "ISSUED",
          version: 1,
          issuedAt: "2027-01-15T00:00:00.000Z",
          statutoryDeadline: "2027-01-31",
          hadPriorEmployer: false,
        },
        "compliance.downloadBir2316Pdf": {
          fileName: "BIR2316_2026_Santos_Maria_OFFICIAL.pdf",
          dataBase64: "JVBERi0xLjQK...",
          isIssued: true,
          version: 1,
        },
      };

      if (path in data) {
        return { result: { data: { json: data[path] } } };
      }

      return { result: { data: { json: null } } };
    });

    await route.fulfill({
      status: !signedIn && paths.includes("auth.me") ? 401 : 200,
      contentType: "application/json",
      body: JSON.stringify(paths.length === 1 ? results[0] : results),
    });
  });

  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText(user.name).first()).toBeVisible();
}

// ── Test: Employee Profile with Sensitive ID Masking ──────────────────────────

test("employee views my-profile page with masked statutory IDs and can unmask them", async ({
  page,
}) => {
  await setupAndLogin(page, employeeUser);

  await page.goto("/profile");
  const section = page.getByRole("region", { name: "My Profile" });
  await expect(section).toBeVisible();

  // Verify employee name and details
  await expect(section.getByText("Maria Cruz Santos")).toBeVisible();
  await expect(section.getByText("EMP-2026-001")).toBeVisible();
  await expect(section.getByText("Engineering")).toBeVisible();
  await expect(section.getByText("ACTIVE")).toBeVisible();

  // IDs should be masked initially
  await expect(section.getByText("123-456-789-000")).toHaveCount(0);
  await expect(section.getByText("33-1234567-8")).toHaveCount(0);
  await expect(section.getByText("12-345678901-2")).toHaveCount(0);
  await expect(section.getByText("1234-5678-9012")).toHaveCount(0);

  // Masked versions should appear
  await expect(section.getByText("BIR TIN")).toBeVisible();
  await expect(section.getByText("SSS Number")).toBeVisible();
  await expect(section.getByText("PhilHealth ID")).toBeVisible();
  await expect(section.getByText("Pag-IBIG MID")).toBeVisible();

  // Click "Show Sensitive IDs" to unmask
  await section.getByRole("button", { name: "Show sensitive IDs" }).click();

  // Now the real IDs should be visible
  await expect(section.getByText("123-456-789-000")).toBeVisible();
  await expect(section.getByText("33-1234567-8")).toBeVisible();
  await expect(section.getByText("12-345678901-2")).toBeVisible();
  await expect(section.getByText("1234-5678-9012")).toBeVisible();

  // Button text should have changed to "Hide Sensitive IDs"
  await expect(
    section.getByRole("button", { name: "Hide sensitive IDs" }),
  ).toBeVisible();

  // Toggle back to mask them
  await section.getByRole("button", { name: "Hide sensitive IDs" }).click();
  await expect(section.getByText("123-456-789-000")).toHaveCount(0);
});

// ── Test: Employee Leave Filing ───────────────────────────────────────────────

test("employee files a leave request from my-profile page", async ({
  page,
}) => {
  await setupAndLogin(page, employeeUser, {
    "leaves.request": {
      request: {
        id: "lr-new",
        status: "PENDING",
        leaveType: "VACATION",
      },
    },
  });

  await page.goto("/profile");
  const section = page.getByRole("region", { name: "My Profile" });
  await expect(section).toBeVisible();

  // Open the leave filing form
  await section.getByRole("button", { name: "File Leave Request" }).click();

  // Fill out the leave form
  const form = section.locator("form").filter({ hasText: "New Leave Request" });
  await expect(form).toBeVisible();

  // Enter reason
  await form
    .getByPlaceholder("Brief explanation of your leave request…")
    .fill("Personal holiday trip");

  // Submit the leave request
  await form.getByRole("button", { name: "Submit Request" }).click();

  // Verify success message
  await expect(
    section.getByText("Leave request submitted successfully!"),
  ).toBeVisible();
});

// ── Test: Employee Withdraws Pending Leave ────────────────────────────────────

test("employee can view leave history with pending leave withdraw functionality", async ({
  page,
}) => {
  await setupAndLogin(page, employeeUser);

  await page.goto("/profile");
  const section = page.getByRole("region", { name: "My Profile" });
  await expect(section).toBeVisible();

  // Should see leave history section
  await expect(section.getByText(/Recent Leave Requests/)).toBeVisible();

  // Should see approved request
  await expect(section.getByText("Family vacation to Palawan")).toBeVisible();

  // Should see pending request with withdraw option
  await expect(section.getByText("Medical checkup")).toBeVisible();
  await expect(section.getByText("PENDING").first()).toBeVisible();
  await expect(section.getByRole("button", { name: "Withdraw" })).toBeVisible();
});

// ── Test: Employee Views Payslips with Detail Modal ───────────────────────────

test("employee views payslip history and clicks detail to see earnings/deductions breakdown", async ({
  page,
}) => {
  await setupAndLogin(page, employeeUser);

  await page.goto("/profile");
  const section = page.getByRole("region", { name: "My Profile" });
  await expect(section).toBeVisible();

  // Payslip history section
  await expect(section.getByText("My Payslips")).toBeVisible();

  // Click the payslip detail button
  const detailButton = section
    .getByRole("button", { name: "View Details" })
    .first();
  await expect(detailButton).toBeVisible();
  await detailButton.click();

  // Payslip detail modal/section should show earnings breakdown
  await expect(page.getByText("₱25,000.00").first()).toBeVisible(); // basic pay
  await expect(page.getByText("₱24,125.00").first()).toBeVisible(); // net pay
});

// ── Test: Employee Views BIR 2316 and Downloads Certificate ──────────────────

test("employee views official BIR 2316 card and downloads annual tax certificate", async ({
  page,
}) => {
  await setupAndLogin(page, employeeUser);

  await page.goto("/profile");
  const section = page.getByRole("region", { name: "My Profile" });
  await expect(section).toBeVisible();

  // BIR Form 2316 section
  await expect(
    section.getByText("BIR Form 2316 (Annual Tax Certificate)"),
  ).toBeVisible();
  await expect(section.getByText("Official BIR Form 2316")).toBeVisible();
  await expect(section.getByText(/Issued · v1/)).toBeVisible();
  await expect(
    section.getByText(/Qualified for Substituted Filing/),
  ).toBeVisible();

  // Download BIR Form 2316 PDF button
  const downloadBtn = section.getByRole("button", {
    name: "Download BIR Form 2316",
  });
  await expect(downloadBtn).toBeVisible();
  await downloadBtn.click();
});

// ── Test: Employee Attendance Dashboard ───────────────────────────────────────

test("employee visits my-attendance and sees KPI cards and DTR table", async ({
  page,
}) => {
  await setupAndLogin(page, employeeUser);

  await page.goto("/my-attendance");
  const section = page.getByRole("region", { name: "My Attendance" });
  await expect(section).toBeVisible();

  // Settings rail covers Account, Attendance (active here), and Security
  const rail = page.getByRole("navigation", { name: "Profile settings" });
  await expect(rail).toHaveCount(1);
  await expect(
    rail.getByRole("link", { name: "Attendance", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  // Section header
  await expect(section.getByText("My Attendance & DTR Records")).toBeVisible();

  // Date filter form
  await expect(section.getByText("From Date")).toBeVisible();
  await expect(section.getByText("To Date")).toBeVisible();

  // KPI cards
  await expect(section.getByText("Days Logged")).toBeVisible();
  await expect(section.getByText("3", { exact: true })).toBeVisible(); // 3 DTR records
  await expect(section.getByText("Hours Worked")).toBeVisible();
  await expect(section.getByText("OT hours")).toBeVisible();
  await expect(section.getByText("60 min")).toBeVisible(); // 60 overtime minutes
  await expect(section.getByText("Tardiness")).toBeVisible();
  await expect(section.getByText("late arrival penalties")).toBeVisible();
  await expect(section.getByText("Undertime")).toBeVisible();

  // DTR Table
  await expect(section.getByText("Daily Attendance Breakdown")).toBeVisible();
  await expect(section.getByText("Time In")).toBeVisible();
  await expect(section.getByText("Time Out")).toBeVisible();

  // Check for the "Approved" status badge
  await expect(section.getByText("Approved").first()).toBeVisible();
});

// ── Test: Manager Pending Leave Approvals ─────────────────────────────────────

test("department manager sees and can approve/reject pending leave requests on leaves page", async ({
  page,
}) => {
  await setupAndLogin(page, managerUser, {
    "leaves.approve": {
      request: { ...pendingLeaveRequests[0], status: "APPROVED" },
      newlyApproved: true,
    },
    "leaves.listPendingRequests": pendingLeaveRequests,
  });

  await page.goto("/leaves");

  // Should see the "Pending Leave Approvals" section
  const section = page.getByRole("region", { name: "Pending leave approvals" });
  await expect(section).toBeVisible();

  // Verify the pending request details
  await expect(section.getByText("Maria Santos")).toBeVisible();
  await expect(section.getByText("(EMP-2026-001)")).toBeVisible();
  await expect(section.getByText("VACATION")).toBeVisible();
  await expect(section.getByText("3 days")).toBeVisible();
  await expect(
    section.getByText("Trip to Cebu for family reunion"),
  ).toBeVisible();

  // Approve button should exist
  const approveBtn = section.getByRole("button", {
    name: "Approve leave for Maria Santos",
  });
  await expect(approveBtn).toBeVisible();

  // Reject button should exist
  const rejectBtn = section.getByRole("button", {
    name: "Reject leave for Maria Santos",
  });
  await expect(rejectBtn).toBeVisible();

  // Click reject to open the rejection form
  await rejectBtn.click();

  // Rejection form should appear with minimum character requirement
  await expect(
    section.getByText("Reason for Rejection (min 10 characters)"),
  ).toBeVisible();

  // Try submitting with too-short reason
  await section
    .getByPlaceholder("State why this leave request is being rejected…")
    .fill("too short");
  await section.getByRole("button", { name: "Confirm Rejection" }).click();
  await expect(
    section.getByText("Rejection reason must be at least 10 characters."),
  ).toBeVisible();

  // Cancel rejection
  await section.getByRole("button", { name: "Cancel" }).click();
  await expect(
    section.getByText("Reason for Rejection (min 10 characters)"),
  ).toHaveCount(0);
});

// ── Test: Role-Aware Sidebar Navigation ───────────────────────────────────────

test("employee role shows self-service navigation, not admin sections", async ({
  page,
}) => {
  await setupAndLogin(page, employeeUser);

  // Employee overview should render (not the full dashboard)
  await expect(page.getByText("Welcome, Maria Santos!")).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Payroll navigation" });

  // Employee should see self-service links (Dashboard, Holiday Calendar).
  // My Attendance moved to the account dropdown.
  await expect(nav.getByText("Dashboard")).toBeVisible();
  await expect(nav.getByText("Holiday Calendar")).toBeVisible();
  await expect(nav.getByText("My Attendance")).toHaveCount(0);

  // My Profile should NOT be in the sidebar navigation (available in user profile dropdown)
  await expect(nav.getByText("My Profile")).toHaveCount(0);

  // User profile dropdown holds only the Account shortcut; Security and
  // Attendance live in the settings rail instead of the dropdown.
  const userButton = page.getByLabel(`Account: ${employeeUser.name}`);
  await expect(userButton).toBeVisible();
  await userButton.click();
  await expect(
    page.getByRole("menuitem", { name: "Account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Security & 2FA" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "My Attendance" }),
  ).toHaveCount(0);

  // Employee should NOT see admin sections
  await expect(nav.getByText("Employees", { exact: true })).toHaveCount(0);
  await expect(nav.getByText("Payroll runs & payslips")).toHaveCount(0);
  await expect(nav.getByText("Year-end BIR 2316")).toHaveCount(0);
});

test("department manager sidebar shows workspace and self-service navigation", async ({
  page,
}) => {
  await setupAndLogin(page, managerUser);

  const nav = page.getByRole("navigation", { name: "Payroll navigation" });

  // Manager should see workspace items (employees/attendance are intentionally
  // omitted: the role is denied on those sections, so links would dead-end)
  await expect(
    nav.getByRole("link", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(nav.getByText("Employees", { exact: true })).toHaveCount(0);
  await expect(nav.getByText("Attendance & DTR")).toHaveCount(0);
  await expect(
    nav.getByRole("link", { name: "Leave management", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Holiday calendar", exact: true }),
  ).toBeVisible();

  // Manager should also see self-service (My Profile and My Attendance live
  // in the account dropdown)
  await expect(nav.getByText("My Attendance")).toHaveCount(0);
  await expect(nav.getByText("My Profile")).toHaveCount(0);

  // Manager should NOT see payroll operations
  await expect(nav.getByText("Payroll runs & payslips")).toHaveCount(0);
  await expect(nav.getByText("Year-end BIR 2316")).toHaveCount(0);
  await expect(nav.getByText("Compliance 2316 Ledger")).toHaveCount(0);
});

test("HR admin sidebar shows full workspace including payroll operations", async ({
  page,
}) => {
  await setupAndLogin(page, hrUser);

  const nav = page.getByRole("navigation", { name: "Payroll navigation" });

  // HR should see all workspace items
  await expect(
    nav.getByRole("link", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Employees", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Attendance & DTR", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Leave management", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Holiday calendar", exact: true }),
  ).toBeVisible();

  // HR should see payroll operations
  await expect(
    nav.getByRole("link", { name: "Payroll runs & payslips", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Year-end tax", exact: true }),
  ).toBeVisible();

  // HR should also see self-service (My Profile and My Attendance live in
  // the account dropdown)
  await expect(nav.getByText("My Attendance")).toHaveCount(0);
  await expect(nav.getByText("My Profile")).toHaveCount(0);
});

// ── Test: RBAC Route Guard & Maker-Checker ────────────────────────────────────

test("employee directly accessing unauthorized payroll routes sees Access Restricted card", async ({
  page,
}) => {
  await setupAndLogin(page, employeeUser);

  await page.goto("/process-payroll");
  const restrictedCard = page.getByRole("region", {
    name: "Access restricted",
  });
  await expect(restrictedCard).toBeVisible();
  await expect(restrictedCard.getByText("Access Restricted")).toBeVisible();
  await expect(
    restrictedCard.getByRole("link", { name: "Return to Overview" }),
  ).toBeVisible();

  await page.goto("/payroll-runs");
  await expect(
    page.getByRole("region", { name: "Access restricted" }),
  ).toBeVisible();
});

test("department manager directly accessing payroll process sees Access Restricted card", async ({
  page,
}) => {
  await setupAndLogin(page, managerUser);

  await page.goto("/process-payroll");
  const restrictedCard = page.getByRole("region", {
    name: "Access restricted",
  });
  await expect(restrictedCard).toBeVisible();
  await expect(restrictedCard.getByText("Access Restricted")).toBeVisible();
});

test("HR admin accessing process-payroll sees Maker-Checker separation of duties card", async ({
  page,
}) => {
  await setupAndLogin(page, hrUser);

  await page.goto("/process-payroll");
  const makerCheckerCard = page.getByRole("region", {
    name: "Process payroll run",
  });
  await expect(makerCheckerCard).toBeVisible();
  await expect(
    makerCheckerCard.getByText("Maker-Checker Separation of Duties", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    makerCheckerCard.getByRole("link", { name: "Review Payroll Runs" }),
  ).toBeVisible();
});

test("unlinked administrator visiting my-profile sees administrative card and MFA settings", async ({
  page,
}) => {
  await setupAndLogin(page, unlinkedAdminUser);

  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "System Administrator" }),
  ).toBeVisible();
  await expect(
    page.getByText("Acme Philippines Technologies Inc."),
  ).toBeVisible();
  // Internal identifiers stay out of the profile card.
  await expect(page.getByText(/Org:/)).toHaveCount(0);
  await expect(page.getByText("org-1")).toHaveCount(0);
  await expect(page.getByText("Administrative System Account")).toBeVisible();
  // Sidebar owns navigation; the admin card carries no duplicate shortcuts.
  await expect(
    page.getByRole("link", { name: "Employee Directory" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Payroll Operations" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Workspace Overview" }),
  ).toHaveCount(0);

  await page.goto("/security");
  await expect(
    page.getByText("Two-Factor Authentication (TOTP)"),
  ).toBeVisible();
});

test("unlinked administrator visiting my-attendance sees administrative attendance notice", async ({
  page,
}) => {
  await setupAndLogin(page, unlinkedAdminUser);

  await page.goto("/my-attendance");
  await expect(page.getByText("Administrative Account Notice")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to Attendance & DTR Workspace" }),
  ).toBeVisible();
});

test("employee can view holiday calendar in read-only mode without management controls", async ({
  page,
}) => {
  await setupAndLogin(page, employeeUser);

  await page.goto("/holidays");
  const section = page.getByRole("region", { name: "Holiday calendar" });
  await expect(section).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Holiday calendar", exact: true }),
  ).toBeVisible();

  // Employee can view the configured holidays
  await expect(section.getByText("Christmas Day")).toBeVisible();

  // Employee should NOT have management buttons
  await expect(
    section.getByRole("button", { name: "Add holiday" }),
  ).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Populate" })).toHaveCount(
    0,
  );
});
