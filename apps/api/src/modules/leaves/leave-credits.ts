import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type LeaveBalance,
  type LeaveCreditChange,
  Prisma,
  prisma,
} from '@workspace/db';

export interface LeaveCreditInput {
  operationId: string;
  organizationId: string;
  employeeId: string;
  leaveType: string;
  year: number;
  totalCredits: number;
  expectedRevision: number | null;
  sourceReference: string;
  reason: string;
  actorId: string;
  actorEmployeeId?: string;
}
export type CreditAudit = (data: {
  previous: LeaveBalance | null;
  balance: LeaveBalance;
  change: LeaveCreditChange;
  transaction: Prisma.TransactionClient;
}) => Promise<void>;
const conflict = () =>
  new ConflictException(
    'Leave credits changed or this operation identifier was already used. Reload balances before starting another adjustment.',
  );

export async function setEmployeeLeaveCredits(
  input: LeaveCreditInput,
  audit: CreditAudit,
) {
  validateCreditInput(input);
  if (input.actorEmployeeId === input.employeeId)
    throw new ForbiddenException(
      'You cannot allocate or adjust your own employee leave credits',
    );
  return prisma.$transaction(
    async (transaction) => {
      const employee = await transaction.employee.findFirst({
        where: { id: input.employeeId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!employee) throw new NotFoundException('Employee not found');
      // Check replay before revision: a lost successful response must never allocate twice.
      const replay = await transaction.leaveCreditChange.findFirst({
        where: {
          id: input.operationId,
          balance: { employee: { organizationId: input.organizationId } },
        },
        include: { balance: true },
      });
      if (replay) {
        if (
          replay.actorId !== input.actorId ||
          replay.balance.employeeId !== input.employeeId ||
          replay.balance.year !== input.year ||
          replay.balance.leaveType !== input.leaveType ||
          !replay.totalCredits.equals(input.totalCredits) ||
          replay.previousRevision !== input.expectedRevision ||
          replay.sourceReference !== input.sourceReference ||
          replay.reason !== input.reason
        )
          throw conflict();
        const { balance, ...change } = replay;
        return { balance, change, replayed: true };
      }
      const previous = await transaction.leaveBalance.findFirst({
        where: {
          employeeId: input.employeeId,
          employee: { organizationId: input.organizationId },
          leaveType: input.leaveType,
          year: input.year,
        },
      });
      if ((previous ? previous.revision : null) !== input.expectedRevision)
        throw conflict();
      if (!previous) {
        if (!/^[A-Z][A-Z0-9_]{0,49}$/.test(input.leaveType))
          throw new UnprocessableEntityException(
            'New leave types must use an uppercase policy code, such as SIL or VACATION',
          );
        const alias = await transaction.leaveBalance.findFirst({
          where: {
            employeeId: input.employeeId,
            year: input.year,
            leaveType: { equals: input.leaveType, mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (alias)
          throw new ConflictException(
            'This leave type already exists with different casing. Adjust the exact recorded type instead of creating another balance.',
          );
        const priorUsage = await transaction.leaveRequest.findFirst({
          where: {
            employeeId: input.employeeId,
            employee: { organizationId: input.organizationId },
            leaveType: { equals: input.leaveType, mode: 'insensitive' },
            isPaid: true,
            status: 'APPROVED',
            startDate: { lt: new Date(Date.UTC(input.year + 1, 0, 1)) },
            endDate: { gte: new Date(Date.UTC(input.year, 0, 1)) },
          },
          select: { id: true },
        });
        if (priorUsage)
          throw new UnprocessableEntityException(
            'Approved paid leave exists without a recorded balance. Reconcile used credits manually; allocation cannot assume zero usage.',
          );
      }
      const total = new Prisma.Decimal(input.totalCredits);
      const used = previous?.usedCredits ?? new Prisma.Decimal(0);
      if (
        previous &&
        (previous.totalCredits.isNegative() ||
          used.isNegative() ||
          previous.balance.isNegative() ||
          !previous.totalCredits.equals(used.plus(previous.balance)) ||
          !used.mod(0.5).equals(0))
      ) {
        throw new UnprocessableEntityException(
          'Existing leave credits are inconsistent or use unsupported fractions. Reconcile them manually; this form cannot reset usage.',
        );
      }
      if (total.lessThan(used))
        throw new UnprocessableEntityException(
          'Total credits cannot be less than already used credits',
        );
      if (previous) {
        const updated = await transaction.leaveBalance.updateMany({
          where: {
            id: previous.id,
            employee: { organizationId: input.organizationId },
            revision: input.expectedRevision as number,
          },
          data: {
            totalCredits: total,
            balance: total.minus(used),
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw conflict();
      }
      const balance = previous
        ? await transaction.leaveBalance.findUniqueOrThrow({
            where: { id: previous.id },
          })
        : await transaction.leaveBalance.create({
            data: {
              employeeId: input.employeeId,
              leaveType: input.leaveType,
              year: input.year,
              totalCredits: total,
              usedCredits: used,
              balance: total,
              revision: 1,
            },
          });
      const change = await transaction.leaveCreditChange.create({
        data: {
          id: input.operationId,
          balanceId: balance.id,
          kind: previous ? 'ADJUSTMENT' : 'ALLOCATION',
          previousTotalCredits: previous?.totalCredits ?? null,
          totalCredits: total,
          usedCredits: used,
          previousBalance: previous?.balance ?? null,
          availableBalance: balance.balance,
          previousRevision: previous?.revision ?? null,
          revision: balance.revision,
          actorId: input.actorId,
          sourceReference: input.sourceReference,
          reason: input.reason,
        },
      });
      await audit({ previous, balance, change, transaction });
      return { balance, change, replayed: false };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listEmployeeCreditChanges(
  employeeId: string,
  organizationId: string,
  year: number,
) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId },
    select: { id: true },
  });
  if (!employee) throw new NotFoundException('Employee not found');
  return prisma.leaveCreditChange.findMany({
    where: { balance: { employeeId, employee: { organizationId }, year } },
    include: { balance: { select: { leaveType: true, year: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 100,
  });
}
function validateCreditInput(input: LeaveCreditInput) {
  if (
    !Number.isInteger(input.year) ||
    input.year < 1900 ||
    input.year > 2100 ||
    !Number.isFinite(input.totalCredits) ||
    input.totalCredits < 0 ||
    input.totalCredits > 999.5 ||
    !Number.isInteger(input.totalCredits * 2) ||
    (input.expectedRevision !== null &&
      (!Number.isInteger(input.expectedRevision) ||
        input.expectedRevision < 0 ||
        input.expectedRevision >= 2_147_483_647))
  )
    throw new UnprocessableEntityException(
      'Use a valid year, loaded revision and whole/half-day total from 0 to 999.5',
    );
  if (
    !input.leaveType.trim() ||
    input.leaveType !== input.leaveType.trim() ||
    input.leaveType.length > 50 ||
    input.sourceReference.trim().length < 3 ||
    input.sourceReference.length > 200 ||
    input.reason.trim().length < 10 ||
    input.reason.length > 500
  )
    throw new UnprocessableEntityException(
      'An explicit policy type, source reference and 10–500-character reason are required',
    );
}
