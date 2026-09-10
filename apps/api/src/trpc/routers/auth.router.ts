import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { RouterContext } from './router-context';

export function createAuthRouter(ctx: RouterContext) {
  const {
    trpc,
    publicProcedure,
    protectedProcedure,
    authService,
    auditService,
  } = ctx;

  return trpc.router({
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email().max(320),
          password: z.string().min(1).max(1024),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const result = await authService.signIn(
          input.email,
          input.password,
          ctx.req,
          ctx.res,
        );
        if (!result) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid email or password',
          });
        }

        await auditService.record({
          user: result.user,
          request: ctx.req,
          action: 'LOGIN',
          entityType: 'User',
          entityId: result.user.id,
        });

        return result;
      }),

    me: protectedProcedure.query(({ ctx }) => ctx.user),

    logout: protectedProcedure.mutation(async ({ ctx }) => {
      await auditService.record({
        user: ctx.user,
        request: ctx.req,
        action: 'LOGOUT',
        entityType: 'User',
        entityId: ctx.user.id,
      });
      await authService.signOut(ctx.req, ctx.res);
      return { success: true };
    }),
  });
}
