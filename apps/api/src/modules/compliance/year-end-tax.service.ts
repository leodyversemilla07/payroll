import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Prisma, prisma, type YearEndSettlementType } from '@workspace/db';
import { manilaToday, manilaYear } from '@workspace/payroll-engine';
import { Bir2316PdfService } from './bir-2316-pdf.service';
import {
  assertCorrectionReason,
  assertCorrectionReviewer,
  assertEmployeeInTenant,
  assertSupportedTaxYear,
  createEvidence,
} from './tax-evidence-guards';
import { TAX_SOURCE_FORMAT } from './tax-source-fingerprint';
import { generateBir1604CAlphalist } from './year-end-tax-1604c';
import { generateBir2316, generateBir2316Pdf } from './year-end-tax-2316';
import {
  getTaxSourceFingerprint,
  issuanceFreshness,
} from './year-end-tax-freshness';
import { listYearEndReconciliations } from './year-end-tax-reconciliations';

@Injectable()
export class YearEndTaxService {
  private database: Prisma.TransactionClient = prisma;
  private readonly bir2316PdfService = new Bir2316PdfService();

  /** A fresh transaction-scoped instance; never mutate the singleton service. */
  withDatabase(database: Prisma.TransactionClient): YearEndTaxService {
    const service = new YearEndTaxService();
    service.database = database;
    return service;
  }

  async getYearEndSettlement(
    employeeId: string,
    organizationId: string,
    taxYear: number,
  ) {
    assertSupportedTaxYear(taxYear);
    await assertEmployeeInTenant(this.database, employeeId, organizationId);
    return this.database.yearEndTaxSettlement.findFirst({
      where: { employeeId, organizationId, taxYear },
      orderBy: { version: 'desc' },
    });
  }

  async getBir2316Issuance(
    employeeId: string,
    organizationId: string,
    taxYear: number,
  ) {
    assertSupportedTaxYear(taxYear);
    await assertEmployeeInTenant(this.database, employeeId, organizationId);
    const issuance = await this.database.bir2316Issuance.findFirst({
      where: { employeeId, organizationId, taxYear },
      orderBy: { version: 'desc' },
    });
    if (!issuance) return null;
    return {
      ...issuance,
      ...issuanceTiming(issuance.taxYear),
      ...(await issuanceFreshness(
        this.database,
        issuance,
        employeeId,
        organizationId,
        taxYear,
      )),
    };
  }

  async getTaxSourceFingerprint(
    employeeId: string,
    organizationId: string,
    taxYear: number,
  ): Promise<string> {
    return getTaxSourceFingerprint(
      this.database,
      employeeId,
      organizationId,
      taxYear,
    );
  }

  async listYearEndReconciliations(organizationId: string, taxYear: number) {
    return listYearEndReconciliations(this.database, organizationId, taxYear);
  }

  async generateBir2316(
    employeeId: string,
    organizationId: string,
    taxYear = manilaYear(),
  ) {
    return generateBir2316(this.database, employeeId, organizationId, taxYear);
  }

  async generateBir2316Pdf(
    employeeId: string,
    organizationId: string,
    taxYear = manilaYear(),
    isPreview = false,
  ) {
    return generateBir2316Pdf(
      this.database,
      this.bir2316PdfService,
      employeeId,
      organizationId,
      taxYear,
      isPreview,
    );
  }

  async generateBir1604CAlphalist(
    organizationId: string,
    taxYear = manilaYear(),
  ) {
    return generateBir1604CAlphalist(this.database, organizationId, taxYear);
  }

