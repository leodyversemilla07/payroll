import { UnprocessableEntityException } from '@nestjs/common';
import { prisma } from '@workspace/db';
import { DoleReportService } from './dole-report.service';

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

describe('DoleReportService exports', () => {
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

    const report = await new DoleReportService().generateDole13thMonthReport(
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
      new DoleReportService().generateDole13thMonthReport(
        'org-1',
        details,
        2026,
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
