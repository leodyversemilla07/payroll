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
  'employees.getRegistrationOptions',
  'employees.create',
  'employees.update',
  'employees.calculateFinalPay',
  'dashboard.getOverview',
  'timekeeping.listRecent',
  'timekeeping.getDTR',
  'timekeeping.recordPunch',
  'timekeeping.adjustAttendance',
  'timekeeping.importBiometricsCsv',
  'payroll.listRuns',
  'payroll.getRunDetails',
  'payroll.triggerRun',
  'payroll.triggerThirteenthMonthRun',
  'payroll.approveRun',
  'payroll.disburseRun',
  'payroll.cancelRun',
  'loans.listAll',
  'loans.getActiveLoans',
  'loans.create',
  'compliance.getTaxEvidence',
  'compliance.listTaxCorrections',
  'compliance.reviewTaxCorrection',
  'compliance.recordPriorEmployerDeclaration',
  'compliance.recordPreviousEmployerIncome',
  'compliance.recordMonthlyTaxRemittance',
  'compliance.exportBankTransmittal',
  'compliance.exportBir1601C',
  'compliance.listYearEndReconciliations',
  'compliance.previewBir2316Reconciliation',
  'compliance.recordYearEndSettlement',
  'compliance.correctPriorEmployerDeclaration',
  'compliance.correctPreviousEmployerIncome',
  'compliance.correctMonthlyTaxRemittance',
  'compliance.correctYearEndSettlement',
  'compliance.issueBir2316',
  'compliance.voidBir2316Issuance',
  'compliance.getBir2316Issuance',
  'compliance.exportDole13thMonth',
  'leaves.getBalances',
  'leaves.withdraw',
  'leaves.cancelApproved',
  'leaves.setCredits',
  'leaves.listCreditChanges',
  'leaves.listRequests',
  'leaves.reject',
  'leaves.request',
  'leaves.approve',
  'leaves.monetizeSil',
  'leaves.listPolicies',
  'leaves.createPolicy',
  'leaves.updatePolicy',
  'leaves.deletePolicy',
  'leaves.runAccrual',
  'leaves.runCarryover',
  'holidays.list',
  'holidays.create',
  'holidays.update',
  'holidays.delete',
  'holidays.populatePresets',
].sort();

const EXPECTED_PROCEDURE_TYPES: Record<string, 'query' | 'mutation'> = {
  health: 'query',
  'auth.login': 'mutation',
  'auth.me': 'query',
  'auth.logout': 'mutation',
  'users.list': 'query',
  'employees.update': 'mutation',
  'employees.calculateFinalPay': 'query',
  'dashboard.getOverview': 'query',
  'employees.getRegistrationOptions': 'query',
  'timekeeping.listRecent': 'query',
  'timekeeping.getDTR': 'query',
  'timekeeping.adjustAttendance': 'mutation',
  'timekeeping.importBiometricsCsv': 'mutation',
  'payroll.listRuns': 'query',
  'payroll.triggerRun': 'mutation',
  'payroll.triggerThirteenthMonthRun': 'mutation',
  'payroll.approveRun': 'mutation',
  'payroll.disburseRun': 'mutation',
  'payroll.cancelRun': 'mutation',
  'loans.create': 'mutation',
  'compliance.getTaxEvidence': 'query',
  'compliance.listTaxCorrections': 'query',
  'compliance.reviewTaxCorrection': 'mutation',
  'compliance.recordPriorEmployerDeclaration': 'mutation',
  'compliance.recordPreviousEmployerIncome': 'mutation',
  'compliance.recordMonthlyTaxRemittance': 'mutation',
  'compliance.recordYearEndSettlement': 'mutation',
  'compliance.correctPriorEmployerDeclaration': 'mutation',
  'compliance.correctPreviousEmployerIncome': 'mutation',
  'compliance.correctMonthlyTaxRemittance': 'mutation',
  'compliance.correctYearEndSettlement': 'mutation',
  'compliance.issueBir2316': 'mutation',
  'compliance.voidBir2316Issuance': 'mutation',
  'compliance.getBir2316Issuance': 'query',
  'compliance.exportBankTransmittal': 'mutation',
  'compliance.listYearEndReconciliations': 'query',
  'leaves.getBalances': 'query',
  'leaves.withdraw': 'mutation',
  'leaves.cancelApproved': 'mutation',
  'leaves.setCredits': 'mutation',
  'leaves.listCreditChanges': 'query',
  'leaves.listRequests': 'query',
  'leaves.request': 'mutation',
  'leaves.reject': 'mutation',
  'leaves.approve': 'mutation',
  'leaves.monetizeSil': 'query',
  'leaves.listPolicies': 'query',
  'leaves.createPolicy': 'mutation',
  'leaves.updatePolicy': 'mutation',
  'leaves.deletePolicy': 'mutation',
  'leaves.runAccrual': 'mutation',
  'leaves.runCarryover': 'mutation',
  'holidays.list': 'query',
  'holidays.create': 'mutation',
  'holidays.update': 'mutation',
  'holidays.delete': 'mutation',
  'holidays.populatePresets': 'mutation',
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
