import { TRPCError } from '@trpc/server';
import { Role } from '@workspace/db';
import { AuditService } from '../../audit/audit.service';
import { type AuthenticatedUser, AuthService } from '../../auth/auth.service';
import { ComplianceService } from '../../modules/compliance/compliance.service';
import { EmployeesService } from '../../modules/employees/employees.service';
import { LeavesService } from '../../modules/leaves/leaves.service';
import { LoansService } from '../../modules/loans/loans.service';
import { PayrollService } from '../../modules/payroll/payroll.service';
import { TimekeepingService } from '../../modules/timekeeping/timekeeping.service';
import { TrpcService } from '../trpc.service';

export const EMPLOYEE_RECORD_ROLES = [
  Role.SUPER_ADMIN,
  Role.HR_ADMIN,
  Role.PAYROLL_SPECIALIST,
] as const;
export const TIMEKEEPING_READ_ROLES = [
  ...EMPLOYEE_RECORD_ROLES,
  Role.DEPARTMENT_MANAGER,
] as const;
export const HR_ROLES = [Role.SUPER_ADMIN, Role.HR_ADMIN] as const;
export const TIMEKEEPING_WRITE_ROLES = [
  Role.SUPER_ADMIN,
  Role.HR_ADMIN,
  Role.PAYROLL_SPECIALIST,
  Role.DEPARTMENT_MANAGER,
] as const;
export const PAYROLL_ROLES = [
  Role.SUPER_ADMIN,
  Role.HR_ADMIN,
  Role.PAYROLL_SPECIALIST,
] as const;
export const PAYROLL_TRIGGER_ROLES = [
  Role.SUPER_ADMIN,
  Role.PAYROLL_SPECIALIST,
] as const;
export const PAYROLL_APPROVAL_ROLES = [
  Role.SUPER_ADMIN,
  Role.HR_ADMIN,
] as const;
export const LEAVE_APPROVAL_ROLES = [
  Role.SUPER_ADMIN,
  Role.HR_ADMIN,
  Role.DEPARTMENT_MANAGER,
] as const;

export function assertEmployeeAccess(
  user: AuthenticatedUser,
  employeeId: string,
  staffRoles: readonly Role[],
): void {
  const isOwnRecord =
    user.role === Role.EMPLOYEE && user.employeeId === employeeId;
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
  complianceService: ComplianceService;
  leavesService: LeavesService;
}

export type RoleProcedure = ReturnType<TrpcService['procedureForRoles']>;

export interface RouterContext extends RouterServices {
  trpc: TrpcService;
  publicProcedure: TrpcService['publicProcedure'];
  protectedProcedure: TrpcService['protectedProcedure'];
  employeeRecordProcedure: RoleProcedure;
  timekeepingReadProcedure: RoleProcedure;
  hrProcedure: RoleProcedure;
  timekeepingWriteProcedure: RoleProcedure;
  payrollProcedure: RoleProcedure;
}

export function createRouterContext(
  trpc: TrpcService,
  services: RouterServices,
): RouterContext {
  return {
    trpc,
    ...services,
    publicProcedure: trpc.publicProcedure,
    protectedProcedure: trpc.protectedProcedure,
    employeeRecordProcedure: trpc.procedureForRoles(EMPLOYEE_RECORD_ROLES),
    timekeepingReadProcedure: trpc.procedureForRoles(TIMEKEEPING_READ_ROLES),
    hrProcedure: trpc.procedureForRoles(HR_ROLES),
    timekeepingWriteProcedure: trpc.procedureForRoles(TIMEKEEPING_WRITE_ROLES),
    payrollProcedure: trpc.procedureForRoles(PAYROLL_ROLES),
  };
}
