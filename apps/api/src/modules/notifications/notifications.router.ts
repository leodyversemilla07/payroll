import { NotFoundException } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { RouterContext } from '../../trpc/router-context';

async function withNotificationErrors<T>(
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
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Notification request failed. Please retry.',
      cause: error,
    });
  }
}

export function createNotificationsRouter(ctx: RouterContext) {
  const { trpc, protectedProcedure, notificationService } = ctx;

  return trpc.router({
    list: protectedProcedure
      .input(
        z.object({
          unreadOnly: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        }),
      )
      .query(({ input, ctx }) =>
        withNotificationErrors(() =>
          notificationService.listForUser(
            ctx.user.id,
            ctx.user.organizationId,
            input,
          ),
        ),
      ),

    unreadCount: protectedProcedure.query(({ ctx }) =>
      withNotificationErrors(() =>
        notificationService.countUnread(ctx.user.id, ctx.user.organizationId),
      ),
    ),

    markRead: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ input, ctx }) =>
        withNotificationErrors(() =>
          notificationService.markRead(
            ctx.user.id,
            ctx.user.organizationId,
            input.id,
          ),
        ),
      ),

    markAllRead: protectedProcedure.mutation(({ ctx }) =>
      withNotificationErrors(() =>
        notificationService.markAllRead(ctx.user.id, ctx.user.organizationId),
      ),
    ),
  });
}
