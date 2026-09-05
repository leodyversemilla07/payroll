import { Injectable, NotFoundException } from '@nestjs/common';
import type { LoanType } from '@workspace/db';
import { prisma } from '@workspace/db';

@Injectable()
export class LoansService {
  async listAllActiveLoans(organizationId: string) {
    return prisma.employeeLoan.findMany({
      where: {
        isActive: true,
        employee: { organizationId },
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getEmployeeActiveLoans(employeeId: string, organizationId: string) {
    return prisma.employeeLoan.findMany({
      where: {
        employeeId,
        employee: { organizationId },
        isActive: true,
      },
      include: {
        payments: {
          orderBy: { paymentDate: 'desc' },
          take: 5,
        },
      },
    });
  }

  async createLoan(data: {
    employeeId: string;
    organizationId: string;
    loanType: LoanType;
    referenceNumber?: string;
    principalCents: bigint;
    totalAmountCents: bigint;
    amortizationCents: bigint;
    startDate: Date;
    endDate?: Date;
  }) {
    const employee = await prisma.employee.findFirst({
      where: {
        id: data.employeeId,
        organizationId: data.organizationId,
      },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return prisma.employeeLoan.create({
      data: {
        employeeId: data.employeeId,
        loanType: data.loanType,
        referenceNumber: data.referenceNumber,
        principalCents: data.principalCents,
        totalAmountCents: data.totalAmountCents,
        amortizationCents: data.amortizationCents,
        startDate: data.startDate,
        endDate: data.endDate,
        balanceCents: data.totalAmountCents,
        isActive: true,
      },
    });
  }
}
