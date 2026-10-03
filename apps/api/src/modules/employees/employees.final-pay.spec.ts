import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { prisma } from '@workspace/db';
import { EmployeesService } from './employees.service';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: {
    $transaction: jest.fn(),
    employee: { findFirst: jest.fn() },
    payslip: { findMany: jest.fn() },
    payrollRun: { findFirst: jest.fn() },
    taxEvidenceCorrection: { count: jest.fn() },
    priorEmployerDeclaration: { findFirst: jest.fn() },
    previousEmployerIncome: { findMany: jest.fn() },
    yearEndTaxSettlement: { findFirst: jest.fn() },
  },
}));
const request = {
  employeeId: '11111111-1111-4111-8111-111111111111',
  organizationId: 'org-1',
  separationType: 'RESIGNATION' as const,
  exitDate: new Date('2026-09-30'),
  unpaidDaysWorked: 0,
  unusedLeaveDays: 0,
  authorizedLoanDeductionsCents: 0n,
};
const employee = {
  id: request.employeeId,
  firstName: 'Test',
  lastName: 'Employee',
  employeeNumber: 'EMP-1',
  tin: '123',
  hireDate: new Date('2025-01-01'),
  dateOfBirth: new Date('1990-01-01'),
  loans: [],
  leaveBalances: [],
  compensation: {
    basicRateMonthlyCents: 3000000n,
    basicRateDailyCents: 137931n,
    isTaxExempt: false,
  },
};
const regularSlip = {
  basicPayCents: 1500000n,
  tardinessDeductionCents: 0n,
  undertimeDeductionCents: 0n,
  absenceDeductionCents: 100000n,
  grossPayCents: 1400000n,
  nonTaxableAllowancesCents: 0n,
  sssEmployeeCents: 100000n,
  philhealthEmployeeCents: 0n,
  pagibigEmployeeCents: 0n,
  withholdingTaxCents: 10000n,
  bonusPaidCents: 0n,
  deMinimisExcessCents: 0n,
  payrollRun: {
    cutoffSequence: 'FIRST_CUTOFF',
    cutoffEndDate: new Date('2026-09-15'),
  },
};
const specialSlip = {
  ...regularSlip,
  basicPayCents: 0n,
  absenceDeductionCents: 0n,
  grossPayCents: 50000n,
  nonTaxableAllowancesCents: 50000n,
  sssEmployeeCents: 0n,
  withholdingTaxCents: 0n,
  bonusPaidCents: 50000n,
  payrollRun: {
    cutoffSequence: 'SPECIAL_RUN',
    cutoffEndDate: new Date('2026-09-20'),
  },
};
const priorIncome = {
  employerTin: '123456789',
  periodStart: new Date('2026-01-01'),
  periodEnd: new Date('2026-01-31'),
  version: 1,
  grossCompensationCents: 40000000n,
  taxableCompensationCents: 30000000n,
  taxWithheldCents: 100000n,
};
const retirement = {
  ...request,
  separationType: 'RETIREMENT' as const,
  retirementBenefitTaxTreatment: 'TAXABLE' as const,
  isRepeatRetirementClaim: false,
  retirementTaxSourceReference: 'Reviewed synthetic classification',
};
const preview = (input = request) =>
  new EmployeesService().calculateFinalPaySettlement(input);

