import { NotFoundException } from '@nestjs/common';
import { prisma } from '@workspace/db';
import { NotificationService } from './notifications.service';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: {
    notification: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { findMany: jest.fn(), findFirst: jest.fn() },
    employee: { findFirst: jest.fn() },
    department: { findFirst: jest.fn() },
  },
}));

const orgId = 'org-1';

describe('NotificationService', () => {
  const service = new NotificationService();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('notify', () => {
    it('creates one row per recipient with shared content', async () => {
      jest.mocked(prisma.notification.createMany).mockResolvedValue({
        count: 2,
      } as never);

      const count = await service.notify({
        organizationId: orgId,
        userIds: ['u-1', 'u-2'],
        type: 'LEAVE_FILED',
        title: 'New leave request',
        body: 'Ana requested leave.',
        entityType: 'LeaveRequest',
        entityId: 'req-1',
      });

      expect(count).toBe(2);
      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            userId: 'u-1',
            organizationId: orgId,
            type: 'LEAVE_FILED',
          }),
          expect.objectContaining({ userId: 'u-2' }),
        ],
      });
    });

    it('skips empty fan-out without writing', async () => {
      const count = await service.notify({
        organizationId: orgId,
        userIds: [],
        type: 'RUN_TRIGGERED',
        title: 'Ready',
      });

      expect(count).toBe(0);
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('dedupes recipients before writing', async () => {
      jest.mocked(prisma.notification.createMany).mockResolvedValue({
        count: 2,
      } as never);
      const deduped = await service.notify({
        organizationId: orgId,
        userIds: ['u-1', 'u-1', 'u-2'],
        type: 'RUN_TRIGGERED',
        title: 'Ready',
      });
      expect(deduped).toBe(2);
      const calls = jest.mocked(prisma.notification.createMany).mock.calls;
      expect(calls).toHaveLength(1);
      const data = calls[0]?.[0]?.data as Array<{ userId: string }>;
      expect(data?.map((row) => row.userId).sort()).toEqual(['u-1', 'u-2']);
    });
  });

  describe('recipient resolution', () => {
    it('resolves approvers to active HR roles only', async () => {
      jest
        .mocked(prisma.user.findMany)
        .mockResolvedValue([{ id: 'hr-1' }, { id: 'super-1' }] as never);

      const ids = await service.approverUserIds(orgId);

      expect(ids).toEqual(['hr-1', 'super-1']);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          role: { in: ['SUPER_ADMIN', 'HR_ADMIN'] },
          isActive: true,
        },
        select: { id: true },
      });
    });

    it('resolves payroll staff to maker roles only', async () => {
      jest
        .mocked(prisma.user.findMany)
        .mockResolvedValue([{ id: 'p-1' }] as never);

      const ids = await service.payrollStaffUserIds(orgId);

      expect(ids).toEqual(['p-1']);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          role: { in: ['SUPER_ADMIN', 'PAYROLL_SPECIALIST'] },
          isActive: true,
        },
        select: { id: true },
      });
    });

    it('returns null when the employee has no linked login', async () => {
      jest.mocked(prisma.user.findFirst).mockResolvedValue(null);

      await expect(
        service.userIdForEmployee(orgId, 'emp-1'),
      ).resolves.toBeNull();
    });

    it('resolves the department manager through the department record', async () => {
      jest
        .mocked(prisma.employee.findFirst)
        .mockResolvedValue({ departmentId: 'dept-1' } as never);
      jest
        .mocked(prisma.department.findFirst)
        .mockResolvedValue({ managerId: 'mgr-emp-1' } as never);
      jest
        .mocked(prisma.user.findMany)
        .mockResolvedValue([{ id: 'u-mgr' }] as never);

      const ids = await service.managerUserIdsForEmployee(orgId, 'emp-1');

      expect(ids).toEqual(['u-mgr']);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          isActive: true,
          role: 'DEPARTMENT_MANAGER',
          OR: [{ id: 'mgr-emp-1' }, { employeeId: 'mgr-emp-1' }],
        },
        select: { id: true },
      });
    });

    it('returns no managers when the chain is broken', async () => {
      jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);
      await expect(
        service.managerUserIdsForEmployee(orgId, 'missing'),
      ).resolves.toEqual([]);

      jest
        .mocked(prisma.employee.findFirst)
        .mockResolvedValue({ departmentId: 'dept-1' } as never);
      jest.mocked(prisma.department.findFirst).mockResolvedValue(null);
      await expect(
        service.managerUserIdsForEmployee(orgId, 'emp-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('leave events', () => {
    const request = {
      id: 'req-1',
      employeeId: 'emp-1',
      leaveType: 'VACATION',
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-12T00:00:00.000Z'),
      daysCount: 3,
    };

    it('fans filed requests out to approvers and the department manager', async () => {
      jest
        .mocked(prisma.employee.findFirst)
        .mockResolvedValueOnce({
          firstName: 'Ana',
          lastName: 'Santos',
        } as never)
        .mockResolvedValueOnce({ departmentId: 'dept-1' } as never);
      jest
        .mocked(prisma.department.findFirst)
        .mockResolvedValue({ managerId: 'mgr-1' } as never);
      jest
        .mocked(prisma.user.findMany)
        .mockResolvedValueOnce([{ id: 'hr-1' }] as never)
        .mockResolvedValueOnce([{ id: 'u-mgr' }] as never);
      jest.mocked(prisma.notification.createMany).mockResolvedValue({
        count: 2,
      } as never);

      await service.notifyLeaveFiled(orgId, request);

      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'LEAVE_FILED',
            title: 'New leave request',
            entityType: 'LeaveRequest',
            entityId: 'req-1',
          }),
        ]),
      });
      const calls = jest.mocked(prisma.notification.createMany).mock.calls;
      expect(calls).toHaveLength(1);
      const data = calls[0]?.[0]?.data as Array<{
        userId: string;
        body: string;
      }>;
      expect(data?.map((row) => row.userId).sort()).toEqual(['hr-1', 'u-mgr']);
      expect(data?.[0]?.body).toContain('Ana Santos');
    });

    it('notifies the requester on approval and rejection', async () => {
      jest
        .mocked(prisma.user.findFirst)
        .mockResolvedValue({ id: 'u-emp' } as never);
      jest.mocked(prisma.notification.createMany).mockResolvedValue({
        count: 1,
      } as never);

      await service.notifyLeaveDecided(orgId, request, 'APPROVED');
      expect(prisma.notification.createMany).toHaveBeenLastCalledWith({
        data: [
          expect.objectContaining({
            userId: 'u-emp',
            type: 'LEAVE_APPROVED',
            title: 'Leave request approved',
          }),
        ],
      });

      await service.notifyLeaveDecided(orgId, request, 'REJECTED');
      expect(prisma.notification.createMany).toHaveBeenLastCalledWith({
        data: [
          expect.objectContaining({
            userId: 'u-emp',
            type: 'LEAVE_REJECTED',
            title: 'Leave request rejected',
          }),
        ],
      });
    });

    it('skips decisions when the requester has no login', async () => {
      jest.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const count = await service.notifyLeaveDecided(
        orgId,
        request,
        'APPROVED',
      );

      expect(count).toBe(0);
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('payroll run events', () => {
    const run = {
      id: 'run-1',
      cutoffStartDate: new Date('2026-09-16T00:00:00.000Z'),
      cutoffEndDate: new Date('2026-09-30T00:00:00.000Z'),
      cutoffSequence: 'SECOND_CUTOFF',
    };

    it('notifies approvers on trigger and staff on approval', async () => {
      jest
        .mocked(prisma.user.findMany)
        .mockResolvedValue([{ id: 'hr-1' }] as never);
      jest.mocked(prisma.notification.createMany).mockResolvedValue({
        count: 1,
      } as never);

      await service.notifyPayrollRun(orgId, run, 'TRIGGERED');
      expect(prisma.notification.createMany).toHaveBeenLastCalledWith({
        data: [
          expect.objectContaining({
            type: 'RUN_TRIGGERED',
            entityType: 'PayrollRun',
            entityId: 'run-1',
          }),
        ],
      });

      await service.notifyPayrollRun(orgId, run, 'APPROVED');
      expect(prisma.notification.createMany).toHaveBeenLastCalledWith({
        data: [
          expect.objectContaining({
            type: 'RUN_APPROVED',
            title: 'Payroll run approved',
          }),
        ],
      });
    });

    it('broadcasts disbursement to every active login', async () => {
      jest
        .mocked(prisma.user.findMany)
        .mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }] as never);
      jest.mocked(prisma.notification.createMany).mockResolvedValue({
        count: 2,
      } as never);

      await service.notifyPayrollRun(orgId, run, 'DISBURSED');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId, isActive: true },
        select: { id: true },
      });
      expect(prisma.notification.createMany).toHaveBeenLastCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ type: 'RUN_DISBURSED' }),
        ]),
      });
    });

    it('notifies approvers on cancellation', async () => {
      jest.mocked(prisma.user.findMany).mockResolvedValue([] as never);
      jest.mocked(prisma.notification.createMany).mockResolvedValue({
        count: 0,
      } as never);

      const count = await service.notifyPayrollRun(orgId, run, 'CANCELLED');

      expect(count).toBe(0);
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('self-service reads', () => {
    it('lists newest first with limit clamping', async () => {
      jest.mocked(prisma.notification.findMany).mockResolvedValue([]);

      await service.listForUser('u-1', orgId, { unreadOnly: true, limit: 500 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'u-1', organizationId: orgId, isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('counts unread rows', async () => {
      jest.mocked(prisma.notification.count).mockResolvedValue(3);

      await expect(service.countUnread('u-1', orgId)).resolves.toBe(3);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'u-1', organizationId: orgId, isRead: false },
      });
    });

    it('marks only own unread rows read', async () => {
      jest
        .mocked(prisma.notification.findFirst)
        .mockResolvedValue({ id: 'n-1', isRead: false } as never);
      jest
        .mocked(prisma.notification.update)
        .mockResolvedValue({ id: 'n-1', isRead: true } as never);

      const result = await service.markRead('u-1', orgId, 'n-1');

      expect(result).toMatchObject({ id: 'n-1', isRead: true });
      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'n-1', userId: 'u-1', organizationId: orgId },
      });
    });

    it('returns already-read rows without writing', async () => {
      const read = { id: 'n-1', isRead: true };
      jest
        .mocked(prisma.notification.findFirst)
        .mockResolvedValue(read as never);

      await expect(service.markRead('u-1', orgId, 'n-1')).resolves.toEqual(
        read,
      );
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('rejects foreign notification ids as not found', async () => {
      jest.mocked(prisma.notification.findFirst).mockResolvedValue(null);

      await expect(
        service.markRead('u-1', orgId, 'someone-elses-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks all own unread rows read and reports the count', async () => {
      jest.mocked(prisma.notification.updateMany).mockResolvedValue({
        count: 4,
      } as never);

      await expect(service.markAllRead('u-1', orgId)).resolves.toBe(4);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u-1', organizationId: orgId, isRead: false },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });
  });
});
