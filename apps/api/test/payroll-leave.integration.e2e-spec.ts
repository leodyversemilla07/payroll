import { randomUUID } from 'node:crypto';
import { Prisma, prisma, Role } from '@workspace/db';
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
import { approvedWeekdayDtrs } from './fixtures/attendance';

// Unlike the mocked service specs, these exercise real PostgreSQL transactions,
// Prisma relations, tenant-scoped tRPC procedures, and audit persistence. Run
// only against the dedicated test database provisioned in CI.
const testTag = randomUUID().slice(0, 8);
const ownedOrganizationIds: string[] = [];

const timekeepingService = new TimekeepingService();
const leavesService = new LeavesService();
const router = createApiRouter(
  new TrpcService(),
  new EmployeesService(),
  timekeepingService,
  new PayrollService(timekeepingService),
  new LoansService(),
  new ComplianceService(),
  leavesService,
  new AuthService(),
  new AuditService(),
);

type CallerUser = NonNullable<Context['user']>;
function callerFor(user: CallerUser) {
  const req = {
    ip: '127.0.0.1',
    get: () => 'payroll-integration-test',
    headers: {},
  } as unknown as Request;
  return router.createCaller({ req, res: {} as Response, user });
}

async function createOrganization(label: string) {
  const organization = await prisma.organization.create({
    data: {
      name: `${label}-${testTag}`,
      tin: '123-456-789-000',
      rdoCode: '047',
      registeredAddress: 'Makati City',
    },
  });
  ownedOrganizationIds.push(organization.id);
  return organization;
}

