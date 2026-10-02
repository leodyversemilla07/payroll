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
import { approvedWeekdayDtrs } from './fixtures/attendance';

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
    await prisma.dailyTimeRecord.createMany({
      data: approvedWeekdayDtrs(
        employeeId,
        input.cutoffStartDate,
        input.cutoffEndDate,
      ),
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
  async function expectNoPayrollWrites() {
    expect(await prisma.payrollRun.count({ where: { organizationId } })).toBe(
      0,
    );
    expect(
      await prisma.payslip.count({ where: { payrollRun: { organizationId } } }),
    ).toBe(0);
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(0);
    expect((await recordedLoan()).balanceCents).toBe(100000n);
    expect(await auditCount()).toBe(0);
  }
  function failAfterAuditWrite() {
    const original = audit.record.bind(audit);
    return jest
      .spyOn(audit, 'record')
      .mockImplementationOnce(async (entry, transaction) => {
        await original(entry, transaction);
        throw new Error('Simulated audit failure after insert');
      });
  }

  it('rejects future-only employees without creating a run or collecting loans', async () => {
    await prisma.employee.update({
      where: { id: employeeId },
      data: { hireDate: new Date('2029-02-01') },
    });
    await expect(trigger()).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining(
        'hired on or before the cutoff end date',
      ),
    });
    await expectNoPayrollWrites();
  });

  it('excludes future hires even if their compensation and attendance are missing', async () => {
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...template
    } = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const future = await prisma.employee.create({
      data: {
        ...template,
        employeeNumber: `FUTURE-${randomUUID()}`,
        email: `${randomUUID()}@test.invalid`,
        hireDate: new Date('2029-01-16'),
      },
    });
    const run = await trigger();
    expect(run.payslips).toHaveLength(1);
    expect(run.payslips[0]?.employeeId).toBe(employeeId);
    expect(
      await prisma.payslip.count({ where: { employeeId: future.id } }),
    ).toBe(0);
  });

  it('blocks monthly mid-cutoff hires rather than paying a full half-month', async () => {
    await prisma.employee.update({
      where: { id: employeeId },
      data: { hireDate: new Date('2029-01-08') },
    });
    await expect(trigger()).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining(
        'monthly new-hire pay requires an approved proration policy',
      ),
    });
    await expectNoPayrollWrites();
  });

  it.each(['DAILY', 'HOURLY'] as const)(
    'pays %s hires only for approved post-hire work',
    async (payBasis) => {
      await prisma.employee.update({
        where: { id: employeeId },
        data: { hireDate: new Date('2029-01-08T12:00:00Z'), payBasis },
      });
      await prisma.compensation.update({
        where: { employeeId },
        data: { basicRateDailyCents: 100000n, basicRateHourlyCents: 12500n },
      });
      // Pre-hire leave must neither create pay nor conflict with pre-hire
      // DTRs: both synthetic fixtures are outside the eligible window.
      await prisma.leaveRequest.create({
        data: {
          employeeId,
          leaveType: 'SIL',
          startDate: new Date('2029-01-04'),
          endDate: new Date('2029-01-04'),
          daysCount: 1,
          isPaid: true,
          status: 'APPROVED',
          approvedById: checker.id,
          reason: 'Synthetic pre-hire exclusion fixture',
        },
      });
      const run = await trigger();
      const payableDays = approvedWeekdayDtrs(
        employeeId,
        '2029-01-08',
        input.cutoffEndDate,
      ).length;
      expect(run.payslips[0]?.basicPayCents).toBe(
        BigInt(payableDays) * 100000n,
      );
      expect(
        await prisma.dailyTimeRecord.count({
          where: { employeeId, date: { lt: new Date('2029-01-08') } },
        }),
      ).toBeGreaterThan(0);
      expect(run.payslips[0]?.basicPayCents).toBeLessThan(1500000n);
      expect(run.payslips[0]?.paidLeavePayCents).toBe(0n);
    },
  );

  it('allows a monthly hire on the first cutoff date after complete attendance approval', async () => {
    await prisma.employee.update({
      where: { id: employeeId },
      data: { hireDate: new Date(input.cutoffStartDate) },
    });
    const run = await trigger();
    expect(run.payslips[0]?.basicPayCents).toBe(1500000n);
  });

  it('rejects a custom monthly cutoff without creating a payroll snapshot', async () => {
    await expect(
      caller(maker).payroll.triggerRun({
        ...input,
        cutoffStartDate: '2029-01-02',
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining('full standard cutoff'),
    });
    await expectNoPayrollWrites();
  });

  it('rolls back sparse attendance and succeeds after the missing DTRs are supplied', async () => {
    await prisma.dailyTimeRecord.deleteMany({
      where: { employeeId, date: { not: new Date('2029-01-02') } },
    });
    await expect(trigger()).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining('complete approved weekday attendance'),
    });
    await expectNoPayrollWrites();
    await prisma.dailyTimeRecord.createMany({
      data: approvedWeekdayDtrs(
        employeeId,
        input.cutoffStartDate,
        input.cutoffEndDate,
      ),
      skipDuplicates: true,
    });
    expect((await trigger()).status).toBe('AUDITED');
    expect(await auditCount()).toBe(1);
  });

  it('does not use an approved zero-work placeholder as paid attendance', async () => {
    await prisma.dailyTimeRecord.update({
      where: { employeeId_date: { employeeId, date: new Date('2029-01-03') } },
      data: { actualWorkedMinutes: 0, isAbsent: false },
    });
    await expect(trigger()).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining('zero-work weekday DTR'),
    });
    await expectNoPayrollWrites();
  });

  it('deducts an explicit approved monthly absence instead of paying for it', async () => {
    await prisma.dailyTimeRecord.update({
      where: { employeeId_date: { employeeId, date: new Date('2029-01-03') } },
      data: { actualWorkedMinutes: 0, isAbsent: true },
    });
    const run = await trigger();
    expect(run.payslips[0]?.absenceDeductionCents).toBe(137931n);
    expect(run.payslips[0]?.grossPayCents).toBe(1500000n - 137931n);
  });

  it.each([
    ['APPROVED', true, true],
    ['PENDING', true, false],
    ['REJECTED', true, false],
    ['CANCELLED', true, false],
    ['APPROVED', false, false],
  ] as const)(
    'uses only approved paid leave for missing DTRs (%s, paid=%s)',
    async (status, isPaid, accepted) => {
      const date = new Date('2029-01-03');
      await prisma.dailyTimeRecord.delete({
        where: { employeeId_date: { employeeId, date } },
      });
      await prisma.leaveRequest.create({
        data: {
          employeeId,
          leaveType: 'SIL',
          startDate: date,
          endDate: date,
          daysCount: 1,
          reason: 'Synthetic coverage fixture',
          status,
          isPaid,
          approvedById: status === 'APPROVED' ? checker.id : null,
        },
      });
      if (accepted) {
        const run = await trigger();
        expect(run.payslips[0]?.grossPayCents).toBe(1500000n);
        expect(run.payslips[0]?.absenceDeductionCents).toBe(0n);
      } else {
        await expect(trigger()).rejects.toMatchObject({
          code: 'UNPROCESSABLE_CONTENT',
          message: expect.stringContaining('1 missing date(s) (2029-01-03)'),
        });
        await expectNoPayrollWrites();
      }
    },
  );

  it('rolls back an otherwise payable employee when another employee has missing attendance', async () => {
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...template
    } = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    await prisma.employee.create({
      data: {
        ...template,
        employeeNumber: `MISSING-${randomUUID()}`,
        email: `${randomUUID()}@test.invalid`,
        compensation: {
          create: {
            basicRateMonthlyCents: 3000000n,
            basicRateDailyCents: 137931n,
            basicRateHourlyCents: 17241n,
          },
        },
      },
    });
    await expect(trigger()).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining('without attendance records'),
    });
    await expectNoPayrollWrites();
  });

  it('requires HR review of imported punches, then pays without phantom Manila deductions or premiums', async () => {
    const date = new Date('2029-01-03');
    await prisma.dailyTimeRecord.delete({
      where: { employeeId_date: { employeeId, date } },
    });
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
    });
    await caller(checker).timekeeping.importBiometricsCsv({
      csvContent: `${employee.employeeNumber},2029-01-03 09:00:00,CHECK_IN\n${employee.employeeNumber},2029-01-03 18:00:00,CHECK_OUT`,
    });
    const imported = await prisma.dailyTimeRecord.findUniqueOrThrow({
      where: { employeeId_date: { employeeId, date } },
    });
    expect(imported).toMatchObject({
      timeIn: new Date('2029-01-03T01:00:00Z'),
      timeOut: new Date('2029-01-03T10:00:00Z'),
      actualWorkedMinutes: 480,
      undertimeMinutes: 0,
      nightDiffMinutes: 0,
      isApproved: false,
    });
    await expect(trigger()).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining('unapproved attendance'),
    });
    await expectNoPayrollWrites();
    await caller(checker).timekeeping.adjustAttendance({
      employeeId,
      date: '2029-01-03',
      expectedUpdatedAt: imported.updatedAt.toISOString(),
      dayType: 'REGULAR_WORKDAY',
      timeIn: '2029-01-03T01:00:00Z',
      timeOut: '2029-01-03T10:00:00Z',
      actualWorkedMinutes: 480,
      tardinessMinutes: 0,
      undertimeMinutes: 0,
      overtimeMinutes: 0,
      nightDiffMinutes: 0,
      isAbsent: false,
      isApproved: true,
      correctionReason:
        'Synthetic reviewed standard Manila shift and break only',
    });
    const run = await trigger();
    expect(run.payslips[0]).toMatchObject({
      basicPayCents: 1500000n,
      tardinessDeductionCents: 0n,
      undertimeDeductionCents: 0n,
      nightDiffPayCents: 0n,
    });
  });

  it.each(['MONTHLY', 'DAILY', 'HOURLY'] as const)(
    'does not deduct a paid half day again for %s employees',
    async (payBasis) => {
      await prisma.employee.update({
        where: { id: employeeId },
        data: { payBasis },
      });
      await prisma.compensation.update({
        where: { employeeId },
        data: { basicRateDailyCents: 100000n, basicRateHourlyCents: 12500n },
      });
      const date = new Date('2029-01-03');
      await prisma.dailyTimeRecord.update({
        where: { employeeId_date: { employeeId, date } },
        data: { actualWorkedMinutes: 240, undertimeMinutes: 240 },
      });
      await prisma.leaveRequest.create({
        data: {
          employeeId,
          leaveType: 'SIL',
          startDate: date,
          endDate: date,
          partialDate: date,
          daysCount: 0.5,
          reason: 'Synthetic half-day payroll fixture',
          isPaid: true,
          status: 'APPROVED',
          approvedById: checker.id,
        },
      });
      const run = await trigger();
      const slip = run.payslips[0];
      expect(slip?.undertimeDeductionCents).toBe(0n);
      expect(slip?.tardinessDeductionCents).toBe(0n);
      expect(slip?.paidLeavePayCents).toBe(
        payBasis === 'MONTHLY' ? 0n : 50000n,
      );
      expect(slip?.basicPayCents).toBe(
        payBasis === 'MONTHLY'
          ? 1500000n
          : BigInt(
              approvedWeekdayDtrs(
                employeeId,
                input.cutoffStartDate,
                input.cutoffEndDate,
              ).length,
            ) * 100000n,
      );
      expect(
        (
          await prisma.dailyTimeRecord.findUniqueOrThrow({
            where: { employeeId_date: { employeeId, date } },
          })
        ).undertimeMinutes,
      ).toBe(240);
    },
  );

  it('preserves real monthly lateness after applying the paid half-day credit', async () => {
    const date = new Date('2029-01-03');
    await prisma.dailyTimeRecord.update({
      where: { employeeId_date: { employeeId, date } },
      data: {
        actualWorkedMinutes: 210,
        tardinessMinutes: 30,
        undertimeMinutes: 240,
      },
    });
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveType: 'SIL',
        startDate: date,
        endDate: date,
        partialDate: date,
        daysCount: 0.5,
        reason: 'Synthetic half-day shortfall fixture',
        isPaid: true,
        status: 'APPROVED',
        approvedById: checker.id,
      },
    });
    const run = await trigger();
    expect(run.payslips[0]?.tardinessDeductionCents).toBe(287n * 30n);
    expect(run.payslips[0]?.undertimeDeductionCents).toBe(0n);
  });

  it('blocks inconsistent half-day deductions without collecting loans or posting payroll', async () => {
    const date = new Date('2029-01-03');
    await prisma.dailyTimeRecord.update({
      where: { employeeId_date: { employeeId, date } },
      data: {
        actualWorkedMinutes: 210,
        tardinessMinutes: 0,
        undertimeMinutes: 0,
      },
    });
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveType: 'SIL',
        startDate: date,
        endDate: date,
        partialDate: date,
        daysCount: 0.5,
        reason: 'Synthetic unresolved half-day fixture',
        isPaid: true,
        status: 'APPROVED',
        approvedById: checker.id,
      },
    });
    await expect(trigger()).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining(
        'Half-day attendance deductions do not reconcile',
      ),
    });
    await expectNoPayrollWrites();
  });

  it('conserves monthly allowance grants across cutoffs, replay and cancellation/recalculation', async () => {
    await prisma.employeeAllowance.createMany({
      data: [
        {
          employeeId,
          name: 'Monthly transport',
          type: 'TAXABLE',
          frequency: 'MONTHLY',
          amountCents: 100001n,
        },
        {
          employeeId,
          name: 'Monthly fixed',
          type: 'NON_TAXABLE_FIXED',
          frequency: 'MONTHLY',
          amountCents: 60001n,
        },
        {
          employeeId,
          name: 'Monthly rice',
          type: 'DE_MINIMIS',
          deMinimisCategory: 'RICE_SUBSIDY',
          frequency: 'MONTHLY',
          amountCents: 250000n,
        },
        {
          employeeId,
          name: 'Cutoff transport',
          type: 'TAXABLE',
          frequency: 'PER_CUTOFF',
          amountCents: 1001n,
        },
        {
          employeeId,
          name: 'Cutoff laundry',
          type: 'DE_MINIMIS',
          deMinimisCategory: 'LAUNDRY_ALLOWANCE',
          frequency: 'PER_CUTOFF',
          amountCents: 20000n,
        },
        {
          employeeId,
          name: 'Inactive allowance',
          type: 'TAXABLE',
          frequency: 'UNSUPPORTED',
          amountCents: 900000n,
          isActive: false,
        },
      ],
    });
    await prisma.employeeLoan.update({
      where: { id: loanId },
      data: { startDate: new Date('2029-01-16') },
    });
    await prisma.dailyTimeRecord.createMany({
      data: approvedWeekdayDtrs(employeeId, '2029-01-16', '2029-01-31'),
    });
    const first = await trigger();
    expect(first.payslips[0]).toMatchObject({
      taxableAllowancesCents: 51001n,
      nonTaxableAllowancesCents: 175000n,
      deMinimisExcessCents: 0n,
      loanDeductionsCents: 0n,
    });
    expect((await recordedLoan()).balanceCents).toBe(100000n);
    const secondInput = {
      ...input,
      cutoffStartDate: '2029-01-16',
      cutoffEndDate: '2029-01-31',
      paymentDate: '2029-02-01',
      cutoffSequence: 'SECOND_CUTOFF' as const,
    };
    const second = await caller(maker).payroll.triggerRun(secondInput);
    expect(second.payslips[0]).toMatchObject({
      taxableAllowancesCents: 51002n,
      nonTaxableAllowancesCents: 175001n,
      deMinimisExcessCents: 0n,
      loanDeductionsCents: 100000n,
    });
    expect(
      (first.payslips[0]?.taxableAllowancesCents ?? 0n) +
        (second.payslips[0]?.taxableAllowancesCents ?? 0n),
    ).toBe(100001n + 2n * 1001n);
    expect(
      (first.payslips[0]?.nonTaxableAllowancesCents ?? 0n) +
        (second.payslips[0]?.nonTaxableAllowancesCents ?? 0n),
    ).toBe(60001n + 250000n + 2n * 20000n);
    expect((await caller(maker).payroll.triggerRun(secondInput)).id).toBe(
      second.id,
    );
    expect((await trigger()).id).toBe(first.id);
    expect(await auditCount()).toBe(2);
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(1);
    await caller(maker).payroll.cancelRun({ runId: second.id });
    expect((await recordedLoan()).balanceCents).toBe(100000n);
    const recalculated = await caller(maker).payroll.triggerRun(secondInput);
    expect(recalculated.payslips[0]).toMatchObject({
      taxableAllowancesCents: 51002n,
      nonTaxableAllowancesCents: 175001n,
      loanDeductionsCents: 100000n,
    });
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(1);
    expect((await recordedLoan()).balanceCents).toBe(0n);
    expect(await prisma.payslip.count({ where: { employeeId } })).toBe(2);
  });

  it.each(['WEEKLY', 'monthly', ''])(
    'rolls back an unsupported active allowance frequency "%s"',
    async (frequency) => {
      await prisma.employeeAllowance.create({
        data: {
          employeeId,
          name: 'Bad frequency',
          type: 'TAXABLE',
          frequency,
          amountCents: 100000n,
        },
      });
      await expect(trigger()).rejects.toMatchObject({
        code: 'UNPROCESSABLE_CONTENT',
        message: expect.stringContaining('unsupported frequency'),
      });
      await expectNoPayrollWrites();
    },
  );

  it.each(['DAILY', 'HOURLY'] as const)(
    'blocks monthly allowances on partial-cutoff %s new-hire payroll',
    async (payBasis) => {
      await prisma.employee.update({
        where: { id: employeeId },
        data: { payBasis, hireDate: new Date('2029-01-08') },
      });
      await prisma.employeeAllowance.create({
        data: {
          employeeId,
          name: 'Monthly transport',
          type: 'TAXABLE',
          frequency: 'MONTHLY',
          amountCents: 100000n,
        },
      });
      await expect(trigger()).rejects.toMatchObject({
        code: 'UNPROCESSABLE_CONTENT',
        message: expect.stringContaining(
          'partial-period allowance proration requires an approved policy',
        ),
      });
      await expectNoPayrollWrites();
    },
  );

  it.each([
    ['2029-01-01', null, true],
    ['2029-01-10', null, true],
    ['2029-01-15T23:59:59Z', null, true],
    ['2029-01-16', null, false],
    ['2029-02-01', null, false],
    ['2029-01-01', '2029-01-15', true],
    ['2029-01-01', '2029-01-14T23:59:59Z', false],
  ] as const)(
    'applies the inclusive loan window %s–%s at cutoff end',
    async (startDate, endDate, collected) => {
      await prisma.employeeLoan.update({
        where: { id: loanId },
        data: {
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
        },
      });
      const run = await trigger();
      expect(run.payslips[0]?.loanDeductionsCents).toBe(
        collected ? 100000n : 0n,
      );
      expect((await recordedLoan()).balanceCents).toBe(
        collected ? 0n : 100000n,
      );
      expect((await recordedLoan()).isActive).toBe(!collected);
      expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(
        collected ? 1 : 0,
      );
      // Changing a date after posting must not change a replay or refund a
      // loan that was never collected. The posted ledger is authoritative.
      await prisma.employeeLoan.update({
        where: { id: loanId },
        data: { startDate: new Date('2029-01-01'), endDate: null },
      });
      expect((await trigger()).id).toBe(run.id);
      expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(
        collected ? 1 : 0,
      );
      await caller(maker).payroll.cancelRun({ runId: run.id });
      expect((await recordedLoan()).balanceCents).toBe(100000n);
      expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(0);
    },
  );

  it('rejects an inverted repayment window at loan creation without storing a loan or audit', async () => {
    const beforeAudit = await prisma.auditLog.count({
      where: { organizationId, entityType: 'EmployeeLoan' },
    });
    await expect(
      caller(maker).loans.create({
        employeeId,
        loanType: 'COMPANY_CASH_ADVANCE',
        principalPesos: 1000,
        totalAmountPesos: 1000,
        amortizationPesos: 100,
        startDate: '2029-02-01',
        endDate: '2029-01-31',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await prisma.employeeLoan.count({ where: { employeeId } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { organizationId, entityType: 'EmployeeLoan' },
      }),
    ).toBe(beforeAudit);
  });

  it('rolls back an inverted active loan repayment window', async () => {
    await prisma.employeeLoan.update({
      where: { id: loanId },
      data: { endDate: new Date('2028-12-31') },
    });
    await expect(trigger()).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining('repayment dates are invalid'),
    });
    await expectNoPayrollWrites();
  });

  it('ignores inactive loans even when their effective date is inside the cutoff', async () => {
    await prisma.employeeLoan.update({
      where: { id: loanId },
      data: { isActive: false },
    });
    const run = await trigger();
    expect(run.payslips[0]?.loanDeductionsCents).toBe(0n);
    expect((await recordedLoan()).balanceCents).toBe(100000n);
    expect(await prisma.loanPayment.count({ where: { loanId } })).toBe(0);
  });

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
