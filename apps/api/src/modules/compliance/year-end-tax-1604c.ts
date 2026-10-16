import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Prisma } from '@workspace/db';
import {
  type Bir1604CSchedule71Employee,
  type Bir1604CSchedule72Employee,
  manilaYear,
} from '@workspace/payroll-engine';
import { assertSupportedTaxYear } from './tax-evidence-guards';
import { generateBir2316 } from './year-end-tax-2316';

export async function generateBir1604CAlphalist(
  db: Prisma.TransactionClient,
  organizationId: string,
  taxYear = manilaYear(),
) {
  assertSupportedTaxYear(taxYear);
  const {
    formatBir1604CAlphalistDat,
    formatBir1604CAlphalistCsv,
    summarizeBir1604CAlphalist,
  } = await import('@workspace/payroll-engine');

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
  });
  if (!organization) throw new NotFoundException('Organization not found');
  if (!organization.tin) {
    throw new UnprocessableEntityException('Organization TIN is required');
  }

  const paymentDate = {
    gte: new Date(Date.UTC(taxYear, 0, 1)),
    lt: new Date(Date.UTC(taxYear + 1, 0, 1)),
  };
  const employees = await db.employee.findMany({
    where: {
      organizationId,
      payslips: {
        some: {
          payrollRun: { organizationId, status: 'DISBURSED', paymentDate },
        },
      },
    },
    include: {
      compensation: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  if (employees.length === 0) {
    throw new UnprocessableEntityException(
      `No disbursed payroll records found for tax year ${taxYear}`,
    );
  }

  const declarations = await db.priorEmployerDeclaration.findMany({
    where: {
      organizationId,
      taxYear,
      employeeId: { in: employees.map((e) => e.id) },
    },
    select: { employeeId: true, hasPriorEmployer: true, version: true },
  });
  const declarationByEmployee = new Map<
    string,
    { hasPriorEmployer: boolean; version: number }
  >();
  for (const d of declarations) {
    const current = declarationByEmployee.get(d.employeeId);
    if (!current || d.version > current.version) {
      declarationByEmployee.set(d.employeeId, d);
    }
  }

  const previousRecords = await db.previousEmployerIncome.findMany({
    where: {
      organizationId,
      taxYear,
      employeeId: { in: employees.map((e) => e.id) },
    },
    select: { employeeId: true, version: true, taxWithheldCents: true },
  });
  const previousEmployeeIds = new Set(previousRecords.map((r) => r.employeeId));
  const prevWithheldByEmployee = new Map(
    previousRecords.map((r) => [r.employeeId, r.taxWithheldCents]),
  );

  for (const emp of employees) {
    const decl = declarationByEmployee.get(emp.id);
    if (!decl) {
      throw new UnprocessableEntityException(
        `Employee ${emp.employeeNumber} is missing prior-employer declaration for ${taxYear}`,
      );
    }
    if (decl.hasPriorEmployer && !previousEmployeeIds.has(emp.id)) {
      throw new UnprocessableEntityException(
        `Employee ${emp.employeeNumber} has prior employer but missing previous-employer tax evidence`,
      );
    }
  }

  const schedule71: Bir1604CSchedule71Employee[] = [];
  const schedule72: Bir1604CSchedule72Employee[] = [];

  for (const emp of employees) {
    const result = await generateBir2316(db, emp.id, organizationId, taxYear);
    const decl = declarationByEmployee.get(emp.id);
    const hasPriorEmployer = decl?.hasPriorEmployer ?? false;
    const { partIVA, partIVB, partIVC } = result.certificate;

    const taxAdj = partIVA.taxAdjustmentCents;
    const isRefund = taxAdj < 0n;
    const isPayable = taxAdj > 0n;
    const adjType: 'REFUND' | 'PAYABLE' | 'ZERO' = isRefund
      ? 'REFUND'
      : isPayable
        ? 'PAYABLE'
        : 'ZERO';
    const adjCents = isRefund ? -taxAdj : taxAdj;

    if (result.certificate.isMwe) {
      schedule72.push({
        sequenceNumber: schedule72.length + 1,
        employeeNumber: emp.employeeNumber,
        tin: emp.tin || '000000000000',
        branchCode: '0000',
        lastName: emp.lastName,
        firstName: emp.firstName,
        middleName: emp.middleName ?? undefined,
        region: 'NCR',
        periodFrom: `${taxYear}-01-01`,
        periodTo: `${taxYear}-12-31`,
        dailyRateCents: emp.compensation?.basicRateDailyCents ?? 0n,
        grossCompensationCents: partIVA.grossCompensationIncomeCents,
        totalNonTaxableCents: partIVA.totalNonTaxableCompensationCents,
        basicMweCents: partIVB.basicMweCents,
        holidayPayMweCents: partIVB.holidayPayMweCents,
        overtimePayMweCents: partIVB.overtimePayMweCents,
        nightDiffMweCents: partIVB.nightDiffMweCents,
        hazardPayMweCents: partIVB.hazardPayMweCents,
        thirteenthMonthExemptCents: partIVB.thirteenthMonthExemptCents,
        deMinimisCents: partIVB.deMinimisBenefitsCents,
        statutoryContributionsCents: partIVB.statutoryContributionsCents,
        otherNonTaxableCents: partIVB.otherNonTaxableCents,
        totalTaxableCents: partIVA.totalTaxableCompensationCents,
        taxDueAnnualCents: partIVA.taxDueAnnualCents,
        totalTaxWithheldCents: partIVA.totalTaxWithheldCents,
        adjustmentCents: adjCents,
        adjustmentType: adjType,
      });
    } else {
      const prevTaxWithheld = prevWithheldByEmployee.get(emp.id) ?? 0n;
      const presTaxWithheld =
        partIVA.totalTaxWithheldCents > prevTaxWithheld
          ? partIVA.totalTaxWithheldCents - prevTaxWithheld
          : 0n;
      const substitutedFiling = !hasPriorEmployer && adjCents === 0n;

      schedule71.push({
        sequenceNumber: schedule71.length + 1,
        employeeNumber: emp.employeeNumber,
        tin: emp.tin || '000000000000',
        branchCode: '0000',
        lastName: emp.lastName,
        firstName: emp.firstName,
        middleName: emp.middleName ?? undefined,
        region: 'NCR',
        employmentStatus: emp.employmentStatus,
        periodFrom: `${taxYear}-01-01`,
        periodTo: `${taxYear}-12-31`,
        grossCompensationCents: partIVA.grossCompensationIncomeCents,
        totalNonTaxableCents: partIVA.totalNonTaxableCompensationCents,
        statutoryContributionsCents: partIVB.statutoryContributionsCents,
        deMinimisCents: partIVB.deMinimisBenefitsCents,
        thirteenthMonthExemptCents: partIVB.thirteenthMonthExemptCents,
        otherNonTaxableCents: partIVB.otherNonTaxableCents,
        totalTaxableCents: partIVA.totalTaxableCompensationCents,
        basicSalaryTaxableCents: partIVC.basicSalaryRegularCents,
        thirteenthMonthTaxableCents: partIVC.thirteenthMonthExcessTaxableCents,
        overtimeAndPremiumsTaxableCents:
          partIVC.overtimePayTaxableCents +
          partIVC.holidayPayTaxableCents +
          partIVC.nightDiffTaxableCents,
        taxDueAnnualCents: partIVA.taxDueAnnualCents,
        taxWithheldPreviousEmployerCents: prevTaxWithheld,
        taxWithheldPresentEmployerCents: presTaxWithheld,
        totalTaxWithheldCents: partIVA.totalTaxWithheldCents,
        adjustmentCents: adjCents,
        adjustmentType: adjType,
        substitutedFiling,
      });
    }
  }

  const alphalistInput = {
    taxYear,
    employer: {
      tin: organization.tin,
      registeredName: organization.name,
      registeredAddress: organization.registeredAddress,
      rdoCode: organization.rdoCode,
    },
    schedule71,
    schedule72,
  };

  const summary = summarizeBir1604CAlphalist(alphalistInput);
  const contentDat = formatBir1604CAlphalistDat(alphalistInput);
  const contentCsv = formatBir1604CAlphalistCsv(alphalistInput);
  const cleanOrgTin = organization.tin.replace(/[^0-9]/g, '');

  return {
    taxYear,
    filenameDat: `1604C_${cleanOrgTin}_${taxYear}.DAT`,
    contentDat,
    filenameCsv: `BIR_1604C_Alphalist_${taxYear}.csv`,
    contentCsv,
    summary,
  };
}
