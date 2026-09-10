import { z } from 'zod';
import {
  LEAVE_APPROVAL_ROLES,
  TIMEKEEPING_READ_ROLES,
  assertEmployeeAccess,
} from './router-context';
import type { RouterContext } from './router-context';

export function createLeavesRouter(ctx: RouterContext) {
  const {
    trpc,
    protectedProcedure,
    leavesService,
    auditService,
  } = ctx;

  return trpc.router({
    getBalances: protectedProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          year: z.number().int().optional(),
        }),
      )
      .query(({ input, ctx }) => {
        assertEmployeeAccess(
          ctx.user,
          input.employeeId,
          TIMEKEEPING_READ_ROLES,
        );
        return leavesService.getEmployeeLeaveBalances(
          input.employeeId,
          ctx.user.organizationId,
          input.year,
        );
      }),

    request: protectedProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          leaveType: z.string().trim().min(1).max(50),
          startDate: z.string().date(),
          endDate: z.string().date(),
          daysCount: z.number().positive().finite(),
          isPaid: z.boolean().default(true),
          reason: z.string().trim().min(1).max(2000),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        assertEmployeeAccess(
          ctx.user,
          input.employeeId,
          TIMEKEEPING_READ_ROLES,
        );
        const request = await leavesService.fileLeaveRequest({
          ...input,
          organizationId: ctx.user.organizationId,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        });
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'CREATE',
          entityType: 'LeaveRequest',
          entityId: request.id,
        });
        return request;
      }),

    approve: trpc
      .procedureForRoles(LEAVE_APPROVAL_ROLES)
      .input(z.object({ requestId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const request = await leavesService.approveLeaveRequest(
          input.requestId,
          ctx.user.organizationId,
          ctx.user.id,
        );
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'APPROVE',
          entityType: 'LeaveRequest',
          entityId: request.id,
        });
        return request;
      }),

    monetizeSil: protectedProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          daysToMonetize: z.number().positive().optional(),
        }),
      )
      .query(({ input, ctx }) => {
        assertEmployeeAccess(
          ctx.user,
          input.employeeId,
          TIMEKEEPING_READ_ROLES,
        );
        return leavesService.calculateSilMonetization(
          input.employeeId,
          ctx.user.organizationId,
          input.daysToMonetize,
        );
      }),
  });
}
