import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type LeaveRequest, Prisma, prisma } from '@workspace/db';
import { calculateSilCashConversion } from '@workspace/payroll-engine';
import {
  type CreditAudit,
  type LeaveCreditInput,
  listEmployeeCreditChanges,
  setEmployeeLeaveCredits,
} from './leave-credits';

export interface LeaveRequestInput {
  employeeId: string;
  organizationId: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  daysCount: number;
  partialDate?: Date;
  isPaid: boolean;
  reason: string;
}
type DecisionAudit = (data: {
  previous: LeaveRequest;
  request: LeaveRequest;
  transaction: Prisma.TransactionClient;
}) => Promise<void>;

@Injectable()
export class LeavesService {
  setEmployeeLeaveCredits(input: LeaveCreditInput, audit: CreditAudit) {
    return setEmployeeLeaveCredits(input, audit);
  }

  listEmployeeCreditChanges(
    employeeId: string,
    organizationId: string,
    year: number,
  ) {
    return listEmployeeCreditChanges(employeeId, organizationId, year);
  }

  // Reads must not create guessed statutory/company entitlements.
  async getEmployeeLeaveBalances(
    employeeId: string,
    organizationId: string,
    year = new Date().getFullYear(),
  ) {
    await this.assertEmployeeInOrganization(employeeId, organizationId);
    return prisma.leaveBalance.findMany({
      where: { employeeId, employee: { organizationId }, year },
      orderBy: { leaveType: 'asc' },
    });
  }

  async listEmployeeLeaveRequests(
    employeeId: string,
    organizationId: string,
    year: number,
    status?: 'PENDING' | 'APPROVED' | 'REJECTED',
    limit = 100,
  ) {
    await this.assertEmployeeInOrganization(employeeId, organizationId);
    return prisma.leaveRequest.findMany({
      where: {
        employeeId,
        employee: { organizationId },
        startDate: { lt: new Date(Date.UTC(year + 1, 0, 1)) },
        endDate: { gte: new Date(Date.UTC(year, 0, 1)) },
        ...(status ? { status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  async fileLeaveRequest(
    data: LeaveRequestInput,
    database: Prisma.TransactionClient = prisma,
  ) {
    await this.assertEmployeeInOrganization(
      data.employeeId,
      data.organizationId,
      database,
    );
    const schedule = validateLeaveSchedule(data);
    const overlap = await database.leaveRequest.findFirst({
      where: {
        employeeId: data.employeeId,
        employee: { organizationId: data.organizationId },
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: schedule.endDate },
        endDate: { gte: schedule.startDate },
      },
      select: { id: true },
    });
    if (overlap)
      throw new ConflictException(
        'A pending or approved leave request already overlaps these dates. Resolve it before filing another request.',
      );
    return database.leaveRequest.create({
      data: {
        employeeId: data.employeeId,
        leaveType: data.leaveType,
        ...schedule,
        daysCount: new Prisma.Decimal(data.daysCount),
        isPaid: data.isPaid,
        reason: data.reason,
        status: 'PENDING',
      },
    });
  }

  // Approval, debit, and the API's audit callback commit or roll back together.
  // Replays retain the original approver and never debit or audit a second time.
  async approveLeaveRequest(
    requestId: string,
    organizationId: string,
    approvedById: string,
    audit?: DecisionAudit,
    approverEmployeeId?: string,
  ) {
    return this.runDecision(async (transaction) => {
      const request = await transaction.leaveRequest.findFirst({
        where: { id: requestId, employee: { organizationId } },
      });
      if (!request) throw new NotFoundException('Leave request not found');
      if (request.status === 'APPROVED')
        return { request, newlyApproved: false };
      if (request.status !== 'PENDING')
        throw new ConflictException(
          'Only pending leave requests can be approved',
        );
      if (approverEmployeeId === request.employeeId)
        throw new ForbiddenException(
          'You cannot approve your own employee leave request',
        );
      const schedule = validateLeaveSchedule({
        ...request,
        daysCount: Number(request.daysCount),
        partialDate: request.partialDate ?? undefined,
      });
      const processed = await transaction.payrollRun.findFirst({
        where: {
          organizationId,
          cutoffSequence: { in: ['FIRST_CUTOFF', 'SECOND_CUTOFF'] },
          status: { not: 'CANCELLED' },
          cutoffStartDate: { lte: schedule.endDate },
          cutoffEndDate: { gte: schedule.startDate },
        },
        select: { id: true },
      });
      if (processed)
        throw new ConflictException(
          'These leave dates overlap a non-cancelled regular payroll run. Resolve payroll first; approval does not rewrite payslips.',
        );
      const overlap = await transaction.leaveRequest.findFirst({
        where: {
          id: { not: requestId },
          employeeId: request.employeeId,
          employee: { organizationId },
          status: 'APPROVED',
          startDate: { lte: schedule.endDate },
          endDate: { gte: schedule.startDate },
        },
        select: { id: true },
      });
      if (overlap)
        throw new ConflictException(
          'Another approved leave request overlaps these dates; reconcile the requests before approval',
        );
      const updated = await transaction.leaveRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: 'APPROVED', approvedById },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Leave request was changed while being approved',
        );
      if (request.isPaid) {
        const deducted = await transaction.leaveBalance.updateMany({
          where: {
            employeeId: request.employeeId,
            employee: { organizationId },
            leaveType: request.leaveType,
            year: schedule.startDate.getUTCFullYear(),
            balance: { gte: request.daysCount },
          },
          data: {
            usedCredits: { increment: request.daysCount },
            balance: { decrement: request.daysCount },
            revision: { increment: 1 },
          },
        });
        if (deducted.count !== 1)
          throw new ConflictException(
            'Paid leave requires an existing balance with enough available days',
          );
      }
      const approved = await transaction.leaveRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      await audit?.({ previous: request, request: approved, transaction });
      return { request: approved, newlyApproved: true };
    });
  }

  async rejectLeaveRequest(
    requestId: string,
    organizationId: string,
    rejectedById: string,
    rejectionReason: string,
    audit?: DecisionAudit,
  ) {
    return this.runDecision(async (transaction) => {
      const previous = await transaction.leaveRequest.findFirst({
        where: { id: requestId, employee: { organizationId } },
      });
      if (!previous) throw new NotFoundException('Leave request not found');
      if (previous.status === 'REJECTED')
        return { request: previous, newlyRejected: false };
      if (previous.status !== 'PENDING')
        throw new ConflictException(
          'Only pending leave requests can be rejected',
        );
      const updated = await transaction.leaveRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: 'REJECTED', rejectedById, rejectionReason },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Leave request was changed while being rejected',
        );
      const request = await transaction.leaveRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      await audit?.({ previous, request, transaction });
      return { request, newlyRejected: true };
    });
  }

  private async runDecision<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2034'
        ) {
          if (attempt < 3) continue;
          throw new ConflictException(
            'Leave decision changed concurrently; reload and retry',
          );
        }
        throw error;
      }
    }
    throw new ConflictException('Leave decision could not be completed');
  }

  // Preview only; never invent an available SIL entitlement when none is recorded.
  async calculateSilMonetization(
    employeeId: string,
    organizationId: string,
    daysToMonetize?: number,
  ) {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      include: { compensation: true },
    });
    if (!employee?.compensation)
      throw new NotFoundException('Employee or active compensation not found');
    const currentYear = new Date().getFullYear();
    const silBalance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveType_year: {
          employeeId,
          leaveType: 'SIL',
          year: currentYear,
        },
      },
    });
    if (!silBalance)
      throw new NotFoundException(
        'Recorded SIL balance not found; verified credits must be configured before previewing conversion',
      );
    const availableDays = Number(silBalance.balance);
    const requestedDays = daysToMonetize ?? availableDays;
    if (
      !Number.isFinite(requestedDays) ||
      requestedDays < 0 ||
      requestedDays > availableDays
    )
      throw new UnprocessableEntityException(
        'SIL conversion cannot exceed the recorded available balance',
      );
    return {
      employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      requestedDays,
      availableBalanceDays: availableDays,
      ...calculateSilCashConversion({
        dailyRateCents: employee.compensation.basicRateDailyCents,
        unusedLeaveDays: requestedDays,
      }),
    };
  }

  private async assertEmployeeInOrganization(
    employeeId: string,
    organizationId: string,
    database: Pick<Prisma.TransactionClient, 'employee'> = prisma,
  ): Promise<void> {
    const employee = await database.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
  }
}

