import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Prisma, prisma } from '@workspace/db';
import { formatCentavosToPesos } from '@workspace/payroll-engine';

export type BankFormat = 'BDO' | 'BPI' | 'UNIONBANK' | 'METROBANK';

function csvField(value: string): string {
  if (/^[\s]*[=+@-]/.test(value) || /[\r\n]/.test(value)) {
    throw new UnprocessableEntityException(
      'Bank transmittal contains an unsafe CSV field',
    );
  }
  return `"${value.replace(/"/g, '""')}"`;
}

export interface BankTransmittalItem {
  employeeNumber: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  // Integer centavos. Amounts are formatted to exact decimal strings only at
  // CSV render time: float division silently rounds above 2^53 centavos.
  amountCents: bigint;
  remarks: string;
}

export interface Bir1601CSummary {
  taxablePeriod: string;
  totalEmployees: number;
  minimumWageEarnersCount: number;
  // Display numerics summed from real disbursed payslips, far below the
  // 2^53-centavo float limit. Every file-bound amount in this service
  // (bank CSVs) is formatted from integer centavos via
  // formatCentavosToPesos instead.
  grossCompensationPesos: number;
  nonTaxableCompensationPesos: number; // Statutory EE share + De Minimis
  taxableCompensationPesos: number;
  totalTaxWithheldPesos: number;
  // BIR remittance deadline: 10th day of the following month, or January 15
  // for the December return. eFPS filers follow their staggered eFPS schedule.
  remittanceDeadline: string; // YYYY-MM-DD
}

@Injectable()
export class WithholdingExportsService {
  private database: Prisma.TransactionClient = prisma;

  /** A fresh transaction-scoped instance; never mutate the singleton service. */
  withDatabase(database: Prisma.TransactionClient): WithholdingExportsService {
    const service = new WithholdingExportsService();
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
      return {
        employeeNumber: ps.employee.employeeNumber,
        accountName:
          ps.employee.bankAccountName ||
          `${ps.employee.firstName} ${ps.employee.lastName}`,
        accountNumber: ps.employee.bankAccountNumber || 'N/A',
        bankName: ps.employee.bankName || bankFormat,
        amountCents: ps.netPayCents,
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
            `${csvField(i.accountNumber)},${formatCentavosToPesos(i.amountCents)},${csvField(i.accountName)},${csvField(i.employeeNumber)},${csvField(i.remarks)}`,
        );
        return [headers, ...rows].join('\r\n');
      }
      case 'BPI': {
        // BPI ExpressLink / BizLink Format: BPI Account No, Amount, Payee Name, Ref
        const headers = 'BPI_Account_Number,Payee_Name,Amount,Remarks';
        const rows = items.map(
          (i) =>
            `${csvField(i.accountNumber)},${csvField(i.accountName)},${formatCentavosToPesos(i.amountCents)},${csvField(i.remarks)}`,
        );
        return [headers, ...rows].join('\r\n');
      }
      case 'UNIONBANK': {
        // UnionBank The Portal Corporate Format: Account Number, Account Name, Amount, Currency, Remarks
        const headers =
          'Recipient_Account,Recipient_Name,Amount,Currency,Remarks,Employee_ID';
        const rows = items.map(
          (i) =>
            `${csvField(i.accountNumber)},${csvField(i.accountName)},${formatCentavosToPesos(i.amountCents)},"PHP",${csvField(i.remarks)},${csvField(i.employeeNumber)}`,
        );
        return [headers, ...rows].join('\r\n');
      }
      case 'METROBANK': {
        // Metrobank Direct Corporate Banking format
        const headers = 'Metrobank_Account,Amount,Customer_Name,Description';
        const rows = items.map(
          (i) =>
            `${csvField(i.accountNumber)},${formatCentavosToPesos(i.amountCents)},${csvField(i.accountName)},${csvField(i.remarks)}`,
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
}
