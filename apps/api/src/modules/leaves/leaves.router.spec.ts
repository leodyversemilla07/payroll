import { NotFoundException } from '@nestjs/common';
import { Prisma, prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import type { LeavesService } from '../../modules/leaves/leaves.service';
import {
  createRouterContext,
  type RouterServices,
} from '../../trpc/router-context';
import { type Context, TrpcService } from '../../trpc/trpc.service';
import { createLeavesRouter } from './leaves.router';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: {
    $transaction: jest.fn(),
    leaveRequest: { findMany: jest.fn() },
    department: { findFirst: jest.fn() },
    employee: { findUnique: jest.fn() },
  },
}));
const employeeId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const input = {
  employeeId,
  leaveType: 'SIL',
  startDate: '2026-09-10',
  endDate: '2026-09-10',
  daysCount: 0.5,
  partialDate: '2026-09-10',
  isPaid: true,
  reason: 'Family errand',
};
function context(role: Role | null, linkedEmployeeId?: string): Context {
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
          organizationId: 'org-1',
          name: 'Staff',
          email: 'staff@test.invalid',
          role,
          employeeId: linkedEmployeeId,
        }
      : null,
  };
}
describe('leave tRPC permissions, transport and transactional provenance', () => {
  const getEmployeeLeaveBalances = jest.fn();
  const listEmployeeLeaveRequests = jest.fn();
  const fileLeaveRequest = jest.fn();
  const approveLeaveRequest = jest.fn();
  const rejectLeaveRequest = jest.fn();
  const setEmployeeLeaveCredits = jest.fn();
  const listEmployeeCreditChanges = jest.fn();
  const cancelLeaveRequest = jest.fn();
  const listLeavePolicies = jest.fn();
  const getLeavePolicyById = jest.fn();
  const createLeavePolicy = jest.fn();
  const updateLeavePolicy = jest.fn();
  const deleteLeavePolicy = jest.fn();
  const runLeaveAccrual = jest.fn();
  const runLeaveCarryover = jest.fn();
  const record = jest.fn();
  const database = {} as Prisma.TransactionClient;
  const router = createLeavesRouter(
    createRouterContext(new TrpcService(), {
      leavesService: {
        getEmployeeLeaveBalances,
        listEmployeeLeaveRequests,
        fileLeaveRequest,
        approveLeaveRequest,
        rejectLeaveRequest,
        setEmployeeLeaveCredits,
        listEmployeeCreditChanges,
        cancelLeaveRequest,
        listLeavePolicies,
        getLeavePolicyById,
        createLeavePolicy,
        updateLeavePolicy,
        deleteLeavePolicy,
        runLeaveAccrual,
        runLeaveCarryover,
      },
      auditService: { record },
    } as unknown as RouterServices),
  );
  const saved = {
    id: requestId,
    employeeId,
    status: 'PENDING',
    daysCount: new Prisma.Decimal(0.5),
  };
  const creditInput = {
    operationId: requestId,
    employeeId,
    leaveType: 'SIL',
    year: 2026,
    totalCredits: 5.5,
    expectedRevision: null,
    sourceReference: 'POLICY-2026',
    reason: 'Reviewed source and eligibility',
  };
  const creditBalance = {
    id: requestId,
    employeeId,
    leaveType: 'SIL',
    year: 2026,
    totalCredits: new Prisma.Decimal(5.5),
    usedCredits: new Prisma.Decimal(0),
    balance: new Prisma.Decimal(5.5),
    revision: 1,
  };
  const creditChange = {
    id: requestId,
    balanceId: requestId,
    kind: 'ALLOCATION',
    previousTotalCredits: null,
    totalCredits: new Prisma.Decimal(5.5),
    usedCredits: new Prisma.Decimal(0),
    previousBalance: null,
    availableBalance: new Prisma.Decimal(5.5),
    previousRevision: null,
    revision: 1,
    actorId: 'user-1',
    sourceReference: creditInput.sourceReference,
    reason: creditInput.reason,
  };
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(
          database,
        ),
      );
    listEmployeeCreditChanges.mockResolvedValue([
      { ...creditChange, balance: { leaveType: 'SIL', year: 2026 } },
    ]);
    setEmployeeLeaveCredits.mockImplementation(
      async (
        _input,
        audit: Parameters<LeavesService['setEmployeeLeaveCredits']>[1],
      ) => {
        await audit({
          previous: null,
          balance: creditBalance as never,
          change: creditChange as never,
          transaction: database,
        });
        return {
          balance: creditBalance,
          change: creditChange,
          replayed: false,
        };
      },
    );
    cancelLeaveRequest.mockImplementation(
      async (
        input: Parameters<LeavesService['cancelLeaveRequest']>[0],
        audit: Parameters<LeavesService['cancelLeaveRequest']>[1],
      ) => {
        const previous = { ...saved, status: input.expectedStatus };
        const request = {
          ...previous,
          status: 'CANCELLED',
          cancelledFromStatus: input.expectedStatus,
          cancelledById: input.actorId,
          cancellationReason: input.reason,
          refundedDays:
            input.expectedStatus === 'APPROVED'
              ? new Prisma.Decimal(0.5)
              : null,
        };
        await audit({
          previous: previous as never,
          request: request as never,
          previousBalance:
            input.expectedStatus === 'APPROVED'
              ? (creditBalance as never)
              : null,
          balance:
            input.expectedStatus === 'APPROVED'
              ? (creditBalance as never)
              : null,
          transaction: database,
        });
        return { request, newlyCancelled: true };
      },
    );
    getEmployeeLeaveBalances.mockResolvedValue([]);
    listEmployeeLeaveRequests.mockResolvedValue([saved]);
    fileLeaveRequest.mockResolvedValue(saved);
    approveLeaveRequest.mockImplementation(
      async (
        _id: string,
        _org: string,
        _actor: string,
        audit: Parameters<LeavesService['approveLeaveRequest']>[3],
      ) => {
        const request = { ...saved, status: 'APPROVED' };
        await audit?.({
          previous: saved as never,
          request: request as never,
          transaction: database,
        });
        return { request, newlyApproved: true };
      },
    );
    rejectLeaveRequest.mockImplementation(
      async (
        _id: string,
        _org: string,
        _actor: string,
        reason: string,
        audit: Parameters<LeavesService['rejectLeaveRequest']>[4],
      ) => {
        const request = {
          ...saved,
          status: 'REJECTED',
          rejectionReason: reason,
        };
        await audit?.({
          previous: saved as never,
          request: request as never,
          transaction: database,
        });
        return { request, newlyRejected: true };
      },
    );
  });
  it.each([null, Role.EMPLOYEE, Role.PAYROLL_SPECIALIST])(
    'denies approval and rejection to %s',
    async (role) => {
      const caller = router.createCaller(context(role, employeeId));
      await expect(caller.approve({ requestId })).rejects.toMatchObject({
        code: role ? 'FORBIDDEN' : 'UNAUTHORIZED',
      });
      await expect(
        caller.reject({ requestId, rejectionReason: 'Wrong dates in request' }),
      ).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
      expect(approveLeaveRequest).not.toHaveBeenCalled();
      expect(rejectLeaveRequest).not.toHaveBeenCalled();
    },
  );
  it.each([Role.SUPER_ADMIN, Role.HR_ADMIN, Role.DEPARTMENT_MANAGER])(
    'retains %s decision authorization and transactional audit attribution',
    async (role) => {
      const caller = router.createCaller(context(role, employeeId));
      await caller.approve({ requestId });
      expect(approveLeaveRequest).toHaveBeenCalledWith(
        requestId,
        'org-1',
        'user-1',
        expect.any(Function),
        employeeId,
      );
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPROVE',
          user: expect.objectContaining({
            id: 'user-1',
            organizationId: 'org-1',
          }),
          entityId: requestId,
          previousValue: saved,
        }),
        database,
      );
      await caller.reject({
        requestId,
        rejectionReason: 'Incorrect dates for the intended request',
      });
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          newValue: expect.objectContaining({
            rejectionReason: 'Incorrect dates for the intended request',
          }),
        }),
        database,
      );
    },
  );
  it('allows only a linked employee self-read/self-request, never another employee record', async () => {
    const caller = router.createCaller(context(Role.EMPLOYEE, employeeId));
    await caller.getBalances({ employeeId, year: 2026 });
    await caller.listRequests({ employeeId, year: 2026 });
    await caller.request(input);
    const other = '33333333-3333-4333-8333-333333333333';
    await expect(
      caller.getBalances({ employeeId: other, year: 2026 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      caller.listRequests({ employeeId: other, year: 2026 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      caller.request({ ...input, employeeId: other }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(fileLeaveRequest).toHaveBeenCalledTimes(1);
  });
  it('returns plain decimal strings for tRPC rather than leaking Decimal instances', async () => {
    getEmployeeLeaveBalances.mockResolvedValue([
      {
        id: 'balance-1',
        totalCredits: new Prisma.Decimal(5),
        usedCredits: new Prisma.Decimal(0.5),
        balance: new Prisma.Decimal(4.5),
      },
    ]);
    const caller = router.createCaller(context(Role.HR_ADMIN));
    expect(await caller.getBalances({ employeeId, year: 2026 })).toEqual([
      {
        id: 'balance-1',
        totalCredits: '5',
        usedCredits: '0.5',
        balance: '4.5',
      },
    ]);
    expect(
      (
        await caller.listRequests({ employeeId, year: 2026, status: 'PENDING' })
      )[0].daysCount,
    ).toBe('0.5');
    expect(listEmployeeLeaveRequests).toHaveBeenCalledWith(
      employeeId,
      'org-1',
      2026,
      'PENDING',
      100,
    );
  });
  it('files with session-derived tenant, explicit treatment and audit in one serializable transaction', async () => {
    const caller = router.createCaller(context(Role.PAYROLL_SPECIALIST));
    await caller.request({
      ...input,
      organizationId: 'foreign-org',
    } as typeof input);
    expect(fileLeaveRequest).toHaveBeenCalledWith(
      {
        ...input,
        organizationId: 'org-1',
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        partialDate: new Date(input.partialDate),
      },
      database,
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', newValue: saved }),
      database,
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('rejects unsupported fractions and missing explicit pay treatment before writing', async () => {
    const caller = router.createCaller(context(Role.HR_ADMIN));
    await expect(
      caller.request({ ...input, daysCount: 0.25 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const { isPaid: _paid, ...partial } = input;
    await expect(caller.request(partial as typeof input)).rejects.toMatchObject(
      { code: 'BAD_REQUEST' },
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    null,
    Role.EMPLOYEE,
    Role.DEPARTMENT_MANAGER,
    Role.PAYROLL_SPECIALIST,
  ])('denies credit management to %s', async (role) => {
    await expect(
      router.createCaller(context(role, employeeId)).setCredits(creditInput),
    ).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    expect(setEmployeeLeaveCredits).not.toHaveBeenCalled();
  });
  it.each([Role.HR_ADMIN, Role.SUPER_ADMIN])(
    'permits %s explicit credits with session-derived actor/tenant and atomic audit',
    async (role) => {
      const result = await router
        .createCaller(context(role))
        .setCredits(creditInput);
      expect(result).toMatchObject({
        balance: { balance: '5.5', usedCredits: '0', revision: 1 },
        change: {
          totalCredits: '5.5',
          availableBalance: '5.5',
          previousTotalCredits: null,
        },
      });
      expect(setEmployeeLeaveCredits).toHaveBeenCalledWith(
        {
          ...creditInput,
          organizationId: 'org-1',
          actorId: 'user-1',
          actorEmployeeId: undefined,
        },
        expect.any(Function),
      );
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'LeaveBalance',
          action: 'CREATE',
          newValue: { balance: creditBalance, change: creditChange },
        }),
        database,
      );
    },
  );
  it('requires bounded half-day totals, revision and source/reason before allocating', async () => {
    const caller = router.createCaller(context(Role.HR_ADMIN));
    for (const totalCredits of [-1, 0.25, 1000])
      await expect(
        caller.setCredits({ ...creditInput, totalCredits }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller.setCredits({
        ...creditInput,
        expectedRevision: undefined,
      } as unknown as typeof creditInput),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller.setCredits({ ...creditInput, sourceReference: '  ' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(setEmployeeLeaveCredits).not.toHaveBeenCalled();
  });
  it('reads decimal-string credit history only for authorized linked employee records', async () => {
    const caller = router.createCaller(context(Role.EMPLOYEE, employeeId));
    expect(
      (await caller.listCreditChanges({ employeeId, year: 2026 }))[0],
    ).toMatchObject({ totalCredits: '5.5', usedCredits: '0' });
    await expect(
      caller.listCreditChanges({
        employeeId: '33333333-3333-4333-8333-333333333333',
        year: 2026,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it.each([
    null,
    Role.EMPLOYEE,
    Role.PAYROLL_SPECIALIST,
    Role.DEPARTMENT_MANAGER,
  ])('denies approved reversal to %s', async (role) => {
    await expect(
      router.createCaller(context(role, employeeId)).cancelApproved({
        requestId,
        reason: 'Schedule changed before payroll',
      }),
    ).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    expect(cancelLeaveRequest).not.toHaveBeenCalled();
  });
  it.each([Role.HR_ADMIN, Role.SUPER_ADMIN])(
    'audits %s approved reversal and balance restoration in the same transaction',
    async (role) => {
      const result = await router.createCaller(context(role)).cancelApproved({
        requestId,
        reason: 'Schedule changed before payroll',
      });
      expect(result).toMatchObject({
        status: 'CANCELLED',
        refundedDays: '0.5',
        cancelledFromStatus: 'APPROVED',
      });
      expect(cancelLeaveRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedStatus: 'APPROVED',
          organizationId: 'org-1',
          actorId: 'user-1',
        }),
        expect.any(Function),
      );
      expect(record).toHaveBeenCalledTimes(2);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'LeaveBalance',
          action: 'UPDATE',
          newValue: expect.objectContaining({
            leaveRequestId: requestId,
            refundedDays: new Prisma.Decimal(0.5),
          }),
        }),
        database,
      );
    },
  );
  it('binds withdrawal to pending state and authenticated self/staff access despite forged fields', async () => {
    const forged = {
      requestId,
      reason: 'Employee no longer needs these dates',
      expectedStatus: 'APPROVED',
      canWithdrawAny: true,
      actorId: 'foreign-user',
    };
    await router
      .createCaller(context(Role.EMPLOYEE, employeeId))
      .withdraw(forged);
    expect(cancelLeaveRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: 'PENDING',
        canWithdrawAny: false,
        actorId: 'user-1',
        actorEmployeeId: employeeId,
      }),
      expect.any(Function),
    );
    expect(record).toHaveBeenCalledTimes(1);
    await router.createCaller(context(Role.PAYROLL_SPECIALIST)).withdraw({
      requestId,
      reason: 'Staff withdrawing erroneous pending dates',
    });
    expect(cancelLeaveRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedStatus: 'PENDING',
        canWithdrawAny: true,
      }),
      expect.any(Function),
    );
  });
  it('requires an explicit cancellation reason before calling the service', async () => {
    await expect(
      router
        .createCaller(context(Role.HR_ADMIN))
        .cancelApproved({ requestId, reason: '  short ' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(cancelLeaveRequest).not.toHaveBeenCalled();
  });

  it('maps missing employees and audit failures to safe errors', async () => {
    getEmployeeLeaveBalances.mockRejectedValue(
      new NotFoundException('Employee not found'),
    );
    await expect(
      router.createCaller(context(Role.HR_ADMIN)).getBalances({ employeeId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    record.mockRejectedValue(new Error('Private connection details'));
    await expect(
      router.createCaller(context(Role.HR_ADMIN)).request(input),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Leave request failed. Please retry.',
    });
  });

  describe('leave policies, accruals, and carryover procedures', () => {
    const policyId = '33333333-3333-4333-8333-333333333333';
    const mockPolicy = {
      id: policyId,
      organizationId: 'org-1',
      leaveType: 'VACATION',
      annualCredits: new Prisma.Decimal(15),
      accrualFrequency: 'MONTHLY',
      carryoverPolicy: 'CAPPED',
      maxCarryoverDays: new Prisma.Decimal(5),
      eligibleAfterMonths: 6,
      isActive: true,
      createdById: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('listPolicies returns serialized policies for authenticated users', async () => {
      listLeavePolicies.mockResolvedValue([mockPolicy]);

      const result = await router
        .createCaller(context(Role.EMPLOYEE))
        .listPolicies();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        leaveType: 'VACATION',
        annualCredits: '15',
        maxCarryoverDays: '5',
      });
      expect(listLeavePolicies).toHaveBeenCalledWith('org-1', undefined);
    });

    it('denies createPolicy, updatePolicy, deletePolicy to non-HR roles', async () => {
      await expect(
        router.createCaller(context(Role.EMPLOYEE)).createPolicy({
          leaveType: 'VACATION',
          annualCredits: 15,
          accrualFrequency: 'ANNUAL',
          carryoverPolicy: 'NO_CARRYOVER',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      await expect(
        router.createCaller(context(Role.PAYROLL_SPECIALIST)).deletePolicy({
          id: policyId,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('permits HR_ADMIN to create a policy and audits creation', async () => {
      createLeavePolicy.mockResolvedValue(mockPolicy);

      const result = await router
        .createCaller(context(Role.HR_ADMIN))
        .createPolicy({
          leaveType: 'VACATION',
          annualCredits: 15,
          accrualFrequency: 'MONTHLY',
          carryoverPolicy: 'CAPPED',
          maxCarryoverDays: 5,
          eligibleAfterMonths: 6,
        });

      expect(result.leaveType).toBe('VACATION');
      expect(createLeavePolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          leaveType: 'VACATION',
          annualCredits: 15,
        }),
        'user-1',
      );
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'LeavePolicy',
          entityId: policyId,
        }),
      );
    });

    it('permits HR_ADMIN to update a policy and audits update', async () => {
      getLeavePolicyById.mockResolvedValue(mockPolicy);
      updateLeavePolicy.mockResolvedValue({
        ...mockPolicy,
        annualCredits: new Prisma.Decimal(18),
      });

      const result = await router
        .createCaller(context(Role.HR_ADMIN))
        .updatePolicy({
          id: policyId,
          annualCredits: 18,
        });

      expect(result.annualCredits).toBe('18');
      expect(updateLeavePolicy).toHaveBeenCalledWith(policyId, 'org-1', {
        annualCredits: 18,
      });
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entityType: 'LeavePolicy',
          entityId: policyId,
        }),
      );
    });

    it('permits HR_ADMIN to delete a policy and audits deletion', async () => {
      deleteLeavePolicy.mockResolvedValue(mockPolicy);

      const result = await router
        .createCaller(context(Role.HR_ADMIN))
        .deletePolicy({ id: policyId });

      expect(result).toEqual({ id: policyId, leaveType: 'VACATION' });
      expect(deleteLeavePolicy).toHaveBeenCalledWith(policyId, 'org-1');
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE',
          entityType: 'LeavePolicy',
          entityId: policyId,
        }),
      );
    });

    it('runs accrual preview (dryRun: true) without audit and execution (dryRun: false) with audit', async () => {
      const accrualResult = {
        year: 2026,
        frequency: 'MONTHLY' as const,
        period: 6,
        dryRun: true,
        totalEmployees: 5,
        eligibleCount: 4,
        processedCount: 4,
        totalCreditsAccrued: 5,
        items: [],
      };
      runLeaveAccrual.mockResolvedValue(accrualResult);

      // 1. Dry run
      const preview = await router
        .createCaller(context(Role.HR_ADMIN))
        .runAccrual({
          year: 2026,
          frequency: 'MONTHLY',
          period: 6,
          dryRun: true,
        });

      expect(preview.dryRun).toBe(true);
      expect(record).not.toHaveBeenCalled();

      // 2. Real run
      runLeaveAccrual.mockResolvedValue({ ...accrualResult, dryRun: false });
      const executed = await router
        .createCaller(context(Role.HR_ADMIN))
        .runAccrual({
          year: 2026,
          frequency: 'MONTHLY',
          period: 6,
          dryRun: false,
        });

      expect(executed.dryRun).toBe(false);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'LeaveAccrual',
        }),
      );
    });

    it('runs carryover preview without audit and execution with audit', async () => {
      const carryoverResult = {
        fromYear: 2025,
        toYear: 2026,
        dryRun: true,
        totalEvaluated: 5,
        processedCount: 3,
        totalCreditsCarriedOver: 15,
        items: [],
      };
      runLeaveCarryover.mockResolvedValue(carryoverResult);

      const preview = await router
        .createCaller(context(Role.HR_ADMIN))
        .runCarryover({
          fromYear: 2025,
          toYear: 2026,
          dryRun: true,
        });

      expect(preview.dryRun).toBe(true);
      expect(record).not.toHaveBeenCalled();

      runLeaveCarryover.mockResolvedValue({
        ...carryoverResult,
        dryRun: false,
      });
      const executed = await router
        .createCaller(context(Role.HR_ADMIN))
        .runCarryover({
          fromYear: 2025,
          toYear: 2026,
          dryRun: false,
        });

      expect(executed.dryRun).toBe(false);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'LeaveCarryover',
        }),
      );
    });
  });

  describe('listPendingRequests', () => {
    const mockRequest = {
      id: 'req-1',
      employeeId: 'emp-1',
      leaveType: 'VACATION',
      startDate: new Date('2026-09-10'),
      endDate: new Date('2026-09-11'),
      daysCount: 2,
      partialDate: null,
      debitedDays: null,
      refundedDays: null,
      status: 'PENDING',
      isPaid: true,
      reason: 'Vacation trip',
      employee: {
        id: 'emp-1',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        employeeNumber: 'EMP-001',
        department: { id: 'dept-1', name: 'Engineering', code: 'ENG' },
      },
    };

    it('allows HR_ADMIN to list all pending leave requests in the organization', async () => {
      jest
        .mocked(prisma.leaveRequest.findMany)
        .mockResolvedValue([mockRequest as never]);

      const result = await router
        .createCaller(context(Role.HR_ADMIN))
        .listPendingRequests();

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            employee: { organizationId: 'org-1' },
            status: 'PENDING',
          },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.daysCount).toBe('2');
      expect(result[0]?.employee.firstName).toBe('Juan');
    });

    it('scopes listPendingRequests to manager department for DEPARTMENT_MANAGER', async () => {
      jest
        .mocked(prisma.department.findFirst)
        .mockResolvedValue({ id: 'dept-eng' } as never);
      jest
        .mocked(prisma.leaveRequest.findMany)
        .mockResolvedValue([mockRequest as never]);

      const result = await router
        .createCaller(context(Role.DEPARTMENT_MANAGER, 'mgr-1'))
        .listPendingRequests();

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            employee: { organizationId: 'org-1', departmentId: 'dept-eng' },
            status: 'PENDING',
          },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('denies listPendingRequests to EMPLOYEE', async () => {
      await expect(
        router
          .createCaller(context(Role.EMPLOYEE, 'emp-1'))
          .listPendingRequests(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
