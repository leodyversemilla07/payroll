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
  Role,
} from '@workspace/db';
import { z } from 'zod';
import { findDepartmentManagerDepartmentId } from '../../infrastructure/authorization/department-scope';
import { serializePolicy } from '../../modules/leaves/leave-policies';
import type { RouterContext } from '../../trpc/router-context';
import {
  assertEmployeeAccess,
  LEAVE_APPROVAL_ROLES,
  TIMEKEEPING_READ_ROLES,
} from '../../trpc/router-context';

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
  return {
    ...request,
    daysCount: request.daysCount.toString(),
    debitedDays: request.debitedDays?.toString() ?? null,
    refundedDays: request.refundedDays?.toString() ?? null,
  };
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
  const cancellationInput = z.object({
    requestId: z.string().uuid(),
    reason: z.string().trim().min(10).max(500),
  });
  const cancel = async (
    input: z.infer<typeof cancellationInput>,
    user: Parameters<typeof assertEmployeeAccess>[0],
    req: Parameters<typeof auditService.record>[0]['request'],
    expectedStatus: 'PENDING' | 'APPROVED',
  ) =>
    withLeaveErrors(async () => {
      const { request } = await leavesService.cancelLeaveRequest(
        {
          ...input,
          expectedStatus,
          organizationId: user.organizationId,
          actorId: user.id,
          actorEmployeeId: user.employeeId,
          canWithdrawAny: TIMEKEEPING_READ_ROLES.some(
            (role) => role === user.role,
          ),
        },
        async ({
          previous,
          request,
          previousBalance,
          balance,
          transaction,
        }) => {
          await auditService.record(
            {
              user,
              request: req,
              action: 'UPDATE',
              entityType: 'LeaveRequest',
              entityId: request.id,
              previousValue: { request: previous, balance: previousBalance },
              newValue: { request, balance },
            },
            transaction,
          );
          if (balance)
            await auditService.record(
              {
                user,
                request: req,
                action: 'UPDATE',
                entityType: 'LeaveBalance',
                entityId: balance.id,
                previousValue: previousBalance,
                newValue: {
                  balance,
                  leaveRequestId: request.id,
                  refundedDays: request.refundedDays,
                  reason: request.cancellationReason,
                },
              },
              transaction,
            );
        },
      );
      return serializeRequest(request);
    });
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
          status: z
            .enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
            .optional(),
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

    listPendingRequests: trpc
      .procedureForRoles(LEAVE_APPROVAL_ROLES)
      .query(async ({ ctx }) => {
        let departmentId: string | undefined;
        if (ctx.user.role === Role.DEPARTMENT_MANAGER) {
          departmentId =
            (await findDepartmentManagerDepartmentId(ctx.user)) ?? undefined;
          if (!departmentId) {
            return [];
          }
        }
        return withLeaveErrors(async () => {
          const requests = await prisma.leaveRequest.findMany({
            where: {
              employee: {
                organizationId: ctx.user.organizationId,
                ...(departmentId ? { departmentId } : {}),
              },
              status: 'PENDING',
            },
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  employeeNumber: true,
                  department: { select: { id: true, name: true, code: true } },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          });
          return requests.map((req) => ({
            ...serializeRequest(req),
            employee: req.employee,
          }));
        });
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

    withdraw: protectedProcedure
      .input(cancellationInput)
      .mutation(({ input, ctx }) =>
        cancel(input, ctx.user, ctx.req, 'PENDING'),
      ),

    cancelApproved: ctx.hrProcedure
      .input(cancellationInput)
      .mutation(({ input, ctx }) =>
        cancel(input, ctx.user, ctx.req, 'APPROVED'),
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

    listPolicies: protectedProcedure
      .input(z.object({ includeInactive: z.boolean().optional() }).optional())
      .query(({ input, ctx }) =>
        withLeaveErrors(async () =>
          (
            await leavesService.listLeavePolicies(
              ctx.user.organizationId,
              input?.includeInactive,
            )
          ).map(serializePolicy),
        ),
      ),

    createPolicy: ctx.hrProcedure
      .input(
        z.object({
          leaveType: z.string().trim().min(1).max(50),
          annualCredits: z.number().finite().min(0).max(365).multipleOf(0.5),
          accrualFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
          carryoverPolicy: z.enum(['NO_CARRYOVER', 'CAPPED', 'UNLIMITED']),
          maxCarryoverDays: z
            .number()
            .finite()
            .min(0.5)
            .max(365)
            .multipleOf(0.5)
            .nullable()
            .optional(),
          eligibleAfterMonths: z.number().int().min(0).max(120).default(6),
          isActive: z.boolean().default(true),
        }),
      )
      .mutation(({ input, ctx }) =>
        withLeaveErrors(async () => {
          const policy = await leavesService.createLeavePolicy(
            {
              ...input,
              organizationId: ctx.user.organizationId,
            },
            ctx.user.id,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'CREATE',
            entityType: 'LeavePolicy',
            entityId: policy.id,
            previousValue: undefined,
            newValue: policy,
          });
          return serializePolicy(policy);
        }),
      ),

    updatePolicy: ctx.hrProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          annualCredits: z
            .number()
            .finite()
            .min(0)
            .max(365)
            .multipleOf(0.5)
            .optional(),
          accrualFrequency: z
            .enum(['MONTHLY', 'QUARTERLY', 'ANNUAL'])
            .optional(),
          carryoverPolicy: z
            .enum(['NO_CARRYOVER', 'CAPPED', 'UNLIMITED'])
            .optional(),
          maxCarryoverDays: z
            .number()
            .finite()
            .min(0.5)
            .max(365)
            .multipleOf(0.5)
            .nullable()
            .optional(),
          eligibleAfterMonths: z.number().int().min(0).max(120).optional(),
          isActive: z.boolean().optional(),
        }),
      )
      .mutation(({ input, ctx }) =>
        withLeaveErrors(async () => {
          const { id, ...data } = input;
          const previous = await leavesService.getLeavePolicyById(
            id,
            ctx.user.organizationId,
          );
          const policy = await leavesService.updateLeavePolicy(
            id,
            ctx.user.organizationId,
            data,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'UPDATE',
            entityType: 'LeavePolicy',
            entityId: policy.id,
            previousValue: previous,
            newValue: policy,
          });
          return serializePolicy(policy);
        }),
      ),

    deletePolicy: ctx.hrProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ input, ctx }) =>
        withLeaveErrors(async () => {
          const policy = await leavesService.deleteLeavePolicy(
            input.id,
            ctx.user.organizationId,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'DELETE',
            entityType: 'LeavePolicy',
            entityId: policy.id,
            previousValue: policy,
            newValue: undefined,
          });
          return { id: policy.id, leaveType: policy.leaveType };
        }),
      ),

    runAccrual: ctx.hrProcedure
      .input(
        z.object({
          year,
          frequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
          period: z.number().int().min(1).max(12).optional(),
          leaveType: z.string().trim().min(1).max(50).optional(),
          dryRun: z.boolean().default(false),
        }),
      )
      .mutation(({ input, ctx }) =>
        withLeaveErrors(async () => {
          const result = await leavesService.runLeaveAccrual({
            ...input,
            organizationId: ctx.user.organizationId,
            actorId: ctx.user.id,
          });
          if (!input.dryRun) {
            await auditService.record({
              user: ctx.user,
              request: ctx.req,
              action: 'CREATE',
              entityType: 'LeaveAccrual',
              entityId: `${ctx.user.organizationId}-${input.year}-${input.frequency}`,
              previousValue: undefined,
              newValue: {
                year: result.year,
                frequency: result.frequency,
                period: result.period,
                processedCount: result.processedCount,
                totalCreditsAccrued: result.totalCreditsAccrued,
              },
            });
          }
          return result;
        }),
      ),

    runCarryover: ctx.hrProcedure
      .input(
        z.object({
          fromYear: year,
          toYear: year,
          leaveType: z.string().trim().min(1).max(50).optional(),
          dryRun: z.boolean().default(false),
        }),
      )
      .mutation(({ input, ctx }) =>
        withLeaveErrors(async () => {
          const result = await leavesService.runLeaveCarryover({
            ...input,
            organizationId: ctx.user.organizationId,
            actorId: ctx.user.id,
          });
          if (!input.dryRun) {
            await auditService.record({
              user: ctx.user,
              request: ctx.req,
              action: 'CREATE',
              entityType: 'LeaveCarryover',
              entityId: `${ctx.user.organizationId}-${input.fromYear}-TO-${input.toYear}`,
              previousValue: undefined,
              newValue: {
                fromYear: result.fromYear,
                toYear: result.toYear,
                processedCount: result.processedCount,
                totalCreditsCarriedOver: result.totalCreditsCarriedOver,
              },
            });
          }
          return result;
        }),
      ),
  });
}
