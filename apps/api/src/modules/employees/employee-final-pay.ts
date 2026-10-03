import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, prisma } from '@workspace/db';
import { calculateFinalPay, SeparationType } from '@workspace/payroll-engine';
import { resolvePriorEmployerTotals } from '../compliance/prior-employment.inputs';
import {
  type FinalPayPreviewInput,
  finalPayPreviewSchema,
} from './final-pay.inputs';

/** Calendar anniversaries, not a 365.25-day estimate at statutory boundaries. */
function completedYears(start: Date, end: Date) {
  return (
    end.getUTCFullYear() -
    start.getUTCFullYear() -
    Number(
      end.getUTCMonth() < start.getUTCMonth() ||
        (end.getUTCMonth() === start.getUTCMonth() &&
          end.getUTCDate() < start.getUTCDate()),
    )
  );
}
function serviceYears(start: Date, end: Date) {
  const completed = completedYears(start, end);
  const anniversary = new Date(
    Date.UTC(
      start.getUTCFullYear() + completed,
      start.getUTCMonth(),
      start.getUTCDate(),
    ),
  );
  const next = new Date(
    Date.UTC(
      start.getUTCFullYear() + completed + 1,
      start.getUTCMonth(),
      start.getUTCDate(),
    ),
  );
  return (
    completed +
    (end.getTime() - anniversary.getTime()) /
      (next.getTime() - anniversary.getTime())
  );
}

