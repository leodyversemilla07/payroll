import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type PayrollRun, Prisma, prisma } from '@workspace/db';
import type {
  LoanDeductionInput,
  PayrollCalculationInput,
} from '@workspace/payroll-engine';
import {
  allocateNinetiethBucket,
  CutoffType,
  calculateEmployee13thMonth,
  calculateMonthsWorkedInYear,
  calculatePhilippinePayroll,
  calculateWithholdingTax,
  InsufficientPayError,
  PayBasis,
  WorkDayDivisor,
} from '@workspace/payroll-engine';
import { TimekeepingService } from '../timekeeping/timekeeping.service';
import {
  isStandardRegularCutoff,
  resolveCutoffAllowances,
  selectCutoffLoans,
} from './payroll.inputs';

const PAYROLL_TRANSACTION_RETRIES = 3;

export type PayrollMutationAudit = (data: {
  previous: PayrollRun | null;
  run: PayrollRun;
  transaction: Prisma.TransactionClient;
}) => Promise<void>;

interface ExecutePayrollRunParams {
  organizationId: string;
  processedById: string;
  cutoffStartDate: Date;
  cutoffEndDate: Date;
  paymentDate: Date;
  cutoffSequence: 'FIRST_CUTOFF' | 'SECOND_CUTOFF' | 'SPECIAL_RUN';
}

interface ExecuteThirteenthMonthRunParams {
  organizationId: string;
  processedById: string;
  cutoffStartDate: Date;
  cutoffEndDate: Date;
  paymentDate: Date;
}

export type PayrollRunAction = 'APPROVE' | 'DISBURSE' | 'CANCEL';

const PAYROLL_TRANSITIONS: Record<PayrollRunAction, readonly string[]> = {
  APPROVE: ['AUDITED'],
  DISBURSE: ['APPROVED'],
  CANCEL: ['DRAFT', 'PROCESSING', 'AUDITED', 'APPROVED'],
};

/**
 * Guards the payroll run lifecycle. Disbursed money cannot be un-disbursed
 * through this path; cancel first, then re-run.
 */
