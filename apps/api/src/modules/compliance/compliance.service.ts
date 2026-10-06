import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Prisma, prisma } from '@workspace/db';
import type {
  ThirteenthMonthBatchResult,
  ThirteenthMonthEmployeeResult,
} from '@workspace/payroll-engine';
import { resolvePriorEmployerTotals } from './prior-employment.inputs';
import { sourceFingerprint, TAX_SOURCE_FORMAT } from './tax-source-fingerprint';
import { Bir2316PdfService } from './bir-2316-pdf.service';

export type BankFormat = 'BDO' | 'BPI' | 'UNIONBANK' | 'METROBANK';

function csvField(value: string): string {
  if (/^[\s]*[=+@-]/.test(value) || /[\r\n]/.test(value)) {
    throw new UnprocessableEntityException(
      'Bank transmittal contains an unsafe CSV field',
    );
  }
  return `"${value.replace(/"/g, '""')}"`;
}

export interface DoleReportDetails {
  natureOfBusiness: string;
  contactPerson: string;
  contactNumber: string;
  contactTitle: string;
}

export interface BankTransmittalItem {
  employeeNumber: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  amountPesos: number;
  remarks: string;
}

export interface Bir1601CSummary {
  taxablePeriod: string;
  totalEmployees: number;
  minimumWageEarnersCount: number;
  grossCompensationPesos: number;
  nonTaxableCompensationPesos: number; // Statutory EE share + De Minimis
  taxableCompensationPesos: number;
  totalTaxWithheldPesos: number;
  // BIR remittance deadline: 10th day of the following month, or January 15
  // for the December return. eFPS filers follow their staggered eFPS schedule.
  remittanceDeadline: string; // YYYY-MM-DD
}

@Injectable()
export class ComplianceService {
  private database: Prisma.TransactionClient = prisma;
  private readonly bir2316PdfService = new Bir2316PdfService();

