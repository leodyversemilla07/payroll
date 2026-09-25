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
  beforeEach(() => jest.clearAllMocks());

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
