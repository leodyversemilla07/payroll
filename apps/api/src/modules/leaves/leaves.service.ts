import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@workspace/db';
import { calculateSilCashConversion } from '@workspace/payroll-engine';

@Injectable()
export class LeavesService {
  /**
   * Retrieves all leave balances for an employee in the specified year.
   */
  async getEmployeeLeaveBalances(
    employeeId: string,
    organizationId: string,
    year = new Date().getFullYear(),
  ) {
    await this.assertEmployeeInOrganization(employeeId, organizationId);

    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId, employee: { organizationId }, year },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
          },
        },
      },
    });

    if (balances.length === 0) {
      // Seed default statutory balances: SIL (5 days), VL (10 days), SL (5 days)
      const defaultTypes = [
        { type: 'SIL', credits: 5 },
        { type: 'VACATION', credits: 10 },
        { type: 'SICK', credits: 5 },
      ];

      for (const item of defaultTypes) {
        await prisma.leaveBalance.upsert({
          where: {
            employeeId_leaveType_year: {
              employeeId,
              leaveType: item.type,
              year,
            },
          },
          update: {},
          create: {
            employeeId,
            leaveType: item.type,
            year,
            totalCredits: new Prisma.Decimal(item.credits),
            usedCredits: new Prisma.Decimal(0),
            balance: new Prisma.Decimal(item.credits),
          },
        });
      }

      return prisma.leaveBalance.findMany({
        where: { employeeId, year },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
            },
          },
        },
      });
    }

    return balances;
  }

  /**
   * Submits a leave request.
   */
  async fileLeaveRequest(data: {
    employeeId: string;
    organizationId: string;
    leaveType: string;
    startDate: Date;
    endDate: Date;
    daysCount: number;
    isPaid: boolean;
    reason: string;
  }) {
    await this.assertEmployeeInOrganization(
      data.employeeId,
      data.organizationId,
    );

    return prisma.leaveRequest.create({
      data: {
        employeeId: data.employeeId,
        leaveType: data.leaveType,
        startDate: data.startDate,
        endDate: data.endDate,
        daysCount: new Prisma.Decimal(data.daysCount),
        isPaid: data.isPaid,
        reason: data.reason,
        status: 'PENDING',
      },
    });
  }

  /**
   * Approves a leave request and deducts from employee's leave balance.
   */
  async approveLeaveRequest(
    requestId: string,
    organizationId: string,
    approvedById: string,
  ) {
    const request = await prisma.leaveRequest.findFirst({
      where: { id: requestId, employee: { organizationId } },
    });

    if (!request) {
      throw new NotFoundException(`Leave request ${requestId} not found`);
    }

    const year = request.startDate.getFullYear();

    // Deduct from balance if paid
    if (request.isPaid) {
      const balanceRecord = await prisma.leaveBalance.findUnique({
        where: {
          employeeId_leaveType_year: {
            employeeId: request.employeeId,
            leaveType: request.leaveType,
            year,
          },
        },
      });

      if (balanceRecord) {
        const days = Number(request.daysCount);
        const newUsed = Number(balanceRecord.usedCredits) + days;
        const newBalance = Math.max(
          0,
          Number(balanceRecord.totalCredits) - newUsed,
        );

        await prisma.leaveBalance.update({
          where: { id: balanceRecord.id },
          data: {
            usedCredits: new Prisma.Decimal(newUsed),
            balance: new Prisma.Decimal(newBalance),
          },
        });
      }
    }

    return prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        approvedById,
      },
    });
  }

  /**
   * Computes DOLE Service Incentive Leave (SIL) cash monetization for an employee.
   */
  async calculateSilMonetization(
    employeeId: string,
    organizationId: string,
    daysToMonetize?: number,
  ) {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      include: {
        compensation: true,
      },
    });

    if (!employee || !employee.compensation) {
      throw new NotFoundException(
        `Employee ${employeeId} or active compensation not found`,
      );
    }

    const dailyRateCents = employee.compensation.basicRateDailyCents;

    // Fetch current SIL balance
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

    const availableDays = silBalance ? Number(silBalance.balance) : 5.0;
    const requestedDays =
      daysToMonetize !== undefined ? daysToMonetize : availableDays;

    const conversion = calculateSilCashConversion({
      dailyRateCents,
      unusedLeaveDays: requestedDays,
    });

    return {
      employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      requestedDays,
      availableBalanceDays: availableDays,
      ...conversion,
    };
  }

  private async assertEmployeeInOrganization(
    employeeId: string,
    organizationId: string,
  ): Promise<void> {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
  }
}
