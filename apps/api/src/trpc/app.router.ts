import { createAuthRouter } from '../auth/auth.router';
import { createUsersRouter } from '../auth/users.router';
import { createComplianceRouter } from '../modules/compliance/compliance.router';
import { createDashboardRouter } from '../modules/dashboard/dashboard.router';
import { createEmployeesRouter } from '../modules/employees/employees.router';
import { createHolidaysRouter } from '../modules/holidays/holidays.router';
import { createLeavesRouter } from '../modules/leaves/leaves.router';
import { createLoansRouter } from '../modules/loans/loans.router';
import { createNotificationsRouter } from '../modules/notifications/notifications.router';
import { createPayrollRouter } from '../modules/payroll/payroll.router';
import { createTimekeepingRouter } from '../modules/timekeeping/timekeeping.router';
import { createRouterContext, type RouterServices } from './router-context';
import { TrpcService } from './trpc.service';

export * from '../auth/auth.router';
export * from '../auth/users.router';
export * from '../modules/compliance/compliance.router';
export * from '../modules/dashboard/dashboard.router';
export * from '../modules/employees/employees.router';
export * from '../modules/holidays/holidays.router';
export * from '../modules/leaves/leaves.router';
export * from '../modules/loans/loans.router';
export * from '../modules/payroll/payroll.router';
export * from '../modules/timekeeping/timekeeping.router';
export * from './router-context';

// Every service is required: hidden `new` fallbacks previously let callers
// bootstrap their own second EmailService/StorageService graph, bypassing DI
// and environment wiring. The DI-backed ApiRouterFactory (api-router.factory.ts)
// satisfies this shape from Nest's container; tests supply their own instances.
export interface ApiRouterServices extends RouterServices {
  trpcService: TrpcService;
}

export function createApiRouter({
  trpcService,
  employeesService,
  timekeepingService,
  payrollService,
  loansService,
  leavesService,
  authService,
  auditService,
  dashboardService,
  holidaysService,
  notificationService,
  priorEmploymentService,
  monthlyRemittanceService,
  withholdingExportsService,
  yearEndTaxService,
  doleReportService,
  cutoffSchedulerService,
}: ApiRouterServices) {
  const publicProcedure = trpcService.publicProcedure;
  const routerContext = createRouterContext(trpcService, {
    authService,
    auditService,
    employeesService,
    timekeepingService,
    payrollService,
    loansService,
    leavesService,
    dashboardService,
    holidaysService,
    notificationService,
    priorEmploymentService,
    monthlyRemittanceService,
    withholdingExportsService,
    yearEndTaxService,
    doleReportService,
    cutoffSchedulerService,
  });

  return trpcService.router({
    health: publicProcedure.query(() => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })),

    auth: createAuthRouter(routerContext),
    users: createUsersRouter(routerContext),
    employees: createEmployeesRouter(routerContext),
    timekeeping: createTimekeepingRouter(routerContext),
    payroll: createPayrollRouter(routerContext),
    loans: createLoansRouter(routerContext),
    compliance: createComplianceRouter(routerContext),
    leaves: createLeavesRouter(routerContext),
    dashboard: createDashboardRouter(routerContext),
    holidays: createHolidaysRouter(routerContext),
    notifications: createNotificationsRouter(routerContext),
  });
}

export type AppRouter = ReturnType<typeof createApiRouter>;
