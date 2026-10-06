import PDFDocument from 'pdfkit';

export interface Bir2316PdfEmployee {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  suffix?: string | null;
  tin: string | null;
  rdoCode?: string | null;
  residentialAddress: string;
  zipCode?: string | null;
  dateOfBirth?: Date | string | null;
  contactNumber?: string | null;
  isMinimumWageEarner: boolean;
}

export interface Bir2316PdfEmployer {
  name: string;
  tin: string;
  rdoCode: string;
  registeredAddress: string;
  zipCode?: string | null;
  lineOfBusiness?: string | null;
}

export interface Bir2316PdfPreviousEmployer {
  employerName: string;
  employerTin: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  grossCompensationCents: bigint;
  taxableCompensationCents: bigint;
  taxWithheldCents: bigint;
}

export interface Bir2316PdfData {
  taxYear: number;
  employee: Bir2316PdfEmployee;
  employer: Bir2316PdfEmployer;
  previousEmployer?: Bir2316PdfPreviousEmployer | null;
  partIVA: {
    grossCompensationIncomeCents: bigint;
    totalNonTaxableCompensationCents: bigint;
    totalTaxableCompensationCents: bigint;
    taxDueAnnualCents: bigint;
    totalTaxWithheldCents: bigint;
    taxAdjustmentCents: bigint;
    refundDueEmployeeCents: bigint;
    taxPayableByEmployeeCents: bigint;
  };
  partIVB: {
    basicMweCents: bigint;
    holidayPayMweCents: bigint;
    overtimePayMweCents: bigint;
    nightDiffMweCents: bigint;
    hazardPayMweCents: bigint;
    thirteenthMonthExemptCents: bigint;
    deMinimisBenefitsCents: bigint;
    statutoryContributionsCents: bigint;
    otherNonTaxableCents: bigint;
    totalNonTaxableCompensationCents: bigint;
  };
  partIVC: {
    basicSalaryRegularCents: bigint;
    overtimePayTaxableCents: bigint;
    holidayPayTaxableCents: bigint;
    nightDiffTaxableCents: bigint;
    otherTaxableAllowancesCents: bigint;
    thirteenthMonthExcessTaxableCents: bigint;
    totalTaxableCompensationCents: bigint;
  };
  priorEmployerTotals?: {
    employerCount: number;
    grossCents: bigint;
    taxableCents: bigint;
    withheldCents: bigint;
  } | null;
  isMwe: boolean;
  isIssued: boolean;
  issuanceId?: string;
  version?: number;
  issuedAt?: Date | string;
  isSettled?: boolean;
}

export function formatPesos(cents: bigint | number | null | undefined): string {
  if (cents === null || cents === undefined) return '0.00';
  const val = Number(cents) / 100;
  return val.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const formatCurrency = formatPesos;

export function formatTin(tin: string | null | undefined): string {
  if (!tin) return '000-000-000-00000';
  const clean = tin.replace(/[^0-9]/g, '');
  if (clean.length === 9) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}-00000`;
  }
  if (clean.length === 12) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}-${clean.slice(9, 12)}00`;
  }
  return tin;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const y = String(d.getUTCFullYear());
  return `${m}/${day}/${y}`;
}

