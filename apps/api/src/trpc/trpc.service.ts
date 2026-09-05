import { Injectable } from '@nestjs/common';
import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { Role } from '@workspace/db';
import superjson from 'superjson';
import type { AuthenticatedUser } from '../auth/auth.service';

export interface Context {
  req: CreateExpressContextOptions['req'];
  res: CreateExpressContextOptions['res'];
  user: AuthenticatedUser | null;
}

@Injectable()
export class TrpcService {
  public readonly trpc = initTRPC.context<Context>().create({
    transformer: superjson,
  });

  public readonly router = this.trpc.router;
  public readonly middleware = this.trpc.middleware;
  public readonly publicProcedure = this.trpc.procedure;

  private readonly requireAuthentication = this.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });

  public readonly protectedProcedure = this.publicProcedure.use(
    this.requireAuthentication,
  );

  public procedureForRoles(roles: readonly Role[]) {
    return this.protectedProcedure.use(
      this.middleware(({ ctx, next }) => {
        if (!ctx.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authentication is required',
          });
        }

        if (!roles.includes(ctx.user.role)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to perform this action',
          });
        }

        return next({
          ctx: {
            ...ctx,
            user: ctx.user,
          },
        });
      }),
    );
  }
}
