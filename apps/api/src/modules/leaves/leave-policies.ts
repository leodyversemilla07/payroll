import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type AccrualFrequency,
  type CarryoverPolicy,
  type LeaveBalance,
  type LeavePolicy,
  Prisma,
  prisma,
} from '@workspace/db';

export interface CreateLeavePolicyInput {
  organizationId: string;
  leaveType: string;
  annualCredits: number;
  accrualFrequency: AccrualFrequency;
  carryoverPolicy: CarryoverPolicy;
  maxCarryoverDays?: number | null;
  eligibleAfterMonths?: number;
  isActive?: boolean;
  actorId?: string;
}

export interface UpdateLeavePolicyInput {
  annualCredits?: number;
  accrualFrequency?: AccrualFrequency;
  carryoverPolicy?: CarryoverPolicy;
  maxCarryoverDays?: number | null;
  eligibleAfterMonths?: number;
  isActive?: boolean;
}

export interface RunAccrualInput {
  organizationId: string;
  year: number;
  frequency: AccrualFrequency;
  period?: number; // 1..12 for MONTHLY, 1..4 for QUARTERLY, 1 for ANNUAL
  leaveType?: string;
  dryRun?: boolean;
  actorId: string;
}

export interface AccrualItemResult {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  leaveType: string;
  tenureMonths: number;
  creditsToAccrue: number;
  previousBalance: number;
  newBalance: number;
  status: 'ACCRUED' | 'ALREADY_ACCRUED' | 'INELIGIBLE';
  message: string;
}

export interface RunAccrualResult {
  year: number;
  frequency: AccrualFrequency;
  period: number;
  dryRun: boolean;
  totalEmployees: number;
  eligibleCount: number;
  processedCount: number;
  totalCreditsAccrued: number;
  items: AccrualItemResult[];
}

export interface RunCarryoverInput {
  organizationId: string;
  fromYear: number;
  toYear: number;
  leaveType?: string;
  dryRun?: boolean;
  actorId: string;
}

export interface CarryoverItemResult {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  leaveType: string;
  unusedFromPriorYear: number;
  carriedOver: number;
  previousBalance: number;
  newBalance: number;
  status: 'CARRIED_OVER' | 'ALREADY_PROCESSED' | 'ZERO_BALANCE';
  message: string;
}

export interface RunCarryoverResult {
  fromYear: number;
  toYear: number;
  dryRun: boolean;
  totalEvaluated: number;
  processedCount: number;
  totalCreditsCarriedOver: number;
  items: CarryoverItemResult[];
}

export function serializePolicy(policy: LeavePolicy) {
  return {
    ...policy,
    annualCredits: policy.annualCredits.toString(),
    maxCarryoverDays: policy.maxCarryoverDays?.toString() ?? null,
  };
}

