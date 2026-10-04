import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Role } from '@workspace/db';
import type { StorageService } from '../../storage/storage.service';
import { formatDobPassword, PayslipPdfService } from './payslip-pdf.service';

jest.mock('@workspace/db', () => ({
  Role: {
    SUPER_ADMIN: 'SUPER_ADMIN',
    HR_ADMIN: 'HR_ADMIN',
    PAYROLL_SPECIALIST: 'PAYROLL_SPECIALIST',
    DEPARTMENT_MANAGER: 'DEPARTMENT_MANAGER',
    EMPLOYEE: 'EMPLOYEE',
  },
  prisma: {
    payslip: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    payrollRun: {
      findFirst: jest.fn(),
    },
  },
}));

describe('PayslipPdfService', () => {
  let service: PayslipPdfService;
  let mockStorage: {
    upload: jest.Mock;
    getFile: jest.Mock;
    getPresignedUrl: jest.Mock;
  };

  const mockEmployee = {
    id: 'emp-1',
    employeeNumber: 'EMP-2026-001',
    firstName: 'Maria',
    lastName: 'Santos',
    middleName: 'Cruz',
    suffix: null,
    tin: '123-456-789-000',
    sssNo: '33-1234567-8',
    philhealthNo: '12-345678901-2',
    pagibigNo: '1234-5678-9012',
    dateOfBirth: new Date('1995-06-15T00:00:00.000Z'),
    employmentStatus: 'ACTIVE',
    employmentType: 'REGULAR',
    department: { name: 'Engineering' },
    branch: { name: 'Head Office' },
  };

  const mockPayrollRun = {
    id: 'run-1',
    organizationId: 'org-1',
    cutoffSequence: 'SECOND_CUTOFF',
    cutoffStartDate: new Date('2026-09-16T00:00:00.000Z'),
    cutoffEndDate: new Date('2026-09-30T00:00:00.000Z'),
    paymentDate: new Date('2026-09-30T00:00:00.000Z'),
    status: 'DISBURSED',
  };

  const mockPayslip = {
    id: 'slip-1',
    payrollRunId: 'run-1',
    employeeId: 'emp-1',
    basicPayCents: 2500000n,
    paidLeavePayCents: 0n,
    overtimePayCents: 150000n,
    nightDiffPayCents: 0n,
    holidayPayCents: 0n,
    restDayPayCents: 0n,
    taxableAllowancesCents: 0n,
    nonTaxableAllowancesCents: 100000n,
    bonusPaidCents: 0n,
    grossPayCents: 2750000n,
    tardinessDeductionCents: 5000n,
    undertimeDeductionCents: 0n,
    absenceDeductionCents: 0n,
    sssEmployeeCents: 112500n,
    sssWispEmployeeCents: 0n,
    philhealthEmployeeCents: 62500n,
    pagibigEmployeeCents: 20000n,
    withholdingTaxCents: 150000n,
    loanDeductionsCents: 0n,
    otherDeductionsCents: 0n,
    totalDeductionsCents: 350000n,
    netPayCents: 2400000n,
    sssEmployerCents: 215000n,
    philhealthEmployerCents: 62500n,
    pagibigEmployerCents: 20000n,
    pdfStoragePath: null,
    pdfPasswordHash: null,
    employee: mockEmployee,
    payrollRun: mockPayrollRun,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage = {
      upload: jest.fn().mockResolvedValue({
        path: 's3://payroll-payslips/org-1/runs/run-1/payslips/slip-1.pdf',
        url: 'https://storage.example.com/payslip.pdf',
      }),
      getFile: jest.fn().mockResolvedValue(null),
      getPresignedUrl: jest
        .fn()
        .mockResolvedValue('https://storage.example.com/payslip.pdf'),
    };
    service = new PayslipPdfService(mockStorage as unknown as StorageService);
  });

  describe('formatDobPassword', () => {
    it('formats a date to MMDDYYYY', () => {
      const dob = new Date('1995-06-15T00:00:00.000Z');
      expect(formatDobPassword(dob)).toBe('06151995');
    });

    it('returns null for null or invalid dates', () => {
      expect(formatDobPassword(null)).toBeNull();
      expect(formatDobPassword(undefined)).toBeNull();
      expect(formatDobPassword('invalid-date')).toBeNull();
    });
  });

  describe('generatePayslipPdf', () => {
    it('throws NotFoundException if payslip is not found', async () => {
      (prisma.payslip.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.generatePayslipPdf('missing', 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('renders and stores an encrypted PDF when employee has DOB', async () => {
      (prisma.payslip.findFirst as jest.Mock).mockResolvedValue(mockPayslip);
      (prisma.payslip.update as jest.Mock).mockResolvedValue({
        ...mockPayslip,
        pdfStoragePath:
          's3://payroll-payslips/org-1/runs/run-1/payslips/slip-1.pdf',
      });

      const result = await service.generatePayslipPdf('slip-1', 'org-1');

      expect(result.payslipId).toBe('slip-1');
      expect(result.isEncrypted).toBe(true);
      expect(result.fileName).toBe('Payslip_EMP-2026-001_20260930.pdf');
      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.stringContaining(
          'organizations/org-1/runs/run-1/payslips/slip-1.pdf',
        ),
        expect.any(Buffer),
        'application/pdf',
      );
      expect(prisma.payslip.update).toHaveBeenCalledWith({
        where: { id: 'slip-1' },
        data: {
          pdfStoragePath: expect.stringContaining('s3://'),
          pdfPasswordHash: expect.any(String),
        },
      });
    });

    it('renders unencrypted PDF when employee has no DOB', async () => {
      const noDobPayslip = {
        ...mockPayslip,
        employee: { ...mockEmployee, dateOfBirth: null },
      };
      (prisma.payslip.findFirst as jest.Mock).mockResolvedValue(noDobPayslip);
      (prisma.payslip.update as jest.Mock).mockResolvedValue(noDobPayslip);

      const result = await service.generatePayslipPdf('slip-1', 'org-1');

      expect(result.isEncrypted).toBe(false);
      expect(result.passwordHint).toBeUndefined();
    });
  });

  describe('generateRunPdfs', () => {
    it('throws NotFoundException if run is not found', async () => {
      (prisma.payrollRun.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.generateRunPdfs('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('generates PDFs for all payslips in the run', async () => {
      (prisma.payrollRun.findFirst as jest.Mock).mockResolvedValue({
        id: 'run-1',
        payslips: [{ id: 'slip-1' }, { id: 'slip-2' }],
      });
      (prisma.payslip.findFirst as jest.Mock).mockResolvedValue(mockPayslip);
      (prisma.payslip.update as jest.Mock).mockResolvedValue(mockPayslip);

      const result = await service.generateRunPdfs('run-1', 'org-1');

      expect(result.total).toBe(2);
      expect(result.generated).toBe(2);
      expect(mockStorage.upload).toHaveBeenCalledTimes(2);
    });
  });

  describe('downloadPayslip', () => {
    it('rejects employee accessing another employee payslip', async () => {
      (prisma.payslip.findFirst as jest.Mock).mockResolvedValue(mockPayslip);

      const otherEmployeeUser = {
        id: 'user-2',
        organizationId: 'org-1',
        employeeId: 'emp-2',
        email: 'other@example.com',
        name: 'Other User',
        role: Role.EMPLOYEE,
      };

      await expect(
        service.downloadPayslip('slip-1', 'org-1', otherEmployeeUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows employee to access their own approved/disbursed payslip', async () => {
      (prisma.payslip.findFirst as jest.Mock).mockResolvedValue(mockPayslip);
      (prisma.payslip.update as jest.Mock).mockResolvedValue(mockPayslip);

      const employeeUser = {
        id: 'user-1',
        organizationId: 'org-1',
        employeeId: 'emp-1',
        email: 'maria@example.com',
        name: 'Maria Santos',
        role: Role.EMPLOYEE,
      };

      const result = await service.downloadPayslip(
        'slip-1',
        'org-1',
        employeeUser,
      );

      expect(result.fileName).toBe('Payslip_EMP-2026-001_20260930.pdf');
      expect(result.dataBase64).toBeDefined();
      expect(result.isEncrypted).toBe(true);
    });

    it('allows staff to access any payslip', async () => {
      (prisma.payslip.findFirst as jest.Mock).mockResolvedValue(mockPayslip);
      (prisma.payslip.update as jest.Mock).mockResolvedValue(mockPayslip);

      const staffUser = {
        id: 'user-admin',
        organizationId: 'org-1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: Role.PAYROLL_SPECIALIST,
      };

      const result = await service.downloadPayslip(
        'slip-1',
        'org-1',
        staffUser,
      );

      expect(result.fileName).toBe('Payslip_EMP-2026-001_20260930.pdf');
      expect(result.dataBase64).toBeDefined();
    });
  });

  describe('downloadRunZip', () => {
    it('throws BadRequestException if run has no payslips', async () => {
      (prisma.payrollRun.findFirst as jest.Mock).mockResolvedValue({
        id: 'run-1',
        payslips: [],
      });

      await expect(service.downloadRunZip('run-1', 'org-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('packages all payslips into a ZIP archive', async () => {
      (prisma.payrollRun.findFirst as jest.Mock).mockResolvedValue({
        ...mockPayrollRun,
        payslips: [mockPayslip],
      });
      (prisma.payslip.update as jest.Mock).mockResolvedValue(mockPayslip);

      const result = await service.downloadRunZip('run-1', 'org-1');

      expect(result.fileName).toContain('PayrollRun_SECOND_CUTOFF');
      expect(result.fileName).toContain('.zip');
      expect(result.dataBase64).toBeDefined();

      const zip = await new (require('jszip'))().loadAsync(
        Buffer.from(result.dataBase64, 'base64'),
      );
      expect(zip.file('Payslip_EMP-2026-001_20260930.pdf')).not.toBeNull();
    });
  });
});
