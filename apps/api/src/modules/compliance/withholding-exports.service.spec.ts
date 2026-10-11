import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { prisma } from '@workspace/db';
import { WithholdingExportsService } from './withholding-exports.service';

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

describe('WithholdingExportsService exports', () => {
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
    const summary = await new WithholdingExportsService().getBir1601CSummary(
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
      new WithholdingExportsService().getBir1601CSummary(12, 2026, 'org-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('blocks bank files before the payroll run is approved', async () => {
    jest
      .mocked(prisma.payrollRun.findFirst)
      .mockResolvedValue({ status: 'AUDITED' } as never);
    await expect(
      new WithholdingExportsService().generateBankTransmittalCsv(
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
    const csv =
      await new WithholdingExportsService().generateBankTransmittalCsv(
        'run-1',
        'BDO',
        'org-1',
      );
    expect(csv).toContain('Alex Santos');
    expect(csv).not.toContain('Jo Reyes');
    // Exact decimal from integer centavos: 100000n -> "1000.00".
    expect(csv).toContain(',1000.00,');

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
      new WithholdingExportsService().generateBankTransmittalCsv(
        'run-1',
        'BDO',
        'org-1',
      ),
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
      new WithholdingExportsService().generateBankTransmittalCsv(
        'run-1',
        'BDO',
        'org-1',
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('does not expose another tenant’s payroll run', async () => {
    jest.mocked(prisma.payrollRun.findFirst).mockResolvedValue(null);
    await expect(
      new WithholdingExportsService().generateBankTransmittalCsv(
        'run-1',
        'BDO',
        'org-1',
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
