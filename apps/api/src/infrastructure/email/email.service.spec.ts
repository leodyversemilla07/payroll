import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService({ driver: 'mock' });
  });

  afterEach(() => {
    service.clearSentEmails();
  });

  it('initializes with mock driver by default when no external credentials provided', () => {
    expect(service.getDriver()).toBe('mock');
    expect(service.getSentEmails()).toHaveLength(0);
  });

  it('queues sent emails in memory when using the mock driver', async () => {
    const result = await service.sendEmail({
      to: 'employee@sweldoph.local',
      subject: 'Test Subject',
      html: '<p>Hello World</p>',
      text: 'Hello World',
    });

    expect(result.success).toBe(true);
    expect(result.driver).toBe('mock');
    expect(result.recipientCount).toBe(1);
    expect(result.messageId).toMatch(/^mock-/);

    const sent = service.getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['employee@sweldoph.local']);
    expect(sent[0].subject).toBe('Test Subject');
  });

  it('rejects dispatch when no valid recipient emails are provided', async () => {
    const result = await service.sendEmail({
      to: ['invalid-email', '   '],
      subject: 'Invalid',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No valid recipient');
    expect(service.getSentEmails()).toHaveLength(0);
  });

  it('formats and dispatches payslip email with encrypted PDF attachment', async () => {
    const mockPdfBuffer = Buffer.from('%PDF-1.4 mock pdf content');

    const result = await service.sendPayslipEmail(
      {
        employeeName: 'Juan Dela Cruz',
        employeeNumber: 'EMP-2026-001',
        organizationName: 'Acme Philippines Inc.',
        cutoffDescription: 'October 1 – October 15, 2026',
        paymentDate: '2026-10-15',
        grossPayFormatted: '₱25,000.00',
        totalDeductionsFormatted: '₱3,500.00',
        netPayFormatted: '₱21,500.00',
        dobPasswordHint: 'Protected with your Date of Birth (MMDDYYYY)',
        portalUrl: 'http://localhost:3000/portal/my-profile',
      },
      mockPdfBuffer,
      'juan@acme.ph',
    );

    expect(result.success).toBe(true);
    const sent = service.getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['juan@acme.ph']);
    expect(sent[0].subject).toContain(
      'Official Payslip: October 1 – October 15, 2026',
    );
    expect(sent[0].html).toContain('Juan Dela Cruz');
    expect(sent[0].html).toContain('₱21,500.00');
    expect(sent[0].html).toContain('Encrypted Attachment Notice');
    expect(sent[0].attachments).toHaveLength(1);
    expect(sent[0].attachments?.[0].filename).toBe(
      'Payslip_EMP-2026-001_20261015.pdf',
    );
    expect(sent[0].attachments?.[0].contentType).toBe('application/pdf');
  });

  it('formats and dispatches leave filed email notification', async () => {
    const result = await service.sendLeaveFiledEmail(
      {
        managerName: 'Carlos Reyes',
        employeeName: 'Maria Santos',
        leaveType: 'VACATION',
        startDate: '2026-11-03',
        endDate: '2026-11-05',
        daysCount: 3,
        reason: 'Family event',
        portalUrl: 'http://localhost:3000/portal/leaves',
      },
      'manager@acme.ph',
    );

    expect(result.success).toBe(true);
    const sent = service.getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['manager@acme.ph']);
    expect(sent[0].subject).toContain(
      'Leave Request Pending: Maria Santos (VACATION)',
    );
    expect(sent[0].html).toContain('Maria Santos');
    expect(sent[0].html).toContain('3 day(s)');
    expect(sent[0].html).toContain('Family event');
  });

  it('formats and dispatches leave decision email notification', async () => {
    const result = await service.sendLeaveDecidedEmail(
      {
        employeeName: 'Maria Santos',
        leaveType: 'VACATION',
        startDate: '2026-11-03',
        endDate: '2026-11-05',
        daysCount: 3,
        decision: 'APPROVED',
        reviewerName: 'Carlos Reyes',
        reviewComments: 'Approved, enjoy your vacation!',
        portalUrl: 'http://localhost:3000/portal/leaves',
      },
      'maria@acme.ph',
    );

    expect(result.success).toBe(true);
    const sent = service.getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['maria@acme.ph']);
    expect(sent[0].subject).toContain('Leave Request Approved: VACATION');
    expect(sent[0].html).toContain('Your Leave Request has been Approved');
    expect(sent[0].html).toContain('Approved, enjoy your vacation!');
  });

  it('sends email via Resend API when resend driver is configured', async () => {
    const originalFetch = global.fetch;
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'resend_email_12345' }),
    });
    global.fetch = mockFetch;

    try {
      const resendService = new EmailService({
        driver: 'resend',
        resendApiKey: 're_test_key_12345',
      });

      expect(resendService.getDriver()).toBe('resend');

      const result = await resendService.sendEmail({
        to: 'employee@sweldoph.local',
        subject: 'Resend Test',
        html: '<p>Via Resend</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('resend_email_12345');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer re_test_key_12345',
          }),
        }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('handles Resend API error response gracefully', async () => {
    const originalFetch = global.fetch;
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Domain not verified',
    });
    global.fetch = mockFetch;

    try {
      const resendService = new EmailService({
        driver: 'resend',
        resendApiKey: 're_test_key_12345',
      });

      const result = await resendService.sendEmail({
        to: 'employee@sweldoph.local',
        subject: 'Resend Error Test',
        html: '<p>Via Resend</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Domain not verified');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
