import { z } from 'zod';
import { TIMEKEEPING_READ_ROLES, assertEmployeeAccess } from './router-context';
import type { RouterContext } from './router-context';

export function createTimekeepingRouter(ctx: RouterContext) {
  const {
    trpc,
    protectedProcedure,
    timekeepingReadProcedure,
    timekeepingWriteProcedure,
    timekeepingService,
    auditService,
  } = ctx;

  return trpc.router({
    listRecent: timekeepingReadProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).optional() }))
      .query(({ input, ctx }) =>
        timekeepingService.listRecentRecords(
          ctx.user.organizationId,
          input.limit,
        ),
      ),

    getDTR: protectedProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          startDate: z.string().date(),
          endDate: z.string().date(),
        }),
      )
      .query(({ input, ctx }) => {
        assertEmployeeAccess(
          ctx.user,
          input.employeeId,
          TIMEKEEPING_READ_ROLES,
        );
        return timekeepingService.getEmployeeDTR(
          input.employeeId,
          ctx.user.organizationId,
          new Date(input.startDate),
          new Date(input.endDate),
        );
      }),

    recordPunch: timekeepingWriteProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          date: z.string().date(),
          timeIn: z.string().datetime().optional(),
          timeOut: z.string().datetime().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const record = await timekeepingService.recordPunch(
          input.employeeId,
          ctx.user.organizationId,
          new Date(input.date),
          input.timeIn ? new Date(input.timeIn) : undefined,
          input.timeOut ? new Date(input.timeOut) : undefined,
        );
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'UPDATE',
          entityType: 'DailyTimeRecord',
          entityId: record.id,
        });
        return record;
      }),

    adjustAttendance: timekeepingWriteProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          date: z.string().date(),
          dayType: z
            .enum([
              'REGULAR_WORKDAY',
              'REST_DAY',
              'SPECIAL_NON_WORKING_HOLIDAY',
              'SPECIAL_WORKING_HOLIDAY',
              'REGULAR_HOLIDAY',
              'DOUBLE_HOLIDAY',
            ])
            .optional(),
          timeIn: z.string().datetime().optional(),
          timeOut: z.string().datetime().optional(),
          actualWorkedMinutes: z.number().int().nonnegative().default(480),
          tardinessMinutes: z.number().int().nonnegative().optional(),
          undertimeMinutes: z.number().int().nonnegative().optional(),
          overtimeMinutes: z.number().int().nonnegative().optional(),
          nightDiffMinutes: z.number().int().nonnegative().optional(),
          isAbsent: z.boolean().optional(),
          isApproved: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const record = await timekeepingService.adjustAttendanceRecord({
          ...input,
          organizationId: ctx.user.organizationId,
          date: new Date(input.date),
          timeIn: input.timeIn ? new Date(input.timeIn) : undefined,
          timeOut: input.timeOut ? new Date(input.timeOut) : undefined,
        });
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'UPDATE',
          entityType: 'DailyTimeRecord',
          entityId: record.id,
        });
        return record;
      }),

    importBiometricsCsv: timekeepingWriteProcedure
      .input(z.object({ csvContent: z.string().min(1).max(10_000_000) }))
      .mutation(async ({ input, ctx }) => {
        const result = await timekeepingService.importBiometricsCsv(
          input.csvContent,
          ctx.user.organizationId,
        );
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'IMPORT',
          entityType: 'BiometricsCsv',
          entityId: ctx.user.organizationId,
          newValue: {
            daysImported: result.daysImported,
            anomaliesDetected: result.anomaliesDetected,
          },
        });
        return result;
      }),
  });
}