  /**
   * Issues a BIR 2316 certificate to an employee. The preview worksheet is
   * never the certificate: issuance is allowed only for a conclusive,
   * fully-settled reconciliation (balanced or settled to zero), which also
   * inherits the de-minimis/MWE/gross-reconciliation guards. Recomputed
   * figures are frozen into the snapshot for audit. Filing eligibility
   * (e.g. substituted filing) is not decided here.
   */
  async issueBir2316(input: {
    employeeId: string;
    organizationId: string;
    taxYear: number;
    issuedById: string;
  }) {
    assertSupportedTaxYear(input.taxYear);
    await assertEmployeeInTenant(
      this.database,
      input.employeeId,
      input.organizationId,
    );
    const current = await this.database.bir2316Issuance.findFirst({
      where: {
        employeeId: input.employeeId,
        organizationId: input.organizationId,
        taxYear: input.taxYear,
      },
      orderBy: { version: 'desc' },
    });
    if (current?.status === 'ISSUED') {
      throw new ConflictException(
        'A certificate is already issued for this employee-year; void it before re-issuing',
      );
    }
    const preview = await this.generateBir2316(
      input.employeeId,
      input.organizationId,
      input.taxYear,
    );
    if (preview.remainingDifferenceCents !== 0n) {
      throw new UnprocessableEntityException(
        'An unsettled tax difference remains; post a settlement before issuing a certificate',
      );
    }
    const queue = await this.listYearEndReconciliations(
      input.organizationId,
      input.taxYear,
    );
    const row = queue.rows.find(
      (entry) => entry.employeeId === input.employeeId,
    );
    if (!row || row.status === 'BLOCKED_REVIEW') {
      throw new UnprocessableEntityException(
        'Year-end evidence is incomplete for this employee; resolve the review queue before issuing a certificate',
      );
    }
    const declaration = await this.database.priorEmployerDeclaration.findFirst({
      where: {
        employeeId: input.employeeId,
        organizationId: input.organizationId,
        taxYear: input.taxYear,
      },
      orderBy: { version: 'desc' },
    });
    const { partIVA } = preview.certificate;
    const fingerprint = await this.getTaxSourceFingerprint(
      input.employeeId,
      input.organizationId,
      input.taxYear,
    );
    const cents = (value: bigint) => value.toString();
    return createEvidence(() =>
      this.database.bir2316Issuance.create({
        data: {
          employeeId: input.employeeId,
          organizationId: input.organizationId,
          taxYear: input.taxYear,
          status: 'ISSUED',
          snapshot: {
            sourceFingerprint: fingerprint,
            sourceFormat: TAX_SOURCE_FORMAT,
            grossCents: cents(partIVA.grossCompensationIncomeCents),
            taxableCents: cents(partIVA.totalTaxableCompensationCents),
            taxDueCents: cents(partIVA.taxDueAnnualCents),
            withheldCents: cents(partIVA.totalTaxWithheldCents),
            adjustmentCents: cents(partIVA.taxAdjustmentCents),
            priorEmployerTotals: preview.priorEmployerTotals
              ? {
                  employerCount: preview.priorEmployerTotals.employerCount,
                  grossCents: cents(preview.priorEmployerTotals.grossCents),
                  taxableCents: cents(preview.priorEmployerTotals.taxableCents),
                  withheldCents: cents(
                    preview.priorEmployerTotals.withheldCents,
                  ),
                }
              : null,
            settlementId: preview.settlement?.id ?? null,
            reconciliationStatus: preview.reconciliationStatus,
            frozenAt: new Date().toISOString(),
          },
          hadPriorEmployer: declaration?.hasPriorEmployer ?? false,
          issuedById: input.issuedById,
          version: (current?.version ?? 0) + 1,
          supersedesId: current?.id ?? null,
        },
        select: {
          id: true,
          employeeId: true,
          taxYear: true,
          status: true,
          snapshot: true,
          hadPriorEmployer: true,
          issuedById: true,
          issuedAt: true,
          version: true,
          supersedesId: true,
          createdAt: true,
        },
      }),
    );
  }

  /**
   * Voids an issued certificate without deleting history. Correct the
   * underlying evidence, then re-issue a new version.
   */
  async voidBir2316Issuance(input: {
    employeeId: string;
    organizationId: string;
    taxYear: number;
    voidReason: string;
    voidedById: string;
  }) {
    assertSupportedTaxYear(input.taxYear);
    await assertEmployeeInTenant(
      this.database,
      input.employeeId,
      input.organizationId,
    );
    const voidReason = assertCorrectionReason(input.voidReason);
    const current = await this.database.bir2316Issuance.findFirst({
      where: {
        employeeId: input.employeeId,
        organizationId: input.organizationId,
        taxYear: input.taxYear,
      },
      orderBy: { version: 'desc' },
    });
    if (current?.status !== 'ISSUED') {
      throw new NotFoundException(
        'No issued certificate exists to void for this employee-year',
      );
    }
    return this.database.bir2316Issuance.update({
      where: { id: current.id },
      data: {
        status: 'VOIDED',
        voidedById: input.voidedById,
        voidedAt: new Date(),
        voidReason,
      },
    });
  }

