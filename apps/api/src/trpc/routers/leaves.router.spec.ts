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
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(
          database,
        ),
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
