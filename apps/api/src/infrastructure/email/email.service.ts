import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  type LeaveDecidedEmailParams,
  type LeaveFiledEmailParams,
  type PayslipEmailParams,
  renderLeaveDecidedEmailTemplate,
  renderLeaveFiledEmailTemplate,
  renderPayslipEmailTemplate,
} from './email-templates';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  driver: 'resend' | 'smtp' | 'mock';
  recipientCount: number;
}

export interface EmailConfig {
  driver?: 'resend' | 'smtp' | 'mock';
  from?: string;
  resendApiKey?: string;
  smtp?: {
    host: string;
    port: number;
    secure?: boolean;
    user?: string;
    pass?: string;
  };
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly driver: 'resend' | 'smtp' | 'mock';
  private readonly fromAddress: string;
  private readonly resendApiKey?: string;
  private smtpTransporter: nodemailer.Transporter | null = null;
  private readonly sentEmailsQueue: SendEmailInput[] = [];

  constructor(config?: EmailConfig) {
    // Fail-closed test isolation: when jest runs (NODE_ENV=test), ambient
    // environment variables must never upgrade a unit test into a live
    // network call (.env with EMAIL_DRIVER=resend / RESEND_API_KEY set used
    // to leak real sends into the suite). An explicitly passed config still
    // wins, so drivers can be tested deliberately with mocked fetch.
    const ambientConfigDisabled = process.env.NODE_ENV === 'test';
    const rawDriver =
      config?.driver ??
      (ambientConfigDisabled
        ? undefined
        : (process.env.EMAIL_DRIVER as 'resend' | 'smtp' | 'mock' | undefined));

    const resendKey = config?.resendApiKey ?? (ambientConfigDisabled ? undefined : process.env.RESEND_API_KEY);
    const smtpHost = config?.smtp?.host ?? (ambientConfigDisabled ? undefined : process.env.SMTP_HOST);

    if (rawDriver) {
      this.driver = rawDriver;
    } else if (resendKey) {
      this.driver = 'resend';
    } else if (smtpHost) {
      this.driver = 'smtp';
    } else {
      this.driver = 'mock';
    }

    this.resendApiKey = resendKey;
    this.fromAddress =
      config?.from ??
      process.env.EMAIL_FROM ??
      'SweldoPH Payroll <payroll@sweldoph.local>';

    if (this.driver === 'smtp') {
      const port =
        config?.smtp?.port ??
        (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587);
      const secure = config?.smtp?.secure ?? process.env.SMTP_SECURE === 'true';
      const user = config?.smtp?.user ?? process.env.SMTP_USER;
      const pass = config?.smtp?.pass ?? process.env.SMTP_PASS;

      this.smtpTransporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure,
        ...(user && pass
          ? {
              auth: { user, pass },
            }
          : {}),
      });
    }

    this.logger.log(`EmailService initialized using [${this.driver}] driver`);
  }

  getDriver(): 'resend' | 'smtp' | 'mock' {
    return this.driver;
  }

  getSentEmails(): SendEmailInput[] {
    return [...this.sentEmailsQueue];
  }

  clearSentEmails(): void {
    this.sentEmailsQueue.length = 0;
  }

  async sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    const validRecipients = recipients
      .map((r) => r.trim())
      .filter((r) => r.includes('@'));

    if (validRecipients.length === 0) {
      return {
        success: false,
        error: 'No valid recipient email address provided',
        driver: this.driver,
        recipientCount: 0,
      };
    }

    const from = input.from || this.fromAddress;

    try {
      if (this.driver === 'resend') {
        return await this.sendViaResend({
          ...input,
          to: validRecipients,
          from,
        });
      }

      if (this.driver === 'smtp' && this.smtpTransporter) {
        return await this.sendViaSmtp({ ...input, to: validRecipients, from });
      }

      // Mock driver (default in dev / test when SMTP/Resend is unconfigured)
      return this.sendViaMock({ ...input, to: validRecipients, from });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown email dispatch error';
      this.logger.error(
        `Failed to send email to ${validRecipients.join(', ')}: ${message}`,
      );
      return {
        success: false,
        error: message,
        driver: this.driver,
        recipientCount: validRecipients.length,
      };
    }
  }

  async sendPayslipEmail(
    params: PayslipEmailParams,
    pdfBuffer: Buffer,
    recipientEmail: string,
    pdfFileName?: string,
  ): Promise<EmailSendResult> {
    const { html, text } = renderPayslipEmailTemplate(params);
    const fileName =
      pdfFileName ||
      `Payslip_${params.employeeNumber}_${params.paymentDate.replace(/-/g, '')}.pdf`;

    return this.sendEmail({
      to: recipientEmail,
      subject: `Official Payslip: ${params.cutoffDescription} (${params.organizationName})`,
      html,
      text,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  async sendLeaveFiledEmail(
    params: LeaveFiledEmailParams,
    managerEmail: string,
  ): Promise<EmailSendResult> {
    const { html, text } = renderLeaveFiledEmailTemplate(params);
    return this.sendEmail({
      to: managerEmail,
      subject: `Leave Request Pending: ${params.employeeName} (${params.leaveType})`,
      html,
      text,
    });
  }

  async sendLeaveDecidedEmail(
    params: LeaveDecidedEmailParams,
    employeeEmail: string,
  ): Promise<EmailSendResult> {
    const { html, text } = renderLeaveDecidedEmailTemplate(params);
    const badge = params.decision === 'APPROVED' ? 'Approved' : 'Rejected';
    return this.sendEmail({
      to: employeeEmail,
      subject: `Leave Request ${badge}: ${params.leaveType} (${params.startDate} to ${params.endDate})`,
      html,
      text,
    });
  }

  private async sendViaResend(
    input: SendEmailInput & { to: string[]; from: string },
  ): Promise<EmailSendResult> {
    if (!this.resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const payload = {
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo,
      attachments: input.attachments?.map((att) => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content)
          ? att.content.toString('base64')
          : att.content,
      })),
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { id?: string };
    const messageId = data?.id || randomUUID();
    this.logger.log(
      `Sent email via Resend to ${input.to.join(', ')} [id: ${messageId}]`,
    );

    return {
      success: true,
      messageId,
      driver: 'resend',
      recipientCount: input.to.length,
    };
  }

  private async sendViaSmtp(
    input: SendEmailInput & { to: string[]; from: string },
  ): Promise<EmailSendResult> {
    if (!this.smtpTransporter) {
      throw new Error('SMTP transporter is not initialized');
    }

    const info = await this.smtpTransporter.sendMail({
      from: input.from,
      to: input.to.join(', '),
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      attachments: input.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    });

    this.logger.log(
      `Sent email via SMTP to ${input.to.join(', ')} [id: ${info.messageId}]`,
    );

    return {
      success: true,
      messageId: info.messageId,
      driver: 'smtp',
      recipientCount: input.to.length,
    };
  }

  private sendViaMock(
    input: SendEmailInput & { to: string[]; from: string },
  ): EmailSendResult {
    const messageId = `mock-${randomUUID()}`;
    this.sentEmailsQueue.push(input);

    const attachmentSummary = input.attachments?.length
      ? ` with ${input.attachments.length} attachment(s) [${input.attachments.map((a) => a.filename).join(', ')}]`
      : '';

    this.logger.log(
      `[Mock Email] Sent "${input.subject}" to ${input.to.join(', ')}${attachmentSummary} [id: ${messageId}]`,
    );

    return {
      success: true,
      messageId,
      driver: 'mock',
      recipientCount: input.to.length,
    };
  }
}