async function createUser(
  organizationId: string,
  role: Role,
  name: string,
  employeeId?: string,
) {
  const user = await prisma.user.create({
    data: {
      organizationId,
      employeeId,
      name,
      role,
      email: `${name.toLowerCase().replaceAll(' ', '-')}-${testTag}@test.invalid`,
      passwordHash: 'integration-test-no-login',
    },
  });
  return {
    id: user.id,
    organizationId: user.organizationId,
    employeeId: user.employeeId ?? undefined,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

describe('PostgreSQL-backed payroll and leave integration', () => {
  jest.setTimeout(30_000);
  let organizationId: string;
  let employeeId: string;
  let hr: CallerUser;
  let specialist: CallerUser;
  let staff: CallerUser;
  let foreignHr: CallerUser;

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL) {
      throw new Error(
        'A dedicated test DATABASE_URL and NODE_ENV=test are required',
      );
    }
    const organization = await createOrganization('Payroll-test');
    const otherOrganization = await createOrganization('Foreign-test');
    organizationId = organization.id;
    const branch = await prisma.branch.create({
      data: {
        organizationId,
        name: 'HQ',
        code: 'HQ',
        address: 'Makati City',
      },
    });
    const department = await prisma.department.create({
      data: { organizationId, name: 'Operations', code: 'OPS' },
    });
    const employee = await prisma.employee.create({
      data: {
        organizationId,
        branchId: branch.id,
        departmentId: department.id,
        employeeNumber: `TEST-${testTag}`,
        firstName: 'Test',
        lastName: 'Employee',
        email: `employee-${testTag}@test.invalid`,
        dateOfBirth: new Date('1995-01-01'),
        gender: 'Not specified',
        civilStatus: 'Single',
        contactNumber: 'N/A',
        residentialAddress: 'Makati City',
        tin: '123-456-789-000',
        sssNo: '00-0000000-0',
        philhealthNo: '00-000000000-0',
        pagibigNo: '0000-0000-0000',
        hireDate: new Date('2025-01-01'),
        bankName: 'BDO',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test Employee',
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
    await prisma.leaveBalance.create({
      data: {
        employeeId,
        year: 2026,
        leaveType: 'SIL',
        totalCredits: new Prisma.Decimal(5),
        usedCredits: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(5),
      },
    });
    hr = await createUser(organizationId, Role.HR_ADMIN, 'HR Admin');
    specialist = await createUser(
      organizationId,
      Role.PAYROLL_SPECIALIST,
      'Payroll Specialist',
    );
    staff = await createUser(
      organizationId,
      Role.EMPLOYEE,
      'Staff',
      employeeId,
    );
    foreignHr = await createUser(
      otherOrganization.id,
      Role.HR_ADMIN,
      'Foreign HR',
    );
  });

  afterAll(async () => {
    if (ownedOrganizationIds.length === 0) return;
    const orgScope = { organizationId: { in: ownedOrganizationIds } };
    const employeeScope = { employee: orgScope };
    await prisma.loanPayment.deleteMany({ where: { loan: employeeScope } });
    await prisma.payslip.deleteMany({ where: { payrollRun: orgScope } });
    await prisma.payrollRun.deleteMany({ where: orgScope });
    await prisma.leaveRequest.deleteMany({ where: employeeScope });
    await prisma.leaveBalance.deleteMany({ where: employeeScope });
    await prisma.dailyTimeRecord.deleteMany({ where: employeeScope });
    await prisma.employeeLoan.deleteMany({ where: employeeScope });
    await prisma.employee.deleteMany({ where: orgScope });
    await prisma.organization.deleteMany({
      where: { id: { in: ownedOrganizationIds } },
    });
    await prisma.$disconnect();
  });

  it('enforces tenant access and approves paid leave only once', async () => {
    const request = await callerFor(staff).leaves.request({
      employeeId,
      leaveType: 'SIL',
      startDate: '2026-09-10',
      endDate: '2026-09-11',
      daysCount: 2,
      isPaid: true,
      reason: 'Family leave',
    });
    await expect(
      callerFor(staff).leaves.approve({ requestId: request.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(foreignHr).leaves.approve({ requestId: request.id }),
    ).rejects.toThrow();

    const approved = await callerFor(hr).leaves.approve({
      requestId: request.id,
    });
    const repeated = await callerFor(hr).leaves.approve({
      requestId: request.id,
    });
    const balance = await prisma.leaveBalance.findUniqueOrThrow({
      where: {
        employeeId_leaveType_year: { employeeId, leaveType: 'SIL', year: 2026 },
      },
    });
    expect(approved.status).toBe('APPROVED');
    expect(repeated.approvedById).toBe(hr.id);
    expect(balance.balance.toString()).toBe('3');
    expect(balance.usedCredits.toString()).toBe('2');
    expect(
      await prisma.auditLog.count({
        where: {
          organizationId,
          entityType: 'LeaveRequest',
          entityId: request.id,
          action: 'APPROVE',
        },
      }),
    ).toBe(1);
  });

  it('rolls back an approval when paid leave exceeds the remaining balance', async () => {
    const request = await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveType: 'SIL',
        startDate: new Date('2026-09-21'),
        endDate: new Date('2026-09-24'),
        daysCount: new Prisma.Decimal(4),
        isPaid: true,
        reason: 'Over balance',
      },
    });
    await expect(
      callerFor(hr).leaves.approve({ requestId: request.id }),
    ).rejects.toThrow();
    const unchanged = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    const balance = await prisma.leaveBalance.findUniqueOrThrow({
      where: {
        employeeId_leaveType_year: { employeeId, leaveType: 'SIL', year: 2026 },
      },
    });
    expect(unchanged.status).toBe('PENDING');
    expect(balance.balance.toString()).toBe('3');
  });

  it('cannot overdraw a leave balance when two requests are approved concurrently', async () => {
    const requests = await Promise.all(
      [0, 1].map((day) =>
        prisma.leaveRequest.create({
          data: {
            employeeId,
            leaveType: 'SIL',
            startDate: new Date(Date.UTC(2026, 9, 1 + day * 4)),
            endDate: new Date(Date.UTC(2026, 9, 2 + day * 4)),
            daysCount: new Prisma.Decimal(2),
            isPaid: true,
            reason: 'Concurrent leave test',
          },
        }),
      ),
    );
    const outcomes = await Promise.allSettled(
      requests.map((request) =>
        callerFor(hr).leaves.approve({ requestId: request.id }),
      ),
    );
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    const balance = await prisma.leaveBalance.findUniqueOrThrow({
      where: {
        employeeId_leaveType_year: { employeeId, leaveType: 'SIL', year: 2026 },
      },
    });
    expect(balance.balance.toString()).toBe('1');
    expect(balance.usedCredits.toString()).toBe('4');
    expect(
      await prisma.leaveRequest.count({
        where: {
          id: { in: requests.map((request) => request.id) },
          status: 'APPROVED',
        },
      }),
    ).toBe(1);
  });

  it('collects only affordable loan payments and exactly reverses them on cancellation', async () => {
    const loan = await prisma.employeeLoan.create({
      data: {
        employeeId,
        loanType: 'COMPANY_CASH_ADVANCE',
        principalCents: 2000000n,
        totalAmountCents: 2000000n,
        amortizationCents: 2000000n,
        balanceCents: 2000000n,
        startDate: new Date('2026-09-01'),
      },
    });
    await prisma.dailyTimeRecord.createMany({
      data: approvedWeekdayDtrs(employeeId, '2026-09-16', '2026-09-30'),
    });
    const run = await callerFor(specialist).payroll.triggerRun({
      cutoffStartDate: '2026-09-16',
      cutoffEndDate: '2026-09-30',
      paymentDate: '2026-10-01',
      cutoffSequence: 'SECOND_CUTOFF',
    });
    expect(run.status).toBe('AUDITED');
    await expect(
      callerFor(specialist).payroll.triggerRun({
        cutoffStartDate: '2026-09-17',
        cutoffEndDate: '2026-09-30',
        paymentDate: '2026-10-01',
        cutoffSequence: 'SECOND_CUTOFF',
      }),
    ).rejects.toThrow();
    await expect(
      callerFor(specialist).payroll.triggerRun({
        cutoffStartDate: '2026-09-01',
        cutoffEndDate: '2026-09-15',
        paymentDate: '2026-09-16',
        cutoffSequence: 'FIRST_CUTOFF',
      }),
    ).rejects.toThrow();
    expect(await prisma.payrollRun.count({ where: { organizationId } })).toBe(
      1,
    );
    const slip = await prisma.payslip.findFirstOrThrow({
      where: { payrollRunId: run.id, employeeId },
    });
    const payment = await prisma.loanPayment.findFirstOrThrow({
      where: { loanId: loan.id, payslipId: slip.id },
    });
    expect(slip.grossPayCents).toBe(1500000n);
    expect(slip.loanDeductionsCents).toBe(1500000n);
    expect(slip.totalDeductionsCents + slip.netPayCents).toBe(
      slip.grossPayCents,
    );
    expect(payment.amountPaidCents).toBe(1500000n);
    expect(
      (await prisma.employeeLoan.findUniqueOrThrow({ where: { id: loan.id } }))
        .balanceCents,
    ).toBe(500000n);

    await expect(
      callerFor(specialist).payroll.approveRun({ runId: run.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await callerFor(hr).payroll.approveRun({ runId: run.id });
    await callerFor(specialist).payroll.cancelRun({ runId: run.id });
    expect(
      (await prisma.employeeLoan.findUniqueOrThrow({ where: { id: loan.id } }))
        .balanceCents,
    ).toBe(2000000n);
    expect(await prisma.loanPayment.count({ where: { loanId: loan.id } })).toBe(
      0,
    );
    expect(
      await prisma.payslip.count({ where: { payrollRunId: run.id } }),
    ).toBe(0);
  });

  it('credits approved full-day leave to a daily-paid employee without treating it as worked time', async () => {
    await prisma.employee.update({
      where: { id: employeeId },
      data: { payBasis: 'DAILY' },
    });
    await prisma.dailyTimeRecord.createMany({
      data: [
        // Explicit synthetic absences preserve the original two payable dates
        // while supplying complete cutoff coverage. Never infer these in payroll.
        ...approvedWeekdayDtrs(employeeId, '2026-11-01', '2026-11-15')
          .filter((row) => ![9, 10].includes((row.date as Date).getUTCDate()))
          .map((row) => ({ ...row, actualWorkedMinutes: 0, isAbsent: true })),
        {
          employeeId,
          date: new Date('2026-11-09'),
          actualWorkedMinutes: 480,
          isApproved: true,
        },
        {
          employeeId,
          date: new Date('2026-11-10'),
          actualWorkedMinutes: 0,
          isAbsent: true,
          isApproved: false,
        },
      ],
    });
    const leave = await callerFor(staff).leaves.request({
      employeeId,
      leaveType: 'SIL',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      daysCount: 1,
      isPaid: true,
      reason: 'Approved paid day off',
    });
    await callerFor(hr).leaves.approve({ requestId: leave.id });

    const run = await callerFor(specialist).payroll.triggerRun({
      cutoffStartDate: '2026-11-01',
      cutoffEndDate: '2026-11-15',
      paymentDate: '2026-11-16',
      cutoffSequence: 'FIRST_CUTOFF',
    });
    const slip = await prisma.payslip.findFirstOrThrow({
      where: { payrollRunId: run.id, employeeId },
    });
    expect(slip.paidLeavePayCents).toBe(137931n);
    expect(slip.basicPayCents).toBe(275859n);
    expect(slip.absenceDeductionCents).toBe(0n);
    expect(slip.thirteenthMonthAccrualCents).toBe(22988n);
  });

  it('pays only newly earned 13th-month amounts on a later disbursed true-up', async () => {
    const first = await prisma.payrollRun.findFirstOrThrow({
      where: {
        organizationId,
        cutoffSequence: 'FIRST_CUTOFF',
        cutoffEndDate: new Date('2026-11-15'),
      },
    });
    await callerFor(hr).payroll.approveRun({ runId: first.id });
    await callerFor(specialist).payroll.disburseRun({ runId: first.id });

    const initialBonus = await callerFor(
      specialist,
    ).payroll.triggerThirteenthMonthRun({
      cutoffStartDate: '2026-11-01',
      cutoffEndDate: '2026-11-15',
      paymentDate: '2026-11-20',
    });
    const initialSlip = await prisma.payslip.findFirstOrThrow({
      where: { payrollRunId: initialBonus.id, employeeId },
    });
    expect(initialSlip.bonusPaidCents).toBe(22988n);
    await callerFor(hr).payroll.approveRun({ runId: initialBonus.id });
    await callerFor(specialist).payroll.disburseRun({ runId: initialBonus.id });
    await expect(
      callerFor(specialist).payroll.cancelRun({ runId: first.id }),
    ).rejects.toThrow();

    await prisma.dailyTimeRecord.createMany({
      data: approvedWeekdayDtrs(employeeId, '2026-11-16', '2026-11-30').map(
        (row) =>
          (row.date as Date).getUTCDate() === 25
            ? row
            : { ...row, actualWorkedMinutes: 0, isAbsent: true },
      ),
    });
    const second = await callerFor(specialist).payroll.triggerRun({
      cutoffStartDate: '2026-11-16',
      cutoffEndDate: '2026-11-30',
      paymentDate: '2026-12-01',
      cutoffSequence: 'SECOND_CUTOFF',
    });
    await callerFor(hr).payroll.approveRun({ runId: second.id });
    await callerFor(specialist).payroll.disburseRun({ runId: second.id });

    const topUp = await callerFor(specialist).payroll.triggerThirteenthMonthRun(
      {
        cutoffStartDate: '2026-11-16',
        cutoffEndDate: '2026-11-30',
        paymentDate: '2026-12-02',
      },
    );
    const topUpSlip = await prisma.payslip.findFirstOrThrow({
      where: { payrollRunId: topUp.id, employeeId },
    });
    expect(topUpSlip.bonusPaidCents).toBe(11494n);
    expect(initialSlip.bonusPaidCents + topUpSlip.bonusPaidCents).toBe(34482n);
    await expect(
      callerFor(specialist).payroll.triggerThirteenthMonthRun({
        cutoffStartDate: '2026-11-17',
        cutoffEndDate: '2026-11-30',
        paymentDate: '2026-12-03',
      }),
    ).rejects.toThrow();
  });

  it('scopes the read-only year-end queue to disbursed payroll and the caller tenant', async () => {
    await expect(
      callerFor(staff).compliance.listYearEndReconciliations({ taxYear: 2026 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const foreign = await callerFor(
      foreignHr,
    ).compliance.listYearEndReconciliations({ taxYear: 2026 });
    expect(foreign.employeeCount).toBe(0);
    const beforeEvidence = await callerFor(
      specialist,
    ).compliance.listYearEndReconciliations({ taxYear: 2026 });
    expect(beforeEvidence.rows[0]?.status).toBe('BLOCKED_REVIEW');
    await expect(
      callerFor(staff).compliance.recordPriorEmployerDeclaration({
        employeeId,
        taxYear: 2026,
        hasPriorEmployer: false,
        sourceReference: 'HR-DECL-2026',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(foreignHr).compliance.recordPriorEmployerDeclaration({
        employeeId,
        taxYear: 2026,
        hasPriorEmployer: false,
        sourceReference: 'OTHER-ORG',
      }),
    ).rejects.toThrow();
    const declaration = await callerFor(
      hr,
    ).compliance.recordPriorEmployerDeclaration({
      employeeId,
      taxYear: 2026,
      hasPriorEmployer: false,
      sourceReference: 'HR-DECL-2026',
    });
    expect(declaration.recordedById).toBe(hr.id);
    await expect(
      callerFor(foreignHr).compliance.getTaxEvidence({
        employeeId,
        taxYear: 2026,
      }),
    ).rejects.toThrow();
    const recordedEvidence = await callerFor(
      specialist,
    ).compliance.getTaxEvidence({ employeeId, taxYear: 2026 });
    expect(recordedEvidence.selfReportedUnverified).toBe(true);
    expect(recordedEvidence.declaration?.sourceReference).toBe('HR-DECL-2026');
    await expect(
      callerFor(hr).compliance.recordPriorEmployerDeclaration({
        employeeId,
        taxYear: 2026,
        hasPriorEmployer: false,
        sourceReference: 'HR-DECL-2026',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const disbursed = await prisma.payslip.findMany({
      where: {
        employeeId,
        payrollRun: {
          organizationId,
          status: 'DISBURSED',
          paymentDate: {
            gte: new Date('2026-01-01'),
            lt: new Date('2027-01-01'),
          },
        },
      },
      include: { payrollRun: { select: { paymentDate: true } } },
    });
    for (const month of [11, 12]) {
      const withheld = disbursed
        .filter(
          (slip) => slip.payrollRun.paymentDate.getUTCMonth() + 1 === month,
        )
        .reduce((sum, slip) => sum + slip.withholdingTaxCents, 0n);
      const evidence = await callerFor(
        hr,
      ).compliance.recordMonthlyTaxRemittance({
        taxYear: 2026,
        month,
        remittedCents: withheld.toString(),
        documentReference: `TEST-1601C-${month}`,
      });
      expect(evidence.recordedById).toBe(hr.id);
    }
    const report = await callerFor(
      specialist,
    ).compliance.listYearEndReconciliations({ taxYear: 2026 });
    expect(report.reviewOnly).toBe(true);
    expect(report.employeeCount).toBe(1);
    expect(report.blockedCount).toBe(0);
    expect(report.rows[0]?.employeeId).toBe(employeeId);
    expect(report.rows[0]?.grossCents).toBe(
      disbursed.reduce((sum, slip) => sum + slip.grossPayCents, 0n),
    );
    expect(report.rows[0]?.taxWithheldCents).toBe(
      disbursed.reduce((sum, slip) => sum + slip.withholdingTaxCents, 0n),
    );
  });
});
