import { UnprocessableEntityException } from '@nestjs/common';

interface PriorIncomeRecord {
  employerTin: string;
  periodStart: Date;
  periodEnd: Date;
  version: number;
  grossCompensationCents: bigint;
  taxableCompensationCents: bigint;
  taxWithheldCents: bigint;
}

/** Effective approved versions only. Prior taxable income is taken as stated,
 * never re-bucketed as if earned by the present employer. */
export function resolvePriorEmployerTotals(
  declaration: { hasPriorEmployer: boolean } | null,
  versions: readonly PriorIncomeRecord[],
  options: {
    taxYear: number;
    requireDeclaration?: boolean;
    throughDate?: Date;
  },
) {
  if (!declaration && options.requireDeclaration)
    throw new UnprocessableEntityException(
      'Record a prior-employer declaration before calculating final pay',
    );
  const current = new Map<string, PriorIncomeRecord>();
  for (const record of versions) {
    const key = `${record.employerTin}|${record.periodStart.toISOString()}|${record.periodEnd.toISOString()}`;
    const existing = current.get(key);
    if (!existing || record.version > existing.version)
      current.set(key, record);
  }
  const records = [...current.values()];
  if (records.length && !declaration?.hasPriorEmployer)
    throw new UnprocessableEntityException(
      'Declare prior employment before including its tax documents in annual tax computation',
    );
  if (declaration?.hasPriorEmployer && !records.length)
    throw new UnprocessableEntityException(
      'Missing previous-employer tax document',
    );
  const byTin = new Map<string, PriorIncomeRecord[]>();
  for (const record of records) {
    if (
      record.grossCompensationCents < 0n ||
      record.taxableCompensationCents < 0n ||
      record.taxWithheldCents < 0n ||
      record.taxableCompensationCents > record.grossCompensationCents ||
      record.periodStart > record.periodEnd ||
      record.periodStart.getUTCFullYear() !== options.taxYear ||
      record.periodEnd.getUTCFullYear() !== options.taxYear
    )
      throw new UnprocessableEntityException(
        'Previous-employer amounts or document periods require reconciliation',
      );
    if (options.throughDate && record.periodEnd > options.throughDate)
      throw new UnprocessableEntityException(
        'Previous-employer document extends beyond the final-pay exit date; reconcile the period before calculating',
      );
    const tin = record.employerTin.replaceAll('-', '');
    const sameEmployer = byTin.get(tin) ?? [];
    if (
      sameEmployer.some(
        (existing) =>
          record.periodStart <= existing.periodEnd &&
          record.periodEnd >= existing.periodStart,
      )
    )
      throw new UnprocessableEntityException(
        'Overlapping previous-employer documents for the same TIN require reconciliation; do not add them twice',
      );
    sameEmployer.push(record);
    byTin.set(tin, sameEmployer);
  }
  if (!records.length) return null;
  return {
    employerCount: byTin.size,
    documentCount: records.length,
    grossCents: records.reduce(
      (sum, record) => sum + record.grossCompensationCents,
      0n,
    ),
    taxableCents: records.reduce(
      (sum, record) => sum + record.taxableCompensationCents,
      0n,
    ),
    withheldCents: records.reduce(
      (sum, record) => sum + record.taxWithheldCents,
      0n,
    ),
  };
}
