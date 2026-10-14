export interface PayslipEmailParams {
  employeeName: string;
  employeeNumber: string;
  organizationName: string;
  cutoffDescription: string;
  paymentDate: string;
  grossPayFormatted: string;
  totalDeductionsFormatted: string;
  netPayFormatted: string;
  dobPasswordHint: string;
  portalUrl?: string;
}

export interface LeaveFiledEmailParams {
  managerName: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  portalUrl?: string;
}

export interface LeaveDecidedEmailParams {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  decision: 'APPROVED' | 'REJECTED';
  reviewerName?: string;
  reviewComments?: string;
  portalUrl?: string;
}

export function renderPayslipEmailTemplate(params: PayslipEmailParams): {
  html: string;
  text: string;
} {
  const portalLink =
    params.portalUrl || 'http://localhost:3000/portal/my-profile';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Payslip is Ready</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #0f172a; padding: 28px 32px; text-align: left;">
              <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 6px;">
                ${escapeHtml(params.organizationName)} · Confidential Payroll
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">
                Official Payslip Notification
              </h1>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #374151;">
                Hello <strong>${escapeHtml(params.employeeName)}</strong> (${escapeHtml(params.employeeNumber)}),
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 22px; color: #4b5563;">
                Your payroll for <strong>${escapeHtml(params.cutoffDescription)}</strong> has been disbursed on <strong>${escapeHtml(params.paymentDate)}</strong>. A summary of your earnings and deductions is presented below.
              </p>

              <!-- Compensation Summary Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 14px; color: #64748b;">Gross Compensation:</td>
                        <td align="right" style="font-size: 15px; font-weight: 600; color: #1e293b;">${escapeHtml(params.grossPayFormatted)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 14px; color: #64748b;">Total Deductions:</td>
                        <td align="right" style="font-size: 15px; font-weight: 600; color: #dc2626;">-${escapeHtml(params.totalDeductionsFormatted)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 18px 20px; background-color: #f0fdf4; border-radius: 0 0 8px 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 16px; font-weight: 700; color: #166534;">Net Take-Home Pay:</td>
                        <td align="right" style="font-size: 20px; font-weight: 800; color: #15803d;">${escapeHtml(params.netPayFormatted)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Security Notice Banner -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; font-weight: 700; color: #1e40af; margin-bottom: 4px;">
                      🔒 Encrypted Attachment Notice
                    </div>
                    <div style="font-size: 13px; line-height: 19px; color: #1e3a8a;">
                      Your official itemized payslip PDF is attached to this email. For your privacy and Philippine Data Privacy Act compliance, the PDF is password-protected.
                      <br><br>
                      <strong>${escapeHtml(params.dobPasswordHint)}</strong>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(portalLink)}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 28px; border-radius: 6px; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);">
                      View Details in Employee Portal
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; line-height: 19px; color: #9ca3af; text-align: center;">
                If you have inquiries regarding statutory deductions or attendance punch adjustments, please reach out to your HR/Payroll Administrator.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 18px;">
                This automated transmission contains privileged payroll records. If received in error, please notify your administrator and delete this email.
                <br>© 2026 SweldoPH. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Confidential Payroll Notification — ${params.organizationName}
==================================================

Hello ${params.employeeName} (${params.employeeNumber}),

Your payroll for ${params.cutoffDescription} has been disbursed on ${params.paymentDate}.

PAYROLL SUMMARY:
- Gross Compensation: ${params.grossPayFormatted}
- Total Deductions: -${params.totalDeductionsFormatted}
--------------------------------------------------
- Net Take-Home Pay: ${params.netPayFormatted}

ENCRYPTED ATTACHMENT NOTICE:
Your official itemized payslip PDF is attached to this email. It is password-protected.
${params.dobPasswordHint}

You can also log into the self-service portal to view your historical payslips:
${portalLink}

If you have questions regarding your compensation or statutory contributions, contact your HR Department.
© 2026 SweldoPH.
`;

  return { html, text };
}

export function renderLeaveFiledEmailTemplate(params: LeaveFiledEmailParams): {
  html: string;
  text: string;
} {
  const portalLink = params.portalUrl || 'http://localhost:3000/portal/leaves';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>New Leave Request Filed</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
          <tr>
            <td style="background-color: #1e293b; padding: 24px 28px;">
              <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px;">Leave Management</div>
              <h2 style="margin: 0; font-size: 20px; color: #ffffff;">Pending Leave Approval</h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151;">
                Hello <strong>${escapeHtml(params.managerName)}</strong>,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 22px; color: #4b5563;">
                <strong>${escapeHtml(params.employeeName)}</strong> has submitted a new leave request requiring your review.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Leave Type:</td>
                  <td align="right" style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; color: #0f172a;">${escapeHtml(params.leaveType)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Duration:</td>
                  <td align="right" style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; color: #0f172a;">${params.daysCount} day(s)</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Date Range:</td>
                  <td align="right" style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0f172a;">${escapeHtml(params.startDate)} – ${escapeHtml(params.endDate)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b;">Reason:</td>
                  <td align="right" style="padding: 12px 16px; font-size: 13px; color: #334155;">${escapeHtml(params.reason || 'None provided')}</td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(portalLink)}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 6px;">
                      Review Leave Request
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `New Leave Request Filed
======================

Hello ${params.managerName},

${params.employeeName} has filed a leave request:
- Leave Type: ${params.leaveType}
- Duration: ${params.daysCount} day(s) (${params.startDate} to ${params.endDate})
- Reason: ${params.reason || 'None provided'}

Please log in to review and decide:
${portalLink}
`;

  return { html, text };
}

export function renderLeaveDecidedEmailTemplate(
  params: LeaveDecidedEmailParams,
): {
  html: string;
  text: string;
} {
  const portalLink = params.portalUrl || 'http://localhost:3000/portal/leaves';
  const isApproved = params.decision === 'APPROVED';
  const headerBg = isApproved ? '#166534' : '#991b1b';
  const badgeText = isApproved ? 'Approved' : 'Rejected';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Leave Request Decision: ${badgeText}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
          <tr>
            <td style="background-color: ${headerBg}; padding: 24px 28px;">
              <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: rgba(255, 255, 255, 0.8); margin-bottom: 4px;">Leave Decision</div>
              <h2 style="margin: 0; font-size: 20px; color: #ffffff;">Your Leave Request has been ${badgeText}</h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151;">
                Hello <strong>${escapeHtml(params.employeeName)}</strong>,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 22px; color: #4b5563;">
                Your request for <strong>${escapeHtml(params.leaveType)}</strong> leave (${params.daysCount} day(s), ${escapeHtml(params.startDate)} – ${escapeHtml(params.endDate)}) has been <strong>${badgeText.toLowerCase()}</strong>${params.reviewerName ? ` by ${escapeHtml(params.reviewerName)}` : ''}.
              </p>

              ${
                params.reviewComments
                  ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 18px; font-size: 13px; color: #475569;">
                    <strong>Reviewer Note:</strong> ${escapeHtml(params.reviewComments)}
                  </td>
                </tr>
              </table>`
                  : ''
              }

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(portalLink)}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 6px;">
                      View Leave Balances & History
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Leave Request Decision: ${badgeText}
==================================

Hello ${params.employeeName},

Your request for ${params.leaveType} leave (${params.daysCount} day(s), ${params.startDate} to ${params.endDate}) has been ${badgeText.toLowerCase()}${params.reviewerName ? ` by ${params.reviewerName}` : ''}.
${params.reviewComments ? `\nReviewer comments: ${params.reviewComments}\n` : ''}
View your leave balance in the portal:
${portalLink}
`;

  return { html, text };
}

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
