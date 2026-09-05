import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import { hashPassword, verifyPassword } from './password';

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
}

export interface AuthResult {
  user: AuthenticatedUser;
  expiresAt: Date;
}

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
  ): Promise<AuthResult | null> {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    const passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
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
  }): AuthenticatedUser {
    return {
      id: user.id,
      organizationId: user.organizationId,
      employeeId: user.employeeId ?? undefined,
      email: user.email,
      name: user.name,
      role: user.role,
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
