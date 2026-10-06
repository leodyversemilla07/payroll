import { BadRequestException, NotFoundException } from '@nestjs/common';
import { prisma } from '@workspace/db';
import { LoansService } from './loans.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    employeeLoan: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    employee: {
      findFirst: jest.fn(),
    },
    loanPayment: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe('LoansService', () => {
  const service = new LoansService();

  const sampleLoan = {
    id: 'loan-1',
    employeeId: 'emp-1',
    loanType: 'SSS_SALARY_LOAN' as const,
    referenceNumber: 'SSS-REF-001',
    principalCents: 3000000n,
    totalAmountCents: 3000000n,
    amortizationCents: 125000n,
    balanceCents: 2500000n,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2027-01-01'),
    isActive: true,
    createdAt: new Date('2026-01-01'),
    employee: {
      id: 'emp-1',
      employeeNumber: 'EMP-001',
      firstName: 'Maria',
      lastName: 'Santos',
      department: { name: 'Engineering' },
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('listAllActiveLoans', () => {
    it('returns active loans for the organization', async () => {
      jest
        .mocked(prisma.employeeLoan.findMany)
        .mockResolvedValue([sampleLoan] as never);

      const result = await service.listAllActiveLoans('org-1');
      expect(result).toEqual([sampleLoan]);
      expect(prisma.employeeLoan.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          employee: { organizationId: 'org-1' },
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              department: {
                select: { name: true },
              },
            },
          },
          _count: {
            select: { payments: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('listLoans', () => {
    it('applies filters for status, type, and search', async () => {
      jest
        .mocked(prisma.employeeLoan.findMany)
        .mockResolvedValue([sampleLoan] as never);

      const result = await service.listLoans('org-1', {
        status: 'ACTIVE',
        loanType: 'SSS_SALARY_LOAN',
        employeeId: 'emp-1',
        search: 'Maria',
      });

      expect(result).toEqual([sampleLoan]);
      expect(prisma.employeeLoan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            loanType: 'SSS_SALARY_LOAN',
            employeeId: 'emp-1',
            employee: { organizationId: 'org-1' },
            OR: expect.any(Array),
          }),
        }),
      );
    });

    it('filters by status PAID (isActive: false)', async () => {
      jest.mocked(prisma.employeeLoan.findMany).mockResolvedValue([] as never);

      await service.listLoans('org-1', { status: 'PAID' });
      expect(prisma.employeeLoan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            employee: { organizationId: 'org-1' },
            isActive: false,
          },
        }),
      );
    });
  });

  describe('getLoanSummary', () => {
    it('returns aggregated loan statistics', async () => {
      jest.mocked(prisma.employeeLoan.aggregate).mockResolvedValue({
        _count: 5,
        _sum: {
          balanceCents: 15000000n,
          principalCents: 20000000n,
          amortizationCents: 1000000n,
        },
      } as never);
      jest.mocked(prisma.employeeLoan.count).mockResolvedValue(8);

      const summary = await service.getLoanSummary('org-1');
      expect(summary).toEqual({
        activeCount: 5,
        totalCount: 8,
        totalBalanceCents: 15000000n,
        totalPrincipalCents: 20000000n,
        totalAmortizationPerCutoffCents: 1000000n,
      });
    });
  });

  describe('getLoanDetails', () => {
    it('returns full loan details including payment history', async () => {
      jest
        .mocked(prisma.employeeLoan.findFirst)
        .mockResolvedValue(sampleLoan as never);

      const result = await service.getLoanDetails('loan-1', 'org-1');
      expect(result).toEqual(sampleLoan);
      expect(prisma.employeeLoan.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'loan-1',
          employee: { organizationId: 'org-1' },
        },
        include: expect.objectContaining({
          employee: expect.any(Object),
          payments: expect.any(Object),
        }),
      });
    });

    it('throws NotFoundException if loan not found', async () => {
      jest.mocked(prisma.employeeLoan.findFirst).mockResolvedValue(null);

      await expect(
        service.getLoanDetails('loan-missing', 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyLoans', () => {
    it('returns employee self loans', async () => {
      jest
        .mocked(prisma.employeeLoan.findMany)
        .mockResolvedValue([sampleLoan] as never);

      const result = await service.getMyLoans('emp-1', 'org-1');
      expect(result).toEqual([sampleLoan]);
      expect(prisma.employeeLoan.findMany).toHaveBeenCalledWith({
        where: {
          employeeId: 'emp-1',
          employee: { organizationId: 'org-1' },
        },
        include: expect.objectContaining({
          payments: expect.any(Object),
        }),
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      });
    });
  });

  describe('createLoan', () => {
    it('creates a new loan when employee exists', async () => {
      jest
        .mocked(prisma.employee.findFirst)
        .mockResolvedValue({ id: 'emp-1' } as never);
      jest
        .mocked(prisma.employeeLoan.create)
        .mockResolvedValue(sampleLoan as never);

      const loan = await service.createLoan({
        employeeId: 'emp-1',
        organizationId: 'org-1',
        loanType: 'SSS_SALARY_LOAN',
        referenceNumber: 'REF-123',
        principalCents: 3000000n,
        totalAmountCents: 3000000n,
        amortizationCents: 125000n,
        startDate: new Date('2026-01-01'),
      });

      expect(loan).toEqual(sampleLoan);
      expect(prisma.employeeLoan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          employeeId: 'emp-1',
          balanceCents: 3000000n,
          isActive: true,
        }),
        include: expect.any(Object),
      });
    });

    it('throws NotFoundException if employee not found in organization', async () => {
      jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);

      await expect(
        service.createLoan({
          employeeId: 'emp-missing',
          organizationId: 'org-1',
          loanType: 'SSS_SALARY_LOAN',
          principalCents: 100000n,
          totalAmountCents: 100000n,
          amortizationCents: 10000n,
          startDate: new Date('2026-01-01'),
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordManualPayment', () => {
    it('throws BadRequestException if amount is zero or negative', async () => {
      await expect(
        service.recordManualPayment({
          loanId: 'loan-1',
          organizationId: 'org-1',
          amountCents: 0n,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('records partial manual payment and updates balance', async () => {
      const mockTx = {
        employeeLoan: {
          findFirst: jest.fn().mockResolvedValue({
            ...sampleLoan,
            balanceCents: 200000n,
            isActive: true,
          }),
          update: jest.fn().mockResolvedValue({
            ...sampleLoan,
            balanceCents: 100000n,
            isActive: true,
          }),
        },
        loanPayment: {
          create: jest.fn().mockResolvedValue({
            id: 'pay-1',
            loanId: 'loan-1',
            amountPaidCents: 100000n,
            balanceAfterCents: 100000n,
          }),
        },
      };
      jest
        .mocked(prisma.$transaction)
        .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockTx));

      const result = await service.recordManualPayment({
        loanId: 'loan-1',
        organizationId: 'org-1',
        amountCents: 100000n,
      });

      expect(mockTx.employeeLoan.update).toHaveBeenCalledWith({
        where: { id: 'loan-1' },
        data: {
          balanceCents: 100000n,
          isActive: true,
        },
      });
      expect(mockTx.loanPayment.create).toHaveBeenCalledWith({
        data: {
          loanId: 'loan-1',
          amountPaidCents: 100000n,
          balanceAfterCents: 100000n,
        },
      });
      expect(result.loan.balanceCents).toBe(100000n);
    });

    it('settles loan fully and marks isActive false when balance reaches zero', async () => {
      const mockTx = {
        employeeLoan: {
          findFirst: jest.fn().mockResolvedValue({
            ...sampleLoan,
            balanceCents: 200000n,
            isActive: true,
          }),
          update: jest.fn().mockResolvedValue({
            ...sampleLoan,
            balanceCents: 0n,
            isActive: false,
          }),
        },
        loanPayment: {
          create: jest.fn().mockResolvedValue({
            id: 'pay-2',
            loanId: 'loan-1',
            amountPaidCents: 200000n,
            balanceAfterCents: 0n,
          }),
        },
      };
      jest
        .mocked(prisma.$transaction)
        .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockTx));

      const result = await service.recordManualPayment({
        loanId: 'loan-1',
        organizationId: 'org-1',
        amountCents: 200000n,
      });

      expect(mockTx.employeeLoan.update).toHaveBeenCalledWith({
        where: { id: 'loan-1' },
        data: {
          balanceCents: 0n,
          isActive: false,
        },
      });
      expect(result.loan.isActive).toBe(false);
    });

    it('throws BadRequestException if payment exceeds remaining balance', async () => {
      const mockTx = {
        employeeLoan: {
          findFirst: jest.fn().mockResolvedValue({
            ...sampleLoan,
            balanceCents: 50000n,
            isActive: true,
          }),
        },
      };
      jest
        .mocked(prisma.$transaction)
        .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockTx));

      await expect(
        service.recordManualPayment({
          loanId: 'loan-1',
          organizationId: 'org-1',
          amountCents: 100000n,
        }),
      ).rejects.toThrow('Payment amount exceeds remaining balance');
    });
  });

  describe('deactivateLoan', () => {
    it('deactivates active loan', async () => {
      jest
        .mocked(prisma.employeeLoan.findFirst)
        .mockResolvedValue(sampleLoan as never);
      jest
        .mocked(prisma.employeeLoan.update)
        .mockResolvedValue({ ...sampleLoan, isActive: false } as never);

      const result = await service.deactivateLoan('loan-1', 'org-1');
      expect(result.isActive).toBe(false);
      expect(prisma.employeeLoan.update).toHaveBeenCalledWith({
        where: { id: 'loan-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException if loan not found', async () => {
      jest.mocked(prisma.employeeLoan.findFirst).mockResolvedValue(null);

      await expect(
        service.deactivateLoan('loan-missing', 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
