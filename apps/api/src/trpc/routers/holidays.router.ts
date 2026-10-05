import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import {
  createHolidaySchema,
  deleteHolidaySchema,
  listHolidaysSchema,
  populatePresetsSchema,
  updateHolidaySchema,
} from './holidays.validation';
import type { RouterContext } from './router-context';

async function withHolidayErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof NotFoundException) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: error.message,
        cause: error,
      });
    }
    if (error instanceof ConflictException) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: error.message,
        cause: error,
      });
    }
    if (error instanceof UnprocessableEntityException) {
      throw new TRPCError({
        code: 'UNPROCESSABLE_CONTENT',
        message: error.message,
        cause: error,
      });
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Holiday calendar request failed. Please retry.',
      cause: error,
    });
  }
}

export function createHolidaysRouter(ctx: RouterContext) {
  const {
    trpc,
    protectedProcedure,
    hrProcedure,
    holidaysService,
    auditService,
  } = ctx;

  return trpc.router({
    list: protectedProcedure
      .input(listHolidaysSchema)
      .query(({ input, ctx }) =>
        holidaysService.list(ctx.user.organizationId, input?.year),
      ),

    create: hrProcedure.input(createHolidaySchema).mutation(({ input, ctx }) =>
      withHolidayErrors(async () => {
        const holiday = await holidaysService.create(
          ctx.user.organizationId,
          input,
          ctx.user.id,
        );
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'CREATE',
          entityType: 'HolidayCalendar',
          entityId: holiday.id,
          newValue: holiday,
        });
        return holiday;
      }),
    ),

    update: hrProcedure.input(updateHolidaySchema).mutation(({ input, ctx }) =>
      withHolidayErrors(async () => {
        const previous = await holidaysService.getById(
          ctx.user.organizationId,
          input.id,
        );
        const updated = await holidaysService.update(
          ctx.user.organizationId,
          input.id,
          input,
        );
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'UPDATE',
          entityType: 'HolidayCalendar',
          entityId: updated.id,
          previousValue: previous,
          newValue: updated,
        });
        return updated;
      }),
    ),

    delete: hrProcedure.input(deleteHolidaySchema).mutation(({ input, ctx }) =>
      withHolidayErrors(async () => {
        const deleted = await holidaysService.delete(
          ctx.user.organizationId,
          input.id,
        );
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'DELETE',
          entityType: 'HolidayCalendar',
          entityId: deleted.id,
          previousValue: deleted,
        });
        return deleted;
      }),
    ),

    populatePresets: hrProcedure
      .input(populatePresetsSchema)
      .mutation(({ input, ctx }) =>
        withHolidayErrors(async () => {
          const result = await holidaysService.populateNationalPresets(
            ctx.user.organizationId,
            input.year,
            ctx.user.id,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'CREATE',
            entityType: 'HolidayCalendarPresets',
            entityId: ctx.user.organizationId,
            newValue: {
              year: input.year,
              addedCount: result.addedCount,
            },
          });
          return result;
        }),
      ),
  });
}
