import { expect, type Page, test } from "@playwright/test";

const sampleEmployee = {
  id: "emp-1",
  firstName: "Maria",
  lastName: "Santos",
  employeeNumber: "EMP-001",
  employmentStatus: "ACTIVE",
  department: { name: "Engineering" },
};

const sampleLoans = [
  {
    id: "loan-1",
    employeeId: "emp-1",
    employee: sampleEmployee,
    loanType: "SSS_SALARY_LOAN",
    referenceNumber: "SSS-2026-001",
    principalCents: 3000000, // ₱30,000.00
    totalAmountCents: 3000000,
    amortizationCents: 125000, // ₱1,250.00
    balanceCents: 2250000, // ₱22,500.00
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2027-01-01T00:00:00.000Z",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    payments: [
      {
        id: "pay-1",
        loanId: "loan-1",
        amountPaidCents: 375000,
        balanceAfterCents: 2625000,
        paymentDate: "2026-02-15T00:00:00.000Z",
        payslip: {
          id: "ps-1",
          payrollRun: {
            id: "run-1",
            cutoffStartDate: "2026-02-01T00:00:00.000Z",
            cutoffEndDate: "2026-02-15T00:00:00.000Z",
            cutoffSequence: "FIRST_CUTOFF",
          },
        },
      },
      {
        id: "pay-2",
        loanId: "loan-1",
        amountPaidCents: 375000,
        balanceAfterCents: 2250000,
        paymentDate: "2026-02-28T00:00:00.000Z",
        payslip: {
          id: "ps-2",
          payrollRun: {
            id: "run-2",
            cutoffStartDate: "2026-02-16T00:00:00.000Z",
            cutoffEndDate: "2026-02-28T00:00:00.000Z",
            cutoffSequence: "SECOND_CUTOFF",
          },
        },
      },
    ],
    _count: { payments: 2 },
  },
];

function apiError(code: string, message: string) {
  return {
    error: { json: { message, code: -32000, data: { code, httpStatus: 400 } } },
  };
}

