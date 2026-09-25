import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { prisma } from '@workspace/db';
import type {
  ThirteenthMonthBatchResult,
  ThirteenthMonthEmployeeResult,
} from '@workspace/payroll-engine';

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
  /**
   * Generates a structured bank transmittal CSV string for the specified payroll run and bank.
   */
  async generateBankTransmittalCsv(
    payrollRunId: string,
    bankFormat: BankFormat,
    organizationId: string,
  ): Promise<string> {
    const run = await prisma.payrollRun.findFirst({
      where: { id: payrollRunId, organizationId },
      select: { status: true },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'APPROVED' && run.status !== 'DISBURSED') {
      throw new UnprocessableEntityException(
        'Bank transmittals require an approved payroll run',
      );
    }

    const payslips = await prisma.payslip.findMany({
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
    const payslips = await prisma.payslip.findMany({
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
    const employee = await prisma.employee.findFirst({
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
          'Tax evidence for this key already exists; corrections require manual review',
        );
      }
      throw error;
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
    return this.createEvidence(() =>
      prisma.priorEmployerDeclaration.create({
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
    const declaration = await prisma.priorEmployerDeclaration.findUnique({
      where: {
        employeeId_taxYear: {
          employeeId: input.employeeId,
          taxYear: input.taxYear,
        },
      },
    });
    if (
      !declaration ||
      declaration.organizationId !== input.organizationId ||
      !declaration.hasPriorEmployer
    ) {
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
    return this.createEvidence(() =>
      prisma.previousEmployerIncome.create({
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
    return this.createEvidence(() =>
      prisma.monthlyTaxRemittanceEvidence.create({
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

  async getTaxEvidence(
    employeeId: string,
    organizationId: string,
    taxYear: number,
  ) {
    this.assertSupportedTaxYear(taxYear);
    await this.assertEmployeeInTenant(employeeId, organizationId);
    const [declaration, previousEmployers, monthlyRemittances] =
      await Promise.all([
        prisma.priorEmployerDeclaration.findFirst({
          where: { employeeId, organizationId, taxYear },
        }),
        prisma.previousEmployerIncome.findMany({
          where: { employeeId, organizationId, taxYear },
          orderBy: { periodStart: 'asc' },
        }),
        prisma.monthlyTaxRemittanceEvidence.findMany({
          where: { organizationId, taxYear },
          orderBy: { month: 'asc' },
        }),
      ]);
    return {
      taxYear,
      selfReportedUnverified: true as const,
      declaration,
      previousEmployers,
      monthlyRemittances,
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
    const employees = await prisma.employee.findMany({
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

    const declarations = await prisma.priorEmployerDeclaration.findMany({
      where: {
        organizationId,
        taxYear,
        employeeId: { in: employees.map((employee) => employee.id) },
      },
      select: { employeeId: true, hasPriorEmployer: true },
    });
    const declarationByEmployee = new Map(
      declarations.map((entry) => [entry.employeeId, entry]),
    );
    const previousRecords = await prisma.previousEmployerIncome.findMany({
      where: {
        organizationId,
        taxYear,
        employeeId: { in: employees.map((employee) => employee.id) },
      },
      select: { employeeId: true },
    });
    const previousEmployeeIds = new Set(
      previousRecords.map((entry) => entry.employeeId),
    );
    const payslips = await prisma.payslip.findMany({
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
    const remittances = await prisma.monthlyTaxRemittanceEvidence.findMany({
      where: { organizationId, taxYear },
      select: { month: true, remittedCents: true },
    });
    const remittedByMonth = new Map(
      remittances.map((entry) => [entry.month, entry.remittedCents]),
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
        | 'BLOCKED_REVIEW';
      grossCents: bigint | null;
      taxableCents: bigint | null;
      taxDueCents: bigint | null;
      taxWithheldCents: bigint | null;
      unsettledDifferenceCents: bigint | null;
      reason?: string;
    };
    const rows: ReconciliationRow[] = [];
    for (const employee of employees) {
      const identity = {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        name: `${employee.firstName} ${employee.lastName}`,
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
        if (declaration.hasPriorEmployer) {
          throw new UnprocessableEntityException(
            previousEmployeeIds.has(employee.id)
              ? 'Previous-employer evidence recorded but not yet included in annual tax computation'
              : 'Missing previous-employer tax document',
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
        rows.push({
          ...identity,
          status: result.reconciliationStatus,
          grossCents: partIVA.grossCompensationIncomeCents,
          taxableCents: partIVA.totalTaxableCompensationCents,
          taxDueCents: partIVA.taxDueAnnualCents,
          taxWithheldCents: partIVA.totalTaxWithheldCents,
          unsettledDifferenceCents: partIVA.taxAdjustmentCents,
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
        rows.push({
          ...identity,
          status: 'BLOCKED_REVIEW',
          grossCents: null,
          taxableCents: null,
          taxDueCents: null,
          taxWithheldCents: null,
          unsettledDifferenceCents: null,
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
    const { generateBir2316Certificate, formatBir2316TextDocument } =
      await import('@workspace/payroll-engine');

    const employee = await prisma.employee.findFirst({
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

    // The payslip ledger is not a year-end tax adjustment ledger: a difference
    // here is still due for collection/refund, not proof that it happened.
    const taxAdjustmentCents = certData.partIVA.taxAdjustmentCents;
    const reconciliationStatus:
      | 'BALANCED'
      | 'DEFICIENCY_REVIEW'
      | 'REFUND_REVIEW' =
      taxAdjustmentCents === 0n
        ? 'BALANCED'
        : taxAdjustmentCents > 0n
          ? 'DEFICIENCY_REVIEW'
          : 'REFUND_REVIEW';
    const formattedDocument = formatBir2316TextDocument(certData);

    return {
      certificate: certData,
      reconciliationStatus,
      formattedDocument,
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
    const employees = await prisma.employee.findMany({
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
    const excludedManagerialCount = await prisma.employee.count({
      where: {
        organizationId,
        hireDate: { lt: yearEnd },
        isManagerial: true,
      },
    });

    const organization = await prisma.organization.findUnique({
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
