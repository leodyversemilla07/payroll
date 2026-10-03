import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { prisma } from "@workspace/db";
import { hashPassword } from "../../api/src/auth/password";

// No request interception or mocked services: UI -> HTTP tRPC -> PostgreSQL.
// Only organization setup and staff accounts are provisioned outside the UI.
test("real portal persists onboarding, attendance, leave and maker-checker payroll", async ({
  page,
}) => {
  const tag = randomUUID();
  const password = `Browser-test-${randomUUID()}!`;
  const adminEmail = `hr-${tag}@test.invalid`;
  const makerEmail = `payroll-${tag}@test.invalid`;
  const employeeEmail = `employee-${tag}@test.invalid`;
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const organization = await prisma.organization.create({
    data: {
      name: `Synthetic browser test ${tag}`,
      tin: "123456789",
      rdoCode: "047",
      registeredAddress: "Synthetic test address",
    },
  });

  try {
    const branch = await prisma.branch.create({
      data: {
        organizationId: organization.id,
        name: "Test office",
        code: "TEST",
        address: "Synthetic test address",
      },
    });
    const department = await prisma.department.create({
      data: {
        organizationId: organization.id,
        name: "Test operations",
        code: "TEST",
      },
    });
    const passwordHash = await hashPassword(password);
    const admin = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email: adminEmail,
        name: "Test HR checker",
        passwordHash,
        role: "HR_ADMIN",
      },
    });
    const maker = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email: makerEmail,
        name: "Test payroll maker",
        passwordHash,
        role: "PAYROLL_SPECIALIST",
      },
    });
    const reviewerEmail = `reviewer-${tag}@test.invalid`;
    const reviewer = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email: reviewerEmail,
        name: "Second test HR reviewer",
        passwordHash,
        role: "HR_ADMIN",
      },
    });
    async function login(email: string) {
      await page.goto("/");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Login", exact: true }).click();
      await expect(page.getByText("Signed in as")).toBeVisible();
      const cookies = await page.context().cookies("http://localhost:4000");
      expect(
        cookies.find(
          (cookie) => cookie.name === "payroll_live_browser_session",
        ),
      ).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    }
    async function logout() {
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Login to your account" }),
      ).toBeVisible();
    }
    await login(adminEmail);
    await navigate(page, "Employees");
    await page.getByRole("button", { name: "Add employee" }).click();
    const form = page.getByRole("region", {
      name: "Create employee",
      exact: true,
    });
    const values = {
      "First name": "Synthetic",
      "Last name": "Employee",
      "Employee email": employeeEmail,
      "Contact number": "09170000000",
      "Residential address": "Synthetic test address",
      "Date of birth": "1995-01-01",
      Gender: "Other",
      "Civil status": "Single",
      "Hire date": "2026-01-01",
      "Monthly basic rate (PHP)": "30000.00",
      TIN: "123-456-789-000",
      "SSS number": "12-3456789-0",
      "PhilHealth number": "12-345678901-2",
      "Pag-IBIG number": "1234-5678-9012",
      "Bank name": "Synthetic Bank (no transfers)",
      "Bank account number": "1234567890",
      "Bank account name": "Synthetic Employee",
    };
    for (const [label, value] of Object.entries(values))
      await form.getByLabel(label, { exact: true }).fill(value);
    await form.getByLabel("Branch", { exact: true }).selectOption(branch.id);
    await form
      .getByLabel("Department", { exact: true })
      .selectOption(department.id);
    await form.getByLabel("Employment type").selectOption("REGULAR");
    await form
      .getByRole("button", { name: "Create employee", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Employee details", exact: true }),
    ).toContainText("₱30,000.00");
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { email: employeeEmail },
      include: { compensation: true },
    });
    expect(employee.organizationId).toBe(organization.id);
    expect(employee.compensation?.basicRateMonthlyCents).toBe(3000000n);

    await navigate(page, "Attendance & DTR");
    const attendance = page.getByRole("region", {
      name: "Attendance and DTR",
      exact: true,
    });
    await attendance.getByLabel("DTR employee").selectOption(employee.id);
    await attendance.getByLabel("DTR start date").fill("2026-09-01");
    await attendance.getByLabel("DTR end date").fill("2026-09-15");
    await attendance.getByRole("button", { name: "Load DTR" }).click();
    await expect(attendance).toContainText("No DTR records");
    // Explicit, synthetic standard weekdays; this is not a validated shift calendar.
    const dates = ["01", "02", "03", "04", "07", "08", "09", "10", "11", "14"];
    async function addApprovedDtr(date: string) {
      const halfDay = date === "2026-09-10";
      await attendance
        .getByRole("button", { name: "Add attendance record", exact: true })
        .click();
      const editor = page.getByRole("region", {
        name: "Attendance correction",
        exact: true,
      });
      await editor.getByLabel("Attendance date").fill(date);
      await editor.getByLabel("Day type").selectOption("REGULAR_WORKDAY");
      await editor.getByLabel("Time in (Asia/Manila)").fill(`${date}T09:00`);
      await editor
        .getByLabel("Time out (Asia/Manila)")
        .fill(`${date}T${halfDay ? "13:00" : "18:00"}`);
      await editor
        .getByLabel("Total worked minutes (including overtime)")
        .fill(halfDay ? "240" : "480");
      await editor.getByLabel("Undertime minutes").fill(halfDay ? "240" : "0");
      await editor
        .getByLabel("Correction reason")
        .fill(
          "Synthetic browser test attendance, not an actual employee shift",
        );
      await editor
        .getByRole("checkbox", { name: "Approve for payroll" })
        .check();
      await editor
        .getByRole("button", { name: "Save attendance", exact: true })
        .click();
      await expect(editor).toHaveCount(0);
      await expect(
        attendance
          .getByRole("status")
          .filter({ hasText: `Attendance for ${date} saved` }),
      ).toBeVisible();
    }
    // Deliberately omit the final weekday until payroll rejects the sparse cutoff.
    for (const day of dates) await addApprovedDtr(`2026-09-${day}`);
    const records = await prisma.dailyTimeRecord.findMany({
      where: { employeeId: employee.id },
    });
    expect(records).toHaveLength(10);
    expect(
      records.every(
        (row) =>
          row.isApproved &&
          row.actualWorkedMinutes ===
            (row.date.toISOString().startsWith("2026-09-10") ? 240 : 480),
      ),
    ).toBe(true);
    expect(
      records
        .find((row) => row.date.toISOString().startsWith("2026-09-01"))
        ?.timeIn?.toISOString(),
    ).toBe("2026-09-01T01:00:00.000Z");

    await navigate(page, "Leave management");
    const leave = page.getByRole("region", {
      name: "Leave management",
      exact: true,
    });
    await leave
      .getByLabel("Leave employee", { exact: true })
      .selectOption(employee.id);
    await leave.getByLabel("Leave year").fill("2026");
    await leave
      .getByRole("button", { name: "Load leave records", exact: true })
      .click();
    await leave
      .getByRole("button", { name: "Allocate leave credits", exact: true })
      .click();
    const credit = page.getByRole("region", {
      name: "Leave credit editor",
      exact: true,
    });
    await credit.getByLabel("Credit leave type").fill("VACATION");
    await credit.getByLabel("Total credited days").fill("5");
    await credit
      .getByLabel("Credit source reference")
      .fill("SYNTHETIC-BROWSER-POLICY");
    await credit
      .getByLabel("Credit adjustment reason")
      .fill("Synthetic test allocation only, not verified legal entitlement");
    await credit
      .getByRole("button", { name: "Record leave credits", exact: true })
      .click();
    await expect(
      leave.getByText("Leave credits recorded. Used credits were not reset."),
    ).toBeVisible();
    await leave
      .getByRole("button", { name: "New leave request", exact: true })
      .click();
    const request = page.getByRole("region", {
      name: "File leave request",
      exact: true,
    });
    await request.getByLabel("Pay treatment").selectOption("PAID");
    await request
      .getByLabel("Leave type", { exact: true })
      .selectOption("VACATION");
    await request.getByLabel("Leave start date").fill("2026-09-10");
    await request.getByLabel("Leave end date").fill("2026-09-10");
    await request
      .getByRole("checkbox", { name: "One half-day within this request" })
      .check();
    await request.getByLabel("Half-day date").fill("2026-09-10");
    await request
      .getByLabel("Leave reason", { exact: true })
      .fill("Synthetic browser test leave request");
    await request
      .getByRole("button", { name: "File leave request", exact: true })
      .click();
    await expect(request).toHaveCount(0);
    await leave
      .getByRole("button", { name: "Review approval", exact: true })
      .click();
    await page
      .getByRole("region", { name: "Leave decision", exact: true })
      .getByRole("button", { name: "Confirm approval", exact: true })
      .click();
    await expect(
      leave.getByText("Leave request recorded as APPROVED."),
    ).toBeVisible();
    const balance = await prisma.leaveBalance.findFirstOrThrow({
      where: { employeeId: employee.id, year: 2026, leaveType: "VACATION" },
    });
    expect(balance.usedCredits.toString()).toBe("0.5");
    expect(balance.balance.toString()).toBe("4.5");
    await logout();

    await login(makerEmail);
    await navigate(page, "Process payroll");
    const process = page.getByRole("region", {
      name: "Process payroll run",
      exact: true,
    });
    await process
      .getByLabel("Cutoff", { exact: true })
      .selectOption("FIRST_CUTOFF");
    await process.getByLabel("Regular run cutoff start").fill("2026-09-01");
    await process.getByLabel("Regular run cutoff end").fill("2026-09-15");
    await process.getByLabel("Regular run payment date").fill("2026-09-16");
    await process
      .getByRole("button", { name: "Process regular run", exact: true })
      .click();
    await expect(process.getByRole("alert")).toContainText(
      "1 missing date(s) (2026-09-15)",
    );
    expect(
      await prisma.payrollRun.count({
        where: { organizationId: organization.id },
      }),
    ).toBe(0);
    expect(
      await prisma.payslip.count({ where: { employeeId: employee.id } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { organizationId: organization.id, entityType: "PayrollRun" },
      }),
    ).toBe(0);

    await logout();
    await login(adminEmail);
    await navigate(page, "Attendance & DTR");
    await attendance.getByLabel("DTR employee").selectOption(employee.id);
    await attendance.getByLabel("DTR start date").fill("2026-09-01");
    await attendance.getByLabel("DTR end date").fill("2026-09-15");
    await attendance.getByRole("button", { name: "Load DTR" }).click();
    await addApprovedDtr("2026-09-15");
    expect(
      await prisma.dailyTimeRecord.count({
        where: { employeeId: employee.id },
      }),
    ).toBe(11);
    await logout();
    await login(makerEmail);
    await navigate(page, "Process payroll");
    await process
      .getByLabel("Cutoff", { exact: true })
      .selectOption("FIRST_CUTOFF");
    await process.getByLabel("Regular run cutoff start").fill("2026-09-01");
    await process.getByLabel("Regular run cutoff end").fill("2026-09-15");
    await process.getByLabel("Regular run payment date").fill("2026-09-16");
    await process
      .getByRole("button", { name: "Process regular run", exact: true })
      .click();
    await expect(process.getByText("Run processed.")).toBeVisible();
    const run = await prisma.payrollRun.findFirstOrThrow({
      where: { organizationId: organization.id },
      include: { payslips: true },
    });
    expect(run.status).toBe("AUDITED");
    expect(run.processedById).toBe(maker.id);
    expect(run.payslips).toHaveLength(1);
    expect(run.payslips[0]?.basicPayCents).toBe(1500000n);
    expect(run.payslips[0]?.undertimeDeductionCents).toBe(0n);
    expect(
      (
        await prisma.dailyTimeRecord.findUniqueOrThrow({
          where: {
            employeeId_date: {
              employeeId: employee.id,
              date: new Date("2026-09-10"),
            },
          },
        })
      ).undertimeMinutes,
    ).toBe(240);
    expect(run.totalGrossCents - run.totalDeductionsCents).toBe(
      run.totalNetCents,
    );
    await openRun(page);
    await page
      .getByRole("region", { name: "Run details", exact: true })
      .getByRole("button", { name: /Synthetic Employee/ })
      .click();
    await expect(
      page.getByRole("article", { name: "Payslip detail" }),
    ).toContainText("₱15,000.00");
    await logout();

    await login(adminEmail);
    await openRun(page);
    const details = page.getByRole("region", {
      name: "Run details",
      exact: true,
    });
    await details
      .getByRole("button", { name: "Approve run", exact: true })
      .click();
    await expect(details.getByText("Run approved.")).toBeVisible();
    const approved = await prisma.payrollRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(approved.approvedById).toBe(admin.id);
    expect(approved.approvedById).not.toBe(approved.processedById);
    // This marks synthetic status only: it does not send a bank payment.
    await details
      .getByRole("button", { name: "Disburse run", exact: true })
      .click();
    await expect(details.getByText("Run disbursed.")).toBeVisible();
    await page.reload();
    await openRun(page);
    await expect(details).toContainText("DISBURSED");
    expect(
      (await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } }))
        .status,
    ).toBe("DISBURSED");
    const audits = await prisma.auditLog.findMany({
      where: { organizationId: organization.id, entityId: run.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((row) => row.action)).toEqual([
      "CREATE",
      "APPROVE",
      "UPDATE",
    ]);
    await navigate(page, "Year-end tax");
    const yearEnd = page.getByRole("region", {
      name: "Year-end tax",
      exact: true,
    });
    await yearEnd
      .getByLabel("Employee", { exact: true })
      .selectOption(employee.id);
    await yearEnd
      .getByLabel("Source reference", { exact: true })
      .fill("Synthetic signed declaration v1");
    await yearEnd
      .getByRole("button", { name: "Record declaration", exact: true })
      .click();
    await expect(yearEnd.getByText("Declaration recorded.")).toBeVisible();
    await yearEnd
      .getByRole("button", { name: "Correct declaration", exact: true })
      .click();
    await yearEnd
      .getByLabel("Source reference", { exact: true })
      .nth(1)
      .fill("Synthetic reviewed declaration v2");
    await yearEnd
      .getByLabel(/Correction reason/)
      .fill(
        "Synthetic browser test correction with independently signed-in review",
      );
    await expect(yearEnd.getByLabel(/Reviewer user ID/)).toHaveCount(0);
    await yearEnd
      .getByRole("button", { name: "Request correction", exact: true })
      .click();
    await expect(
      yearEnd.getByText(
        "Correction requested; awaiting a different signed-in HR/admin.",
      ),
    ).toBeVisible();
    const pending = await prisma.taxEvidenceCorrection.findFirstOrThrow({
      where: { organizationId: organization.id, status: "PENDING" },
    });
    expect(
      await prisma.priorEmployerDeclaration.count({
        where: { employeeId: employee.id },
      }),
    ).toBe(1);
    const reviewQueue = page.getByRole("region", {
      name: "Tax correction review",
      exact: true,
    });
    await expect(
      reviewQueue.getByText(
        "You requested this correction. A different HR/admin must review it.",
      ),
    ).toBeVisible();
    await expect(
      reviewQueue.getByRole("button", { name: "Approve correction" }),
    ).toHaveCount(0);
    await logout();
    await login(reviewerEmail);
    await navigate(page, "Year-end tax");
    await reviewQueue
      .getByText("Compare recorded evidence and proposed values")
      .click();
    await expect(
      reviewQueue.getByText("Synthetic reviewed declaration v2", {
        exact: false,
      }),
    ).toBeVisible();
    await reviewQueue
      .getByLabel(/Review reason/)
      .fill("Synthetic second HR checked the corrected declaration source");
    await reviewQueue
      .getByRole("button", { name: "Approve correction", exact: true })
      .click();
    await expect(
      reviewQueue.getByText(
        "Correction approved and new evidence version published.",
      ),
    ).toBeVisible();
    expect(
      await prisma.taxEvidenceCorrection.findUnique({
        where: { id: pending.id },
      }),
    ).toMatchObject({
      status: "APPROVED",
      requestedById: admin.id,
      reviewedById: reviewer.id,
    });
    expect(
      await prisma.priorEmployerDeclaration.findFirst({
        where: { employeeId: employee.id },
        orderBy: { version: "desc" },
      }),
    ).toMatchObject({
      version: 2,
      recordedById: admin.id,
      reviewedById: reviewer.id,
    });
    await logout();
    expect(failures).toEqual([]);
  } finally {
    // Delete only this test's UUID-scoped tenant, never seed/reset other data.
    await prisma.payslip.deleteMany({
      where: { payrollRun: { organizationId: organization.id } },
    });
    await prisma.payrollRun.deleteMany({
      where: { organizationId: organization.id },
    });
    const declarations = await prisma.priorEmployerDeclaration.findMany({
      where: { organizationId: organization.id },
      orderBy: { version: "desc" },
    });
    for (const declaration of declarations)
      await prisma.priorEmployerDeclaration.delete({
        where: { id: declaration.id },
      });
    await prisma.employee.deleteMany({
      where: { organizationId: organization.id },
    });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
});

async function openRun(page: Page) {
  await navigate(page, "Payroll runs & payslips");
  await page
    .getByRole("region", { name: "Payroll runs", exact: true })
    .getByRole("button")
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "Run details", exact: true }),
  ).toBeVisible();
}

async function navigate(page: Page, label: string) {
  await page
    .getByRole("navigation", { name: "Payroll navigation" })
    .getByRole("link", { name: label, exact: true })
    .click();
}