  /**
   * Posts an auditable December/termination settlement for a computed year-end
   * tax difference. A 2316 worksheet difference is not a payment: this row
   * records that a deficiency was actually withheld from disbursed payroll,
   * or that a refund was actually paid to the employee. Write-once per
   * employee-year; corrections require controlled manual review.
   *
   * Timing: active staff settle against December payroll only (RR 11-2018
   * annualization). Separated staff settle against a month with disbursed
   * payroll (last/termination pay). A deficiency larger than that month's
   * disbursed net pay is rejected instead of driving net negative.
   */
  async recordYearEndSettlement(input: {
    employeeId: string;
    organizationId: string;
    taxYear: number;
    settlementDate: Date;
    documentReference: string;
    recordedById: string;
  }) {
    const existing = await this.database.yearEndTaxSettlement.findFirst({
      where: {
        employeeId: input.employeeId,
        organizationId: input.organizationId,
        taxYear: input.taxYear,
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Year-end tax is already settled for this employee-year; use the correction procedure with a reviewer to supersede it',
      );
    }
    const posting = await this.prepareSettlementPosting(input);
    return createEvidence(() =>
      this.database.yearEndTaxSettlement.create({
        data: {
          employeeId: input.employeeId,
          organizationId: input.organizationId,
          taxYear: input.taxYear,
          settlementType: posting.settlementType,
          computedDifferenceCents: posting.adjustment,
          settledCents: posting.settledCents,
          settlementDate: posting.settlementDate,
          documentReference: posting.documentReference,
          recordedById: input.recordedById,
        },
        select: {
          id: true,
          employeeId: true,
          taxYear: true,
          settlementType: true,
          computedDifferenceCents: true,
          settledCents: true,
          settlementDate: true,
          documentReference: true,
          recordedById: true,
          createdAt: true,
        },
      }),
    );
  }

  /**
   * Supersedes a posted settlement — e.g. prior-employer figures were
   * corrected after settlement, so the recomputed difference moved. The new
   * version re-attests the total settled to date; the replaced snapshot stays
   * for audit.
   */
  async supersedeYearEndSettlement(input: {
    employeeId: string;
    organizationId: string;
    taxYear: number;
    settlementDate: Date;
    documentReference: string;
    correctionReason: string;
    recordedById: string;
    reviewerId: string;
  }) {
    const correctionReason = assertCorrectionReason(input.correctionReason);
    await assertCorrectionReviewer(this.database, {
      organizationId: input.organizationId,
      recorderId: input.recordedById,
      reviewerId: input.reviewerId,
    });
    const current = await this.database.yearEndTaxSettlement.findFirst({
      where: {
        employeeId: input.employeeId,
        organizationId: input.organizationId,
        taxYear: input.taxYear,
      },
      orderBy: { version: 'desc' },
    });
    if (!current) {
      throw new NotFoundException('No year-end settlement exists to correct');
    }
    const posting = await this.prepareSettlementPosting(input);
    const currentSigned =
      current.settlementType === 'DEFICIENCY_WITHHELD'
        ? current.settledCents
        : -current.settledCents;
    if (
      posting.adjustment === currentSigned &&
      posting.settlementType === current.settlementType
    ) {
      throw new UnprocessableEntityException(
        'Recomputed difference already matches the posted settlement; nothing to correct',
      );
    }
    return createEvidence(() =>
      this.database.yearEndTaxSettlement.create({
        data: {
          employeeId: input.employeeId,
          organizationId: input.organizationId,
          taxYear: input.taxYear,
          settlementType: posting.settlementType,
          computedDifferenceCents: posting.adjustment,
          settledCents: posting.settledCents,
          settlementDate: posting.settlementDate,
          documentReference: posting.documentReference,
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
          settlementType: true,
          computedDifferenceCents: true,
          settledCents: true,
          settlementDate: true,
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

  private async prepareSettlementPosting(input: {
    employeeId: string;
    organizationId: string;
    taxYear: number;
    settlementDate: Date;
    documentReference: string;
  }): Promise<{
    documentReference: string;
    settlementDate: Date;
    adjustment: bigint;
    settlementType: YearEndSettlementType;
    settledCents: bigint;
  }> {
    assertSupportedTaxYear(input.taxYear);
    const documentReference = input.documentReference.trim();
    if (!documentReference || documentReference.length > 160) {
      throw new UnprocessableEntityException(
        'Settlement requires a document reference of 1–160 characters',
      );
    }
    const settlementDate = new Date(
      Date.UTC(
        input.settlementDate.getUTCFullYear(),
        input.settlementDate.getUTCMonth(),
        input.settlementDate.getUTCDate(),
      ),
    );
    if (Number.isNaN(settlementDate.getTime())) {
      throw new UnprocessableEntityException('Settlement date is invalid');
    }
    if (settlementDate.getUTCFullYear() !== input.taxYear) {
      throw new UnprocessableEntityException(
        'Settlement date must fall within the tax year being settled',
      );
    }
    const employee = await this.database.employee.findFirst({
      where: { id: input.employeeId, organizationId: input.organizationId },
      select: { id: true, employmentStatus: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    // Recompute from the disbursed ledger so the posted amount always matches
    // current payroll; never trust a client-supplied amount.
    const { certificate } = await this.generateBir2316(
      input.employeeId,
      input.organizationId,
      input.taxYear,
    );
    const adjustment = certificate.partIVA.taxAdjustmentCents;
    if (adjustment === 0n) {
      throw new UnprocessableEntityException(
        'Annual withholding already matches tax due; nothing to settle',
      );
    }
    const settlementType =
      adjustment > 0n ? 'DEFICIENCY_WITHHELD' : 'REFUND_PAID';
    const settledCents = adjustment > 0n ? adjustment : -adjustment;

    const monthStart = new Date(
      Date.UTC(
        settlementDate.getUTCFullYear(),
        settlementDate.getUTCMonth(),
        1,
      ),
    );
    const nextMonth = new Date(
      Date.UTC(
        settlementDate.getUTCFullYear(),
        settlementDate.getUTCMonth() + 1,
        1,
      ),
    );
    const monthPayslips = await this.database.payslip.findMany({
      where: {
        employeeId: input.employeeId,
        payrollRun: {
          organizationId: input.organizationId,
          status: 'DISBURSED',
          paymentDate: { gte: monthStart, lt: nextMonth },
        },
      },
      select: { netPayCents: true },
    });
    if (monthPayslips.length === 0) {
      throw new UnprocessableEntityException(
        'Settlement requires a disbursed payroll payment in the settlement month',
      );
    }
    if (
      (employee.employmentStatus === 'ACTIVE' ||
        employee.employmentStatus === 'ON_LEAVE' ||
        employee.employmentStatus === 'SUSPENDED') &&
      settlementDate.getUTCMonth() !== 11
    ) {
      throw new UnprocessableEntityException(
        'Active employees settle year-end tax in December; separated employees settle with termination/last pay',
      );
    }
    if (settlementType === 'DEFICIENCY_WITHHELD') {
      const monthNet = monthPayslips.reduce(
        (sum, slip) => sum + slip.netPayCents,
        0n,
      );
      if (settledCents > monthNet) {
        throw new UnprocessableEntityException(
          'Deficiency exceeds the settlement month’s disbursed net pay; collect the balance separately instead of driving net pay negative',
        );
      }
    }
    return {
      documentReference,
      settlementDate,
      adjustment,
      settlementType,
      settledCents,
    };
  }
}

/**
 * BIR certificates for a tax year are due to employees by January 31 of the
 * following year (sooner on termination). Informational only: lateness never
 * rewrites computed figures.
 */
function issuanceTiming(taxYear: number): {
  statutoryDeadline: string;
  isLate: boolean;
} {
  const deadline = new Date(Date.UTC(taxYear + 1, 0, 31));
  const statutoryDeadline = deadline.toISOString().slice(0, 10);
  return {
    statutoryDeadline,
    // The whole January 31 civil day counts: lateness is judged in Manila,
    // so issuing during Jan 31 (evening Manila is already Feb 1 UTC) is not.
    isLate: manilaToday() > statutoryDeadline,
  };
}
