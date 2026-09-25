import { UnprocessableEntityException } from '@nestjs/common';
import { prisma } from '@workspace/db';
import { EmployeesService } from './employees.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    employee: { findFirst: jest.fn() },
    payslip: { findMany: jest.fn() },
  },
}));

const request = {
  employeeId: 'employee-1',
  organizationId: 'org-1',
  separationType: 'RESIGNATION' as const,
  exitDate: new Date('2026-09-30'),
  unusedLeaveDays: 0,
};
const employee = {
  id: 'employee-1',
  firstName: 'Test',
  lastName: 'Employee',
  employeeNumber: 'EMP-1',
  tin: '123',
  hireDate: new Date('2025-01-01'),
  dateOfBirth: new Date('1990-01-01'),
  loans: [],
  leaveBalances: [],
  compensation: {
    basicRateMonthlyCents: 3000000n,
    basicRateDailyCents: 137931n,
    isTaxExempt: false,
  },
};
const regularSlip = {
  basicPayCents: 1500000n,
  tardinessDeductionCents: 0n,
  undertimeDeductionCents: 0n,
  absenceDeductionCents: 100000n,
  grossPayCents: 1400000n,
  nonTaxableAllowancesCents: 0n,
  sssEmployeeCents: 100000n,
  philhealthEmployeeCents: 0n,
  pagibigEmployeeCents: 0n,
  withholdingTaxCents: 10000n,
  bonusPaidCents: 0n,
  deMinimisExcessCents: 0n,
  payrollRun: {
    cutoffSequence: 'FIRST_CUTOFF',
    cutoffEndDate: new Date('2026-09-15'),
  },
};
const specialSlip = {
  ...regularSlip,
  basicPayCents: 0n,
  absenceDeductionCents: 0n,
  grossPayCents: 50000n,
  nonTaxableAllowancesCents: 50000n,
  sssEmployeeCents: 0n,
  withholdingTaxCents: 0n,
  bonusPaidCents: 50000n,
  payrollRun: {
    cutoffSequence: 'SPECIAL_RUN',
    cutoffEndDate: new Date('2026-09-20'),
  },
};

describe('EmployeesService final pay settlement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(employee as never);
    jest
      .mocked(prisma.payslip.findMany)
      .mockResolvedValue([regularSlip, specialSlip] as never);
  });

  it('uses disbursed ledger amounts, credits an earlier bonus and refunds actual withheld tax', async () => {
    const result = await new EmployeesService().calculateFinalPaySettlement(
      request,
    );

    expect(prisma.payslip.findMany).toHaveBeenCalledWith({
      where: {
        employeeId: 'employee-1',
        payrollRun: {
          organizationId: 'org-1',
          status: 'DISBURSED',
          paymentDate: {
            gte: new Date('2026-01-01'),
            lt: new Date('2026-10-01'),
          },
        },
      },
      include: expect.any(Object),
    });
    expect(result.proratedThirteenthMonthCents).toBe(66666n);
    expect(result.taxAdjustmentCents).toBe(-10000n);
    expect(result.yearsOfService).toBeGreaterThan(1);
  });

  it('does not credit a prior-year 13th-month payout paid this tax year', async () => {
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      regularSlip,
      {
        ...specialSlip,
        payrollRun: {
          cutoffSequence: 'SPECIAL_RUN',
          cutoffEndDate: new Date('2025-12-20'),
        },
      },
    ] as never);
    const result = await new EmployeesService().calculateFinalPaySettlement(
      request,
    );
    expect(result.proratedThirteenthMonthCents).toBe(116666n);
  });

  it('refuses to estimate annual pay without disbursed regular payroll', async () => {
    jest
      .mocked(prisma.payslip.findMany)
      .mockResolvedValue([specialSlip] as never);
    await expect(
      new EmployeesService().calculateFinalPaySettlement(request),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
