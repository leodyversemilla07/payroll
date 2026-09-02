import { Injectable } from "@nestjs/common";
import { prisma } from "@workspace/db";
import type { LoanType } from "@workspace/db";

@Injectable()
export class LoansService {
  async listAllActiveLoans() {
    return prisma.employeeLoan.findMany({
      where: { isActive: true },
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
      orderBy: { createdAt: "desc" },
    });
  }

  async getEmployeeActiveLoans(employeeId: string) {
    return prisma.employeeLoan.findMany({
      where: {
        employeeId,
        isActive: true,
      },
      include: {
        payments: {
          orderBy: { paymentDate: "desc" },
          take: 5,
        },
      },
    });
  }

  async createLoan(data: {
    employeeId: string;
    loanType: LoanType;
    referenceNumber?: string;
    principalCents: bigint;
    totalAmountCents: bigint;
    amortizationCents: bigint;
    startDate: Date;
    endDate?: Date;
  }) {
    return prisma.employeeLoan.create({
      data: {
        ...data,
        balanceCents: data.totalAmountCents,
        isActive: true,
      },
    });
  }

  async recordLoanPayment(loanId: string, amountPaidCents: bigint, payslipId?: string) {
    const loan = await prisma.employeeLoan.findUniqueOrThrow({
      where: { id: loanId },
    });

    const newBalance = loan.balanceCents > amountPaidCents
      ? loan.balanceCents - amountPaidCents
      : 0n;

    const [payment] = await prisma.$transaction([
      prisma.loanPayment.create({
        data: {
          loanId,
          payslipId,
          amountPaidCents,
          balanceAfterCents: newBalance,
        },
      }),
      prisma.employeeLoan.update({
        where: { id: loanId },
        data: {
          balanceCents: newBalance,
          isActive: newBalance > 0n,
        },
      }),
    ]);

    return payment;
  }
}