export class Bir2316PdfService {
  /**
   * Generates a two-page, publication-quality official BIR Form 2316 PDF document.
   */
  async renderPdf(data: Bir2316PdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 24,
        autoFirstPage: true,
        info: {
          Title: `BIR Form 2316 - ${data.employee.lastName}, ${data.employee.firstName} (${data.taxYear})`,
          Author: data.employer.name,
          Subject: `Certificate of Compensation Payment / Tax Withheld for Tax Year ${data.taxYear}`,
          Keywords: 'BIR 2316, Tax Withholding, Philippines, TRAIN Law',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width - 48; // 595.28 - 48 = 547.28
      const startX = 24;

      // =========================================================================
      // PAGE 1: Header, Part I, Part II, Part III, Part IV-A (Summary), Part V (Declarations)
      // =========================================================================
      this.drawPage1(doc, data, startX, pageWidth);

      // =========================================================================
      // PAGE 2: Part IV-B (Non-Taxable), Part IV-C (Taxable), Statutory Notes
      // =========================================================================
      doc.addPage({ size: 'A4', margin: 24 });
      this.drawPage2(doc, data, startX, pageWidth);

      doc.end();
    });
  }

  private drawPage1(
    doc: PDFKit.PDFDocument,
    data: Bir2316PdfData,
    startX: number,
    pageWidth: number,
  ) {
    let y = 24;

    // Optional Watermark for Unissued / Preview
    if (!data.isIssued) {
      this.drawWatermark(doc, 'UNISSUED DRAFT · PREVIEW');
    }

    // 1. TOP HEADER & TITLE
    const headerHeight = 52;
    doc.rect(startX, y, pageWidth, headerHeight).fillAndStroke('#0f2942', '#0f2942');

    // Title left
    doc
      .fillColor('#94a3b8')
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('REPUBLIC OF THE PHILIPPINES · DEPARTMENT OF FINANCE', startX + 12, y + 6);
    doc
      .fillColor('#e2e8f0')
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text('BUREAU OF INTERNAL REVENUE', startX + 12, y + 15);
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('Certificate of Compensation Payment / Tax Withheld', startX + 12, y + 25);
    doc
      .fillColor('#cbd5e1')
      .font('Helvetica-Oblique')
      .fontSize(6.5)
      .text('For Compensation Payment With or Without Tax Withheld', startX + 12, y + 38);

    // Form number right box
    const formBoxWidth = 145;
    const formBoxX = startX + pageWidth - formBoxWidth - 6;
    doc
      .roundedRect(formBoxX, y + 4, formBoxWidth, headerHeight - 8, 4)
      .fillAndStroke('#ffffff', '#cbd5e1');

    doc
      .fillColor('#0f2942')
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text('BIR Form No. 2316', formBoxX, y + 7, { width: formBoxWidth, align: 'center' });
    doc
      .fillColor('#64748b')
      .font('Helvetica')
      .fontSize(6)
      .text('Revised January 2018 (ENCS)', formBoxX, y + 18, { width: formBoxWidth, align: 'center' });
    doc
      .fillColor('#0f2942')
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(`For Taxable Year: ${data.taxYear}`, formBoxX, y + 27, { width: formBoxWidth, align: 'center' });
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(6)
      .text(`Period: 01/01/${data.taxYear} to 12/31/${data.taxYear}`, formBoxX, y + 37, { width: formBoxWidth, align: 'center' });

    y += headerHeight + 6;

    // 2. PART I: EMPLOYEE INFORMATION
    y = this.drawSectionHeader(doc, 'PART I — EMPLOYEE INFORMATION', startX, y, pageWidth);
    const p1Height = 84;
    doc.rect(startX, y, pageWidth, p1Height).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

    const colW = pageWidth / 2;
    const rowH = 21;

    // Row 1: TIN & RDO
    this.drawCell(doc, '1. Taxpayer Identification No. (TIN)', formatTin(data.employee.tin), startX, y, colW, rowH);
    this.drawCell(doc, '3. RDO Code', data.employee.rdoCode || data.employer.rdoCode || '038', startX + colW, y, colW, rowH);

    // Row 2: Full Name
    const middle = data.employee.middleName ? ` ${data.employee.middleName}` : '';
    const suffix = data.employee.suffix ? ` ${data.employee.suffix}` : '';
    const fullName = `${data.employee.lastName}, ${data.employee.firstName}${middle}${suffix}`;
    this.drawCell(doc, "2. Employee's Name (Last, First, Middle)", fullName.toUpperCase(), startX, y + rowH, pageWidth, rowH);

    // Row 3: Registered Address & Zip
    this.drawCell(doc, '4. Registered Address', data.employee.residentialAddress, startX, y + rowH * 2, colW + 80, rowH);
    this.drawCell(doc, '5. ZIP Code', data.employee.zipCode || '—', startX + colW + 80, y + rowH * 2, colW - 80, rowH);

    // Row 4: Date of Birth & Minimum Wage Earner checkbox
    const dobStr = formatDate(data.employee.dateOfBirth);
    this.drawCell(doc, '6. Date of Birth (MM/DD/YYYY)', dobStr, startX, y + rowH * 3, colW * 0.6, rowH);
    this.drawCell(doc, '7. Employee No.', data.employee.employeeNumber, startX + colW * 0.6, y + rowH * 3, colW * 0.4, rowH);

    const mweX = startX + colW;
    const mweW = colW;
    doc.rect(mweX, y + rowH * 3, mweW, rowH).fillAndStroke('#f8fafc', '#cbd5e1');
    doc.fillColor('#475569').font('Helvetica').fontSize(6).text('8. Minimum Wage Earner (MWE)?', mweX + 4, y + rowH * 3 + 2);
    const yesCheck = data.isMwe ? '[X] YES' : '[  ] YES';
    const noCheck = !data.isMwe ? '[X] NO' : '[  ] NO';
    doc.fillColor('#0f2942').font('Helvetica-Bold').fontSize(7.5).text(`${yesCheck}     ${noCheck}`, mweX + 6, y + rowH * 3 + 10);

    y += p1Height + 6;

    // 3. PART II: EMPLOYER INFORMATION (PRESENT)
    y = this.drawSectionHeader(doc, 'PART II — EMPLOYER INFORMATION (PRESENT)', startX, y, pageWidth);
    const p2Height = 58;
    doc.rect(startX, y, pageWidth, p2Height).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

    this.drawCell(doc, '9. Employer TIN', formatTin(data.employer.tin), startX, y, colW, 19);
    this.drawCell(doc, '11. RDO Code', data.employer.rdoCode, startX + colW, y, colW, 19);
    this.drawCell(doc, "10. Employer's Registered Name", data.employer.name.toUpperCase(), startX, y + 19, pageWidth, 19);
    this.drawCell(doc, '12. Registered Address', data.employer.registeredAddress, startX, y + 38, pageWidth, 20);

    y += p2Height + 6;

    // 4. PART III: EMPLOYER INFORMATION (PREVIOUS)
    y = this.drawSectionHeader(doc, 'PART III — EMPLOYER INFORMATION (PREVIOUS)', startX, y, pageWidth);
    const p3Height = 36;
    doc.rect(startX, y, pageWidth, p3Height).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

    if (data.previousEmployer) {
      const prev = data.previousEmployer;
      this.drawCell(doc, '13. Previous Employer TIN', formatTin(prev.employerTin), startX, y, colW * 0.7, 18);
      this.drawCell(doc, '14. Previous Employer Name', prev.employerName.toUpperCase(), startX + colW * 0.7, y, pageWidth - colW * 0.7, 18);
      const period = `From: ${formatDate(prev.periodStart)}  To: ${formatDate(prev.periodEnd)}`;
      this.drawCell(doc, '15. Employment Period with Previous Employer', period, startX, y + 18, pageWidth, 18);
    } else {
      doc.rect(startX, y, pageWidth, p3Height).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(7.5).text('N/A — Purely single employer during taxable year', startX + 8, y + 12);
    }

    y += p3Height + 6;

    // 5. PART IV-A: SUMMARY OF COMPENSATION AND TAX
    y = this.drawSectionHeader(doc, 'PART IV-A — SUMMARY OF COMPENSATION AND TAX', startX, y, pageWidth);
    const summaryRows = [
      {
        num: '16',
        desc: 'Gross Compensation Income from Present Employer',
        amount: data.partIVA.grossCompensationIncomeCents,
        isBold: true,
      },
      {
        num: '17',
        desc: 'Less: Total Non-Taxable/Exempt Compensation (from Part IV-B, Item 35)',
        amount: data.partIVA.totalNonTaxableCompensationCents,
        isBold: false,
      },
      {
        num: '18',
        desc: 'Taxable Compensation Income from Present Employer (Item 16 less Item 17)',
        amount: data.partIVA.totalTaxableCompensationCents,
        isBold: true,
      },
      {
        num: '19',
        desc: 'Add: Taxable Compensation Income from Previous Employer (Part III)',
        amount: data.priorEmployerTotals?.taxableCents ?? 0n,
        isBold: false,
      },
      {
        num: '20',
        desc: 'Gross Taxable Compensation Income (Item 18 plus Item 19)',
        amount:
          data.partIVA.totalTaxableCompensationCents +
          (data.priorEmployerTotals?.taxableCents ?? 0n),
        isBold: true,
      },
      {
        num: '21',
        desc: 'Tax Due (per Graduated Tax Table under TRAIN Law RA 10963)',
        amount: data.partIVA.taxDueAnnualCents,
        isBold: true,
      },
      {
        num: '22A',
        desc: 'Amount of Taxes Withheld — Present Employer',
        amount: data.partIVA.totalTaxWithheldCents,
        isBold: false,
      },
      {
        num: '22B',
        desc: 'Amount of Taxes Withheld — Previous Employer',
        amount: data.priorEmployerTotals?.withheldCents ?? 0n,
        isBold: false,
      },
      {
        num: '23',
        desc: 'Total Amount of Taxes Withheld as Adjusted (Sum of Items 22A and 22B)',
        amount:
          data.partIVA.totalTaxWithheldCents +
          (data.priorEmployerTotals?.withheldCents ?? 0n),
        isBold: true,
      },
      {
        num: '24',
        desc:
          data.partIVA.refundDueEmployeeCents > 0n
            ? 'Overwithheld Tax Refunded to Employee (Year-End Adjustment)'
            : data.partIVA.taxPayableByEmployeeCents > 0n
              ? 'Tax Payable / Deficiency Collected from Employee'
              : 'Tax Equalized / Zero Net Adjustment',
        amount:
          data.partIVA.refundDueEmployeeCents > 0n
            ? data.partIVA.refundDueEmployeeCents
            : data.partIVA.taxPayableByEmployeeCents > 0n
              ? data.partIVA.taxPayableByEmployeeCents
              : 0n,
        isBold: true,
        highlight: true,
      },
    ];

    const sRowH = 15.5;
    const tableHeight = summaryRows.length * sRowH;
    doc.rect(startX, y, pageWidth, tableHeight).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

    summaryRows.forEach((r, idx) => {
      const rowY = y + idx * sRowH;
      if (r.highlight) {
        doc.rect(startX, rowY, pageWidth, sRowH).fill('#f1f5f9');
      } else if (idx % 2 === 1) {
        doc.rect(startX, rowY, pageWidth, sRowH).fill('#fafafa');
      }

      // Border bottom
      doc.moveTo(startX, rowY + sRowH).lineTo(startX + pageWidth, rowY + sRowH).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

      // Number & description
      doc
        .fillColor('#0f2942')
        .font(r.isBold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(6.8)
        .text(`${r.num}.  ${r.desc}`, startX + 6, rowY + 4, { width: pageWidth - 120 });

      // Amount
      doc
        .fillColor(r.highlight && data.partIVA.refundDueEmployeeCents > 0n ? '#047857' : '#0f2942')
        .font(r.isBold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(7.2)
        .text(`PHP ${formatPesos(r.amount)}`, startX + pageWidth - 110, rowY + 4, {
          width: 104,
          align: 'right',
        });
    });

    y += tableHeight + 6;

    // 6. PART V: DECLARATIONS & SIGNATURES
    y = this.drawSectionHeader(doc, 'PART V — DECLARATIONS AND CERTIFICATION', startX, y, pageWidth);
    const boxW = (pageWidth - 6) / 2;
    const decH = 76;

    // Employer Declaration (Left)
    doc.rect(startX, y, boxW, decH).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    doc
      .fillColor('#0f2942')
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('Present Employer / Authorized Representative Declaration', startX + 6, y + 4, { width: boxW - 12 });
    doc
      .fillColor('#475569')
      .font('Helvetica')
      .fontSize(5.2)
      .text(
        'I declare under the penalties of perjury that this certificate has been made in good faith, verified by me, and to the best of my knowledge and belief, is true and correct, pursuant to the provisions of the National Internal Revenue Code, as amended.',
        startX + 6,
        y + 14,
        { width: boxW - 12 },
      );
    doc.moveTo(startX + 12, y + 58).lineTo(startX + boxW - 12, y + 58).strokeColor('#94a3b8').stroke();
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(5.5)
      .text('Signature of Authorized Representative / Date', startX + 6, y + 62, { width: boxW - 12, align: 'center' });

    // Employee Declaration (Right)
    const rightX = startX + boxW + 6;
    doc.rect(rightX, y, boxW, decH).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    doc
      .fillColor('#0f2942')
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('Employee Declaration & Substituted Filing Certification', rightX + 6, y + 4, { width: boxW - 12 });
    doc
      .fillColor('#475569')
      .font('Helvetica')
      .fontSize(5.2)
      .text(
        'I declare under the penalties of perjury that the information herein contained are true and correct, and that I qualify for substituted filing of income tax return under RR 11-2018 (if purely single employer and tax correctly equalized).',
        rightX + 6,
        y + 14,
        { width: boxW - 12 },
      );
    doc.moveTo(rightX + 12, y + 58).lineTo(rightX + boxW - 12, y + 58).strokeColor('#94a3b8').stroke();
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(5.5)
      .text('Signature of Employee / Date', rightX + 6, y + 62, { width: boxW - 12, align: 'center' });

    y += decH + 4;

    // Substituted filing qualification & stamp badge
    const isQualified =
      !data.previousEmployer &&
      (data.priorEmployerTotals?.employerCount ?? 0) === 0 &&
      (data.partIVA.refundDueEmployeeCents === 0n && data.partIVA.taxPayableByEmployeeCents === 0n);

    const badgeText = isQualified
      ? '✓ QUALIFIED FOR SUBSTITUTED FILING (RR 11-2018 §2.79) — NO INDIVIDUAL BIR FORM 1700 REQUIRED'
      : 'ℹ NOT QUALIFIED FOR SUBSTITUTED FILING — INDIVIDUAL ITR FILING REQUIRED (BIR FORM 1700)';

    doc.rect(startX, y, pageWidth, 18).fillAndStroke(isQualified ? '#ecfdf5' : '#fef2f2', isQualified ? '#059669' : '#dc2626');
    doc
      .fillColor(isQualified ? '#065f46' : '#991b1b')
      .font('Helvetica-Bold')
      .fontSize(6.8)
      .text(badgeText, startX, y + 5, { width: pageWidth, align: 'center' });

    // Footer note
    doc
      .fillColor('#94a3b8')
      .font('Helvetica')
      .fontSize(5.5)
      .text(`Page 1 of 2  ·  BIR Form 2316 (ENCS)  ·  Generated: ${new Date().toISOString()}`, startX, doc.page.height - 18, {
        width: pageWidth,
        align: 'center',
      });
  }

  private drawPage2(
    doc: PDFKit.PDFDocument,
    data: Bir2316PdfData,
    startX: number,
    pageWidth: number,
  ) {
    let y = 24;

    if (!data.isIssued) {
      this.drawWatermark(doc, 'UNISSUED DRAFT · PREVIEW');
    }

    // Top mini-banner
    doc.rect(startX, y, pageWidth, 24).fillAndStroke('#0f2942', '#0f2942');
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text('BIR Form No. 2316 (Page 2) — ITEMIZED COMPENSATION BREAKDOWN', startX + 8, y + 4);
    doc
      .fillColor('#94a3b8')
      .font('Helvetica')
      .fontSize(6.5)
      .text(
        `Employee: ${data.employee.lastName}, ${data.employee.firstName} · TIN: ${formatTin(data.employee.tin)} · Tax Year: ${data.taxYear}`,
        startX + 8,
        y + 14,
      );

    y += 28;

    // PART IV-B: NON-TAXABLE / EXEMPT COMPENSATION
    y = this.drawSectionHeader(doc, 'PART IV-B — DETAILS OF NON-TAXABLE / EXEMPT COMPENSATION INCOME', startX, y, pageWidth);
    const nonTaxableRows = [
      {
        num: '25',
        desc: 'Basic Minimum Wage for Minimum Wage Earner (MWE)',
        amount: data.partIVB.basicMweCents,
      },
      {
        num: '26',
        desc: 'Holiday Pay (for MWE)',
        amount: data.partIVB.holidayPayMweCents,
      },
      {
        num: '27',
        desc: 'Overtime Pay (for MWE)',
        amount: data.partIVB.overtimePayMweCents,
      },
      {
        num: '28',
        desc: 'Night Shift Differential (for MWE)',
        amount: data.partIVB.nightDiffMweCents,
      },
      {
        num: '29',
        desc: 'Hazard Pay (for MWE)',
        amount: data.partIVB.hazardPayMweCents,
      },
      {
        num: '30',
        desc: '13th Month Pay and Other Benefits (up to the statutory ₱90,000 cap)',
        amount: data.partIVB.thirteenthMonthExemptCents,
      },
      {
        num: '31',
        desc: 'De Minimis Benefits (under BIR RR 29-2025 monthly exempt thresholds)',
        amount: data.partIVB.deMinimisBenefitsCents,
      },
      {
        num: '32',
        desc: 'SSS, PhilHealth, & Pag-IBIG Contributions (Employee Share Only)',
        amount: data.partIVB.statutoryContributionsCents,
      },
      {
        num: '33',
        desc: 'Salaries & Other Forms of Non-Taxable Compensation',
        amount: data.partIVB.otherNonTaxableCents,
      },
      {
        num: '34',
        desc: 'TOTAL NON-TAXABLE / EXEMPT COMPENSATION (Sum of Items 25 to 33)',
        amount: data.partIVB.totalNonTaxableCompensationCents,
        isTotal: true,
      },
    ];

    const rowH = 15;
    const bTableH = nonTaxableRows.length * rowH;
    doc.rect(startX, y, pageWidth, bTableH).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

    nonTaxableRows.forEach((r, idx) => {
      const rowY = y + idx * rowH;
      if (r.isTotal) {
        doc.rect(startX, rowY, pageWidth, rowH).fill('#f1f5f9');
      } else if (idx % 2 === 1) {
        doc.rect(startX, rowY, pageWidth, rowH).fill('#fafafa');
      }

      doc.moveTo(startX, rowY + rowH).lineTo(startX + pageWidth, rowY + rowH).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

      doc
        .fillColor('#0f2942')
        .font(r.isTotal ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(6.8)
        .text(`${r.num}.  ${r.desc}`, startX + 6, rowY + 3.5, { width: pageWidth - 120 });

      doc
        .fillColor(r.isTotal ? '#0f2942' : '#334155')
        .font(r.isTotal ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(7.2)
        .text(`PHP ${formatPesos(r.amount)}`, startX + pageWidth - 110, rowY + 3.5, {
          width: 104,
          align: 'right',
        });
    });

    y += bTableH + 8;

    // PART IV-C: TAXABLE COMPENSATION INCOME
    y = this.drawSectionHeader(doc, 'PART IV-C — DETAILS OF TAXABLE COMPENSATION INCOME', startX, y, pageWidth);
    const taxableRows = [
      {
        num: '35',
        desc: 'Basic Salary (Regular Employees)',
        amount: data.partIVC.basicSalaryRegularCents,
      },
      {
        num: '36',
        desc: 'Representation Allowance (RATA)',
        amount: 0n,
      },
      {
        num: '37',
        desc: 'Transportation Allowance',
        amount: 0n,
      },
      {
        num: '38',
        desc: 'Cost of Living Allowance (COLA)',
        amount: 0n,
      },
      {
        num: '39',
        desc: 'Fixed Housing Allowance',
        amount: 0n,
      },
      {
        num: '40',
        desc: 'Other Taxable Allowances / Direct Compensation',
        amount: data.partIVC.otherTaxableAllowancesCents,
      },
      {
        num: '41',
        desc: 'Commission / Incentives',
        amount: 0n,
      },
      {
        num: '42',
        desc: 'Profit Sharing / Performance Bonuses',
        amount: 0n,
      },
      {
        num: '43',
        desc: 'Fees Including Director’s Fees',
        amount: 0n,
      },
      {
        num: '44',
        desc: '13th Month Pay and Other Benefits in Excess of ₱90,000 Cap',
        amount: data.partIVC.thirteenthMonthExcessTaxableCents,
      },
      {
        num: '45',
        desc: 'Hazard Pay (Taxable Portion for Regular Employees)',
        amount: 0n,
      },
      {
        num: '46',
        desc: 'Overtime Pay (Regular Employees)',
        amount: data.partIVC.overtimePayTaxableCents,
      },
      {
        num: '47',
        desc: 'Others (Night Shift Differential & Holiday Premiums for Regular)',
        amount:
          data.partIVC.holidayPayTaxableCents +
          data.partIVC.nightDiffTaxableCents,
      },
      {
        num: '48',
        desc: 'TOTAL TAXABLE COMPENSATION INCOME (Sum of Items 35 to 47)',
        amount: data.partIVC.totalTaxableCompensationCents,
        isTotal: true,
      },
    ];

    const cTableH = taxableRows.length * rowH;
    doc.rect(startX, y, pageWidth, cTableH).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

    taxableRows.forEach((r, idx) => {
      const rowY = y + idx * rowH;
      if (r.isTotal) {
        doc.rect(startX, rowY, pageWidth, rowH).fill('#f1f5f9');
      } else if (idx % 2 === 1) {
        doc.rect(startX, rowY, pageWidth, rowH).fill('#fafafa');
      }

      doc.moveTo(startX, rowY + rowH).lineTo(startX + pageWidth, rowY + rowH).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

      doc
        .fillColor('#0f2942')
        .font(r.isTotal ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(6.8)
        .text(`${r.num}.  ${r.desc}`, startX + 6, rowY + 3.5, { width: pageWidth - 120 });

      doc
        .fillColor(r.isTotal ? '#0f2942' : '#334155')
        .font(r.isTotal ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(7.2)
        .text(`PHP ${formatPesos(r.amount)}`, startX + pageWidth - 110, rowY + 3.5, {
          width: 104,
          align: 'right',
        });
    });

    y += cTableH + 8;

    // LEGAL & REGULATORY AUDIT BOX
    const infoH = 88;
    doc.roundedRect(startX, y, pageWidth, infoH, 3).fillAndStroke('#f8fafc', '#cbd5e1');

    doc
      .fillColor('#0f2942')
      .font('Helvetica-Bold')
      .fontSize(6.8)
      .text('STATUTORY GUIDANCE & RECONCILIATION AUDIT TRAIL', startX + 8, y + 6);

    doc
      .fillColor('#475569')
      .font('Helvetica')
      .fontSize(5.6)
      .text(
        '1. Statutory Deadline: Must be released to the employee on or before January 31 of the succeeding calendar year, or on the day of final settlement in case of employment termination (DOLE LA 06-20 / NIRC Sec. 83).\n' +
        '2. Trailing Previous Employer Compensation: Transcribed 2316 figures from previous employers are incorporated per Revenue Regulations No. 11-2018 §2.79 for consolidated annualization.\n' +
        '3. Exemption Threshold: 13th-month pay and other benefits up to ₱90,000 are exempt from withholding tax pursuant to RA 10963 (TRAIN Law) Section 32(B)(7)(e).\n' +
        `4. Issuance State: ${data.isIssued ? `OFFICIALLY ISSUED (Version ${data.version ?? 1}) on ${formatDate(data.issuedAt)} · Ref: ${data.issuanceId ?? 'N/A'}` : 'UNISSUED DRAFT PREVIEW · PENDING HR SETTLEMENT & CONCURRENCE'}`,
        startX + 8,
        y + 18,
        { width: pageWidth - 16, lineGap: 1.5 },
      );

    // Bottom footer
    doc
      .fillColor('#94a3b8')
      .font('Helvetica')
      .fontSize(5.5)
      .text(`Page 2 of 2  ·  BIR Form 2316 (ENCS)  ·  Generated: ${new Date().toISOString()}`, startX, doc.page.height - 18, {
        width: pageWidth,
        align: 'center',
      });
  }

  private drawSectionHeader(
    doc: PDFKit.PDFDocument,
    title: string,
    x: number,
    y: number,
    width: number,
  ): number {
    const h = 13;
    doc.rect(x, y, width, h).fill('#0f2942');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.8).text(title, x + 6, y + 3);
    return y + h;
  }

  private drawCell(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    doc.rect(x, y, w, h).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    doc.fillColor('#64748b').font('Helvetica').fontSize(5.2).text(label, x + 4, y + 2, { width: w - 8 });
    doc
      .fillColor('#0f2942')
      .font('Helvetica-Bold')
      .fontSize(7.2)
      .text(value || '—', x + 4, y + 9.5, { width: w - 8, ellipsis: true });
  }

  private drawWatermark(doc: PDFKit.PDFDocument, text: string) {
    doc.save();
    doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc
      .fillColor('#94a3b8')
      .opacity(0.12)
      .font('Helvetica-Bold')
      .fontSize(38)
      .text(text, 0, doc.page.height / 2 - 20, {
        width: doc.page.width,
        align: 'center',
      });
    doc.restore();
  }
}
