import { randomUUID } from 'node:crypto';
import { Prisma, prisma, Role } from '@workspace/db';
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
const input = {
  cutoffStartDate: '2029-01-01',
  cutoffEndDate: '2029-01-15',
  paymentDate: '2029-01-16',
  cutoffSequence: 'FIRST_CUTOFF' as const,
};
const caller = (user: User) =>
  router.createCaller({
    user,
    req: {
      ip: '127.0.0.1',
      headers: {},
      get: () => 'payroll-transaction-test',
    } as unknown as Request,
    res: {} as Response,
  });

// Synchronize the first two reads of a run inside real PostgreSQL transactions.
// Both operations see the old state; retry reads are intentionally not gated.
function coordinateRunReads(runId: string) {
  const original = prisma.$transaction.bind(prisma);
  let readers = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  jest
    .spyOn(prisma, '$transaction')
    .mockImplementation(async (operation: unknown, options) =>
      original(async (transaction) => {
        const delegate = new Proxy(transaction.payrollRun, {
          get(target, key) {
            if (key === 'findFirst')
              return async (args: Prisma.PayrollRunFindFirstArgs) => {
                const row = await target.findFirst(args);
                if (args.where?.id === runId && readers < 2) {
                  readers++;
                  if (readers === 2) release();
                  await barrier;
                }
                return row;
              };
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        const client = new Proxy(transaction, {
          get(target, key) {
            return key === 'payrollRun' ? delegate : Reflect.get(target, key);
          },
        });
        return (
          operation as (tx: Prisma.TransactionClient) => Promise<unknown>
        )(client);
      }, options),
    );
}

describe('PostgreSQL payroll transitions and transactional auditing', () => {
  jest.setTimeout(30_000);
  let organizationId: string;
  let employeeId: string;
  let loanId: string;
  let maker: User;
  let checker: User;
  let otherChecker: User;
  let foreign: User;

  beforeEach(async () => {
    if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL)
      throw new Error(
        'A disposable test DATABASE_URL and NODE_ENV=test are required',
      );
    const org = await prisma.organization.create({
      data: {
        name: `Payroll transactions ${randomUUID()}`,
        tin: '123456789',
        rdoCode: '047',
        registeredAddress: 'Test address',
      },
    });
    organizationId = org.id;
    const branch = await prisma.branch.create({
      data: { organizationId, name: 'HQ', code: 'HQ', address: 'Test address' },
    });
    const department = await prisma.department.create({
      data: { organizationId, name: 'Operations', code: 'OPS' },
    });
    const employee = await prisma.employee.create({
      data: {
        organizationId,
        branchId: branch.id,
        departmentId: department.id,
        employeeNumber: `TEST-${randomUUID()}`,
        firstName: 'Payroll',
        lastName: 'Fixture',
        email: `${randomUUID()}@test.invalid`,
        dateOfBirth: new Date('1995-01-01'),
        gender: 'Other',
        civilStatus: 'Single',
        contactNumber: 'Test',
        residentialAddress: 'Test address',
        tin: '123456789',
        sssNo: '1234567890',
        philhealthNo: '123456789012',
        pagibigNo: '123456789012',
        hireDate: new Date('2028-01-01'),
        bankName: 'BDO',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Payroll Fixture',
        compensation: {
          create: {
            basicRateMonthlyCents: 3000000n,
            basicRateDailyCents: 137931n,
            basicRateHourlyCents: 17241n,
          },
        },
      },
    });
    employeeId = employee.id;
    const loan = await prisma.employeeLoan.create({
      data: {
        employeeId,
        loanType: 'COMPANY_CASH_ADVANCE',
        principalCents: 100000n,
        totalAmountCents: 100000n,
        amortizationCents: 100000n,
        balanceCents: 100000n,
        startDate: new Date('2029-01-01'),
      },
    });
    loanId = loan.id;
    await prisma.dailyTimeRecord.create({
      data: {
        employeeId,
        date: new Date('2029-01-02'),
        actualWorkedMinutes: 480,
        isApproved: true,
      },
    });
    async function user(role: Role): Promise<User> {
      const created = await prisma.user.create({
        data: {
          organizationId,
          role,
          name: role,
          email: `${randomUUID()}@test.invalid`,
          passwordHash: 'test-no-login',
        },
      });
      return {
        id: created.id,
        organizationId,
        name: created.name,
        email: created.email,
        role,
      };
    }
    maker = await user(Role.PAYROLL_SPECIALIST);
    checker = await user(Role.HR_ADMIN);
    otherChecker = await user(Role.HR_ADMIN);
    foreign = { ...checker, organizationId: randomUUID() };
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (!organizationId) return;
    await prisma.loanPayment.deleteMany({
      where: { loan: { employee: { organizationId } } },
    });
    await prisma.payslip.deleteMany({
      where: { payrollRun: { organizationId } },
    });
    await prisma.payrollRun.deleteMany({ where: { organizationId } });
    await prisma.employee.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    organizationId = '';
  });
  afterAll(async () => prisma.$disconnect());

  const trigger = () => caller(maker).payroll.triggerRun(input);
  const auditCount = () =>
    prisma.auditLog.count({
      where: { organizationId, entityType: 'PayrollRun' },
    });
  const recordedLoan = () =>
    prisma.employeeLoan.findUniqueOrThrow({ where: { id: loanId } });
  function failAfterAuditWrite() {
    const original = audit.record.bind(audit);
    return jest
      .spyOn(audit, 'record')
      .mockImplementationOnce(async (entry, transaction) => {
        await original(entry, transaction);
        throw new Error('Simulated audit failure after insert');
      });
  }

  it('rolls back regular creation, payslips, loan collection and audit on audit failure', async () => {
    failAfterAuditWrite();
    await expect(trigger()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(await prisma.payrollRun.count({ where: { organizationId } })).toBe(
      0,
    );
    expect(await prisma.payslip.count({ where: { employeeId } })).toBe(0);
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(0);
    expect(await recordedLoan()).toMatchObject({
      balanceCents: 100000n,
      isActive: true,
    });
    expect(await auditCount()).toBe(0);
    expect((await trigger()).status).toBe('AUDITED');
    expect(await auditCount()).toBe(1);
  });

  it('returns the original regular run on replay without re-auditing or collecting twice', async () => {
    const first = await trigger();
    const repeated = await trigger();
    expect(repeated.id).toBe(first.id);
    expect(repeated.processedById).toBe(maker.id);
    expect(await auditCount()).toBe(1);
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(1);
    expect((await recordedLoan()).balanceCents).toBe(0n);
  });

  it('creates one run, collection and audit for concurrent identical triggers', async () => {
    const [first, second] = await Promise.all([trigger(), trigger()]);
    expect(second.id).toBe(first.id);
    expect(await prisma.payrollRun.count({ where: { organizationId } })).toBe(
      1,
    );
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(1);
    expect(await auditCount()).toBe(1);
    expect((await recordedLoan()).balanceCents).toBe(0n);
  });

  it('rolls back approval and checker provenance when the audit fails', async () => {
    const run = await trigger();
    failAfterAuditWrite();
    await expect(
      caller(checker).payroll.approveRun({ runId: run.id }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(
      await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({ status: 'AUDITED', approvedById: null });
    expect(await auditCount()).toBe(1);
    await caller(checker).payroll.approveRun({ runId: run.id });
    expect(await auditCount()).toBe(2);
  });

  it('rolls back disbursement when the audit fails and preserves the approval', async () => {
    const run = await trigger();
    await caller(checker).payroll.approveRun({ runId: run.id });
    failAfterAuditWrite();
    await expect(
      caller(maker).payroll.disburseRun({ runId: run.id }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(
      await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({ status: 'APPROVED', approvedById: checker.id });
    expect(await auditCount()).toBe(2);
    await caller(maker).payroll.disburseRun({ runId: run.id });
    expect(await auditCount()).toBe(3);
  });

  it('rolls back cancellation and loan refunds on audit failure, then preserves the deleted snapshot', async () => {
    const run = await trigger();
    await caller(checker).payroll.approveRun({ runId: run.id });
    const slip = await prisma.payslip.findFirstOrThrow({
      where: { payrollRunId: run.id },
    });
    failAfterAuditWrite();
    await expect(
      caller(maker).payroll.cancelRun({ runId: run.id }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(
      await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({ status: 'APPROVED' });
    expect(
      await prisma.payslip.count({ where: { payrollRunId: run.id } }),
    ).toBe(1);
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(1);
    expect(await recordedLoan()).toMatchObject({
      balanceCents: 0n,
      isActive: false,
    });
    expect(await auditCount()).toBe(2);
    await caller(maker).payroll.cancelRun({ runId: run.id });
    expect(await recordedLoan()).toMatchObject({
      balanceCents: 100000n,
      isActive: true,
    });
    expect(
      await prisma.payrollRun.findUnique({ where: { id: run.id } }),
    ).toBeNull();
    const cancellation = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: run.id, action: 'UPDATE' },
    });
    expect(cancellation.previousData).toMatchObject({
      status: 'APPROVED',
      payslips: [
        expect.objectContaining({ id: slip.id, loanDeductionsCents: '100000' }),
      ],
    });
    expect(cancellation.newData).toMatchObject({ status: 'CANCELLED' });
    await expect(
      caller(maker).payroll.cancelRun({ runId: run.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await auditCount()).toBe(3);
    expect((await recordedLoan()).balanceCents).toBe(100000n);
  });

  it('rolls back special creation on audit failure and audits a successful special replay only once', async () => {
    const regular = await trigger();
    await caller(checker).payroll.approveRun({ runId: regular.id });
    await caller(maker).payroll.disburseRun({ runId: regular.id });
    const specialInput = {
      cutoffStartDate: input.cutoffStartDate,
      cutoffEndDate: input.cutoffEndDate,
      paymentDate: '2029-01-20',
    };
    failAfterAuditWrite();
    await expect(
      caller(maker).payroll.triggerThirteenthMonthRun(specialInput),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(
      await prisma.payrollRun.count({
        where: { organizationId, cutoffSequence: 'SPECIAL_RUN' },
      }),
    ).toBe(0);
    expect(await prisma.payslip.count({ where: { employeeId } })).toBe(1);
    expect(await auditCount()).toBe(3);
    const special =
      await caller(maker).payroll.triggerThirteenthMonthRun(specialInput);
    const repeated =
      await caller(maker).payroll.triggerThirteenthMonthRun(specialInput);
    expect(repeated.id).toBe(special.id);
    expect(await auditCount()).toBe(4);
  });

  it('permits only one of two checkers that read the same audited state', async () => {
    const run = await trigger();
    coordinateRunReads(run.id);
    const results = await Promise.allSettled(
      [checker, otherChecker].map((user) =>
        caller(user).payroll.approveRun({ runId: run.id }),
      ),
    );
    const winners = results.filter((result) => result.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { code: 'CONFLICT' } });
    const recorded = await prisma.payrollRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(recorded.approvedById).toBe(winners[0]?.value.approvedById);
    expect(await auditCount()).toBe(2);
    await expect(
      caller(otherChecker).payroll.approveRun({ runId: run.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await auditCount()).toBe(2);
  });

  it('permits only one concurrent disbursement and never audits a replay twice', async () => {
    const run = await trigger();
    await caller(checker).payroll.approveRun({ runId: run.id });
    coordinateRunReads(run.id);
    const results = await Promise.allSettled(
      [maker, checker].map((user) =>
        caller(user).payroll.disburseRun({ runId: run.id }),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { code: 'CONFLICT' } });
    expect(await auditCount()).toBe(3);
    await expect(
      caller(maker).payroll.disburseRun({ runId: run.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      caller(maker).payroll.cancelRun({ runId: run.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('never refunds a run that wins a race to disbursement', async () => {
    const run = await trigger();
    await caller(checker).payroll.approveRun({ runId: run.id });
    coordinateRunReads(run.id);
    const results = await Promise.allSettled([
      caller(maker).payroll.disburseRun({ runId: run.id }),
      caller(checker).payroll.cancelRun({ runId: run.id }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const recorded = await prisma.payrollRun.findUnique({
      where: { id: run.id },
    });
    expect(recorded?.status ?? 'DELETED').toBe(
      results[0]?.status === 'fulfilled' ? 'DISBURSED' : 'DELETED',
    );
    expect((await recordedLoan()).balanceCents).toBe(recorded ? 0n : 100000n);
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(
      recorded ? 1 : 0,
    );
    expect(await auditCount()).toBe(3);
  });

  it('refunds loans and records the deleted snapshot only once for concurrent cancellations', async () => {
    const run = await trigger();
    coordinateRunReads(run.id);
    const results = await Promise.allSettled([
      caller(maker).payroll.cancelRun({ runId: run.id }),
      caller(checker).payroll.cancelRun({ runId: run.id }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { code: 'NOT_FOUND' } });
    expect(await recordedLoan()).toMatchObject({
      balanceCents: 100000n,
      isActive: true,
    });
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(0);
    expect(
      await prisma.payrollRun.findUnique({ where: { id: run.id } }),
    ).toBeNull();
    expect(await auditCount()).toBe(2);
  });

  it('rejects foreign access and maker self-approval without changing state or audits', async () => {
    const run = await trigger();
    await expect(
      caller(foreign).payroll.approveRun({ runId: run.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      caller(foreign).payroll.disburseRun({ runId: run.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      caller(foreign).payroll.cancelRun({ runId: run.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      caller({ ...maker, role: Role.SUPER_ADMIN }).payroll.approveRun({
        runId: run.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await auditCount()).toBe(1);
    expect(
      (await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } }))
        .status,
    ).toBe('AUDITED');
  });
});
