import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { prisma } from '@workspace/db';
import { MonthlyRemittanceService } from './monthly-remittance.service';

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

describe('MonthlyRemittanceService exports', () => {
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

  it('reads only a tenant employee’s self-reported tax evidence', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);
    await expect(
      new MonthlyRemittanceService().getTaxEvidence(
        'employee-1',
        'wrong-org',
        2026,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.priorEmployerDeclaration.findMany).not.toHaveBeenCalled();
    jest
      .mocked(prisma.employee.findFirst)
      .mockResolvedValue({ id: 'employee-1' } as never);
    const evidence = await new MonthlyRemittanceService().getTaxEvidence(
      'employee-1',
      'org-1',
      2026,
    );
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
    await expect(
      new MonthlyRemittanceService().recordMonthlyTaxRemittance({
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
    await new MonthlyRemittanceService().recordMonthlyTaxRemittance({
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
});

describe('MonthlyRemittanceService evidence supersession', () => {
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

    const evidence = await new MonthlyRemittanceService().getTaxEvidence(
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
