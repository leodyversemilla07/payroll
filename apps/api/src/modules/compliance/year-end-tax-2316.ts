import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Prisma } from '@workspace/db';
import { formatCentavosToPesos, manilaYear } from '@workspace/payroll-engine';
import { Bir2316PdfService } from './bir-2316-pdf.service';
import { resolvePriorEmployerTotals } from './prior-employment.inputs';
import { assertSupportedTaxYear } from './tax-evidence-guards';

export async function generateBir2316(
  db: Prisma.TransactionClient,
  employeeId: string,
  organizationId: string,
  taxYear = manilaYear(),
) {
  /**
   * Previews a read-only BIR 2316 reconciliation worksheet. NOT an official
   * certificate: tax adjustments are computed but not settled by this method.
   */
  assertSupportedTaxYear(taxYear);
  const {
    generateBir2316Certificate,
    formatBir2316TextDocument,
    annualizeTax,
    reconcileTaxAdjustment,
  } = await import('@workspace/payroll-engine');

  const employee = await db.employee.findFirst({
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
    db.priorEmployerDeclaration.findFirst({
      where: { employeeId, organizationId, taxYear },
      orderBy: { version: 'desc' },
      select: { hasPriorEmployer: true },
    }),
    db.previousEmployerIncome.findMany({
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
    if (certData.isMwe && (priorTaxableCents > 0n || priorWithheldCents > 0n)) {
      throw new UnprocessableEntityException(
        'BIR 2316 requires manual tax review for minimum-wage earners with prior-employer taxable income or withholding',
      );
    }
    const combinedTaxableCents =
      certData.partIVA.totalTaxableCompensationCents + priorTaxableCents;
    const combinedWithheldCents =
      certData.partIVA.totalTaxWithheldCents + priorWithheldCents;
    const { totalAnnualTaxDueCents, taxAdjustmentCents: combinedAdjustment } =
      annualizeTax(combinedTaxableCents, combinedWithheldCents, certData.isMwe);
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
  const settlement = await db.yearEndTaxSettlement.findFirst({
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
        `  Prior gross compensation ................................ PHP ${formatCentavosToPesos(priorEmployerTotals.grossCents)}`,
        `  Prior taxable compensation .............................. PHP ${formatCentavosToPesos(priorEmployerTotals.taxableCents)}`,
        `  Prior tax withheld ...................................... PHP ${formatCentavosToPesos(priorEmployerTotals.withheldCents)}`,
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

export async function generateBir2316Pdf(
  db: Prisma.TransactionClient,
  pdf: Bir2316PdfService,
  employeeId: string,
  organizationId: string,
  taxYear = manilaYear(),
  isPreview = false,
) {
  /**
   * Generates a 2-page publication-quality official BIR Form 2316 PDF document.
   */
  assertSupportedTaxYear(taxYear);
  const preview = await generateBir2316(
    db,
    employeeId,
    organizationId,
    taxYear,
  );

  const employee = await db.employee.findFirst({
    where: { id: employeeId, organizationId },
    include: {
      organization: true,
    },
  });

  if (!employee) {
    throw new NotFoundException(`Employee ${employeeId} not found`);
  }

  const issuance = await db.bir2316Issuance.findFirst({
    where: {
      employeeId,
      organizationId,
      taxYear,
    },
    orderBy: { version: 'desc' },
  });

  const isOfficiallyIssued = issuance?.status === 'ISSUED' && !isPreview;

  // Previous employer record if any
  const previousEmployer = await db.previousEmployerIncome.findFirst({
    where: {
      employeeId,
      organizationId,
      taxYear,
    },
    orderBy: { version: 'desc' },
  });

  const pdfBuffer = await pdf.renderPdf({
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
