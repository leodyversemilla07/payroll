import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { Prisma, prisma } from '@workspace/db';
import { z } from 'zod';
import type { RouterContext } from './router-context';
import { assertEmployeeAccess, TIMEKEEPING_READ_ROLES } from './router-context';
import {
  attendanceCorrectionSchema,
  dtrRangeSchema,
} from './timekeeping.validation';

async function withTimekeepingErrors<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof NotFoundException)
      throw new TRPCError({
        code: 'NOT_FOUND',
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
    ) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'Attendance or payroll changed concurrently. Reload the DTR before retrying.',
        cause: error,
      });
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Timekeeping request failed. Please retry.',
      cause: error,
    });
  }
}

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

    getDTR: protectedProcedure.input(dtrRangeSchema).query(({ input, ctx }) => {
      assertEmployeeAccess(ctx.user, input.employeeId, TIMEKEEPING_READ_ROLES);
      return withTimekeepingErrors(() =>
        timekeepingService.getEmployeeDTR(
          input.employeeId,
          ctx.user.organizationId,
          new Date(input.startDate),
          new Date(input.endDate),
        ),
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
      .input(attendanceCorrectionSchema)
      .mutation(({ input, ctx }) =>
        withTimekeepingErrors(() =>
          prisma.$transaction(
            async (transaction) => {
              const { correctionReason, ...attendance } = input;
              const { previous, record } =
                await timekeepingService.correctAttendanceRecord(
                  {
                    ...attendance,
                    organizationId: ctx.user.organizationId,
                    date: new Date(input.date),
                    expectedUpdatedAt: input.expectedUpdatedAt
                      ? new Date(input.expectedUpdatedAt)
                      : null,
                    timeIn: input.timeIn ? new Date(input.timeIn) : null,
                    timeOut: input.timeOut ? new Date(input.timeOut) : null,
                  },
                  transaction,
                );
              await auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: previous ? 'UPDATE' : 'CREATE',
                  entityType: 'DailyTimeRecord',
                  entityId: record.id,
                  previousValue: previous,
                  newValue: { ...record, correctionReason },
                },
                transaction,
              );
              return record;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
        ),
      ),

    importBiometricsCsv: timekeepingWriteProcedure
      .input(z.object({ csvContent: z.string().min(1).max(10_000_000) }))
      .mutation(({ input, ctx }) =>
        withTimekeepingErrors(() =>
          prisma.$transaction(
            async (transaction) => {
              const result = await timekeepingService.importBiometricsCsv(
                input.csvContent,
                ctx.user.organizationId,
                transaction,
              );
              await auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: 'IMPORT',
                  entityType: 'BiometricsCsv',
                  entityId: ctx.user.organizationId,
                  newValue: {
                    daysImported: result.daysImported,
                    anomaliesDetected: result.anomaliesDetected,
                  },
                },
                transaction,
              );
              return result;
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              timeout: 60_000,
            },
          ),
        ),
      ),
  });
}
