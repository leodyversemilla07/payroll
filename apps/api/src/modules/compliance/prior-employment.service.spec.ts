import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { prisma } from '@workspace/db';
import { MonthlyRemittanceService } from './monthly-remittance.service';
import { PriorEmploymentService } from './prior-employment.service';
import { YearEndTaxService } from './year-end-tax.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    payrollRun: { findFirst: jest.fn() },
    payslip: { findMany: jest.fn() },
    employee: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    organization: { findUnique: jest.fn() },
    priorEmployerDeclaration: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    previousEmployerIncome: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    monthlyTaxRemittanceEvidence: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: { findFirst: jest.fn() },
    yearEndTaxSettlement: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    bir2316Issuance: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const organization = {
  id: 'org-1',
  name: 'Real Business Inc.',
  tin: '111-222-333-000',
  rdoCode: '047',
  registeredAddress: 'Makati City',
};

const basePayslip = {
  basicPayCents: 1500000n,
  grossPayCents: 1545000n,
  tardinessDeductionCents: 100000n,
  undertimeDeductionCents: 0n,
  absenceDeductionCents: 0n,
  overtimePayCents: 20000n,
  holidayPayCents: 0n,
  nightDiffPayCents: 0n,
  restDayPayCents: 0n,
  taxableAllowancesCents: 25000n,
  nonTaxableAllowancesCents: 100000n,
  deMinimisExcessCents: 0n,
  sssEmployeeCents: 100000n,
  sssWispEmployeeCents: 0n,
  philhealthEmployeeCents: 30000n,
  pagibigEmployeeCents: 20000n,
  withholdingTaxCents: 15000n,
  bonusPaidCents: 0n,
};

const employee = {
  id: 'employee-1',
  employeeNumber: 'EMP-1',
  firstName: 'Alex',
  lastName: 'Santos',
  tin: '444-555-666-000',
  residentialAddress: 'Quezon City',
  middleName: null,
  hireDate: new Date('2022-01-10'),
  employmentStatus: 'ACTIVE',
  compensation: {
    basicRateMonthlyCents: 3000000n,
    isTaxExempt: false,
  },
  organization,
};

describe('PriorEmploymentService exports', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(prisma.priorEmployerDeclaration.findMany).mockResolvedValue([]);
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([]);
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findMany)
      .mockResolvedValue([]);
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([]);
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.yearEndTaxSettlement.findMany).mockResolvedValue([]);
    jest
      .mocked(prisma.priorEmployerDeclaration.findUnique)
      .mockResolvedValue(null);
    jest
      .mocked(prisma.priorEmployerDeclaration.findFirst)
      .mockResolvedValue(null);
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([]);
    jest
      .mocked(prisma.previousEmployerIncome.findFirst)
      .mockResolvedValue(null);
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findFirst)
      .mockResolvedValue(null);
    jest.mocked(prisma.bir2316Issuance.findMany).mockResolvedValue([]);
    jest.mocked(prisma.bir2316Issuance.findFirst).mockResolvedValue(null);
  });

  it('requires a tenant-owned employee, a prior-employer declaration and valid period for immutable tax inputs', async () => {
    const declarationInput = {
      employeeId: 'employee-1',
      organizationId: 'org-1',
      taxYear: 2026,
      hasPriorEmployer: true,
      sourceReference: 'DECL-1',
      recordedById: 'hr-1',
    };
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);
    await expect(
      new PriorEmploymentService().recordPriorEmployerDeclaration(
        declarationInput,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.priorEmployerDeclaration.create).not.toHaveBeenCalled();
    jest
      .mocked(prisma.employee.findFirst)
      .mockResolvedValue({ id: 'employee-1' } as never);
    jest
      .mocked(prisma.priorEmployerDeclaration.create)
      .mockRejectedValue({ code: 'P2002' });
    await expect(
      new PriorEmploymentService().recordPriorEmployerDeclaration(
        declarationInput,
      ),
    ).rejects.toThrow('already exists');
    jest.mocked(prisma.priorEmployerDeclaration.findFirst).mockResolvedValue({
      ...declarationInput,
      hasPriorEmployer: false,
    } as never);
    const priorInput = {
      ...declarationInput,
      employerName: 'Prior Inc.',
      employerTin: '123-456-789',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-05-31'),
      grossCompensationCents: 20000000n,
      taxableCompensationCents: 10000000n,
      taxWithheldCents: 100000n,
      documentReference: '2316-1',
    };
    await expect(
      new PriorEmploymentService().recordPreviousEmployerIncome(priorInput),
    ).rejects.toThrow(UnprocessableEntityException);
    jest
      .mocked(prisma.priorEmployerDeclaration.findFirst)
      .mockResolvedValue(declarationInput as never);
    await expect(
      new PriorEmploymentService().recordPreviousEmployerIncome({
        ...priorInput,
        periodStart: new Date('2025-12-31'),
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    await expect(
      new PriorEmploymentService().recordPreviousEmployerIncome({
        ...priorInput,
        taxableCompensationCents: 30000000n,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.previousEmployerIncome.create).not.toHaveBeenCalled();
    jest
      .mocked(prisma.previousEmployerIncome.create)
      .mockResolvedValue({ id: 'prior-1' } as never);
    await new PriorEmploymentService().recordPreviousEmployerIncome(priorInput);
    expect(prisma.previousEmployerIncome.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'employee-1',
          organizationId: 'org-1',
          recordedById: 'hr-1',
        }),
      }),
    );
  });
});