async function mockLoansPortal(
  page: Page,
  options: {
    role?: string;
    employeeId?: string;
    initialLoans?: typeof sampleLoans;
  } = {},
) {
  let signedIn = false;
  const loans = [...(options.initialLoans ?? sampleLoans)];

  const user = {
    id: options.employeeId ? "user-emp-1" : "user-staff-1",
    organizationId: "org-1",
    name: options.employeeId ? "Maria Santos" : "HR Specialist",
    email: options.employeeId
      ? "maria.santos@example.com"
      : "staff@example.com",
    role: options.role ?? "PAYROLL_SPECIALIST",
    employeeId: options.employeeId,
  };

  await page.route("**/trpc/**", async (route) => {
    const request = route.request();
    const paths = (
      new URL(request.url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");

    const results = paths.map((path) => {
      if (path === "auth.login") {
        signedIn = true;
        return { result: { data: { json: { user } } } };
      }
      if (path === "auth.logout") {
        signedIn = false;
        return { result: { data: { json: { success: true } } } };
      }
      if (!signedIn) return apiError("UNAUTHORIZED", "Unauthorized");

      if (path === "auth.me") {
        return { result: { data: { json: user } } };
      }

      if (path === "dashboard.getOverview") {
        return {
          result: {
            data: {
              json: {
                employees: { total: 1, active: 1, onLeave: 0 },
                attendance: {
                  presentToday: 1,
                  missingTimeOut: 0,
                  pendingReview: 0,
                },
                leaves: { pendingCount: 0 },
                loans: {
                  activeCount: loans.filter((l) => l.isActive).length,
                  totalOutstandingCents: loans.reduce(
                    (acc, l) => acc + (l.isActive ? l.balanceCents : 0),
                    0,
                  ),
                },
                payroll: { latestDisbursedRun: null, recentRuns: [] },
                audit: [],
              },
            },
          },
        };
      }

      if (path === "loans.getSummary") {
        const active = loans.filter((l) => l.isActive);
        return {
          result: {
            data: {
              json: {
                activeCount: active.length,
                totalCount: loans.length,
                totalBalanceCents: active.reduce(
                  (acc, l) => acc + l.balanceCents,
                  0,
                ),
                totalPrincipalCents: active.reduce(
                  (acc, l) => acc + l.principalCents,
                  0,
                ),
                totalAmortizationPerCutoffCents: active.reduce(
                  (acc, l) => acc + l.amortizationCents,
                  0,
                ),
              },
            },
          },
        };
      }

      if (path === "loans.list") {
        return { result: { data: { json: loans } } };
      }

      if (path === "loans.getById") {
        return { result: { data: { json: loans[0] } } };
      }

      if (path === "loans.getMyLoans") {
        const myLoans = loans.filter((l) => l.employeeId === user.employeeId);
        return { result: { data: { json: myLoans } } };
      }

      if (path === "employees.list") {
        return { result: { data: { json: [sampleEmployee] } } };
      }

      if (path === "employees.getMyProfile") {
        return {
          result: {
            data: {
              json: {
                id: "emp-1",
                firstName: "Maria",
                lastName: "Santos",
                employeeNumber: "EMP-001",
                department: { name: "Engineering" },
                branch: { name: "Head Office" },
                compensation: { monthlyBasicRateCents: 5000000 },
                allowances: [],
                dateOfBirth: "1995-05-15T00:00:00.000Z",
                tin: "123-456-789",
                sssNo: "12-3456789-0",
                philhealthNo: "12-345678901-2",
                pagibigNo: "1234-5678-9012",
                bankName: "BDO",
                bankAccountNumber: "1234567890",
                bankAccountName: "Maria Santos",
                role: "EMPLOYEE",
                employmentStatus: "ACTIVE",
                employmentType: "REGULAR",
              },
            },
          },
        };
      }

      if (path === "payroll.getMyPayslips") {
        return { result: { data: { json: [] } } };
      }

      if (path === "leaves.listRequests") {
        return { result: { data: { json: [] } } };
      }

      if (path === "loans.create") {
        const newLoan = {
          id: "loan-new-2",
          employeeId: sampleEmployee.id,
          employee: sampleEmployee,
          loanType: "COMPANY_CASH_ADVANCE",
          referenceNumber: "CA-2026-999",
          principalCents: 1000000,
          totalAmountCents: 1000000,
          amortizationCents: 50000,
          balanceCents: 1000000,
          startDate: "2026-03-01T00:00:00.000Z",
          endDate: "2027-03-01T00:00:00.000Z",
          isActive: true,
          createdAt: "2026-03-01T00:00:00.000Z",
          payments: [],
          _count: { payments: 0 },
        };
        loans.push(newLoan);
        return { result: { data: { json: newLoan } } };
      }

      if (path === "loans.recordPayment") {
        const loan = loans[0];
        if (!loan) throw new Error("No loan found");
        loan.balanceCents = 1750000;
        return {
          result: {
            data: {
              json: {
                loan,
                payment: {
                  id: "pay-manual-1",
                  loanId: loan.id,
                  amountPaidCents: 500000,
                  balanceAfterCents: 1750000,
                },
              },
            },
          },
        };
      }

      if (path === "loans.deactivate") {
        const loan = loans[0];
        if (loan) loan.isActive = false;
        return { result: { data: { json: loan ?? null } } };
      }

      const json =
        path === "employees.list" || path === "payroll.listRuns" ? [] : null;
      return { result: { data: { json } } };
    });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(paths.length === 1 ? results[0] : results),
    });
  });

  // Login flow
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText("Signed in as")).toBeVisible();
}

