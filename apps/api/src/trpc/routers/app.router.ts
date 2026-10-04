import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../../auth/auth.service';
import { ComplianceService } from '../../modules/compliance/compliance.service';
import { DashboardService } from '../../modules/dashboard/dashboard.service';
import { EmployeesService } from '../../modules/employees/employees.service';
import { HolidaysService } from '../../modules/holidays/holidays.service';
import { LeavesService } from '../../modules/leaves/leaves.service';
import { LoansService } from '../../modules/loans/loans.service';
import { PayrollService } from '../../modules/payroll/payroll.service';
import { TimekeepingService } from '../../modules/timekeeping/timekeeping.service';
import { TrpcService } from '../trpc.service';
import { createAuthRouter } from './auth.router';
import { createComplianceRouter } from './compliance.router';
import { createDashboardRouter } from './dashboard.router';
import { createEmployeesRouter } from './employees.router';
import { createHolidaysRouter } from './holidays.router';
import { createLeavesRouter } from './leaves.router';
import { createLoansRouter } from './loans.router';
import { createPayrollRouter } from './payroll.router';
import { createRouterContext } from './router-context';
import { createTimekeepingRouter } from './timekeeping.router';
import { createUsersRouter } from './users.router';

export * from './auth.router';
export * from './compliance.router';
export * from './dashboard.router';
export * from './employees.router';
export * from './holidays.router';
export * from './leaves.router';
export * from './loans.router';
export * from './payroll.router';
export * from './router-context';
export * from './timekeeping.router';
export * from './users.router';

export function createApiRouter(
  trpc: TrpcService,
  employeesService: EmployeesService,
  timekeepingService: TimekeepingService,
  payrollService: PayrollService,
  loansService: LoansService,
  complianceService: ComplianceService,
  leavesService: LeavesService,
  authService: AuthService,
  auditService: AuditService,
  dashboardService: DashboardService = new DashboardService(),
  holidaysService: HolidaysService = new HolidaysService(),
) {
  const publicProcedure = trpc.publicProcedure;
  const routerContext = createRouterContext(trpc, {
    authService,
    auditService,
    employeesService,
    timekeepingService,
    payrollService,
    loansService,
    complianceService,
    leavesService,
    dashboardService,
    holidaysService,
  });

  return trpc.router({
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
  });
}

export type AppRouter = ReturnType<typeof createApiRouter>;
