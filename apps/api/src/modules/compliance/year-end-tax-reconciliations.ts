import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Prisma } from '@workspace/db';
import { assertSupportedTaxYear } from './tax-evidence-guards';
import { generateBir2316 } from './year-end-tax-2316';
import { issuanceFreshness } from './year-end-tax-freshness';

export async function listYearEndReconciliations(
  db: Prisma.TransactionClient,
  organizationId: string,
  taxYear: number,
) {
  /**
   * Read-only, tenant-scoped review queue. Include only employees with a
   * disbursed payslip paid in the selected tax year. A blocked row is never
   * treated as a zero-tax employee or silently dropped from the totals.
   * These totals are NOT remittances or paid refunds.
   */
  assertSupportedTaxYear(taxYear);
  const paymentDate = {
    gte: new Date(Date.UTC(taxYear, 0, 1)),
    lt: new Date(Date.UTC(taxYear + 1, 0, 1)),
  };
  const employees = await db.employee.findMany({
    where: {
      organizationId,
      payslips: {
        some: {
          payrollRun: { organizationId, status: 'DISBURSED', paymentDate },
        },
      },
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
    },
    orderBy: { employeeNumber: 'asc' },
  });

  const declarations = await db.priorEmployerDeclaration.findMany({
    where: {
      organizationId,
      taxYear,
      employeeId: { in: employees.map((employee) => employee.id) },
    },
    select: { employeeId: true, hasPriorEmployer: true, version: true },
  });
  const declarationByEmployee = new Map<
    string,
    { hasPriorEmployer: boolean; version: number }
  >();
  for (const entry of declarations) {
    const current = declarationByEmployee.get(entry.employeeId);
    if (!current || entry.version > current.version) {
      declarationByEmployee.set(entry.employeeId, entry);
    }
  }
  const previousRecords = await db.previousEmployerIncome.findMany({
    where: {
      organizationId,
      taxYear,
      employeeId: { in: employees.map((employee) => employee.id) },
    },
    select: {
      employeeId: true,
      employerTin: true,
      periodStart: true,
      periodEnd: true,
      version: true,
    },
  });
  const currentPreviousByKey = new Map<
    string,
    (typeof previousRecords)[number]
  >();
  for (const entry of previousRecords) {
    const key = `${entry.employeeId}|${entry.employerTin}|${entry.periodStart.toISOString()}|${entry.periodEnd.toISOString()}`;
    const current = currentPreviousByKey.get(key);
    if (!current || entry.version > current.version) {
      currentPreviousByKey.set(key, entry);
    }
  }
  const previousEmployeeIds = new Set(
    [...currentPreviousByKey.values()].map((entry) => entry.employeeId),
  );
  const issuances = await db.bir2316Issuance.findMany({
    where: {
      organizationId,
      taxYear,
      employeeId: { in: employees.map((employee) => employee.id) },
    },
    select: {
      employeeId: true,
      status: true,
      issuedAt: true,
      version: true,
      snapshot: true,
    },
  });
  const issuanceByEmployee = new Map<
    string,
    {
      status: string;
      issuedAt: Date;
      version: number;
      snapshot: Prisma.JsonValue;
    }
  >();
  for (const entry of issuances) {
    const current = issuanceByEmployee.get(entry.employeeId);
    if (!current || entry.version > current.version) {
      issuanceByEmployee.set(entry.employeeId, entry);
    }
  }
  const payslips = await db.payslip.findMany({
    where: {
      payrollRun: { organizationId, status: 'DISBURSED', paymentDate },
    },
    select: {
      withholdingTaxCents: true,
      payrollRun: { select: { paymentDate: true } },
    },
  });
  const monthlyWithheld = new Map<number, bigint>();
  for (const payslip of payslips) {
    const month = payslip.payrollRun.paymentDate.getUTCMonth() + 1;
    monthlyWithheld.set(
      month,
      (monthlyWithheld.get(month) ?? 0n) + payslip.withholdingTaxCents,
    );
  }
  const remittances = await db.monthlyTaxRemittanceEvidence.findMany({
    where: { organizationId, taxYear },
    select: { month: true, remittedCents: true, version: true },
  });
  const latestRemittanceByMonth = new Map<
    number,
    { remittedCents: bigint; version: number }
  >();
  for (const entry of remittances) {
    const current = latestRemittanceByMonth.get(entry.month);
    if (!current || entry.version > current.version) {
      latestRemittanceByMonth.set(entry.month, entry);
    }
  }
  const remittedByMonth = new Map(
    [...latestRemittanceByMonth].map(([month, entry]) => [
      month,
      entry.remittedCents,
    ]),
  );
  const missingRemittanceMonths = [...monthlyWithheld.keys()].filter(
    (month) => !remittedByMonth.has(month),
  );
  const mismatchedRemittanceMonths = [...monthlyWithheld.entries()]
    .filter(
      ([month, withheld]) =>
        remittedByMonth.has(month) && remittedByMonth.get(month) !== withheld,
    )
    .map(([month]) => month);
  // An entry with no disbursed payroll for that month also needs review;
  // otherwise a mistakenly entered amount could look reconciled.
  for (const [month, remitted] of remittedByMonth) {
    if (!monthlyWithheld.has(month) && remitted !== 0n)
      mismatchedRemittanceMonths.push(month);
  }
  missingRemittanceMonths.sort((a, b) => a - b);
  mismatchedRemittanceMonths.sort((a, b) => a - b);

  type ReconciliationRow = {
    employeeId: string;
    employeeNumber: string;
    name: string;
    status:
      | 'BALANCED'
      | 'DEFICIENCY_REVIEW'
      | 'REFUND_REVIEW'
      | 'SETTLED'
      | 'BLOCKED_REVIEW';
    grossCents: bigint | null;
    taxableCents: bigint | null;
    taxDueCents: bigint | null;
    taxWithheldCents: bigint | null;
    unsettledDifferenceCents: bigint | null;
    remainingDifferenceCents: bigint | null;
    settlementType: string | null;
    settledCents: bigint | null;
    issuanceStatus: string | null;
    issuanceFreshness: 'CURRENT' | 'STALE' | 'UNVERIFIABLE' | 'VOIDED' | null;
    issuedAt: Date | null;
    reason?: string;
  };
  const rows: ReconciliationRow[] = [];
  for (const employee of employees) {
    const currentIssuance = issuanceByEmployee.get(employee.id);
    const freshness = currentIssuance
      ? await issuanceFreshness(
          db,
          currentIssuance,
          employee.id,
          organizationId,
          taxYear,
        )
      : null;
    const identity = {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      name: `${employee.firstName} ${employee.lastName}`,
      issuanceFreshness: freshness?.freshness ?? null,
    };
    try {
      const declaration = declarationByEmployee.get(employee.id);
      if (!declaration) {
        throw new UnprocessableEntityException(
          'Missing prior-employer declaration for this tax year',
        );
      }
      if (
        !declaration.hasPriorEmployer &&
        previousEmployeeIds.has(employee.id)
      ) {
        throw new UnprocessableEntityException(
          'Prior-employer declaration conflicts with recorded tax documents',
        );
      }
      if (
        declaration.hasPriorEmployer &&
        !previousEmployeeIds.has(employee.id)
      ) {
        throw new UnprocessableEntityException(
          'Missing previous-employer tax document',
        );
      }
      if (missingRemittanceMonths.length || mismatchedRemittanceMonths.length) {
        throw new UnprocessableEntityException(
          'Monthly withholding remittance evidence is incomplete or differs from disbursed payslips',
        );
      }
      const result = await generateBir2316(
        db,
        employee.id,
        organizationId,
        taxYear,
      );
      const { partIVA } = result.certificate;
      const issuance = issuanceByEmployee.get(employee.id);
      rows.push({
        ...identity,
        status: result.isSettled ? 'SETTLED' : result.reconciliationStatus,
        grossCents: partIVA.grossCompensationIncomeCents,
        taxableCents: partIVA.totalTaxableCompensationCents,
        taxDueCents: partIVA.taxDueAnnualCents,
        taxWithheldCents: partIVA.totalTaxWithheldCents,
        unsettledDifferenceCents: partIVA.taxAdjustmentCents,
        remainingDifferenceCents: result.remainingDifferenceCents,
        settlementType: result.settlement?.settlementType ?? null,
        settledCents: result.settlement?.settledCents ?? null,
        issuanceStatus: issuance?.status ?? null,
        issuedAt: issuance?.issuedAt ?? null,
      });
    } catch (error) {
      if (
        !(
          error instanceof UnprocessableEntityException ||
          error instanceof NotFoundException ||
          error instanceof RangeError
        )
      ) {
        throw error;
      }
      const blockedIssuance = issuanceByEmployee.get(employee.id);
      rows.push({
        ...identity,
        status: 'BLOCKED_REVIEW',
        grossCents: null,
        taxableCents: null,
        taxDueCents: null,
        taxWithheldCents: null,
        unsettledDifferenceCents: null,
        remainingDifferenceCents: null,
        settlementType: null,
        settledCents: null,
        issuanceStatus: blockedIssuance?.status ?? null,
        issuedAt: blockedIssuance?.issuedAt ?? null,
        reason: error.message,
      });
    }
  }
  return {
    taxYear,
    reviewOnly: true as const,
    employeeCount: rows.length,
    blockedCount: rows.filter((row) => row.status === 'BLOCKED_REVIEW').length,
    balancedCount: rows.filter((row) => row.status === 'BALANCED').length,
    deficiencyReviewCount: rows.filter(
      (row) => row.status === 'DEFICIENCY_REVIEW',
    ).length,
    refundReviewCount: rows.filter((row) => row.status === 'REFUND_REVIEW')
      .length,
    settledCount: rows.filter((row) => row.status === 'SETTLED').length,
    issuedCount: rows.filter((row) => row.issuanceStatus === 'ISSUED').length,
    staleIssuanceCount: rows.filter(
      (row) =>
        row.issuanceFreshness === 'STALE' ||
        row.issuanceFreshness === 'UNVERIFIABLE',
    ).length,
    missingRemittanceMonths,
    mismatchedRemittanceMonths,
    remittanceEvidenceIsUnverified: true as const,
    // Totals for classified rows ONLY, never a complete annual filing total
    // when blockedCount is nonzero.
    classifiedTaxDueCents: rows.reduce(
      (sum, row) => sum + (row.taxDueCents ?? 0n),
      0n,
    ),
    classifiedTaxWithheldCents: rows.reduce(
      (sum, row) => sum + (row.taxWithheldCents ?? 0n),
      0n,
    ),
    rows,
  };
}