export function assertValidPayrollTransition(
  currentStatus: string,
  action: PayrollRunAction,
): void {
  if (!PAYROLL_TRANSITIONS[action].includes(currentStatus)) {
    throw new ConflictException(
      `Payroll run cannot be ${action.toLowerCase()}d from status ${currentStatus}`,
    );
  }
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
      select: {
        id: true,
        cutoffSequence: true,
        cutoffStartDate: true,
        cutoffEndDate: true,
        paymentDate: true,
        status: true,
        totalGrossCents: true,
        totalDeductionsCents: true,
        totalNetCents: true,
        payslips: {
          select: {
            id: true,
            employeeId: true,
            employee: {
              select: { employeeNumber: true, firstName: true, lastName: true },
            },
            basicPayCents: true,
            paidLeavePayCents: true,
            overtimePayCents: true,
            nightDiffPayCents: true,
            holidayPayCents: true,
            restDayPayCents: true,
            taxableAllowancesCents: true,
            nonTaxableAllowancesCents: true,
            grossPayCents: true,
            tardinessDeductionCents: true,
            undertimeDeductionCents: true,
            absenceDeductionCents: true,
            sssEmployeeCents: true,
            sssWispEmployeeCents: true,
            philhealthEmployeeCents: true,
            pagibigEmployeeCents: true,
            withholdingTaxCents: true,
            loanDeductionsCents: true,
            otherDeductionsCents: true,
            totalDeductionsCents: true,
            netPayCents: true,
            bonusPaidCents: true,
          },
          orderBy: { employee: { employeeNumber: 'asc' } },
        },
      },
    });
  }

  async getEmployeePayslips(employeeId: string, organizationId: string) {
    return prisma.payslip.findMany({
      where: {
        employeeId,
        payrollRun: {
          organizationId,
          status: { in: ['APPROVED', 'DISBURSED'] },
        },
      },
      include: {
        payrollRun: {
          select: {
            id: true,
            cutoffSequence: true,
            cutoffStartDate: true,
            cutoffEndDate: true,
            paymentDate: true,
            status: true,
          },
        },
      },
      orderBy: { payrollRun: { paymentDate: 'desc' } },
    });
  }

  async getEmployeePayslipById(
    payslipId: string,
    employeeId: string,
    organizationId: string,
  ) {
    return prisma.payslip.findFirst({
      where: {
        id: payslipId,
        employeeId,
        payrollRun: {
          organizationId,
          status: { in: ['APPROVED', 'DISBURSED'] },
        },
      },
      include: {
        payrollRun: {
          select: {
            id: true,
            cutoffSequence: true,
            cutoffStartDate: true,
            cutoffEndDate: true,
            paymentDate: true,
            status: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            tin: true,
            sssNo: true,
            philhealthNo: true,
            pagibigNo: true,
            branch: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
    });
  }

  /**
   * Approves an audited run for disbursement: the checker step of
   * maker-checker. The approver must differ from the processor.
   */
  async approvePayrollRun(
    params: {
      runId: string;
      organizationId: string;
      approvedById: string;
    },
    audit?: PayrollMutationAudit,
  ) {
    return this.runLifecycleTransaction(async (transaction) => {
      const run = await transaction.payrollRun.findFirst({
        where: { id: params.runId, organizationId: params.organizationId },
      });
      if (!run) {
        throw new NotFoundException('Payroll run not found');
      }
      assertValidPayrollTransition(run.status, 'APPROVE');
      if (run.processedById === params.approvedById) {
        throw new ForbiddenException(
          'The approver must differ from the employee who processed the run (maker-checker)',
        );
      }
      const changed = await transaction.payrollRun.updateMany({
        where: {
          id: run.id,
          organizationId: params.organizationId,
          status: 'AUDITED',
          processedById: run.processedById,
        },
        data: { status: 'APPROVED', approvedById: params.approvedById },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'Payroll run changed before approval; reload the run',
        );
      }
      const approved = await transaction.payrollRun.findUniqueOrThrow({
        where: { id: run.id },
        include: { payslips: true },
      });
      await audit?.({ previous: run, run: approved, transaction });
      return approved;
    });
  }

  /** Disburses an approved run: the point of no return for cancellation. */
  async disbursePayrollRun(
    params: { runId: string; organizationId: string },
    audit?: PayrollMutationAudit,
  ) {
    return this.runLifecycleTransaction(async (transaction) => {
      const run = await transaction.payrollRun.findFirst({
        where: { id: params.runId, organizationId: params.organizationId },
      });
      if (!run) {
        throw new NotFoundException('Payroll run not found');
      }
      assertValidPayrollTransition(run.status, 'DISBURSE');
      const changed = await transaction.payrollRun.updateMany({
        where: {
          id: run.id,
          organizationId: params.organizationId,
          status: 'APPROVED',
        },
        data: { status: 'DISBURSED' },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'Payroll run changed before disbursement; reload the run',
        );
      }
      const disbursed = await transaction.payrollRun.findUniqueOrThrow({
        where: { id: run.id },
        include: { payslips: true },
      });
      await audit?.({ previous: run, run: disbursed, transaction });
      return disbursed;
    });
  }

  private async runLifecycleTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= PAYROLL_TRANSACTION_RETRIES; attempt++) {
      try {
        return await prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (isPrismaError(error, 'P2034')) {
          if (attempt < PAYROLL_TRANSACTION_RETRIES) continue;
          throw new ConflictException(
            'Payroll run changed concurrently; reload and retry',
          );
        }
        throw error;
      }
    }
    throw new ConflictException('Payroll transition could not be completed');
  }

  /**
   * Cancels a run and reverses everything it posted: loan amortization is
   * credited back (every payment row implies a previously active loan, so
   * reactivation is an exact reversal), then payments, payslips, and the
   * run row itself are removed so the cutoff can be re-run cleanly and
   * later year-to-date bucket accounting stays exact. The audit log keeps
   * the full trail. Blocked past disbursement, and blocked when a later
   * run already builds on this one — cancel the later run first.
   * (Bank transmittal batches, once persisted, must additionally be voided
   * here before the run row is removed.)
   */
  async cancelPayrollRun(
    params: { runId: string; organizationId: string },
    audit?: PayrollMutationAudit,
  ) {
    for (let attempt = 1; attempt <= PAYROLL_TRANSACTION_RETRIES; attempt++) {
      try {
        return await prisma.$transaction(
          async (transaction) => {
            const run = await transaction.payrollRun.findFirst({
              where: {
                id: params.runId,
                organizationId: params.organizationId,
              },
              include: { payslips: true },
            });
            if (!run) {
              throw new NotFoundException('Payroll run not found');
            }
            assertValidPayrollTransition(run.status, 'CANCEL');

            // Later regular runs depend on earlier monthly withholding. A special
            // payout also depends on all earlier basic earnings and bucket usage:
            // cancelling its source regular run would leave an overpaid 13th month.
            // Cancel dependent (not yet disbursed) runs in reverse order first.
            const isSpecialRun = run.cutoffSequence === 'SPECIAL_RUN';
            const runYear = run.cutoffEndDate.getUTCFullYear();
            const laterRun = await transaction.payrollRun.findFirst({
              where: {
                organizationId: params.organizationId,
                id: { not: run.id },
                status: { not: 'CANCELLED' },
                OR: isSpecialRun
                  ? [
                      {
                        cutoffEndDate: {
                          gt: run.cutoffEndDate,
                          lt: new Date(Date.UTC(runYear + 1, 0, 1)),
                        },
                      },
                    ]
                  : [
                      {
                        cutoffSequence: { not: 'SPECIAL_RUN' },
                        cutoffEndDate: { gt: run.cutoffEndDate },
                      },
                      {
                        cutoffSequence: 'SPECIAL_RUN',
                        cutoffEndDate: {
                          gte: run.cutoffEndDate,
                          lt: new Date(Date.UTC(runYear + 1, 0, 1)),
                        },
                      },
                    ],
              },
              select: { id: true },
            });
            if (laterRun) {
              throw new ConflictException(
                'A later payroll run already builds on this run; cancel the later run first',
              );
            }

            const claimed = await transaction.payrollRun.updateMany({
              where: {
                id: run.id,
                organizationId: params.organizationId,
                status: run.status,
              },
              data: { status: 'CANCELLED' },
            });
            if (claimed.count !== 1) {
              throw new ConflictException(
                'Payroll run changed before cancellation; reload the run',
              );
            }

            const loanPayments = await transaction.loanPayment.findMany({
              where: { payslip: { payrollRunId: run.id } },
              select: { loanId: true, amountPaidCents: true },
            });
            for (const payment of loanPayments) {
              const restored = await transaction.employeeLoan.updateMany({
                where: { id: payment.loanId },
                data: {
                  balanceCents: { increment: payment.amountPaidCents },
                  isActive: true,
                },
              });
              if (restored.count !== 1) {
                throw new ConflictException(
                  `Loan ${payment.loanId} changed while the run was being cancelled`,
                );
              }
            }
            await transaction.loanPayment.deleteMany({
              where: { payslip: { payrollRunId: run.id } },
            });
            await transaction.payslip.deleteMany({
              where: { payrollRunId: run.id },
            });
            await transaction.payrollRun.delete({ where: { id: run.id } });

            // Preserve the run and payslip snapshot even though cancellation
            // removes the posted rows. Audit failure rolls back reversals too.
            await audit?.({
              previous: run,
              run: { ...run, status: 'CANCELLED' },
              transaction,
            });

            return { success: true, runId: run.id };
          },
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
            'Payroll data changed concurrently; retry cancellation',
          );
        }
        throw error;
      }
    }
    throw new ConflictException('Payroll run could not be cancelled');
  }

  async executePayrollRun(
    params: ExecutePayrollRunParams,
    audit?: PayrollMutationAudit,
  ) {
    const normalized = this.validateAndNormalizeRun(params);

    for (let attempt = 1; attempt <= PAYROLL_TRANSACTION_RETRIES; attempt++) {
      try {
        return await prisma.$transaction(
          (transaction) =>
            this.executeInTransaction(transaction, normalized, audit),
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
    audit?: PayrollMutationAudit,
  ) {
    const existing = await transaction.payrollRun.findUnique({
      where: payrollRunKey(params),
      include: { payslips: true },
    });

    if (existing) return this.assertIdempotentMatch(existing, params);

    const monthStart = new Date(
      Date.UTC(
        params.cutoffEndDate.getUTCFullYear(),
        params.cutoffEndDate.getUTCMonth(),
        1,
      ),
    );
    const nextMonth = new Date(
      Date.UTC(
        params.cutoffEndDate.getUTCFullYear(),
        params.cutoffEndDate.getUTCMonth() + 1,
        1,
      ),
    );
    // The exact-date unique key handles idempotency, while this predicate
    // prevents a second regular run for the same calendar month with slightly
    // different dates. Serializable isolation makes concurrent checks safe.
    const duplicateMonthlyRun = await transaction.payrollRun.findFirst({
      where: {
        organizationId: params.organizationId,
        cutoffSequence: params.cutoffSequence,
        cutoffEndDate: { gte: monthStart, lt: nextMonth },
        status: { not: 'CANCELLED' },
      },
      select: { id: true },
    });
    if (duplicateMonthlyRun) {
      throw new ConflictException(
        'A payroll run already exists for this monthly cutoff; cancel it before recalculating',
      );
    }

    if (params.cutoffSequence === 'FIRST_CUTOFF') {
      // A later first cutoff would invalidate the already-posted monthly tax
      // reconciliation on a second cutoff. A new hire can still have only a
      // second-cutoff payslip; that payslip is taxed on actual earnings.
      const secondRun = await transaction.payrollRun.findFirst({
        where: {
          organizationId: params.organizationId,
          cutoffSequence: 'SECOND_CUTOFF',
          cutoffEndDate: { gte: monthStart, lt: nextMonth },
          status: { in: ['AUDITED', 'APPROVED', 'DISBURSED'] },
        },
        select: { id: true },
      });
      if (secondRun) {
        throw new ConflictException(
          'The second cutoff for this month has already been processed; cancel it before processing the first cutoff',
        );
      }
    }

    if (params.cutoffSequence === 'SECOND_CUTOFF') {
      const overlappingFirstRun = await transaction.payrollRun.findFirst({
        where: {
          organizationId: params.organizationId,
          cutoffSequence: 'FIRST_CUTOFF',
          cutoffEndDate: {
            gte: params.cutoffStartDate,
            lt: nextMonth,
          },
          status: { not: 'CANCELLED' },
        },
        select: { id: true },
      });
      if (overlappingFirstRun) {
        throw new ConflictException(
          'The second cutoff overlaps a first cutoff; correct the dates before processing',
        );
      }
    }

    // Read actual first-cutoff payslips once per run, within the serializable
    // transaction, rather than guessing the taxable base from monthly salary.
    const priorMonthlyTax = new Map<
      string,
      { taxableCents: bigint; withheldCents: bigint }
    >();
    if (params.cutoffSequence === 'SECOND_CUTOFF') {
      const priorPayslips = await transaction.payslip.findMany({
        where: {
          payrollRun: {
            organizationId: params.organizationId,
            cutoffSequence: 'FIRST_CUTOFF',
            cutoffEndDate: { gte: monthStart, lt: params.cutoffEndDate },
            status: { in: ['AUDITED', 'APPROVED', 'DISBURSED'] },
          },
        },
        select: {
          employeeId: true,
          grossPayCents: true,
          nonTaxableAllowancesCents: true,
          sssEmployeeCents: true,
          philhealthEmployeeCents: true,
          pagibigEmployeeCents: true,
          withholdingTaxCents: true,
        },
      });
      for (const payslip of priorPayslips) {
        const prior = priorMonthlyTax.get(payslip.employeeId) ?? {
          taxableCents: 0n,
          withheldCents: 0n,
        };
        const taxable =
          payslip.grossPayCents -
          payslip.nonTaxableAllowancesCents -
          payslip.sssEmployeeCents -
          payslip.philhealthEmployeeCents -
          payslip.pagibigEmployeeCents;
        prior.taxableCents += taxable > 0n ? taxable : 0n;
        prior.withheldCents += payslip.withholdingTaxCents;
        priorMonthlyTax.set(payslip.employeeId, prior);
      }
    }

    const employees = await transaction.employee.findMany({
      where: {
        organizationId: params.organizationId,
        employmentStatus: 'ACTIVE',
        // hireDate is currently a DateTime, while cutoffs are civil dates.
        // Include the whole last date, then normalize the eligible window.
        hireDate: { lt: new Date(params.cutoffEndDate.getTime() + 86_400_000) },
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
        'Payroll cannot proceed without active employees hired on or before the cutoff end date',
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

    for (const employee of employees) {
      const hireDate = normalizeDate(employee.hireDate);
      if (employee.payBasis === 'MONTHLY') {
        // The engine currently pays a fixed half-month salary. An approved
        // proration policy is not encoded; do not turn a shorter period or a
        // mid-cutoff hire into a full half-month payment.
        if (!isStandardRegularCutoff(params)) {
          throw new UnprocessableEntityException(
            `Employee ${employee.employeeNumber}: monthly pay requires a full standard cutoff (1–15 or 16–month end); custom periods require an approved proration policy`,
          );
        }
        if (hireDate > params.cutoffStartDate) {
          throw new UnprocessableEntityException(
            `Employee ${employee.employeeNumber} was hired on ${hireDate.toISOString().slice(0, 10)} during this cutoff; monthly new-hire pay requires an approved proration policy`,
          );
        }
      }
    }

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

      const hireDate = normalizeDate(employee.hireDate);
      const attendanceStart =
        hireDate > params.cutoffStartDate ? hireDate : params.cutoffStartDate;
      let attendanceSummary: Awaited<
        ReturnType<TimekeepingService['getCutoffAttendanceSummary']>
      >;
      try {
        attendanceSummary =
          await this.timekeepingService.getCutoffAttendanceSummary(
            employee.id,
            params.organizationId,
            attendanceStart,
            params.cutoffEndDate,
            transaction,
          );
      } catch (error) {
        if (error instanceof UnprocessableEntityException) {
          throw new UnprocessableEntityException(
            `Employee ${employee.employeeNumber}: ${error.message}`,
          );
        }
        throw error;
      }

      const allowances = resolveCutoffAllowances(
        employee.allowances,
        employee.employeeNumber,
        employee.hireDate,
        params,
      );

      const eligibleLoans = selectCutoffLoans(
        employee.loans,
        employee.employeeNumber,
        params.cutoffEndDate,
      );

      // Stable order ensures partial payments always prioritize the same
      // loans, independent of the database's unspecified row order.
      const loans: LoanDeductionInput[] = [...eligibleLoans]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((loan) => ({
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
        _sum: { deMinimisExcessCents: true, bonusPaidCents: true },
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
        ...(params.cutoffSequence === 'SECOND_CUTOFF'
          ? {
              priorMonthlyTaxableIncomeCents:
                priorMonthlyTax.get(employee.id)?.taxableCents ?? 0n,
              priorMonthlyTaxWithheldCents:
                priorMonthlyTax.get(employee.id)?.withheldCents ?? 0n,
            }
          : {}),
        ytdOtherBenefitsCents:
          (ytdBucket._sum.deMinimisExcessCents ?? 0n) +
          (ytdBucket._sum.bonusPaidCents ?? 0n),
        // 13th-month/bonus disbursements have no dedicated run type yet;
        // once they do, their bucket share is passed here so payouts share
        // the PHP 90,000 cap with de minimis excess.
        periodBonusesCents: 0n,
      };

      let result: ReturnType<typeof calculatePhilippinePayroll>;
      try {
        result = calculatePhilippinePayroll(calculationInput);
      } catch (error) {
        if (error instanceof InsufficientPayError) {
          throw new UnprocessableEntityException(
            `Employee ${employee.employeeNumber} has insufficient gross pay to cover mandatory deductions`,
          );
        }
        throw error;
      }
      const payslip = await transaction.payslip.create({
        data: {
          payrollRunId: payrollRun.id,
          employeeId: employee.id,
          basicPayCents: result.basicPayForPeriodCents,
          paidLeavePayCents: result.paidLeavePayCents,
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

      for (const loan of eligibleLoans) {
        const deduction = result.appliedLoanDeductions.find(
          (item) => item.loanId === loan.id,
        );
        if (!deduction) continue;

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

    const completed = await transaction.payrollRun.update({
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
    await audit?.({ previous: null, run: completed, transaction });
    return completed;
  }

  /**
   * Executes an annual 13th-month disbursement run (PD 851).
   *
   * Unlike regular runs this disburses computed 13th-month payouts only:
   * no basic pay, no timekeeping lookup, no statutory contributions
   * (bonuses are not subject to SSS/PhilHealth/Pag-IBIG), and no loan
   * amortization. Each release pays only additional entitlement earned
   * since earlier disbursed special runs. It prices that amount against the
   * PHP 90,000 annual bucket and withholds tax on the taxable excess using
   * the monthly TRAIN table; a separate annual tax reconciliation may still
   * be required. Active employees with disbursed basic earnings receive a
   * payout (managers included by company policy); the DOLE compliance report
   * separately limits statutory coverage to rank-and-file staff.
   */
  async executeThirteenthMonthRun(
    params: ExecuteThirteenthMonthRunParams,
    audit?: PayrollMutationAudit,
  ) {
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

    const taxYear = normalized.cutoffEndDate.getUTCFullYear();
    const runKey = {
      ...normalized,
      cutoffSequence: 'SPECIAL_RUN' as const,
    };

    for (let attempt = 1; attempt <= PAYROLL_TRANSACTION_RETRIES; attempt++) {
      try {
        return await prisma.$transaction(
          (transaction) =>
            this.executeThirteenthMonthInTransaction(
              transaction,
              {
                ...normalized,
                taxYear,
              },
              audit,
            ),
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
          return this.resolveExistingRun(runKey);
        }

        throw error;
      }
    }

    throw new ConflictException('Payroll run could not be completed');
  }

  private async executeThirteenthMonthInTransaction(
    transaction: Prisma.TransactionClient,
    params: ExecuteThirteenthMonthRunParams & { taxYear: number },
    audit?: PayrollMutationAudit,
  ) {
    const runKey = {
      organizationId: params.organizationId,
      processedById: params.processedById,
      cutoffStartDate: params.cutoffStartDate,
      cutoffEndDate: params.cutoffEndDate,
      paymentDate: params.paymentDate,
      cutoffSequence: 'SPECIAL_RUN' as const,
    };
    const existing = await transaction.payrollRun.findUnique({
      where: payrollRunKey(runKey),
      include: { payslips: true },
    });

    if (existing) return this.assertIdempotentMatch(existing, runKey);

    // A later special run is a true-up, not a second full annual payout.
    // Require earlier releases to be disbursed so the credited amount really
    // was paid, and reject out-of-order/same-date replays under a new key.
    const yearStart = new Date(Date.UTC(params.taxYear, 0, 1));
    const yearEnd = new Date(Date.UTC(params.taxYear + 1, 0, 1));
    const priorAnnualRuns = await transaction.payrollRun.findMany({
      where: {
        organizationId: params.organizationId,
        cutoffSequence: 'SPECIAL_RUN',
        cutoffEndDate: { gte: yearStart, lt: yearEnd },
        status: { not: 'CANCELLED' },
      },
      select: { status: true, cutoffEndDate: true },
    });
    if (
      priorAnnualRuns.some(
        (run) =>
          run.status !== 'DISBURSED' ||
          run.cutoffEndDate >= params.cutoffEndDate,
      )
    ) {
      throw new ConflictException(
        'Disburse the prior 13th-month run and use a later cutoff for a true-up, or cancel it first',
      );
    }

    const payrollRun = await transaction.payrollRun.create({
      data: {
        organizationId: params.organizationId,
        processedById: params.processedById,
        cutoffSequence: 'SPECIAL_RUN',
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
      include: { compensation: true },
    });

    if (employees.length === 0) {
      throw new UnprocessableEntityException(
        'Payroll cannot proceed without active employees',
      );
    }

    let runTotalGross = 0n;
    let runTotalDeductions = 0n;
    let runTotalNet = 0n;

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

      const monthsWorked = calculateMonthsWorkedInYear(
        employee.hireDate,
        params.taxYear,
      );
      // Only regular, disbursed pay earned up to this payout's cutoff counts.
      // This handles rate changes, partial service and daily/hourly workers,
      // and avoids subtracting LWOP a second time from recorded basic pay.
      const regularPayslips = await transaction.payslip.findMany({
        where: {
          employeeId: employee.id,
          payrollRun: {
            organizationId: params.organizationId,
            cutoffSequence: { in: ['FIRST_CUTOFF', 'SECOND_CUTOFF'] },
            status: 'DISBURSED',
            cutoffEndDate: { gte: yearStart, lte: params.cutoffEndDate },
          },
        },
        select: {
          basicPayCents: true,
          tardinessDeductionCents: true,
          undertimeDeductionCents: true,
          absenceDeductionCents: true,
        },
      });
      const actualBasicEarnedCents = regularPayslips.reduce((sum, slip) => {
        const deductions =
          slip.tardinessDeductionCents +
          slip.undertimeDeductionCents +
          slip.absenceDeductionCents;
        return (
          sum +
          (slip.basicPayCents > deductions
            ? slip.basicPayCents - deductions
            : 0n)
        );
      }, 0n);
      if (actualBasicEarnedCents === 0n) continue;

      const ytdBucket = await transaction.payslip.aggregate({
        _sum: { deMinimisExcessCents: true, bonusPaidCents: true },
        where: {
          employeeId: employee.id,
          payrollRun: {
            cutoffEndDate: { gte: yearStart, lt: yearEnd },
          },
        },
      });
      const ytdUsed =
        (ytdBucket._sum.deMinimisExcessCents ?? 0n) +
        (ytdBucket._sum.bonusPaidCents ?? 0n);

      const payout = calculateEmployee13thMonth(
        {
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          fullName: `${employee.firstName} ${employee.lastName}`,
          monthlyBasicRateCents: compensation.basicRateMonthlyCents,
          hireDate: employee.hireDate.toISOString().slice(0, 10),
          monthsWorkedInYear: monthsWorked,
          unpaidAbsenceDays: 0,
          actualBasicEarnedCents,
          // Bucket pricing below owns the PHP 90,000 split against live
          // YTD usage (including de minimis excess), so no prior offset here.
          otherTaxableBonusesCents: 0n,
        },
        compensation.basicRateDailyCents,
      );

      const previouslyPaidCents = ytdBucket._sum.bonusPaidCents ?? 0n;
      const amountDueCents =
        payout.thirteenthMonthPayCents > previouslyPaidCents
          ? payout.thirteenthMonthPayCents - previouslyPaidCents
          : 0n;
      if (amountDueCents === 0n) continue;

      const bucket = allocateNinetiethBucket({
        ytdUsedCents: ytdUsed,
        periodBonusesCents: amountDueCents,
      });
      const withholdingTaxCents = compensation.isTaxExempt
        ? 0n
        : calculateWithholdingTax(bucket.taxableCents, false, false);
      const netPayCents =
        amountDueCents > withholdingTaxCents
          ? amountDueCents - withholdingTaxCents
          : 0n;

      await transaction.payslip.create({
        data: {
          payrollRunId: payrollRun.id,
          employeeId: employee.id,
          basicPayCents: 0n,
          taxableAllowancesCents: bucket.taxableCents,
          nonTaxableAllowancesCents: bucket.exemptCents,
          grossPayCents: amountDueCents,
          withholdingTaxCents,
          totalDeductionsCents: withholdingTaxCents,
          netPayCents,
          bonusPaidCents: amountDueCents,
          deMinimisExcessCents: 0n,
        },
      });

      runTotalGross += amountDueCents;
      runTotalDeductions += withholdingTaxCents;
      runTotalNet += netPayCents;
    }

    if (runTotalGross === 0n) {
      throw new UnprocessableEntityException(
        'No additional earned 13th-month pay is due for this cutoff',
      );
    }

    const completed = await transaction.payrollRun.update({
      where: { id: payrollRun.id },
      data: {
        totalGrossCents: runTotalGross,
        totalDeductionsCents: runTotalDeductions,
        totalNetCents: runTotalNet,
        totalEmployerCostCents: 0n,
        status: 'AUDITED',
      },
      include: { payslips: true },
    });
    await audit?.({ previous: null, run: completed, transaction });
    return completed;
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
    if (
      normalized.cutoffStartDate.getUTCFullYear() !==
        normalized.cutoffEndDate.getUTCFullYear() ||
      normalized.cutoffStartDate.getUTCMonth() !==
        normalized.cutoffEndDate.getUTCMonth()
    ) {
      throw new BadRequestException(
        'Regular payroll cutoffs must stay within one calendar month',
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
