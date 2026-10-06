import type { RouterContext } from '../../trpc/router-context';

export function createDashboardRouter(ctx: RouterContext) {
  const { trpc, staffProcedure, dashboardService } = ctx;

  return trpc.router({
    getOverview: staffProcedure.query(({ ctx }) =>
      dashboardService.getOverview(ctx.user.organizationId),
    ),
  });
}