test.describe("Loans & Amortization Management", () => {
  test("displays KPI metrics and loans list for staff", async ({ page }) => {
    await mockLoansPortal(page, { role: "PAYROLL_SPECIALIST" });

    // Navigate to /loans
    await page.goto("/loans");

    // Verify header
    await expect(
      page.getByRole("heading", { name: "Loans & Advances" }),
    ).toBeVisible();

    // Verify KPI summary cards
    await expect(page.getByText("Active Loans").first()).toBeVisible();
    await expect(page.getByText("Outstanding Balance")).toBeVisible();
    await expect(page.getByText("Total Principal")).toBeVisible();
    await expect(page.getByText("Amortization / Cutoff")).toBeVisible();

    // Verify loan record in table
    await expect(page.getByText("Maria Santos")).toBeVisible();
    await expect(page.getByText("SSS Salary Loan")).toBeVisible();
    await expect(page.getByText("Ref: SSS-2026-001")).toBeVisible();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
  });

  test("dashboard 'Active Loans' card links directly to /loans", async ({
    page,
  }) => {
    await mockLoansPortal(page, { role: "PAYROLL_SPECIALIST" });
    await page.goto("/overview");

    // On overview page
    const loansCardLink = page.getByRole("link", {
      name: /Manage loans & advances/i,
    });
    await expect(loansCardLink).toBeVisible();
    await loansCardLink.click();
    await expect(page).toHaveURL(/\/loans/);
  });

  test("opens Create Loan modal, previews schedule, and cancels", async ({
    page,
  }) => {
    await mockLoansPortal(page, { role: "PAYROLL_SPECIALIST" });
    await page.goto("/loans");

    // Click "Create Loan"
    await page.getByRole("button", { name: "Create Loan" }).click();

    // Verify modal is open
    await expect(
      page.getByRole("heading", { name: "Enroll New Employee Loan" }),
    ).toBeVisible();

    // Fill principal and amortization to trigger preview
    await page.locator("#create-principal").fill("30000");
    await page.locator("#create-amortization").fill("1500");

    // Schedule preview should appear
    await expect(page.getByText("Amortization Schedule Preview")).toBeVisible();
    await expect(page.getByText(/20 cutoffs/)).toBeVisible();

    // Close modal
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("heading", { name: "Enroll New Employee Loan" }),
    ).not.toBeVisible();
  });

  test("opens Loan Details & Ledger modal with payment history", async ({
    page,
  }) => {
    await mockLoansPortal(page, { role: "PAYROLL_SPECIALIST" });
    await page.goto("/loans");

    // Click "Ledger"
    await page.getByRole("button", { name: "Ledger" }).first().click();

    // Verify modal
    await expect(
      page.getByRole("heading", { name: "Loan Details & Payment Ledger" }),
    ).toBeVisible();
    await expect(page.getByText("Payment History (2)")).toBeVisible();
    await expect(page.getByText(/Payroll Run/i).first()).toBeVisible();

    // Close ledger modal
    await page.getByLabel("Close").click();
  });

  test("records direct settlement payment outside payroll", async ({
    page,
  }) => {
    await mockLoansPortal(page, { role: "PAYROLL_SPECIALIST" });
    await page.goto("/loans");

    // Click "Pay" quick action
    await page.getByRole("button", { name: "Pay" }).first().click();

    // Verify Record Direct Payment modal
    await expect(
      page.getByRole("heading", { name: "Record Direct Payment" }),
    ).toBeVisible();

    // Fill payment amount
    await page.locator("#payment-amount").fill("5000");
    await expect(page.getByText("Balance After Payment:")).toBeVisible();

    // Close payment modal
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("heading", { name: "Record Direct Payment" }),
    ).not.toBeVisible();
  });

  test("employee sees My Loans & Cash Advances in My Profile", async ({
    page,
  }) => {
    await mockLoansPortal(page, {
      role: "EMPLOYEE",
      employeeId: "emp-1",
    });

    // Employee navigates to My Profile
    await page.goto("/profile");

    // Verify "My Loans & Cash Advances" section
    await expect(page.getByText("My Loans & Cash Advances")).toBeVisible();
    await expect(page.getByText("SSS Salary Loan")).toBeVisible();
    await expect(page.getByText("Remaining Balance")).toBeVisible();
    await expect(page.getByText("Amortization / Cutoff")).toBeVisible();

    // Toggle Payment History
    const historyBtn = page.getByRole("button", {
      name: /View Payment History/i,
    });
    await expect(historyBtn).toBeVisible();
    await historyBtn.click();
    await expect(page.getByText("Hide Payment History")).toBeVisible();
  });

  test("employee is restricted from accessing staff /loans", async ({
    page,
  }) => {
    await mockLoansPortal(page, {
      role: "EMPLOYEE",
      employeeId: "emp-1",
    });

    // Navigate to /loans directly
    await page.goto("/loans");

    // Should display access restricted card
    await expect(
      page.getByRole("region", { name: "Access restricted" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Your role \(EMPLOYEE\) does not have permission to access/i,
      ),
    ).toBeVisible();
  });
});
