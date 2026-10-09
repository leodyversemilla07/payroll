import { expect, test } from "@playwright/test";

const adminUser = {
  id: "u-admin-1",
  organizationId: "org-1",
  name: "Payroll Admin",
  email: "admin@example.com",
  role: "SUPER_ADMIN",
};

const employeeUser = {
  id: "u-emp-1",
  organizationId: "org-1",
  name: "Maria Santos",
  email: "maria@example.com",
  role: "EMPLOYEE",
  employeeId: "e-emp-1",
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
  leaveBalances: [],
};

const runWithSlips = {
  id: "run-pdf-001",
  paymentDate: "2026-09-30T00:00:00.000Z",
  cutoffStartDate: "2026-09-16T00:00:00.000Z",
  cutoffEndDate: "2026-09-30T00:00:00.000Z",
  status: "DISBURSED",
  cutoffSequence: "SECOND_CUTOFF",
  totalGrossCents: 5000000,
  totalDeductionsCents: 600000,
  totalNetCents: 4400000,
  _count: { payslips: 2 },
  payslips: [
    {
      id: "slip-pdf-001",
      employeeId: "e-emp-1",
      payrollRunId: "run-pdf-001",
      basicPayCents: 2500000,
      paidLeavePayCents: 0,
      overtimePayCents: 0,
      nightDiffPayCents: 0,
      holidayPayCents: 0,
      restDayPayCents: 0,
      taxableAllowancesCents: 0,
      nonTaxableAllowancesCents: 0,
      bonusPaidCents: 0,
      grossPayCents: 2500000,
      tardinessDeductionCents: 0,
      undertimeDeductionCents: 0,
      absenceDeductionCents: 0,
      sssEmployeeCents: 90000,
      sssWispEmployeeCents: 22500,
      philhealthEmployeeCents: 50000,
      pagibigEmployeeCents: 20000,
      withholdingTaxCents: 150000,
      loanDeductionsCents: 0,
      otherDeductionsCents: 0,
      totalDeductionsCents: 310000,
      netPayCents: 2190000,
      employee: {
        id: "e-emp-1",
        firstName: "Maria",
        lastName: "Santos",
        employeeNumber: "EMP-2026-001",
        dateOfBirth: "1995-06-15T00:00:00.000Z",
      },
    },
    {
      id: "slip-pdf-002",
      employeeId: "e-emp-2",
      payrollRunId: "run-pdf-001",
      basicPayCents: 2500000,
      paidLeavePayCents: 0,
      overtimePayCents: 0,
      nightDiffPayCents: 0,
      holidayPayCents: 0,
      restDayPayCents: 0,
      taxableAllowancesCents: 0,
      nonTaxableAllowancesCents: 0,
      bonusPaidCents: 0,
      grossPayCents: 2500000,
      tardinessDeductionCents: 0,
      undertimeDeductionCents: 0,
      absenceDeductionCents: 0,
      sssEmployeeCents: 90000,
      sssWispEmployeeCents: 22500,
      philhealthEmployeeCents: 50000,
      pagibigEmployeeCents: 20000,
      withholdingTaxCents: 150000,
      loanDeductionsCents: 0,
      otherDeductionsCents: 0,
      totalDeductionsCents: 310000,
      netPayCents: 2190000,
      employee: {
        id: "e-emp-2",
        firstName: "Juan",
        lastName: "Dela Cruz",
        employeeNumber: "EMP-2026-002",
        dateOfBirth: "1990-12-01T00:00:00.000Z",
      },
    },
  ],
};

const dummyBase64Pdf =
  "JVBERi0xLjQKJeLjz9MKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+CmVuZG9iagoyIDAgb2JqPDwvVHlwZS9QYWdlcy9Db3VudCAxL0tpZHNbMyAwIFJdPj4KZW5kb2JqCjMgMCBvYmo8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXT4+CmVuZG9iago=";
const dummyBase64Zip = "UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==";