describe('EmployeesService final-pay preview with the real calculation engine', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (tx: typeof prisma) => Promise<unknown>)(prisma),
      );
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(employee as never);
    jest
      .mocked(prisma.payslip.findMany)
      .mockResolvedValue([regularSlip, specialSlip] as never);
    jest
      .mocked(prisma.priorEmployerDeclaration.findFirst)
      .mockResolvedValue({ hasPriorEmployer: false } as never);
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([]);
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.payrollRun.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.taxEvidenceCorrection.count).mockResolvedValue(0);
  });
  it('uses disbursed ledger amounts and a repeatable-read snapshot, without assumed leave or debt collection', async () => {
    const result = await preview();
    expect(prisma.payslip.findMany).toHaveBeenCalledWith({
      where: {
        employeeId: request.employeeId,
        payrollRun: {
          organizationId: 'org-1',
          status: 'DISBURSED',
          paymentDate: {
            gte: new Date('2026-01-01'),
            lt: new Date('2026-10-01'),
          },
        },
      },
      include: expect.any(Object),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      timeout: 30000,
    });
    expect(result).toMatchObject({
      proratedThirteenthMonthCents: 66666n,
      taxAdjustmentCents: -10000n,
      monetizedLeaveCents: 0n,
      outstandingLoanDeductionsCents: 0n,
      previewOnly: true,
    });
    expect(result.yearsOfService).toBeGreaterThan(1);
    expect(result.remarks).toContain('No leave debit');
  });
  it('does not credit a prior-year bonus paid this tax year against the current service year', async () => {
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      regularSlip,
      {
        ...specialSlip,
        payrollRun: {
          cutoffSequence: 'SPECIAL_RUN',
          cutoffEndDate: new Date('2025-12-20'),
        },
      },
    ] as never);
    expect((await preview()).proratedThirteenthMonthCents).toBe(116666n);
  });
  it('refuses to estimate annual pay without disbursed regular payroll', async () => {
    jest
      .mocked(prisma.payslip.findMany)
      .mockResolvedValue([specialSlip] as never);
    await expect(preview()).rejects.toThrow(UnprocessableEntityException);
  });
  it('tenant-scopes employee lookup before reading financial sources', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);
    await expect(preview()).rejects.toThrow(NotFoundException);
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: request.employeeId, organizationId: 'org-1' },
      }),
    );
    expect(prisma.payslip.findMany).not.toHaveBeenCalled();
  });
  it.each([
    { organizationId: undefined },
    { organizationId: '' },
    { authorizedLoanDeductionsCents: 123 },
    { unpaidDaysWorked: undefined },
    { unusedLeaveDays: undefined },
    { authorizedLoanDeductionsCents: undefined },
    { exitDate: new Date('invalid') },
    { unpaidDaysWorked: -1 },
    { unpaidDaysWorked: 32 },
    { unusedLeaveDays: 1.25 },
    { unusedLeaveDays: 2 },
    { authorizedLoanDeductionsCents: 1n },
  ])('rejects missing/unsupported direct-service inputs %j', async (change) => {
    await expect(
      preview({ ...request, ...change } as typeof request),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('does not infer a prior-employer declaration', async () => {
    jest
      .mocked(prisma.priorEmployerDeclaration.findFirst)
      .mockResolvedValue(null);
    await expect(preview()).rejects.toThrow('prior-employer declaration');
  });
  it('includes effective prior taxable income and withholding without re-bucketing it', async () => {
    jest
      .mocked(prisma.priorEmployerDeclaration.findFirst)
      .mockResolvedValue({ hasPriorEmployer: true } as never);
    jest
      .mocked(prisma.previousEmployerIncome.findMany)
      .mockResolvedValue([
        { ...priorIncome, version: 0, taxableCompensationCents: 20000000n },
        priorIncome,
      ] as never);
    expect(await preview()).toMatchObject({
      totalAnnualTaxableCompensationCents: 31300000n,
      annualTaxAdjustmentCents: 835000n,
      priorEmployerTotals: { taxableCents: 30000000n, documentCount: 1 },
    });
  });
  it('blocks prior documents extending beyond exit', async () => {
    jest
      .mocked(prisma.priorEmployerDeclaration.findFirst)
      .mockResolvedValue({ hasPriorEmployer: true } as never);
    jest
      .mocked(prisma.previousEmployerIncome.findMany)
      .mockResolvedValue([
        { ...priorIncome, periodEnd: new Date('2026-12-31') },
      ] as never);
    await expect(preview()).rejects.toThrow('extends beyond');
  });
  it('subtracts a recorded refund exactly once instead of proposing it again', async () => {
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      settledCents: 10000n,
      settlementType: 'REFUND_PAID',
      settlementDate: new Date('2026-09-20'),
    } as never);
    expect(await preview()).toMatchObject({
      annualTaxAdjustmentCents: -10000n,
      settledTaxAdjustmentCents: -10000n,
      taxAdjustmentCents: 0n,
      netFinalPayCents: 66666n,
    });
  });
  it.each([
    {
      settledCents: -1n,
      settlementType: 'REFUND_PAID',
      settlementDate: new Date('2026-09-20'),
    },
    {
      settledCents: 1n,
      settlementType: 'UNKNOWN',
      settlementDate: new Date('2026-09-20'),
    },
    {
      settledCents: 1n,
      settlementType: 'REFUND_PAID',
      settlementDate: new Date('2026-10-01'),
    },
  ])(
    'fails closed on unsupported recorded settlements %j',
    async (settlement) => {
      jest
        .mocked(prisma.yearEndTaxSettlement.findFirst)
        .mockResolvedValue(settlement as never);
      await expect(preview()).rejects.toThrow('Recorded tax settlement');
    },
  );
  it.each(['DRAFT', 'PROCESSING', 'AUDITED', 'APPROVED'])(
    'blocks employee payroll reservations in %s',
    async () => {
      jest
        .mocked(prisma.payrollRun.findFirst)
        .mockResolvedValue({ id: 'pending' } as never);
      await expect(preview()).rejects.toThrow('non-disbursed payroll');
      expect(prisma.payrollRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['DRAFT', 'PROCESSING', 'AUDITED', 'APPROVED'] },
            payslips: { some: { employeeId: request.employeeId } },
          }),
        }),
      );
    },
  );
  it('blocks pending employee or organization remittance corrections', async () => {
    jest.mocked(prisma.taxEvidenceCorrection.count).mockResolvedValue(1);
    await expect(preview()).rejects.toThrow('pending tax evidence corrections');
    expect(prisma.taxEvidenceCorrection.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        taxYear: 2026,
        status: 'PENDING',
        OR: [{ employeeId: request.employeeId }, { kind: 'REMITTANCE' }],
      },
    });
  });
  it('requires recorded SIL and does not assume a five-day balance', async () => {
    await expect(
      preview({
        ...request,
        unusedLeaveDays: 1,
        priorMonetizedLeaveDaysInYear: 0,
      } as typeof request),
    ).rejects.toThrow('recorded SIL balance');
  });
  it('uses explicit available days and earlier monetization against the cumulative exemption', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      ...employee,
      leaveBalances: [
        { leaveType: 'SIL', totalCredits: 10, usedCredits: 4, balance: 6 },
      ],
    } as never);
    expect(
      await preview({
        ...request,
        unusedLeaveDays: 6,
        priorMonetizedLeaveDaysInYear: 8,
      } as typeof request),
    ).toMatchObject({
      monetizedLeaveCents: 827586n,
      monetizedLeaveExemptCents: 551724n,
      monetizedLeaveTaxableCents: 275862n,
    });
  });
  it.each([
    { totalCredits: 10, usedCredits: 4, balance: 5 },
    { totalCredits: 5, usedCredits: 4, balance: 1 },
    { totalCredits: 5.25, usedCredits: 0, balance: 5.25 },
  ])('refuses inconsistent or insufficient leave %j', async (balance) => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      ...employee,
      leaveBalances: [{ leaveType: 'SIL', ...balance }],
    } as never);
    await expect(
      preview({
        ...request,
        unusedLeaveDays: 2,
        priorMonetizedLeaveDaysInYear: 0,
      } as typeof request),
    ).rejects.toThrow('consistent recorded SIL');
  });
  it('reports debt but deducts only the explicitly authorized scenario amount', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      ...employee,
      loans: [{ balanceCents: 500000n, isActive: false }],
    } as never);
    expect((await preview()).outstandingLoanDeductionsCents).toBe(0n);
    expect(
      await preview({
        ...request,
        authorizedLoanDeductionsCents: 50000n,
        loanAuthorizationReference: 'Synthetic written permission',
      } as typeof request),
    ).toMatchObject({
      recordedLoanBalanceCents: 500000n,
      outstandingLoanDeductionsCents: 50000n,
    });
    await expect(
      preview({
        ...request,
        authorizedLoanDeductionsCents: 500001n,
        loanAuthorizationReference: 'Synthetic written permission',
      } as typeof request),
    ).rejects.toThrow('exceed recorded');
  });
  it('reports an unfunded remainder rather than pretending the deductions were collected', async () => {
    jest
      .mocked(prisma.priorEmployerDeclaration.findFirst)
      .mockResolvedValue({ hasPriorEmployer: true } as never);
    jest
      .mocked(prisma.previousEmployerIncome.findMany)
      .mockResolvedValue([{ ...priorIncome, taxWithheldCents: 0n }] as never);
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      settledCents: 500000n,
      settlementType: 'DEFICIENCY_WITHHELD',
      settlementDate: new Date('2026-09-20'),
    } as never);
    expect(await preview()).toMatchObject({
      annualTaxAdjustmentCents: 935000n,
      settledTaxAdjustmentCents: 500000n,
      taxAdjustmentCents: 435000n,
      signedNetFinalPayCents: -368334n,
      netFinalPayCents: 0n,
      unfundedDeductionsCents: 368334n,
    });
  });
  it('uses exact fifth-service and sixtieth-birthday anniversaries', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      ...employee,
      hireDate: new Date('2021-09-30'),
      dateOfBirth: new Date('1966-09-30'),
    } as never);
    expect(
      await new EmployeesService().calculateFinalPaySettlement(retirement),
    ).toMatchObject({
      yearsOfService: 5,
      separationPayCents: 15517235n,
      isSeparationPayTaxExempt: false,
    });
    expect(
      await new EmployeesService().calculateFinalPaySettlement({
        ...retirement,
        retirementBenefitTaxTreatment: 'EXEMPT',
      }),
    ).toMatchObject({ isSeparationPayTaxExempt: true });
  });
  it('does not let an override manufacture five-year eligibility', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      ...employee,
      hireDate: new Date('2022-01-01'),
      dateOfBirth: new Date('1960-01-01'),
    } as never);
    await expect(
      new EmployeesService().calculateFinalPaySettlement({
        ...retirement,
        yearsOfService: 5,
      }),
    ).rejects.toThrow('override');
  });
  it('maps unsupported early retirement to a reconciliation error', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      ...employee,
      hireDate: new Date('2020-01-01'),
    } as never);
    await expect(
      new EmployeesService().calculateFinalPaySettlement(retirement),
    ).rejects.toThrow(UnprocessableEntityException);
  });
  it('refuses unclassified MWE income instead of silently exempting everything', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      ...employee,
      compensation: { ...employee.compensation, isTaxExempt: true },
    } as never);
    await expect(preview()).rejects.toThrow('manual tax review');
  });
});
