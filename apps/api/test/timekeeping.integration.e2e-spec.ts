import { randomUUID } from 'node:crypto';
import { prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { ComplianceService } from '../src/modules/compliance/compliance.service';
import { EmployeesService } from '../src/modules/employees/employees.service';
import { LeavesService } from '../src/modules/leaves/leaves.service';
import { LoansService } from '../src/modules/loans/loans.service';
import { PayrollService } from '../src/modules/payroll/payroll.service';
import { TimekeepingService } from '../src/modules/timekeeping/timekeeping.service';
import { createApiRouter } from '../src/trpc/routers/app.router';
import { type Context, TrpcService } from '../src/trpc/trpc.service';

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
type User = NonNullable<Context['user']>;
function caller(user: User) {
  return router.createCaller({
    req: {
      ip: '127.0.0.1',
      get: () => 'attendance-integration-test',
      headers: {},
    } as unknown as Request,
    res: {} as Response,
    user,
  });
}
async function tenant(label: string) {
  const org = await prisma.organization.create({
    data: {
      name: `${label}-${tag}`,
      tin: '123-456-789-000',
      rdoCode: '047',
      registeredAddress: 'Makati City',
    },
  });
  organizationIds.push(org.id);
  const branch = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: 'Main office',
      code: 'HQ',
      address: 'Makati City',
    },
  });
  const department = await prisma.department.create({
    data: { organizationId: org.id, name: 'Operations', code: 'OPS' },
  });
  const stored = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: 'Test HR',
      email: `${label}-${tag}@test.invalid`,
      role: Role.HR_ADMIN,
      passwordHash: 'integration-test-no-login',
    },
  });
  const user: User = {
    id: stored.id,
    organizationId: org.id,
    name: stored.name,
    email: stored.email,
    role: stored.role,
  };
  const employee = await caller(user).employees.create({
    branchId: branch.id,
    departmentId: department.id,
    firstName: 'Ana',
    lastName: 'Santos',
    email: `employee-${label}-${tag}@test.invalid`,
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
    employmentType: 'REGULAR',
    bankName: 'Test Bank',
    bankAccountNumber: '1234567890',
    bankAccountName: 'Ana Santos',
    monthlyBasicRatePesos: 30000,
  });
  return { org, user, employee };
}

