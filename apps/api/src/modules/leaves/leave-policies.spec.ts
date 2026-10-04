import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, prisma } from '@workspace/db';
import {
  calculateTenureMonths,
  createLeavePolicy,
  deleteLeavePolicy,
  getLeavePolicyById,
  listLeavePolicies,
  runLeaveAccrual,
  runLeaveCarryover,
  updateLeavePolicy,
} from './leave-policies';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: {
    leavePolicy: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    employee: {
      findMany: jest.fn(),
    },
    leaveBalance: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    leaveCreditChange: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe('Leave Policies, Accruals, and Carryover Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateTenureMonths', () => {
    it('calculates completed months correctly across same year', () => {
      const hireDate = new Date(Date.UTC(2026, 0, 15)); // Jan 15, 2026
      const asOf = new Date(Date.UTC(2026, 6, 15)); // Jul 15, 2026
      expect(calculateTenureMonths(hireDate, asOf)).toBe(6);
    });

    it('subtracts 1 month if asOf day is before hire day', () => {
      const hireDate = new Date(Date.UTC(2026, 0, 15)); // Jan 15, 2026
      const asOf = new Date(Date.UTC(2026, 6, 14)); // Jul 14, 2026
      expect(calculateTenureMonths(hireDate, asOf)).toBe(5);
    });

    it('calculates completed months across multi-year boundaries', () => {
      const hireDate = new Date(Date.UTC(2024, 5, 1)); // Jun 1, 2024
      const asOf = new Date(Date.UTC(2026, 11, 31)); // Dec 31, 2026
      expect(calculateTenureMonths(hireDate, asOf)).toBe(30);
    });
  });

  describe('createLeavePolicy', () => {
    it('creates a valid leave policy with uppercase formatting', async () => {
      (prisma.leavePolicy.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.leavePolicy.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'policy-1', ...data }),
      );

      const policy = await createLeavePolicy(
        {
          organizationId: 'org-1',
          leaveType: 'vacation',
          annualCredits: 15,
          accrualFrequency: 'MONTHLY',
          carryoverPolicy: 'CAPPED',
          maxCarryoverDays: 5,
          eligibleAfterMonths: 6,
        },
        'user-1',
      );

      expect(policy.leaveType).toBe('VACATION');
      expect(prisma.leavePolicy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          leaveType: 'VACATION',
          accrualFrequency: 'MONTHLY',
          carryoverPolicy: 'CAPPED',
          eligibleAfterMonths: 6,
          createdById: 'user-1',
        }),
      });
    });

    it('rejects policy creation if leaveType already exists in organization', async () => {
      (prisma.leavePolicy.findFirst as jest.Mock).mockResolvedValue({
        id: 'existing-1',
        leaveType: 'VACATION',
      });

      await expect(
        createLeavePolicy({
          organizationId: 'org-1',
          leaveType: 'VACATION',
          annualCredits: 15,
          accrualFrequency: 'ANNUAL',
          carryoverPolicy: 'NO_CARRYOVER',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects invalid leaveType codes', async () => {
      await expect(
        createLeavePolicy({
          organizationId: 'org-1',
          leaveType: '123_invalid',
          annualCredits: 15,
          accrualFrequency: 'ANNUAL',
          carryoverPolicy: 'NO_CARRYOVER',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects non-half-day increments for annualCredits', async () => {
      await expect(
        createLeavePolicy({
          organizationId: 'org-1',
          leaveType: 'VACATION',
          annualCredits: 12.33,
          accrualFrequency: 'ANNUAL',
          carryoverPolicy: 'NO_CARRYOVER',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects CAPPED carryover policy without maxCarryoverDays', async () => {
      await expect(
        createLeavePolicy({
          organizationId: 'org-1',
          leaveType: 'VACATION',
          annualCredits: 15,
          accrualFrequency: 'ANNUAL',
          carryoverPolicy: 'CAPPED',
          maxCarryoverDays: null,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('listLeavePolicies & getLeavePolicyById', () => {
    it('lists active policies by default', async () => {
      const mockList = [
        { id: 'pol-1', leaveType: 'SIL', isActive: true },
        { id: 'pol-2', leaveType: 'VACATION', isActive: true },
      ];
      (prisma.leavePolicy.findMany as jest.Mock).mockResolvedValue(mockList);

      const result = await listLeavePolicies('org-1');
      expect(result).toEqual(mockList);
      expect(prisma.leavePolicy.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isActive: true },
        orderBy: { leaveType: 'asc' },
      });
    });

    it('throws NotFoundException when policy not found', async () => {
      (prisma.leavePolicy.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(getLeavePolicyById('missing-id', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateLeavePolicy & deleteLeavePolicy', () => {
    it('updates existing policy fields safely', async () => {
      const existing = {
        id: 'pol-1',
        organizationId: 'org-1',
        leaveType: 'VACATION',
        annualCredits: new Prisma.Decimal(15),
        accrualFrequency: 'ANNUAL',
        carryoverPolicy: 'NO_CARRYOVER',
        maxCarryoverDays: null,
        eligibleAfterMonths: 6,
        isActive: true,
      };
      (prisma.leavePolicy.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.leavePolicy.update as jest.Mock).mockResolvedValue({
        ...existing,
        annualCredits: new Prisma.Decimal(18),
        carryoverPolicy: 'CAPPED',
        maxCarryoverDays: new Prisma.Decimal(5),
      });

      const updated = await updateLeavePolicy('pol-1', 'org-1', {
        annualCredits: 18,
        carryoverPolicy: 'CAPPED',
        maxCarryoverDays: 5,
      });

      expect(updated.carryoverPolicy).toBe('CAPPED');
      expect(prisma.leavePolicy.update).toHaveBeenCalled();
    });

    it('deletes an existing policy', async () => {
      const existing = { id: 'pol-1', organizationId: 'org-1' };
      (prisma.leavePolicy.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.leavePolicy.delete as jest.Mock).mockResolvedValue(existing);

      const deleted = await deleteLeavePolicy('pol-1', 'org-1');
      expect(deleted.id).toBe('pol-1');
      expect(prisma.leavePolicy.delete).toHaveBeenCalledWith({
        where: { id: 'pol-1' },
      });
    });
  });

  describe('runLeaveAccrual', () => {
    const mockPolicy = {
      id: 'pol-1',
      organizationId: 'org-1',
      leaveType: 'VACATION',
      annualCredits: new Prisma.Decimal(15),
      accrualFrequency: 'MONTHLY',
      eligibleAfterMonths: 6,
      isActive: true,
    };

    const eligibleEmployee = {
      id: 'emp-1',
      employeeNumber: 'EMP-001',
      firstName: 'Maria',
      lastName: 'Santos',
      hireDate: new Date('2025-01-01'), // > 6 months tenure
    };

    const ineligibleEmployee = {
      id: 'emp-2',
      employeeNumber: 'EMP-002',
      firstName: 'Juan',
      lastName: 'Reyes',
      hireDate: new Date('2026-05-01'), // < 6 months tenure for June
    };

    it('runs dryRun accrual preview without writing database changes', async () => {
      (prisma.leavePolicy.findMany as jest.Mock).mockResolvedValue([
        mockPolicy,
      ]);
      (prisma.employee.findMany as jest.Mock).mockResolvedValue([
        eligibleEmployee,
        ineligibleEmployee,
      ]);
      (prisma.leaveBalance.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.leaveCreditChange.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await runLeaveAccrual({
        organizationId: 'org-1',
        year: 2026,
        frequency: 'MONTHLY',
        period: 6, // June 2026
        dryRun: true,
        actorId: 'hr-user',
      });

      expect(result.dryRun).toBe(true);
      expect(result.eligibleCount).toBe(1);
      expect(result.processedCount).toBe(1);
      expect(result.totalCreditsAccrued).toBe(1.25); // 15 / 12 = 1.25
      expect(result.items).toHaveLength(2);

      const item1 = result.items.find((i) => i.employeeId === 'emp-1');
      expect(item1?.status).toBe('ACCRUED');
      expect(item1?.creditsToAccrue).toBe(1.25);

      const item2 = result.items.find((i) => i.employeeId === 'emp-2');
      expect(item2?.status).toBe('INELIGIBLE');
      expect(item2?.creditsToAccrue).toBe(0);

      // Verify no transaction or write called
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('persists accruals and updates balances when dryRun is false', async () => {
      (prisma.leavePolicy.findMany as jest.Mock).mockResolvedValue([
        mockPolicy,
      ]);
      (prisma.employee.findMany as jest.Mock).mockResolvedValue([
        eligibleEmployee,
      ]);
      (prisma.leaveBalance.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.leaveCreditChange.findFirst as jest.Mock).mockResolvedValue(null);

      const mockTx = {
        leaveBalance: {
          create: jest.fn().mockResolvedValue({
            id: 'bal-new',
            totalCredits: new Prisma.Decimal(1.25),
            usedCredits: new Prisma.Decimal(0),
            balance: new Prisma.Decimal(1.25),
            revision: 1,
          }),
        },
        leaveCreditChange: {
          create: jest.fn().mockResolvedValue({ id: 'change-1' }),
        },
      };

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          return callback(mockTx);
        },
      );

      const result = await runLeaveAccrual({
        organizationId: 'org-1',
        year: 2026,
        frequency: 'MONTHLY',
        period: 6,
        dryRun: false,
        actorId: 'hr-user',
      });

      expect(result.processedCount).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.leaveBalance.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          employeeId: 'emp-1',
          leaveType: 'VACATION',
          year: 2026,
          totalCredits: new Prisma.Decimal(1.25),
        }),
      });
      expect(mockTx.leaveCreditChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'ACCRUAL',
          sourceReference: 'ACCRUAL-2026-M06-VACATION',
        }),
      });
    });

    it('skips employees who already received accrual for that period (idempotent)', async () => {
      (prisma.leavePolicy.findMany as jest.Mock).mockResolvedValue([
        mockPolicy,
      ]);
      (prisma.employee.findMany as jest.Mock).mockResolvedValue([
        eligibleEmployee,
      ]);

      const existingBalance = {
        id: 'bal-1',
        totalCredits: new Prisma.Decimal(1.25),
        balance: new Prisma.Decimal(1.25),
        revision: 1,
      };
      (prisma.leaveBalance.findFirst as jest.Mock).mockResolvedValue(
        existingBalance,
      );
      (prisma.leaveCreditChange.findFirst as jest.Mock).mockResolvedValue({
        id: 'prior-accrual',
        sourceReference: 'ACCRUAL-2026-M06-VACATION',
      });

      const result = await runLeaveAccrual({
        organizationId: 'org-1',
        year: 2026,
        frequency: 'MONTHLY',
        period: 6,
        dryRun: false,
        actorId: 'hr-user',
      });

      expect(result.processedCount).toBe(0);
      expect(result.items[0]?.status).toBe('ALREADY_ACCRUED');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('runLeaveCarryover', () => {
    const cappedPolicy = {
      id: 'pol-1',
      organizationId: 'org-1',
      leaveType: 'VACATION',
      carryoverPolicy: 'CAPPED',
      maxCarryoverDays: new Prisma.Decimal(5),
      isActive: true,
    };

    const priorBalance1 = {
      id: 'bal-prior-1',
      employeeId: 'emp-1',
      leaveType: 'VACATION',
      year: 2025,
      balance: new Prisma.Decimal(8), // 8 days unused, but capped at 5
      employee: {
        id: 'emp-1',
        employeeNumber: 'EMP-001',
        firstName: 'Maria',
        lastName: 'Santos',
      },
    };

    const priorBalanceZero = {
      id: 'bal-prior-2',
      employeeId: 'emp-2',
      leaveType: 'VACATION',
      year: 2025,
      balance: new Prisma.Decimal(0), // 0 days unused
      employee: {
        id: 'emp-2',
        employeeNumber: 'EMP-002',
        firstName: 'Juan',
        lastName: 'Reyes',
      },
    };

    it('rejects carryover if toYear is not fromYear + 1', async () => {
      await expect(
        runLeaveCarryover({
          organizationId: 'org-1',
          fromYear: 2025,
          toYear: 2027,
          actorId: 'hr-user',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('correctly caps carryover days according to policy limit in dryRun preview', async () => {
      (prisma.leavePolicy.findMany as jest.Mock).mockResolvedValue([
        cappedPolicy,
      ]);
      (prisma.leaveBalance.findMany as jest.Mock).mockResolvedValue([
        priorBalance1,
        priorBalanceZero,
      ]);
      (prisma.leaveBalance.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.leaveCreditChange.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await runLeaveCarryover({
        organizationId: 'org-1',
        fromYear: 2025,
        toYear: 2026,
        dryRun: true,
        actorId: 'hr-user',
      });

      expect(result.dryRun).toBe(true);
      expect(result.totalEvaluated).toBe(2);
      expect(result.processedCount).toBe(1);
      expect(result.totalCreditsCarriedOver).toBe(5); // Capped at 5 from 8

      const item1 = result.items.find((i) => i.employeeId === 'emp-1');
      expect(item1?.status).toBe('CARRIED_OVER');
      expect(item1?.carriedOver).toBe(5);

      const item2 = result.items.find((i) => i.employeeId === 'emp-2');
      expect(item2?.status).toBe('ZERO_BALANCE');
      expect(item2?.carriedOver).toBe(0);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('persists carryover records when dryRun is false', async () => {
      (prisma.leavePolicy.findMany as jest.Mock).mockResolvedValue([
        cappedPolicy,
      ]);
      (prisma.leaveBalance.findMany as jest.Mock).mockResolvedValue([
        priorBalance1,
      ]);
      (prisma.leaveBalance.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.leaveCreditChange.findFirst as jest.Mock).mockResolvedValue(null);

      const mockTx = {
        leaveBalance: {
          create: jest.fn().mockResolvedValue({
            id: 'bal-2026',
            totalCredits: new Prisma.Decimal(5),
            usedCredits: new Prisma.Decimal(0),
            balance: new Prisma.Decimal(5),
            revision: 1,
          }),
        },
        leaveCreditChange: {
          create: jest.fn().mockResolvedValue({ id: 'change-co-1' }),
        },
      };

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          return callback(mockTx);
        },
      );

      const result = await runLeaveCarryover({
        organizationId: 'org-1',
        fromYear: 2025,
        toYear: 2026,
        dryRun: false,
        actorId: 'hr-user',
      });

      expect(result.processedCount).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.leaveBalance.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          employeeId: 'emp-1',
          leaveType: 'VACATION',
          year: 2026,
          totalCredits: new Prisma.Decimal(5),
          balance: new Prisma.Decimal(5),
        }),
      });
      expect(mockTx.leaveCreditChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'CARRYOVER',
          sourceReference: 'CARRYOVER-2025-TO-2026-VACATION',
        }),
      });
    });
  });
});
