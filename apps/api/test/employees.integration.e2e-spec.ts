import { randomUUID } from 'node:crypto';
import { prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import { AuthService } from '../src/auth/auth.service';
import { AuditService } from '../src/infrastructure/audit/audit.service';
import { ComplianceService } from '../src/modules/compliance/compliance.service';
import { EmployeesService } from '../src/modules/employees/employees.service';
import { LeavesService } from '../src/modules/leaves/leaves.service';
import { LoansService } from '../src/modules/loans/loans.service';
import { PayrollService } from '../src/modules/payroll/payroll.service';
import { TimekeepingService } from '../src/modules/timekeeping/timekeeping.service';
import { createApiRouter } from '../src/trpc/app.router';
import { type Context, TrpcService } from '../src/trpc/trpc.service';

// Run only with NODE_ENV=test and a migrated, disposable DATABASE_URL.
const tag = randomUUID();
const audit = new AuditService();
const timekeeping = new TimekeepingService();
const router = createApiRouter(
  new TrpcService(),
  new EmployeesService(),
  timekeeping,
  new PayrollService(timekeeping),
  new LoansService(),
  new ComplianceService(),
  new LeavesService(),
  new AuthService(),
  audit,
);
const organizationIds: string[] = [];
type User = Omit<NonNullable<Context['user']>, 'employeeId'>;
function caller(user: User) {
  return router.createCaller({
    req: {
      ip: '127.0.0.1',
      get: () => 'employee-integration-test',
      headers: {},
    } as unknown as Request,
    res: {} as Response,
    user,
  });
}

async function tenant(label: string) {
  const organization = await prisma.organization.create({
    data: {
      name: `${label}-${tag}`,
      tin: '123-456-789-000',
      rdoCode: '047',
      registeredAddress: 'Makati City',
    },
  });
  organizationIds.push(organization.id);
  const branch = await prisma.branch.create({
    data: {
      organizationId: organization.id,
      name: 'Main office',
      code: 'HQ',
      address: 'Makati City',
    },
  });
  const department = await prisma.department.create({
    data: { organizationId: organization.id, name: 'Operations', code: 'OPS' },
  });
  const user = await prisma.user.create({
    data: {
      organizationId: organization.id,
      name: 'Test HR',
      email: `${label}-${tag}@test.invalid`,
      role: Role.HR_ADMIN,
      passwordHash: 'integration-test-no-login',
    },
  });
  return { organization, branch, department, user };
}

describe('PostgreSQL-backed employee registration', () => {
  jest.setTimeout(30_000);
  let own: Awaited<ReturnType<typeof tenant>>;
  let foreign: Awaited<ReturnType<typeof tenant>>;
  const profile = {
    firstName: 'Ana',
    lastName: 'Santos',
    email: `ana-${tag}@test.invalid`,
    contactNumber: '09170000000',
    residentialAddress: 'Makati City',
    gender: 'Female',
    civilStatus: 'Single',
    dateOfBirth: '1995-01-01',
    tin: '123-456-789-000',
    sssNo: '12-3456789-0',
    philhealthNo: '12-345678901-2',
    pagibigNo: '1234-5678-9012',
    hireDate: '2026-01-01',
    employmentType: 'PROBATIONARY' as const,
    bankName: 'Test Bank',
    bankAccountNumber: '1234567890',
    bankAccountName: 'Ana Santos',
    monthlyBasicRatePesos: 30000.25,
  };
  function input(email = profile.email) {
    return {
      ...profile,
      email,
      branchId: own.branch.id,
      departmentId: own.department.id,
    };
  }

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL)
      throw new Error(
        'A dedicated test DATABASE_URL and NODE_ENV=test are required',
      );
    own = await tenant('Employee-own');
    foreign = await tenant('Employee-foreign');
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (organizationIds.length) {
      await prisma.employee.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    await prisma.$disconnect();
  });

  it('returns tenant-only choices and rejects non-HR registration', async () => {
    const options = await caller(own.user).employees.getRegistrationOptions();
    expect(options.branches.map((entry) => entry.id)).toEqual([own.branch.id]);
    expect(options.departments.map((entry) => entry.id)).toEqual([
      own.department.id,
    ]);
    const specialist = caller({ ...own.user, role: Role.PAYROLL_SPECIALIST });
    await expect(specialist.employees.create(input())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      specialist.employees.getRegistrationOptions(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(
      await prisma.employee.count({
        where: { organizationId: own.organization.id },
      }),
    ).toBe(0);
  });

  it('persists the employee, centavo compensation, and audit actor together without creating a login', async () => {
    const created = await caller(own.user).employees.create(input());
    expect(created.compensation?.basicRateMonthlyCents).toBe(3000025n);
    expect(created.compensation?.basicRateDailyCents).toBe(
      (3000025n * 12n) / 261n,
    );
    expect(created.bankAccountNumber).toBe(profile.bankAccountNumber);
    const entry = await prisma.auditLog.findFirst({
      where: { entityId: created.id, entityType: 'Employee', action: 'CREATE' },
    });
    expect(entry).toMatchObject({
      organizationId: own.organization.id,
      userId: own.user.id,
    });
    expect(await prisma.user.count({ where: { employeeId: created.id } })).toBe(
      0,
    );
    expect(
      await caller(foreign.user).employees.getById({ id: created.id }),
    ).toBeNull();
    expect(
      await caller(own.user).employees.getById({ id: created.id }),
    ).toMatchObject({ id: created.id, email: profile.email });
    const auditCount = await prisma.auditLog.count({
      where: { entityId: created.id },
    });
    await expect(
      caller(own.user).employees.create(input()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      await prisma.auditLog.count({ where: { entityId: created.id } }),
    ).toBe(auditCount);
    expect(
      await prisma.employee.count({ where: { email: profile.email } }),
    ).toBe(1);
  });

  it('rejects foreign branch and department IDs without creating rows', async () => {
    for (const override of [
      { branchId: foreign.branch.id },
      { departmentId: foreign.department.id },
    ]) {
      const email = `foreign-choice-${randomUUID()}@test.invalid`;
      await expect(
        caller(own.user).employees.create({ ...input(email), ...override }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(await prisma.employee.findUnique({ where: { email } })).toBeNull();
    }
  });

  it('rolls back employee and compensation if audit storage fails', async () => {
    jest
      .spyOn(audit, 'record')
      .mockRejectedValueOnce(new Error('Simulated audit failure'));
    const email = `audit-fail-${tag}@test.invalid`;
    await expect(
      caller(own.user).employees.create(input(email)),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(await prisma.employee.findUnique({ where: { email } })).toBeNull();
    expect(
      await prisma.compensation.count({ where: { employee: { email } } }),
    ).toBe(0);
  });

  it('creates concurrent employees with different references and audit entries', async () => {
    const entries = await Promise.all(
      ['one', 'two'].map((suffix) =>
        caller(own.user).employees.create(
          input(`${suffix}-${tag}@test.invalid`),
        ),
      ),
    );
    expect(new Set(entries.map((entry) => entry.employeeNumber)).size).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: { in: entries.map((entry) => entry.id) },
          action: 'CREATE',
        },
      }),
    ).toBe(2);
  });
});
