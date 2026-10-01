import { NotFoundException } from '@nestjs/common';
import { Prisma, prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import type { LeavesService } from '../../modules/leaves/leaves.service';
import { type Context, TrpcService } from '../trpc.service';
import { createLeavesRouter } from './leaves.router';
import { createRouterContext, type RouterServices } from './router-context';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: { $transaction: jest.fn() },
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
});
