import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@workspace/db';

/**
 * Shared guards for write-once tax evidence (prior-employer records,
 * monthly remittances, settlements, issuances). Corrections append a
 * higher version under four-eyes review; rows are never mutated.
 */
export function assertSupportedTaxYear(taxYear: number): void {
  if (!Number.isInteger(taxYear) || taxYear < 2023 || taxYear > 2100) {
    throw new UnprocessableEntityException(
      'BIR tax reconciliation supports 2023–2100 only; earlier years require a different annual tax table',
    );
  }
}

export async function assertEmployeeInTenant(
  database: Prisma.TransactionClient,
  employeeId: string,
  organizationId: string,
): Promise<void> {
  const employee = await database.employee.findFirst({
    where: { id: employeeId, organizationId },
    select: { id: true },
  });
  if (!employee) throw new NotFoundException('Employee not found');
}

export async function createEvidence<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Tax evidence for this key already exists; use the correction procedure with a reviewer to supersede it',
      );
    }
    throw error;
  }
}

export function assertCorrectionReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 10 || trimmed.length > 500) {
    throw new UnprocessableEntityException(
      'Correction requires a reason of 10–500 characters',
    );
  }
  return trimmed;
}

export async function assertCorrectionReviewer(
  database: Prisma.TransactionClient,
  input: {
    organizationId: string;
    recorderId: string;
    reviewerId: string;
  },
): Promise<void> {
  if (input.reviewerId === input.recorderId) {
    throw new UnprocessableEntityException(
      'Correction reviewer must differ from the recorder (four-eyes)',
    );
  }
  const reviewer = await database.user.findFirst({
    where: {
      id: input.reviewerId,
      organizationId: input.organizationId,
      isActive: true,
      role: { in: ['SUPER_ADMIN', 'HR_ADMIN'] },
    },
    select: { id: true },
  });
  if (!reviewer) {
    throw new UnprocessableEntityException(
      'Correction reviewer must be an active HR/admin in this organization',
    );
  }
}
