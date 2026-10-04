import { Injectable } from '@nestjs/common';
import { prisma } from '@workspace/db';

export interface DashboardOverview {
  employees: {
    total: number;
    active: number;
    onLeave: number;
    resigned: number;
    terminated: number;
    other: number;
  };
  payroll: {
    latestRun: {
      id: string;
      status: string;
      cutoffStartDate: Date;
      cutoffEndDate: Date;
      paymentDate: Date;
      cutoffSequence: string;
      totalGrossCents: bigint;
      totalNetCents: bigint;
      totalDeductionsCents: bigint;
      totalEmployerCostCents: bigint;
      payslipCount: number;
    } | null;
    recentRuns: Array<{
      id: string;
      status: string;
      cutoffStartDate: Date;
      cutoffEndDate: Date;
      paymentDate: Date;
      cutoffSequence: string;
      totalGrossCents: bigint;
      totalNetCents: bigint;
      totalDeductionsCents: bigint;
      payslipCount: number;
      createdAt: Date;
    }>;
  };
  leaves: {
    pendingCount: number;
  };
  loans: {
    activeCount: number;
    totalOutstandingCents: bigint;
  };
  audit: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    userEmail: string;
    createdAt: Date;
  }>;
}

@Injectable()
export class DashboardService {
  async getOverview(organizationId: string): Promise<DashboardOverview> {
    const [
      employeeStatusGroups,
      totalEmployees,
      recentRuns,
      pendingLeavesCount,
      loanAggregation,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.employee.groupBy({
        by: ['employmentStatus'],
        where: { organizationId },
        _count: { id: true },
      }),
      prisma.employee.count({
        where: { organizationId },
      }),
      prisma.payrollRun.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          _count: {
            select: { payslips: true },
          },
        },
      }),
      prisma.leaveRequest.count({
        where: {
          employee: { organizationId },
          status: 'PENDING',
        },
      }),
      prisma.employeeLoan.aggregate({
        where: {
          employee: { organizationId },
          isActive: true,
        },
        _count: { id: true },
        _sum: { balanceCents: true },
      }),
      prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          userEmail: true,
          createdAt: true,
        },
      }),
    ]);

    let activeEmployees = 0;
    let onLeaveEmployees = 0;
    let resignedEmployees = 0;
    let terminatedEmployees = 0;
    let otherEmployees = 0;

    for (const group of employeeStatusGroups) {
      const count = group._count.id;
      switch (group.employmentStatus) {
        case 'ACTIVE':
          activeEmployees += count;
          break;
        case 'ON_LEAVE':
          onLeaveEmployees += count;
          break;
        case 'RESIGNED':
          resignedEmployees += count;
          break;
        case 'TERMINATED':
          terminatedEmployees += count;
          break;
        default:
          otherEmployees += count;
          break;
      }
    }

    const latestRun = recentRuns[0] ?? null;

    return {
      employees: {
        total: totalEmployees,
        active: activeEmployees,
        onLeave: onLeaveEmployees,
        resigned: resignedEmployees,
        terminated: terminatedEmployees,
        other: otherEmployees,
      },
      payroll: {
        latestRun: latestRun
          ? {
              id: latestRun.id,
              status: latestRun.status,
              cutoffStartDate: latestRun.cutoffStartDate,
              cutoffEndDate: latestRun.cutoffEndDate,
              paymentDate: latestRun.paymentDate,
              cutoffSequence: latestRun.cutoffSequence,
              totalGrossCents: latestRun.totalGrossCents,
              totalNetCents: latestRun.totalNetCents,
              totalDeductionsCents: latestRun.totalDeductionsCents,
              totalEmployerCostCents: latestRun.totalEmployerCostCents,
              payslipCount: latestRun._count.payslips,
            }
          : null,
        recentRuns: recentRuns.map((run) => ({
          id: run.id,
          status: run.status,
          cutoffStartDate: run.cutoffStartDate,
          cutoffEndDate: run.cutoffEndDate,
          paymentDate: run.paymentDate,
          cutoffSequence: run.cutoffSequence,
          totalGrossCents: run.totalGrossCents,
          totalNetCents: run.totalNetCents,
          totalDeductionsCents: run.totalDeductionsCents,
          payslipCount: run._count.payslips,
          createdAt: run.createdAt,
        })),
      },
      leaves: {
        pendingCount: pendingLeavesCount,
      },
      loans: {
        activeCount: loanAggregation._count.id,
        totalOutstandingCents: loanAggregation._sum.balanceCents ?? 0n,
      },
      audit: recentAuditLogs,
    };
  }
}
