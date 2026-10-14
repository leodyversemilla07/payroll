import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type Notification,
  type NotificationType,
  Prisma,
  prisma,
  Role,
} from '@workspace/db';
import { EmailService } from '../../infrastructure/email/email.service';

export interface NotifyInput {
  organizationId: string;
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}

export interface LeaveRequestSummary {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  daysCount: number;
}

export interface PayrollRunSummary {
  id: string;
  cutoffStartDate: Date;
  cutoffEndDate: Date;
  cutoffSequence: string;
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatCutoff(run: PayrollRunSummary): string {
  const sequence =
    run.cutoffSequence === 'FIRST_CUTOFF'
      ? '1st cutoff'
      : run.cutoffSequence === 'SECOND_CUTOFF'
        ? '2nd cutoff'
        : 'special run';
  return `${isoDay(run.cutoffStartDate)} – ${isoDay(run.cutoffEndDate)} (${sequence})`;
}

@Injectable()
export class NotificationService {
  private readonly emailService: EmailService;

  constructor(emailService?: EmailService) {
    this.emailService = emailService ?? new EmailService();
  }

  async notify(
    input: NotifyInput,
    database: Prisma.TransactionClient = prisma,
  ): Promise<number> {
    const userIds = [...new Set(input.userIds)];
    if (userIds.length === 0) return 0;
    const result = await database.notification.createMany({
      data: userIds.map((userId) => ({
        organizationId: input.organizationId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? '',
        entityType: input.entityType,
        entityId: input.entityId,
      })),
    });
    return result.count;
  }

