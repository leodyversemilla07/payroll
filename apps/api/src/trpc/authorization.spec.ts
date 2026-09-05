import { Role } from '@workspace/db';
import type { Request, Response } from 'express';
import type { AuditService } from '../audit/audit.service';
import type { AuthService } from '../auth/auth.service';
import type { ComplianceService } from '../modules/compliance/compliance.service';
import type { EmployeesService } from '../modules/employees/employees.service';
import type { LeavesService } from '../modules/leaves/leaves.service';
import type { LoansService } from '../modules/loans/loans.service';
import type { PayrollService } from '../modules/payroll/payroll.service';
import type { TimekeepingService } from '../modules/timekeeping/timekeeping.service';
import { createApiRouter } from './routers/app.router';
import { type Context, TrpcService } from './trpc.service';

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
  const complianceService = {} as ComplianceService;
  const leavesService = {} as LeavesService;
  const authService = {} as AuthService;
  const auditService = { record: jest.fn() } as unknown as AuditService;

  const router = createApiRouter(
    new TrpcService(),
    employeesService,
    timekeepingService,
    payrollService,
    loansService,
    complianceService,
    leavesService,
    authService,
    auditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
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
});
