import { TRPCError } from '@trpc/server';
import { Role } from '@workspace/db';
import { z } from 'zod';
import type { RouterContext } from './router-context';

export function createUsersRouter(ctx: RouterContext) {
  const { trpc, hrProcedure, authService, auditService } = ctx;

  return trpc.router({
    list: hrProcedure.query(({ ctx }) =>
      authService.listUsers(ctx.user.organizationId),
    ),

    create: hrProcedure
      .input(
        z.object({
          employeeId: z.string().uuid().optional(),
          name: z.string().trim().min(1).max(200),
          email: z.string().email().max(320),
          password: z.string().min(12).max(1024),
          role: z.nativeEnum(Role),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (
          input.role === Role.SUPER_ADMIN &&
          ctx.user.role !== Role.SUPER_ADMIN
        ) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only super administrators may create this role',
          });
        }

        const user = await authService.createUser({
          ...input,
          organizationId: ctx.user.organizationId,
        });
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'CREATE',
          entityType: 'User',
          entityId: user.id,
          newValue: { email: user.email, role: user.role },
        });
        return user;
      }),

    updateAccess: hrProcedure
      .input(
        z.object({
          userId: z.string().uuid(),
          role: z.nativeEnum(Role),
          isActive: z.boolean(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (input.userId === ctx.user.id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'You cannot change your own access',
          });
        }

        const user = await authService.updateUserAccess({
          ...input,
          organizationId: ctx.user.organizationId,
          canManageSuperAdmins: ctx.user.role === Role.SUPER_ADMIN,
        });
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'UPDATE',
          entityType: 'User',
          entityId: user.id,
          newValue: { role: user.role, isActive: user.isActive },
        });
        return user;
      }),

    linkEmployee: hrProcedure
      .input(
        z.object({
          userId: z.string().uuid(),
          employeeId: z.string().uuid().nullable(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const user = await authService.linkEmployee({
          ...input,
          organizationId: ctx.user.organizationId,
        });
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'UPDATE',
          entityType: 'User',
          entityId: user.id,
          newValue: { employeeId: user.employeeId },
        });
        return user;
      }),
  });
}
