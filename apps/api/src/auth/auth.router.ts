import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { RouterContext } from '../trpc/router-context';

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

        if (result.requiresMfa) {
          return result;
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

    verifyMfa: publicProcedure
      .input(
        z.object({
          mfaTicket: z.string().min(1),
          code: z.string().min(1).max(32),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await authService.verifyMfa(
            input.mfaTicket,
            input.code,
            ctx.req,
            ctx.res,
          );

          await auditService.record({
            user: result.user,
            request: ctx.req,
            action: 'LOGIN',
            entityType: 'User',
            entityId: result.user.id,
            newValue: { mfa: true },
          });

          return result;
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message:
              error instanceof Error
                ? error.message
                : 'Invalid verification code',
          });
        }
      }),

    setupMfa: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        return await authService.setupMfa(ctx.user.id);
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            error instanceof Error ? error.message : 'Failed to setup MFA',
        });
      }
    }),

    confirmMfa: protectedProcedure
      .input(
        z.object({
          code: z.string().min(1).max(32),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await authService.confirmMfa(ctx.user.id, input.code);
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'UPDATE',
            entityType: 'User',
            entityId: ctx.user.id,
            newValue: { mfaEnabled: true },
          });
          return result;
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to confirm MFA setup',
          });
        }
      }),

    regenerateBackupCodes: protectedProcedure
      .input(
        z.object({
          password: z.string().min(1).max(1024),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await authService.regenerateBackupCodes(
            ctx.user.id,
            input.password,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'UPDATE',
            entityType: 'User',
            entityId: ctx.user.id,
            newValue: { mfaBackupCodesRegenerated: true },
          });
          return result;
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to regenerate backup codes',
          });
        }
      }),

    disableMfa: protectedProcedure
      .input(
        z.object({
          password: z.string().min(1).max(1024),
          code: z.string().min(1).max(32),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await authService.disableMfa(
            ctx.user.id,
            input.password,
            input.code,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'UPDATE',
            entityType: 'User',
            entityId: ctx.user.id,
            newValue: { mfaEnabled: false },
          });
          return result;
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              error instanceof Error ? error.message : 'Failed to disable MFA',
          });
        }
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
