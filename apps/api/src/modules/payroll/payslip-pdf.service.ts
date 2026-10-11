import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Role } from '@workspace/db';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import type { AuthenticatedUser } from '../../auth/auth.service';
import { hashDocumentPassword } from '../../auth/password';
import { findDepartmentManagerDepartmentId } from '../../infrastructure/authorization/department-scope';
import { StorageService } from '../../infrastructure/storage/storage.service';

export interface PayslipPdfResult {
  payslipId: string;
  pdfStoragePath: string;
  fileName: string;
  isEncrypted: boolean;
  passwordHint?: string;
  url?: string;
}

export interface PayslipDownloadResult {
  fileName: string;
  dataBase64: string;
  url?: string;
  isEncrypted: boolean;
  passwordHint?: string;
}

function formatCents(cents: bigint | number | null | undefined): string {
  if (cents === null || cents === undefined) return 'PHP 0.00';
  const val = Number(cents) / 100;
  return `PHP ${val.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toISOString().slice(0, 10);
}

export function formatDobPassword(
  dateOfBirth: Date | string | null | undefined,
): string | null {
  if (!dateOfBirth) return null;
  const d = new Date(dateOfBirth);
  if (Number.isNaN(d.getTime())) return null;
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const year = String(d.getUTCFullYear());
  return `${month}${day}${year}`;
}

@Injectable()
export class PayslipPdfService {
  constructor(private readonly storageService: StorageService) {}

  async generatePayslipPdf(
    payslipId: string,
    organizationId: string,
  ): Promise<PayslipPdfResult> {
    const payslip = await prisma.payslip.findFirst({
      where: {
        id: payslipId,
        payrollRun: { organizationId },
      },
      include: {
        payrollRun: true,
        employee: {
          include: {
            department: true,
            branch: true,
          },
        },
      },
    });

    if (!payslip) {
      throw new NotFoundException(`Payslip not found: ${payslipId}`);
    }

    const dobPassword = formatDobPassword(payslip.employee.dateOfBirth);
    const pdfBuffer = await this.renderPayslipPdf(payslip, dobPassword);

    const safeDate = formatDate(payslip.payrollRun.paymentDate).replace(
      /-/g,
      '',
    );
    const fileName = `Payslip_${payslip.employee.employeeNumber}_${safeDate}.pdf`;
    const storageKey = `organizations/${organizationId}/runs/${payslip.payrollRunId}/payslips/${payslip.id}.pdf`;

    const uploadResult = await this.storageService.upload(
      storageKey,
      pdfBuffer,
      'application/pdf',
    );

    // Salted slow hash: the column predates it with unsalted SHA-256 rows,
    // which verifyDocumentPassword treats as unverifiable (never throws).
    const passwordHash = dobPassword
      ? await hashDocumentPassword(dobPassword)
      : null;

    await prisma.payslip.update({
      where: { id: payslip.id },
      data: {
        pdfStoragePath: uploadResult.path,
        pdfPasswordHash: passwordHash,
      },
    });

    return {
      payslipId: payslip.id,
      pdfStoragePath: uploadResult.path,
      fileName,
      isEncrypted: Boolean(dobPassword),
      passwordHint: dobPassword
        ? 'Protected with employee Date of Birth (MMDDYYYY)'
        : undefined,
      url: uploadResult.url,
    };
  }

  async generateRunPdfs(
    runId: string,
    organizationId: string,
  ): Promise<{ total: number; generated: number }> {
    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, organizationId },
      select: {
        id: true,
        payslips: {
          select: { id: true },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run not found: ${runId}`);
    }

    let generated = 0;
    for (const item of run.payslips) {
      await this.generatePayslipPdf(item.id, organizationId);
      generated++;
    }

    return {
      total: run.payslips.length,
      generated,
    };
  }

  async downloadPayslip(
    payslipId: string,
    organizationId: string,
    requestingUser: AuthenticatedUser,
  ): Promise<PayslipDownloadResult> {
    const payslip = await prisma.payslip.findFirst({
      where: {
        id: payslipId,
        payrollRun: { organizationId },
      },
      include: {
        payrollRun: true,
        employee: {
          include: {
            department: true,
            branch: true,
          },
        },
      },
    });

    if (!payslip) {
      throw new NotFoundException('Payslip not found');
    }

    // Role-based access check: Employee can only view their own payslip
    const isStaff = (
      [
        Role.SUPER_ADMIN,
        Role.HR_ADMIN,
        Role.PAYROLL_SPECIALIST,
        Role.DEPARTMENT_MANAGER,
      ] as readonly Role[]
    ).includes(requestingUser.role);

    if (requestingUser.role === Role.DEPARTMENT_MANAGER) {
      const managedDepartmentId =
        await findDepartmentManagerDepartmentId(requestingUser);
      if (
        !managedDepartmentId ||
        payslip.employee.department?.id !== managedDepartmentId
      ) {
        throw new ForbiddenException(
          'You do not have permission to access payslips outside your department',
        );
      }
    }

    if (!isStaff && requestingUser.employeeId !== payslip.employeeId) {
      throw new ForbiddenException(
        'You do not have permission to access this payslip',
      );
    }

    // Check if payroll run is approved or disbursed for employee self-service
    if (
      !isStaff &&
      payslip.payrollRun.status !== 'APPROVED' &&
      payslip.payrollRun.status !== 'DISBURSED'
    ) {
      throw new ForbiddenException(
        'Payslip is not yet released for employee viewing',
      );
    }

    const safeDate = formatDate(payslip.payrollRun.paymentDate).replace(
      /-/g,
      '',
    );
    const fileName = `Payslip_${payslip.employee.employeeNumber}_${safeDate}.pdf`;

    let pdfBuffer: Buffer | null = null;
    let presignedUrl: string | undefined;

    if (payslip.pdfStoragePath) {
      const fileData = await this.storageService.getFile(
        payslip.pdfStoragePath,
      );
      if (fileData) {
        pdfBuffer = fileData.buffer;
      }
      presignedUrl = await this.storageService.getPresignedUrl(
        payslip.pdfStoragePath,
      );
    }

    const dobPassword = formatDobPassword(payslip.employee.dateOfBirth);

    // If PDF not found in storage or not yet generated, render and store now
    if (!pdfBuffer) {
      pdfBuffer = await this.renderPayslipPdf(payslip, dobPassword);
      const storageKey = `organizations/${organizationId}/runs/${payslip.payrollRunId}/payslips/${payslip.id}.pdf`;
      const uploadResult = await this.storageService.upload(
        storageKey,
        pdfBuffer,
        'application/pdf',
      );
      presignedUrl = uploadResult.url;

      // Salted slow hash: the column predates it with unsalted SHA-256 rows,
      // which verifyDocumentPassword treats as unverifiable (never throws).
      const passwordHash = dobPassword
        ? await hashDocumentPassword(dobPassword)
        : null;

      await prisma.payslip.update({
        where: { id: payslip.id },
        data: {
          pdfStoragePath: uploadResult.path,
          pdfPasswordHash: passwordHash,
        },
      });
    }

    return {
      fileName,
      dataBase64: pdfBuffer.toString('base64'),
      url: presignedUrl,
      isEncrypted: Boolean(dobPassword),
      passwordHint: dobPassword
        ? 'Protected with your Date of Birth (MMDDYYYY)'
        : undefined,
    };
  }

  async downloadRunZip(
    runId: string,
    organizationId: string,
  ): Promise<{ fileName: string; dataBase64: string }> {
    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, organizationId },
      include: {
        payslips: {
          include: {
            payrollRun: true,
            employee: {
              include: {
                department: true,
                branch: true,
              },
            },
          },
          orderBy: { employee: { employeeNumber: 'asc' } },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run not found: ${runId}`);
    }

    if (run.payslips.length === 0) {
      throw new BadRequestException('Payroll run has no payslips to download');
    }

    const zip = new JSZip();

    for (const payslip of run.payslips) {
      const dobPassword = formatDobPassword(payslip.employee.dateOfBirth);
      let pdfBuffer: Buffer | null = null;

      if (payslip.pdfStoragePath) {
        const fileData = await this.storageService.getFile(
          payslip.pdfStoragePath,
        );
        if (fileData) {
          pdfBuffer = fileData.buffer;
        }
      }

      if (!pdfBuffer) {
        pdfBuffer = await this.renderPayslipPdf(payslip, dobPassword);
        // Persist so subsequent requests are fast
        const storageKey = `organizations/${organizationId}/runs/${payslip.payrollRunId}/payslips/${payslip.id}.pdf`;
        const uploadResult = await this.storageService.upload(
          storageKey,
          pdfBuffer,
          'application/pdf',
        );
        // Salted slow hash (see generatePayslipPdf).
        const passwordHash = dobPassword
          ? await hashDocumentPassword(dobPassword)
          : null;
        await prisma.payslip.update({
          where: { id: payslip.id },
          data: {
            pdfStoragePath: uploadResult.path,
            pdfPasswordHash: passwordHash,
          },
        });
      }

      const safeDate = formatDate(run.paymentDate).replace(/-/g, '');
      const itemFileName = `Payslip_${payslip.employee.employeeNumber}_${safeDate}.pdf`;
      zip.file(itemFileName, pdfBuffer);
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const runDate = formatDate(run.paymentDate).replace(/-/g, '');
    const zipName = `PayrollRun_${run.cutoffSequence}_${runDate}_Payslips.zip`;

    return {
      fileName: zipName,
      dataBase64: zipBuffer.toString('base64'),
    };
  }

  private renderPayslipPdf(
    payslip: {
      id: string;
      payrollRun: {
        cutoffSequence: string;
        cutoffStartDate: Date;
        cutoffEndDate: Date;
        paymentDate: Date;
      };
      employee: {
        employeeNumber: string;
        firstName: string;
        lastName: string;
        middleName: string | null;
        suffix: string | null;
        tin: string | null;
        sssNo: string | null;
        philhealthNo: string | null;
        pagibigNo: string | null;
        employmentStatus: string;
        employmentType: string;
        department: { name: string } | null;
        branch: { name: string } | null;
      };
      basicPayCents: bigint;
      paidLeavePayCents: bigint;
      overtimePayCents: bigint;
      nightDiffPayCents: bigint;
      holidayPayCents: bigint;
      restDayPayCents: bigint;
      taxableAllowancesCents: bigint;
      nonTaxableAllowancesCents: bigint;
      grossPayCents: bigint;
      tardinessDeductionCents: bigint;
      undertimeDeductionCents: bigint;
      absenceDeductionCents: bigint;
      sssEmployeeCents: bigint;
      sssWispEmployeeCents: bigint;
      philhealthEmployeeCents: bigint;
      pagibigEmployeeCents: bigint;
      withholdingTaxCents: bigint;
      loanDeductionsCents: bigint;
      otherDeductionsCents: bigint;
      totalDeductionsCents: bigint;
      netPayCents: bigint;
      sssEmployerCents: bigint;
      philhealthEmployerCents: bigint;
      pagibigEmployerCents: bigint;
      bonusPaidCents: bigint;
    },
    password?: string | null,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const docOptions: PDFKit.PDFDocumentOptions = {
        size: 'A4',
        margin: 36,
      };

      if (password) {
        docOptions.userPassword = password;
        docOptions.permissions = {
          printing: 'highResolution',
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: false,
          contentAccessibility: true,
          documentAssembly: false,
        };
      }

      const doc = new PDFDocument(docOptions);
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width - 72; // 595.28 - 72 = 523.28
      const startX = 36;
      let y = 36;

      // 1. Header Banner
      doc.rect(startX, y, pageWidth, 52).fill('#1e3a8a');
      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('ENTERPRISE PAYROLL', startX + 16, y + 10, {
          width: pageWidth - 32,
        });

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#cbd5e1')
        .text(
          `CONFIDENTIAL EMPLOYEE PAYSLIP  ·  ${payslip.payrollRun.cutoffSequence.replace(/_/g, ' ')}`,
          startX + 16,
          y + 32,
        );

      y += 62;

      // 2. Employee and Cutoff Details Box
      doc.rect(startX, y, pageWidth, 90).fillAndStroke('#f8fafc', '#cbd5e1');

      const col1X = startX + 12;
      const col2X = startX + pageWidth / 2 + 10;
      let infoY = y + 10;

      const employeeFullName = [
        payslip.employee.lastName,
        payslip.employee.firstName,
        payslip.employee.middleName,
        payslip.employee.suffix,
      ]
        .filter(Boolean)
        .join(', ');

      // Col 1
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#0f172a')
        .text(employeeFullName, col1X, infoY);
      infoY += 16;

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#475569')
        .text(`Employee ID: ${payslip.employee.employeeNumber}`, col1X, infoY);
      infoY += 13;

      const deptBranch = [
        payslip.employee.department?.name,
        payslip.employee.branch?.name,
      ]
        .filter(Boolean)
        .join(' / ');
      doc.text(`Department / Branch: ${deptBranch || '-'}`, col1X, infoY);
      infoY += 13;

      doc.text(
        `Employment: ${payslip.employee.employmentStatus} · ${payslip.employee.employmentType}`,
        col1X,
        infoY,
      );

      // Col 2
      let infoY2 = y + 10;
      const cutoffStart = formatDate(payslip.payrollRun.cutoffStartDate);
      const cutoffEnd = formatDate(payslip.payrollRun.cutoffEndDate);
      const payDate = formatDate(payslip.payrollRun.paymentDate);

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#0f172a')
        .text(`Pay Period: ${cutoffStart} to ${cutoffEnd}`, col2X, infoY2);
      infoY2 += 16;

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#475569')
        .text(`Payout Date: ${payDate}`, col2X, infoY2);
      infoY2 += 13;

      doc.text(`TIN: ${payslip.employee.tin || '-'}`, col2X, infoY2);
      infoY2 += 13;

      doc.text(
        `SSS: ${payslip.employee.sssNo || '-'}  |  PhilHealth: ${payslip.employee.philhealthNo || '-'}`,
        col2X,
        infoY2,
      );

      y += 100;

      // 3. Earnings & Deductions Tables (Side-by-Side)
      const tableWidth = (pageWidth - 10) / 2;
      const earningsX = startX;
      const deductionsX = startX + tableWidth + 10;

      // Table Headers
      doc.rect(earningsX, y, tableWidth, 20).fill('#0284c7');
      doc.rect(deductionsX, y, tableWidth, 20).fill('#475569');

      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('ITEMIZED EARNINGS', earningsX + 8, y + 5)
        .text('ITEMIZED DEDUCTIONS', deductionsX + 8, y + 5);

      y += 24;
      const tablesStartY = y;

      // Helper to render table rows
      const renderRow = (
        posX: number,
        currentY: number,
        label: string,
        amount: string,
        isBold = false,
        isNegative = false,
      ) => {
        doc
          .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8.5)
          .fillColor(isNegative ? '#dc2626' : '#0f172a')
          .text(label, posX + 8, currentY, { width: tableWidth - 100 })
          .text(amount, posX + 8, currentY, {
            width: tableWidth - 16,
            align: 'right',
          });
      };

      // Populate Earnings
      let earnY = tablesStartY;
      renderRow(
        earningsX,
        earnY,
        'Basic Salary',
        formatCents(payslip.basicPayCents),
      );
      earnY += 14;

      if (payslip.paidLeavePayCents > 0n) {
        renderRow(
          earningsX,
          earnY,
          'Paid Leave Pay',
          formatCents(payslip.paidLeavePayCents),
        );
        earnY += 14;
      }
      if (payslip.overtimePayCents > 0n) {
        renderRow(
          earningsX,
          earnY,
          'Overtime Pay',
          formatCents(payslip.overtimePayCents),
        );
        earnY += 14;
      }
      if (payslip.nightDiffPayCents > 0n) {
        renderRow(
          earningsX,
          earnY,
          'Night Shift Differential',
          formatCents(payslip.nightDiffPayCents),
        );
        earnY += 14;
      }
      if (payslip.holidayPayCents > 0n) {
        renderRow(
          earningsX,
          earnY,
          'Holiday Pay',
          formatCents(payslip.holidayPayCents),
        );
        earnY += 14;
      }
      if (payslip.restDayPayCents > 0n) {
        renderRow(
          earningsX,
          earnY,
          'Rest Day Work Pay',
          formatCents(payslip.restDayPayCents),
        );
        earnY += 14;
      }
      if (payslip.taxableAllowancesCents > 0n) {
        renderRow(
          earningsX,
          earnY,
          'Taxable Allowances',
          formatCents(payslip.taxableAllowancesCents),
        );
        earnY += 14;
      }
      if (payslip.nonTaxableAllowancesCents > 0n) {
        renderRow(
          earningsX,
          earnY,
          'Non-Taxable / De Minimis',
          formatCents(payslip.nonTaxableAllowancesCents),
        );
        earnY += 14;
      }
      if (payslip.bonusPaidCents > 0n) {
        renderRow(
          earningsX,
          earnY,
          'Bonus / 13th Month Pay',
          formatCents(payslip.bonusPaidCents),
        );
        earnY += 14;
      }

      // Populate Deductions
      let dedY = tablesStartY;
      if (payslip.tardinessDeductionCents > 0n) {
        renderRow(
          deductionsX,
          dedY,
          'Tardiness / Lates',
          `-${formatCents(payslip.tardinessDeductionCents)}`,
          false,
          true,
        );
        dedY += 14;
      }
      if (payslip.undertimeDeductionCents > 0n) {
        renderRow(
          deductionsX,
          dedY,
          'Undertime',
          `-${formatCents(payslip.undertimeDeductionCents)}`,
          false,
          true,
        );
        dedY += 14;
      }
      if (payslip.absenceDeductionCents > 0n) {
        renderRow(
          deductionsX,
          dedY,
          'Absences',
          `-${formatCents(payslip.absenceDeductionCents)}`,
          false,
          true,
        );
        dedY += 14;
      }

      renderRow(
        deductionsX,
        dedY,
        'SSS Employee Contribution',
        `-${formatCents(payslip.sssEmployeeCents)}`,
        false,
        true,
      );
      dedY += 14;

      renderRow(
        deductionsX,
        dedY,
        'PhilHealth Contribution',
        `-${formatCents(payslip.philhealthEmployeeCents)}`,
        false,
        true,
      );
      dedY += 14;

      renderRow(
        deductionsX,
        dedY,
        'Pag-IBIG Contribution',
        `-${formatCents(payslip.pagibigEmployeeCents)}`,
        false,
        true,
      );
      dedY += 14;

      renderRow(
        deductionsX,
        dedY,
        'Withholding Tax (BIR)',
        `-${formatCents(payslip.withholdingTaxCents)}`,
        false,
        true,
      );
      dedY += 14;

      if (payslip.loanDeductionsCents > 0n) {
        renderRow(
          deductionsX,
          dedY,
          'Loan Amortization',
          `-${formatCents(payslip.loanDeductionsCents)}`,
          false,
          true,
        );
        dedY += 14;
      }
      if (payslip.otherDeductionsCents > 0n) {
        renderRow(
          deductionsX,
          dedY,
          'Other Deductions',
          `-${formatCents(payslip.otherDeductionsCents)}`,
          false,
          true,
        );
        dedY += 14;
      }

      // Max Y alignment
      const contentHeight = Math.max(earnY, dedY) - tablesStartY + 8;
      doc
        .rect(earningsX, tablesStartY - 4, tableWidth, contentHeight)
        .stroke('#e2e8f0');
      doc
        .rect(deductionsX, tablesStartY - 4, tableWidth, contentHeight)
        .stroke('#e2e8f0');

      const subtotalY = tablesStartY + contentHeight;

      // Subtotals
      doc
        .rect(earningsX, subtotalY, tableWidth, 22)
        .fillAndStroke('#f0f9ff', '#bae6fd');
      doc
        .rect(deductionsX, subtotalY, tableWidth, 22)
        .fillAndStroke('#fef2f2', '#fecaca');

      renderRow(
        earningsX,
        subtotalY + 5,
        'TOTAL GROSS PAY',
        formatCents(payslip.grossPayCents),
        true,
      );
      renderRow(
        deductionsX,
        subtotalY + 5,
        'TOTAL DEDUCTIONS',
        `-${formatCents(payslip.totalDeductionsCents)}`,
        true,
        true,
      );

      y = subtotalY + 32;

      // 4. Net Take-Home Pay Banner
      doc.rect(startX, y, pageWidth, 42).fill('#0f172a');
      doc
        .fillColor('#94a3b8')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('NET TAKE-HOME PAY', startX + 16, y + 15);

      doc
        .fillColor('#38bdf8')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(formatCents(payslip.netPayCents), startX + 16, y + 12, {
          width: pageWidth - 32,
          align: 'right',
        });

      y += 52;

      // 5. Employer Statutory Contribution Disclosures (Informational)
      doc.rect(startX, y, pageWidth, 28).fillAndStroke('#f8fafc', '#e2e8f0');
      const employerSSS = formatCents(payslip.sssEmployerCents);
      const employerPH = formatCents(payslip.philhealthEmployerCents);
      const employerPagibig = formatCents(payslip.pagibigEmployerCents);

      doc
        .fillColor('#64748b')
        .font('Helvetica')
        .fontSize(7.5)
        .text(
          `Employer Contributions (For Reference): SSS: ${employerSSS}  |  PhilHealth: ${employerPH}  |  Pag-IBIG: ${employerPagibig}`,
          startX + 10,
          y + 9,
          { width: pageWidth - 20, align: 'center' },
        );

      y += 38;

      // 6. Security & Legal Notice Footer
      doc
        .fillColor('#94a3b8')
        .font('Helvetica')
        .fontSize(7)
        .text(
          'Notice: This payslip is electronically generated and contains proprietary and confidential payroll information. If password-protected, the password is your Date of Birth in MMDDYYYY format.',
          startX,
          y,
          { width: pageWidth, align: 'center' },
        );

      doc.end();
    });
  }
}
