import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import {
  type LeaveBalance,
  type LeaveCreditChange,
  type LeaveRequest,
  Prisma,
  prisma,
} from '@workspace/db';
import { z } from 'zod';
import type { RouterContext } from './router-context';
import {
  assertEmployeeAccess,
  LEAVE_APPROVAL_ROLES,
  TIMEKEEPING_READ_ROLES,
} from './router-context';

const year = z.number().int().min(1900).max(2100);
function serializeBalance(balance: LeaveBalance) {
  return {
    ...balance,
    totalCredits: balance.totalCredits.toString(),
    usedCredits: balance.usedCredits.toString(),
    balance: balance.balance.toString(),
  };
}
function serializeCreditChange<T extends LeaveCreditChange>(change: T) {
  return {
    ...change,
    previousTotalCredits: change.previousTotalCredits?.toString() ?? null,
    totalCredits: change.totalCredits.toString(),
    usedCredits: change.usedCredits.toString(),
    previousBalance: change.previousBalance?.toString() ?? null,
    availableBalance: change.availableBalance.toString(),
  };
}
function serializeRequest(request: LeaveRequest) {
  return { ...request, daysCount: request.daysCount.toString() };
}
async function withLeaveErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof NotFoundException)
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: error.message,
        cause: error,
      });
    if (error instanceof ForbiddenException)
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: error.message,
        cause: error,
      });
    if (error instanceof ConflictException)
      throw new TRPCError({
        code: 'CONFLICT',
        message: error.message,
        cause: error,
      });
    if (error instanceof UnprocessableEntityException)
      throw new TRPCError({
        code: 'UNPROCESSABLE_CONTENT',
        message: error.message,
        cause: error,
      });
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2034'].includes(error.code)
    )
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Leave records changed concurrently. Reload and retry.',
        cause: error,
      });
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Leave request failed. Please retry.',
      cause: error,
    });
  }
}

