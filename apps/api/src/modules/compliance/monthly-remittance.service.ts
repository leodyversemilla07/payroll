import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Prisma, prisma } from '@workspace/db';
import {
  assertCorrectionReason,
  assertCorrectionReviewer,
  assertEmployeeInTenant,
  assertSupportedTaxYear,
  createEvidence,
} from './tax-evidence-guards';

@Injectable()
export class MonthlyRemittanceService {
  private database: Prisma.TransactionClient = prisma;

  /** A fresh transaction-scoped instance; never mutate the singleton service. */
  withDatabase(database: Prisma.TransactionClient): MonthlyRemittanceService {
    const service = new MonthlyRemittanceService();
    service.database = database;
    return service;
  }

  async recordMonthlyTaxRemittance(input: {
    organizationId: string;
    taxYear: number;
    month: number;
    remittedCents: bigint;
    documentReference: string;
    recordedById: string;
  }) {
    assertSupportedTaxYear(input.taxYear);
    if (
      !Number.isInteger(input.month) ||
      input.month < 1 ||
      input.month > 12 ||
      input.remittedCents < 0n
    ) {
      throw new UnprocessableEntityException(
        'Invalid remittance month or amount',
      );
    }
    const existingRemittance =
      await this.database.monthlyTaxRemittanceEvidence.findFirst({
        where: {
          organizationId: input.organizationId,
          taxYear: input.taxYear,
          month: input.month,
        },
        select: { id: true },
      });
    if (existingRemittance) {
      throw new ConflictException(
        'A remittance reference already exists for this month; use the correction procedure with a reviewer to supersede it',
      );
    }
    return createEvidence(() =>
      this.database.monthlyTaxRemittanceEvidence.create({
        data: input,
        select: {
          id: true,
          taxYear: true,
          month: true,
          remittedCents: true,
          documentReference: true,
          recordedById: true,
          createdAt: true,
        },
      }),
    );
  }

  /**
   * Appends a higher-version monthly remittance reference that replaces the
   * current one. The replaced row is never mutated.
   */
  async supersedeMonthlyTaxRemittance(input: {
    organizationId: string;
    taxYear: number;
    month: number;
    remittedCents: bigint;
    documentReference: string;
    correctionReason: string;
    recordedById: string;
    reviewerId: string;
  }) {
    assertSupportedTaxYear(input.taxYear);
    if (
      !Number.isInteger(input.month) ||
      input.month < 1 ||
      input.month > 12 ||
      input.remittedCents < 0n
    ) {
      throw new UnprocessableEntityException(
        'Invalid remittance month or amount',
      );
    }
    const correctionReason = assertCorrectionReason(input.correctionReason);
    await assertCorrectionReviewer(this.database, {
      organizationId: input.organizationId,
      recorderId: input.recordedById,
      reviewerId: input.reviewerId,
    });
    const current = await this.database.monthlyTaxRemittanceEvidence.findFirst({
      where: {
        organizationId: input.organizationId,
        taxYear: input.taxYear,
        month: input.month,
      },
      orderBy: { version: 'desc' },
    });
    if (!current) {
      throw new NotFoundException(
        'No monthly remittance reference exists to correct',
      );
    }
    return createEvidence(() =>
      this.database.monthlyTaxRemittanceEvidence.create({
        data: {
          organizationId: input.organizationId,
          taxYear: input.taxYear,
          month: input.month,
          remittedCents: input.remittedCents,
          documentReference: input.documentReference,
          recordedById: input.recordedById,
          version: current.version + 1,
          supersedesId: current.id,
          correctionReason,
          reviewedById: input.reviewerId,
        },
        select: {
          id: true,
          taxYear: true,
          month: true,
          remittedCents: true,
          documentReference: true,
          recordedById: true,
          version: true,
          supersedesId: true,
          correctionReason: true,
          reviewedById: true,
          createdAt: true,
        },
      }),
    );
  }

  async getTaxEvidence(
    employeeId: string,
    organizationId: string,
    taxYear: number,
  ) {
    assertSupportedTaxYear(taxYear);
    await assertEmployeeInTenant(this.database, employeeId, organizationId);
    const [
      declarationVersions,
      previousVersions,
      remittanceVersions,
      settlementVersions,
    ] = await Promise.all([
      this.database.priorEmployerDeclaration.findMany({
        where: { employeeId, organizationId, taxYear },
        orderBy: { version: 'desc' },
      }),
      this.database.previousEmployerIncome.findMany({
        where: { employeeId, organizationId, taxYear },
        orderBy: [{ version: 'desc' }, { periodStart: 'asc' }],
      }),
      this.database.monthlyTaxRemittanceEvidence.findMany({
        where: { organizationId, taxYear },
        orderBy: [{ month: 'asc' }, { version: 'desc' }],
      }),
      this.database.yearEndTaxSettlement.findMany({
        where: { employeeId, organizationId, taxYear },
        orderBy: { version: 'desc' },
      }),
    ]);
    // Readers use the highest version per key; every replaced row stays in
    // history for audit.
    const declaration = declarationVersions[0] ?? null;
    const currentPreviousByKey = new Map<
      string,
      (typeof previousVersions)[number]
    >();
    for (const record of previousVersions) {
      const key = `${record.employerTin}|${record.periodStart.toISOString()}|${record.periodEnd.toISOString()}`;
      if (!currentPreviousByKey.has(key)) {
        currentPreviousByKey.set(key, record);
      }
    }
    const currentPreviousIds = new Set(
      [...currentPreviousByKey.values()].map((record) => record.id),
    );
    const previousEmployers = [...currentPreviousByKey.values()];
    const currentRemittanceByMonth = new Map<
      number,
      (typeof remittanceVersions)[number]
    >();
    for (const record of remittanceVersions) {
      if (!currentRemittanceByMonth.has(record.month)) {
        currentRemittanceByMonth.set(record.month, record);
      }
    }
    const currentRemittanceIds = new Set(
      [...currentRemittanceByMonth.values()].map((record) => record.id),
    );
    const monthlyRemittances = [...currentRemittanceByMonth.values()].sort(
      (a, b) => a.month - b.month,
    );
    const settlement = settlementVersions[0] ?? null;
    return {
      taxYear,
      selfReportedUnverified: true as const,
      declaration,
      previousEmployers,
      monthlyRemittances,
      settlement,
      supersededHistory: {
        declarations: declarationVersions.slice(1),
        previousEmployers: previousVersions.filter(
          (record) => !currentPreviousIds.has(record.id),
        ),
        monthlyRemittances: remittanceVersions.filter(
          (record) => !currentRemittanceIds.has(record.id),
        ),
        settlements: settlementVersions.slice(1),
      },
    };
  }
}
