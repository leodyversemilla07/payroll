import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { prisma } from '@workspace/db';
import { ComplianceService } from './compliance.service';

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
const details = {
  natureOfBusiness: 'Food production',
  contactPerson: 'Ana Cruz',
  contactNumber: '09171234567',
  contactTitle: 'Payroll Lead',
};

function mockEmployeePayslips(payslips: object[]) {
  jest.mocked(prisma.employee.findFirst).mockResolvedValue({
    ...employee,
    payslips,
  } as never);
}

describe('ComplianceService exports', () => {
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
    const service = new ComplianceService();
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
      service.recordPriorEmployerDeclaration(declarationInput),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.priorEmployerDeclaration.create).not.toHaveBeenCalled();
    jest
      .mocked(prisma.employee.findFirst)
      .mockResolvedValue({ id: 'employee-1' } as never);
    jest
      .mocked(prisma.priorEmployerDeclaration.create)
      .mockRejectedValue({ code: 'P2002' });
    await expect(
      service.recordPriorEmployerDeclaration(declarationInput),
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
      service.recordPreviousEmployerIncome(priorInput),
    ).rejects.toThrow(UnprocessableEntityException);
    jest
      .mocked(prisma.priorEmployerDeclaration.findFirst)
      .mockResolvedValue(declarationInput as never);
    await expect(
      service.recordPreviousEmployerIncome({
        ...priorInput,
        periodStart: new Date('2025-12-31'),
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    await expect(
      service.recordPreviousEmployerIncome({
        ...priorInput,
        taxableCompensationCents: 30000000n,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.previousEmployerIncome.create).not.toHaveBeenCalled();
    jest
      .mocked(prisma.previousEmployerIncome.create)
      .mockResolvedValue({ id: 'prior-1' } as never);
    await service.recordPreviousEmployerIncome(priorInput);
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

  it('reads only a tenant employee’s self-reported tax evidence', async () => {
    const service = new ComplianceService();
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);
    await expect(
      service.getTaxEvidence('employee-1', 'wrong-org', 2026),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.priorEmployerDeclaration.findMany).not.toHaveBeenCalled();
    jest
      .mocked(prisma.employee.findFirst)
      .mockResolvedValue({ id: 'employee-1' } as never);
    const evidence = await service.getTaxEvidence('employee-1', 'org-1', 2026);
    expect(evidence.selfReportedUnverified).toBe(true);
    expect(evidence.declaration).toBeNull();
    expect(evidence.supersededHistory).toEqual({
      declarations: [],
      previousEmployers: [],
      monthlyRemittances: [],
      settlements: [],
    });
    expect(prisma.priorEmployerDeclaration.findMany).toHaveBeenCalledWith({
      where: {
        employeeId: 'employee-1',
        organizationId: 'org-1',
        taxYear: 2026,
      },
      orderBy: { version: 'desc' },
    });
    expect(prisma.previousEmployerIncome.findMany).toHaveBeenCalledWith({
      where: {
        employeeId: 'employee-1',
        organizationId: 'org-1',
        taxYear: 2026,
      },
      orderBy: [{ version: 'desc' }, { periodStart: 'asc' }],
    });
  });

  it('records a monthly remittance reference without claiming it was independently verified', async () => {
    const service = new ComplianceService();
    await expect(
      service.recordMonthlyTaxRemittance({
        organizationId: 'org-1',
        taxYear: 2026,
        month: 13,
        remittedCents: 0n,
        documentReference: '1601C-13',
        recordedById: 'hr-1',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.monthlyTaxRemittanceEvidence.create).not.toHaveBeenCalled();
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.create)
      .mockResolvedValue({ id: 'evidence-1' } as never);
    await service.recordMonthlyTaxRemittance({
      organizationId: 'org-1',
      taxYear: 2026,
      month: 1,
      remittedCents: 100n,
      documentReference: '1601C-01',
      recordedById: 'hr-1',
    });
    expect(prisma.monthlyTaxRemittanceEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: 'org-1',
          taxYear: 2026,
          month: 1,
          remittedCents: 100n,
          documentReference: '1601C-01',
          recordedById: 'hr-1',
        },
      }),
    );
  });

  it('lists only tenant/year disbursed employees and keeps blocked rows visible, not counted as zero', async () => {
    const ids = ['balanced', 'refund', 'deficiency', 'blocked'];
    jest.mocked(prisma.employee.findMany).mockResolvedValue(
      ids.map((id) => ({
        id,
        employeeNumber: id,
        firstName: id,
        lastName: 'Tester',
      })) as never,
    );
    jest.mocked(prisma.priorEmployerDeclaration.findMany).mockResolvedValue(
      ids.map((employeeId) => ({
        employeeId,
        hasPriorEmployer: false,
      })) as never,
    );
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      {
        withholdingTaxCents: 15000n,
        payrollRun: { paymentDate: new Date('2026-09-30') },
      },
    ] as never);
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findMany)
      .mockResolvedValue([
        {
          month: 9,
          remittedCents: 15000n,
        },
      ] as never);
    const balanced = { ...basePayslip, withholdingTaxCents: 0n };
    const refund = { ...basePayslip };
    const deficiency = {
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
    };
    for (const [id, payslips] of [
      ['balanced', [balanced]],
      ['refund', [refund]],
      ['deficiency', [deficiency]],
      ['blocked', [{ ...basePayslip, deMinimisExcessCents: 100n }]],
    ] as const) {
      jest
        .mocked(prisma.employee.findFirst)
        .mockResolvedValueOnce({ ...employee, id, payslips } as never);
    }
    const report = await new ComplianceService().listYearEndReconciliations(
      'org-1',
      2026,
    );
    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        payslips: {
          some: {
            payrollRun: {
              organizationId: 'org-1',
              status: 'DISBURSED',
              paymentDate: {
                gte: new Date('2026-01-01'),
                lt: new Date('2027-01-01'),
              },
            },
          },
        },
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
      },
      orderBy: { employeeNumber: 'asc' },
    });
    expect(prisma.employee.findFirst).toHaveBeenCalledTimes(4);
    for (const call of jest.mocked(prisma.employee.findFirst).mock.calls) {
      expect(call[0]?.where).toEqual({
        id: expect.any(String),
        organizationId: 'org-1',
      });
      expect(call[0]?.include?.payslips).toEqual({
        where: {
          payrollRun: {
            organizationId: 'org-1',
            status: 'DISBURSED',
            paymentDate: {
              gte: new Date('2026-01-01'),
              lt: new Date('2027-01-01'),
            },
          },
        },
      });
    }
    expect(report.reviewOnly).toBe(true);
    expect(report.employeeCount).toBe(4);
    expect(report.missingRemittanceMonths).toEqual([]);
    expect(report.mismatchedRemittanceMonths).toEqual([]);
    expect(report.remittanceEvidenceIsUnverified).toBe(true);
    expect(report.balancedCount).toBe(1);
    expect(report.refundReviewCount).toBe(1);
    expect(report.deficiencyReviewCount).toBe(1);
    expect(report.blockedCount).toBe(1);
    expect(report.classifiedTaxDueCents).toBe(4250000n);
    expect(report.classifiedTaxWithheldCents).toBe(15000n);
    expect(report.rows[3]).toMatchObject({
      status: 'BLOCKED_REVIEW',
      taxDueCents: null,
      unsettledDifferenceCents: null,
    });
  });

  it('rejects pre-2023 tax years instead of applying the newer annual tax table', async () => {
    const service = new ComplianceService();
    await expect(
      service.listYearEndReconciliations('org-1', 2022),
    ).rejects.toThrow(UnprocessableEntityException);
    await expect(
      service.generateBir2316('employee-1', 'org-1', 2022),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
  });

  it('returns an empty, non-certified queue for a year without disbursed payroll', async () => {
    jest.mocked(prisma.employee.findMany).mockResolvedValue([]);
    const report = await new ComplianceService().listYearEndReconciliations(
      'org-1',
      2026,
    );
    expect(report.employeeCount).toBe(0);
    expect(report.rows).toEqual([]);
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
  });

  it('blocks rows when prior-employer declaration or monthly remittance evidence is missing', async () => {
    jest.mocked(prisma.employee.findMany).mockResolvedValue([
      {
        id: 'employee-1',
        employeeNumber: 'EMP-1',
        firstName: 'Alex',
        lastName: 'Santos',
      },
    ] as never);
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      {
        withholdingTaxCents: 15000n,
        payrollRun: { paymentDate: new Date('2026-09-30') },
      },
    ] as never);
    const service = new ComplianceService();
    const missingDeclaration = await service.listYearEndReconciliations(
      'org-1',
      2026,
    );
    expect(missingDeclaration.rows[0]).toMatchObject({
      status: 'BLOCKED_REVIEW',
      taxDueCents: null,
      reason: expect.stringContaining('prior-employer declaration'),
    });
    expect(missingDeclaration.missingRemittanceMonths).toEqual([9]);
    jest.mocked(prisma.priorEmployerDeclaration.findMany).mockResolvedValue([
      {
        employeeId: 'employee-1',
        hasPriorEmployer: false,
      },
    ] as never);
    const missingRemittance = await service.listYearEndReconciliations(
      'org-1',
      2026,
    );
    expect(missingRemittance.rows[0]).toMatchObject({
      status: 'BLOCKED_REVIEW',
      reason: expect.stringContaining('remittance evidence'),
    });
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findMany)
      .mockResolvedValue([
        {
          month: 9,
          remittedCents: 14999n,
        },
      ] as never);
    const mismatched = await service.listYearEndReconciliations('org-1', 2026);
    expect(mismatched.mismatchedRemittanceMonths).toEqual([9]);
    expect(mismatched.rows[0]?.status).toBe('BLOCKED_REVIEW');
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
  });

  it('annualizes transcribed prior-employer income instead of blocking the row', async () => {
    mockEmployeePayslips([
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
    ]);
    jest.mocked(prisma.priorEmployerDeclaration.findFirst).mockResolvedValue({
      organizationId: 'org-1',
      hasPriorEmployer: true,
    } as never);
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([
      {
        employerTin: '123-456-789-000',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-05-31'),
        version: 1,
        grossCompensationCents: 20000000n,
        taxableCompensationCents: 10000000n,
        taxWithheldCents: 1000000n,
      },
    ] as never);
    const result = await new ComplianceService().generateBir2316(
      'employee-1',
      'org-1',
      2026,
    );
    // Present 500,000 taxable plus prior 100,000 => 600,000 taxable =>
    // 22,500 + 20% x 200,000 = 62,500 due; 10,000 withheld => 52,500 due.
    expect(result.certificate.partIVA.grossCompensationIncomeCents).toBe(
      70000000n,
    );
    expect(result.certificate.partIVA.totalTaxableCompensationCents).toBe(
      60000000n,
    );
    expect(result.certificate.partIVA.taxDueAnnualCents).toBe(6250000n);
    expect(result.certificate.partIVA.totalTaxWithheldCents).toBe(1000000n);
    expect(result.certificate.partIVA.taxAdjustmentCents).toBe(5250000n);
    expect(result.reconciliationStatus).toBe('DEFICIENCY_REVIEW');
    expect(result.priorEmployerTotals).toMatchObject({
      employerCount: 1,
      grossCents: 20000000n,
      taxableCents: 10000000n,
      withheldCents: 1000000n,
    });
    expect(result.formattedDocument).toContain('PRIOR EMPLOYER INCOME');
  });

  it('requires manual review for a minimum-wage earner with prior-employer taxable income', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      ...employee,
      compensation: { ...employee.compensation, isTaxExempt: true },
      payslips: [
        {
          ...basePayslip,
          taxableAllowancesCents: 0n,
          grossPayCents: 1520000n,
          withholdingTaxCents: 0n,
        },
      ],
    } as never);
    jest.mocked(prisma.priorEmployerDeclaration.findFirst).mockResolvedValue({
      organizationId: 'org-1',
      hasPriorEmployer: true,
    } as never);
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([
      {
        employerTin: '123-456-789-000',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-05-31'),
        version: 1,
        grossCompensationCents: 20000000n,
        taxableCompensationCents: 10000000n,
        taxWithheldCents: 1000000n,
      },
    ] as never);
    await expect(
      new ComplianceService().generateBir2316('employee-1', 'org-1', 2026),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('refuses to annualize prior documents without a matching prior-employment declaration', async () => {
    mockEmployeePayslips([{ ...basePayslip, withholdingTaxCents: 0n }]);
    jest
      .mocked(prisma.priorEmployerDeclaration.findFirst)
      .mockResolvedValue(null);
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([
      {
        employerTin: '123-456-789-000',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-05-31'),
        version: 1,
        grossCompensationCents: 20000000n,
        taxableCompensationCents: 10000000n,
        taxWithheldCents: 1000000n,
      },
    ] as never);
    await expect(
      new ComplianceService().generateBir2316('employee-1', 'org-1', 2026),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('does not convert a database outage into a blocked/zero-tax employee', async () => {
    jest.mocked(prisma.employee.findMany).mockResolvedValue([
      {
        id: 'employee-1',
        employeeNumber: 'EMP-1',
        firstName: 'Alex',
        lastName: 'Santos',
      },
    ] as never);
    jest.mocked(prisma.priorEmployerDeclaration.findMany).mockResolvedValue([
      {
        employeeId: 'employee-1',
        hasPriorEmployer: false,
      },
    ] as never);
    jest
      .mocked(prisma.employee.findFirst)
      .mockRejectedValue(new Error('Database unavailable'));
    await expect(
      new ComplianceService().listYearEndReconciliations('org-1', 2026),
    ).rejects.toThrow('Database unavailable');
  });

  it('refuses to invent a BIR 2316 when no disbursed payslips exist', async () => {
    mockEmployeePayslips([]);
    await expect(
      new ComplianceService().generateBir2316('employee-1', 'org-1', 2026),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'employee-1', organizationId: 'org-1' },
        include: expect.objectContaining({
          payslips: {
            where: {
              payrollRun: {
                organizationId: 'org-1',
                status: 'DISBURSED',
                paymentDate: {
                  gte: new Date('2026-01-01'),
                  lt: new Date('2027-01-01'),
                },
              },
            },
          },
        }),
      }),
    );
  });

  it('uses actual salary after attendance deductions and recorded bonus payouts', async () => {
    mockEmployeePayslips([
      basePayslip,
      {
        ...basePayslip,
        basicPayCents: 0n,
        grossPayCents: 120000n,
        tardinessDeductionCents: 0n,
        overtimePayCents: 0n,
        taxableAllowancesCents: 0n,
        nonTaxableAllowancesCents: 120000n,
        sssEmployeeCents: 0n,
        philhealthEmployeeCents: 0n,
        pagibigEmployeeCents: 0n,
        withholdingTaxCents: 0n,
        bonusPaidCents: 120000n,
      },
    ]);
    const { certificate } = await new ComplianceService().generateBir2316(
      'employee-1',
      'org-1',
      2026,
    );
    expect(certificate.partIVC.basicSalaryRegularCents).toBe(1250000n);
    expect(certificate.partIVB.thirteenthMonthExemptCents).toBe(120000n);
    expect(certificate.partIVB.deMinimisBenefitsCents).toBe(100000n);
    expect(certificate.partIVC.otherTaxableAllowancesCents).toBe(25000n);
    expect(certificate.partIVA.totalTaxWithheldCents).toBe(15000n);
  });

  it('reconciles a year of disbursed regular pay plus taxable 13th-month excess without claiming settlement', async () => {
    const regular = {
      ...basePayslip,
      basicPayCents: 5000000n,
      grossPayCents: 5000000n,
      tardinessDeductionCents: 0n,
      overtimePayCents: 0n,
      taxableAllowancesCents: 0n,
      nonTaxableAllowancesCents: 0n,
      sssEmployeeCents: 0n,
      philhealthEmployeeCents: 0n,
      pagibigEmployeeCents: 0n,
      withholdingTaxCents: 500000n,
    };
    mockEmployeePayslips([
      ...Array.from({ length: 12 }, () => ({ ...regular })),
      {
        ...regular,
        basicPayCents: 0n,
        grossPayCents: 12000000n,
        taxableAllowancesCents: 3000000n,
        nonTaxableAllowancesCents: 9000000n,
        bonusPaidCents: 12000000n,
        withholdingTaxCents: 100000n,
      },
    ]);
    const result = await new ComplianceService().generateBir2316(
      'employee-1',
      'org-1',
      2026,
    );
    // RR 11-2018 annual 2023+ table: 630,000 taxable =>
    // 22,500 + 20% x (630,000 - 400,000) = 68,500.
    expect(result.certificate.partIVA.grossCompensationIncomeCents).toBe(
      72000000n,
    );
    expect(result.certificate.partIVB.thirteenthMonthExemptCents).toBe(
      9000000n,
    );
    expect(result.certificate.partIVC.thirteenthMonthExcessTaxableCents).toBe(
      3000000n,
    );
    expect(result.certificate.partIVA.totalTaxableCompensationCents).toBe(
      63000000n,
    );
    expect(result.certificate.partIVA.taxDueAnnualCents).toBe(6850000n);
    expect(result.certificate.partIVA.totalTaxWithheldCents).toBe(6100000n);
    expect(result.certificate.partIVA.taxAdjustmentCents).toBe(750000n);
    expect(result.reconciliationStatus).toBe('DEFICIENCY_REVIEW');
    expect(result.formattedDocument).toContain('NOT BIR FORM 2316');
    expect(result.formattedDocument).not.toContain('Line 30:');
    expect(result.formattedDocument).not.toContain(
      'Employer Authorized Representative:',
    );
  });

  it.each([
    [6250000n, 'BALANCED', 0n],
    [6600000n, 'REFUND_REVIEW', -350000n],
  ] as const)(
    'flags recorded annual withholding of %s for review',
    async (withheld, status, difference) => {
      const regular = {
        ...basePayslip,
        basicPayCents: 5000000n,
        grossPayCents: 5000000n,
        tardinessDeductionCents: 0n,
        overtimePayCents: 0n,
        taxableAllowancesCents: 0n,
        nonTaxableAllowancesCents: 0n,
        sssEmployeeCents: 0n,
        philhealthEmployeeCents: 0n,
        pagibigEmployeeCents: 0n,
        withholdingTaxCents: 0n,
      };
      mockEmployeePayslips([
        ...Array.from({ length: 11 }, () => ({ ...regular })),
        { ...regular, withholdingTaxCents: withheld },
      ]);
      const result = await new ComplianceService().generateBir2316(
        'employee-1',
        'org-1',
        2026,
      );
      // 600,000 taxable => 22,500 + 20% x 200,000 = 62,500.
      expect(result.certificate.partIVA.taxDueAnnualCents).toBe(6250000n);
      expect(result.reconciliationStatus).toBe(status);
      expect(result.certificate.partIVA.taxAdjustmentCents).toBe(difference);
    },
  );

  it('flags partial-year overwithholding rather than claiming a refund has been paid', async () => {
    mockEmployeePayslips([
      {
        ...basePayslip,
        basicPayCents: 20000000n,
        grossPayCents: 20000000n,
        tardinessDeductionCents: 0n,
        overtimePayCents: 0n,
        taxableAllowancesCents: 0n,
        nonTaxableAllowancesCents: 0n,
        sssEmployeeCents: 0n,
        philhealthEmployeeCents: 0n,
        pagibigEmployeeCents: 0n,
        withholdingTaxCents: 12000n,
      },
    ]);
    const result = await new ComplianceService().generateBir2316(
      'employee-1',
      'org-1',
      2026,
    );
    expect(result.certificate.partIVA.taxDueAnnualCents).toBe(0n);
    expect(result.certificate.partIVA.taxAdjustmentCents).toBe(-12000n);
    expect(result.reconciliationStatus).toBe('REFUND_REVIEW');
    expect(result.formattedDocument).toContain('NOT EVIDENCE OF PAYMENT');
  });

  it('does not double-count the WISP subset of SSS in the 2316 and 1601-C projections', async () => {
    mockEmployeePayslips([{ ...basePayslip, sssWispEmployeeCents: 10000n }]);
    const { certificate } = await new ComplianceService().generateBir2316(
      'employee-1',
      'org-1',
      2026,
    );
    expect(certificate.partIVB.statutoryContributionsCents).toBe(150000n);
    expect(certificate.partIVA.totalTaxableCompensationCents).toBe(1295000n);
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      {
        ...basePayslip,
        employeeId: 'employee-1',
        sssWispEmployeeCents: 10000n,
        employee,
      },
    ] as never);
    const summary = await new ComplianceService().getBir1601CSummary(
      9,
      2026,
      'org-1',
    );
    expect(summary.nonTaxableCompensationPesos).toBe(2500);
    expect(summary.taxableCompensationPesos).toBe(12950);
  });

  it('refuses to misclassify de minimis excess without a persisted split', async () => {
    mockEmployeePayslips([{ ...basePayslip, deMinimisExcessCents: 10000n }]);
    await expect(
      new ComplianceService().generateBir2316('employee-1', 'org-1', 2026),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('refuses an irreconcilable gross total rather than certifying it', async () => {
    mockEmployeePayslips([{ ...basePayslip, grossPayCents: 999999n }]);
    await expect(
      new ComplianceService().generateBir2316('employee-1', 'org-1', 2026),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('requires manual review for an MWE with taxable benefits', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      ...employee,
      compensation: { ...employee.compensation, isTaxExempt: true },
      payslips: [basePayslip],
    } as never);
    await expect(
      new ComplianceService().generateBir2316('employee-1', 'org-1', 2026),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('reports only disbursed 13th-month payouts and actual basic earned', async () => {
    jest
      .mocked(prisma.organization.findUnique)
      .mockResolvedValue(organization as never);
    jest.mocked(prisma.employee.count).mockResolvedValue(0);
    jest.mocked(prisma.employee.findMany).mockResolvedValue([
      {
        ...employee,
        payslips: [
          basePayslip,
          {
            ...basePayslip,
            basicPayCents: 0n,
            grossPayCents: 120000n,
            bonusPaidCents: 120000n,
            taxableAllowancesCents: 20000n,
            nonTaxableAllowancesCents: 100000n,
          },
        ],
      },
    ] as never);

    const report = await new ComplianceService().generateDole13thMonthReport(
      'org-1',
      details,
      2026,
    );
    expect(report.batchResult.totalThirteenthMonthPayCents).toBe(120000n);
    expect(report.batchResult.totalTaxExemptCents).toBe(100000n);
    expect(report.batchResult.totalTaxableExcessCents).toBe(20000n);
    expect(report.batchResult.employeeResults[0]?.totalBasicEarnedCents).toBe(
      1400000n,
    );
    expect(report.reportText).toContain('Food production');
    expect(report.reportText).toContain('Payroll Lead');
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
        include: expect.objectContaining({
          payslips: {
            where: {
              payrollRun: {
                organizationId: 'org-1',
                cutoffSequence: expect.any(Object),
                status: 'DISBURSED',
                paymentDate: {
                  gte: new Date('2026-01-01'),
                  lt: new Date('2027-01-01'),
                },
              },
            },
          },
        }),
      }),
    );
  });

  it('refuses a DOLE report with missing payouts', async () => {
    jest
      .mocked(prisma.organization.findUnique)
      .mockResolvedValue(organization as never);
    jest.mocked(prisma.employee.count).mockResolvedValue(0);
    jest
      .mocked(prisma.employee.findMany)
      .mockResolvedValue([{ ...employee, payslips: [] }] as never);
    await expect(
      new ComplianceService().generateDole13thMonthReport(
        'org-1',
        details,
        2026,
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('uses disbursement date for 1601-C and counts employees rather than payslips', async () => {
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      {
        ...basePayslip,
        employeeId: 'employee-1',
        grossPayCents: 1545000n,
        employee,
      },
      {
        ...basePayslip,
        employeeId: 'employee-1',
        grossPayCents: 1545000n,
        employee,
      },
    ] as never);
    const summary = await new ComplianceService().getBir1601CSummary(
      12,
      2026,
      'org-1',
    );
    expect(summary.totalEmployees).toBe(1);
    expect(prisma.payslip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          payrollRun: {
            organizationId: 'org-1',
            status: 'DISBURSED',
            paymentDate: {
              gte: new Date('2026-12-01'),
              lt: new Date('2027-01-01'),
            },
          },
        },
      }),
    );
  });

  it('refuses a 1601-C summary when no disbursed payslips exist', async () => {
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([]);
    await expect(
      new ComplianceService().getBir1601CSummary(12, 2026, 'org-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('blocks bank files before the payroll run is approved', async () => {
    jest
      .mocked(prisma.payrollRun.findFirst)
      .mockResolvedValue({ status: 'AUDITED' } as never);
    await expect(
      new ComplianceService().generateBankTransmittalCsv(
        'run-1',
        'BDO',
        'org-1',
      ),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.payslip.findMany).not.toHaveBeenCalled();
  });

  it('exports only the chosen bank and refuses placeholder account numbers', async () => {
    jest
      .mocked(prisma.payrollRun.findFirst)
      .mockResolvedValue({ status: 'APPROVED' } as never);
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      {
        id: 'payslip-1',
        netPayCents: 100000n,
        employee: {
          employeeNumber: 'EMP-1',
          firstName: 'Alex',
          lastName: 'Santos',
          bankName: 'BDO Unibank',
          bankAccountNumber: '0001234567',
          bankAccountName: 'Alex Santos',
        },
      },
      {
        id: 'payslip-2',
        netPayCents: 200000n,
        employee: {
          employeeNumber: 'EMP-2',
          firstName: 'Jo',
          lastName: 'Reyes',
          bankName: 'BPI',
          bankAccountNumber: '1234567890',
          bankAccountName: 'Jo Reyes',
        },
      },
    ] as never);
    const service = new ComplianceService();
    const csv = await service.generateBankTransmittalCsv(
      'run-1',
      'BDO',
      'org-1',
    );
    expect(csv).toContain('Alex Santos');
    expect(csv).not.toContain('Jo Reyes');

    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      {
        id: 'payslip-1',
        netPayCents: 100000n,
        employee: {
          bankName: 'BDO',
          bankAccountNumber: '0000000000',
        },
      },
    ] as never);
    await expect(
      service.generateBankTransmittalCsv('run-1', 'BDO', 'org-1'),
    ).rejects.toThrow(UnprocessableEntityException);

    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      {
        id: 'payslip-1',
        netPayCents: 100000n,
        employee: {
          employeeNumber: 'EMP-1',
          firstName: 'Alex',
          lastName: 'Santos',
          bankName: 'BDO',
          bankAccountNumber: '0001234567',
          bankAccountName: '=HYPERLINK("bad")',
        },
      },
    ] as never);
    await expect(
      service.generateBankTransmittalCsv('run-1', 'BDO', 'org-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('does not expose another tenant’s payroll run', async () => {
    jest.mocked(prisma.payrollRun.findFirst).mockResolvedValue(null);
    await expect(
      new ComplianceService().generateBankTransmittalCsv(
        'run-1',
        'BDO',
        'org-1',
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ComplianceService year-end settlement', () => {
  const deficiencyPayslip = {
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
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([]);
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findMany)
      .mockResolvedValue([]);
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
    jest.mocked(prisma.user.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.bir2316Issuance.findMany).mockResolvedValue([]);
    jest.mocked(prisma.bir2316Issuance.findFirst).mockResolvedValue(null);
  });

  function mockLedgerWith(payslips: object[], employmentStatus = 'ACTIVE') {
    jest
      .mocked(prisma.employee.findFirst)
      .mockImplementation((args) =>
        (args as { include?: unknown })?.include
          ? ({ ...employee, employmentStatus, payslips } as never)
          : ({ id: 'employee-1', employmentStatus } as never),
      );
  }

  function mockDecemberNet(netPayCents: bigint) {
    jest
      .mocked(prisma.payslip.findMany)
      .mockResolvedValue([{ netPayCents }] as never);
  }

  function mockSettlementCreate() {
    jest.mocked(prisma.yearEndTaxSettlement.create).mockImplementation(
      (args) =>
        Promise.resolve({
          id: 'settlement-1',
          createdAt: new Date('2026-12-20'),
          ...(args as { data: object }).data,
        }) as never,
    );
  }

  const settlementInput = {
    employeeId: 'employee-1',
    organizationId: 'org-1',
    taxYear: 2026,
    settlementDate: new Date('2026-12-15'),
    documentReference: 'DEC-PAYROLL-2026',
    recordedById: 'hr-1',
  };

  it('posts a deficiency withheld from December net pay and reports the row settled', async () => {
    mockLedgerWith([deficiencyPayslip]);
    mockDecemberNet(50000000n);
    mockSettlementCreate();
    const service = new ComplianceService();

    const record = await service.recordYearEndSettlement(settlementInput);
    // 500,000 taxable => 22,500 + 20% x 100,000 = 42,500.
    expect(record).toMatchObject({
      settlementType: 'DEFICIENCY_WITHHELD',
      computedDifferenceCents: 4250000n,
      settledCents: 4250000n,
    });
    expect(prisma.yearEndTaxSettlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'employee-1',
          organizationId: 'org-1',
          taxYear: 2026,
        }),
      }),
    );

    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      ...record,
      organizationId: 'org-1',
    } as never);
    const preview = await service.generateBir2316('employee-1', 'org-1', 2026);
    expect(preview.reconciliationStatus).toBe('SETTLED');
    expect(preview.isSettled).toBe(true);
    expect(preview.remainingDifferenceCents).toBe(0n);
  });

  it('posts a refund payment and zeroes the remaining balance', async () => {
    // Base payslip overwithholds 15,000 against its annual due, so the
    // recomputed preview is a refund to review until it is paid.
    mockLedgerWith([{ ...basePayslip }]);
    mockDecemberNet(1500000n);
    mockSettlementCreate();
    const service = new ComplianceService();
    const record = await service.recordYearEndSettlement(settlementInput);
    expect(record).toMatchObject({ settlementType: 'REFUND_PAID' });
    expect(record.settledCents).toBe(
      -(record.computedDifferenceCents as bigint),
    );

    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      ...record,
      organizationId: 'org-1',
    } as never);
    const preview = await service.generateBir2316('employee-1', 'org-1', 2026);
    expect(preview.isSettled).toBe(true);
    expect(preview.remainingDifferenceCents).toBe(0n);
  });

  it('rejects a deficiency larger than the settlement month’s disbursed net pay', async () => {
    mockLedgerWith([deficiencyPayslip]);
    mockDecemberNet(1000n);
    await expect(
      new ComplianceService().recordYearEndSettlement(settlementInput),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.yearEndTaxSettlement.create).not.toHaveBeenCalled();
  });

  it('rejects active-employee settlement outside December', async () => {
    mockLedgerWith([deficiencyPayslip]);
    mockDecemberNet(50000000n);
    await expect(
      new ComplianceService().recordYearEndSettlement({
        ...settlementInput,
        settlementDate: new Date('2026-11-15'),
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.yearEndTaxSettlement.create).not.toHaveBeenCalled();
  });

  it('allows separated employees to settle with termination-month pay', async () => {
    mockLedgerWith([deficiencyPayslip], 'RESIGNED');
    mockDecemberNet(50000000n);
    mockSettlementCreate();
    const record = await new ComplianceService().recordYearEndSettlement({
      ...settlementInput,
      settlementDate: new Date('2026-11-15'),
    });
    expect(record).toMatchObject({ settlementType: 'DEFICIENCY_WITHHELD' });
  });

  it('rejects settlement without a disbursed payment in the settlement month', async () => {
    mockLedgerWith([deficiencyPayslip]);
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([]);
    await expect(
      new ComplianceService().recordYearEndSettlement(settlementInput),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.yearEndTaxSettlement.create).not.toHaveBeenCalled();
  });

  it('rejects settlement when annual withholding already matches tax due', async () => {
    // Balanced fixture: recomputed adjustment is zero, so there is nothing
    // to withhold or refund.
    mockLedgerWith([{ ...basePayslip, withholdingTaxCents: 0n }]);
    const preview = await new ComplianceService().generateBir2316(
      'employee-1',
      'org-1',
      2026,
    );
    expect(preview.reconciliationStatus).toBe('BALANCED');
    await expect(
      new ComplianceService().recordYearEndSettlement(settlementInput),
    ).rejects.toThrow('nothing to settle');
    expect(prisma.yearEndTaxSettlement.create).not.toHaveBeenCalled();
  });

  it('keeps a duplicate settlement write-once per employee-year', async () => {
    mockLedgerWith([deficiencyPayslip]);
    mockDecemberNet(50000000n);
    jest
      .mocked(prisma.yearEndTaxSettlement.create)
      .mockRejectedValue({ code: 'P2002' });
    await expect(
      new ComplianceService().recordYearEndSettlement(settlementInput),
    ).rejects.toThrow('already exists');
  });

  it('reports a remaining balance when payroll changes after settlement', async () => {
    // Settled 42,500, then a later disbursement raises the recomputed
    // deficiency to 50,000: the queue must show the 7,500 still due.
    mockLedgerWith([
      { ...deficiencyPayslip, withholdingTaxCents: 0n },
      {
        ...basePayslip,
        basicPayCents: 5000000n,
        grossPayCents: 5000000n,
        tardinessDeductionCents: 0n,
        overtimePayCents: 0n,
        taxableAllowancesCents: 0n,
        nonTaxableAllowancesCents: 0n,
        sssEmployeeCents: 0n,
        philhealthEmployeeCents: 0n,
        pagibigEmployeeCents: 0n,
        withholdingTaxCents: 0n,
      },
    ]);
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      id: 'settlement-1',
      settlementType: 'DEFICIENCY_WITHHELD',
      settledCents: 4250000n,
    } as never);
    const preview = await new ComplianceService().generateBir2316(
      'employee-1',
      'org-1',
      2026,
    );
    expect(preview.isSettled).toBe(false);
    expect(preview.reconciliationStatus).toBe('DEFICIENCY_REVIEW');
    expect(preview.remainingDifferenceCents).toBe(
      preview.certificate.partIVA.taxAdjustmentCents - 4250000n,
    );
    expect(preview.remainingDifferenceCents).not.toBe(0n);
  });

  it('lists a settled employee with a zero remaining balance', async () => {
    jest.mocked(prisma.employee.findMany).mockResolvedValue([
      {
        id: 'employee-1',
        employeeNumber: 'EMP-1',
        firstName: 'Alex',
        lastName: 'Santos',
      },
    ] as never);
    jest
      .mocked(prisma.priorEmployerDeclaration.findMany)
      .mockResolvedValue([
        { employeeId: 'employee-1', hasPriorEmployer: false },
      ] as never);
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([]);
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      {
        withholdingTaxCents: 0n,
        payrollRun: { paymentDate: new Date('2026-12-31') },
      },
    ] as never);
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findMany)
      .mockResolvedValue([{ month: 12, remittedCents: 0n }] as never);
    mockLedgerWith([deficiencyPayslip]);
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      id: 'settlement-1',
      settlementType: 'DEFICIENCY_WITHHELD',
      settledCents: 4250000n,
    } as never);

    const report = await new ComplianceService().listYearEndReconciliations(
      'org-1',
      2026,
    );
    expect(report.settledCount).toBe(1);
    expect(report.deficiencyReviewCount).toBe(0);
    expect(report.rows[0]).toMatchObject({
      status: 'SETTLED',
      settledCents: 4250000n,
      remainingDifferenceCents: 0n,
    });
  });

  it('computes the queue row with prior-employer annualization instead of blocking', async () => {
    jest.mocked(prisma.employee.findMany).mockResolvedValue([
      {
        id: 'employee-1',
        employeeNumber: 'EMP-1',
        firstName: 'Alex',
        lastName: 'Santos',
      },
    ] as never);
    jest
      .mocked(prisma.priorEmployerDeclaration.findMany)
      .mockResolvedValue([
        { employeeId: 'employee-1', hasPriorEmployer: true },
      ] as never);
    jest.mocked(prisma.priorEmployerDeclaration.findFirst).mockResolvedValue({
      organizationId: 'org-1',
      hasPriorEmployer: true,
    } as never);
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([
      {
        employeeId: 'employee-1',
        employerTin: '123-456-789-000',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-05-31'),
        version: 1,
        grossCompensationCents: 20000000n,
        taxableCompensationCents: 10000000n,
        taxWithheldCents: 1000000n,
      },
    ] as never);
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      {
        withholdingTaxCents: 0n,
        payrollRun: { paymentDate: new Date('2026-12-31') },
      },
    ] as never);
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findMany)
      .mockResolvedValue([{ month: 12, remittedCents: 0n }] as never);
    mockLedgerWith([deficiencyPayslip]);

    const report = await new ComplianceService().listYearEndReconciliations(
      'org-1',
      2026,
    );
    expect(report.blockedCount).toBe(0);
    expect(report.deficiencyReviewCount).toBe(1);
    expect(report.rows[0]).toMatchObject({
      status: 'DEFICIENCY_REVIEW',
      grossCents: 70000000n,
      taxableCents: 60000000n,
      taxDueCents: 6250000n,
      taxWithheldCents: 1000000n,
      unsettledDifferenceCents: 5250000n,
    });
  });

  it('keeps a prior-employer case blocked when no tax document is transcribed', async () => {
    jest.mocked(prisma.employee.findMany).mockResolvedValue([
      {
        id: 'employee-1',
        employeeNumber: 'EMP-1',
        firstName: 'Alex',
        lastName: 'Santos',
      },
    ] as never);
    jest
      .mocked(prisma.priorEmployerDeclaration.findMany)
      .mockResolvedValue([
        { employeeId: 'employee-1', hasPriorEmployer: true },
      ] as never);
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([]);

    const report = await new ComplianceService().listYearEndReconciliations(
      'org-1',
      2026,
    );
    expect(report.rows[0]).toMatchObject({
      status: 'BLOCKED_REVIEW',
      reason: expect.stringContaining('Missing previous-employer tax document'),
    });
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
  });
});

