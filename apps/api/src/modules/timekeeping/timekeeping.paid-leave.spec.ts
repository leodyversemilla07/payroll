import { UnprocessableEntityException } from '@nestjs/common';
import { TimekeepingService } from './timekeeping.service';

const cutoffStart = new Date('2026-09-01');
const cutoffEnd = new Date('2026-09-15');

function mockDatabase(
  payBasis: 'MONTHLY' | 'DAILY' | 'HOURLY',
  absent: boolean,
) {
  return {
    dailyTimeRecord: {
      findMany: jest.fn().mockResolvedValue([
        {
          date: new Date('2026-09-10'),
          dayType: 'REGULAR_WORKDAY',
          actualWorkedMinutes: absent ? 0 : 480,
          tardinessMinutes: 0,
          undertimeMinutes: 0,
          overtimeMinutes: 0,
          nightDiffMinutes: 0,
          isApproved: true,
          isAbsent: absent,
        },
      ]),
    },
    leaveRequest: {
      findMany: jest.fn().mockResolvedValue([
        {
          startDate: new Date('2026-09-10'),
          endDate: new Date('2026-09-10'),
          employee: { payBasis },
        },
      ]),
    },
  };
}

describe('paid-leave payroll reconciliation', () => {
  it('blocks a paid absence DTR before payroll can deduct it again', async () => {
    const db = mockDatabase('MONTHLY', true);
    await expect(
      new TimekeepingService().getCutoffAttendanceSummary(
        'employee-1',
        'org-1',
        cutoffStart,
        cutoffEnd,
        db as never,
      ),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(db.leaveRequest.findMany).toHaveBeenCalledWith({
      where: {
        employeeId: 'employee-1',
        employee: { organizationId: 'org-1' },
        status: 'APPROVED',
        isPaid: true,
        startDate: { lte: cutoffEnd },
        endDate: { gte: cutoffStart },
      },
      include: expect.any(Object),
    });
  });

  it('blocks tardiness deductions on paid leave days as well', async () => {
    const db = mockDatabase('MONTHLY', false);
    const records = await db.dailyTimeRecord.findMany();
    records[0].tardinessMinutes = 60;
    await expect(
      new TimekeepingService().getCutoffAttendanceSummary(
        'employee-1',
        'org-1',
        cutoffStart,
        cutoffEnd,
        db as never,
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('blocks unsupported daily/hourly paid-leave credits', async () => {
    for (const basis of ['DAILY', 'HOURLY'] as const) {
      const db = mockDatabase(basis, false);
      await expect(
        new TimekeepingService().getCutoffAttendanceSummary(
          'employee-1',
          'org-1',
          cutoffStart,
          cutoffEnd,
          db as never,
        ),
      ).rejects.toThrow('Paid leave for daily/hourly employees');
    }
  });

  it('allows reconciled monthly paid leave without an absence deduction', async () => {
    const db = mockDatabase('MONTHLY', false);
    const summary = await new TimekeepingService().getCutoffAttendanceSummary(
      'employee-1',
      'org-1',
      cutoffStart,
      cutoffEnd,
      db as never,
    );
    expect(summary.absentDays).toBe(0);
  });
});
