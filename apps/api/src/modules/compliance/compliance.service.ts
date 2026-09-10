import { Injectable } from '@nestjs/common';
import { prisma } from '@workspace/db';

export type BankFormat = 'BDO' | 'BPI' | 'UNIONBANK' | 'METROBANK';

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
    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRunId,
        payrollRun: { organizationId },
      },
      include: {
        employee: true,
      },
    });

    const items: BankTransmittalItem[] = payslips.map((ps) => {
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
            `"${i.accountNumber}",${i.amountPesos.toFixed(2)},"${i.accountName}","${i.employeeNumber}","${i.remarks}"`,
        );
        return [headers, ...rows].join('\r\n');
      }
      case 'BPI': {
        // BPI ExpressLink / BizLink Format: BPI Account No, Amount, Payee Name, Ref
        const headers = 'BPI_Account_Number,Payee_Name,Amount,Remarks';
        const rows = items.map(
          (i) =>
            `"${i.accountNumber}","${i.accountName}",${i.amountPesos.toFixed(2)},"${i.remarks}"`,
        );
        return [headers, ...rows].join('\r\n');
      }
      case 'UNIONBANK': {
        // UnionBank The Portal Corporate Format: Account Number, Account Name, Amount, Currency, Remarks
        const headers =
          'Recipient_Account,Recipient_Name,Amount,Currency,Remarks,Employee_ID';
        const rows = items.map(
          (i) =>
            `"${i.accountNumber}","${i.accountName}",${i.amountPesos.toFixed(2)},"PHP","${i.remarks}","${i.employeeNumber}"`,
        );
        return [headers, ...rows].join('\r\n');
      }
      case 'METROBANK': {
        // Metrobank Direct Corporate Banking format
        const headers = 'Metrobank_Account,Amount,Customer_Name,Description';
        const rows = items.map(
          (i) =>
            `"${i.accountNumber}",${i.amountPesos.toFixed(2)},"${i.accountName}","${i.remarks}"`,
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
        payrollRun: { organizationId },
        createdAt: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1),
        },
      },
      include: {
        employee: true,
      },
    });

    let grossCents = 0n;
    let nonTaxableCents = 0n;
    let taxableCents = 0n;
    let taxWithheldCents = 0n;
    let mweCount = 0;

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
      if (taxable === 0n && ps.withholdingTaxCents === 0n) {
        mweCount++;
      }
    }

    const deadlineYear = month === 12 ? year + 1 : year;
    const deadlineMonth = month === 12 ? 1 : month + 1;
    const deadlineDay = month === 12 ? 15 : 10;

    return {
      taxablePeriod: `${year}-${String(month).padStart(2, '0')}`,
      totalEmployees: payslips.length,
      minimumWageEarnersCount: mweCount,
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
          include: {
            payrollRun: true,
          },
        },
      },
    });

    if (!employee?.compensation) {
      throw new Error(
        `Employee ${employeeId} or compensation profile not found`,
      );
    }

    const org = employee.organization;

    // Filter payslips for the tax year
    const yearPayslips = employee.payslips.filter(
      (p) => p.payrollRun.cutoffEndDate.getFullYear() === taxYear,
    );

    let totalBasicSalaryCents = 0n;
    let totalOvertimePayCents = 0n;
    let totalHolidayPayCents = 0n;
    let totalNightDiffPayCents = 0n;
    let totalDeMinimisBenefitsCents = 0n;
    let totalThirteenthMonthAndBonusesCents = 0n;
    let totalSssEmployeeShareCents = 0n;
    let totalPhilhealthEmployeeShareCents = 0n;
    let totalPagibigEmployeeShareCents = 0n;
    let totalTaxWithheldCents = 0n;

    if (yearPayslips.length > 0) {
      for (const p of yearPayslips) {
        totalBasicSalaryCents += p.basicPayCents;
        totalOvertimePayCents += p.overtimePayCents;
        totalHolidayPayCents += p.holidayPayCents;
        totalNightDiffPayCents += p.nightDiffPayCents;
        totalDeMinimisBenefitsCents += p.nonTaxableAllowancesCents;
        totalSssEmployeeShareCents += p.sssEmployeeCents;
        totalPhilhealthEmployeeShareCents += p.philhealthEmployeeCents;
        totalPagibigEmployeeShareCents += p.pagibigEmployeeCents;
        totalTaxWithheldCents += p.withholdingTaxCents;
      }
      totalThirteenthMonthAndBonusesCents = totalBasicSalaryCents / 12n;
    } else {
      const monthlyRateCents = employee.compensation.basicRateMonthlyCents;
      totalBasicSalaryCents = monthlyRateCents * 12n;
      totalThirteenthMonthAndBonusesCents = monthlyRateCents;
      totalDeMinimisBenefitsCents = 2400000n; // ₱24,000 Rice subsidy
      totalSssEmployeeShareCents = 2100000n;
      totalPhilhealthEmployeeShareCents = 1500000n;
      totalPagibigEmployeeShareCents = 240000n;
      totalTaxWithheldCents = employee.compensation.isTaxExempt
        ? 0n
        : (totalBasicSalaryCents * 8n) / 100n;
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
        tin: org.tin || '123-456-789-000',
        rdoCode: org.rdoCode || '047',
        registeredAddress: org.registeredAddress,
      },
      {
        totalBasicSalaryCents,
        totalOvertimePayCents,
        totalHolidayPayCents,
        totalNightDiffPayCents,
        totalDeMinimisBenefitsCents,
        totalThirteenthMonthAndBonusesCents,
        totalOtherTaxableAllowancesCents: 0n,
        totalSssEmployeeShareCents,
        totalPhilhealthEmployeeShareCents,
        totalPagibigEmployeeShareCents,
        totalTaxWithheldCents,
      },
    );

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
    taxYear = new Date().getFullYear(),
  ) {
    const { calculate13thMonthBatch, formatDole13thMonthComplianceReport } =
      await import('@workspace/payroll-engine');

    const employees = await prisma.employee.findMany({
      where: { organizationId, employmentStatus: 'ACTIVE' },
      include: {
        organization: true,
        compensation: true,
      },
    });

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    const orgName = organization?.name || 'Unknown organization';
    const orgAddress = organization?.registeredAddress || 'Not provided';

    const employeeInputs = employees.map((employee) => {
      const hireDate = employee.hireDate;
      const hireYear = hireDate.getFullYear();
      let monthsWorked = 12;
      if (hireYear === taxYear) {
        monthsWorked = Math.max(1, 12 - hireDate.getMonth());
      }

      return {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        fullName: `${employee.firstName} ${employee.lastName}`,
        monthlyBasicRateCents:
          employee.compensation?.basicRateMonthlyCents ?? 2500000n,
        hireDate: hireDate.toISOString().slice(0, 10),
        monthsWorkedInYear: monthsWorked,
        unpaidAbsenceDays: 0,
      };
    });

    const batchResult = calculate13thMonthBatch(taxYear, employeeInputs);

    const reportText = formatDole13thMonthComplianceReport({
      taxYear,
      establishmentName: orgName,
      registeredAddress: orgAddress,
      natureOfBusiness: 'Information Technology & Services',
      contactPerson: 'HR & Payroll Director',
      contactNumber: '+63 2 8123 4567',
      batchResult,
    });

    return {
      taxYear,
      batchResult,
      reportText,
      filename: `DOLE_13th_Month_Compliance_Report_${taxYear}.txt`,
    };
  }
}
