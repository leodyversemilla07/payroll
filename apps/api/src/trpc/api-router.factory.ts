import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../infrastructure/audit/audit.service';
import { DoleReportService } from '../modules/compliance/dole-report.service';
import { MonthlyRemittanceService } from '../modules/compliance/monthly-remittance.service';
import { PriorEmploymentService } from '../modules/compliance/prior-employment.service';
import { WithholdingExportsService } from '../modules/compliance/withholding-exports.service';
import { YearEndTaxService } from '../modules/compliance/year-end-tax.service';
import { DashboardService } from '../modules/dashboard/dashboard.service';
import { EmployeesService } from '../modules/employees/employees.service';
import { HolidaysService } from '../modules/holidays/holidays.service';
import { LeavesService } from '../modules/leaves/leaves.service';
import { LoansService } from '../modules/loans/loans.service';
import { NotificationService } from '../modules/notifications/notifications.service';
import { CutoffSchedulerService } from '../modules/payroll/cutoff-scheduler.service';
import { PayrollService } from '../modules/payroll/payroll.service';
import { TimekeepingService } from '../modules/timekeeping/timekeeping.service';
import {
  type ApiRouterServices,
  type AppRouter,
  createApiRouter,
} from './app.router';
import { TrpcService } from './trpc.service';

// Single point where Nest's container feeds the tRPC router. Previously
// main.ts hand-resolved 16 services with app.get(...) and passed them
// positionally; adding a router dependency meant touching three files in
// exactly the right order. Here a new constructor parameter is the whole
// change, and TypeScript flags the missing wiring at this one site.
@Injectable()
export class ApiRouterFactory {
  // The public readonly parameter properties ARE the ApiRouterServices shape:
  // `createApiRouter(this)` passes this instance (with its DI-resolved
  // dependencies) straight into the pure router builder.
  constructor(
    readonly trpcService: TrpcService,
    readonly authService: AuthService,
    readonly auditService: AuditService,
    readonly employeesService: EmployeesService,
    readonly timekeepingService: TimekeepingService,
    readonly payrollService: PayrollService,
    readonly loansService: LoansService,
    readonly leavesService: LeavesService,
    readonly dashboardService: DashboardService,
    readonly holidaysService: HolidaysService,
    readonly notificationService: NotificationService,
    readonly priorEmploymentService: PriorEmploymentService,
    readonly monthlyRemittanceService: MonthlyRemittanceService,
    readonly withholdingExportsService: WithholdingExportsService,
    readonly yearEndTaxService: YearEndTaxService,
    readonly doleReportService: DoleReportService,
    readonly cutoffSchedulerService: CutoffSchedulerService,
  ) {}

  create(): AppRouter {
    return createApiRouter(this satisfies ApiRouterServices);
  }
}
