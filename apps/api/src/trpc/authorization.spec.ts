import { prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import type { AuthService } from '../auth/auth.service';
import type { AuditService } from '../infrastructure/audit/audit.service';
import type { DoleReportService } from '../modules/compliance/dole-report.service';
import type { MonthlyRemittanceService } from '../modules/compliance/monthly-remittance.service';
import type { PriorEmploymentService } from '../modules/compliance/prior-employment.service';
import type { WithholdingExportsService } from '../modules/compliance/withholding-exports.service';
import type { YearEndTaxService } from '../modules/compliance/year-end-tax.service';
import type { DashboardService } from '../modules/dashboard/dashboard.service';
import type { EmployeesService } from '../modules/employees/employees.service';
import type { HolidaysService } from '../modules/holidays/holidays.service';
import type { LeavesService } from '../modules/leaves/leaves.service';
import type { LoansService } from '../modules/loans/loans.service';
import type { NotificationService } from '../modules/notifications/notifications.service';
import type { PayrollService } from '../modules/payroll/payroll.service';
import type { TimekeepingService } from '../modules/timekeeping/timekeeping.service';
import { createApiRouter } from './app.router';
import { type Context, TrpcService } from './trpc.service';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: { $transaction: jest.fn() },
}));

function createContext(
  role: Role | null,
  overrides: Partial<NonNullable<Context['user']>> = {},
): Context {
  return {
    req: {
      ip: '127.0.0.1',
      get: jest.fn(),
      headers: {},
    } as unknown as Request,
    res: {} as Response,
    user: role
      ? {
          id: 'user-a',
          organizationId: 'organization-a',
          email: 'user@example.com',
          name: 'Test User',
          role,
          ...overrides,
        }
      : null,
  };
}