describe('PostgreSQL-backed attendance corrections', () => {
  jest.setTimeout(30_000);
  let own: Awaited<ReturnType<typeof tenant>>;
  let foreign: Awaited<ReturnType<typeof tenant>>;
  const date = '2026-09-10';
  const baseline = {
    date,
    dayType: 'REGULAR_WORKDAY' as const,
    expectedUpdatedAt: null,
    timeIn: '2026-09-10T00:00:00.000Z',
    timeOut: '2026-09-10T09:00:00.000Z',
    actualWorkedMinutes: 480,
    tardinessMinutes: 0,
    undertimeMinutes: 0,
    overtimeMinutes: 0,
    nightDiffMinutes: 0,
    isAbsent: false,
    isApproved: false,
    correctionReason: 'Verified against the signed attendance sheet',
  };
  const key = () => ({
    employeeId_date: { employeeId: own.employee.id, date: new Date(date) },
  });
  async function current() {
    return prisma.dailyTimeRecord.findUniqueOrThrow({ where: key() });
  }
  async function auditCount() {
    return prisma.auditLog.count({
      where: { organizationId: own.org.id, entityType: 'DailyTimeRecord' },
    });
  }
  async function correction() {
    return {
      ...baseline,
      employeeId: own.employee.id,
      expectedUpdatedAt: (await current()).updatedAt.toISOString(),
    };
  }

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL)
      throw new Error(
        'A migrated disposable DATABASE_URL and NODE_ENV=test are required',
      );
    own = await tenant('DTR-own');
    foreign = await tenant('DTR-foreign');
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    const scope = { organizationId: { in: organizationIds } };
    await prisma.payrollRun.deleteMany({ where: scope });
    await prisma.employee.deleteMany({ where: scope });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.$disconnect();
  });

  it('distinguishes an empty DTR from a foreign employee and enforces self-read access', async () => {
    expect(
      await caller(own.user).timekeeping.getDTR({
        employeeId: own.employee.id,
        startDate: date,
        endDate: date,
      }),
    ).toEqual([]);
    await expect(
      caller(foreign.user).timekeeping.getDTR({
        employeeId: own.employee.id,
        startDate: date,
        endDate: date,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const staff = caller({
      ...own.user,
      role: Role.EMPLOYEE,
      employeeId: own.employee.id,
    });
    expect(
      await staff.timekeeping.getDTR({
        employeeId: own.employee.id,
        startDate: date,
        endDate: date,
      }),
    ).toEqual([]);
    await expect(
      staff.timekeeping.getDTR({
        employeeId: foreign.employee.id,
        startDate: date,
        endDate: date,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      staff.timekeeping.adjustAttendance({
        ...baseline,
        employeeId: own.employee.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('creates an explicit unapproved record and preserves correction provenance', async () => {
    const saved = await caller(own.user).timekeeping.adjustAttendance({
      ...baseline,
      employeeId: own.employee.id,
    });
    expect(saved).toMatchObject({
      actualWorkedMinutes: 480,
      isApproved: false,
    });
    const entry = await prisma.auditLog.findFirst({
      where: { entityId: saved.id, action: 'CREATE' },
    });
    expect(entry).toMatchObject({
      userId: own.user.id,
      organizationId: own.org.id,
      newData: expect.objectContaining({
        correctionReason: baseline.correctionReason,
        actualWorkedMinutes: 480,
      }),
    });
    await expect(
      timekeeping.getCutoffAttendanceSummary(
        own.employee.id,
        own.org.id,
        new Date(date),
        new Date(date),
      ),
    ).rejects.toThrow('unapproved attendance');
  });
  it('persists before/after values, approval and a new version in one transaction', async () => {
    const before = await current();
    const saved = await caller(own.user).timekeeping.adjustAttendance({
      ...(await correction()),
      actualWorkedMinutes: 450,
      tardinessMinutes: 30,
      isApproved: true,
      correctionReason: 'Corrected arrival after reviewing source punches',
    });
    expect(saved.updatedAt.getTime()).toBeGreaterThan(
      before.updatedAt.getTime(),
    );
    expect(saved).toMatchObject({
      actualWorkedMinutes: 450,
      tardinessMinutes: 30,
      isApproved: true,
    });
    const entry = await prisma.auditLog.findFirst({
      where: { entityId: saved.id, action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry?.previousData).toMatchObject({
      actualWorkedMinutes: 480,
      isApproved: false,
    });
    expect(entry?.newData).toMatchObject({
      actualWorkedMinutes: 450,
      isApproved: true,
      correctionReason: 'Corrected arrival after reviewing source punches',
    });
    const summary = await timekeeping.getCutoffAttendanceSummary(
      own.employee.id,
      own.org.id,
      new Date(date),
      new Date(date),
    );
    expect(summary.regularHoursWorked).toBe(7.5);
  });
  it('rejects stale and duplicate-date requests without extra audit entries', async () => {
    const count = await auditCount();
    for (const expectedUpdatedAt of [null, '2000-01-01T00:00:00.000Z']) {
      await expect(
        caller(own.user).timekeeping.adjustAttendance({
          ...baseline,
          employeeId: own.employee.id,
          expectedUpdatedAt,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    }
    expect(await auditCount()).toBe(count);
    expect((await current()).actualWorkedMinutes).toBe(450);
  });
  it('rolls back attendance when audit persistence fails', async () => {
    const before = await current();
    const count = await auditCount();
    jest
      .spyOn(audit, 'record')
      .mockRejectedValueOnce(new Error('Simulated audit failure'));
    await expect(
      caller(own.user).timekeeping.adjustAttendance({
        ...(await correction()),
        actualWorkedMinutes: 420,
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(await current()).toEqual(before);
    expect(await auditCount()).toBe(count);
  });
  it('allows only one concurrent edit of the same loaded version', async () => {
    const input = await correction();
    const count = await auditCount();
    const results = await Promise.allSettled(
      [420, 400].map((actualWorkedMinutes) =>
        caller(own.user).timekeeping.adjustAttendance({
          ...input,
          actualWorkedMinutes,
        }),
      ),
    );
    expect(
      results.filter((entry) => entry.status === 'fulfilled'),
    ).toHaveLength(1);
    const failed = results.find(
      (entry) => entry.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: 'CONFLICT' });
    expect(await auditCount()).toBe(count + 1);
  });
  it('rejects another tenant and never changes that tenant attendance', async () => {
    const before = await current();
    await expect(
      caller(foreign.user).timekeeping.adjustAttendance(await correction()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await current()).toEqual(before);
  });
  it('freezes regular processed cutoffs for corrections and legacy writers, but permits a cancelled cutoff', async () => {
    const run = await prisma.payrollRun.create({
      data: {
        organizationId: own.org.id,
        cutoffSequence: 'FIRST_CUTOFF',
        cutoffStartDate: new Date('2026-09-01'),
        cutoffEndDate: new Date('2026-09-15'),
        paymentDate: new Date('2026-09-16'),
        status: 'AUDITED',
      },
    });
    const before = await current();
    const count = await auditCount();
    for (const status of [
      'DRAFT',
      'PROCESSING',
      'AUDITED',
      'APPROVED',
      'DISBURSED',
    ] as const) {
      await prisma.payrollRun.update({
        where: { id: run.id },
        data: { status },
      });
      await expect(
        caller(own.user).timekeeping.adjustAttendance(await correction()),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    }
    await expect(
      timekeeping.recordPunch(own.employee.id, own.org.id, new Date(date)),
    ).rejects.toThrow('non-cancelled regular payroll');
    await expect(
      timekeeping.adjustAttendanceRecord({
        employeeId: own.employee.id,
        organizationId: own.org.id,
        date: new Date(date),
        actualWorkedMinutes: 480,
      }),
    ).rejects.toThrow('non-cancelled regular payroll');
    expect(await current()).toEqual(before);
    expect(await auditCount()).toBe(count);
    await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'CANCELLED' },
    });
    await caller(own.user).timekeeping.adjustAttendance(await correction());
    expect((await current()).actualWorkedMinutes).toBe(480);
  });
});
