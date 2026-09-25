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
      findMany: jest.fn().mockResolvedValue([]),
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

  it('releases only the unpaid balance after an earlier disbursed 13th-month run', async () => {
    const tx = mockTransaction();
    tx.payrollRun.findMany.mockResolvedValue([
      { status: 'DISBURSED', cutoffEndDate: new Date('2026-11-30') },
    ]);
    tx.payslip.aggregate.mockResolvedValue({
      _sum: { bonusPaidCents: 1000000n, deMinimisExcessCents: 0n },
    });

    await new PayrollService({} as never).executeThirteenthMonthRun(run);
    const payout = tx.payslip.create.mock.calls[0]?.[0].data;
    expect(payout.bonusPaidCents).toBe(1991666n);
    expect(payout.grossPayCents).toBe(1991666n);
  });

  it('rejects an undistributed or out-of-order special run', async () => {
    const tx = mockTransaction();
    tx.payrollRun.findMany.mockResolvedValue([
      { status: 'AUDITED', cutoffEndDate: new Date('2026-11-30') },
    ]);
    await expect(
      new PayrollService({} as never).executeThirteenthMonthRun(run),
    ).rejects.toThrow(ConflictException);
    tx.payrollRun.findMany.mockResolvedValue([
      { status: 'DISBURSED', cutoffEndDate: new Date('2026-12-20') },
    ]);
    await expect(
      new PayrollService({} as never).executeThirteenthMonthRun(run),
    ).rejects.toThrow(ConflictException);
    expect(tx.payrollRun.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate special run without any newly earned pay', async () => {
    const tx = mockTransaction();
    tx.payrollRun.findMany.mockResolvedValue([
      { status: 'DISBURSED', cutoffEndDate: new Date('2026-11-30') },
    ]);
    tx.payslip.aggregate.mockResolvedValue({
      _sum: { bonusPaidCents: 2991666n, deMinimisExcessCents: 0n },
    });
    await expect(
      new PayrollService({} as never).executeThirteenthMonthRun(run),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(tx.payslip.create).not.toHaveBeenCalled();
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
