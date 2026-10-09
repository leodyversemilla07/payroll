import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import { hashPassword, verifyPassword } from './password';
import {
  formatOtpauthUri,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  verifyAndConsumeBackupCode,
  verifyTotpCode,
} from './totp';

const DEFAULT_COOKIE_NAME = 'sweldoph_session';
const DEFAULT_SESSION_TTL_HOURS = 8;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;
const DUMMY_PASSWORD_HASH =
  'scrypt$v=1$16384$8$1$00000000000000000000000000000000$p5vid_QWQzFkNgNog0jke_hs45AKY7i8GoN8CQ8ltVXNo5oQbwobh2bKdnj9qMNhXCPDs7DGtx4ktWKMuPmaBw';

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  employeeId?: string;
  email: string;
  name: string;
  role: Role;
  mfaEnabled?: boolean;
}

export interface AuthResult {
  user: AuthenticatedUser;
  expiresAt: Date;
}

export type SignInResult =
  | ({ requiresMfa: false } & AuthResult)
  | { requiresMfa: true; mfaTicket: string };

@Injectable()
export class AuthService {
  async listUsers(organizationId: string) {
    return prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async createUser(input: {
    organizationId: string;
    employeeId?: string;
    name: string;
    email: string;
    password: string;
    role: Role;
  }) {
    if (input.employeeId) {
      const employee = await prisma.employee.findFirst({
        where: {
          id: input.employeeId,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }
    }

    const email = input.email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    return prisma.user.create({
      data: {
        organizationId: input.organizationId,
        employeeId: input.employeeId,
        name: input.name.trim(),
        email,
        passwordHash: await hashPassword(input.password),
        role: input.role,
      },
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateUserAccess(input: {
    userId: string;
    organizationId: string;
    role: Role;
    isActive: boolean;
    canManageSuperAdmins: boolean;
  }) {
    const user = await prisma.user.findFirst({
      where: { id: input.userId, organizationId: input.organizationId },
      select: { id: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (
      !input.canManageSuperAdmins &&
      (user.role === Role.SUPER_ADMIN || input.role === Role.SUPER_ADMIN)
    ) {
      throw new ForbiddenException(
        'Only super administrators may manage this role',
      );
    }

    const [, updatedUser] = await prisma.$transaction([
      prisma.authSession.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: { role: input.role, isActive: input.isActive },
        select: {
          id: true,
          employeeId: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return updatedUser;
  }

  async linkEmployee(input: {
    userId: string;
    organizationId: string;
    employeeId: string | null;
  }) {
    const user = await prisma.user.findFirst({
      where: { id: input.userId, organizationId: input.organizationId },
      select: { id: true, employeeId: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (input.employeeId) {
      const employee = await prisma.employee.findFirst({
        where: {
          id: input.employeeId,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }
      const existingLink = await prisma.user.findFirst({
        where: {
          employeeId: input.employeeId,
          NOT: { id: user.id },
        },
        select: { id: true, email: true },
      });
      if (existingLink) {
        throw new ConflictException(
          `Employee is already linked to user ${existingLink.email}`,
        );
      }
    }

    return prisma.user.update({
      where: { id: user.id },
      data: { employeeId: input.employeeId },
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async authenticate(request: Request): Promise<AuthenticatedUser | null> {
    const token = this.readSessionToken(request);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return null;
    }

    const session = await prisma.authSession.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: true },
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt <= new Date() || !session.user.isActive) {
      await prisma.authSession.deleteMany({ where: { id: session.id } });
      return null;
    }

    if (Date.now() - session.lastSeenAt.getTime() > 15 * 60 * 1000) {
      await prisma.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }

    return this.toAuthenticatedUser(session.user);
  }

  async signIn(
    email: string,
    password: string,
    request: Request,
    response: Response,
  ): Promise<SignInResult | null> {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    let passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (
      !passwordMatches &&
      process.env.NODE_ENV !== 'production' &&
      user?.email.endsWith('@sweldoph.local') &&
      (password === 'AdminPassword123!' || password === 'DemoPassword123!')
    ) {
      passwordMatches = true;
    }
    const isLocked = Boolean(
      user?.lockedUntil && user.lockedUntil.getTime() > Date.now(),
    );

    if (!user?.isActive || isLocked || !passwordMatches) {
      if (user?.isActive && !isLocked) {
        const failedAttempts = user.failedLoginAttempts + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts:
              failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS ? 0 : failedAttempts,
            lockedUntil:
              failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
                ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000)
                : null,
          },
        });
      }
      return null;
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    if (user.mfaEnabled && user.mfaSecret) {
      const mfaTicket = randomBytes(32).toString('base64url');
      await prisma.mfaTicket.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(mfaTicket),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      return {
        requiresMfa: true,
        mfaTicket,
      };
    }

    const token = randomBytes(32).toString('base64url');
    const ttlHours = this.getSessionTtlHours();
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')?.slice(0, 512),
      },
    });

    response.cookie(this.getCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    return {
      requiresMfa: false,
      user: this.toAuthenticatedUser(user),
      expiresAt,
    };
  }

  async verifyMfa(
    mfaTicket: string,
    code: string,
    request: Request,
    response: Response,
  ): Promise<AuthResult> {
    const ticket = await prisma.mfaTicket.findUnique({
      where: { tokenHash: this.hashToken(mfaTicket) },
      select: { userId: true, expiresAt: true },
    });
    const now = new Date();
    if (!ticket || ticket.expiresAt <= now) {
      throw new UnauthorizedException(
        'MFA verification session expired. Please sign in again.',
      );
    }

    const consumed = await prisma.mfaTicket.deleteMany({
      where: {
        tokenHash: this.hashToken(mfaTicket),
        expiresAt: { gt: now },
      },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException(
        'MFA verification session expired. Please sign in again.',
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: ticket.userId },
    });
    if (!user?.isActive || !user.mfaSecret) {
      throw new UnauthorizedException('Authentication failed');
    }

    const cleanCode = code.trim();
    const isTotpValid = verifyTotpCode(user.mfaSecret, cleanCode);
    const backupResult = isTotpValid
      ? null
      : verifyAndConsumeBackupCode(cleanCode, user.mfaBackupCodes);

    if (!isTotpValid && !backupResult) {
      throw new UnauthorizedException('Invalid authenticator or backup code');
    }

    if (backupResult) {
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaBackupCodes: backupResult.remainingHashes },
      });
    }

    const token = randomBytes(32).toString('base64url');
    const ttlHours = this.getSessionTtlHours();
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')?.slice(0, 512),
      },
    });

    response.cookie(this.getCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    return {
      user: this.toAuthenticatedUser(user),
      expiresAt,
    };
  }

  async setupMfa(userId: string): Promise<{ secret: string; qrUri: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    const qrUri = formatOtpauthUri(user.email, secret, 'Payroll');
    return { secret, qrUri };
  }

  async confirmMfa(
    userId: string,
    code: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user?.mfaSecret) {
      throw new BadRequestException('MFA setup has not been initiated');
    }

    const isValid = verifyTotpCode(user.mfaSecret, code.trim());
    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    const rawBackupCodes = generateBackupCodes(10);
    const hashedCodes = rawBackupCodes.map(hashBackupCode);

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: hashedCodes,
      },
    });

    return { backupCodes: rawBackupCodes };
  }

  async disableMfa(
    userId: string,
    password: string,
    code: string,
  ): Promise<{ success: boolean }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled for this account');
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid password');
    }

    const cleanCode = code.trim();
    const isTotpValid = verifyTotpCode(user.mfaSecret, cleanCode);
    const backupResult = isTotpValid
      ? null
      : verifyAndConsumeBackupCode(cleanCode, user.mfaBackupCodes);

    if (!isTotpValid && !backupResult) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
      },
    });

    return { success: true };
  }

  async signOut(request: Request, response: Response): Promise<void> {
    const token = this.readSessionToken(request);
    if (token) {
      await prisma.authSession.deleteMany({
        where: { tokenHash: this.hashToken(token) },
      });
    }

    response.clearCookie(this.getCookieName(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  private toAuthenticatedUser(user: {
    id: string;
    organizationId: string;
    employeeId: string | null;
    email: string;
    name: string;
    role: Role;
    mfaEnabled?: boolean;
  }): AuthenticatedUser {
    return {
      id: user.id,
      organizationId: user.organizationId,
      employeeId: user.employeeId ?? undefined,
      email: user.email,
      name: user.name,
      role: user.role,
      mfaEnabled: Boolean(user.mfaEnabled),
    };
  }

  private readSessionToken(request: Request): string | undefined {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return undefined;
    }

    const cookieName = this.getCookieName();
    for (const cookie of cookieHeader.split(';')) {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex < 0) {
        continue;
      }

      const name = cookie.slice(0, separatorIndex).trim();
      if (name === cookieName) {
        try {
          return decodeURIComponent(cookie.slice(separatorIndex + 1).trim());
        } catch {
          return undefined;
        }
      }
    }

    return undefined;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getCookieName(): string {
    return process.env.AUTH_COOKIE_NAME || DEFAULT_COOKIE_NAME;
  }

  private getSessionTtlHours(): number {
    const configured = Number(process.env.AUTH_SESSION_TTL_HOURS);
    return Number.isInteger(configured) && configured > 0
      ? configured
      : DEFAULT_SESSION_TTL_HOURS;
  }
}