export async function calculateEmployeeFinalPay(input: FinalPayPreviewInput) {
  if (
    !(input.exitDate instanceof Date) ||
    !Number.isFinite(input.exitDate.getTime())
  )
    throw new BadRequestException('Exit date must be valid');
  if (
    typeof input.organizationId !== 'string' ||
    !input.organizationId.trim() ||
    typeof input.authorizedLoanDeductionsCents !== 'bigint'
  )
    throw new BadRequestException(
      'A tenant scope and explicit BigInt deduction scenario are required',
    );
  // Protect direct service consumers too; missing scenario inputs must not
  // silently become zero usage, five leave days, or permission to collect debt.
  const parsed = finalPayPreviewSchema.safeParse({
    ...input,
    exitDate: input.exitDate.toISOString().slice(0, 10),
    authorizedLoanDeductionsCents:
      input.authorizedLoanDeductionsCents?.toString(),
  });
  if (!parsed.success)
    throw new BadRequestException(
      'Explicit valid final-pay scenario inputs, monetization history and applicable review references are required',
    );
  const exitDate = new Date(parsed.data.exitDate);
  const taxYear = exitDate.getUTCFullYear();
  if (taxYear < 2023 || taxYear > 2100)
    throw new BadRequestException(
      'Final-pay preview supports exit years 2023–2100 only; rules still need independent validation',
    );
  const yearStart = new Date(Date.UTC(taxYear, 0, 1));
  const nextDay = new Date(exitDate.getTime() + 86_400_000);
  return prisma.$transaction(
    async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: input.employeeId, organizationId: input.organizationId },
        include: {
          compensation: true,
          loans: true,
          leaveBalances: { where: { year: taxYear } },
        },
      });
      if (!employee?.compensation)
        throw new NotFoundException(
          'Employee or compensation record not found',
        );
      if (employee.hireDate > exitDate || employee.dateOfBirth > exitDate)
        throw new UnprocessableEntityException(
          'Exit date cannot precede recorded hire or birth dates',
        );
      if (employee.compensation.isTaxExempt)
        throw new UnprocessableEntityException(
          'MWE final pay requires manual tax review; this preview cannot infer exempt wage components',
        );
      if (
        employee.compensation.basicRateMonthlyCents <= 0n ||
        employee.compensation.basicRateDailyCents <= 0n
      )
        throw new UnprocessableEntityException(
          'Recorded compensation requires reconciliation before final-pay preview',
        );
      const pendingPayroll = await tx.payrollRun.findFirst({
        where: {
          organizationId: input.organizationId,
          status: { in: ['DRAFT', 'PROCESSING', 'AUDITED', 'APPROVED'] },
          payslips: { some: { employeeId: employee.id } },
        },
        select: { id: true },
      });
      if (pendingPayroll)
        throw new UnprocessableEntityException(
          'Resolve non-disbursed payroll for this employee before final-pay preview; reserved wages and loan deductions are not settled payments',
        );
      const pendingCorrection = await tx.taxEvidenceCorrection.count({
        where: {
          organizationId: input.organizationId,
          taxYear,
          status: 'PENDING',
          OR: [{ employeeId: employee.id }, { kind: 'REMITTANCE' }],
        },
      });
      if (pendingCorrection)
        throw new UnprocessableEntityException(
          'Resolve pending tax evidence corrections before final-pay preview',
        );
      const [payslips, declaration, priorVersions, settlement] =
        await Promise.all([
          tx.payslip.findMany({
            where: {
              employeeId: employee.id,
              payrollRun: {
                organizationId: input.organizationId,
                status: 'DISBURSED',
                paymentDate: { gte: yearStart, lt: nextDay },
              },
            },
            include: {
              payrollRun: {
                select: { cutoffSequence: true, cutoffEndDate: true },
              },
            },
          }),
          tx.priorEmployerDeclaration.findFirst({
            where: {
              organizationId: input.organizationId,
              employeeId: employee.id,
              taxYear,
            },
            orderBy: { version: 'desc' },
          }),
          tx.previousEmployerIncome.findMany({
            where: {
              organizationId: input.organizationId,
              employeeId: employee.id,
              taxYear,
            },
          }),
          tx.yearEndTaxSettlement.findFirst({
            where: {
              organizationId: input.organizationId,
              employeeId: employee.id,
              taxYear,
            },
            orderBy: { version: 'desc' },
          }),
        ]);
      const prior = resolvePriorEmployerTotals(declaration, priorVersions, {
        taxYear,
        requireDeclaration: true,
        throughDate: exitDate,
      });
      const regular = payslips.filter(
        (slip) =>
          slip.payrollRun.cutoffSequence !== 'SPECIAL_RUN' &&
          slip.payrollRun.cutoffEndDate >= yearStart &&
          slip.payrollRun.cutoffEndDate <= exitDate,
      );
      if (!regular.length)
        throw new UnprocessableEntityException(
          'Final pay requires disbursed regular payslips in the exit year; reconcile payroll before calculating',
        );
      if (payslips.some((slip) => slip.payrollRun.cutoffEndDate > exitDate))
        throw new UnprocessableEntityException(
          'Paid payroll extends beyond the exit date; reconcile its service period before final-pay preview',
        );
      const sil = employee.leaveBalances.find(
        (balance) => balance.leaveType === 'SIL',
      );
      if (input.unusedLeaveDays > 0) {
        if (!sil)
          throw new UnprocessableEntityException(
            'Leave monetization requires a recorded SIL balance; no entitlement is assumed',
          );
        const total = Number(sil.totalCredits);
        const used = Number(sil.usedCredits);
        const available = Number(sil.balance);
        if (
          [total, used, available].some(
            (n) => !Number.isFinite(n) || n < 0 || !Number.isInteger(n * 2),
          ) ||
          total - used !== available ||
          input.unusedLeaveDays > available
        )
          throw new UnprocessableEntityException(
            'Monetization cannot exceed consistent recorded SIL availability; reconcile unsupported usage manually',
          );
      }
      if (employee.loans.some((loan) => loan.balanceCents < 0n))
        throw new UnprocessableEntityException(
          'Recorded loan balances require reconciliation',
        );
      const recordedLoanBalanceCents = employee.loans.reduce(
        (sum, loan) => sum + loan.balanceCents,
        0n,
      );
      if (input.authorizedLoanDeductionsCents > recordedLoanBalanceCents)
        throw new UnprocessableEntityException(
          'Authorized loan deduction cannot exceed recorded outstanding debt',
        );
      let settledTaxAdjustmentCents = 0n;
      if (settlement) {
        if (
          settlement.settlementDate > exitDate ||
          settlement.settledCents < 0n ||
          !['DEFICIENCY_WITHHELD', 'REFUND_PAID'].includes(
            settlement.settlementType,
          )
        )
          throw new UnprocessableEntityException(
            'Recorded tax settlement requires period and amount reconciliation before final-pay preview',
          );
        settledTaxAdjustmentCents =
          settlement.settlementType === 'REFUND_PAID'
            ? -settlement.settledCents
            : settlement.settledCents;
      }
      const actualServiceYears = serviceYears(employee.hireDate, exitDate);
      const yearsOfService = input.yearsOfService ?? actualServiceYears;
      if (
        input.separationType === 'RETIREMENT' &&
        actualServiceYears < 5 &&
        yearsOfService >= 5
      )
        throw new UnprocessableEntityException(
          'A service-year override cannot establish the five-year statutory retirement minimum; reconcile credited service manually',
        );
      const basicEarned = regular.reduce((sum, slip) => {
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
      const presentTaxable = payslips.reduce((sum, slip) => {
        const taxable =
          slip.grossPayCents -
          slip.nonTaxableAllowancesCents -
          slip.sssEmployeeCents -
          slip.philhealthEmployeeCents -
          slip.pagibigEmployeeCents;
        return sum + (taxable > 0n ? taxable : 0n);
      }, 0n);
      let result: ReturnType<typeof calculateFinalPay>;
      try {
        result = calculateFinalPay({
          separationType: SeparationType[input.separationType],
          monthlyBasicRateCents: employee.compensation.basicRateMonthlyCents,
          dailyRateCents: employee.compensation.basicRateDailyCents,
          yearsOfService,
          retireeAge:
            input.separationType === 'RETIREMENT'
              ? completedYears(employee.dateOfBirth, exitDate)
              : undefined,
          unpaidDaysWorkedInLastPeriod: input.unpaidDaysWorked,
          unusedLeaveDays: input.unusedLeaveDays,
          priorMonetizedLeaveDaysInYear: input.priorMonetizedLeaveDaysInYear,
          retirementBenefitTaxTreatment: input.retirementBenefitTaxTreatment,
          isRepeatRetirementClaim: input.isRepeatRetirementClaim,
          totalYtdBasicEarnedCents: basicEarned,
          ytdTaxableCompensationCents:
            presentTaxable + (prior?.taxableCents ?? 0n),
          totalYtdTaxWithheldCents:
            payslips.reduce((sum, slip) => sum + slip.withholdingTaxCents, 0n) +
            (prior?.withheldCents ?? 0n),
          settledTaxAdjustmentCents,
          thirteenthMonthAlreadyPaidCents: payslips.reduce(
            (sum, slip) =>
              sum +
              (slip.payrollRun.cutoffSequence === 'SPECIAL_RUN' &&
              slip.payrollRun.cutoffEndDate >= yearStart &&
              slip.payrollRun.cutoffEndDate <= exitDate
                ? slip.bonusPaidCents
                : 0n),
            0n,
          ),
          ytdOtherBenefitsCents: payslips.reduce(
            (sum, slip) =>
              sum + slip.bonusPaidCents + slip.deMinimisExcessCents,
            0n,
          ),
          outstandingLoanBalanceCents: input.authorizedLoanDeductionsCents,
        });
      } catch (error) {
        if (error instanceof RangeError)
          throw new UnprocessableEntityException(error.message);
        throw error;
      }
      return {
        employee: {
          id: employee.id,
          name: `${employee.firstName} ${employee.lastName}`,
          employeeNumber: employee.employeeNumber,
          tin: employee.tin,
        },
        yearsOfService,
        taxYear,
        priorEmployerTotals: prior,
        recordedLoanBalanceCents,
        loanAuthorizationReference:
          parsed.data.loanAuthorizationReference ?? null,
        retirementTaxSourceReference:
          parsed.data.retirementTaxSourceReference ?? null,
        previewOnly: true as const,
        ...result,
        remarks: `${result.remarks} Exit-year preview only; source references are attestations, not verification. Prior-year arrears, external usage, qualified private retirement plans and actual settlement require manual reconciliation. No leave debit, debt collection, payroll posting or payment occurred.`,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 30_000,
    },
  );
}