  /** A fresh transaction-scoped instance; never mutate the singleton service. */
  withDatabase(database: Prisma.TransactionClient): ComplianceService {
    const service = new ComplianceService();
    service.database = database;
    return service;
  }
  /**
   * Generates a structured bank transmittal CSV string for the specified payroll run and bank.
   */
  async generateBankTransmittalCsv(
    payrollRunId: string,
    bankFormat: BankFormat,
    organizationId: string,
  ): Promise<string> {
    const run = await this.database.payrollRun.findFirst({
      where: { id: payrollRunId, organizationId },
      select: { status: true },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'APPROVED' && run.status !== 'DISBURSED') {
      throw new UnprocessableEntityException(
        'Bank transmittals require an approved payroll run',
      );
    }

    const payslips = await this.database.payslip.findMany({
      where: {
        payrollRunId,
        payrollRun: {
          organizationId,
          status: { in: ['APPROVED', 'DISBURSED'] },
        },
      },
      include: {
        employee: true,
      },
    });

    // A bank file includes only that bank's accounts. Never silently export
    // placeholder account numbers or an empty file as a payment instruction.
    const bankPayslips = payslips.filter((ps) =>
      ps.employee.bankName.toUpperCase().includes(bankFormat),
    );
    if (bankPayslips.length === 0) {
      throw new UnprocessableEntityException(
        `No ${bankFormat} payslips exist in this payroll run`,
      );
    }
    if (
      bankPayslips.some(
        (ps) =>
          !ps.employee.bankAccountNumber.trim() ||
          /^0+$/.test(ps.employee.bankAccountNumber.trim()),
      )
    ) {
      throw new UnprocessableEntityException(
        'Bank transmittal contains a missing or placeholder account number',
      );
    }

    const items: BankTransmittalItem[] = bankPayslips.map((ps) => {
      const netPesos = Number(ps.netPayCents) / 100;
      return {
        employeeNumber: ps.employee.employeeNumber,
        accountName:
          ps.employee.bankAccountName ||
          `${ps.employee.firstName} ${ps.employee.lastName}`,
        accountNumber: ps.employee.bankAccountNumber || 'N/A',
        bankName: ps.employee.bankName || bankFormat,
        amountPesos: netPesos,
        remarks: `PAYROLL-${ps.id.slice(0, 8)}`,
      };
    });

    return this.formatTransmittal(bankFormat, items);
  }

  private formatTransmittal(
    format: BankFormat,
    items: BankTransmittalItem[],
  ): string {
    switch (format) {
      case 'BDO': {
        // BDO Auto-Credit Format: Account No, Amount, Beneficiary Name, Reference
        const headers =
          'Account_Number,Amount,Beneficiary_Name,Employee_ID,Reference';
        const rows = items.map(
          (i) =>
            `${csvField(i.accountNumber)},${i.amountPesos.toFixed(2)},${csvField(i.accountName)},${csvField(i.employeeNumber)},${csvField(i.remarks)}`,
        );
        return [headers, ...rows].join('\r\n');
      }
      case 'BPI': {
        // BPI ExpressLink / BizLink Format: BPI Account No, Amount, Payee Name, Ref
        const headers = 'BPI_Account_Number,Payee_Name,Amount,Remarks';
        const rows = items.map(
          (i) =>
            `${csvField(i.accountNumber)},${csvField(i.accountName)},${i.amountPesos.toFixed(2)},${csvField(i.remarks)}`,
        );
        return [headers, ...rows].join('\r\n');
      }
      case 'UNIONBANK': {
        // UnionBank The Portal Corporate Format: Account Number, Account Name, Amount, Currency, Remarks
        const headers =
          'Recipient_Account,Recipient_Name,Amount,Currency,Remarks,Employee_ID';
        const rows = items.map(
          (i) =>
            `${csvField(i.accountNumber)},${csvField(i.accountName)},${i.amountPesos.toFixed(2)},"PHP",${csvField(i.remarks)},${csvField(i.employeeNumber)}`,
        );
        return [headers, ...rows].join('\r\n');
      }
      case 'METROBANK': {
        // Metrobank Direct Corporate Banking format
        const headers = 'Metrobank_Account,Amount,Customer_Name,Description';
        const rows = items.map(
          (i) =>
            `${csvField(i.accountNumber)},${i.amountPesos.toFixed(2)},${csvField(i.accountName)},${csvField(i.remarks)}`,
        );
        return [headers, ...rows].join('\r\n');
      }
    }
  }

  /**
   * Computes BIR 1601-C (Monthly Remittance Return of Income Taxes Withheld on Compensation) summary.
   */
  async getBir1601CSummary(
    month: number,
    year: number,
    organizationId: string,
  ): Promise<Bir1601CSummary> {
    const payslips = await this.database.payslip.findMany({
      where: {
        payrollRun: {
          organizationId,
          status: 'DISBURSED',
          paymentDate: {
            gte: new Date(Date.UTC(year, month - 1, 1)),
            lt: new Date(Date.UTC(year, month, 1)),
          },
        },
      },
      include: {
        employee: { include: { compensation: true } },
      },
    });

    if (payslips.length === 0) {
      throw new UnprocessableEntityException(
        `No disbursed payslips exist for ${year}-${String(month).padStart(2, '0')}`,
      );
    }

    let grossCents = 0n;
    let nonTaxableCents = 0n;
    let taxableCents = 0n;
    let taxWithheldCents = 0n;
    const employeeIds = new Set<string>();
    const mweIds = new Set<string>();

    for (const ps of payslips) {
      grossCents += ps.grossPayCents;
      nonTaxableCents +=
        ps.nonTaxableAllowancesCents +
        ps.sssEmployeeCents +
        ps.philhealthEmployeeCents +
        ps.pagibigEmployeeCents;
      // Taxable income is gross pay minus non-taxable allowances and statutory contributions
      const taxable =
        ps.grossPayCents >
        ps.nonTaxableAllowancesCents +
          ps.sssEmployeeCents +
          ps.philhealthEmployeeCents +
          ps.pagibigEmployeeCents
          ? ps.grossPayCents -
            (ps.nonTaxableAllowancesCents +
              ps.sssEmployeeCents +
              ps.philhealthEmployeeCents +
              ps.pagibigEmployeeCents)
          : 0n;
      taxableCents += taxable;
      taxWithheldCents += ps.withholdingTaxCents;
      employeeIds.add(ps.employeeId);
      if (ps.employee.compensation?.isTaxExempt) {
        mweIds.add(ps.employeeId);
      }
    }

    const deadlineYear = month === 12 ? year + 1 : year;
    const deadlineMonth = month === 12 ? 1 : month + 1;
    const deadlineDay = month === 12 ? 15 : 10;

    return {
      taxablePeriod: `${year}-${String(month).padStart(2, '0')}`,
      totalEmployees: employeeIds.size,
      minimumWageEarnersCount: mweIds.size,
      grossCompensationPesos: Number(grossCents) / 100,
      nonTaxableCompensationPesos: Number(nonTaxableCents) / 100,
      taxableCompensationPesos: Number(taxableCents) / 100,
      totalTaxWithheldPesos: Number(taxWithheldCents) / 100,
      remittanceDeadline: `${deadlineYear}-${String(deadlineMonth).padStart(2, '0')}-${String(deadlineDay).padStart(2, '0')}`,
    };
  }

  private async assertEmployeeInTenant(
    employeeId: string,
    organizationId: string,
  ) {
    const employee = await this.database.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
  }

  private async createEvidence<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Tax evidence for this key already exists; use the correction procedure with a reviewer to supersede it',
        );
      }
      throw error;
    }
  }

  private assertCorrectionReason(reason: string): string {
    const trimmed = reason.trim();
    if (trimmed.length < 10 || trimmed.length > 500) {
      throw new UnprocessableEntityException(
        'Correction requires a reason of 10–500 characters',
      );
    }
    return trimmed;
  }

  private async assertCorrectionReviewer(input: {
    organizationId: string;
    recorderId: string;
    reviewerId: string;
  }): Promise<void> {
    if (input.reviewerId === input.recorderId) {
      throw new UnprocessableEntityException(
        'Correction reviewer must differ from the recorder (four-eyes)',
      );
    }
    const reviewer = await this.database.user.findFirst({
      where: {
        id: input.reviewerId,
        organizationId: input.organizationId,
        isActive: true,
        role: { in: ['SUPER_ADMIN', 'HR_ADMIN'] },
      },
      select: { id: true },
    });
    if (!reviewer) {
      throw new UnprocessableEntityException(
        'Correction reviewer must be an active HR/admin in this organization',
      );
    }
  }

  async recordPriorEmployerDeclaration(input: {
    employeeId: string;
    organizationId: string;
    taxYear: number;
    hasPriorEmployer: boolean;
    sourceReference: string;
    recordedById: string;
  }) {
    this.assertSupportedTaxYear(input.taxYear);
    await this.assertEmployeeInTenant(input.employeeId, input.organizationId);
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
    return this.createEvidence(() =>
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
    this.assertSupportedTaxYear(input.taxYear);
    await this.assertEmployeeInTenant(input.employeeId, input.organizationId);
    const correctionReason = this.assertCorrectionReason(
      input.correctionReason,
    );
    await this.assertCorrectionReviewer({
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
    return this.createEvidence(() =>
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
    this.assertSupportedTaxYear(input.taxYear);
    await this.assertEmployeeInTenant(input.employeeId, input.organizationId);
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
    return this.createEvidence(() =>
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
    this.assertSupportedTaxYear(input.taxYear);
    await this.assertEmployeeInTenant(input.employeeId, input.organizationId);
    const correctionReason = this.assertCorrectionReason(
      input.correctionReason,
    );
    await this.assertCorrectionReviewer({
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
    return this.createEvidence(() =>
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

  async recordMonthlyTaxRemittance(input: {
    organizationId: string;
    taxYear: number;
    month: number;
    remittedCents: bigint;
    documentReference: string;
    recordedById: string;
  }) {
    this.assertSupportedTaxYear(input.taxYear);
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
    return this.createEvidence(() =>
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
    this.assertSupportedTaxYear(input.taxYear);
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
    const correctionReason = this.assertCorrectionReason(
      input.correctionReason,
    );
    await this.assertCorrectionReviewer({
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
    return this.createEvidence(() =>
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
    this.assertSupportedTaxYear(taxYear);
    await this.assertEmployeeInTenant(employeeId, organizationId);
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

  async getYearEndSettlement(
    employeeId: string,
    organizationId: string,
    taxYear: number,
  ) {
    this.assertSupportedTaxYear(taxYear);
    await this.assertEmployeeInTenant(employeeId, organizationId);
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
    this.assertSupportedTaxYear(taxYear);
    await this.assertEmployeeInTenant(employeeId, organizationId);
    const issuance = await this.database.bir2316Issuance.findFirst({
      where: { employeeId, organizationId, taxYear },
      orderBy: { version: 'desc' },
    });
    if (!issuance) return null;
    return {
      ...issuance,
      ...issuanceTiming(issuance.taxYear),
      ...(await this.issuanceFreshness(
        issuance,
        employeeId,
        organizationId,
        taxYear,
      )),
    };
  }

  /** Conservative source identity, not a claim of regulatory validity. */
  async getTaxSourceFingerprint(
    employeeId: string,
    organizationId: string,
    taxYear: number,
  ): Promise<string> {
    const employee = await this.database.employee.findFirst({
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
    const [declarations, incomes, remittances, settlements] = await Promise.all(
      [
        this.database.priorEmployerDeclaration.findMany({
          where: { employeeId, organizationId, taxYear },
          orderBy: { id: 'asc' },
        }),
        this.database.previousEmployerIncome.findMany({
          where: { employeeId, organizationId, taxYear },
          orderBy: { id: 'asc' },
        }),
        this.database.monthlyTaxRemittanceEvidence.findMany({
          where: { organizationId, taxYear },
          orderBy: { id: 'asc' },
        }),
        this.database.yearEndTaxSettlement.findMany({
          where: { employeeId, organizationId, taxYear },
          orderBy: { id: 'asc' },
        }),
      ],
    );
    return sourceFingerprint({
      format: TAX_SOURCE_FORMAT,
      employee,
      declarations,
      incomes,
      remittances,
      settlements,
    });
  }

  private async issuanceFreshness(
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
    const current = await this.getTaxSourceFingerprint(
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
    this.assertSupportedTaxYear(input.taxYear);
    await this.assertEmployeeInTenant(input.employeeId, input.organizationId);
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
    return this.createEvidence(() =>
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
    this.assertSupportedTaxYear(input.taxYear);
    await this.assertEmployeeInTenant(input.employeeId, input.organizationId);
    const voidReason = this.assertCorrectionReason(input.voidReason);
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
    return this.createEvidence(() =>
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
    const correctionReason = this.assertCorrectionReason(
      input.correctionReason,
    );
    await this.assertCorrectionReviewer({
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
    return this.createEvidence(() =>
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
    settlementType: string;
    settledCents: bigint;
  }> {
    this.assertSupportedTaxYear(input.taxYear);
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

  /**
   * Read-only, tenant-scoped review queue. Include only employees with a
   * disbursed payslip paid in the selected tax year. A blocked row is never
   * treated as a zero-tax employee or silently dropped from the totals.
   * These totals are NOT remittances or paid refunds.
   */
  async listYearEndReconciliations(organizationId: string, taxYear: number) {
    this.assertSupportedTaxYear(taxYear);
    const paymentDate = {
      gte: new Date(Date.UTC(taxYear, 0, 1)),
      lt: new Date(Date.UTC(taxYear + 1, 0, 1)),
    };
    const employees = await this.database.employee.findMany({
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

    const declarations = await this.database.priorEmployerDeclaration.findMany({
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
    const previousRecords = await this.database.previousEmployerIncome.findMany(
      {
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
      },
    );
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
    const issuances = await this.database.bir2316Issuance.findMany({
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
    const payslips = await this.database.payslip.findMany({
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
    const remittances =
      await this.database.monthlyTaxRemittanceEvidence.findMany({
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
        ? await this.issuanceFreshness(
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
        if (
          missingRemittanceMonths.length ||
          mismatchedRemittanceMonths.length
        ) {
          throw new UnprocessableEntityException(
            'Monthly withholding remittance evidence is incomplete or differs from disbursed payslips',
          );
        }
        const result = await this.generateBir2316(
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
      blockedCount: rows.filter((row) => row.status === 'BLOCKED_REVIEW')
        .length,
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

  /**
   * Previews a read-only BIR 2316 reconciliation worksheet. NOT an official
   * certificate: tax adjustments are computed but not settled by this method.
   */
  async generateBir2316(
    employeeId: string,
    organizationId: string,
    taxYear = new Date().getFullYear(),
  ) {
    this.assertSupportedTaxYear(taxYear);
    const {
      generateBir2316Certificate,
      formatBir2316TextDocument,
      annualizeTax,
      reconcileTaxAdjustment,
    } = await import('@workspace/payroll-engine');

    const employee = await this.database.employee.findFirst({
      where: { id: employeeId, organizationId },
      include: {
        organization: true,
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
        },
      },
    });

    if (!employee?.compensation) {
      throw new NotFoundException(
        `Employee ${employeeId} or compensation profile not found`,
      );
    }
    if (employee.payslips.length === 0) {
      throw new UnprocessableEntityException(
        `No disbursed payslips exist for employee ${employeeId} in ${taxYear}`,
      );
    }

    const org = employee.organization;

    let totalBasicSalaryCents = 0n;
    let totalOvertimePayCents = 0n;
    let totalHolidayPayCents = 0n;
    let totalNightDiffPayCents = 0n;
    let totalDeMinimisBenefitsCents = 0n;
    let totalThirteenthMonthAndBonusesCents = 0n;
    let totalOtherTaxableAllowancesCents = 0n;
    let totalSssEmployeeShareCents = 0n;
    let totalPhilhealthEmployeeShareCents = 0n;
    let totalPagibigEmployeeShareCents = 0n;
    let totalTaxWithheldCents = 0n;

    for (const p of employee.payslips) {
      if (p.deMinimisExcessCents > 0n) {
        throw new UnprocessableEntityException(
          'BIR 2316 cannot yet classify de minimis excess between exempt and taxable benefits; reconcile this employee before exporting',
        );
      }
      // Special-run taxable/exempt allowances are the two sides of the
      // recorded bonus payout; counting them here would count it twice.
      if (p.bonusPaidCents > 0n) {
        totalThirteenthMonthAndBonusesCents += p.bonusPaidCents;
      } else {
        const timeDeductions =
          p.tardinessDeductionCents +
          p.undertimeDeductionCents +
          p.absenceDeductionCents;
        totalBasicSalaryCents +=
          p.basicPayCents > timeDeductions
            ? p.basicPayCents - timeDeductions
            : 0n;
        totalOvertimePayCents += p.overtimePayCents;
        totalHolidayPayCents += p.holidayPayCents;
        totalNightDiffPayCents += p.nightDiffPayCents;
        totalDeMinimisBenefitsCents += p.nonTaxableAllowancesCents;
        totalOtherTaxableAllowancesCents +=
          p.taxableAllowancesCents + p.restDayPayCents;
      }
      // sssEmployeeCents already includes the WISP subset recorded separately.
      totalSssEmployeeShareCents += p.sssEmployeeCents;
      totalPhilhealthEmployeeShareCents += p.philhealthEmployeeCents;
      totalPagibigEmployeeShareCents += p.pagibigEmployeeCents;
      totalTaxWithheldCents += p.withholdingTaxCents;
    }

    if (
      employee.compensation.isTaxExempt &&
      (totalOtherTaxableAllowancesCents > 0n ||
        totalThirteenthMonthAndBonusesCents > 9000000n)
    ) {
      throw new UnprocessableEntityException(
        'BIR 2316 requires manual tax review for minimum-wage earners with other taxable benefits',
      );
    }

    const certData = generateBir2316Certificate(
      taxYear,
      {
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        middleName: employee.middleName || undefined,
        tin: employee.tin,
        residentialAddress: employee.residentialAddress,
        isMinimumWageEarner: employee.compensation.isTaxExempt ?? false,
      },
      {
        registeredName: org.name,
        tin: org.tin,
        rdoCode: org.rdoCode,
        registeredAddress: org.registeredAddress,
      },
      {
        totalBasicSalaryCents,
        totalOvertimePayCents,
        totalHolidayPayCents,
        totalNightDiffPayCents,
        totalDeMinimisBenefitsCents,
        totalThirteenthMonthAndBonusesCents,
        totalOtherTaxableAllowancesCents,
        totalSssEmployeeShareCents,
        totalPhilhealthEmployeeShareCents,
        totalPagibigEmployeeShareCents,
        totalTaxWithheldCents,
      },
    );

    const recordedGrossCents = employee.payslips.reduce(
      (sum, p) => sum + p.grossPayCents,
      0n,
    );
    if (certData.partIVA.grossCompensationIncomeCents !== recordedGrossCents) {
      throw new UnprocessableEntityException(
        'BIR 2316 totals cannot be reconciled with recorded payslips; review benefit classifications before exporting',
      );
    }

    // Successor-employer annualization (RR 11-2018 §2.79): transcribed
    // previous-employer taxable compensation and withholding join the
    // present-employer figures in one graduated-table computation. Prior
    // taxable is taken as stated on the transcribed 2316 — the previous
    // employer applied its own ₱90,000 cap — and is never re-bucketed here.
    const [priorDeclaration, priorRecordVersions] = await Promise.all([
      this.database.priorEmployerDeclaration.findFirst({
        where: { employeeId, organizationId, taxYear },
        orderBy: { version: 'desc' },
        select: { hasPriorEmployer: true },
      }),
      this.database.previousEmployerIncome.findMany({
        where: { employeeId, organizationId, taxYear },
      }),
    ]);
    const presentEmployerTotals = {
      grossCents: certData.partIVA.grossCompensationIncomeCents,
      taxableCents: certData.partIVA.totalTaxableCompensationCents,
      withheldCents: certData.partIVA.totalTaxWithheldCents,
    };
    const priorEmployerTotals = resolvePriorEmployerTotals(
      priorDeclaration,
      priorRecordVersions,
      { taxYear },
    );
    if (priorEmployerTotals) {
      const {
        grossCents: priorGrossCents,
        taxableCents: priorTaxableCents,
        withheldCents: priorWithheldCents,
      } = priorEmployerTotals;
      // A minimum-wage earner whose prior pay was itself taxable needs
      // period-by-period wage analysis, not automatic annualization.
      if (
        certData.isMwe &&
        (priorTaxableCents > 0n || priorWithheldCents > 0n)
      ) {
        throw new UnprocessableEntityException(
          'BIR 2316 requires manual tax review for minimum-wage earners with prior-employer taxable income or withholding',
        );
      }
      const combinedTaxableCents =
        certData.partIVA.totalTaxableCompensationCents + priorTaxableCents;
      const combinedWithheldCents =
        certData.partIVA.totalTaxWithheldCents + priorWithheldCents;
      const { totalAnnualTaxDueCents, taxAdjustmentCents: combinedAdjustment } =
        annualizeTax(
          combinedTaxableCents,
          combinedWithheldCents,
          certData.isMwe,
        );
      certData.partIVA.grossCompensationIncomeCents += priorGrossCents;
      certData.partIVA.totalTaxableCompensationCents = combinedTaxableCents;
      certData.partIVA.taxDueAnnualCents = totalAnnualTaxDueCents;
      certData.partIVA.totalTaxWithheldCents = combinedWithheldCents;
      certData.partIVA.taxAdjustmentCents = combinedAdjustment;
      certData.partIVA.refundDueEmployeeCents =
        combinedAdjustment < 0n ? -combinedAdjustment : 0n;
      certData.partIVA.taxPayableByEmployeeCents =
        combinedAdjustment > 0n ? combinedAdjustment : 0n;
    }

    // The payslip ledger is not a year-end tax adjustment ledger: a difference
    // here is still due for collection/refund, not proof that it happened.
    // A posted settlement zeroes only the amount it actually covered; later
    // disbursed payslips change the recomputed adjustment, so the remaining
    // balance is derived live instead of trusting the snapshot.
    const taxAdjustmentCents = certData.partIVA.taxAdjustmentCents;
    const settlement = await this.database.yearEndTaxSettlement.findFirst({
      where: { employeeId, organizationId, taxYear },
      orderBy: { version: 'desc' },
    });
    const settledDelta = settlement
      ? settlement.settlementType === 'DEFICIENCY_WITHHELD'
        ? settlement.settledCents
        : -settlement.settledCents
      : 0n;
    const { remainingDifferenceCents, isSettled, reconciliationStatus } =
      reconcileTaxAdjustment(
        taxAdjustmentCents,
        settledDelta,
        settlement !== null,
      );
    const formattedDocument = formatBir2316TextDocument(certData);
    const documentWithPrior = priorEmployerTotals
      ? [
          formattedDocument,
          '------------------------------------------------------------------------------------------',
          'PRIOR EMPLOYER INCOME (TRANSCRIBED 2316 FIGURES, SELF-REPORTED — NOT VERIFIED)',
          `  Previous employers recorded ............................. ${priorEmployerTotals.employerCount}`,
          `  Effective documents recorded ............................ ${priorEmployerTotals.documentCount}`,
          `  Prior gross compensation ................................ PHP ${(Number(priorEmployerTotals.grossCents) / 100).toFixed(2)}`,
          `  Prior taxable compensation .............................. PHP ${(Number(priorEmployerTotals.taxableCents) / 100).toFixed(2)}`,
          `  Prior tax withheld ...................................... PHP ${(Number(priorEmployerTotals.withheldCents) / 100).toFixed(2)}`,
          '  Combined totals above annualize these transcribed prior-employer',
          '  figures with present-employer payroll per RR 11-2018 §2.79.',
          '  Wage/benefit detail sections remain PRESENT-EMPLOYER ONLY.',
        ].join('\r\n')
      : formattedDocument;

    return {
      certificate: certData,
      reconciliationStatus,
      formattedDocument: [
        documentWithPrior,
        `RECORDED SETTLEMENT DELTA (CENTAVOS): ${settledDelta}`,
        `REMAINING DIFFERENCE TO REVIEW (CENTAVOS): ${remainingDifferenceCents}`,
      ].join('\r\n'),
      settlement,
      remainingDifferenceCents,
      isSettled,
      priorEmployerTotals,
      presentEmployerTotals,
      employerBreakdownScope: 'PRESENT_EMPLOYER_ONLY' as const,
    };
  }

  /**
   * Generates a 2-page publication-quality official BIR Form 2316 PDF document.
   */
  async generateBir2316Pdf(
    employeeId: string,
    organizationId: string,
    taxYear = new Date().getFullYear(),
    isPreview = false,
  ) {
    this.assertSupportedTaxYear(taxYear);
    const preview = await this.generateBir2316(
      employeeId,
      organizationId,
      taxYear,
    );

    const employee = await this.database.employee.findFirst({
      where: { id: employeeId, organizationId },
      include: {
        organization: true,
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    const issuance = await this.database.bir2316Issuance.findFirst({
      where: {
        employeeId,
        organizationId,
        taxYear,
      },
      orderBy: { version: 'desc' },
    });

    const isOfficiallyIssued = issuance?.status === 'ISSUED' && !isPreview;

    // Previous employer record if any
    const previousEmployer = await this.database.previousEmployerIncome.findFirst({
      where: {
        employeeId,
        organizationId,
        taxYear,
      },
      orderBy: { version: 'desc' },
    });

    const pdfBuffer = await this.bir2316PdfService.renderPdf({
      taxYear,
      employee: {
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        middleName: employee.middleName,
        suffix: employee.suffix,
        tin: employee.tin,
        residentialAddress: employee.residentialAddress,
        zipCode: null,
        dateOfBirth: employee.dateOfBirth,
        contactNumber: null,
        isMinimumWageEarner: preview.certificate.isMwe,
      },
      employer: {
        name: employee.organization.name,
        tin: employee.organization.tin,
        rdoCode: employee.organization.rdoCode,
        registeredAddress: employee.organization.registeredAddress,
      },
      previousEmployer: previousEmployer
        ? {
            employerName: previousEmployer.employerName,
            employerTin: previousEmployer.employerTin,
            periodStart: previousEmployer.periodStart,
            periodEnd: previousEmployer.periodEnd,
            grossCompensationCents: previousEmployer.grossCompensationCents,
            taxableCompensationCents: previousEmployer.taxableCompensationCents,
            taxWithheldCents: previousEmployer.taxWithheldCents,
          }
        : null,
      partIVA: preview.certificate.partIVA,
      partIVB: preview.certificate.partIVB,
      partIVC: preview.certificate.partIVC,
      priorEmployerTotals: preview.priorEmployerTotals,
      isMwe: preview.certificate.isMwe,
      isIssued: isOfficiallyIssued,
      issuanceId: issuance?.id,
      version: issuance?.version,
      issuedAt: issuance?.issuedAt,
      isSettled: preview.isSettled,
    });

    const cleanLastName = employee.lastName.replace(/[^a-zA-Z0-9]/g, '');
    const cleanFirstName = employee.firstName.replace(/[^a-zA-Z0-9]/g, '');
    const statePrefix = isOfficiallyIssued ? 'OFFICIAL' : 'PREVIEW';
    const fileName = `BIR2316_${taxYear}_${cleanLastName}_${cleanFirstName}_${statePrefix}.pdf`;

    return {
      fileName,
      dataBase64: pdfBuffer.toString('base64'),
      isIssued: isOfficiallyIssued,
      version: issuance?.version,
      issuedAt: issuance?.issuedAt ? issuance.issuedAt.toISOString() : undefined,
    };
  }

  private assertSupportedTaxYear(taxYear: number): void {
    if (!Number.isInteger(taxYear) || taxYear < 2023 || taxYear > 2100) {
      throw new UnprocessableEntityException(
        'BIR tax reconciliation supports 2023–2100 only; earlier years require a different annual tax table',
      );
    }
  }

  /**
   * Generates official DOLE 13th Month Pay Annual Compliance Report under PD 851.
   */
  async generateDole13thMonthReport(
    organizationId: string,
    details: DoleReportDetails,
    taxYear = new Date().getFullYear(),
  ) {
    const { calculateMonthsWorkedInYear, formatDole13thMonthComplianceReport } =
      await import('@workspace/payroll-engine');
    const yearStart = new Date(Date.UTC(taxYear, 0, 1));
    const yearEnd = new Date(Date.UTC(taxYear + 1, 0, 1));

    // PD 851 covers rank-and-file employees only; Labor Code managerial
    // employees are counted separately for report transparency.
    const employees = await this.database.employee.findMany({
      where: {
        organizationId,
        isManagerial: false,
        hireDate: { lt: yearEnd },
      },
      include: {
        compensation: true,
        payslips: {
          where: {
            payrollRun: {
              organizationId,
              cutoffSequence: {
                in: ['FIRST_CUTOFF', 'SECOND_CUTOFF', 'SPECIAL_RUN'],
              },
              status: 'DISBURSED',
              paymentDate: { gte: yearStart, lt: yearEnd },
            },
          },
        },
      },
    });
    const excludedManagerialCount = await this.database.employee.count({
      where: {
        organizationId,
        hireDate: { lt: yearEnd },
        isManagerial: true,
      },
    });

    const organization = await this.database.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    const employeeResults: ThirteenthMonthEmployeeResult[] = [];
    for (const employee of employees) {
      const specials = employee.payslips.filter((p) => p.bonusPaidCents > 0n);
      if (
        employee.employmentStatus === 'ACTIVE' &&
        employee.hireDate < yearEnd &&
        specials.length === 0
      ) {
        throw new UnprocessableEntityException(
          `Employee ${employee.employeeNumber} has no disbursed 13th-month payout for ${taxYear}`,
        );
      }
      if (specials.length === 0) continue;
      if (!employee.compensation) {
        throw new UnprocessableEntityException(
          `Employee ${employee.employeeNumber} has no compensation profile`,
        );
      }

      const totalBasicEarnedCents = employee.payslips.reduce((sum, p) => {
        if (p.bonusPaidCents > 0n) return sum;
        const deductions =
          p.tardinessDeductionCents +
          p.undertimeDeductionCents +
          p.absenceDeductionCents;
        return (
          sum +
          (p.basicPayCents > deductions ? p.basicPayCents - deductions : 0n)
        );
      }, 0n);
      const thirteenthMonthPayCents = specials.reduce(
        (sum, p) => sum + p.bonusPaidCents,
        0n,
      );
      const taxExemptPortionCents = specials.reduce(
        (sum, p) => sum + p.nonTaxableAllowancesCents,
        0n,
      );
      const taxableExcessCents = specials.reduce(
        (sum, p) => sum + p.taxableAllowancesCents,
        0n,
      );
      if (
        taxExemptPortionCents + taxableExcessCents !==
        thirteenthMonthPayCents
      ) {
        throw new UnprocessableEntityException(
          `Employee ${employee.employeeNumber} has an inconsistent 13th-month payslip`,
        );
      }
      const monthsWorked = calculateMonthsWorkedInYear(
        employee.hireDate,
        taxYear,
      );
      employeeResults.push({
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        fullName: `${employee.firstName} ${employee.lastName}`,
        totalBasicEarnedCents,
        thirteenthMonthPayCents,
        taxExemptPortionCents,
        taxableExcessCents,
        isProrated:
          monthsWorked < 12 ||
          totalBasicEarnedCents <
            employee.compensation.basicRateMonthlyCents * 12n,
        monthsWorked,
      });
    }

    if (employeeResults.length === 0) {
      throw new UnprocessableEntityException(
        `No disbursed 13th-month payouts exist for ${taxYear}`,
      );
    }
    const batchResult: ThirteenthMonthBatchResult = {
      taxYear,
      totalBenefitedEmployees: employeeResults.length,
      totalThirteenthMonthPayCents: employeeResults.reduce(
        (sum, result) => sum + result.thirteenthMonthPayCents,
        0n,
      ),
      totalTaxExemptCents: employeeResults.reduce(
        (sum, result) => sum + result.taxExemptPortionCents,
        0n,
      ),
      totalTaxableExcessCents: employeeResults.reduce(
        (sum, result) => sum + result.taxableExcessCents,
        0n,
      ),
      employeeResults,
    };

    const reportText = formatDole13thMonthComplianceReport({
      taxYear,
      establishmentName: organization.name,
      registeredAddress: organization.registeredAddress,
      ...details,
      batchResult,
      excludedManagerialCount,
    });

    return {
      taxYear,
      batchResult,
      excludedManagerialCount,
      reportText,
      filename: `DOLE_13th_Month_Compliance_Report_${taxYear}.txt`,
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
  return {
    statutoryDeadline: deadline.toISOString().slice(0, 10),
    isLate: new Date() > deadline,
  };
}
