import { BadRequestException, Injectable } from '@nestjs/common';
import { prisma } from '@workspace/db';

export interface RegisterEmployeeInput {
  organizationId: string;
  branchId?: string;
  departmentId?: string;
  firstName: string;
  lastName: string;
  email: string;
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
  employmentType?:
    | 'REGULAR'
    | 'PROBATIONARY'
    | 'CONTRACTUAL'
    | 'PROJECT_BASED'
    | 'PART_TIME';
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
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

  async registerEmployee(input: RegisterEmployeeInput) {
    const organization = await prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!organization) {
      throw new BadRequestException('Organization not found');
    }

    const branch = input.branchId
      ? await prisma.branch.findFirst({
          where: { id: input.branchId, organizationId: input.organizationId },
        })
      : await prisma.branch.findFirst({
          where: { organizationId: input.organizationId },
          orderBy: { createdAt: 'asc' },
        });
    if (!branch) {
      throw new BadRequestException(
        'A branch belonging to the organization is required',
      );
    }

    const department = input.departmentId
      ? await prisma.department.findFirst({
          where: {
            id: input.departmentId,
            organizationId: input.organizationId,
          },
        })
      : await prisma.department.findFirst({
          where: { organizationId: input.organizationId },
          orderBy: { createdAt: 'asc' },
        });
    if (!department) {
      throw new BadRequestException(
        'A department belonging to the organization is required',
      );
    }

    // Generate unique employee number
    const count = await prisma.employee.count();
    const employeeNumber = `EMP-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    // 3. Compute Centavos
    const monthlyRateCents = BigInt(
      Math.round(input.monthlyBasicRatePesos * 100),
    );
    const dailyRateCents = (monthlyRateCents * 12n) / 261n;
    const hourlyRateCents = dailyRateCents / 8n;

    return prisma.employee.create({
      data: {
        organizationId: input.organizationId,
        branchId: branch.id,
        departmentId: department.id,
        employeeNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        contactNumber: input.contactNumber || 'N/A',
        residentialAddress:
          input.residentialAddress || 'Metro Manila, Philippines',
        gender: input.gender || 'Not Specified',
        civilStatus: input.civilStatus || 'Single',
        dateOfBirth: input.dateOfBirth
          ? new Date(input.dateOfBirth)
          : new Date('1995-01-01'),
        tin: input.tin || '000-000-000-000',
        sssNo: input.sssNo || '00-0000000-0',
        philhealthNo: input.philhealthNo || '00-000000000-0',
        pagibigNo: input.pagibigNo || '0000-0000-0000',
        hireDate: input.hireDate ? new Date(input.hireDate) : new Date(),
        employmentType: input.employmentType || 'REGULAR',
        bankName: input.bankName || 'BDO',
        bankAccountNumber: input.bankAccountNumber || '0000000000',
        bankAccountName:
          input.bankAccountName || `${input.firstName} ${input.lastName}`,
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

  async calculateFinalPaySettlement(input: {
    employeeId: string;
    organizationId: string;
    separationType:
      | 'RESIGNATION'
      | 'REDUNDANCY'
      | 'RETRENCHMENT'
      | 'CLOSURE_NON_BANKRUPT'
      | 'DISEASE'
      | 'RETIREMENT';
    yearsOfService?: number;
    unpaidDaysWorked?: number;
    unusedLeaveDays?: number;
    exitDate?: Date;
  }) {
    const { calculateFinalPay, SeparationType } = await import(
      '@workspace/payroll-engine'
    );

    const employee = await prisma.employee.findFirst({
      where: {
        id: input.employeeId,
        organizationId: input.organizationId,
      },
      include: {
        compensation: true,
        loans: { where: { isActive: true } },
        leaveBalances: { where: { year: new Date().getFullYear() } },
      },
    });

    if (!employee?.compensation) {
      throw new Error(
        `Employee ${input.employeeId} or active compensation record not found`,
      );
    }

    const monthlyBasicRateCents = employee.compensation.basicRateMonthlyCents;
    const dailyRateCents = employee.compensation.basicRateDailyCents;

    const exitDate = input.exitDate || new Date();
    const hireDate =
      employee.hireDate || new Date(Date.now() - 365 * 24 * 3600 * 1000);
    const serviceYears =
      input.yearsOfService !== undefined
        ? input.yearsOfService
        : Math.max(
            0.5,
            (exitDate.getTime() - hireDate.getTime()) /
              (365.25 * 24 * 3600 * 1000),
          );

    const outstandingLoanBalanceCents = employee.loans.reduce(
      (acc, loan) => acc + loan.balanceCents,
      0n,
    );

    const silBalanceRecord = employee.leaveBalances.find(
      (balance) => balance.leaveType === 'SIL',
    );
    const unusedLeaveDays =
      input.unusedLeaveDays !== undefined
        ? input.unusedLeaveDays
        : silBalanceRecord
          ? Number(silBalanceRecord.balance)
          : 5.0;

    // RA 7641 exempts retirement benefits only at age 60+, with 5+ years
    // served, availed once. Derive the age from the birth record so the
    // engine can apply the exemption test.
    const retireeAge =
      input.separationType === 'RETIREMENT' && employee.dateOfBirth
        ? Math.floor(
            (exitDate.getTime() - employee.dateOfBirth.getTime()) /
              (365.25 * 24 * 3600 * 1000),
          )
        : undefined;

    const monthIndex = exitDate.getMonth() + 1;
    const totalYtdBasicEarnedCents = monthlyBasicRateCents * BigInt(monthIndex);
    const ytdTaxableCompensationCents = totalYtdBasicEarnedCents;
    const totalYtdTaxWithheldCents = (ytdTaxableCompensationCents * 10n) / 100n;

    const settlement = calculateFinalPay({
      separationType: SeparationType[input.separationType],
      monthlyBasicRateCents,
      dailyRateCents,
      yearsOfService: serviceYears,
      retireeAge,
      unpaidDaysWorkedInLastPeriod: input.unpaidDaysWorked ?? 0,
      totalYtdBasicEarnedCents,
      unusedLeaveDays,
      ytdTaxableCompensationCents,
      totalYtdTaxWithheldCents,
      outstandingLoanBalanceCents,
    });

    return {
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        employeeNumber: employee.employeeNumber,
        tin: employee.tin,
      },
      yearsOfService: serviceYears,
      ...settlement,
    };
  }
}
