import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma, prisma } from '@workspace/db';
import { calculateEmployeeFinalPay } from './employee-final-pay';
import type { FinalPayPreviewInput } from './final-pay.inputs';

export interface UpdateEmployeeInput {
  id: string;
  organizationId: string;
  branchId?: string;
  departmentId?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  suffix?: string | null;
  email?: string;
  contactNumber?: string;
  residentialAddress?: string;
  gender?: string;
  civilStatus?: string;
  dateOfBirth?: string;
  tin?: string;
  sssNo?: string;
  philhealthNo?: string;
  pagibigNo?: string;
  hireDate?: string;
  regularizationDate?: string | null;
  resignationDate?: string | null;
  employmentType?:
    | 'REGULAR'
    | 'PROBATIONARY'
    | 'CONTRACTUAL'
    | 'PROJECT_BASED'
    | 'PART_TIME';
  employmentStatus?:
    | 'ACTIVE'
    | 'ON_LEAVE'
    | 'SUSPENDED'
    | 'RESIGNED'
    | 'TERMINATED'
    | 'RETIRED';
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  payBasis?: 'MONTHLY' | 'DAILY' | 'HOURLY';
  monthlyBasicRatePesos?: number;
  dailyBasicRatePesos?: number;
  hourlyBasicRatePesos?: number;
  isTaxExempt?: boolean;
  isManagerial?: boolean;
}

export interface RegisterEmployeeInput {
  organizationId: string;
  branchId: string;
  departmentId: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  residentialAddress: string;
  gender: string;
  civilStatus: string;
  dateOfBirth: string;
  tin: string;
  sssNo: string;
  philhealthNo: string;
  pagibigNo: string;
  hireDate: string;
  employmentType:
    | 'REGULAR'
    | 'PROBATIONARY'
    | 'CONTRACTUAL'
    | 'PROJECT_BASED'
    | 'PART_TIME';
  payBasis?: 'MONTHLY' | 'DAILY' | 'HOURLY';
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  monthlyBasicRatePesos?: number;
  dailyBasicRatePesos?: number;
  hourlyBasicRatePesos?: number;
  isTaxExempt?: boolean;
  isManagerial?: boolean;
}

@Injectable()
export class EmployeesService {
  async listEmployees(organizationId: string) {
    return prisma.employee.findMany({
      where: { organizationId },
      include: {
        department: true,
        branch: true,
        compensation: true,
        allowances: true,
      },
      orderBy: { lastName: 'asc' },
    });
  }

  async getEmployeeById(id: string, organizationId: string) {
    return prisma.employee.findFirst({
      where: { id, organizationId },
      include: {
        organization: true,
        branch: true,
        department: true,
        compensation: true,
        allowances: true,
        loans: {
          where: { isActive: true },
        },
        leaveBalances: true,
      },
    });
  }

