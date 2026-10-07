import { Injectable, Logger } from '@nestjs/common';
import { type PayrollStatus, Prisma, prisma } from '@workspace/db';

export type CutoffSequenceType = 'FIRST_CUTOFF' | 'SECOND_CUTOFF';

export interface CutoffPeriodInfo {
  year: number;
  month: number; // 1 - 12
  sequence: CutoffSequenceType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  paymentDateTarget: string; // YYYY-MM-DD
  daysRemaining: number;
  isApproachingDeadline: boolean;
}

export interface CutoffAlertResult {
  organizationId: string;
  organizationName: string;
  cutoff: CutoffPeriodInfo;
  payrollRunStatus: PayrollStatus | 'NOT_STARTED';
  existingRunId: string | null;
  attendanceSummary: {
    totalActiveEmployees: number;
    employeesWithAnomalies: number;
    pendingLeaveRequests: number;
  };
  readinessPercentage: number;
  alerts: string[];
}

@Injectable()
export class CutoffSchedulerService {
  private readonly logger = new Logger(CutoffSchedulerService.name);

  constructor(private readonly database: Prisma.TransactionClient = prisma) {}

  withDatabase(database: Prisma.TransactionClient): CutoffSchedulerService {
    return new CutoffSchedulerService(database);
  }

  /**
   * Derives Philippine semi-monthly cutoff period from reference date
   * using Asia/Manila (UTC+08:00) civil time.
   */
  calculateCutoffPeriod(referenceDate = new Date()): CutoffPeriodInfo {
    // Add 8 hours to get Manila civil date parts
    const manilaTime = new Date(referenceDate.getTime() + 8 * 60 * 60 * 1000);
    const year = manilaTime.getUTCFullYear();
    const month = manilaTime.getUTCMonth() + 1; // 1-12
    const day = manilaTime.getUTCDate();

    const isFirstCutoff = day <= 15;
    const sequence: CutoffSequenceType = isFirstCutoff
      ? 'FIRST_CUTOFF'
      : 'SECOND_CUTOFF';

    const mm = String(month).padStart(2, '0');
    let startDate: string;
    let endDate: string;
    let paymentDateTarget: string;
    let endDay: number;

    if (isFirstCutoff) {
      startDate = `${year}-${mm}-01`;
      endDate = `${year}-${mm}-15`;
      paymentDateTarget = `${year}-${mm}-20`;
      endDay = 15;
    } else {
      // Days in month
      const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      startDate = `${year}-${mm}-16`;
      endDate = `${year}-${mm}-${String(lastDayOfMonth).padStart(2, '0')}`;
      // Payment target: 5th of next month
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      paymentDateTarget = `${nextYear}-${String(nextMonth).padStart(2, '0')}-05`;
      endDay = lastDayOfMonth;
    }

    const daysRemaining = Math.max(0, endDay - day);
    const isApproachingDeadline = daysRemaining <= 3;

    return {
      year,
      month,
      sequence,
      startDate,
      endDate,
      paymentDateTarget,
      daysRemaining,
      isApproachingDeadline,
    };
  }

