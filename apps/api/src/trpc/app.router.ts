import { createAuthRouter } from '../auth/auth.router';
import { AuthService } from '../auth/auth.service';
import { createUsersRouter } from '../auth/users.router';
import { AuditService } from '../infrastructure/audit/audit.service';
import { createComplianceRouter } from '../modules/compliance/compliance.router';
import { ComplianceService } from '../modules/compliance/compliance.service';
import { createDashboardRouter } from '../modules/dashboard/dashboard.router';
import { DashboardService } from '../modules/dashboard/dashboard.service';
import { createEmployeesRouter } from '../modules/employees/employees.router';
import { EmployeesService } from '../modules/employees/employees.service';
import { createHolidaysRouter } from '../modules/holidays/holidays.router';
import { HolidaysService } from '../modules/holidays/holidays.service';
import { createLeavesRouter } from '../modules/leaves/leaves.router';
import { LeavesService } from '../modules/leaves/leaves.service';
import { createLoansRouter } from '../modules/loans/loans.router';
import { LoansService } from '../modules/loans/loans.service';
import { createPayrollRouter } from '../modules/payroll/payroll.router';
import { PayrollService } from '../modules/payroll/payroll.service';
import { createTimekeepingRouter } from '../modules/timekeeping/timekeeping.router';
import { TimekeepingService } from '../modules/timekeeping/timekeeping.service';
import { createRouterContext } from './router-context';
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
