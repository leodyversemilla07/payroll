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
          hireDate: new Date('2025-01-01'),
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
        startDate: new Date('2026-01-01'),
        endDate: null,
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

  it('persists the full-day paid-leave credit within daily basic pay', async () => {
    const transaction = mockTransaction([]);
    const employee = (await transaction.employee.findMany())?.[0];
    employee.payBasis = 'DAILY';
    employee.compensation.basicRateDailyCents = 100000n;
    const service = new PayrollService({
      getCutoffAttendanceSummary: jest.fn().mockResolvedValue({
        ...attendance,
        regularHoursWorked: 0,
        paidLeaveDays: 10,
      }),
    } as never);

    await service.executePayrollRun({
      ...run,
      cutoffSequence: 'FIRST_CUTOFF',
      cutoffStartDate: new Date('2026-09-01'),
      cutoffEndDate: new Date('2026-09-15'),
      paymentDate: new Date('2026-09-16'),
    });

    const data = transaction.payslip.create.mock.calls[0]?.[0].data;
    expect(data.basicPayCents).toBe(1000000n);
    expect(data.paidLeavePayCents).toBe(1000000n);
    expect(data.absenceDeductionCents).toBe(0n);
    expect(data.thirteenthMonthAccrualCents).toBe(83333n);
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

  it('rejects a duplicate cutoff in the same month even with different dates', async () => {
    const tx = mockTransaction([]);
    tx.payrollRun.findFirst.mockResolvedValue({ id: 'prior-run' });

    await expect(
      new PayrollService({} as never).executePayrollRun({
        ...run,
        cutoffStartDate: new Date('2026-09-17'),
      }),
    ).rejects.toThrow(ConflictException);
    expect(tx.payrollRun.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: run.organizationId,
        cutoffSequence: 'SECOND_CUTOFF',
        cutoffEndDate: {
          gte: new Date('2026-09-01'),
          lt: new Date('2026-10-01'),
        },
        status: { not: 'CANCELLED' },
      },
      select: { id: true },
    });
    expect(tx.payrollRun.create).not.toHaveBeenCalled();
  });

  it('rejects overlapping first and second cutoffs in a month', async () => {
    const tx = mockTransaction([]);
    tx.payrollRun.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'overlapping-first' });
    await expect(
      new PayrollService({} as never).executePayrollRun({
        ...run,
        cutoffStartDate: new Date('2026-09-14'),
      }),
    ).rejects.toThrow(ConflictException);
    expect(tx.payrollRun.create).not.toHaveBeenCalled();
  });

  it('rejects a regular cutoff spanning two calendar months', async () => {
    const tx = mockTransaction([]);
    await expect(
      new PayrollService({} as never).executePayrollRun({
        ...run,
        cutoffStartDate: new Date('2026-08-31'),
      }),
    ).rejects.toThrow(
      'Regular payroll cutoffs must stay within one calendar month',
    );
    expect(tx.payrollRun.findFirst).not.toHaveBeenCalled();
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

describe('PayrollService regular employment eligibility', () => {
  beforeEach(() => jest.clearAllMocks());

  it('selects only active employees hired through the last cutoff date', async () => {
    const tx = mockTransaction([]);
    const timekeeping = {
      getCutoffAttendanceSummary: jest.fn().mockResolvedValue(attendance),
    };
    await new PayrollService(timekeeping as never).executePayrollRun(run);
    expect(tx.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: run.organizationId,
          employmentStatus: 'ACTIVE',
          hireDate: { lt: new Date('2026-10-01') },
        },
      }),
    );
  });

  it('fails before creating a run when there are no eligible employees', async () => {
    const tx = mockTransaction([]);
    tx.employee.findMany.mockResolvedValue([]);
    await expect(
      new PayrollService({} as never).executePayrollRun(run),
    ).rejects.toThrow('hired on or before the cutoff end date');
    expect(tx.payrollRun.create).not.toHaveBeenCalled();
  });

  it('blocks a monthly mid-cutoff hire until proration is supported', async () => {
    const tx = mockTransaction([]);
    const employee = (await tx.employee.findMany())[0];
    employee.hireDate = new Date('2026-09-21');
    const timekeeping = { getCutoffAttendanceSummary: jest.fn() };
    await expect(
      new PayrollService(timekeeping as never).executePayrollRun(run),
    ).rejects.toThrow('Employee EMP-1 was hired on 2026-09-21');
    expect(tx.payrollRun.create).not.toHaveBeenCalled();
    expect(timekeeping.getCutoffAttendanceSummary).not.toHaveBeenCalled();
    expect(tx.payslip.create).not.toHaveBeenCalled();
    expect(tx.loanPayment.create).not.toHaveBeenCalled();
  });

  it('accepts a monthly hire on the cutoff start civil date', async () => {
    const tx = mockTransaction([]);
    const employee = (await tx.employee.findMany())[0];
    employee.hireDate = new Date('2026-09-16T14:00:00Z');
    const timekeeping = {
      getCutoffAttendanceSummary: jest.fn().mockResolvedValue(attendance),
    };
    await new PayrollService(timekeeping as never).executePayrollRun(run);
    expect(timekeeping.getCutoffAttendanceSummary).toHaveBeenCalledWith(
      employee.id,
      run.organizationId,
      run.cutoffStartDate,
      run.cutoffEndDate,
      tx,
    );
  });

  it.each(['DAILY', 'HOURLY'])(
    'clamps %s attendance to the hire date',
    async (payBasis) => {
      const tx = mockTransaction([]);
      const employee = (await tx.employee.findMany())[0];
      employee.payBasis = payBasis;
      employee.hireDate = new Date('2026-09-21T08:00:00Z');
      const timekeeping = {
        getCutoffAttendanceSummary: jest
          .fn()
          .mockResolvedValue({ ...attendance, regularHoursWorked: 64 }),
      };
      await new PayrollService(timekeeping as never).executePayrollRun(run);
      expect(timekeeping.getCutoffAttendanceSummary).toHaveBeenCalledWith(
        employee.id,
        run.organizationId,
        new Date('2026-09-21'),
        run.cutoffEndDate,
        tx,
      );
    },
  );

  it.each([
    ['2026-09-17', '2026-09-30', 'SECOND_CUTOFF'],
    ['2026-09-16', '2026-09-29', 'SECOND_CUTOFF'],
    ['2026-09-01', '2026-09-14', 'FIRST_CUTOFF'],
    ['2026-09-16', '2026-09-30', 'FIRST_CUTOFF'],
    ['2026-09-01', '2026-09-30', 'FIRST_CUTOFF'],
  ] as const)(
    'blocks custom monthly period %s–%s (%s)',
    async (start, end, sequence) => {
      const tx = mockTransaction([]);
      await expect(
        new PayrollService({} as never).executePayrollRun({
          ...run,
          cutoffStartDate: new Date(start),
          cutoffEndDate: new Date(end),
          cutoffSequence: sequence,
        }),
      ).rejects.toThrow('full standard cutoff');
      expect(tx.payrollRun.create).not.toHaveBeenCalled();
    },
  );

  it.each(['2026-02-28', '2028-02-29', '2026-10-31'])(
    'accepts month-end cutoff through %s',
    async (end) => {
      const tx = mockTransaction([]);
      const timekeeping = {
        getCutoffAttendanceSummary: jest.fn().mockResolvedValue(attendance),
      };
      await new PayrollService(timekeeping as never).executePayrollRun({
        ...run,
        cutoffStartDate: new Date(`${end.slice(0, 7)}-16`),
        cutoffEndDate: new Date(end),
        paymentDate: new Date(end),
      });
      expect(tx.payslip.create).toHaveBeenCalledTimes(1);
    },
  );

  it('identifies the employee in an attendance coverage failure', async () => {
    const tx = mockTransaction([]);
    const timekeeping = {
      getCutoffAttendanceSummary: jest
        .fn()
        .mockRejectedValue(
          new UnprocessableEntityException('Incomplete attendance: 2026-09-21'),
        ),
    };
    await expect(
      new PayrollService(timekeeping as never).executePayrollRun(run),
    ).rejects.toThrow('Employee EMP-1: Incomplete attendance: 2026-09-21');
    expect(tx.payslip.create).not.toHaveBeenCalled();
    expect(tx.loanPayment.create).not.toHaveBeenCalled();
  });
});