describe('PriorEmploymentService evidence supersession', () => {
  const priorKey = {
    employerTin: '123-456-789-000',
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-05-31'),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      id: 'employee-1',
    } as never);
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([]);
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findMany)
      .mockResolvedValue([]);
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findFirst)
      .mockResolvedValue(null);
    jest
      .mocked(prisma.priorEmployerDeclaration.findFirst)
      .mockResolvedValue(null);
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([]);
    jest
      .mocked(prisma.previousEmployerIncome.findFirst)
      .mockResolvedValue(null);
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.user.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.bir2316Issuance.findMany).mockResolvedValue([]);
    jest.mocked(prisma.bir2316Issuance.findFirst).mockResolvedValue(null);
  });

  function mockReviewer() {
    jest.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'reviewer-1',
    } as never);
  }

  function mockCreateEcho(model: { create: (...args: never[]) => unknown }) {
    (model.create as unknown as jest.Mock).mockImplementation((args) =>
      Promise.resolve({
        id: 'new-1',
        createdAt: new Date('2026-12-20'),
        ...((args as { data: object }).data ?? {}),
      }),
    );
  }

  it('supersedes a declaration with a higher version instead of mutating it', async () => {
    mockReviewer();
    jest.mocked(prisma.priorEmployerDeclaration.findFirst).mockResolvedValue({
      id: 'decl-1',
      version: 1,
    } as never);
    mockCreateEcho(prisma.priorEmployerDeclaration);

    const record =
      await new PriorEmploymentService().supersedePriorEmployerDeclaration({
        employeeId: 'employee-1',
        organizationId: 'org-1',
        taxYear: 2026,
        hasPriorEmployer: true,
        sourceReference: 'HR-DECL-v2',
        correctionReason:
          'Employee disclosed earlier employment omitted from the onboarding record',
        recordedById: 'hr-1',
        reviewerId: 'reviewer-1',
      });
    expect(record).toMatchObject({
      version: 2,
      supersedesId: 'decl-1',
      reviewedById: 'reviewer-1',
      hasPriorEmployer: true,
    });
  });

  it('enforces four-eyes review and a written reason on corrections', async () => {
    const base = {
      employeeId: 'employee-1',
      organizationId: 'org-1',
      taxYear: 2026,
      hasPriorEmployer: true,
      sourceReference: 'HR-DECL-v2',
      correctionReason:
        'Employee disclosed earlier employment omitted from the record',
      recordedById: 'hr-1',
      reviewerId: 'hr-1',
    };
    await expect(
      new PriorEmploymentService().supersedePriorEmployerDeclaration(base),
    ).rejects.toThrow('four-eyes');
    await expect(
      new PriorEmploymentService().supersedePriorEmployerDeclaration({
        ...base,
        reviewerId: 'reviewer-1',
        correctionReason: 'typo',
      }),
    ).rejects.toThrow('10–500 characters');
    await expect(
      new PriorEmploymentService().supersedePriorEmployerDeclaration({
        ...base,
        reviewerId: 'ghost-1',
        correctionReason: base.correctionReason,
      }),
    ).rejects.toThrow('active HR/admin');
    expect(prisma.priorEmployerDeclaration.create).not.toHaveBeenCalled();
  });

  it('requires an existing row before superseding it', async () => {
    mockReviewer();
    await expect(
      new PriorEmploymentService().supersedePriorEmployerDeclaration({
        employeeId: 'employee-1',
        organizationId: 'org-1',
        taxYear: 2026,
        hasPriorEmployer: true,
        sourceReference: 'HR-DECL-v2',
        correctionReason: 'Correcting a declaration that was never recorded',
        recordedById: 'hr-1',
        reviewerId: 'reviewer-1',
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      new MonthlyRemittanceService().supersedeMonthlyTaxRemittance({
        organizationId: 'org-1',
        taxYear: 2026,
        month: 12,
        remittedCents: 100n,
        documentReference: '1601C-12-v2',
        correctionReason: 'Correcting a remittance that was never recorded',
        recordedById: 'hr-1',
        reviewerId: 'reviewer-1',
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      new YearEndTaxService().supersedeYearEndSettlement({
        employeeId: 'employee-1',
        organizationId: 'org-1',
        taxYear: 2026,
        settlementDate: new Date('2026-12-15'),
        documentReference: 'DEC-PAYROLL-2026-v2',
        correctionReason: 'Correcting a settlement that was never posted',
        recordedById: 'hr-1',
        reviewerId: 'reviewer-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('directs duplicate initial records to the correction procedure', async () => {
    jest.mocked(prisma.priorEmployerDeclaration.findFirst).mockResolvedValue({
      id: 'decl-1',
    } as never);
    await expect(
      new PriorEmploymentService().recordPriorEmployerDeclaration({
        employeeId: 'employee-1',
        organizationId: 'org-1',
        taxYear: 2026,
        hasPriorEmployer: false,
        sourceReference: 'HR-DECL-2026',
        recordedById: 'hr-1',
      }),
    ).rejects.toThrow('correction procedure');
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findFirst)
      .mockResolvedValue({ id: 'rem-1' } as never);
    await expect(
      new MonthlyRemittanceService().recordMonthlyTaxRemittance({
        organizationId: 'org-1',
        taxYear: 2026,
        month: 12,
        remittedCents: 100n,
        documentReference: '1601C-12',
        recordedById: 'hr-1',
      }),
    ).rejects.toThrow('correction procedure');
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      id: 'settle-1',
    } as never);
    await expect(
      new YearEndTaxService().recordYearEndSettlement({
        employeeId: 'employee-1',
        organizationId: 'org-1',
        taxYear: 2026,
        settlementDate: new Date('2026-12-15'),
        documentReference: 'DEC-PAYROLL-2026',
        recordedById: 'hr-1',
      }),
    ).rejects.toThrow('correction procedure');
  });

  it('annualizes the corrected transcription, not the replaced figures', async () => {
    mockReviewer();
    jest.mocked(prisma.employee.findFirst).mockImplementation((args) =>
      (args as { include?: unknown })?.include
        ? ({
            ...employee,
            payslips: [
              {
                ...basePayslip,
                basicPayCents: 50000000n,
                grossPayCents: 50000000n,
                tardinessDeductionCents: 0n,
                overtimePayCents: 0n,
                taxableAllowancesCents: 0n,
                nonTaxableAllowancesCents: 0n,
                sssEmployeeCents: 0n,
                philhealthEmployeeCents: 0n,
                pagibigEmployeeCents: 0n,
                withholdingTaxCents: 0n,
              },
            ],
          } as never)
        : ({ id: 'employee-1', employmentStatus: 'ACTIVE' } as never),
    );
    jest.mocked(prisma.priorEmployerDeclaration.findFirst).mockResolvedValue({
      organizationId: 'org-1',
      hasPriorEmployer: true,
    } as never);
    jest.mocked(prisma.previousEmployerIncome.findFirst).mockResolvedValue({
      id: 'prior-1',
      version: 1,
    } as never);
    const corrected = {
      ...priorKey,
      grossCompensationCents: 20000000n,
      taxableCompensationCents: 5000000n,
      taxWithheldCents: 500000n,
    };
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([
      { id: 'prior-2', version: 2, ...corrected },
      {
        id: 'prior-1',
        version: 1,
        ...priorKey,
        grossCompensationCents: 20000000n,
        taxableCompensationCents: 10000000n,
        taxWithheldCents: 1000000n,
      },
    ] as never);
    mockCreateEcho(prisma.previousEmployerIncome);

    const record =
      await new PriorEmploymentService().supersedePreviousEmployerIncome({
        employeeId: 'employee-1',
        organizationId: 'org-1',
        taxYear: 2026,
        employerName: 'Prior Inc.',
        ...corrected,
        documentReference: '2316-1-v2',
        correctionReason:
          'Prior employer reissued the certificate with lower taxable pay',
        recordedById: 'hr-1',
        reviewerId: 'reviewer-1',
      });
    expect(record).toMatchObject({
      version: 2,
      supersedesId: 'prior-1',
      taxableCompensationCents: 5000000n,
    });

    const preview = await new YearEndTaxService().generateBir2316(
      'employee-1',
      'org-1',
      2026,
    );
    // Present 500,000 plus corrected prior 50,000 => 550,000 taxable =>
    // 22,500 + 20% x 150,000 = 52,500 due; 5,000 withheld => 47,500 due.
    expect(preview.certificate.partIVA.totalTaxableCompensationCents).toBe(
      55000000n,
    );
    expect(preview.certificate.partIVA.taxDueAnnualCents).toBe(5250000n);
    expect(preview.certificate.partIVA.taxAdjustmentCents).toBe(4750000n);
    expect(preview.priorEmployerTotals).toMatchObject({
      employerCount: 1,
      taxableCents: 5000000n,
    });
  });
});