describe('ComplianceService evidence supersession', () => {
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
      await new ComplianceService().supersedePriorEmployerDeclaration({
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
      new ComplianceService().supersedePriorEmployerDeclaration(base),
    ).rejects.toThrow('four-eyes');
    await expect(
      new ComplianceService().supersedePriorEmployerDeclaration({
        ...base,
        reviewerId: 'reviewer-1',
        correctionReason: 'typo',
      }),
    ).rejects.toThrow('10–500 characters');
    await expect(
      new ComplianceService().supersedePriorEmployerDeclaration({
        ...base,
        reviewerId: 'ghost-1',
        correctionReason: base.correctionReason,
      }),
    ).rejects.toThrow('active user');
    expect(prisma.priorEmployerDeclaration.create).not.toHaveBeenCalled();
  });

  it('requires an existing row before superseding it', async () => {
    mockReviewer();
    await expect(
      new ComplianceService().supersedePriorEmployerDeclaration({
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
      new ComplianceService().supersedeMonthlyTaxRemittance({
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
      new ComplianceService().supersedeYearEndSettlement({
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
      new ComplianceService().recordPriorEmployerDeclaration({
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
      new ComplianceService().recordMonthlyTaxRemittance({
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
      new ComplianceService().recordYearEndSettlement({
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
      await new ComplianceService().supersedePreviousEmployerIncome({
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

    const preview = await new ComplianceService().generateBir2316(
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

  it('re-settles the moved difference after a prior correction', async () => {
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
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([
      {
        id: 'prior-2',
        version: 2,
        ...priorKey,
        grossCompensationCents: 20000000n,
        taxableCompensationCents: 10000000n,
        taxWithheldCents: 1000000n,
      },
    ] as never);
    jest
      .mocked(prisma.payslip.findMany)
      .mockResolvedValue([{ netPayCents: 50000000n }] as never);
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      id: 'settle-1',
      version: 1,
      settlementType: 'DEFICIENCY_WITHHELD',
      settledCents: 4250000n,
    } as never);
    mockCreateEcho(prisma.yearEndTaxSettlement);

    const record = await new ComplianceService().supersedeYearEndSettlement({
      employeeId: 'employee-1',
      organizationId: 'org-1',
      taxYear: 2026,
      settlementDate: new Date('2026-12-20'),
      documentReference: 'DEC-PAYROLL-2026-v2',
      correctionReason:
        'Prior-employer income was transcribed after the first settlement; re-attesting the full amount withheld',
      recordedById: 'hr-1',
      reviewerId: 'reviewer-1',
    });
    // Recomputed combined difference is 52,500, so the new version settles
    // that total rather than the stale 42,500.
    expect(record).toMatchObject({
      version: 2,
      supersedesId: 'settle-1',
      settlementType: 'DEFICIENCY_WITHHELD',
      computedDifferenceCents: 5250000n,
      settledCents: 5250000n,
    });

    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      ...record,
      organizationId: 'org-1',
    } as never);
    const preview = await new ComplianceService().generateBir2316(
      'employee-1',
      'org-1',
      2026,
    );
    expect(preview.reconciliationStatus).toBe('SETTLED');
    expect(preview.remainingDifferenceCents).toBe(0n);
  });

  it('rejects a settlement correction when nothing moved', async () => {
    mockReviewer();
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      ...employee,
      employmentStatus: 'ACTIVE',
      payslips: [{ ...basePayslip }],
    } as never);
    jest
      .mocked(prisma.payslip.findMany)
      .mockResolvedValue([{ netPayCents: 1500000n }] as never);
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      id: 'settle-1',
      version: 1,
      settlementType: 'REFUND_PAID',
      settledCents: 15000n,
    } as never);
    // Base payslip overwithholds 15,000 against zero annual due, matching the
    // posted refund exactly.
    await expect(
      new ComplianceService().supersedeYearEndSettlement({
        employeeId: 'employee-1',
        organizationId: 'org-1',
        taxYear: 2026,
        settlementDate: new Date('2026-12-20'),
        documentReference: 'DEC-PAYROLL-2026-v2',
        correctionReason: 'Re-attesting an unchanged settlement for the record',
        recordedById: 'hr-1',
        reviewerId: 'reviewer-1',
      }),
    ).rejects.toThrow('nothing to correct');
    expect(prisma.yearEndTaxSettlement.create).not.toHaveBeenCalled();
  });

  it('reads current evidence with full supersession history', async () => {
    jest.mocked(prisma.priorEmployerDeclaration.findMany).mockResolvedValue([
      { id: 'decl-2', version: 2, hasPriorEmployer: true },
      { id: 'decl-1', version: 1, hasPriorEmployer: false },
    ] as never);
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([
      {
        id: 'prior-2',
        ...priorKey,
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-05-31'),
        version: 2,
      },
      {
        id: 'prior-1',
        ...priorKey,
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-05-31'),
        version: 1,
      },
      {
        id: 'prior-other-1',
        employerTin: '999-888-777-000',
        periodStart: new Date('2026-06-01'),
        periodEnd: new Date('2026-08-31'),
        version: 1,
      },
    ] as never);
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findMany)
      .mockResolvedValue([
        { id: 'rem-12-2', month: 12, remittedCents: 15000n, version: 2 },
        { id: 'rem-12-1', month: 12, remittedCents: 0n, version: 1 },
        { id: 'rem-11-1', month: 11, remittedCents: 5000n, version: 1 },
      ] as never);
    jest.mocked(prisma.yearEndTaxSettlement.findMany).mockResolvedValue([
      { id: 'settle-2', version: 2 },
      { id: 'settle-1', version: 1 },
    ] as never);

    const evidence = await new ComplianceService().getTaxEvidence(
      'employee-1',
      'org-1',
      2026,
    );
    expect(evidence.declaration).toMatchObject({ id: 'decl-2' });
    expect(evidence.previousEmployers.map((row) => row.id).sort()).toEqual([
      'prior-2',
      'prior-other-1',
    ]);
    expect(evidence.monthlyRemittances.map((row) => row.id)).toEqual([
      'rem-11-1',
      'rem-12-2',
    ]);
    expect(evidence.settlement).toMatchObject({ id: 'settle-2' });
    expect(evidence.supersededHistory).toMatchObject({
      declarations: [{ id: 'decl-1' }],
      monthlyRemittances: [{ id: 'rem-12-1' }],
      settlements: [{ id: 'settle-1' }],
    });
    expect(
      evidence.supersededHistory.previousEmployers.map((row) => row.id),
    ).toEqual(['prior-1']);
  });
});

describe('ComplianceService 2316 issuance', () => {
  const deficiencySlip = {
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
  };
  const balancedSlip = { ...basePayslip, withholdingTaxCents: 0n };
  const empIdentity = {
    id: 'employee-1',
    employeeNumber: 'EMP-1',
    firstName: 'Alex',
    lastName: 'Santos',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      id: 'employee-1',
    } as never);
    jest.mocked(prisma.employee.findMany).mockResolvedValue([]);
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([]);
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findMany)
      .mockResolvedValue([]);
    jest.mocked(prisma.priorEmployerDeclaration.findMany).mockResolvedValue(
      [],
    );
    jest.mocked(prisma.priorEmployerDeclaration.findFirst).mockResolvedValue(
      null,
    );
    jest.mocked(prisma.previousEmployerIncome.findMany).mockResolvedValue([]);
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.bir2316Issuance.findMany).mockResolvedValue([]);
    jest.mocked(prisma.bir2316Issuance.findFirst).mockResolvedValue(null);
  });

  function mockLedger(payslips: object[]) {
    jest.mocked(prisma.employee.findFirst).mockImplementation((args) =>
      (args as { include?: unknown })?.include
        ? ({ ...employee, payslips } as never)
        : ({ id: 'employee-1', employmentStatus: 'ACTIVE' } as never),
    );
  }

  function mockCompleteEvidence() {
    jest.mocked(prisma.employee.findMany).mockResolvedValue([
      empIdentity,
    ] as never);
    jest.mocked(prisma.priorEmployerDeclaration.findMany).mockResolvedValue([
      { employeeId: 'employee-1', hasPriorEmployer: false, version: 1 },
    ] as never);
    jest.mocked(prisma.priorEmployerDeclaration.findFirst).mockResolvedValue({
      organizationId: 'org-1',
      hasPriorEmployer: false,
    } as never);
    jest.mocked(prisma.payslip.findMany).mockResolvedValue([
      {
        withholdingTaxCents: 0n,
        payrollRun: { paymentDate: new Date('2026-12-31') },
      },
    ] as never);
    jest
      .mocked(prisma.monthlyTaxRemittanceEvidence.findMany)
      .mockResolvedValue([{ month: 12, remittedCents: 0n, version: 1 }] as never);
  }

  function mockIssuanceCreate() {
    (prisma.bir2316Issuance.create as unknown as jest.Mock).mockImplementation(
      (args: { data: object }) =>
        Promise.resolve({
          id: 'iss-1',
          issuedAt: new Date('2027-01-15'),
          createdAt: new Date('2027-01-15'),
          ...args.data,
        }),
    );
  }

  const issueInput = {
    employeeId: 'employee-1',
    organizationId: 'org-1',
    taxYear: 2026,
    issuedById: 'hr-1',
  };

  it('issues a certificate for a balanced reconciliation and freezes the figures', async () => {
    mockLedger([balancedSlip]);
    mockCompleteEvidence();
    mockIssuanceCreate();

    const record = await new ComplianceService().issueBir2316(issueInput);
    expect(record).toMatchObject({
      status: 'ISSUED',
      version: 1,
      hadPriorEmployer: false,
    });
    expect(record.snapshot).toMatchObject({
      grossCents: '1545000',
      taxableCents: '1295000',
      taxDueCents: '0',
      withheldCents: '0',
      adjustmentCents: '0',
      priorEmployerTotals: null,
      settlementId: null,
      reconciliationStatus: 'BALANCED',
    });
  });

  it('issues a certificate for a settled deficiency with its snapshot', async () => {
    mockLedger([deficiencySlip]);
    mockCompleteEvidence();
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      id: 'settle-1',
      settlementType: 'DEFICIENCY_WITHHELD',
      settledCents: 4250000n,
    } as never);
    mockIssuanceCreate();

    const record = await new ComplianceService().issueBir2316(issueInput);
    expect(record).toMatchObject({
      status: 'ISSUED',
      snapshot: expect.objectContaining({
        taxDueCents: '4250000',
        adjustmentCents: '4250000',
        settlementId: 'settle-1',
      }),
    });
  });

  it('refuses issuance while a tax difference is unsettled', async () => {
    mockLedger([deficiencySlip]);
    mockCompleteEvidence();
    await expect(
      new ComplianceService().issueBir2316(issueInput),
    ).rejects.toThrow('settlement');
    expect(prisma.bir2316Issuance.create).not.toHaveBeenCalled();
  });

  it('refuses issuance with incomplete year-end evidence', async () => {
    mockLedger([balancedSlip]);
    jest.mocked(prisma.employee.findMany).mockResolvedValue([
      empIdentity,
    ] as never);
    // No prior-employer declaration: the queue row stays blocked.
    await expect(
      new ComplianceService().issueBir2316(issueInput),
    ).rejects.toThrow('incomplete');
    expect(prisma.bir2316Issuance.create).not.toHaveBeenCalled();
  });

  it('refuses a duplicate active issuance', async () => {
    mockLedger([balancedSlip]);
    mockCompleteEvidence();
    jest.mocked(prisma.bir2316Issuance.findFirst).mockResolvedValue({
      id: 'iss-1',
      version: 1,
      status: 'ISSUED',
    } as never);
    await expect(
      new ComplianceService().issueBir2316(issueInput),
    ).rejects.toThrow('already issued');
    expect(prisma.bir2316Issuance.create).not.toHaveBeenCalled();
  });

  it('voids an issuance and re-issues a new version', async () => {
    jest.mocked(prisma.bir2316Issuance.findFirst).mockResolvedValue({
      id: 'iss-1',
      version: 1,
      status: 'ISSUED',
    } as never);
    jest.mocked(prisma.bir2316Issuance.update).mockImplementation((args) =>
      Promise.resolve({
        id: 'iss-1',
        ...((args as { data: object }).data ?? {}),
      }) as never,
    );
    const voided = await new ComplianceService().voidBir2316Issuance({
      employeeId: 'employee-1',
      organizationId: 'org-1',
      taxYear: 2026,
      voidReason: 'Certificate printed with a transposed TIN digit',
      voidedById: 'hr-1',
    });
    expect(voided).toMatchObject({ status: 'VOIDED' });
    expect(prisma.bir2316Issuance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'iss-1' },
        data: expect.objectContaining({
          status: 'VOIDED',
          voidedById: 'hr-1',
        }),
      }),
    );

    mockLedger([balancedSlip]);
    mockCompleteEvidence();
    jest.mocked(prisma.bir2316Issuance.findFirst).mockResolvedValue({
      id: 'iss-1',
      version: 1,
      status: 'VOIDED',
    } as never);
    mockIssuanceCreate();
    const reissued = await new ComplianceService().issueBir2316(issueInput);
    expect(reissued).toMatchObject({
      status: 'ISSUED',
      version: 2,
      supersedesId: 'iss-1',
    });
  });

  it('refuses to void without an active issuance', async () => {
    await expect(
      new ComplianceService().voidBir2316Issuance({
        employeeId: 'employee-1',
        organizationId: 'org-1',
        taxYear: 2026,
        voidReason: 'Voiding a certificate that was never issued',
        voidedById: 'hr-1',
      }),
    ).rejects.toThrow(NotFoundException);
    jest.mocked(prisma.bir2316Issuance.findFirst).mockResolvedValue({
      id: 'iss-1',
      version: 2,
      status: 'VOIDED',
    } as never);
    await expect(
      new ComplianceService().voidBir2316Issuance({
        employeeId: 'employee-1',
        organizationId: 'org-1',
        taxYear: 2026,
        voidReason: 'Voiding an already voided certificate',
        voidedById: 'hr-1',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.bir2316Issuance.update).not.toHaveBeenCalled();
  });

  it('exposes issuance state in the review queue', async () => {
    mockLedger([deficiencySlip]);
    mockCompleteEvidence();
    jest.mocked(prisma.yearEndTaxSettlement.findFirst).mockResolvedValue({
      id: 'settle-1',
      settlementType: 'DEFICIENCY_WITHHELD',
      settledCents: 4250000n,
    } as never);
    const issuedAt = new Date('2027-01-15');
    jest.mocked(prisma.bir2316Issuance.findMany).mockResolvedValue([
      { employeeId: 'employee-1', status: 'ISSUED', issuedAt, version: 1 },
    ] as never);

    const report = await new ComplianceService().listYearEndReconciliations(
      'org-1',
      2026,
    );
    expect(report.issuedCount).toBe(1);
    expect(report.rows[0]).toMatchObject({
      status: 'SETTLED',
      issuanceStatus: 'ISSUED',
      issuedAt,
    });
  });

  it('reads the latest issuance with its statutory deadline', async () => {
    const issued = await new ComplianceService().getBir2316Issuance(
      'employee-1',
      'org-1',
      2026,
    );
    expect(issued).toBeNull();
    jest.mocked(prisma.bir2316Issuance.findFirst).mockResolvedValue({
      id: 'iss-1',
      taxYear: 2026,
      status: 'ISSUED',
    } as never);
    const record = await new ComplianceService().getBir2316Issuance(
      'employee-1',
      'org-1',
      2026,
    );
    expect(record).toMatchObject({
      id: 'iss-1',
      statutoryDeadline: '2027-01-31',
    });
    expect(typeof record?.isLate).toBe('boolean');
  });
});
