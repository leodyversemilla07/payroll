import { CutoffSchedulerService } from './cutoff-scheduler.service';

describe('CutoffSchedulerService', () => {
  let service: CutoffSchedulerService;
  let mockPrisma: {
    organization: { findUnique: jest.Mock; findMany: jest.Mock };
    payrollRun: { findFirst: jest.Mock };
    employee: { count: jest.Mock };
    dailyTimeRecord: { findMany: jest.Mock };
    leaveRequest: { count: jest.Mock };
  };

  beforeEach(() => {
    mockPrisma = {
      organization: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      payrollRun: {
        findFirst: jest.fn(),
      },
      employee: {
        count: jest.fn(),
      },
      dailyTimeRecord: {
        findMany: jest.fn(),
      },
      leaveRequest: {
        count: jest.fn(),
      },
    };
    service = new CutoffSchedulerService(mockPrisma as never);
  });

  describe('calculateCutoffPeriod', () => {
    it('identifies FIRST_CUTOFF for days 1 to 15 (e.g. Oct 5)', () => {
      // 2026-10-05 04:00:00 UTC = 2026-10-05 12:00:00 Manila (day 5)
      const refDate = new Date(Date.UTC(2026, 9, 5, 4, 0, 0));
      const cutoff = service.calculateCutoffPeriod(refDate);

      expect(cutoff.year).toBe(2026);
      expect(cutoff.month).toBe(10);
      expect(cutoff.sequence).toBe('FIRST_CUTOFF');
      expect(cutoff.startDate).toBe('2026-10-01');
      expect(cutoff.endDate).toBe('2026-10-15');
      expect(cutoff.paymentDateTarget).toBe('2026-10-20');
      expect(cutoff.daysRemaining).toBe(10);
      expect(cutoff.isApproachingDeadline).toBe(false);
    });

    it('identifies SECOND_CUTOFF for days 16 to end of month (e.g. Oct 28)', () => {
      // 2026-10-28 04:00:00 UTC = 2026-10-28 12:00:00 Manila (day 28)
      const refDate = new Date(Date.UTC(2026, 9, 28, 4, 0, 0));
      const cutoff = service.calculateCutoffPeriod(refDate);

      expect(cutoff.year).toBe(2026);
      expect(cutoff.month).toBe(10);
      expect(cutoff.sequence).toBe('SECOND_CUTOFF');
      expect(cutoff.startDate).toBe('2026-10-16');
      expect(cutoff.endDate).toBe('2026-10-31');
      expect(cutoff.paymentDateTarget).toBe('2026-11-05');
      expect(cutoff.daysRemaining).toBe(3);
      expect(cutoff.isApproachingDeadline).toBe(true);
    });

    it('handles February end of month leap and non-leap years', () => {
      // 2026 is non-leap (28 days)
      const feb2026 = new Date(Date.UTC(2026, 1, 20));
      const cutoff2026 = service.calculateCutoffPeriod(feb2026);
      expect(cutoff2026.endDate).toBe('2026-02-28');
    });
  });

  describe('checkCutoffAlerts', () => {
    it('returns NOT_STARTED and alerts when no run has been drafted', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Corp',
      });
      mockPrisma.payrollRun.findFirst.mockResolvedValue(null);
      mockPrisma.employee.count.mockResolvedValue(25);
      mockPrisma.dailyTimeRecord.findMany.mockResolvedValue([
        { employeeId: 'emp-1' },
      ]);
      mockPrisma.leaveRequest.count.mockResolvedValue(2);

      const refDate = new Date(Date.UTC(2026, 9, 14, 4, 0, 0)); // Oct 14 (1 day before Oct 15 cutoff)
      const result = await service.checkCutoffAlerts('org-1', refDate);

      expect(result.organizationId).toBe('org-1');
      expect(result.organizationName).toBe('Acme Corp');
      expect(result.cutoff.sequence).toBe('FIRST_CUTOFF');
      expect(result.cutoff.isApproachingDeadline).toBe(true);
      expect(result.payrollRunStatus).toBe('NOT_STARTED');
      expect(result.attendanceSummary.totalActiveEmployees).toBe(25);
      expect(result.attendanceSummary.employeesWithAnomalies).toBe(1);
      expect(result.attendanceSummary.pendingLeaveRequests).toBe(2);
      expect(result.alerts.length).toBeGreaterThanOrEqual(3);
      expect(result.readinessPercentage).toBeLessThan(100);
    });

    it('returns DISBURSED status and 100% readiness when run is completed', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Corp',
      });
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'DISBURSED',
      });
      mockPrisma.employee.count.mockResolvedValue(25);
      mockPrisma.dailyTimeRecord.findMany.mockResolvedValue([]);
      mockPrisma.leaveRequest.count.mockResolvedValue(0);

      const refDate = new Date(Date.UTC(2026, 9, 5, 4, 0, 0));
      const result = await service.checkCutoffAlerts('org-1', refDate);

      expect(result.payrollRunStatus).toBe('DISBURSED');
      expect(result.existingRunId).toBe('run-1');
      expect(result.readinessPercentage).toBe(100);
      expect(result.alerts).toContain(
        'Payroll run disbursed for FIRST CUTOFF. Payslips are available for download.',
      );
    });

    it('throws error if organization is not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.checkCutoffAlerts('non-existent-org'),
      ).rejects.toThrow('Organization non-existent-org not found');
    });
  });
});
