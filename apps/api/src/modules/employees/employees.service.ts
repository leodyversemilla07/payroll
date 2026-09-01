import { Injectable } from "@nestjs/common";
import { prisma } from "@workspace/db";
import type { Prisma } from "@workspace/db";

@Injectable()
export class EmployeesService {
  async listEmployees(organizationId?: string) {
    return prisma.employee.findMany({
      where: organizationId ? { organizationId } : undefined,
      include: {
        department: true,
        branch: true,
        compensation: true,
        allowances: true,
      },
      orderBy: { lastName: "asc" },
    });
  }

  async getEmployeeById(id: string) {
    return prisma.employee.findUnique({
      where: { id },
      include: {
        organization: true,
        branch: true,
        department: true,
        compensation: true,
        allowances: true,
        loans: {
          where: { isActive: true },
        },
        leaveBalances: true,
      },
    });
  }

  async createEmployee(data: Prisma.EmployeeCreateInput) {
    return prisma.employee.create({
      data,
      include: {
        department: true,
        compensation: true,
      },
    });
  }

  async updateCompensation(employeeId: string, data: {
    monthlyBasicRateCents: bigint;
    dailyRateCents: bigint;
    hourlyRateCents: bigint;
    isTaxExempt?: boolean;
    customPagibigDeductionCents?: bigint;
  }) {
    return prisma.compensation.upsert({
      where: { employeeId },
      update: {
        basicRateMonthlyCents: data.monthlyBasicRateCents,
        basicRateDailyCents: data.dailyRateCents,
        basicRateHourlyCents: data.hourlyRateCents,
        isTaxExempt: data.isTaxExempt,
        customPagibigDeductionCents: data.customPagibigDeductionCents,
      },
      create: {
        employeeId,
        basicRateMonthlyCents: data.monthlyBasicRateCents,
        basicRateDailyCents: data.dailyRateCents,
        basicRateHourlyCents: data.hourlyRateCents,
        isTaxExempt: data.isTaxExempt ?? false,
        customPagibigDeductionCents: data.customPagibigDeductionCents,
      },
    });
  }
}