  /**
   * Evaluates cutoff readiness, pending approvals, and payroll run state
   * for a specific organization.
   */
  async checkCutoffAlerts(
    organizationId: string,
    referenceDate = new Date(),
  ): Promise<CutoffAlertResult> {
    const org = await this.database.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    const cutoff = this.calculateCutoffPeriod(referenceDate);
    const startDt = new Date(`${cutoff.startDate}T00:00:00Z`);
    const endDt = new Date(`${cutoff.endDate}T23:59:59Z`);

    // 1. Check existing payroll run for this cutoff
    const existingRun = await this.database.payrollRun.findFirst({
      where: {
        organizationId,
        cutoffSequence: cutoff.sequence,
        cutoffStartDate: { gte: startDt },
        cutoffEndDate: { lte: endDt },
      },
      select: { id: true, status: true },
      orderBy: { createdAt: 'desc' },
    });

    const payrollRunStatus: PayrollStatus | 'NOT_STARTED' = existingRun
      ? existingRun.status
      : 'NOT_STARTED';

    // 2. Count active employees
    const totalActiveEmployees = await this.database.employee.count({
      where: {
        organizationId,
        employmentStatus: 'ACTIVE',
      },
    });

    // 3. Count employees with attendance anomalies in this cutoff
    const anomalyDtrs = await this.database.dailyTimeRecord.findMany({
      where: {
        employee: { organizationId, employmentStatus: 'ACTIVE' },
        date: { gte: startDt, lte: endDt },
        OR: [
          { timeIn: null, timeOut: { not: null } },
          { timeIn: { not: null }, timeOut: null },
          { isApproved: false },
        ],
      },
      select: { employeeId: true },
      distinct: ['employeeId'],
    });
    const employeesWithAnomalies = anomalyDtrs.length;

    // 4. Count pending leave requests overlapping this cutoff
    const pendingLeaveRequests = await this.database.leaveRequest.count({
      where: {
        employee: { organizationId },
        status: 'PENDING',
        startDate: { lte: endDt },
        endDate: { gte: startDt },
      },
    });

    // 5. Generate human-readable alerts
    const alerts: string[] = [];

    if (payrollRunStatus === 'NOT_STARTED') {
      if (cutoff.isApproachingDeadline) {
        alerts.push(
          `Upcoming cutoff deadline: ${cutoff.sequence.replace('_', ' ')} ends in ${cutoff.daysRemaining} day(s) on ${cutoff.endDate}. Payroll run has not been drafted yet.`,
        );
      } else {
        alerts.push(
          `Current cutoff: ${cutoff.startDate} to ${cutoff.endDate}. Scheduled payment date: ${cutoff.paymentDateTarget}.`,
        );
      }
    } else if (payrollRunStatus === 'DRAFT') {
      alerts.push(
        `Draft payroll run exists for ${cutoff.sequence.replace('_', ' ')}. Awaiting checker approval.`,
      );
    } else if (payrollRunStatus === 'APPROVED') {
      alerts.push(
        `Payroll run approved for ${cutoff.sequence.replace('_', ' ')}. Ready for disbursement on ${cutoff.paymentDateTarget}.`,
      );
    } else if (payrollRunStatus === 'DISBURSED') {
      alerts.push(
        `Payroll run disbursed for ${cutoff.sequence.replace('_', ' ')}. Payslips are available for download.`,
      );
    }

    if (employeesWithAnomalies > 0) {
      alerts.push(
        `${employeesWithAnomalies} employee(s) have unclosed or missing biometric punches in this cutoff period.`,
      );
    }

    if (pendingLeaveRequests > 0) {
      alerts.push(
        `${pendingLeaveRequests} pending leave request(s) within this cutoff require approval before payroll computation.`,
      );
    }

    // 6. Calculate Readiness Percentage
    let score = 100;
    if (payrollRunStatus === 'NOT_STARTED') score -= 30;
    if (payrollRunStatus === 'DRAFT') score -= 15;
    if (employeesWithAnomalies > 0) {
      score -= Math.min(40, employeesWithAnomalies * 10);
    }
    if (pendingLeaveRequests > 0) {
      score -= Math.min(30, pendingLeaveRequests * 5);
    }
    const readinessPercentage = Math.max(0, Math.min(100, score));

    return {
      organizationId,
      organizationName: org.name,
      cutoff,
      payrollRunStatus,
      existingRunId: existingRun?.id ?? null,
      attendanceSummary: {
        totalActiveEmployees,
        employeesWithAnomalies,
        pendingLeaveRequests,
      },
      readinessPercentage,
      alerts,
    };
  }

  /**
   * Periodic sweep across all organizations. Can be invoked on a cron schedule.
   */
  async checkAllOrganizationsCutoffAlerts(
    referenceDate = new Date(),
  ): Promise<CutoffAlertResult[]> {
    const orgs = await this.database.organization.findMany({
      select: { id: true },
    });
    const results: CutoffAlertResult[] = [];

    for (const org of orgs) {
      try {
        const result = await this.checkCutoffAlerts(org.id, referenceDate);
        results.push(result);
        if (result.cutoff.isApproachingDeadline) {
          this.logger.log(
            `Organization ${result.organizationName} (${org.id}) cutoff deadline approaching: ${result.cutoff.daysRemaining} days remaining`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to check cutoff alerts for organization ${org.id}:`,
          error,
        );
      }
    }

    return results;
  }
}