  async getRegistrationOptions(organizationId: string) {
    const [branches, departments] = await Promise.all([
      prisma.branch.findMany({
        where: { organizationId },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      prisma.department.findMany({
        where: { organizationId },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { branches, departments };
  }

  async registerEmployee(
    input: RegisterEmployeeInput,
    client: Prisma.TransactionClient = prisma,
  ) {
    const organization = await client.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!organization) {
      throw new BadRequestException('Organization not found');
    }

    const branch = await client.branch.findFirst({
      where: { id: input.branchId, organizationId: input.organizationId },
    });
    if (!branch) {
      throw new BadRequestException(
        'A branch belonging to the organization is required',
      );
    }

    const department = await client.department.findFirst({
      where: { id: input.departmentId, organizationId: input.organizationId },
    });
    if (!department) {
      throw new BadRequestException(
        'A department belonging to the organization is required',
      );
    }

    // Count-based numbers race during concurrent creation and can be reused
    // after deletions. Existing references stay unchanged; new ones use UUIDs.
    const employeeNumber = `EMP-${new Date().getUTCFullYear()}-${randomUUID()}`;

    // 3. Compute Centavos based on PayBasis
    const payBasis = input.payBasis ?? 'MONTHLY';
    let monthlyRateCents: bigint;
    let dailyRateCents: bigint;
    let hourlyRateCents: bigint;

    if (payBasis === 'DAILY') {
      const dailyPesos =
        input.dailyBasicRatePesos ?? input.monthlyBasicRatePesos ?? 0;
      dailyRateCents = BigInt(Math.round(dailyPesos * 100));
      monthlyRateCents = (dailyRateCents * 261n) / 12n;
      hourlyRateCents = dailyRateCents / 8n;
    } else if (payBasis === 'HOURLY') {
      const hourlyPesos =
        input.hourlyBasicRatePesos ?? input.monthlyBasicRatePesos ?? 0;
      hourlyRateCents = BigInt(Math.round(hourlyPesos * 100));
      dailyRateCents = hourlyRateCents * 8n;
      monthlyRateCents = (dailyRateCents * 261n) / 12n;
    } else {
      const monthlyPesos = input.monthlyBasicRatePesos ?? 0;
      monthlyRateCents = BigInt(Math.round(monthlyPesos * 100));
      dailyRateCents = (monthlyRateCents * 12n) / 261n;
      hourlyRateCents = dailyRateCents / 8n;
    }

    if (
      monthlyRateCents <= 0n ||
      dailyRateCents <= 0n ||
      hourlyRateCents <= 0n
    ) {
      throw new BadRequestException(
        'A positive basic compensation rate is required',
      );
    }

    return client.employee.create({
      data: {
        organizationId: input.organizationId,
        branchId: branch.id,
        departmentId: department.id,
        employeeNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        contactNumber: input.contactNumber,
        residentialAddress: input.residentialAddress,
        gender: input.gender,
        civilStatus: input.civilStatus,
        dateOfBirth: new Date(input.dateOfBirth),
        tin: input.tin,
        sssNo: input.sssNo,
        philhealthNo: input.philhealthNo,
        pagibigNo: input.pagibigNo,
        hireDate: new Date(input.hireDate),
        employmentType: input.employmentType,
        payBasis,
        bankName: input.bankName,
        bankAccountNumber: input.bankAccountNumber,
        bankAccountName: input.bankAccountName,
        isManagerial: input.isManagerial ?? false,
        compensation: {
          create: {
            basicRateMonthlyCents: monthlyRateCents,
            basicRateDailyCents: dailyRateCents,
            basicRateHourlyCents: hourlyRateCents,
            isTaxExempt: input.isTaxExempt ?? false,
          },
        },
      },
      include: {
        department: true,
        compensation: true,
      },
    });
  }

  calculateFinalPaySettlement(input: FinalPayPreviewInput) {
    return calculateEmployeeFinalPay(input);
  }

  async updateEmployee(
    input: UpdateEmployeeInput,
    client: Prisma.TransactionClient = prisma,
  ) {
    const existing = await client.employee.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      include: {
        compensation: true,
        branch: true,
        department: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Employee not found');
    }

    if (input.branchId && input.branchId !== existing.branchId) {
      const branch = await client.branch.findFirst({
        where: { id: input.branchId, organizationId: input.organizationId },
      });
      if (!branch) {
        throw new BadRequestException(
          'A branch belonging to the organization is required',
        );
      }
    }

    if (input.departmentId && input.departmentId !== existing.departmentId) {
      const department = await client.department.findFirst({
        where: { id: input.departmentId, organizationId: input.organizationId },
      });
      if (!department) {
        throw new BadRequestException(
          'A department belonging to the organization is required',
        );
      }
    }

    if (input.email && input.email !== existing.email) {
      const emailConflict = await client.employee.findFirst({
        where: {
          email: input.email,
          organizationId: input.organizationId,
          id: { not: input.id },
        },
      });
      if (emailConflict) {
        throw new BadRequestException(
          'An employee with this email already exists in this organization',
        );
      }
    }

    const birthDate = input.dateOfBirth
      ? new Date(input.dateOfBirth)
      : existing.dateOfBirth;
    const hireDate = input.hireDate
      ? new Date(input.hireDate)
      : existing.hireDate;

    if (birthDate > new Date()) {
      throw new BadRequestException('Date of birth cannot be in the future');
    }
    if (hireDate < birthDate) {
      throw new BadRequestException('Hire date cannot precede date of birth');
    }

    if (input.regularizationDate !== undefined) {
      if (
        input.regularizationDate &&
        new Date(input.regularizationDate) < hireDate
      ) {
        throw new BadRequestException(
          'Regularization date cannot precede hire date',
        );
      }
    }
    if (input.resignationDate !== undefined) {
      if (input.resignationDate && new Date(input.resignationDate) < hireDate) {
        throw new BadRequestException(
          'Resignation date cannot precede hire date',
        );
      }
    }

    const newPayBasis = input.payBasis ?? existing.payBasis;
    const hasRateUpdate =
      input.monthlyBasicRatePesos !== undefined ||
      input.dailyBasicRatePesos !== undefined ||
      input.hourlyBasicRatePesos !== undefined ||
      (input.payBasis !== undefined && input.payBasis !== existing.payBasis);

    if (hasRateUpdate) {
      let monthlyRateCents: bigint;
      let dailyRateCents: bigint;
      let hourlyRateCents: bigint;

      if (newPayBasis === 'DAILY') {
        const dailyPesos =
          input.dailyBasicRatePesos ??
          input.monthlyBasicRatePesos ??
          (existing.compensation
            ? Number(existing.compensation.basicRateDailyCents) / 100
            : 0);
        dailyRateCents = BigInt(Math.round(dailyPesos * 100));
        monthlyRateCents = (dailyRateCents * 261n) / 12n;
        hourlyRateCents = dailyRateCents / 8n;
      } else if (newPayBasis === 'HOURLY') {
        const hourlyPesos =
          input.hourlyBasicRatePesos ??
          input.monthlyBasicRatePesos ??
          (existing.compensation
            ? Number(existing.compensation.basicRateHourlyCents) / 100
            : 0);
        hourlyRateCents = BigInt(Math.round(hourlyPesos * 100));
        dailyRateCents = hourlyRateCents * 8n;
        monthlyRateCents = (dailyRateCents * 261n) / 12n;
      } else {
        const monthlyPesos =
          input.monthlyBasicRatePesos ??
          (existing.compensation
            ? Number(existing.compensation.basicRateMonthlyCents) / 100
            : 0);
        monthlyRateCents = BigInt(Math.round(monthlyPesos * 100));
        dailyRateCents = (monthlyRateCents * 12n) / 261n;
        hourlyRateCents = dailyRateCents / 8n;
      }

      if (
        monthlyRateCents <= 0n ||
        dailyRateCents <= 0n ||
        hourlyRateCents <= 0n
      ) {
        throw new BadRequestException(
          'A positive basic compensation rate is required',
        );
      }

      const isTaxExempt =
        input.isTaxExempt ?? existing.compensation?.isTaxExempt ?? false;

      await client.compensation.upsert({
        where: { employeeId: input.id },
        create: {
          employeeId: input.id,
          basicRateMonthlyCents: monthlyRateCents,
          basicRateDailyCents: dailyRateCents,
          basicRateHourlyCents: hourlyRateCents,
          isTaxExempt,
        },
        update: {
          basicRateMonthlyCents: monthlyRateCents,
          basicRateDailyCents: dailyRateCents,
          basicRateHourlyCents: hourlyRateCents,
          isTaxExempt,
        },
      });
    } else if (input.isTaxExempt !== undefined && existing.compensation) {
      await client.compensation.update({
        where: { employeeId: input.id },
        data: { isTaxExempt: input.isTaxExempt },
      });
    }

    const current = await client.employee.update({
      where: { id: input.id },
      data: {
        ...(input.branchId !== undefined && { branchId: input.branchId }),
        ...(input.departmentId !== undefined && {
          departmentId: input.departmentId,
        }),
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.middleName !== undefined && { middleName: input.middleName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
        ...(input.suffix !== undefined && { suffix: input.suffix }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.contactNumber !== undefined && {
          contactNumber: input.contactNumber,
        }),
        ...(input.residentialAddress !== undefined && {
          residentialAddress: input.residentialAddress,
        }),
        ...(input.gender !== undefined && { gender: input.gender }),
        ...(input.civilStatus !== undefined && {
          civilStatus: input.civilStatus,
        }),
        ...(input.dateOfBirth !== undefined && {
          dateOfBirth: new Date(input.dateOfBirth),
        }),
        ...(input.tin !== undefined && { tin: input.tin }),
        ...(input.sssNo !== undefined && { sssNo: input.sssNo }),
        ...(input.philhealthNo !== undefined && {
          philhealthNo: input.philhealthNo,
        }),
        ...(input.pagibigNo !== undefined && { pagibigNo: input.pagibigNo }),
        ...(input.hireDate !== undefined && {
          hireDate: new Date(input.hireDate),
        }),
        ...(input.regularizationDate !== undefined && {
          regularizationDate: input.regularizationDate
            ? new Date(input.regularizationDate)
            : null,
        }),
        ...(input.resignationDate !== undefined && {
          resignationDate: input.resignationDate
            ? new Date(input.resignationDate)
            : null,
        }),
        ...(input.employmentType !== undefined && {
          employmentType: input.employmentType,
        }),
        ...(input.employmentStatus !== undefined && {
          employmentStatus: input.employmentStatus,
        }),
        ...(input.payBasis !== undefined && {
          payBasis: input.payBasis,
        }),
        ...(input.isManagerial !== undefined && {
          isManagerial: input.isManagerial,
        }),
        ...(input.bankName !== undefined && { bankName: input.bankName }),
        ...(input.bankAccountNumber !== undefined && {
          bankAccountNumber: input.bankAccountNumber,
        }),
        ...(input.bankAccountName !== undefined && {
          bankAccountName: input.bankAccountName,
        }),
      },
      include: {
        branch: true,
        department: true,
        compensation: true,
      },
    });

    return {
      previous: existing,
      current,
    };
  }
}
