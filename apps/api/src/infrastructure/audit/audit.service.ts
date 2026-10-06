import { Injectable } from '@nestjs/common';
import { type Prisma, prisma } from '@workspace/db';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../auth/auth.service';

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

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN =
  /(?:password|secret|backupcode|bankaccount|bankname|tin|sssno|philhealthno|pagibigno|residentialaddress|contactnumber|dateofbirth)/;

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
        previousData: this.toJsonValue(this.redact(entry.previousValue)),
        newData: this.toJsonValue(this.redact(entry.newValue)),
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

  private redact(value: unknown, key?: string): unknown {
    if (
      key &&
      SENSITIVE_KEY_PATTERN.test(key.replace(/[^a-z0-9]/gi, '').toLowerCase())
    ) {
      return REDACTED;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [
          entryKey,
          this.redact(entryValue, entryKey),
        ]),
      );
    }
    return value;
  }
}
