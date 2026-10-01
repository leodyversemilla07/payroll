import { Injectable } from '@nestjs/common';
import { type Prisma, prisma } from '@workspace/db';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.service';

export interface AuditEntry {
  user: AuthenticatedUser;
  request: Request;
  action:
    | 'LOGIN'
    | 'LOGOUT'
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'APPROVE'
    | 'IMPORT'
    | 'EXPORT';
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
}

@Injectable()
export class AuditService {
  async record(
    entry: AuditEntry,
    client: Pick<Prisma.TransactionClient, 'auditLog'> = prisma,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        organizationId: entry.user.organizationId,
        userId: entry.user.id,
        userEmail: entry.user.email,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        previousData: this.toJsonValue(entry.previousValue),
        newData: this.toJsonValue(entry.newValue),
        ipAddress: entry.request.ip,
        userAgent: entry.request.get('user-agent')?.slice(0, 512),
      },
    });
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    return JSON.parse(
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === 'bigint' ? item.toString() : item,
      ),
    ) as Prisma.InputJsonValue;
  }
}