export function calculateTenureMonths(hireDate: Date, asOfDate: Date): number {
  const hire = new Date(hireDate);
  let months =
    (asOfDate.getUTCFullYear() - hire.getUTCFullYear()) * 12 +
    (asOfDate.getUTCMonth() - hire.getUTCMonth());
  if (asOfDate.getUTCDate() < hire.getUTCDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

export async function listLeavePolicies(
  organizationId: string,
  includeInactive = false,
) {
  return prisma.leavePolicy.findMany({
    where: {
      organizationId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { leaveType: 'asc' },
  });
}

export async function getLeavePolicyById(id: string, organizationId: string) {
  const policy = await prisma.leavePolicy.findFirst({
    where: { id, organizationId },
  });
  if (!policy) {
    throw new NotFoundException('Leave policy not found');
  }
  return policy;
}

export async function createLeavePolicy(
  input: CreateLeavePolicyInput,
  actorId?: string,
) {
  const normalizedType = (input.leaveType ?? '').trim().toUpperCase();
  validatePolicyFields(
    normalizedType,
    input.annualCredits,
    input.carryoverPolicy,
    input.maxCarryoverDays,
    input.eligibleAfterMonths,
  );

  const existing = await prisma.leavePolicy.findFirst({
    where: {
      organizationId: input.organizationId,
      leaveType: { equals: normalizedType, mode: 'insensitive' },
    },
  });
  if (existing) {
    throw new ConflictException(
      `Leave policy for type "${normalizedType}" already exists in this organization`,
    );
  }

  return prisma.leavePolicy.create({
    data: {
      organizationId: input.organizationId,
      leaveType: normalizedType,
      annualCredits: new Prisma.Decimal(input.annualCredits),
      accrualFrequency: input.accrualFrequency,
      carryoverPolicy: input.carryoverPolicy,
      maxCarryoverDays:
        input.carryoverPolicy === 'CAPPED' && input.maxCarryoverDays != null
          ? new Prisma.Decimal(input.maxCarryoverDays)
          : null,
      eligibleAfterMonths: input.eligibleAfterMonths ?? 6,
      isActive: input.isActive ?? true,
      createdById: actorId ?? input.actorId ?? null,
    },
  });
}

export async function updateLeavePolicy(
  id: string,
  organizationId: string,
  input: UpdateLeavePolicyInput,
) {
  const current = await getLeavePolicyById(id, organizationId);

  const carryoverPolicy = input.carryoverPolicy ?? current.carryoverPolicy;
  const annualCredits = input.annualCredits ?? current.annualCredits.toNumber();
  const maxCarryoverDays =
    input.maxCarryoverDays !== undefined
      ? input.maxCarryoverDays
      : (current.maxCarryoverDays?.toNumber() ?? null);
  const eligibleAfterMonths =
    input.eligibleAfterMonths ?? current.eligibleAfterMonths;

  validatePolicyFields(
    current.leaveType,
    annualCredits,
    carryoverPolicy,
    maxCarryoverDays,
    eligibleAfterMonths,
  );

  return prisma.leavePolicy.update({
    where: { id: current.id },
    data: {
      ...(input.annualCredits !== undefined
        ? { annualCredits: new Prisma.Decimal(input.annualCredits) }
        : {}),
      ...(input.accrualFrequency !== undefined
        ? { accrualFrequency: input.accrualFrequency }
        : {}),
      ...(input.carryoverPolicy !== undefined
        ? { carryoverPolicy: input.carryoverPolicy }
        : {}),
      maxCarryoverDays:
        carryoverPolicy === 'CAPPED' && maxCarryoverDays != null
          ? new Prisma.Decimal(maxCarryoverDays)
          : null,
      ...(input.eligibleAfterMonths !== undefined
        ? { eligibleAfterMonths: input.eligibleAfterMonths }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function deleteLeavePolicy(id: string, organizationId: string) {
  const policy = await getLeavePolicyById(id, organizationId);
  return prisma.leavePolicy.delete({
    where: { id: policy.id },
  });
}

export async function runLeaveAccrual(
  input: RunAccrualInput,
): Promise<RunAccrualResult> {
  const { organizationId, year, frequency, actorId } = input;
  const period = input.period ?? 1;
  const dryRun = input.dryRun ?? false;

  validateAccrualPeriod(frequency, period);

  // 1. Determine asOfDate for tenure calculation
  let asOfDate: Date;
  if (frequency === 'MONTHLY') {
    asOfDate = new Date(Date.UTC(year, period, 0, 23, 59, 59, 999));
  } else if (frequency === 'QUARTERLY') {
    asOfDate = new Date(Date.UTC(year, period * 3, 0, 23, 59, 59, 999));
  } else {
    asOfDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  }

  // 2. Fetch policies
  const policies = await prisma.leavePolicy.findMany({
    where: {
      organizationId,
      isActive: true,
      accrualFrequency: frequency,
      ...(input.leaveType
        ? { leaveType: input.leaveType.trim().toUpperCase() }
        : {}),
    },
  });

  if (policies.length === 0) {
    throw new NotFoundException(
      `No active leave policies found with accrual frequency "${frequency}"${
        input.leaveType ? ` and type "${input.leaveType}"` : ''
      }`,
    );
  }

  // 3. Fetch active employees
  const employees = await prisma.employee.findMany({
    where: {
      organizationId,
      employmentStatus: 'ACTIVE',
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      hireDate: true,
    },
    orderBy: { employeeNumber: 'asc' },
  });

  const items: AccrualItemResult[] = [];
  let eligibleCount = 0;
  let processedCount = 0;
  let totalCreditsAccrued = 0;

  for (const policy of policies) {
    // Determine credit increment
    let increment = 0;
    if (frequency === 'MONTHLY') {
      increment = Number((policy.annualCredits.toNumber() / 12).toFixed(2));
    } else if (frequency === 'QUARTERLY') {
      increment = Number((policy.annualCredits.toNumber() / 4).toFixed(2));
    } else {
      increment = policy.annualCredits.toNumber();
    }

    const periodTag =
      frequency === 'MONTHLY'
        ? `M${String(period).padStart(2, '0')}`
        : frequency === 'QUARTERLY'
          ? `Q${period}`
          : 'ANNUAL';
    const sourceReference = `ACCRUAL-${year}-${periodTag}-${policy.leaveType}`;

    for (const emp of employees) {
      const employeeName = `${emp.firstName} ${emp.lastName}`;
      const tenure = calculateTenureMonths(emp.hireDate, asOfDate);

      if (tenure < policy.eligibleAfterMonths) {
        items.push({
          employeeId: emp.id,
          employeeNumber: emp.employeeNumber,
          employeeName,
          leaveType: policy.leaveType,
          tenureMonths: tenure,
          creditsToAccrue: 0,
          previousBalance: 0,
          newBalance: 0,
          status: 'INELIGIBLE',
          message: `Tenure (${tenure} mos) below policy requirement (${policy.eligibleAfterMonths} mos)`,
        });
        continue;
      }

      eligibleCount += 1;

      // Check current balance and whether already accrued
      const currentBalance = await prisma.leaveBalance.findFirst({
        where: {
          employeeId: emp.id,
          leaveType: policy.leaveType,
          year,
        },
      });

      const alreadyAccrued = currentBalance
        ? await prisma.leaveCreditChange.findFirst({
            where: {
              balanceId: currentBalance.id,
              sourceReference,
            },
          })
        : null;

      const prevBalNum = currentBalance?.balance.toNumber() ?? 0;

      if (alreadyAccrued) {
        items.push({
          employeeId: emp.id,
          employeeNumber: emp.employeeNumber,
          employeeName,
          leaveType: policy.leaveType,
          tenureMonths: tenure,
          creditsToAccrue: 0,
          previousBalance: prevBalNum,
          newBalance: prevBalNum,
          status: 'ALREADY_ACCRUED',
          message: `Accrual already recorded for ${sourceReference}`,
        });
        continue;
      }

      const newBalNum = Number((prevBalNum + increment).toFixed(2));

      if (!dryRun) {
        await prisma.$transaction(
          async (tx) => {
            let balance: LeaveBalance;
            let previousTotal: Prisma.Decimal | null = null;
            let previousBal: Prisma.Decimal | null = null;
            let prevRev: number | null = null;

            if (currentBalance) {
              previousTotal = currentBalance.totalCredits;
              previousBal = currentBalance.balance;
              prevRev = currentBalance.revision;

              balance = await tx.leaveBalance.update({
                where: { id: currentBalance.id },
                data: {
                  totalCredits: previousTotal.plus(increment),
                  balance: previousBal.plus(increment),
                  revision: { increment: 1 },
                },
              });
            } else {
              balance = await tx.leaveBalance.create({
                data: {
                  employeeId: emp.id,
                  leaveType: policy.leaveType,
                  year,
                  totalCredits: new Prisma.Decimal(increment),
                  usedCredits: new Prisma.Decimal(0),
                  balance: new Prisma.Decimal(increment),
                  revision: 1,
                },
              });
            }

            await tx.leaveCreditChange.create({
              data: {
                balanceId: balance.id,
                kind: 'ACCRUAL',
                previousTotalCredits: previousTotal,
                totalCredits: balance.totalCredits,
                usedCredits: balance.usedCredits,
                previousBalance: previousBal,
                availableBalance: balance.balance,
                previousRevision: prevRev,
                revision: balance.revision,
                actorId,
                sourceReference,
                reason: `${policy.accrualFrequency} leave accrual for ${policy.leaveType} (${year} ${periodTag})`,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      }

      processedCount += 1;
      totalCreditsAccrued = Number(
        (totalCreditsAccrued + increment).toFixed(2),
      );

      items.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        employeeName,
        leaveType: policy.leaveType,
        tenureMonths: tenure,
        creditsToAccrue: increment,
        previousBalance: prevBalNum,
        newBalance: newBalNum,
        status: 'ACCRUED',
        message: dryRun
          ? `Preview: would accrue ${increment} credits`
          : `Successfully accrued ${increment} credits`,
      });
    }
  }

  return {
    year,
    frequency,
    period,
    dryRun,
    totalEmployees: employees.length,
    eligibleCount,
    processedCount,
    totalCreditsAccrued,
    items,
  };
}

export async function runLeaveCarryover(
  input: RunCarryoverInput,
): Promise<RunCarryoverResult> {
  const { organizationId, fromYear, toYear, actorId } = input;
  const dryRun = input.dryRun ?? false;

  if (toYear !== fromYear + 1) {
    throw new BadRequestException(
      `Carryover target year (${toYear}) must be immediately following from-year (${fromYear})`,
    );
  }

  const policies = await prisma.leavePolicy.findMany({
    where: {
      organizationId,
      isActive: true,
      carryoverPolicy: { in: ['CAPPED', 'UNLIMITED'] },
      ...(input.leaveType
        ? { leaveType: input.leaveType.trim().toUpperCase() }
        : {}),
    },
  });

  if (policies.length === 0) {
    throw new NotFoundException(
      `No active leave policies with carryover enabled found${
        input.leaveType ? ` for type "${input.leaveType}"` : ''
      }`,
    );
  }

  const items: CarryoverItemResult[] = [];
  let totalEvaluated = 0;
  let processedCount = 0;
  let totalCreditsCarriedOver = 0;

  for (const policy of policies) {
    const priorBalances = await prisma.leaveBalance.findMany({
      where: {
        employee: { organizationId, employmentStatus: 'ACTIVE' },
        leaveType: policy.leaveType,
        year: fromYear,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { employee: { employeeNumber: 'asc' } },
    });

    totalEvaluated += priorBalances.length;
    const sourceReference = `CARRYOVER-${fromYear}-TO-${toYear}-${policy.leaveType}`;

    for (const prior of priorBalances) {
      const emp = prior.employee;
      const employeeName = `${emp.firstName} ${emp.lastName}`;
      const unused = prior.balance.toNumber();

      if (unused <= 0) {
        items.push({
          employeeId: emp.id,
          employeeNumber: emp.employeeNumber,
          employeeName,
          leaveType: policy.leaveType,
          unusedFromPriorYear: unused,
          carriedOver: 0,
          previousBalance: 0,
          newBalance: 0,
          status: 'ZERO_BALANCE',
          message: 'No remaining unused balance to carry over',
        });
        continue;
      }

      // Calculate carryover amount
      let carried = unused;
      if (
        policy.carryoverPolicy === 'CAPPED' &&
        policy.maxCarryoverDays != null
      ) {
        carried = Math.min(unused, policy.maxCarryoverDays.toNumber());
      }
      carried = Number(carried.toFixed(2));

      // Check target year balance and if carryover already executed
      const targetBalance = await prisma.leaveBalance.findFirst({
        where: {
          employeeId: emp.id,
          leaveType: policy.leaveType,
          year: toYear,
        },
      });

      const alreadyProcessed = targetBalance
        ? await prisma.leaveCreditChange.findFirst({
            where: {
              balanceId: targetBalance.id,
              sourceReference,
            },
          })
        : null;

      const targetPrevBalNum = targetBalance?.balance.toNumber() ?? 0;

      if (alreadyProcessed) {
        items.push({
          employeeId: emp.id,
          employeeNumber: emp.employeeNumber,
          employeeName,
          leaveType: policy.leaveType,
          unusedFromPriorYear: unused,
          carriedOver: 0,
          previousBalance: targetPrevBalNum,
          newBalance: targetPrevBalNum,
          status: 'ALREADY_PROCESSED',
          message: `Carryover already processed for ${sourceReference}`,
        });
        continue;
      }

      const targetNewBalNum = Number((targetPrevBalNum + carried).toFixed(2));

      if (!dryRun) {
        await prisma.$transaction(
          async (tx) => {
            let balance: LeaveBalance;
            let previousTotal: Prisma.Decimal | null = null;
            let previousBal: Prisma.Decimal | null = null;
            let prevRev: number | null = null;

            if (targetBalance) {
              previousTotal = targetBalance.totalCredits;
              previousBal = targetBalance.balance;
              prevRev = targetBalance.revision;

              balance = await tx.leaveBalance.update({
                where: { id: targetBalance.id },
                data: {
                  totalCredits: previousTotal.plus(carried),
                  balance: previousBal.plus(carried),
                  revision: { increment: 1 },
                },
              });
            } else {
              balance = await tx.leaveBalance.create({
                data: {
                  employeeId: emp.id,
                  leaveType: policy.leaveType,
                  year: toYear,
                  totalCredits: new Prisma.Decimal(carried),
                  usedCredits: new Prisma.Decimal(0),
                  balance: new Prisma.Decimal(carried),
                  revision: 1,
                },
              });
            }

            await tx.leaveCreditChange.create({
              data: {
                balanceId: balance.id,
                kind: 'CARRYOVER',
                previousTotalCredits: previousTotal,
                totalCredits: balance.totalCredits,
                usedCredits: balance.usedCredits,
                previousBalance: previousBal,
                availableBalance: balance.balance,
                previousRevision: prevRev,
                revision: balance.revision,
                actorId,
                sourceReference,
                reason: `Carried over ${carried} day(s) unused from ${fromYear} (policy: ${policy.carryoverPolicy})`,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      }

      processedCount += 1;
      totalCreditsCarriedOver = Number(
        (totalCreditsCarriedOver + carried).toFixed(2),
      );

      items.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        employeeName,
        leaveType: policy.leaveType,
        unusedFromPriorYear: unused,
        carriedOver: carried,
        previousBalance: targetPrevBalNum,
        newBalance: targetNewBalNum,
        status: 'CARRIED_OVER',
        message: dryRun
          ? `Preview: would carry over ${carried} day(s)`
          : `Successfully carried over ${carried} day(s)`,
      });
    }
  }

  return {
    fromYear,
    toYear,
    dryRun,
    totalEvaluated,
    processedCount,
    totalCreditsCarriedOver,
    items,
  };
}

function validatePolicyFields(
  leaveType: string,
  annualCredits: number,
  carryoverPolicy: CarryoverPolicy,
  maxCarryoverDays?: number | null,
  eligibleAfterMonths?: number,
) {
  if (!leaveType || !/^[A-Z][A-Z0-9_]{0,49}$/.test(leaveType.trim())) {
    throw new UnprocessableEntityException(
      'Leave type must be an uppercase code up to 50 characters (e.g. VACATION, SICK, SIL)',
    );
  }
  if (
    !Number.isFinite(annualCredits) ||
    annualCredits < 0 ||
    annualCredits > 365 ||
    !Number.isInteger(annualCredits * 2)
  ) {
    throw new UnprocessableEntityException(
      'Annual credits must be between 0 and 365 in whole or half-day increments',
    );
  }
  if (eligibleAfterMonths !== undefined) {
    if (
      !Number.isInteger(eligibleAfterMonths) ||
      eligibleAfterMonths < 0 ||
      eligibleAfterMonths > 120
    ) {
      throw new UnprocessableEntityException(
        'Eligible after months must be an integer between 0 and 120',
      );
    }
  }
  if (carryoverPolicy === 'CAPPED') {
    if (
      maxCarryoverDays == null ||
      !Number.isFinite(maxCarryoverDays) ||
      maxCarryoverDays <= 0 ||
      maxCarryoverDays > 365 ||
      !Number.isInteger(maxCarryoverDays * 2)
    ) {
      throw new UnprocessableEntityException(
        'Capped carryover requires a positive maximum carryover days in whole or half-day increments',
      );
    }
  }
}

function validateAccrualPeriod(frequency: AccrualFrequency, period: number) {
  if (frequency === 'MONTHLY') {
    if (!Number.isInteger(period) || period < 1 || period > 12) {
      throw new BadRequestException(
        'Monthly accrual period must be a month between 1 and 12',
      );
    }
  } else if (frequency === 'QUARTERLY') {
    if (!Number.isInteger(period) || period < 1 || period > 4) {
      throw new BadRequestException(
        'Quarterly accrual period must be a quarter between 1 and 4',
      );
    }
  } else if (frequency === 'ANNUAL') {
    if (!Number.isInteger(period) || period !== 1) {
      throw new BadRequestException('Annual accrual period must be 1');
    }
  }
}
