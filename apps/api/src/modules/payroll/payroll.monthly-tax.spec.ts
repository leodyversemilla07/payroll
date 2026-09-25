import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { prisma } from '@workspace/db';
import {
  type AttendanceSummary,
  calculateWithholdingTax,
} from '@workspace/payroll-engine';
import { PayrollService } from './payroll.service';

jest.mock('@workspace/db', () => ({
  prisma: { $transaction: jest.fn() },
  Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
}));

const attendance: AttendanceSummary = {
  regularHoursWorked: 80,
  tardinessMinutes: 0,
  undertimeMinutes: 0,
  absentDays: 0,
  regularOvertimeHours: 0,
  restDayHours: 0,
  restDayOvertimeHours: 0,
  specialHolidayHours: 0,
  specialHolidayOvertimeHours: 0,
  specialHolidayRestDayHours: 0,
  specialHolidayRestDayOvertimeHours: 0,
  regularHolidayHours: 0,
  regularHolidayOvertimeHours: 0,
  regularHolidayRestDayHours: 0,
  regularHolidayRestDayOvertimeHours: 0,
  regularNightDiffHours: 0,
  overtimeNightDiffHours: 0,
  restDayNightDiffHours: 0,
  holidayNightDiffHours: 0,
};

const run = {
  organizationId: 'organization-1',
  processedById: 'processor-1',
  cutoffStartDate: new Date('2026-09-16'),
  cutoffEndDate: new Date('2026-09-30'),
  paymentDate: new Date('2026-10-01'),
  cutoffSequence: 'SECOND_CUTOFF' as const,
};

function mockTransaction(
  priorPayslips: Array<Record<string, bigint | string>>,
) {
  const transaction = {
    payrollRun: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'run-2' }),
      update: jest.fn().mockResolvedValue({ id: 'run-2', status: 'AUDITED' }),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'employee-1',
          employeeNumber: 'EMP-1',
          payBasis: 'MONTHLY',
          compensation: {
            basicRateMonthlyCents: 3000000n,
            basicRateDailyCents: 137931n,
            basicRateHourlyCents: 17241n,
            isTaxExempt: false,
          },
          allowances: [],
          loans: [],
        },
      ]),
    },
    payslip: {
      findMany: jest.fn().mockResolvedValue(priorPayslips),
      aggregate: jest.fn().mockResolvedValue({ _sum: {} }),
      create: jest.fn().mockResolvedValue({ id: 'payslip-2' }),
    },
    employeeLoan: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    loanPayment: {
      create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
    },
  };
  jest
    .mocked(prisma.$transaction)
    .mockImplementation(async (callback: unknown) =>
      (callback as (tx: typeof transaction) => Promise<unknown>)(transaction),
    );
  return transaction;
}

describe('PayrollService monthly tax reconciliation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the actual first-cutoff payslip in the same month and withholds the monthly difference', async () => {
    const transaction = mockTransaction([
      {
        employeeId: 'employee-1',
        grossPayCents: 1400000n,
        nonTaxableAllowancesCents: 0n,
        sssEmployeeCents: 150000n,
        philhealthEmployeeCents: 0n,
        pagibigEmployeeCents: 0n,
        withholdingTaxCents: 0n,
      },
    ]);
    const service = new PayrollService({
      getCutoffAttendanceSummary: jest.fn().mockResolvedValue(attendance),
    } as never);

    await service.executePayrollRun(run);

    expect(transaction.payslip.findMany).toHaveBeenCalledWith({
      where: {
        payrollRun: {
          organizationId: run.organizationId,
          cutoffSequence: 'FIRST_CUTOFF',
          cutoffEndDate: {
            gte: new Date('2026-09-01'),
            lt: new Date('2026-09-30'),
          },
          status: { in: ['AUDITED', 'APPROVED', 'DISBURSED'] },
        },
      },
      select: expect.any(Object),
    });
    const data = transaction.payslip.create.mock.calls[0]?.[0].data;
    expect(data.withholdingTaxCents).toBe(
      calculateWithholdingTax(1250000n + 1500000n, false),
    );
  });

  it('uses zero prior taxable income if the employee has no first-cutoff payslip', async () => {
    const transaction = mockTransaction([]);
    const service = new PayrollService({
      getCutoffAttendanceSummary: jest.fn().mockResolvedValue(attendance),
    } as never);

    await service.executePayrollRun(run);

    const data = transaction.payslip.create.mock.calls[0]?.[0].data;
    expect(data.withholdingTaxCents).toBe(
      calculateWithholdingTax(1500000n, false),
    );
  });

  it('posts only an affordable partial loan payment and leaves the remainder outstanding', async () => {
    const transaction = mockTransaction([]);
    const employee = (await transaction.employee.findMany())?.[0];
    employee.loans = [
      {
        id: 'loan-1',
        loanType: 'SSS_SALARY_LOAN',
        amortizationCents: 2000000n,
        balanceCents: 2500000n,
      },
    ];
    const service = new PayrollService({
      getCutoffAttendanceSummary: jest.fn().mockResolvedValue(attendance),
    } as never);

    await service.executePayrollRun(run);

    const payslip = transaction.payslip.create.mock.calls[0]?.[0].data;
    expect(payslip.loanDeductionsCents).toBe(1500000n);
    expect(payslip.totalDeductionsCents + payslip.netPayCents).toBe(
      payslip.grossPayCents,
    );
    expect(transaction.employeeLoan.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'loan-1',
        employeeId: 'employee-1',
        isActive: true,
        balanceCents: 2500000n,
      },
      data: { balanceCents: 1000000n, isActive: true },
    });
    expect(transaction.loanPayment.create).toHaveBeenCalledWith({
      data: {
        loanId: 'loan-1',
        payslipId: 'payslip-2',
        amountPaidCents: 1500000n,
        balanceAfterCents: 1000000n,
      },
    });
  });

  it('aborts the entire run if earnings cannot cover statutory deductions', async () => {
    const transaction = mockTransaction([]);
    const service = new PayrollService({
      getCutoffAttendanceSummary: jest.fn().mockResolvedValue({
        ...attendance,
        absentDays: 15,
      }),
    } as never);

    await expect(
      service.executePayrollRun({
        ...run,
        cutoffSequence: 'FIRST_CUTOFF',
        cutoffStartDate: new Date('2026-09-01'),
        cutoffEndDate: new Date('2026-09-15'),
        paymentDate: new Date('2026-09-16'),
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(transaction.payslip.create).not.toHaveBeenCalled();
    expect(transaction.loanPayment.create).not.toHaveBeenCalled();
  });

  it('rejects a late first cutoff after the second cutoff was posted', async () => {
    const transaction = mockTransaction([]);
    transaction.payrollRun.findFirst.mockResolvedValue({ id: 'run-2' });
    const service = new PayrollService({} as never);

    await expect(
      service.executePayrollRun({
        ...run,
        cutoffSequence: 'FIRST_CUTOFF',
        cutoffStartDate: new Date('2026-09-01'),
        cutoffEndDate: new Date('2026-09-15'),
        paymentDate: new Date('2026-09-16'),
      }),
    ).rejects.toThrow(ConflictException);
  });
});
