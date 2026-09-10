import type { AuditService } from '../../audit/audit.service';
import type { AuthService } from '../../auth/auth.service';
import type { ComplianceService } from '../../modules/compliance/compliance.service';
import type { EmployeesService } from '../../modules/employees/employees.service';
import type { LeavesService } from '../../modules/leaves/leaves.service';
import type { LoansService } from '../../modules/loans/loans.service';
import type { PayrollService } from '../../modules/payroll/payroll.service';
import type { TimekeepingService } from '../../modules/timekeeping/timekeeping.service';
import { TrpcService } from '../trpc.service';
import { createApiRouter } from './app.router';

jest.mock('@workspace/db', () => ({
  Role: {
    SUPER_ADMIN: 'SUPER_ADMIN',
    HR_ADMIN: 'HR_ADMIN',
    PAYROLL_SPECIALIST: 'PAYROLL_SPECIALIST',
    DEPARTMENT_MANAGER: 'DEPARTMENT_MANAGER',
    EMPLOYEE: 'EMPLOYEE',
  },
  prisma: {},
}));

const EXPECTED_PROCEDURES = [
  'health',
  'auth.login',
  'auth.me',
  'auth.logout',
  'users.list',
  'users.create',
  'users.updateAccess',
  'employees.list',
  'employees.getById',
  'employees.create',
  'employees.calculateFinalPay',
  'timekeeping.listRecent',
  'timekeeping.getDTR',
  'timekeeping.recordPunch',
  'timekeeping.adjustAttendance',
  'timekeeping.importBiometricsCsv',
  'payroll.listRuns',
  'payroll.getRunDetails',
  'payroll.triggerRun',
  'payroll.triggerThirteenthMonthRun',
  'loans.listAll',
  'loans.getActiveLoans',
  'loans.create',
  'compliance.exportBankTransmittal',
  'compliance.exportBir1601C',
  'compliance.exportBir2316',
  'compliance.exportDole13thMonth',
  'leaves.getBalances',
  'leaves.request',
  'leaves.approve',
  'leaves.monetizeSil',
].sort();

const EXPECTED_PROCEDURE_TYPES: Record<string, 'query' | 'mutation'> = {
  health: 'query',
  'auth.login': 'mutation',
  'auth.me': 'query',
  'auth.logout': 'mutation',
  'users.list': 'query',
  'employees.calculateFinalPay': 'query',
  'timekeeping.listRecent': 'query',
  'timekeeping.importBiometricsCsv': 'mutation',
  'payroll.listRuns': 'query',
  'payroll.triggerRun': 'mutation',
  'payroll.triggerThirteenthMonthRun': 'mutation',
  'loans.create': 'mutation',
  'compliance.exportBankTransmittal': 'mutation',
  'leaves.getBalances': 'query',
  'leaves.approve': 'mutation',
  'leaves.monetizeSil': 'query',
};

function stub<T>(): T {
  return {} as T;
}

describe('createApiRouter (shape)', () => {
  const router = createApiRouter(
    new TrpcService(),
    stub<EmployeesService>(),
    stub<TimekeepingService>(),
    stub<PayrollService>(),
    stub<LoansService>(),
    stub<ComplianceService>(),
    stub<LeavesService>(),
    stub<AuthService>(),
    stub<AuditService>(),
  );

  const procedures = router._def.procedures as unknown as Record<
    string,
    { _def: { type: string } }
  >;

  it('exposes the full domain procedure tree', () => {
    expect(Object.keys(procedures).sort()).toEqual(EXPECTED_PROCEDURES);
  });

  it('preserves query/mutation kinds after the domain split', () => {
    for (const [path, type] of Object.entries(EXPECTED_PROCEDURE_TYPES)) {
      expect(procedures[path]._def.type).toBe(type);
    }
  });
});
