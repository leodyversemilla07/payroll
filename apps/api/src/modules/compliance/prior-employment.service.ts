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
export class PriorEmploymentService {
  private database: Prisma.TransactionClient = prisma;

  /** A fresh transaction-scoped instance; never mutate the singleton service. */
  withDatabase(database: Prisma.TransactionClient): PriorEmploymentService {
    const service = new PriorEmploymentService();
    service.database = database;
    return service;
  }

  async recordPriorEmployerDeclaration(input: {
    employeeId: string;
    organizationId: string;
    taxYear: number;
    hasPriorEmployer: boolean;
    sourceReference: string;
    recordedById: string;
  }) {
    assertSupportedTaxYear(input.taxYear);
    await assertEmployeeInTenant(
      this.database,
      input.employeeId,
      input.organizationId,
    );
    const existing = await this.database.priorEmployerDeclaration.findFirst({
      where: {
        employeeId: input.employeeId,
        organizationId: input.organizationId,
        taxYear: input.taxYear,
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'A declaration already exists for this employee-year; use the correction procedure with a reviewer to supersede it',
      );
    }
    return createEvidence(() =>
      this.database.priorEmployerDeclaration.create({
        data: input,
        select: {
          id: true,
          employeeId: true,
          taxYear: true,
          hasPriorEmployer: true,
          sourceReference: true,
          recordedById: true,
          createdAt: true,
        },
      }),
    );
  }

  /**
   * Appends a higher-version declaration that replaces the current one. The
   * replaced row is never mutated; readers use the highest version.
   */
  async supersedePriorEmployerDeclaration(input: {
    employeeId: string;
    organizationId: string;
    taxYear: number;
    hasPriorEmployer: boolean;
    sourceReference: string;
    correctionReason: string;
    recordedById: string;
    reviewerId: string;
  }) {
    assertSupportedTaxYear(input.taxYear);
    await assertEmployeeInTenant(
      this.database,
      input.employeeId,
      input.organizationId,
    );
    const correctionReason = assertCorrectionReason(input.correctionReason);
    await assertCorrectionReviewer(this.database, {
      organizationId: input.organizationId,
      recorderId: input.recordedById,
      reviewerId: input.reviewerId,
    });
    const current = await this.database.priorEmployerDeclaration.findFirst({
      where: {
        employeeId: input.employeeId,
        organizationId: input.organizationId,
        taxYear: input.taxYear,
      },
      orderBy: { version: 'desc' },
    });
    if (!current) {
      throw new NotFoundException(
        'No prior-employer declaration exists to correct',
      );
    }
    return createEvidence(() =>
      this.database.priorEmployerDeclaration.create({
        data: {
          employeeId: input.employeeId,
          organizationId: input.organizationId,
          taxYear: input.taxYear,
          hasPriorEmployer: input.hasPriorEmployer,
          sourceReference: input.sourceReference,
          recordedById: input.recordedById,
          version: current.version + 1,
          supersedesId: current.id,
          correctionReason,
          reviewedById: input.reviewerId,
        },
        select: {
          id: true,
          employeeId: true,
          taxYear: true,
          hasPriorEmployer: true,
          sourceReference: true,
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

  async recordPreviousEmployerIncome(input: {
    employeeId: string;
    organizationId: string;
    taxYear: number;
    employerName: string;
    employerTin: string;
    periodStart: Date;
    periodEnd: Date;
    grossCompensationCents: bigint;
    taxableCompensationCents: bigint;
    taxWithheldCents: bigint;
    documentReference: string;
    recordedById: string;
  }) {
    assertSupportedTaxYear(input.taxYear);
    await assertEmployeeInTenant(
      this.database,
      input.employeeId,
      input.organizationId,
    );
    const declaration = await this.database.priorEmployerDeclaration.findFirst({
      where: {
        employeeId: input.employeeId,
        organizationId: input.organizationId,
        taxYear: input.taxYear,
      },
      orderBy: { version: 'desc' },
    });
    if (!declaration?.hasPriorEmployer) {
      throw new UnprocessableEntityException(
        'Declare prior employment before recording its tax documents',
      );
    }
    if (
      input.periodStart > input.periodEnd ||
      input.periodStart.getUTCFullYear() !== input.taxYear ||
      input.periodEnd.getUTCFullYear() !== input.taxYear ||
      input.taxableCompensationCents > input.grossCompensationCents ||
      input.grossCompensationCents < 0n ||
      input.taxableCompensationCents < 0n ||
      input.taxWithheldCents < 0n
    ) {
      throw new UnprocessableEntityException(
        'Invalid previous-employer period or compensation totals',
      );
    }
    const existingDocument =
      await this.database.previousEmployerIncome.findFirst({
        where: {
          employeeId: input.employeeId,
          organizationId: input.organizationId,
          taxYear: input.taxYear,
          employerTin: input.employerTin,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        },
        select: { id: true },
      });
    if (existingDocument) {
      throw new ConflictException(
        'This previous-employer document already exists; use the correction procedure with a reviewer to supersede it',
      );
    }
    return createEvidence(() =>
      this.database.previousEmployerIncome.create({
        data: input,
        select: {
          id: true,
          employeeId: true,
          taxYear: true,
          employerName: true,
          employerTin: true,
          periodStart: true,
          periodEnd: true,
          grossCompensationCents: true,
          taxableCompensationCents: true,
          taxWithheldCents: true,
          documentReference: true,
          recordedById: true,
          createdAt: true,
        },
      }),
    );
  }

  /**
   * Appends a higher-version transcription that replaces one
   * previous-employer document. The document key (TIN + period) is immutable;
   * only figures, names and the reference change.
   */
  async supersedePreviousEmployerIncome(input: {
    employeeId: string;
    organizationId: string;
    taxYear: number;
    employerName: string;
    employerTin: string;
    periodStart: Date;
    periodEnd: Date;
    grossCompensationCents: bigint;
    taxableCompensationCents: bigint;
    taxWithheldCents: bigint;
    documentReference: string;
    correctionReason: string;
    recordedById: string;
    reviewerId: string;
  }) {
    assertSupportedTaxYear(input.taxYear);
    await assertEmployeeInTenant(
      this.database,
      input.employeeId,
      input.organizationId,
    );
    const correctionReason = assertCorrectionReason(input.correctionReason);
    await assertCorrectionReviewer(this.database, {
      organizationId: input.organizationId,
      recorderId: input.recordedById,
      reviewerId: input.reviewerId,
    });
    if (
      input.taxableCompensationCents > input.grossCompensationCents ||
      input.grossCompensationCents < 0n ||
      input.taxableCompensationCents < 0n ||
      input.taxWithheldCents < 0n
    ) {
      throw new UnprocessableEntityException(
        'Invalid previous-employer compensation totals',
      );
    }
    const current = await this.database.previousEmployerIncome.findFirst({
      where: {
        employeeId: input.employeeId,
        organizationId: input.organizationId,
        taxYear: input.taxYear,
        employerTin: input.employerTin,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
      orderBy: { version: 'desc' },
    });
    if (!current) {
      throw new NotFoundException(
        'No previous-employer document exists to correct',
      );
    }
    return createEvidence(() =>
      this.database.previousEmployerIncome.create({
        data: {
          employeeId: input.employeeId,
          organizationId: input.organizationId,
          taxYear: input.taxYear,
          employerName: input.employerName,
          employerTin: input.employerTin,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          grossCompensationCents: input.grossCompensationCents,
          taxableCompensationCents: input.taxableCompensationCents,
          taxWithheldCents: input.taxWithheldCents,
          documentReference: input.documentReference,
          recordedById: input.recordedById,
          version: current.version + 1,
          supersedesId: current.id,
          correctionReason,
          reviewedById: input.reviewerId,
        },
        select: {
          id: true,
          employeeId: true,
          taxYear: true,
          employerName: true,
          employerTin: true,
          periodStart: true,
          periodEnd: true,
          grossCompensationCents: true,
          taxableCompensationCents: true,
          taxWithheldCents: true,
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
}
