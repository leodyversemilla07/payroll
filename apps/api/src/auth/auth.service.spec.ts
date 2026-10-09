import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { hashPassword } from './password';
import {
  generateBackupCodes,
  generateTotpCode,
  generateTotpSecret,
  hashBackupCode,
} from './totp';

jest.mock('@workspace/db', () => ({
  Role: {
    SUPER_ADMIN: 'SUPER_ADMIN',
    HR_ADMIN: 'HR_ADMIN',
    PAYROLL_SPECIALIST: 'PAYROLL_SPECIALIST',
    DEPARTMENT_MANAGER: 'DEPARTMENT_MANAGER',
    EMPLOYEE: 'EMPLOYEE',
  },
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    employee: {
      findFirst: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    mfaTicket: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

describe('AuthService MFA', () => {
  let service: AuthService;
  let mockRequest: Partial<Request>;
  let mockResponse: {
    cookie: jest.Mock;
    clearCookie: jest.Mock;
  };

  const testPassword = 'Password123456!';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword(testPassword);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService();
    mockRequest = {
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('Jest-Agent'),
      headers: {},
    };
    mockResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
  });

  describe('setupMfa', () => {
    it('generates a secret and otpauth URI and saves secret to database', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      const result = await service.setupMfa('user-1');

      expect(result.secret).toBeDefined();
      expect(result.qrUri).toContain(
        'otpauth://totp/Payroll:user%40example.com?secret=',
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mfaSecret: result.secret },
      });
    });

    it('throws NotFoundException if user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.setupMfa('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirmMfa', () => {
    it('throws BadRequestException if MFA setup was not initiated', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        mfaSecret: null,
      });

      await expect(service.confirmMfa('user-1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws UnauthorizedException if code is invalid', async () => {
      const secret = generateTotpSecret();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        mfaSecret: secret,
      });

      await expect(service.confirmMfa('user-1', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('activates MFA and returns 10 backup codes upon valid code', async () => {
      const secret = generateTotpSecret();
      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const validCode = generateTotpCode(secret, currentStep);

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        mfaSecret: secret,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      const result = await service.confirmMfa('user-1', validCode);

      expect(result.backupCodes).toHaveLength(10);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          mfaEnabled: true,
          mfaBackupCodes: expect.any(Array),
        },
      });
    });
  });

  describe('signIn with MFA', () => {
    it('authenticates directly without ticket if MFA is disabled', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User One',
        role: Role.EMPLOYEE,
        passwordHash,
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        mfaEnabled: false,
        organizationId: 'org-1',
      });
      (prisma.authSession.create as jest.Mock).mockResolvedValue({});

      const result = await service.signIn(
        'user@example.com',
        testPassword,
        mockRequest as Request,
        mockResponse as unknown as Response,
      );

      expect(result).not.toBeNull();
      expect(result?.requiresMfa).toBe(false);
      if (result && !result.requiresMfa) {
        expect(result.user.email).toBe('user@example.com');
      }
      expect(mockResponse.cookie).toHaveBeenCalled();
    });

    it('returns mfaTicket and does not issue session cookie when MFA is enabled', async () => {
      const secret = generateTotpSecret();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User One',
        role: Role.EMPLOYEE,
        passwordHash,
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        mfaEnabled: true,
        mfaSecret: secret,
        organizationId: 'org-1',
      });

      const result = await service.signIn(
        'user@example.com',
        testPassword,
        mockRequest as Request,
        mockResponse as unknown as Response,
      );

      expect(result).not.toBeNull();
      expect(result?.requiresMfa).toBe(true);
      if (result?.requiresMfa) {
        expect(result.mfaTicket).toBeDefined();
        expect(typeof result.mfaTicket).toBe('string');
      }
      expect(mockResponse.cookie).not.toHaveBeenCalled();
      expect(prisma.mfaTicket.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('verifyMfa', () => {
    it('throws UnauthorizedException for invalid or expired ticket', async () => {
      await expect(
        service.verifyMfa(
          'non-existent-ticket',
          '123456',
          mockRequest as Request,
          mockResponse as unknown as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired persisted ticket before loading the user', async () => {
      (prisma.mfaTicket.findUnique as jest.Mock).mockResolvedValue({
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.verifyMfa(
          'expired-ticket',
          '123456',
          mockRequest as Request,
          mockResponse as unknown as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.mfaTicket.deleteMany).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('validates TOTP code and creates session', async () => {
      const secret = generateTotpSecret();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User One',
        role: Role.EMPLOYEE,
        passwordHash,
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        mfaEnabled: true,
        mfaSecret: secret,
        mfaBackupCodes: [],
        organizationId: 'org-1',
      });
      (prisma.mfaTicket.findUnique as jest.Mock).mockImplementation(
        ({ where }: { where: { tokenHash: string } }) =>
          where.tokenHash
            ? {
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 60_000),
              }
            : null,
      );
      (prisma.mfaTicket.deleteMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      const loginResult = await service.signIn(
        'user@example.com',
        testPassword,
        mockRequest as Request,
        mockResponse as unknown as Response,
      );
      expect(loginResult?.requiresMfa).toBe(true);
      const ticket = (loginResult as { requiresMfa: true; mfaTicket: string })
        .mfaTicket;

      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const validCode = generateTotpCode(secret, currentStep);

      const authResult = await service.verifyMfa(
        ticket,
        validCode,
        mockRequest as Request,
        mockResponse as unknown as Response,
      );

      expect(authResult.user.id).toBe('user-1');
      expect(authResult.user.mfaEnabled).toBe(true);
      expect(mockResponse.cookie).toHaveBeenCalled();
    });

    it('validates backup code, consumes it, and creates session', async () => {
      const secret = generateTotpSecret();
      const rawCodes = generateBackupCodes(2);
      const hashedCodes = rawCodes.map(hashBackupCode);

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User One',
        role: Role.EMPLOYEE,
        passwordHash,
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        mfaEnabled: true,
        mfaSecret: secret,
        mfaBackupCodes: hashedCodes,
        organizationId: 'org-1',
      });
      (prisma.mfaTicket.findUnique as jest.Mock).mockResolvedValue({
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      (prisma.mfaTicket.deleteMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      const loginResult = await service.signIn(
        'user@example.com',
        testPassword,
        mockRequest as Request,
        mockResponse as unknown as Response,
      );
      const ticket = (loginResult as { requiresMfa: true; mfaTicket: string })
        .mfaTicket;

      const authResult = await service.verifyMfa(
        ticket,
        rawCodes[0],
        mockRequest as Request,
        mockResponse as unknown as Response,
      );

      expect(authResult.user.id).toBe('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mfaBackupCodes: [hashedCodes[1]] },
      });
      expect(mockResponse.cookie).toHaveBeenCalled();
    });

    it('rejects a ticket that was already consumed', async () => {
      (prisma.mfaTicket.findUnique as jest.Mock).mockResolvedValue({
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      (prisma.mfaTicket.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(
        service.verifyMfa(
          'consumed-ticket',
          '123456',
          mockRequest as Request,
          mockResponse as unknown as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('disableMfa', () => {
    it('throws BadRequestException if MFA is not enabled', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        mfaEnabled: false,
      });

      await expect(
        service.disableMfa('user-1', testPassword, '123456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException for invalid password', async () => {
      const secret = generateTotpSecret();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        mfaEnabled: true,
        mfaSecret: secret,
        passwordHash,
      });

      await expect(
        service.disableMfa('user-1', 'WrongPassword123!', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('disables MFA when password and code are valid', async () => {
      const secret = generateTotpSecret();
      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const validCode = generateTotpCode(secret, currentStep);

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        mfaEnabled: true,
        mfaSecret: secret,
        passwordHash,
        mfaBackupCodes: [],
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      const result = await service.disableMfa(
        'user-1',
        testPassword,
        validCode,
      );
      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: [],
        },
      });
    });
  });

  describe('linkEmployee', () => {
    it('successfully links an employee to a user', async () => {
      (prisma.user.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'u-1', employeeId: null }) // find user
        .mockResolvedValueOnce(null); // check existingLink
      (prisma.employee.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'emp-1',
      });
      (prisma.user.update as jest.Mock).mockResolvedValueOnce({
        id: 'u-1',
        employeeId: 'emp-1',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'SUPER_ADMIN',
        isActive: true,
      });

      const res = await service.linkEmployee({
        userId: 'u-1',
        organizationId: 'org-1',
        employeeId: 'emp-1',
      });

      expect(res.employeeId).toBe('emp-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { employeeId: 'emp-1' },
        select: expect.any(Object),
      });
    });

    it('successfully unlinks an employee from a user', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'u-1',
        employeeId: 'emp-1',
      });
      (prisma.user.update as jest.Mock).mockResolvedValueOnce({
        id: 'u-1',
        employeeId: null,
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'SUPER_ADMIN',
        isActive: true,
      });

      const res = await service.linkEmployee({
        userId: 'u-1',
        organizationId: 'org-1',
        employeeId: null,
      });

      expect(res.employeeId).toBeNull();
      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if user is not found', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.linkEmployee({
          userId: 'u-nonexistent',
          organizationId: 'org-1',
          employeeId: 'emp-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if employee is not found', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'u-1',
        employeeId: null,
      });
      (prisma.employee.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.linkEmployee({
          userId: 'u-1',
          organizationId: 'org-1',
          employeeId: 'emp-nonexistent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('scopes the link conflict check to the organization without leaking emails', async () => {
      (prisma.user.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'u-1', employeeId: null })
        .mockResolvedValueOnce({ id: 'u-2', email: 'other@example.com' });
      (prisma.employee.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'emp-1',
      });

      await expect(
        service.linkEmployee({
          userId: 'u-1',
          organizationId: 'org-1',
          employeeId: 'emp-1',
        }),
      ).rejects.toThrow('Employee is already linked to another user');
      expect(prisma.user.findFirst).toHaveBeenLastCalledWith({
        where: {
          employeeId: 'emp-1',
          organizationId: 'org-1',
          NOT: { id: 'u-1' },
        },
        select: { id: true },
      });
    });
  });
});
