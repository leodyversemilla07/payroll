import { createApiRouter } from './app.router';
import { type Context, TrpcService } from './trpc.service';

/**
 * Standard tRPC v11 server-side caller for integration tests.
 *
 * Follows https://trpc.io/docs/server/server-side-calls ("Basic example"):
 * `t.createCallerFactory(router)(ctx)`. The equivalent
 * `router.createCaller(ctx)` used across existing specs remains valid in v11
 * (maintainer-confirmed, not removed), so existing call sites stay as-is;
 * new specs should use this helper.
 */
export function createTestCaller(
  router: ReturnType<typeof createApiRouter>,
  trpc: TrpcService,
  ctx: Context,
) {
  return trpc.trpc.createCallerFactory(router)(ctx);
}
