import { TRPCError } from '@trpc/server';
// Role assignments live in @workspace/db (packages/db/src/role-matrix.ts): the
// web portal renders navigation and capability flags from the same constants,
// so server and UI cannot drift apart.
import {
  HR_ROLES,
  PAYROLL_ROLES,
  Role,
  STAFF_ROLES,
  TIMEKEEPING_READ_ROLES,
  TIMEKEEPING_WRITE_ROLES,
} from '@workspace/db';
import { type AuthenticatedUser, AuthService } from '../auth/auth.service';
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
import { TrpcService } from './trpc.service';

// Re-exported under the same names so router modules that import roles from
// this module keep working. The SoD rationale lives with the matrix in
// packages/db/src/role-matrix.ts.
export {
  EMPLOYEE_RECORD_ROLES,
  HR_ROLES,
  LEAVE_APPROVAL_ROLES,
  PAYROLL_APPROVAL_ROLES,
  PAYROLL_ROLES,
  PAYROLL_TRIGGER_ROLES,
  STAFF_ROLES,
  TIMEKEEPING_READ_ROLES,
  TIMEKEEPING_WRITE_ROLES,
} from '@workspace/db';

export function assertEmployeeAccess(
  user: AuthenticatedUser,
  employeeId: string,
  staffRoles: readonly Role[],
): void {
  const isOwnRecord = Boolean(
    user.employeeId && user.employeeId === employeeId,
  );
  if (!isOwnRecord && !staffRoles.includes(user.role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to access this employee record',
    });
  }
}

export interface RouterServices {
  authService: AuthService;
  auditService: AuditService;
  employeesService: EmployeesService;
  timekeepingService: TimekeepingService;
  payrollService: PayrollService;
  loansService: LoansService;
  priorEmploymentService: PriorEmploymentService;
  monthlyRemittanceService: MonthlyRemittanceService;
  withholdingExportsService: WithholdingExportsService;
  yearEndTaxService: YearEndTaxService;
  doleReportService: DoleReportService;
  leavesService: LeavesService;
  dashboardService: DashboardService;
  holidaysService: HolidaysService;
  notificationService: NotificationService;
  cutoffSchedulerService?: CutoffSchedulerService;
}

export type RoleProcedure = ReturnType<TrpcService['procedureForRoles']>;

export interface RouterContext extends RouterServices {
  cutoffSchedulerService: CutoffSchedulerService;
  trpc: TrpcService;
  publicProcedure: TrpcService['publicProcedure'];
  protectedProcedure: TrpcService['protectedProcedure'];
  timekeepingReadProcedure: RoleProcedure;
  hrProcedure: RoleProcedure;
  timekeepingWriteProcedure: RoleProcedure;
  payrollProcedure: RoleProcedure;
  staffProcedure: RoleProcedure;
}

export function createRouterContext(
  trpc: TrpcService,
  services: RouterServices,
): RouterContext {
  return {
    trpc,
    ...services,
    cutoffSchedulerService:
      services.cutoffSchedulerService ?? new CutoffSchedulerService(),
    publicProcedure: trpc.publicProcedure,
    protectedProcedure: trpc.protectedProcedure,
    timekeepingReadProcedure: trpc.procedureForRoles(TIMEKEEPING_READ_ROLES),
    hrProcedure: trpc.procedureForRoles(HR_ROLES),
    timekeepingWriteProcedure: trpc.procedureForRoles(TIMEKEEPING_WRITE_ROLES),
    payrollProcedure: trpc.procedureForRoles(PAYROLL_ROLES),
    staffProcedure: trpc.procedureForRoles(STAFF_ROLES),
  };
}
