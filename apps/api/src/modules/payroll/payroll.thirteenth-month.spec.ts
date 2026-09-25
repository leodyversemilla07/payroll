import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { prisma } from '@workspace/db';
import { PayrollService } from './payroll.service';

jest.mock('@workspace/db', () => ({
  prisma: { $transaction: jest.fn() },
  Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
}));

const run = {
  organizationId: 'org-1',
  processedById: 'processor-1',
  cutoffStartDate: new Date('2026-12-01'),
  cutoffEndDate: new Date('2026-12-20'),
  paymentDate: new Date('2026-12-21'),
};

function mockTransaction() {
  const transaction = {
    payrollRun: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'special-1' }),
      update: jest
        .fn()
        .mockResolvedValue({ id: 'special-1', status: 'AUDITED' }),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'employee-1',
          employeeNumber: 'EMP-1',
          firstName: 'Test',
          lastName: 'Worker',
          hireDate: new Date('2025-01-01'),
          payBasis: 'MONTHLY',
          compensation: {
            basicRateMonthlyCents: 5000000n,
            basicRateDailyCents: 230000n,
            basicRateHourlyCents: 28750n,
            isTaxExempt: false,
          },
        },
      ]),
    },
    payslip: {
      findMany: jest.fn().mockResolvedValue([
        {
          basicPayCents: 18000000n,
          tardinessDeductionCents: 0n,
          undertimeDeductionCents: 0n,
          absenceDeductionCents: 100000n,
        },
        {
          basicPayCents: 18000000n,
          tardinessDeductionCents: 0n,
          undertimeDeductionCents: 0n,
          absenceDeductionCents: 0n,
        },
      ]),
      aggregate: jest.fn().mockResolvedValue({ _sum: {} }),
      create: jest.fn().mockResolvedValue({ id: 'payslip-1' }),
    },
  };
  jest
    .mocked(prisma.$transaction)
    .mockImplementation(async (callback: unknown) =>
      (callback as (tx: typeof transaction) => Promise<unknown>)(transaction),
    );
  return transaction;
}

describe('PayrollService 13th-month runs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pays 1/12 of disbursed regular basic earnings instead of current salary', async () => {
    const tx = mockTransaction();
    await new PayrollService({} as never).executeThirteenthMonthRun(run);

    expect(tx.payslip.findMany).toHaveBeenCalledWith({
      where: {
        employeeId: 'employee-1',
        payrollRun: {
          organizationId: 'org-1',
          cutoffSequence: { in: ['FIRST_CUTOFF', 'SECOND_CUTOFF'] },
          status: 'DISBURSED',
          cutoffEndDate: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-12-20'),
          },
        },
      },
      select: expect.any(Object),
    });
    const payout = tx.payslip.create.mock.calls[0]?.[0].data;
    expect(payout.bonusPaidCents).toBe(2991666n); // (36m - 100k) / 12
    expect(payout.grossPayCents).toBe(payout.bonusPaidCents);
  });

  it('rejects a second annual run with different cutoff dates', async () => {
    const tx = mockTransaction();
    tx.payrollRun.findFirst.mockResolvedValue({ id: 'prior-special' });

    await expect(
      new PayrollService({} as never).executeThirteenthMonthRun({
        ...run,
        cutoffStartDate: new Date('2026-12-15'),
      }),
    ).rejects.toThrow(ConflictException);
    expect(tx.payrollRun.create).not.toHaveBeenCalled();
    expect(tx.payrollRun.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        cutoffSequence: 'SPECIAL_RUN',
        cutoffEndDate: {
          gte: new Date('2026-01-01'),
          lt: new Date('2027-01-01'),
        },
        status: { not: 'CANCELLED' },
      },
      select: { id: true },
    });
  });

  it('does not issue a projected payout without disbursed regular earnings', async () => {
    const tx = mockTransaction();
    tx.payslip.findMany.mockResolvedValue([]);

    await expect(
      new PayrollService({} as never).executeThirteenthMonthRun(run),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(tx.payslip.create).not.toHaveBeenCalled();
  });
});