export function createLeavesRouter(ctx: RouterContext) {
  const { trpc, protectedProcedure, leavesService, auditService } = ctx;
  return trpc.router({
    getBalances: protectedProcedure
      .input(z.object({ employeeId: z.string().uuid(), year: year.optional() }))
      .query(({ input, ctx }) => {
        assertEmployeeAccess(
          ctx.user,
          input.employeeId,
          TIMEKEEPING_READ_ROLES,
        );
        return withLeaveErrors(async () =>
          (
            await leavesService.getEmployeeLeaveBalances(
              input.employeeId,
              ctx.user.organizationId,
              input.year,
            )
          ).map(serializeBalance),
        );
      }),

    setCredits: ctx.hrProcedure
      .input(
        z.object({
          operationId: z.string().uuid(),
          employeeId: z.string().uuid(),
          leaveType: z.string().trim().min(1).max(50),
          year,
          totalCredits: z.number().finite().min(0).max(999.5).multipleOf(0.5),
          expectedRevision: z
            .number()
            .int()
            .min(0)
            .max(2_147_483_646)
            .nullable(),
          sourceReference: z.string().trim().min(3).max(200),
          reason: z.string().trim().min(10).max(500),
        }),
      )
      .mutation(({ input, ctx }) =>
        withLeaveErrors(async () => {
          const result = await leavesService.setEmployeeLeaveCredits(
            {
              ...input,
              organizationId: ctx.user.organizationId,
              actorId: ctx.user.id,
              actorEmployeeId: ctx.user.employeeId,
            },
            async ({ previous, balance, change, transaction }) =>
              auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: previous ? 'UPDATE' : 'CREATE',
                  entityType: 'LeaveBalance',
                  entityId: balance.id,
                  previousValue: previous ?? undefined,
                  newValue: { balance, change },
                },
                transaction,
              ),
          );
          return {
            ...result,
            balance: serializeBalance(result.balance),
            change: serializeCreditChange(result.change),
          };
        }),
      ),

    listCreditChanges: protectedProcedure
      .input(z.object({ employeeId: z.string().uuid(), year }))
      .query(({ input, ctx }) => {
        assertEmployeeAccess(
          ctx.user,
          input.employeeId,
          TIMEKEEPING_READ_ROLES,
        );
        return withLeaveErrors(async () =>
          (
            await leavesService.listEmployeeCreditChanges(
              input.employeeId,
              ctx.user.organizationId,
              input.year,
            )
          ).map(serializeCreditChange),
        );
      }),

    listRequests: protectedProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          year,
          status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
          limit: z.number().int().min(1).max(200).default(100),
        }),
      )
      .query(({ input, ctx }) => {
        assertEmployeeAccess(
          ctx.user,
          input.employeeId,
          TIMEKEEPING_READ_ROLES,
        );
        return withLeaveErrors(async () =>
          (
            await leavesService.listEmployeeLeaveRequests(
              input.employeeId,
              ctx.user.organizationId,
              input.year,
              input.status,
              input.limit,
            )
          ).map(serializeRequest),
        );
      }),

    request: protectedProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          leaveType: z.string().trim().min(1).max(50),
          startDate: z.string().date(),
          endDate: z.string().date(),
          daysCount: z.number().positive().finite().max(366).multipleOf(0.5),
          partialDate: z.string().date().optional(),
          isPaid: z.boolean(),
          reason: z.string().trim().min(1).max(2000),
        }),
      )
      .mutation(({ input, ctx }) => {
        assertEmployeeAccess(
          ctx.user,
          input.employeeId,
          TIMEKEEPING_READ_ROLES,
        );
        return withLeaveErrors(() =>
          prisma.$transaction(
            async (transaction) => {
              const request = await leavesService.fileLeaveRequest(
                {
                  ...input,
                  organizationId: ctx.user.organizationId,
                  startDate: new Date(input.startDate),
                  endDate: new Date(input.endDate),
                  partialDate: input.partialDate
                    ? new Date(input.partialDate)
                    : undefined,
                },
                transaction,
              );
              await auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: 'CREATE',
                  entityType: 'LeaveRequest',
                  entityId: request.id,
                  newValue: request,
                },
                transaction,
              );
              return serializeRequest(request);
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
        );
      }),

    approve: trpc
      .procedureForRoles(LEAVE_APPROVAL_ROLES)
      .input(z.object({ requestId: z.string().uuid() }))
      .mutation(({ input, ctx }) =>
        withLeaveErrors(async () => {
          const { request } = await leavesService.approveLeaveRequest(
            input.requestId,
            ctx.user.organizationId,
            ctx.user.id,
            async ({ previous, request, transaction }) =>
              auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: 'APPROVE',
                  entityType: 'LeaveRequest',
                  entityId: request.id,
                  previousValue: previous,
                  newValue: request,
                },
                transaction,
              ),
            ctx.user.employeeId,
          );
          return serializeRequest(request);
        }),
      ),

    reject: trpc
      .procedureForRoles(LEAVE_APPROVAL_ROLES)
      .input(
        z.object({
          requestId: z.string().uuid(),
          rejectionReason: z.string().trim().min(10).max(500),
        }),
      )
      .mutation(({ input, ctx }) =>
        withLeaveErrors(async () => {
          const { request } = await leavesService.rejectLeaveRequest(
            input.requestId,
            ctx.user.organizationId,
            ctx.user.id,
            input.rejectionReason,
            async ({ previous, request, transaction }) =>
              auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: 'UPDATE',
                  entityType: 'LeaveRequest',
                  entityId: request.id,
                  previousValue: previous,
                  newValue: request,
                },
                transaction,
              ),
          );
          return serializeRequest(request);
        }),
      ),

    monetizeSil: protectedProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          daysToMonetize: z.number().positive().finite().optional(),
        }),
      )
      .query(({ input, ctx }) => {
        assertEmployeeAccess(
          ctx.user,
          input.employeeId,
          TIMEKEEPING_READ_ROLES,
        );
        return withLeaveErrors(() =>
          leavesService.calculateSilMonetization(
            input.employeeId,
            ctx.user.organizationId,
            input.daysToMonetize,
          ),
        );
      }),
  });
}
