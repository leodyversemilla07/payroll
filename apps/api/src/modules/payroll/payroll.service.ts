import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, prisma } from '@workspace/db';
import type {
  AllowanceInput,
  LoanDeductionInput,
  PayrollCalculationInput,
} from '@workspace/payroll-engine';
import {
  CutoffType,
  calculatePhilippinePayroll,
  DeMinimisCategory,
  PayBasis,
  WorkDayDivisor,
} from '@workspace/payroll-engine';
import { TimekeepingService } from '../timekeeping/timekeeping.service';

const PAYROLL_TRANSACTION_RETRIES = 3;

interface ExecutePayrollRunParams {
  organizationId: string;
  processedById: string;
  cutoffStartDate: Date;
  cutoffEndDate: Date;
  paymentDate: Date;
  cutoffSequence: 'FIRST_CUTOFF' | 'SECOND_CUTOFF' | 'SPECIAL_RUN';
}

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

  async executePayrollRun(params: ExecutePayrollRunParams) {
    const normalized = this.validateAndNormalizeRun(params);

    for (let attempt = 1; attempt <= PAYROLL_TRANSACTION_RETRIES; attempt++) {
      try {
        return await prisma.$transaction(
          (transaction) => this.executeInTransaction(transaction, normalized),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 120_000,
          },
        );
      } catch (error) {
        if (isPrismaError(error, 'P2034')) {
          if (attempt < PAYROLL_TRANSACTION_RETRIES) continue;
          throw new ConflictException(
            'Payroll data changed concurrently; retry the payroll run',
          );
        }

        if (isPrismaError(error, 'P2002')) {
          return this.resolveExistingRun(normalized);
        }

        throw error;
      }
    }

    throw new ConflictException('Payroll run could not be completed');
  }

  private async executeInTransaction(
    transaction: Prisma.TransactionClient,
    params: ExecutePayrollRunParams,
  ) {
    const existing = await transaction.payrollRun.findUnique({
      where: payrollRunKey(params),
      include: { payslips: true },
    });

    if (existing) return this.assertIdempotentMatch(existing, params);

    const payrollRun = await transaction.payrollRun.create({
      data: {
        organizationId: params.organizationId,
        processedById: params.processedById,
        cutoffSequence: params.cutoffSequence,
        cutoffStartDate: params.cutoffStartDate,
        cutoffEndDate: params.cutoffEndDate,
        paymentDate: params.paymentDate,
        status: 'PROCESSING',
      },
    });

    const employees = await transaction.employee.findMany({
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

    if (employees.length === 0) {
      throw new UnprocessableEntityException(
        'Payroll cannot proceed without active employees',
      );
    }

    const missingCompensation = employees.filter(
      (employee) => !employee.compensation,
    );
    if (missingCompensation.length > 0) {
      throw new UnprocessableEntityException(
        `Payroll cannot proceed: ${missingCompensation.length} active employee(s) have no compensation profile`,
      );
    }

    let runTotalGross = 0n;
    let runTotalDeductions = 0n;
    let runTotalNet = 0n;
    let runTotalEmployerCost = 0n;

    for (const employee of employees) {
      const compensation = employee.compensation;
      if (!compensation) {
        throw new UnprocessableEntityException(
          `Employee ${employee.employeeNumber} has no compensation profile`,
        );
      }

      this.assertValidCompensation(employee.employeeNumber, {
        payBasis: employee.payBasis,
        monthlyRate: compensation.basicRateMonthlyCents,
        dailyRate: compensation.basicRateDailyCents,
        hourlyRate: compensation.basicRateHourlyCents,
      });

      const attendanceSummary =
        await this.timekeepingService.getCutoffAttendanceSummary(
          employee.id,
          params.organizationId,
          params.cutoffStartDate,
          params.cutoffEndDate,
          transaction,
        );

      const allowances: AllowanceInput[] = employee.allowances.map(
        (allowance) => ({
          name: allowance.name,
          amountCents: allowance.amountCents,
          isTaxable: allowance.type === 'TAXABLE',
          deMinimisCategory: allowance.deMinimisCategory
            ? DeMinimisCategory[allowance.deMinimisCategory]
            : undefined,
        }),
      );

      const loans: LoanDeductionInput[] = employee.loans.map((loan) => ({
        loanId: loan.id,
        name: loan.loanType,
        amountCents:
          loan.amortizationCents > loan.balanceCents
            ? loan.balanceCents
            : loan.amortizationCents,
      }));

      // Year-to-date de minimis excess already counted toward the PHP 90,000
      // annual bucket, keyed to the cutoff's tax year. Payslips predating
      // the bucket-excess column contribute zero, so usage starts from that
      // migration forward and converges at year-end annualization.
      const bucketYearStart = new Date(
        Date.UTC(params.cutoffEndDate.getUTCFullYear(), 0, 1),
      );
      const bucketYearEnd = new Date(
        Date.UTC(params.cutoffEndDate.getUTCFullYear() + 1, 0, 1),
      );
      const ytdBucket = await transaction.payslip.aggregate({
        _sum: { deMinimisExcessCents: true },
        where: {
          employeeId: employee.id,
          payrollRun: {
            cutoffEndDate: { gte: bucketYearStart, lt: bucketYearEnd },
          },
        },
      });

      const calculationInput: PayrollCalculationInput = {
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
          payBasis: PayBasis[employee.payBasis],
          monthlyBasicRateCents: compensation.basicRateMonthlyCents,
          dailyRateCents: compensation.basicRateDailyCents,
          hourlyRateCents: compensation.basicRateHourlyCents,
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: compensation.isTaxExempt,
          customPagibigDeductionCents:
            compensation.customPagibigDeductionCents ?? undefined,
        },
        attendance: attendanceSummary,
        allowances,
        loans,
        ytdOtherBenefitsCents:
          ytdBucket._sum.deMinimisExcessCents ?? 0n,
        // 13th-month/bonus disbursements have no dedicated run type yet;
        // once they do, their bucket share is passed here so payouts share
        // the PHP 90,000 cap with de minimis excess.
        periodBonusesCents: 0n,
      };

      const result = calculatePhilippinePayroll(calculationInput);
      const payslip = await transaction.payslip.create({
        data: {
          payrollRunId: payrollRun.id,
          employeeId: employee.id,
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
          deMinimisExcessCents: result.deMinimisExcessTaxableCents,
        },
      });

      for (const loan of employee.loans) {
        const deduction = loans.find((item) => item.loanId === loan.id);
        if (!deduction || deduction.amountCents <= 0n) continue;

        const balanceAfterCents = loan.balanceCents - deduction.amountCents;
        const update = await transaction.employeeLoan.updateMany({
          where: {
            id: loan.id,
            employeeId: employee.id,
            isActive: true,
            balanceCents: loan.balanceCents,
          },
          data: {
            balanceCents: balanceAfterCents,
            isActive: balanceAfterCents > 0n,
          },
        });

        if (update.count !== 1) {
          throw new ConflictException(
            `Loan ${loan.id} changed while payroll was processing`,
          );
        }

        await transaction.loanPayment.create({
          data: {
            loanId: loan.id,
            payslipId: payslip.id,
            amountPaidCents: deduction.amountCents,
            balanceAfterCents,
          },
        });
      }

      runTotalGross += result.grossPayCents;
      runTotalDeductions += result.totalDeductionsCents;
      runTotalNet += result.netPayCents;
      runTotalEmployerCost += result.totalStatutoryEmployerCents;
    }

    return transaction.payrollRun.update({
      where: { id: payrollRun.id },
      data: {
        totalGrossCents: runTotalGross,
        totalDeductionsCents: runTotalDeductions,
        totalNetCents: runTotalNet,
        totalEmployerCostCents: runTotalEmployerCost,
        status: 'AUDITED',
      },
      include: { payslips: true },
    });
  }

  private validateAndNormalizeRun(
    params: ExecutePayrollRunParams,
  ): ExecutePayrollRunParams {
    const normalized = {
      ...params,
      cutoffStartDate: normalizeDate(params.cutoffStartDate),
      cutoffEndDate: normalizeDate(params.cutoffEndDate),
      paymentDate: normalizeDate(params.paymentDate),
    };

    if (normalized.cutoffStartDate > normalized.cutoffEndDate) {
      throw new BadRequestException(
        'Cutoff start date must not be after cutoff end date',
      );
    }
    if (normalized.paymentDate < normalized.cutoffEndDate) {
      throw new BadRequestException(
        'Payment date must not be before cutoff end date',
      );
    }
    if (normalized.cutoffSequence === 'SPECIAL_RUN') {
      throw new UnprocessableEntityException(
        'Special payroll runs require a dedicated earning type and calculator',
      );
    }

    return normalized;
  }

  private async resolveExistingRun(params: ExecutePayrollRunParams) {
    const existing = await prisma.payrollRun.findUnique({
      where: payrollRunKey(params),
      include: { payslips: true },
    });

    if (!existing) {
      throw new ConflictException(
        'A conflicting payroll operation is already in progress',
      );
    }

    return this.assertIdempotentMatch(existing, params);
  }

  private assertIdempotentMatch<
    T extends { status: string; paymentDate: Date },
  >(existing: T, params: ExecutePayrollRunParams): T {
    if (existing.paymentDate.getTime() !== params.paymentDate.getTime()) {
      throw new ConflictException(
        'A payroll run already exists for this cutoff with a different payment date',
      );
    }
    if (existing.status === 'PROCESSING' || existing.status === 'DRAFT') {
      throw new ConflictException(
        'A payroll run for this cutoff is already being processed',
      );
    }
    if (existing.status === 'CANCELLED') {
      throw new ConflictException(
        'The payroll run for this cutoff was cancelled and cannot be reused',
      );
    }

    return existing;
  }

  private assertValidCompensation(
    employeeNumber: string,
    compensation: {
      payBasis: 'MONTHLY' | 'DAILY' | 'HOURLY';
      monthlyRate: bigint;
      dailyRate: bigint;
      hourlyRate: bigint;
    },
  ): void {
    const rateIsInvalid =
      compensation.monthlyRate <= 0n ||
      (compensation.payBasis === 'DAILY' && compensation.dailyRate <= 0n) ||
      (compensation.payBasis === 'HOURLY' && compensation.hourlyRate <= 0n);

    if (rateIsInvalid) {
      throw new UnprocessableEntityException(
        `Employee ${employeeNumber} has an invalid compensation rate`,
      );
    }
  }
}

function payrollRunKey(params: ExecutePayrollRunParams) {
  return {
    organizationId_cutoffStartDate_cutoffEndDate_cutoffSequence: {
      organizationId: params.organizationId,
      cutoffStartDate: params.cutoffStartDate,
      cutoffEndDate: params.cutoffEndDate,
      cutoffSequence: params.cutoffSequence,
    },
  } as const;
}

function normalizeDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException('Payroll dates must be valid dates');
  }

  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
