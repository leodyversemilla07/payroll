import { Injectable } from '@nestjs/common';
import { prisma } from '@workspace/db';
import {
  calculatePhilippinePayroll,
  CutoffType,
  DeMinimisCategory,
  PayBasis,
  WorkDayDivisor,
} from '@workspace/payroll-engine';
import type {
  AllowanceInput,
  LoanDeductionInput,
  PayrollCalculationInput,
} from '@workspace/payroll-engine';
import { TimekeepingService } from '../timekeeping/timekeeping.service';

@Injectable()
export class PayrollService {
  constructor(private readonly timekeepingService: TimekeepingService) {}

  async listPayrollRuns(organizationId: string) {
    return prisma.payrollRun.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: { payslips: true },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  async getPayrollRunDetails(payrollRunId: string, organizationId: string) {
    return prisma.payrollRun.findFirst({
      where: { id: payrollRunId, organizationId },
      include: {
        payslips: {
          include: {
            employee: {
              include: {
                department: true,
                branch: true,
              },
            },
          },
        },
      },
    });
  }

  async executePayrollRun(params: {
    organizationId: string;
    cutoffStartDate: Date;
    cutoffEndDate: Date;
    paymentDate: Date;
    cutoffSequence: 'FIRST_CUTOFF' | 'SECOND_CUTOFF' | 'SPECIAL_RUN';
  }) {
    // 1. Create or initialize Draft PayrollRun
    const payrollRun = await prisma.payrollRun.create({
      data: {
        organizationId: params.organizationId,
        cutoffSequence: params.cutoffSequence,
        cutoffStartDate: params.cutoffStartDate,
        cutoffEndDate: params.cutoffEndDate,
        paymentDate: params.paymentDate,
        status: 'PROCESSING',
      },
    });

    // 2. Fetch all active employees
    const employees = await prisma.employee.findMany({
      where: {
        organizationId: params.organizationId,
        employmentStatus: 'ACTIVE',
      },
      include: {
        compensation: true,
        allowances: {
          where: { isActive: true },
        },
        loans: {
          where: { isActive: true },
        },
      },
    });

    let runTotalGross = 0n;
    let runTotalDeductions = 0n;
    let runTotalNet = 0n;
    let runTotalEmployerCost = 0n;

    // 3. Process calculations for each employee
    for (const emp of employees) {
      if (!emp.compensation) continue;

      const attendanceSummary =
        await this.timekeepingService.getCutoffAttendanceSummary(
          emp.id,
          params.organizationId,
          params.cutoffStartDate,
          params.cutoffEndDate,
        );

      const allowances: AllowanceInput[] = emp.allowances.map((a) => ({
        name: a.name,
        amountCents: a.amountCents,
        isTaxable: a.type === 'TAXABLE',
        deMinimisCategory: a.deMinimisCategory
          ? DeMinimisCategory[a.deMinimisCategory]
          : undefined,
      }));

      const loans: LoanDeductionInput[] = emp.loans.map((l) => ({
        loanId: l.id,
        name: l.loanType,
        amountCents:
          l.amortizationCents > l.balanceCents
            ? l.balanceCents
            : l.amortizationCents,
      }));

      const calcInput: PayrollCalculationInput = {
        cutoffType:
          params.cutoffSequence === 'FIRST_CUTOFF'
            ? CutoffType.FIRST_CUTOFF
            : CutoffType.SECOND_CUTOFF,
        schedule: {
          deductSssIn: 'FIRST_CUTOFF',
          deductPhilhealthIn: 'FIRST_CUTOFF',
          deductPagibigIn: 'FIRST_CUTOFF',
          deductTaxIn: 'SECOND_CUTOFF',
        },
        compensation: {
          payBasis: emp.payBasis as unknown as PayBasis,
          monthlyBasicRateCents: emp.compensation.basicRateMonthlyCents,
          dailyRateCents: emp.compensation.basicRateDailyCents,
          hourlyRateCents: emp.compensation.basicRateHourlyCents,
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: emp.compensation.isTaxExempt,
          customPagibigDeductionCents:
            emp.compensation.customPagibigDeductionCents ?? undefined,
        },
        attendance: attendanceSummary,
        allowances,
        loans,
      };

      const result = calculatePhilippinePayroll(calcInput);

      // Create Payslip record
      const payslip = await prisma.payslip.create({
        data: {
          payrollRunId: payrollRun.id,
          employeeId: emp.id,
          basicPayCents: result.basicPayForPeriodCents,
          overtimePayCents: result.overtimePayCents,
          nightDiffPayCents: result.nightDiffPayCents,
          holidayPayCents: result.holidayPayCents,
          restDayPayCents: result.restDayPayCents,
          taxableAllowancesCents: result.taxableAllowancesCents,
          nonTaxableAllowancesCents: result.nonTaxableAllowancesCents,
          grossPayCents: result.grossPayCents,
          tardinessDeductionCents: result.tardinessDeductionCents,
          undertimeDeductionCents: result.undertimeDeductionCents,
          absenceDeductionCents: result.absenceDeductionCents,
          sssEmployeeCents: result.sssContribution.employeeShareCents,
          sssWispEmployeeCents: result.sssContribution.wispEmployeeCents ?? 0n,
          philhealthEmployeeCents:
            result.philhealthContribution.employeeShareCents,
          pagibigEmployeeCents: result.pagibigContribution.employeeShareCents,
          withholdingTaxCents: result.withholdingTaxCents,
          sssEmployerCents: result.sssContribution.employerShareCents,
          sssWispEmployerCents: result.sssContribution.wispEmployerCents ?? 0n,
          sssECCents: result.sssContribution.ecShareCents ?? 0n,
          philhealthEmployerCents:
            result.philhealthContribution.employerShareCents,
          pagibigEmployerCents: result.pagibigContribution.employerShareCents,
          loanDeductionsCents: result.loanDeductionsCents,
          otherDeductionsCents: result.otherDeductionsCents,
          totalDeductionsCents: result.totalDeductionsCents,
          netPayCents: result.netPayCents,
          thirteenthMonthAccrualCents: result.thirteenthMonthAccrualCents,
        },
      });

      // Update loan amortization balances
      for (const l of loans) {
        if (l.amountCents > 0n) {
          const matchedLoan = emp.loans.find((orig) => orig.id === l.loanId);
          if (matchedLoan) {
            const newBal =
              matchedLoan.balanceCents > l.amountCents
                ? matchedLoan.balanceCents - l.amountCents
                : 0n;
            await prisma.loanPayment.create({
              data: {
                loanId: l.loanId,
                payslipId: payslip.id,
                amountPaidCents: l.amountCents,
                balanceAfterCents: newBal,
              },
            });
            await prisma.employeeLoan.update({
              where: { id: l.loanId },
              data: {
                balanceCents: newBal,
                isActive: newBal > 0n,
              },
            });
          }
        }
      }

      runTotalGross += result.grossPayCents;
      runTotalDeductions += result.totalDeductionsCents;
      runTotalNet += result.netPayCents;
      runTotalEmployerCost += result.totalStatutoryEmployerCents;
    }

    // 4. Update finalized totals on PayrollRun
    return prisma.payrollRun.update({
      where: { id: payrollRun.id },
      data: {
        totalGrossCents: runTotalGross,
        totalDeductionsCents: runTotalDeductions,
        totalNetCents: runTotalNet,
        totalEmployerCostCents: runTotalEmployerCost,
        status: 'AUDITED',
      },
      include: {
        payslips: true,
      },
    });
  }
}
