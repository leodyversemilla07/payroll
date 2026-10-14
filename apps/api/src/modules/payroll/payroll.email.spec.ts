import { prisma } from '@workspace/db';
import { EmailService } from '../../infrastructure/email/email.service';
import { PayrollService } from './payroll.service';
import type { PayslipPdfService } from './payslip-pdf.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    payrollRun: { findFirst: jest.fn() },
    payslip: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    employee: { findFirst: jest.fn() },
  },
}));

describe('PayrollService email delivery', () => {
  let payrollService: PayrollService;
  let mockPdfService: jest.Mocked<Partial<PayslipPdfService>>;
  let emailService: EmailService;

  beforeEach(() => {
    emailService = new EmailService({ driver: 'mock' });
    mockPdfService = {
      getPayslipPdfForEmail: jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-1.4 mock pdf'),
        fileName: 'Payslip_EMP-001_20261015.pdf',
        isEncrypted: true,
        passwordHint: 'Protected with your Date of Birth (MMDDYYYY)',
        employeeEmail: 'juan@sweldoph.local',
        employeeName: 'Juan Dela Cruz',
        employeeNumber: 'EMP-001',
        cutoffDescription: 'October 1 – October 15, 2026',
        paymentDate: '2026-10-15',
        grossPayFormatted: '₱25,000.00',
        totalDeductionsFormatted: '₱3,500.00',
        netPayFormatted: '₱21,500.00',
        organizationName: 'SweldoPH Test Org',
      }),
    };

    payrollService = new PayrollService(
      {} as ConstructorParameters<typeof PayrollService>[0],
      mockPdfService as PayslipPdfService,
      emailService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    emailService.clearSentEmails();
  });

  describe('emailPayslip', () => {
    it('successfully sends encrypted payslip email when employee has valid email', async () => {
      const result = await payrollService.emailPayslip('payslip-1', 'org-1');

      expect(result.success).toBe(true);
      expect(result.employeeName).toBe('Juan Dela Cruz');
      expect(result.employeeEmail).toBe('juan@sweldoph.local');

      const sent = emailService.getSentEmails();
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toEqual(['juan@sweldoph.local']);
      expect(sent[0].subject).toContain(
        'Official Payslip: October 1 – October 15, 2026',
      );
      expect(sent[0].attachments).toHaveLength(1);
    });

    it('throws UnprocessableEntityException when employee email is missing or invalid', async () => {
      mockPdfService.getPayslipPdfForEmail = jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-1.4'),
        fileName: 'Payslip.pdf',
        isEncrypted: false,
        passwordHint: '',
        employeeEmail: '', // Missing
        employeeName: 'No Email Employee',
        employeeNumber: 'EMP-999',
        cutoffDescription: 'Period',
        paymentDate: '2026-10-15',
        grossPayFormatted: '₱10,000.00',
        totalDeductionsFormatted: '₱0.00',
        netPayFormatted: '₱10,000.00',
        organizationName: 'Org',
      });

      await expect(
        payrollService.emailPayslip('payslip-no-email', 'org-1'),
      ).rejects.toThrow('has no valid email address configured');

      expect(emailService.getSentEmails()).toHaveLength(0);
    });
  });

  describe('emailRunPayslips', () => {
    it('rejects batch email when payroll run is still in DRAFT status', async () => {
      jest.mocked(prisma.payrollRun.findFirst).mockResolvedValue({
        id: 'run-draft',
        organizationId: 'org-1',
        status: 'DRAFT',
        payslips: [],
      } as unknown as Awaited<ReturnType<typeof prisma.payrollRun.findFirst>>);

      await expect(
        payrollService.emailRunPayslips('run-draft', 'org-1'),
      ).rejects.toThrow(
        'Payroll run must be approved or disbursed before payslips can be emailed',
      );
    });

    it('batch sends payslips for a disbursed run and tallies sent and skipped correctly', async () => {
      jest.mocked(prisma.payrollRun.findFirst).mockResolvedValue({
        id: 'run-disbursed',
        organizationId: 'org-1',
        status: 'DISBURSED',
        payslips: [
          {
            id: 'slip-1',
            employee: {
              firstName: 'Juan',
              lastName: 'Dela Cruz',
              email: 'juan@sweldoph.local',
            },
          },
          {
            id: 'slip-2',
            employee: {
              firstName: 'Maria',
              lastName: 'Santos',
              email: 'maria@sweldoph.local',
            },
          },
          {
            id: 'slip-3',
            employee: { firstName: 'Ghost', lastName: 'Employee', email: '' }, // Skipped
          },
        ],
      } as unknown as Awaited<ReturnType<typeof prisma.payrollRun.findFirst>>);

      const result = await payrollService.emailRunPayslips(
        'run-disbursed',
        'org-1',
      );

      expect(result.totalPayslips).toBe(3);
      expect(result.sentCount).toBe(2);
      expect(result.skippedCount).toBe(1);
      expect(result.failedCount).toBe(0);

      const sent = emailService.getSentEmails();
      expect(sent).toHaveLength(2);
      expect(sent.map((e) => e.to[0])).toEqual([
        'juan@sweldoph.local',
        'maria@sweldoph.local',
      ]);
    });
  });
});
