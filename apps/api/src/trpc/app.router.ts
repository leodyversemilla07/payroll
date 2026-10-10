import { createAuthRouter } from '../auth/auth.router';
import { AuthService } from '../auth/auth.service';
import { createUsersRouter } from '../auth/users.router';
import { AuditService } from '../infrastructure/audit/audit.service';
import { createComplianceRouter } from '../modules/compliance/compliance.router';
import { DoleReportService } from '../modules/compliance/dole-report.service';
import { MonthlyRemittanceService } from '../modules/compliance/monthly-remittance.service';
import { PriorEmploymentService } from '../modules/compliance/prior-employment.service';
import { WithholdingExportsService } from '../modules/compliance/withholding-exports.service';
import { YearEndTaxService } from '../modules/compliance/year-end-tax.service';
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
import { createNotificationsRouter } from '../modules/notifications/notifications.router';
import { NotificationService } from '../modules/notifications/notifications.service';
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
  leavesService: LeavesService,
  authService: AuthService,
  auditService: AuditService,
  dashboardService: DashboardService = new DashboardService(),
  holidaysService: HolidaysService = new HolidaysService(),
  notificationService: NotificationService = new NotificationService(),
  priorEmploymentService: PriorEmploymentService = new PriorEmploymentService(),
  monthlyRemittanceService: MonthlyRemittanceService = new MonthlyRemittanceService(),
  withholdingExportsService: WithholdingExportsService = new WithholdingExportsService(),
  yearEndTaxService: YearEndTaxService = new YearEndTaxService(),
  doleReportService: DoleReportService = new DoleReportService(),
) {
  const publicProcedure = trpc.publicProcedure;
  const routerContext = createRouterContext(trpc, {
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
    notifications: createNotificationsRouter(routerContext),
  });
}

export type AppRouter = ReturnType<typeof createApiRouter>;
