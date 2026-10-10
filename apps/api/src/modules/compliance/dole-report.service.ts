import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Prisma, prisma } from '@workspace/db';
import type {
  ThirteenthMonthBatchResult,
  ThirteenthMonthEmployeeResult,
} from '@workspace/payroll-engine';

export interface DoleReportDetails {
  natureOfBusiness: string;
  contactPerson: string;
  contactNumber: string;
  contactTitle: string;
}

@Injectable()
export class DoleReportService {
  private database: Prisma.TransactionClient = prisma;

  /** A fresh transaction-scoped instance; never mutate the singleton service. */
  withDatabase(database: Prisma.TransactionClient): DoleReportService {
    const service = new DoleReportService();
    service.database = database;
    return service;
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