  async approverUserIds(
    organizationId: string,
    database: Prisma.TransactionClient = prisma,
  ): Promise<string[]> {
    const users = await database.user.findMany({
      where: {
        organizationId,
        role: { in: [Role.SUPER_ADMIN, Role.HR_ADMIN] },
        isActive: true,
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  async payrollStaffUserIds(
    organizationId: string,
    database: Prisma.TransactionClient = prisma,
  ): Promise<string[]> {
    const users = await database.user.findMany({
      where: {
        organizationId,
        role: { in: [Role.SUPER_ADMIN, Role.PAYROLL_SPECIALIST] },
        isActive: true,
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  async userIdForEmployee(
    organizationId: string,
    employeeId: string,
    database: Prisma.TransactionClient = prisma,
  ): Promise<string | null> {
    const user = await database.user.findFirst({
      where: { organizationId, employeeId, isActive: true },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async managerUserIdsForEmployee(
    organizationId: string,
    employeeId: string,
    database: Prisma.TransactionClient = prisma,
  ): Promise<string[]> {
    const employee = await database.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { departmentId: true },
    });
    if (!employee) return [];
    const department = await database.department.findFirst({
      where: { id: employee.departmentId, organizationId },
      select: { managerId: true },
    });
    if (!department?.managerId) return [];
    const users = await database.user.findMany({
      where: {
        organizationId,
        isActive: true,
        role: Role.DEPARTMENT_MANAGER,
        OR: [
          { id: department.managerId },
          { employeeId: department.managerId },
        ],
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  async notifyLeaveFiled(
    organizationId: string,
    request: LeaveRequestSummary,
    database: Prisma.TransactionClient = prisma,
  ): Promise<number> {
    const employee = await database.employee.findFirst({
      where: { id: request.employeeId, organizationId },
      select: { firstName: true, lastName: true },
    });
    const name = employee
      ? `${employee.firstName} ${employee.lastName}`
      : 'An employee';
    const [approvers, managers] = await Promise.all([
      this.approverUserIds(organizationId, database),
      this.managerUserIdsForEmployee(
        organizationId,
        request.employeeId,
        database,
      ),
    ]);
    const notifCount = await this.notify(
      {
        organizationId,
        userIds: [...approvers, ...managers],
        type: 'LEAVE_FILED',
        title: 'New leave request',
        body: `${name} requested ${request.daysCount} day(s) of ${request.leaveType} leave (${isoDay(request.startDate)} – ${isoDay(request.endDate)}).`,
        entityType: 'LeaveRequest',
        entityId: request.id,
      },
      database,
    );

    // Asynchronously dispatch leave filed notifications to managers / approvers
    const managerUsers =
      (await database.user.findMany({
        where: {
          id: { in: [...approvers, ...managers] },
          organizationId,
          isActive: true,
        },
        select: { email: true, name: true },
      })) ?? [];

    for (const m of managerUsers) {
      if (m.email?.includes('@')) {
        await this.emailService
          .sendLeaveFiledEmail(
            {
              managerName: m.name || 'Manager',
              employeeName: name,
              leaveType: request.leaveType,
              startDate: isoDay(request.startDate),
              endDate: isoDay(request.endDate),
              daysCount: request.daysCount,
              reason: '',
            },
            m.email,
          )
          .catch(() => {});
      }
    }

    return notifCount;
  }

  async notifyLeaveDecided(
    organizationId: string,
    request: LeaveRequestSummary,
    decision: 'APPROVED' | 'REJECTED',
    database: Prisma.TransactionClient = prisma,
  ): Promise<number> {
    const userId = await this.userIdForEmployee(
      organizationId,
      request.employeeId,
      database,
    );
    if (!userId) return 0;
    const action = decision === 'APPROVED' ? 'approved' : 'rejected';
    const notifCount = await this.notify(
      {
        organizationId,
        userIds: [userId],
        type: decision === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        title: `Leave request ${action}`,
        body: `Your ${request.daysCount} day(s) of ${request.leaveType} leave (${isoDay(request.startDate)} – ${isoDay(request.endDate)}) was ${action}.`,
        entityType: 'LeaveRequest',
        entityId: request.id,
      },
      database,
    );

    // Asynchronously dispatch leave decision notification to employee
    const emp = await database.employee.findFirst({
      where: { id: request.employeeId, organizationId },
      select: { firstName: true, lastName: true, email: true },
    });

    if (emp?.email?.includes('@')) {
      await this.emailService
        .sendLeaveDecidedEmail(
          {
            employeeName: `${emp.firstName} ${emp.lastName}`,
            leaveType: request.leaveType,
            startDate: isoDay(request.startDate),
            endDate: isoDay(request.endDate),
            daysCount: request.daysCount,
            decision,
          },
          emp.email,
        )
        .catch(() => {});
    }

    return notifCount;
  }

  async notifyPayrollRun(
    organizationId: string,
    run: PayrollRunSummary,
    event: 'TRIGGERED' | 'APPROVED' | 'DISBURSED' | 'CANCELLED',
    database: Prisma.TransactionClient = prisma,
  ): Promise<number> {
    const cutoff = formatCutoff(run);
    switch (event) {
      case 'TRIGGERED': {
        const approvers = await this.approverUserIds(organizationId, database);
        return this.notify(
          {
            organizationId,
            userIds: approvers,
            type: 'RUN_TRIGGERED',
            title: 'Payroll run ready for review',
            body: `Cutoff ${cutoff} was calculated and is awaiting approval.`,
            entityType: 'PayrollRun',
            entityId: run.id,
          },
          database,
        );
      }
      case 'APPROVED': {
        const staff = await this.payrollStaffUserIds(organizationId, database);
        return this.notify(
          {
            organizationId,
            userIds: staff,
            type: 'RUN_APPROVED',
            title: 'Payroll run approved',
            body: `Cutoff ${cutoff} was approved and is ready to disburse.`,
            entityType: 'PayrollRun',
            entityId: run.id,
          },
          database,
        );
      }
      case 'DISBURSED': {
        const users = await database.user.findMany({
          where: { organizationId, isActive: true },
          select: { id: true },
        });
        return this.notify(
          {
            organizationId,
            userIds: users.map((user) => user.id),
            type: 'RUN_DISBURSED',
            title: 'Payslips ready',
            body: `Payroll for cutoff ${cutoff} was disbursed. Your payslip is available.`,
            entityType: 'PayrollRun',
            entityId: run.id,
          },
          database,
        );
      }
      case 'CANCELLED': {
        const approvers = await this.approverUserIds(organizationId, database);
        return this.notify(
          {
            organizationId,
            userIds: approvers,
            type: 'RUN_CANCELLED',
            title: 'Payroll run cancelled',
            body: `Cutoff ${cutoff} was cancelled.`,
            entityType: 'PayrollRun',
            entityId: run.id,
          },
          database,
        );
      }
    }
  }

  async listForUser(
    userId: string,
    organizationId: string,
    options: { unreadOnly?: boolean; limit?: number } = {},
  ): Promise<Notification[]> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    return prisma.notification.findMany({
      where: {
        userId,
        organizationId,
        ...(options.unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async countUnread(userId: string, organizationId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, organizationId, isRead: false },
    });
  }

  async markRead(
    userId: string,
    organizationId: string,
    id: string,
  ): Promise<Notification> {
    const existing = await prisma.notification.findFirst({
      where: { id, userId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }
    if (existing.isRead) return existing;
    return prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string, organizationId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, organizationId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }
}
