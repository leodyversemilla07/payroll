import { prisma } from '@workspace/db';
import type { Request } from 'express';
import { AuditService } from './audit.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe('AuditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redacts sensitive employee and authentication fields recursively', async () => {
    const service = new AuditService();
    const request = {
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('Jest-Agent'),
    } as unknown as Request;

    await service.record({
      user: {
        id: 'user-1',
        organizationId: 'org-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'HR_ADMIN',
      },
      request,
      action: 'UPDATE',
      entityType: 'Employee',
      entityId: 'employee-1',
      previousValue: {
        bankAccountNumber: '1234567890',
        tin: '123-456-789',
        sssNo: '12-3456789-0',
        philhealthNo: '12-345678901-2',
        pagibigNo: '1234-5678-9012',
        nested: [{ mfaSecret: 'secret-value' }],
      },
      newValue: {
        passwordHash: 'hash-value',
        mfaBackupCodes: ['hash-1'],
        residentialAddress: 'Sensitive address',
        contactNumber: '+639171234567',
        dateOfBirth: '1990-01-01',
        departmentId: 'department-1',
      },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousData: {
          bankAccountNumber: '[REDACTED]',
          tin: '[REDACTED]',
          sssNo: '[REDACTED]',
          philhealthNo: '[REDACTED]',
          pagibigNo: '[REDACTED]',
          nested: [{ mfaSecret: '[REDACTED]' }],
        },
        newData: {
          passwordHash: '[REDACTED]',
          mfaBackupCodes: '[REDACTED]',
          residentialAddress: '[REDACTED]',
          contactNumber: '[REDACTED]',
          dateOfBirth: '[REDACTED]',
          departmentId: 'department-1',
        },
      }),
    });
  });

  it('preserves safe audit values and converts bigint values to strings', async () => {
    const service = new AuditService();
    const request = {
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as Request;

    await service.record({
      user: {
        id: 'user-1',
        organizationId: 'org-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'HR_ADMIN',
      },
      request,
      action: 'CREATE',
      entityType: 'EmployeeLoan',
      entityId: 'loan-1',
      newValue: {
        loanType: 'COMPANY_CASH_ADVANCE',
        principalCents: BigInt(100_00),
      },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        newData: {
          loanType: 'COMPANY_CASH_ADVANCE',
          principalCents: '10000',
        },
      }),
    });
  });
});
