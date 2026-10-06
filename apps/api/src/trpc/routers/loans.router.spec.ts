import { Role } from '@workspace/db';
import type { Request, Response } from 'express';
import { type Context, TrpcService } from '../trpc.service';
import { createLoansRouter } from './loans.router';
import { createRouterContext, type RouterServices } from './router-context';

function context(
  role: Role | null,
  organizationId = 'org-1',
  employeeId?: string,
): Context {
  return {
    req: {
      ip: '127.0.0.1',
      get: () => 'test',
      headers: {},
    } as unknown as Request,
    res: {} as Response,
    user: role
      ? {
          id: 'user-1',
          organizationId,
          email: 'staff@test.invalid',
          name: 'Test Staff',
          role,
          employeeId,
        }
      : null,
  };
}

describe('loans.router', () => {
  const mockLoansService = {
    listAllActiveLoans: jest.fn(),
    listLoans: jest.fn(),
    getLoanSummary: jest.fn(),
    getLoanDetails: jest.fn(),
    getEmployeeActiveLoans: jest.fn(),
    getMyLoans: jest.fn(),
    createLoan: jest.fn(),
    recordManualPayment: jest.fn(),
    deactivateLoan: jest.fn(),
  };
  const mockAuditService = { record: jest.fn() };

  const routerContext = createRouterContext(new TrpcService(), {
    loansService: mockLoansService,
    auditService: mockAuditService,
  } as unknown as RouterServices);

  const router = createLoansRouter(routerContext);

  const sampleLoan = {
    id: 'a0000000-0000-4000-8000-000000000001',
    employeeId: 'b0000000-0000-4000-8000-000000000001',
    loanType: 'SSS_SALARY_LOAN' as const,
    referenceNumber: 'REF-123',
    principalCents: 3000000n,
    totalAmountCents: 3000000n,
    amortizationCents: 125000n,
    balanceCents: 2500000n,
    startDate: new Date('2026-01-01'),
    isActive: true,
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('list', () => {
    it.each([Role.SUPER_ADMIN, Role.HR_ADMIN, Role.PAYROLL_SPECIALIST])(
      'allows %s to list loans with filters',
      async (role) => {
        mockLoansService.listLoans.mockResolvedValue([sampleLoan]);
        const caller = router.createCaller(context(role));

        const result = await caller.list({
          status: 'ACTIVE',
          loanType: 'SSS_SALARY_LOAN',
        });
        expect(result).toEqual([sampleLoan]);
        expect(mockLoansService.listLoans).toHaveBeenCalledWith('org-1', {
          status: 'ACTIVE',
          loanType: 'SSS_SALARY_LOAN',
          employeeId: undefined,
          search: undefined,
        });
      },
    );

    it('denies regular EMPLOYEE from listing all loans', async () => {
      const caller = router.createCaller(
        context(Role.EMPLOYEE, 'org-1', 'emp-1'),
      );
      await expect(caller.list({ status: 'ACTIVE' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('getSummary', () => {
    it('allows HR_ADMIN to get summary metrics', async () => {
      const summary = {
        activeCount: 1,
        totalCount: 2,
        totalBalanceCents: 2500000n,
        totalPrincipalCents: 3000000n,
        totalAmortizationPerCutoffCents: 125000n,
      };
      mockLoansService.getLoanSummary.mockResolvedValue(summary);
      const caller = router.createCaller(context(Role.HR_ADMIN));

      const result = await caller.getSummary();
      expect(result).toEqual(summary);
      expect(mockLoansService.getLoanSummary).toHaveBeenCalledWith('org-1');
    });
  });

  describe('getById', () => {
    it('allows payroll staff to view any loan', async () => {
      mockLoansService.getLoanDetails.mockResolvedValue(sampleLoan);
      const caller = router.createCaller(context(Role.PAYROLL_SPECIALIST));

      const result = await caller.getById({ loanId: sampleLoan.id });
      expect(result).toEqual(sampleLoan);
    });

    it('allows employee to view their own loan', async () => {
      mockLoansService.getLoanDetails.mockResolvedValue(sampleLoan);
      const caller = router.createCaller(
        context(Role.EMPLOYEE, 'org-1', sampleLoan.employeeId),
      );

      const result = await caller.getById({ loanId: sampleLoan.id });
      expect(result).toEqual(sampleLoan);
    });

    it('denies employee from viewing another employee loan', async () => {
      mockLoansService.getLoanDetails.mockResolvedValue(sampleLoan);
      const caller = router.createCaller(
        context(Role.EMPLOYEE, 'org-1', 'other-emp-id'),
      );

      await expect(
        caller.getById({ loanId: sampleLoan.id }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('getMyLoans', () => {
    it('returns loans for authenticated employee', async () => {
      mockLoansService.getMyLoans.mockResolvedValue([sampleLoan]);
      const caller = router.createCaller(
        context(Role.EMPLOYEE, 'org-1', sampleLoan.employeeId),
      );

      const result = await caller.getMyLoans();
      expect(result).toEqual([sampleLoan]);
      expect(mockLoansService.getMyLoans).toHaveBeenCalledWith(
        sampleLoan.employeeId,
        'org-1',
      );
    });

    it('returns empty array if user has no linked employeeId', async () => {
      const caller = router.createCaller(context(Role.EMPLOYEE, 'org-1'));
      const result = await caller.getMyLoans();
      expect(result).toEqual([]);
      expect(mockLoansService.getMyLoans).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    const validInput = {
      employeeId: 'b0000000-0000-4000-8000-000000000001',
      loanType: 'SSS_SALARY_LOAN' as const,
      principalPesos: 30000,
      totalAmountPesos: 30000,
      amortizationPesos: 1250,
      startDate: '2026-01-01',
      endDate: '2027-01-01',
    };

    it('allows HR_ADMIN to create loan and records audit log', async () => {
      mockLoansService.createLoan.mockResolvedValue(sampleLoan);
      const caller = router.createCaller(context(Role.HR_ADMIN));

      const result = await caller.create(validInput);
      expect(result).toEqual(sampleLoan);
      expect(mockLoansService.createLoan).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: validInput.employeeId,
          principalCents: 3000000n,
          totalAmountCents: 3000000n,
          amortizationCents: 125000n,
        }),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'EmployeeLoan',
          entityId: sampleLoan.id,
        }),
      );
    });

    it('rejects loan if endDate is before startDate', async () => {
      const caller = router.createCaller(context(Role.HR_ADMIN));
      await expect(
        caller.create({
          ...validInput,
          startDate: '2026-05-01',
          endDate: '2026-04-01',
        }),
      ).rejects.toThrow();
    });
  });

  describe('recordPayment', () => {
    it('allows PAYROLL_SPECIALIST to record manual payment and logs audit', async () => {
      const paymentResult = {
        loan: { ...sampleLoan, balanceCents: 2000000n },
        payment: {
          id: 'pay-1',
          loanId: sampleLoan.id,
          amountPaidCents: 500000n,
          balanceAfterCents: 2000000n,
        },
      };
      mockLoansService.recordManualPayment.mockResolvedValue(paymentResult);
      const caller = router.createCaller(context(Role.PAYROLL_SPECIALIST));

      const result = await caller.recordPayment({
        loanId: sampleLoan.id,
        amountPesos: 5000,
        notes: 'Over-the-counter settlement',
      });

      expect(result).toEqual(paymentResult);
      expect(mockLoansService.recordManualPayment).toHaveBeenCalledWith({
        loanId: sampleLoan.id,
        organizationId: 'org-1',
        amountCents: 500000n,
      });
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entityType: 'EmployeeLoan',
          entityId: sampleLoan.id,
          newValue: expect.objectContaining({
            action: 'MANUAL_PAYMENT',
            amountPaidCents: '500000',
            notes: 'Over-the-counter settlement',
          }),
        }),
      );
    });
  });

  describe('deactivate', () => {
    it('allows HR_ADMIN to deactivate loan and logs audit', async () => {
      mockLoansService.deactivateLoan.mockResolvedValue({
        ...sampleLoan,
        isActive: false,
      });
      const caller = router.createCaller(context(Role.HR_ADMIN));

      const result = await caller.deactivate({ loanId: sampleLoan.id });
      expect(result.isActive).toBe(false);
      expect(mockLoansService.deactivateLoan).toHaveBeenCalledWith(
        sampleLoan.id,
        'org-1',
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entityType: 'EmployeeLoan',
          entityId: sampleLoan.id,
          newValue: {
            action: 'DEACTIVATE',
            isActive: false,
          },
        }),
      );
    });
  });
});
