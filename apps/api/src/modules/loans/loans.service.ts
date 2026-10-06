import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LoanType, Prisma } from '@workspace/db';
import { prisma } from '@workspace/db';

export interface ListLoansFilter {
  status?: 'ACTIVE' | 'PAID' | 'ALL';
  loanType?: LoanType;
  employeeId?: string;
  search?: string;
}

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
            department: {
              select: { name: true },
            },
          },
        },
        _count: {
          select: { payments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listLoans(organizationId: string, filter?: ListLoansFilter) {
    const where: Prisma.EmployeeLoanWhereInput = {
      employee: { organizationId },
    };

    if (filter?.status === 'ACTIVE') {
      where.isActive = true;
    } else if (filter?.status === 'PAID') {
      where.isActive = false;
    }

    if (filter?.loanType) {
      where.loanType = filter.loanType;
    }

    if (filter?.employeeId) {
      where.employeeId = filter.employeeId;
    }

    if (filter?.search?.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { employee: { firstName: { contains: q, mode: 'insensitive' } } },
        { employee: { lastName: { contains: q, mode: 'insensitive' } } },
        { employee: { employeeNumber: { contains: q, mode: 'insensitive' } } },
        { referenceNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    return prisma.employeeLoan.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: {
              select: { name: true },
            },
          },
        },
        _count: {
          select: { payments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLoanSummary(organizationId: string) {
    const [activeLoans, allLoans] = await Promise.all([
      prisma.employeeLoan.aggregate({
        where: {
          employee: { organizationId },
          isActive: true,
        },
        _count: true,
        _sum: {
          balanceCents: true,
          principalCents: true,
          amortizationCents: true,
        },
      }),
      prisma.employeeLoan.count({
        where: {
          employee: { organizationId },
        },
      }),
    ]);

    return {
      activeCount: activeLoans._count,
      totalCount: allLoans,
      totalBalanceCents: activeLoans._sum.balanceCents ?? 0n,
      totalPrincipalCents: activeLoans._sum.principalCents ?? 0n,
      totalAmortizationPerCutoffCents: activeLoans._sum.amortizationCents ?? 0n,
    };
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

  async getLoanDetails(loanId: string, organizationId: string) {
    const loan = await prisma.employeeLoan.findFirst({
      where: {
        id: loanId,
        employee: { organizationId },
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: {
              select: { name: true },
            },
          },
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
          include: {
            payslip: {
              select: {
                id: true,
                payrollRun: {
                  select: {
                    id: true,
                    cutoffStartDate: true,
                    cutoffEndDate: true,
                    cutoffSequence: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    return loan;
  }

  async getMyLoans(employeeId: string, organizationId: string) {
    return prisma.employeeLoan.findMany({
      where: {
        employeeId,
        employee: { organizationId },
      },
      include: {
        payments: {
          orderBy: { paymentDate: 'desc' },
          include: {
            payslip: {
              select: {
                id: true,
                payrollRun: {
                  select: {
                    id: true,
                    cutoffStartDate: true,
                    cutoffEndDate: true,
                    cutoffSequence: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
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
    });
  }

  async recordManualPayment(data: {
    loanId: string;
    organizationId: string;
    amountCents: bigint;
  }) {
    if (data.amountCents <= 0n) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    return prisma.$transaction(async (tx) => {
      const loan = await tx.employeeLoan.findFirst({
        where: {
          id: data.loanId,
          employee: { organizationId: data.organizationId },
        },
      });

      if (!loan) {
        throw new NotFoundException('Loan not found');
      }

      if (loan.balanceCents <= 0n || !loan.isActive) {
        throw new BadRequestException(
          'Loan is already fully settled or inactive',
        );
      }

      if (data.amountCents > loan.balanceCents) {
        throw new BadRequestException(
          'Payment amount exceeds remaining balance',
        );
      }

      const balanceAfterCents = loan.balanceCents - data.amountCents;
      const isActive = balanceAfterCents > 0n;

      const [updatedLoan, payment] = await Promise.all([
        tx.employeeLoan.update({
          where: { id: loan.id },
          data: {
            balanceCents: balanceAfterCents,
            isActive,
          },
        }),
        tx.loanPayment.create({
          data: {
            loanId: loan.id,
            amountPaidCents: data.amountCents,
            balanceAfterCents,
          },
        }),
      ]);

      return {
        loan: updatedLoan,
        payment,
      };
    });
  }

  async deactivateLoan(loanId: string, organizationId: string) {
    const loan = await prisma.employeeLoan.findFirst({
      where: {
        id: loanId,
        employee: { organizationId },
      },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    return prisma.employeeLoan.update({
      where: { id: loan.id },
      data: { isActive: false },
    });
  }
}
