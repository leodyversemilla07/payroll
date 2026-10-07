import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@workspace/db";
import { hashPassword } from "../../api/src/auth/password";

// Actual HTTP cookies, two tenants and a blocked SQL read; no intercepted responses.
test("a shared-cookie account switch cannot expose the former tenant's cached employees", async ({
  page,
  context,
}) => {
  const organizations: string[] = [];
  const password = `Synthetic-${randomUUID()}!`;
  const passwordHash = await hashPassword(password);
  let release = () => {};
  let lock: Promise<unknown> | undefined;
  try {
    async function fixture(label: string) {
      const org = await prisma.organization.create({
        data: {
          name: `Synthetic ${label} ${randomUUID()}`,
          tin: "123456789",
          rdoCode: "047",
          registeredAddress: "Synthetic",
        },
      });
      organizations.push(org.id);
      const branch = await prisma.branch.create({
        data: {
          organizationId: org.id,
          name: "Test office",
          code: "TEST",
          address: "Synthetic",
        },
      });
      const department = await prisma.department.create({
        data: { organizationId: org.id, name: "Test", code: "TEST" },
      });
      const user = await prisma.user.create({
        data: {
          organizationId: org.id,
          name: `${label} Session User`,
          email: `${randomUUID()}@test.invalid`,
          role: "HR_ADMIN",
          passwordHash,
        },
      });
      await prisma.employee.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          departmentId: department.id,
          employeeNumber: `SYN-${randomUUID()}`,
          firstName: label,
          lastName: "Private Employee",
          email: `${randomUUID()}@test.invalid`,
          gender: "Other",
          civilStatus: "Single",
          dateOfBirth: new Date("1995-01-01"),
          contactNumber: "Synthetic",
          residentialAddress: "Synthetic",
          tin: "123456789",
          sssNo: "1234567890",
          philhealthNo: "123456789012",
          pagibigNo: "123456789012",
          hireDate: new Date("2026-01-01"),
          bankName: "Synthetic",
          bankAccountNumber: "1234567890",
          bankAccountName: `${label} Synthetic`,
        },
      });
      return user;
    }
    const alpha = await fixture("Alpha");
    const beta = await fixture("Beta");
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(alpha.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Payroll navigation" })
      .getByRole("link", { name: "Employees", exact: true })
      .click();
    await expect(
      page.getByText("Alpha Private Employee", { exact: true }),
    ).toBeVisible();
    const other = await context.newPage();
    await other.goto("/portal");
    await other.getByRole("button", { name: /^Account:/ }).click();
    await other.getByRole("menuitem", { name: "Log out" }).click();
    await other.getByLabel("Email", { exact: true }).fill(beta.email);
    await other.getByLabel("Password", { exact: true }).fill(password);
    await other.getByRole("button", { name: "Login", exact: true }).click();
    await expect(other.getByText("Signed in as")).toContainText(
      "Beta Session User",
    );

    // The browser now sends Beta's shared cookie, but a stale Alpha client
    // must not execute a mutation as Beta. Metadata is a freshness hint only.
    const rejected = await page.evaluate(
      async ({ alphaId, org }) => {
        const response = await fetch(
          "http://localhost:4000/trpc/payroll.triggerRun?batch=1",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "x-payroll-principal": JSON.stringify([
                alphaId,
                org,
                "HR_ADMIN",
                null,
              ]),
            },
            body: JSON.stringify({
              "0": {
                json: {
                  cutoffSequence: "FIRST_CUTOFF",
                  cutoffStartDate: "2026-09-01",
                  cutoffEndDate: "2026-09-15",
                  paymentDate: "2026-09-15",
                },
              },
            }),
          },
        );
        return { status: response.status, body: await response.json() };
      },
      { alphaId: alpha.id, org: alpha.organizationId },
    );
    expect(rejected.status).toBe(401);
    expect(rejected.body[0].error.json.data.code).toBe("UNAUTHORIZED");
    expect(rejected.body[0].error.json.message).toContain("Session changed");
    expect(
      await prisma.payrollRun.count({
        where: { organizationId: { in: organizations } },
      }),
    ).toBe(0);

    let acquired!: () => void;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    lock = prisma.$transaction(
      async (tx) => {
        // Only the explicitly opted-in disposable database is ever used here.
        await tx.$executeRaw`LOCK TABLE "Employee" IN ACCESS EXCLUSIVE MODE`;
        acquired();
        await held;
      },
      { timeout: 30_000 },
    );
    await Promise.race([ready, lock]);
    await page.bringToFront();
    await page.evaluate(() =>
      window.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(page.getByText("Signed in as")).toContainText(
      "Beta Session User",
    );
    // Beta's employee query cannot have completed yet. The original shared
    // QueryClient would expose Alpha's cached row while this SQL read waits.
    await expect(
      page.getByText("Alpha Private Employee", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Beta Private Employee", { exact: true }),
    ).toHaveCount(0);
    release();
    await lock;
    await expect(
      page.getByText("Beta Private Employee", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Alpha Private Employee", { exact: true }),
    ).toHaveCount(0);
    await other.close();
  } finally {
    release();
    await lock?.catch(() => {
      /* Preserve the test error but still clean up its fixtures. */
    });
    for (const organizationId of organizations) {
      await prisma.employee.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
  }
});
