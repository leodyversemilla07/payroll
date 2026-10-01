import { randomUUID } from 'node:crypto';
import { Prisma, prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import superjson from 'superjson';
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
const orgIds: string[] = [];
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
type User = NonNullable<Context['user']>;
function caller(user: User) {
  return router.createCaller({
    req: {
      ip: '127.0.0.1',
      get: () => 'leave-integration-test',
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
  orgIds.push(org.id);
  const branch = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: 'HQ',
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
    role: stored.role,
    name: stored.name,
    email: stored.email,
  };
  const employee = await caller(user).employees.create({
    branchId: branch.id,
    departmentId: department.id,
    firstName: 'Ana',
    lastName: 'Santos',
    email: `employee-${label}-${tag}@test.invalid`,
    contactNumber: '09170000000',
    residentialAddress: 'Makati City',
    dateOfBirth: '1995-01-01',
    gender: 'Female',
    civilStatus: 'Single',
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
describe('PostgreSQL-backed leave management and decisions', () => {
  jest.setTimeout(30_000);
  let own: Awaited<ReturnType<typeof tenant>>;
  let foreign: Awaited<ReturnType<typeof tenant>>;
  const key = () => ({
    employeeId_leaveType_year: {
      employeeId: own.employee.id,
      leaveType: 'SIL',
      year: 2026,
    },
  });
  const balance = () => prisma.leaveBalance.findUniqueOrThrow({ where: key() });
  const countAudits = () =>
    prisma.auditLog.count({
      where: {
        organizationId: own.org.id,
        entityType: 'LeaveRequest',
        action: { in: ['APPROVE', 'UPDATE'] },
      },
    });
  function file(start: string, end = start, days = 1, paid = true) {
    return caller(own.user).leaves.request({
      employeeId: own.employee.id,
      leaveType: 'SIL',
      startDate: start,
      endDate: end,
      daysCount: days,
      isPaid: paid,
      reason: 'Verified leave request for integration testing',
    });
  }
  function reject(id: string) {
    return caller(own.user).leaves.reject({
      requestId: id,
      rejectionReason: 'Request dates require correction before refiling',
    });
  }
  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL)
      throw new Error(
        'A migrated disposable DATABASE_URL and NODE_ENV=test are required',
      );
    own = await tenant('Leave-own');
    foreign = await tenant('Leave-foreign');
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await prisma.payrollRun.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.employee.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.$disconnect();
  });
  it('does not create credits on read, then reads explicitly configured test credits as decimal strings', async () => {
    expect(
      await caller(own.user).leaves.getBalances({
        employeeId: own.employee.id,
        year: 2026,
      }),
    ).toEqual([]);
    expect(
      await prisma.leaveBalance.count({
        where: { employeeId: own.employee.id },
      }),
    ).toBe(0);
    // Test-only provisioned credits, not assumed statutory eligibility.
    await prisma.leaveBalance.create({
      data: {
        employeeId: own.employee.id,
        leaveType: 'SIL',
        year: 2026,
        totalCredits: new Prisma.Decimal(5),
        balance: new Prisma.Decimal(5),
      },
    });
    const rows = await caller(own.user).leaves.getBalances({
      employeeId: own.employee.id,
      year: 2026,
    });
    expect(rows[0]).toMatchObject({
      balance: '5',
      totalCredits: '5',
      usedCredits: '0',
    });
    expect(() => superjson.stringify(rows)).not.toThrow();
  });
  it('files and approves a half-day once without reserving or double-debiting credits', async () => {
    const staff = caller({
      ...own.user,
      role: Role.EMPLOYEE,
      employeeId: own.employee.id,
    });
    const request = await staff.leaves.request({
      employeeId: own.employee.id,
      leaveType: 'SIL',
      startDate: '2026-09-10',
      endDate: '2026-09-10',
      daysCount: 0.5,
      partialDate: '2026-09-10',
      isPaid: true,
      reason: 'Half-day family errand',
    });
    expect(request).toMatchObject({ status: 'PENDING', daysCount: '0.5' });
    expect((await balance()).balance.toString()).toBe('5');
    await expect(
      staff.leaves.approve({ requestId: request.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await caller(own.user).leaves.approve({ requestId: request.id });
    await caller(own.user).leaves.approve({ requestId: request.id });
    expect((await balance()).balance.toString()).toBe('4.5');
    expect((await balance()).usedCredits.toString()).toBe('0.5');
    expect(
      await prisma.auditLog.count({
        where: { entityId: request.id, action: 'APPROVE' },
      }),
    ).toBe(1);
    const requests = await staff.leaves.listRequests({
      employeeId: own.employee.id,
      year: 2026,
      status: 'APPROVED',
    });
    expect(requests[0].daysCount).toBe('0.5');
    expect(() => superjson.stringify(requests)).not.toThrow();
  });
  it('rejects pending leave with preserved actor/reason, no debit, and safe replays', async () => {
    const request = await file('2026-09-11');
    const first = await reject(request.id);
    const again = await caller(own.user).leaves.reject({
      requestId: request.id,
      rejectionReason:
        'A different repeated explanation must not overwrite history',
    });
    expect(again).toMatchObject({
      rejectedById: own.user.id,
      rejectionReason: first.rejectionReason,
      status: 'REJECTED',
    });
    expect((await balance()).balance.toString()).toBe('4.5');
    expect(
      await prisma.auditLog.count({
        where: { entityId: request.id, action: 'UPDATE' },
      }),
    ).toBe(1);
    await expect(
      caller(own.user).leaves.approve({ requestId: request.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const refiled = await file('2026-09-11');
    await reject(refiled.id);
  });
  it('rolls back filing, approval/debit and rejection when their audit writes fail', async () => {
    const requestsBefore = await prisma.leaveRequest.count({
      where: { employeeId: own.employee.id },
    });
    jest
      .spyOn(audit, 'record')
      .mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(file('2026-09-14')).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(
      await prisma.leaveRequest.count({
        where: { employeeId: own.employee.id },
      }),
    ).toBe(requestsBefore);
    const request = await file('2026-09-15');
    jest
      .spyOn(audit, 'record')
      .mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(
      caller(own.user).leaves.approve({ requestId: request.id }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect((await balance()).balance.toString()).toBe('4.5');
    expect(
      (
        await prisma.leaveRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).status,
    ).toBe('PENDING');
    jest
      .spyOn(audit, 'record')
      .mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(reject(request.id)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(
      (
        await prisma.leaveRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).rejectionReason,
    ).toBeNull();
    await reject(request.id);
  });
  it('rejects insufficient paid balance, overlapping intake and cross-year requests', async () => {
    const request = await file('2026-09-21', '2026-09-25', 5);
    await expect(
      caller(own.user).leaves.approve({ requestId: request.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(file('2026-09-22')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(file('2026-12-31', '2027-01-01', 2)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
    });
    expect((await balance()).balance.toString()).toBe('4.5');
    await reject(request.id);
  });
  it('prevents linked HR self-approval and foreign tenant access', async () => {
    const request = await file('2026-09-17');
    await expect(
      caller({ ...own.user, employeeId: own.employee.id }).leaves.approve({
        requestId: request.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      caller(foreign.user).leaves.getBalances({
        employeeId: own.employee.id,
        year: 2026,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      caller(foreign.user).leaves.listRequests({
        employeeId: own.employee.id,
        year: 2026,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      caller(foreign.user).leaves.reject({
        requestId: request.id,
        rejectionReason: 'Foreign review must not modify this request',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await reject(request.id);
  });
  it('cannot overdraw credits when two paid approvals race', async () => {
    const a = await file('2026-09-28', '2026-09-30', 3);
    const b = await file('2026-10-01', '2026-10-05', 3);
    const results = await Promise.allSettled(
      [a, b].map((entry) =>
        caller(own.user).leaves.approve({ requestId: entry.id }),
      ),
    );
    expect(
      results.filter((entry) => entry.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await balance()).balance.toString()).toBe('1.5');
  });
  it('commits only one decision when approval and rejection race', async () => {
    const request = await file('2026-10-08', '2026-10-08', 1, false);
    const count = await countAudits();
    const results = await Promise.allSettled([
      caller(own.user).leaves.approve({ requestId: request.id }),
      reject(request.id),
    ]);
    expect(
      results.filter((entry) => entry.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await countAudits()).toBe(count + 1);
    expect((await balance()).balance.toString()).toBe('1.5');
  });
  it('commits only one intake when overlapping filings race', async () => {
    const before = await prisma.leaveRequest.count({
      where: { employeeId: own.employee.id },
    });
    const results = await Promise.allSettled([
      file('2026-11-23'),
      file('2026-11-23'),
    ]);
    expect(
      results.filter((entry) => entry.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await prisma.leaveRequest.count({
        where: { employeeId: own.employee.id },
      }),
    ).toBe(before + 1);
  });

  it('prevents concurrent approvals of overlapping legacy requests', async () => {
    const ids = [randomUUID(), randomUUID()];
    await prisma.leaveRequest.createMany({
      data: ids.map((id) => ({
        id,
        employeeId: own.employee.id,
        leaveType: 'LEGACY_UNPAID',
        startDate: new Date('2026-11-19'),
        endDate: new Date('2026-11-19'),
        daysCount: new Prisma.Decimal(1),
        isPaid: false,
        reason: 'Legacy duplicate for concurrency verification',
      })),
    });
    const before = await countAudits();
    const results = await Promise.allSettled(
      ids.map((requestId) => caller(own.user).leaves.approve({ requestId })),
    );
    expect(
      results.filter((entry) => entry.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await countAudits()).toBe(before + 1);
    expect((await balance()).balance.toString()).toBe('1.5');
  });

  it('blocks approval for processed payroll and allows rejection without rewriting payroll', async () => {
    const request = await file('2026-11-02');
    const run = await prisma.payrollRun.create({
      data: {
        organizationId: own.org.id,
        cutoffSequence: 'FIRST_CUTOFF',
        cutoffStartDate: new Date('2026-11-01'),
        cutoffEndDate: new Date('2026-11-15'),
        paymentDate: new Date('2026-11-16'),
        status: 'DISBURSED',
      },
    });
    await expect(
      caller(own.user).leaves.approve({ requestId: request.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await reject(request.id);
    expect((await balance()).balance.toString()).toBe('1.5');
    expect(
      (await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } }))
        .status,
    ).toBe('DISBURSED');
  });

  const creditInput = (
    leaveType = 'VACATION',
    totalCredits = 5.5,
    expectedRevision: number | null = null,
  ) => ({
    operationId: randomUUID(),
    employeeId: own.employee.id,
    leaveType,
    year: 2027,
    totalCredits,
    expectedRevision,
    sourceReference: 'POLICY-2027-TEST',
    reason: 'Reviewed test policy and employee eligibility',
  });
  const creditBalance = (leaveType = 'VACATION') =>
    prisma.leaveBalance.findUniqueOrThrow({
      where: {
        employeeId_leaveType_year: {
          employeeId: own.employee.id,
          year: 2027,
          leaveType,
        },
      },
    });

  it('restricts credits to HR/super-admin, blocks self changes and foreign records', async () => {
    for (const role of [
      Role.EMPLOYEE,
      Role.PAYROLL_SPECIALIST,
      Role.DEPARTMENT_MANAGER,
    ])
      await expect(
        caller({
          ...own.user,
          role,
          employeeId: own.employee.id,
        }).leaves.setCredits(creditInput()),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      caller({ ...own.user, employeeId: own.employee.id }).leaves.setCredits(
        creditInput(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      caller(foreign.user).leaves.setCredits(creditInput()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      caller(foreign.user).leaves.listCreditChanges({
        employeeId: own.employee.id,
        year: 2027,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('does not hide orphaned legacy paid usage behind a new zero-used allocation', async () => {
    await prisma.leaveRequest.create({
      data: {
        employeeId: own.employee.id,
        leaveType: 'IMPORTED',
        startDate: new Date('2028-01-03'),
        endDate: new Date('2028-01-03'),
        daysCount: new Prisma.Decimal(1),
        isPaid: true,
        status: 'APPROVED',
        reason: 'Legacy approved usage without a configured balance',
      },
    });
    await expect(
      caller(own.user).leaves.setCredits({
        ...creditInput('IMPORTED', 2),
        year: 2028,
      }),
    ).rejects.toMatchObject({ code: 'UNPROCESSABLE_CONTENT' });
    expect(
      await prisma.leaveBalance.findFirst({
        where: {
          employeeId: own.employee.id,
          year: 2028,
          leaveType: 'IMPORTED',
        },
      }),
    ).toBeNull();
  });

  it('allocates explicit credits with provenance and idempotent response-loss replay', async () => {
    const input = creditInput();
    const result = await caller(own.user).leaves.setCredits(input);
    expect(result).toMatchObject({
      replayed: false,
      balance: {
        totalCredits: '5.5',
        usedCredits: '0',
        balance: '5.5',
        revision: 1,
      },
      change: {
        kind: 'ALLOCATION',
        previousTotalCredits: null,
        actorId: own.user.id,
        sourceReference: input.sourceReference,
      },
    });
    expect(() => superjson.stringify(result)).not.toThrow();
    expect((await caller(own.user).leaves.setCredits(input)).replayed).toBe(
      true,
    );
    expect(
      await prisma.leaveCreditChange.count({
        where: { balanceId: result.balance.id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityId: result.balance.id, action: 'CREATE' },
      }),
    ).toBe(1);
    await expect(
      caller(own.user).leaves.setCredits({
        ...input,
        reason: 'Changed operation contents must not overwrite provenance',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      await caller(own.user).leaves.listCreditChanges({
        employeeId: own.employee.id,
        year: 2026,
      }),
    ).toEqual([]);
  });
  it('bumps revision on approval and adjusts totals without resetting consumed credits', async () => {
    const request = await caller(own.user).leaves.request({
      employeeId: own.employee.id,
      leaveType: 'VACATION',
      startDate: '2027-01-04',
      endDate: '2027-01-05',
      daysCount: 1.5,
      partialDate: '2027-01-05',
      isPaid: true,
      reason: 'Verified two-day schedule with a half-day',
    });
    await caller(own.user).leaves.approve({ requestId: request.id });
    expect((await creditBalance()).revision).toBe(2);
    await expect(
      caller(own.user).leaves.setCredits(creditInput('VACATION', 6, 1)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const forged = {
      ...creditInput('VACATION', 3.5, 2),
      usedCredits: 0,
      organizationId: foreign.org.id,
    };
    const result = await caller(own.user).leaves.setCredits(forged);
    expect(result.balance).toMatchObject({
      totalCredits: '3.5',
      usedCredits: '1.5',
      balance: '2',
      revision: 3,
    });
    expect(result.change).toMatchObject({
      previousTotalCredits: '5.5',
      previousBalance: '4',
      usedCredits: '1.5',
      totalCredits: '3.5',
      actorId: own.user.id,
    });
    await expect(
      caller(own.user).leaves.setCredits(creditInput('VACATION', 1, 3)),
    ).rejects.toMatchObject({ code: 'UNPROCESSABLE_CONTENT' });
    const history = await caller({
      ...own.user,
      role: Role.EMPLOYEE,
      employeeId: own.employee.id,
    }).leaves.listCreditChanges({ employeeId: own.employee.id, year: 2027 });
    expect(history).toHaveLength(2);
    expect(history[0].kind).toBe('ADJUSTMENT');
    expect(history[0].usedCredits).toBe('1.5');
  });
  it('rolls back allocation and adjustment if audit or provenance persistence fails', async () => {
    jest
      .spyOn(audit, 'record')
      .mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(
      caller(own.user).leaves.setCredits(creditInput('SICK', 2)),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(
      await prisma.leaveBalance.findFirst({
        where: { employeeId: own.employee.id, year: 2027, leaveType: 'SICK' },
      }),
    ).toBeNull();
    const existing = await creditBalance();
    const count = await prisma.leaveCreditChange.count({
      where: { balanceId: existing.id },
    });
    jest
      .spyOn(audit, 'record')
      .mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(
      caller(own.user).leaves.setCredits(creditInput('VACATION', 8, 3)),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    // A real ledger primary-key failure after the balance update must also roll back.
    const foreignOperation = {
      ...creditInput('FOREIGN_TEST', 1),
      employeeId: foreign.employee.id,
    };
    await caller(foreign.user).leaves.setCredits(foreignOperation);
    await expect(
      caller(own.user).leaves.setCredits({
        ...creditInput('VACATION', 8, 3),
        operationId: foreignOperation.operationId,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await creditBalance()).totalCredits.toString()).toBe('3.5');
    expect((await creditBalance()).revision).toBe(3);
    expect(
      await prisma.leaveCreditChange.count({
        where: { balanceId: existing.id },
      }),
    ).toBe(count);
  });
  it('allows only one concurrent allocation and one adjustment of the same loaded revision', async () => {
    const allocations = await Promise.allSettled(
      [creditInput('SICK', 2), creditInput('SICK', 2)].map((input) =>
        caller(own.user).leaves.setCredits(input),
      ),
    );
    expect(
      allocations.filter((entry) => entry.status === 'fulfilled'),
    ).toHaveLength(1);
    const adjustments = await Promise.allSettled(
      [creditInput('VACATION', 4.5, 3), creditInput('VACATION', 5.5, 3)].map(
        (input) => caller(own.user).leaves.setCredits(input),
      ),
    );
    expect(
      adjustments.filter((entry) => entry.status === 'fulfilled'),
    ).toHaveLength(1);
    const recorded = await creditBalance();
    expect(recorded.usedCredits.toString()).toBe('1.5');
    expect(
      recorded.balance.equals(
        recorded.totalCredits.minus(recorded.usedCredits),
      ),
    ).toBe(true);
  });
  it('preserves consumed credits when adjustment races paid approval', async () => {
    const request = await caller(own.user).leaves.request({
      employeeId: own.employee.id,
      leaveType: 'SICK',
      startDate: '2027-02-01',
      endDate: '2027-02-01',
      daysCount: 1,
      isPaid: true,
      reason: 'Concurrent approval and credit adjustment verification',
    });
    const [adjustment, approval] = await Promise.allSettled([
      caller(own.user).leaves.setCredits(creditInput('SICK', 3, 1)),
      caller(own.user).leaves.approve({ requestId: request.id }),
    ]);
    expect(approval.status).toBe('fulfilled');
    const recorded = await creditBalance('SICK');
    expect(recorded.usedCredits.toString()).toBe('1');
    expect(recorded.balance.equals(recorded.totalCredits.minus(1))).toBe(true);
    expect(recorded.revision).toBe(adjustment.status === 'fulfilled' ? 3 : 2);
  });
});
