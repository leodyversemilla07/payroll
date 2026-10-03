import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Role } from '@workspace/db';
import type { Request, Response } from 'express';
import type { AuditService } from '../../audit/audit.service';
import type { AuthService } from '../../auth/auth.service';
import type { ComplianceService } from '../../modules/compliance/compliance.service';
import type { EmployeesService } from '../../modules/employees/employees.service';
import type { LeavesService } from '../../modules/leaves/leaves.service';
import type { LoansService } from '../../modules/loans/loans.service';
import type { PayrollService } from '../../modules/payroll/payroll.service';
import type { TimekeepingService } from '../../modules/timekeeping/timekeeping.service';
import { type Context, TrpcService } from '../trpc.service';
import { createApiRouter } from './app.router';

const wire = {
  employeeId: '11111111-1111-4111-8111-111111111111',
  separationType: 'RESIGNATION' as const,
  exitDate: '2026-09-30',
  unpaidDaysWorked: 0,
  unusedLeaveDays: 0,
  authorizedLoanDeductionsCents: '0',
};
function context(role: Role | null): Context {
  return {
    req: {
      ip: '127.0.0.1',
      headers: {},
      get: () => 'test',
    } as unknown as Request,
    res: {} as Response,
    user: role
      ? {
          id: 'actor',
          organizationId: 'session-org',
          role,
          name: 'HR',
          email: 'hr@test.invalid',
        }
      : null,
  };
}
describe('Final-pay preview API contract', () => {
  const calculateFinalPaySettlement = jest.fn();
  const router = createApiRouter(
    new TrpcService(),
    { calculateFinalPaySettlement } as unknown as EmployeesService,
    {} as TimekeepingService,
    {} as PayrollService,
    {} as LoansService,
    {} as ComplianceService,
    {} as LeavesService,
    {} as AuthService,
    {} as AuditService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    calculateFinalPaySettlement.mockResolvedValue({
      previewOnly: true,
      taxAdjustmentCents: 0n,
    });
  });
  it.each([
    null,
    Role.EMPLOYEE,
    Role.DEPARTMENT_MANAGER,
    Role.PAYROLL_SPECIALIST,
  ])('denies preview to %s', async (role) => {
    await expect(
      router.createCaller(context(role)).employees.calculateFinalPay(wire),
    ).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    expect(calculateFinalPaySettlement).not.toHaveBeenCalled();
  });
  it.each([Role.HR_ADMIN, Role.SUPER_ADMIN])(
    'uses the %s session tenant and explicit centavos',
    async (role) => {
      await expect(
        router.createCaller(context(role)).employees.calculateFinalPay({
          ...wire,
          organizationId: 'forged-org',
          reviewerId: 'forged-reviewer',
        } as typeof wire),
      ).resolves.toMatchObject({ previewOnly: true });
      expect(calculateFinalPaySettlement).toHaveBeenCalledWith({
        ...wire,
        exitDate: new Date('2026-09-30'),
        organizationId: 'session-org',
        authorizedLoanDeductionsCents: 0n,
      });
    },
  );
  it.each([
    { exitDate: undefined },
    { unpaidDaysWorked: undefined },
    { unusedLeaveDays: undefined },
    { authorizedLoanDeductionsCents: undefined },
    { authorizedLoanDeductionsCents: '0.01' },
    { authorizedLoanDeductionsCents: '-1' },
    { authorizedLoanDeductionsCents: '1234567890123456' },
    { unusedLeaveDays: 1 },
    { unusedLeaveDays: 0.25 },
    { unpaidDaysWorked: 32 },
    { priorMonetizedLeaveDaysInYear: -1 },
    { authorizedLoanDeductionsCents: '1' },
    { retirementBenefitTaxTreatment: 'EXEMPT' },
    { separationType: 'RETIREMENT' },
    {
      separationType: 'RETIREMENT',
      retirementBenefitTaxTreatment: 'EXEMPT',
      isRepeatRetirementClaim: true,
      retirementTaxSourceReference: 'Test review',
    },
  ])(
    'rejects incomplete/unsupported scenario %j before service access',
    async (change) => {
      await expect(
        router
          .createCaller(context(Role.HR_ADMIN))
          .employees.calculateFinalPay({ ...wire, ...change } as typeof wire),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(calculateFinalPaySettlement).not.toHaveBeenCalled();
    },
  );
  it('accepts explicit monetization and reviewed retirement inputs without fabricating history', async () => {
    const input = {
      ...wire,
      separationType: 'RETIREMENT' as const,
      unusedLeaveDays: 2.5,
      priorMonetizedLeaveDaysInYear: 0,
      authorizedLoanDeductionsCents: '123',
      loanAuthorizationReference: ' Test permission ',
      retirementBenefitTaxTreatment: 'EXEMPT' as const,
      isRepeatRetirementClaim: false,
      retirementTaxSourceReference: ' Test classification ',
    };
    await router
      .createCaller(context(Role.HR_ADMIN))
      .employees.calculateFinalPay(input);
    expect(calculateFinalPaySettlement).toHaveBeenCalledWith({
      ...input,
      exitDate: new Date(input.exitDate),
      organizationId: 'session-org',
      authorizedLoanDeductionsCents: 123n,
      loanAuthorizationReference: 'Test permission',
      retirementTaxSourceReference: 'Test classification',
    });
  });
  it.each([
    [new BadRequestException('Explicit inputs required'), 'BAD_REQUEST'],
    [new NotFoundException('Employee not found'), 'NOT_FOUND'],
    [
      new UnprocessableEntityException('Reconcile evidence first'),
      'UNPROCESSABLE_CONTENT',
    ],
    [new Error('private database details'), 'INTERNAL_SERVER_ERROR'],
  ])('maps service errors safely (%s)', async (error, code) => {
    calculateFinalPaySettlement.mockRejectedValue(error);
    await expect(
      router
        .createCaller(context(Role.HR_ADMIN))
        .employees.calculateFinalPay(wire),
    ).rejects.toMatchObject({
      code,
      message:
        code === 'INTERNAL_SERVER_ERROR'
          ? 'Final-pay preview failed. Please retry.'
          : (error as Error).message,
    });
  });
});
