import { prisma } from '@workspace/db';
import { DashboardService } from './dashboard.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    employee: { groupBy: jest.fn(), count: jest.fn() },
    payrollRun: { findMany: jest.fn() },
    leaveRequest: { count: jest.fn() },
    employeeLoan: { aggregate: jest.fn() },
    auditLog: { findMany: jest.fn() },
  },
}));

describe('DashboardService', () => {
  const service = new DashboardService();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('aggregates employee, payroll, leave, loan, and audit statistics for the organization', async () => {
    jest.mocked(prisma.employee.groupBy).mockResolvedValue([
      { employmentStatus: 'ACTIVE', _count: { id: 10 } },
      { employmentStatus: 'ON_LEAVE', _count: { id: 2 } },
      { employmentStatus: 'RESIGNED', _count: { id: 1 } },
      { employmentStatus: 'TERMINATED', _count: { id: 1 } },
      { employmentStatus: 'RETIRED', _count: { id: 1 } },
    ] as never);

    jest.mocked(prisma.employee.count).mockResolvedValue(15 as never);

    const now = new Date('2026-10-01');
    jest.mocked(prisma.payrollRun.findMany).mockResolvedValue([
      {
        id: 'run-1',
        status: 'DISBURSED',
        cutoffStartDate: new Date('2026-09-16'),
        cutoffEndDate: new Date('2026-09-30'),
        paymentDate: new Date('2026-10-05'),
        cutoffSequence: 'SECOND_CUTOFF',
        totalGrossCents: 50000000n,
        totalNetCents: 42000000n,
        totalDeductionsCents: 8000000n,
        totalEmployerCostCents: 55000000n,
        createdAt: now,
        _count: { payslips: 10 },
      },
    ] as never);

    jest.mocked(prisma.leaveRequest.count).mockResolvedValue(4 as never);

    jest.mocked(prisma.employeeLoan.aggregate).mockResolvedValue({
      _count: { id: 3 },
      _sum: { balanceCents: 7500000n },
    } as never);

    jest.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: 'audit-1',
        action: 'APPROVE',
        entityType: 'PayrollRun',
        entityId: 'run-1',
        userEmail: 'admin@test.invalid',
        createdAt: now,
      },
    ] as never);

    const overview = await service.getOverview('org-1');

    expect(prisma.employee.groupBy).toHaveBeenCalledWith({
      by: ['employmentStatus'],
      where: { organizationId: 'org-1' },
      _count: { id: true },
    });
    expect(prisma.employee.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    });
    expect(prisma.payrollRun.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { _count: { select: { payslips: true } } },
    });
    expect(prisma.leaveRequest.count).toHaveBeenCalledWith({
      where: { employee: { organizationId: 'org-1' }, status: 'PENDING' },
    });
    expect(prisma.employeeLoan.aggregate).toHaveBeenCalledWith({
      where: { employee: { organizationId: 'org-1' }, isActive: true },
      _count: { id: true },
      _sum: { balanceCents: true },
    });

    expect(overview.employees).toEqual({
      total: 15,
      active: 10,
      onLeave: 2,
      resigned: 1,
      terminated: 1,
      other: 1,
    });
    expect(overview.payroll.latestRun).not.toBeNull();
    expect(overview.payroll.latestRun?.totalNetCents).toBe(42000000n);
    expect(overview.payroll.latestRun?.payslipCount).toBe(10);
    expect(overview.payroll.recentRuns).toHaveLength(1);
    expect(overview.leaves.pendingCount).toBe(4);
    expect(overview.loans.activeCount).toBe(3);
    expect(overview.loans.totalOutstandingCents).toBe(7500000n);
    expect(overview.audit).toHaveLength(1);
  });

  it('handles empty states when an organization has no recorded activity', async () => {
    jest.mocked(prisma.employee.groupBy).mockResolvedValue([] as never);
    jest.mocked(prisma.employee.count).mockResolvedValue(0 as never);
    jest.mocked(prisma.payrollRun.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.leaveRequest.count).mockResolvedValue(0 as never);
    jest.mocked(prisma.employeeLoan.aggregate).mockResolvedValue({
      _count: { id: 0 },
      _sum: { balanceCents: null },
    } as never);
    jest.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

    const overview = await service.getOverview('org-empty');

    expect(overview.employees).toEqual({
      total: 0,
      active: 0,
      onLeave: 0,
      resigned: 0,
      terminated: 0,
      other: 0,
    });
    expect(overview.payroll.latestRun).toBeNull();
    expect(overview.payroll.recentRuns).toEqual([]);
    expect(overview.leaves.pendingCount).toBe(0);
    expect(overview.loans.activeCount).toBe(0);
    expect(overview.loans.totalOutstandingCents).toBe(0n);
    expect(overview.audit).toEqual([]);
  });
});
