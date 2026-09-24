import {
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

  /**
   * Generates official BIR Form 2316 Certificate of Compensation Payment / Tax Withheld.
   */
  async generateBir2316(
    employeeId: string,
    organizationId: string,
    taxYear = new Date().getFullYear(),
  ) {
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

    const formattedDocument = formatBir2316TextDocument(certData);

    return {
      certificate: certData,
      formattedDocument,
    };
  }

  /**
   * Generates official DOLE 13th Month Pay Annual Compliance Report under PD 851.
   */
  async generateDole13thMonthReport(
    organizationId: string,
    details: DoleReportDetails,
    taxYear = new Date().getFullYear(),
  ) {
    const {
      calculateMonthsWorkedInYear,
      formatDole13thMonthComplianceReport,
    } = await import('@workspace/payroll-engine');
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
      const specials = employee.payslips.filter(
        (p) => p.bonusPaidCents > 0n,
      );
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