test.describe("Feature 9: Payslip PDF Generation & Batch Download", () => {
  test("admin can generate all payslip PDFs and download ZIP bundle", async ({
    page,
  }) => {
    let signedIn = false;
    const recordedCalls: string[] = [];

    await page.route("**/trpc/**", async (route) => {
      const paths = (
        new URL(route.request().url()).pathname.split("/trpc/")[1] ?? ""
      ).split(",");

      const results = paths.map((path) => {
        if (path === "auth.login") {
          signedIn = true;
          return { result: { data: { json: { user: adminUser } } } };
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

        recordedCalls.push(path);

        if (path === "auth.me") {
          return { result: { data: { json: adminUser } } };
        }
        if (path === "payroll.listRuns") {
          return {
            result: {
              data: {
                json: [
                  {
                    id: runWithSlips.id,
                    paymentDate: runWithSlips.paymentDate,
                    cutoffStartDate: runWithSlips.cutoffStartDate,
                    cutoffEndDate: runWithSlips.cutoffEndDate,
                    status: runWithSlips.status,
                    cutoffSequence: runWithSlips.cutoffSequence,
                    totalGrossCents: runWithSlips.totalGrossCents,
                    totalDeductionsCents: runWithSlips.totalDeductionsCents,
                    totalNetCents: runWithSlips.totalNetCents,
                    _count: runWithSlips._count,
                  },
                ],
              },
            },
          };
        }
        if (path === "payroll.getRunDetails") {
          return { result: { data: { json: runWithSlips } } };
        }
        if (path === "payroll.generateRunPdfs") {
          return {
            result: {
              data: {
                json: {
                  total: 2,
                  generated: 2,
                  runId: runWithSlips.id,
                },
              },
            },
          };
        }
        if (path === "payroll.downloadRunZip") {
          return {
            result: {
              data: {
                json: {
                  fileName: "payslips-SECOND_CUTOFF-2026-09-30.zip",
                  dataBase64: dummyBase64Zip,
                },
              },
            },
          };
        }
        if (path === "payroll.downloadPayslip") {
          return {
            result: {
              data: {
                json: {
                  fileName: "payslip-EMP-2026-001.pdf",
                  dataBase64: dummyBase64Pdf,
                },
              },
            },
          };
        }
        return { result: { data: { json: null } } };
      });

      await route.fulfill({
        status: !signedIn && paths.includes("auth.me") ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify(paths.length === 1 ? results[0] : results),
      });
    });

    // 1. Log in
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(adminUser.email);
    await page.getByLabel("Password", { exact: true }).fill("password");
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await expect(page.getByText(adminUser.name).first()).toBeVisible();

    // 2. Navigate to Payroll Runs
    await page.goto("/payroll-runs");
    await expect(
      page.getByRole("region", { name: "Payroll runs" }),
    ).toBeVisible();

    // Select the run
    await page.getByRole("button", { name: /Sep 30, 2026/ }).click();
    await expect(
      page.getByRole("region", { name: "Run details" }),
    ).toBeVisible();

    // Verify PDF actions toolbar is present
    await expect(page.getByText("PDF Documents:")).toBeVisible();
    const generateBtn = page.getByRole("button", { name: "Generate All PDFs" });
    const downloadZipBtn = page.getByRole("button", {
      name: "Download All (ZIP)",
    });
    await expect(generateBtn).toBeVisible();
    await expect(downloadZipBtn).toBeVisible();

    // 3. Click Generate All PDFs and verify confirmation feedback
    await generateBtn.click();
    await expect(
      page.getByText("Successfully generated 2 of 2 payslip PDFs."),
    ).toBeVisible();
    await expect.poll(() => recordedCalls).toContain("payroll.generateRunPdfs");

    // 4. Click Download All (ZIP)
    await downloadZipBtn.click();
    await expect.poll(() => recordedCalls).toContain("payroll.downloadRunZip");

    // 5. Select individual payslip
    await page.getByRole("button", { name: /Maria Santos/ }).click();
    await expect(page.getByText("Payslip · Maria Santos")).toBeVisible();

    // Verify single payslip PDF download button
    const downloadPdfBtn = page.getByRole("button", {
      name: "Download Payslip PDF",
    });
    await expect(downloadPdfBtn).toBeVisible();
    await downloadPdfBtn.click();
    await expect.poll(() => recordedCalls).toContain("payroll.downloadPayslip");
  });

  test("employee can view payslip details and download official PDF", async ({
    page,
  }) => {
    let signedIn = false;
    const recordedCalls: string[] = [];

    await page.route("**/trpc/**", async (route) => {
      const paths = (
        new URL(route.request().url()).pathname.split("/trpc/")[1] ?? ""
      ).split(",");

      const results = paths.map((path) => {
        if (path === "auth.login") {
          signedIn = true;
          return { result: { data: { json: { user: employeeUser } } } };
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

        recordedCalls.push(path);

        if (path === "auth.me") {
          return { result: { data: { json: employeeUser } } };
        }
        if (path === "employees.getMyProfile") {
          return { result: { data: { json: employeeProfile } } };
        }
        if (path === "leaves.listRequests") {
          return { result: { data: { json: [] } } };
        }
        if (path === "payroll.getMyPayslips") {
          return {
            result: {
              data: {
                json: [
                  {
                    id: "slip-pdf-001",
                    basicPayCents: 2500000,
                    paidLeavePayCents: 0,
                    overtimePayCents: 0,
                    nightDiffPayCents: 0,
                    holidayPayCents: 0,
                    restDayPayCents: 0,
                    taxableAllowancesCents: 0,
                    nonTaxableAllowancesCents: 0,
                    bonusPaidCents: 0,
                    grossPayCents: 2500000,
                    tardinessDeductionCents: 0,
                    undertimeDeductionCents: 0,
                    absenceDeductionCents: 0,
                    sssEmployeeCents: 90000,
                    sssWispEmployeeCents: 22500,
                    philhealthEmployeeCents: 50000,
                    pagibigEmployeeCents: 20000,
                    withholdingTaxCents: 150000,
                    loanDeductionsCents: 0,
                    otherDeductionsCents: 0,
                    totalDeductionsCents: 310000,
                    netPayCents: 2190000,
                    payrollRun: {
                      paymentDate: "2026-09-30T00:00:00.000Z",
                      cutoffStartDate: "2026-09-16T00:00:00.000Z",
                      cutoffEndDate: "2026-09-30T00:00:00.000Z",
                      cutoffSequence: "SECOND_CUTOFF",
                      status: "DISBURSED",
                    },
                  },
                ],
              },
            },
          };
        }
        if (path === "payroll.downloadPayslip") {
          return {
            result: {
              data: {
                json: {
                  fileName: "payslip-EMP-2026-001.pdf",
                  dataBase64: dummyBase64Pdf,
                },
              },
            },
          };
        }
        return { result: { data: { json: null } } };
      });

      await route.fulfill({
        status: !signedIn && paths.includes("auth.me") ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify(paths.length === 1 ? results[0] : results),
      });
    });

    // 1. Log in as employee
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(employeeUser.email);
    await page.getByLabel("Password", { exact: true }).fill("password");
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await expect(page.getByText(employeeUser.name).first()).toBeVisible();

    // 2. Go to My Profile
    await page.goto("/profile");
    await expect(
      page.getByRole("region", { name: "My Profile" }),
    ).toBeVisible();

    // Check My Payslips section
    await expect(page.getByText("My Payslips")).toBeVisible();
    await expect(page.getByText("SECOND CUTOFF")).toBeVisible();

    // 3. Open payslip details modal
    await page.getByRole("button", { name: "View Details" }).click();
    const modal = page.getByRole("dialog", { name: "Payslip detail" });
    await expect(modal).toBeVisible();

    // Check encryption password notice
    await expect(
      modal.getByText(
        /Note: Payslip PDF is encrypted\. Use your Date of Birth/,
      ),
    ).toBeVisible();

    // Click "Download Official PDF" button in modal
    const downloadOfficialBtn = modal.getByRole("button", {
      name: "Download Official PDF",
    });
    await expect(downloadOfficialBtn).toBeVisible();
    await downloadOfficialBtn.click();
    await expect.poll(() => recordedCalls).toContain("payroll.downloadPayslip");

    // Close modal
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    await expect(modal).toHaveCount(0);

    // 4. Quick download button directly on the row
    const quickDownloadBtn = page.getByRole("button", {
      name: "Download PDF for SECOND_CUTOFF",
    });
    await expect(quickDownloadBtn).toBeVisible();
    await quickDownloadBtn.click();
    await expect
      .poll(
        () =>
          recordedCalls.filter((c) => c === "payroll.downloadPayslip").length,
      )
      .toBe(2);
  });
});