describe('tRPC authorization', () => {
  const listEmployees = jest.fn();
  const getEmployeeById = jest.fn();
  const registerEmployee = jest.fn();
  const executePayrollRun = jest.fn();
  const employeesService = {
    listEmployees,
    getEmployeeById,
    registerEmployee,
  } as unknown as EmployeesService;
  const timekeepingService = {} as TimekeepingService;
  const payrollService = {
    executePayrollRun,
  } as unknown as PayrollService;
  const loansService = {} as LoansService;
  const recordPriorEmployerDeclaration = jest.fn();
  const recordMonthlyTaxRemittance = jest.fn();
  const getBir2316Issuance = jest.fn();
  const generateBir2316Pdf = jest.fn();
  const priorEmploymentService = {
    withDatabase: () => priorEmploymentService,
    recordPriorEmployerDeclaration,
  } as unknown as PriorEmploymentService;
  const monthlyRemittanceService = {
    withDatabase: () => monthlyRemittanceService,
    recordMonthlyTaxRemittance,
  } as unknown as MonthlyRemittanceService;
  const yearEndTaxService = {
    withDatabase: () => yearEndTaxService,
    getBir2316Issuance,
    generateBir2316Pdf,
  } as unknown as YearEndTaxService;
  const leavesService = {} as LeavesService;
  const authService = {} as AuthService;
  const auditService = { record: jest.fn() } as unknown as AuditService;

  const router = createApiRouter({
    trpcService: new TrpcService(),
    employeesService,
    timekeepingService,
    payrollService,
    loansService,
    leavesService,
    authService,
    auditService,
    dashboardService: {} as DashboardService,
    holidaysService: {} as HolidaysService,
    notificationService: {} as NotificationService,
    priorEmploymentService,
    monthlyRemittanceService,
    withholdingExportsService: {} as WithholdingExportsService,
    yearEndTaxService,
    doleReportService: {} as DoleReportService,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(
      (operation: (database: object) => Promise<unknown>) => operation({}),
    );
  });

  it('rejects anonymous access to protected tenant data', async () => {
    const caller = router.createCaller(createContext(null));

    await expect(caller.employees.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(listEmployees).not.toHaveBeenCalled();
  });

  it('derives the employee-list tenant from the authenticated user', async () => {
    listEmployees.mockResolvedValue([]);
    const caller = router.createCaller(createContext(Role.HR_ADMIN));

    await caller.employees.list();

    expect(listEmployees).toHaveBeenCalledWith('organization-a');
  });

  it('always scopes employee lookups to the caller organization', async () => {
    getEmployeeById.mockResolvedValue(null);
    const caller = router.createCaller(createContext(Role.HR_ADMIN));
    const requestedId = '1941a12f-26c4-4a48-8e7e-d574f2109800';

    await caller.employees.getById({ id: requestedId });

    expect(getEmployeeById).toHaveBeenCalledWith(requestedId, 'organization-a');
  });

  it('prevents employees from reading another employee record', async () => {
    const caller = router.createCaller(
      createContext(Role.EMPLOYEE, { employeeId: 'employee-a' }),
    );

    await expect(
      caller.employees.getById({
        id: '1941a12f-26c4-4a48-8e7e-d574f2109800',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(getEmployeeById).not.toHaveBeenCalled();
  });

  it('restricts tax-evidence writes to HR and derives provenance from the session', async () => {
    const employeeId = '1941a12f-26c4-4a48-8e7e-d574f2109800';
    await expect(
      router
        .createCaller(createContext(Role.PAYROLL_SPECIALIST))
        .compliance.recordPriorEmployerDeclaration({
          employeeId,
          taxYear: 2026,
          hasPriorEmployer: false,
          sourceReference: 'DECL-1',
        }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(recordPriorEmployerDeclaration).not.toHaveBeenCalled();
    recordPriorEmployerDeclaration.mockResolvedValue({ id: 'record-1' });
    const caller = router.createCaller(createContext(Role.HR_ADMIN));
    await caller.compliance.recordPriorEmployerDeclaration({
      employeeId,
      taxYear: 2026,
      hasPriorEmployer: false,
      sourceReference: 'DECL-1',
    });
    expect(recordPriorEmployerDeclaration).toHaveBeenCalledWith({
      employeeId,
      taxYear: 2026,
      hasPriorEmployer: false,
      sourceReference: 'DECL-1',
      organizationId: 'organization-a',
      recordedById: 'user-a',
    });
    expect(auditService.record as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'PriorEmployerDeclaration',
        entityId: 'record-1',
      }),
      expect.any(Object),
    );
    recordMonthlyTaxRemittance.mockResolvedValue({ id: 'record-2' });
    await caller.compliance.recordMonthlyTaxRemittance({
      taxYear: 2026,
      month: 12,
      remittedCents: '12345',
      documentReference: '1601C-12',
    });
    expect(recordMonthlyTaxRemittance).toHaveBeenCalledWith({
      taxYear: 2026,
      month: 12,
      remittedCents: 12345n,
      documentReference: '1601C-12',
      organizationId: 'organization-a',
      recordedById: 'user-a',
    });
  });

  it('prevents HR administrators from executing payroll', async () => {
    const caller = router.createCaller(createContext(Role.HR_ADMIN));

    await expect(
      caller.payroll.triggerRun({
        cutoffStartDate: '2026-01-01',
        cutoffEndDate: '2026-01-15',
        paymentDate: '2026-01-20',
        cutoffSequence: 'FIRST_CUTOFF',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(executePayrollRun).not.toHaveBeenCalled();
  });

  describe('BIR Form 2316 PDF authorization', () => {
    const ownEmployeeId = '11111111-1111-4111-8111-111111111111';
    const otherEmployeeId = '22222222-2222-4222-8222-222222222222';

    it('prevents employees from viewing another employee BIR 2316 issuance', async () => {
      const caller = router.createCaller(
        createContext(Role.EMPLOYEE, { employeeId: ownEmployeeId }),
      );

      await expect(
        caller.compliance.getBir2316Issuance({
          employeeId: otherEmployeeId,
          taxYear: 2026,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('allows employees to view their own BIR 2316 issuance', async () => {
      getBir2316Issuance.mockResolvedValue({
        status: 'ISSUED',
        version: 1,
        issuedAt: new Date(),
      });

      const caller = router.createCaller(
        createContext(Role.EMPLOYEE, { employeeId: ownEmployeeId }),
      );

      const result = await caller.compliance.getBir2316Issuance({
        employeeId: ownEmployeeId,
        taxYear: 2026,
      });

      expect(result).toMatchObject({ status: 'ISSUED', version: 1 });
      expect(getBir2316Issuance).toHaveBeenCalledWith(
        ownEmployeeId,
        'organization-a',
        2026,
      );
    });

    it('prevents employees from downloading BIR 2316 PDF of another employee', async () => {
      const caller = router.createCaller(
        createContext(Role.EMPLOYEE, { employeeId: ownEmployeeId }),
      );

      await expect(
        caller.compliance.downloadBir2316Pdf({
          employeeId: otherEmployeeId,
          taxYear: 2026,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('prevents employees from downloading BIR 2316 PDF if not yet officially issued', async () => {
      getBir2316Issuance.mockResolvedValue({
        status: 'NOT_ISSUED',
      });

      const caller = router.createCaller(
        createContext(Role.EMPLOYEE, { employeeId: ownEmployeeId }),
      );

      await expect(
        caller.compliance.downloadBir2316Pdf({
          employeeId: ownEmployeeId,
          taxYear: 2026,
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('not yet been issued'),
      });
    });

    it('allows employees to download their own officially issued BIR 2316 PDF', async () => {
      getBir2316Issuance.mockResolvedValue({
        status: 'ISSUED',
        version: 1,
      });
      generateBir2316Pdf.mockResolvedValue({
        fileName: 'BIR2316_2026_Doe_John_OFFICIAL.pdf',
        dataBase64: 'JVBERi0xLjQK...',
        isIssued: true,
      });

      const caller = router.createCaller(
        createContext(Role.EMPLOYEE, { employeeId: ownEmployeeId }),
      );

      const result = await caller.compliance.downloadBir2316Pdf({
        employeeId: ownEmployeeId,
        taxYear: 2026,
      });

      expect(result.fileName).toContain('OFFICIAL');
      expect(generateBir2316Pdf).toHaveBeenCalledWith(
        ownEmployeeId,
        'organization-a',
        2026,
        false, // non-staff cannot request draft preview
      );
    });

    it('allows HR administrators to download draft preview PDF for any employee', async () => {
      generateBir2316Pdf.mockResolvedValue({
        fileName: 'BIR2316_2026_Doe_John_PREVIEW.pdf',
        dataBase64: 'JVBERi0xLjQK...',
        isIssued: false,
      });

      const caller = router.createCaller(createContext(Role.HR_ADMIN));

      const result = await caller.compliance.downloadBir2316Pdf({
        employeeId: otherEmployeeId,
        taxYear: 2026,
        isPreview: true,
      });

      expect(result.fileName).toContain('PREVIEW');
      expect(generateBir2316Pdf).toHaveBeenCalledWith(
        otherEmployeeId,
        'organization-a',
        2026,
        true,
      );
    });
  });
});
