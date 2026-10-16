import { NotFoundException } from '@nestjs/common';
import { type Prisma } from '@workspace/db';
import { sourceFingerprint, TAX_SOURCE_FORMAT } from './tax-source-fingerprint';

export async function getTaxSourceFingerprint(
  db: Prisma.TransactionClient,
  employeeId: string,
  organizationId: string,
  taxYear: number,
): Promise<string> {
  /** Conservative source identity, not a claim of regulatory validity. */
  const employee = await db.employee.findFirst({
    where: { id: employeeId, organizationId },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          tin: true,
          rdoCode: true,
          registeredAddress: true,
        },
      },
      compensation: true,
      payslips: {
        where: {
          payrollRun: {
            organizationId,
            status: 'DISBURSED',
            paymentDate: {
              gte: new Date(Date.UTC(taxYear, 0, 1)),
              lt: new Date(Date.UTC(taxYear + 1, 0, 1)),
            },
          },
        },
        include: { payrollRun: true },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!employee) throw new NotFoundException('Employee not found');
  const [declarations, incomes, remittances, settlements] = await Promise.all([
    db.priorEmployerDeclaration.findMany({
      where: { employeeId, organizationId, taxYear },
      orderBy: { id: 'asc' },
    }),
    db.previousEmployerIncome.findMany({
      where: { employeeId, organizationId, taxYear },
      orderBy: { id: 'asc' },
    }),
    db.monthlyTaxRemittanceEvidence.findMany({
      where: { organizationId, taxYear },
      orderBy: { id: 'asc' },
    }),
    db.yearEndTaxSettlement.findMany({
      where: { employeeId, organizationId, taxYear },
      orderBy: { id: 'asc' },
    }),
  ]);
  return sourceFingerprint({
    format: TAX_SOURCE_FORMAT,
    employee,
    declarations,
    incomes,
    remittances,
    settlements,
  });
}

export async function issuanceFreshness(
  db: Prisma.TransactionClient,
  issuance: { status: string; snapshot: Prisma.JsonValue },
  employeeId: string,
  organizationId: string,
  taxYear: number,
) {
  if (issuance.status !== 'ISSUED')
    return {
      freshness: 'VOIDED' as const,
      freshnessReason: 'Certificate was voided',
    };
  const snapshot = issuance.snapshot;
  const stored =
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? snapshot.sourceFingerprint
      : null;
  const format =
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? snapshot.sourceFormat
      : null;
  if (
    typeof stored !== 'string' ||
    !/^[a-f0-9]{64}$/.test(stored) ||
    format !== TAX_SOURCE_FORMAT
  )
    return {
      freshness: 'UNVERIFIABLE' as const,
      freshnessReason:
        'Issuance has no supported source fingerprint; void and re-issue after review',
    };
  const current = await getTaxSourceFingerprint(
    db,
    employeeId,
    organizationId,
    taxYear,
  );
  return current === stored
    ? { freshness: 'CURRENT' as const, freshnessReason: null }
    : {
        freshness: 'STALE' as const,
        freshnessReason:
          'Source data changed after issuance; review, void and re-issue. The frozen certificate has not been updated.',
      };
}
