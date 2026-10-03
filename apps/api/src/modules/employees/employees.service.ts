import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { type Prisma, prisma } from '@workspace/db';
import { calculateEmployeeFinalPay } from './employee-final-pay';
import type { FinalPayPreviewInput } from './final-pay.inputs';

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
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  monthlyBasicRatePesos: number;
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

    // 3. Compute Centavos
    const monthlyRateCents = BigInt(
      Math.round(input.monthlyBasicRatePesos * 100),
    );
    const dailyRateCents = (monthlyRateCents * 12n) / 261n;
    const hourlyRateCents = dailyRateCents / 8n;

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
        payBasis: 'MONTHLY',
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
}