export function validateLeaveSchedule(data: {
  startDate: Date;
  endDate: Date;
  daysCount: number;
  partialDate?: Date;
}) {
  const startDate = normalizeLeaveDate(data.startDate);
  const endDate = normalizeLeaveDate(data.endDate);
  if (
    startDate > endDate ||
    startDate.getUTCFullYear() !== endDate.getUTCFullYear()
  ) {
    throw new UnprocessableEntityException(
      'Leave dates must form a valid range within one calendar year; split cross-year requests',
    );
  }
  if (
    !Number.isFinite(data.daysCount) ||
    data.daysCount <= 0 ||
    !Number.isInteger(data.daysCount * 2)
  ) {
    throw new UnprocessableEntityException(
      'Leave days must be a positive multiple of 0.5',
    );
  }
  let workingDays = 0;
  for (
    let day = startDate.getTime();
    day <= endDate.getTime();
    day += 86_400_000
  ) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) workingDays++;
  }
  const partialDate =
    data.partialDate === undefined
      ? null
      : normalizeLeaveDate(data.partialDate);
  if (partialDate) {
    const weekday = partialDate.getUTCDay();
    if (
      data.daysCount !== workingDays - 0.5 ||
      weekday === 0 ||
      weekday === 6 ||
      partialDate < startDate ||
      partialDate > endDate
    ) {
      throw new UnprocessableEntityException(
        'A half-day request must be exactly one half day short of its scheduled weekdays, on a weekday inside the range',
      );
    }
  } else if (data.daysCount !== workingDays || workingDays === 0) {
    throw new UnprocessableEntityException(
      'Leave days must match the scheduled weekdays in the date range',
    );
  }
  return { startDate, endDate, partialDate };
}
function normalizeLeaveDate(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new UnprocessableEntityException('Leave dates must be valid dates');
  const year = value.getUTCFullYear();
  if (year < 1900 || year > 2100)
    throw new UnprocessableEntityException(
      'Leave dates must be between 1900 and 2100',
    );
  return new Date(Date.UTC(year, value.getUTCMonth(), value.getUTCDate()));
}
