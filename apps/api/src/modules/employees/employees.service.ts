import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Prisma, prisma } from '@workspace/db';

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
    const exitDate = input.exitDate || new Date();
    if (Number.isNaN(exitDate.getTime())) {
      throw new BadRequestException('Exit date must be valid');
    }
    const taxYear = exitDate.getUTCFullYear();
    const yearStart = new Date(Date.UTC(taxYear, 0, 1));
    const nextDay = new Date(
      Date.UTC(
        exitDate.getUTCFullYear(),
        exitDate.getUTCMonth(),
        exitDate.getUTCDate() + 1,
      ),
    );

    const employee = await prisma.employee.findFirst({
      where: {
        id: input.employeeId,
        organizationId: input.organizationId,
      },
      include: {
        compensation: true,
        loans: { where: { isActive: true } },
        leaveBalances: { where: { year: taxYear } },
      },
    });

    if (!employee?.compensation) {
      throw new NotFoundException('Employee or compensation record not found');
    }

    // Annual tax follows payment date; 13th-month entitlement follows the
    // service year of regular earnings. Never infer either from today's rate.
    const payslips = await prisma.payslip.findMany({
      where: {
        employeeId: employee.id,
        payrollRun: {
          organizationId: input.organizationId,
          status: 'DISBURSED',
          paymentDate: { gte: yearStart, lt: nextDay },
        },
      },
      include: {
        payrollRun: { select: { cutoffSequence: true, cutoffEndDate: true } },
      },
    });
    const regularPayslips = payslips.filter(
      (slip) =>
        slip.payrollRun.cutoffSequence !== 'SPECIAL_RUN' &&
        slip.payrollRun.cutoffEndDate >= yearStart &&
        slip.payrollRun.cutoffEndDate <= exitDate,
    );
    if (regularPayslips.length === 0) {
      throw new UnprocessableEntityException(
        'Final pay requires disbursed regular payslips in the exit year; reconcile payroll before calculating',
      );
    }
    const totalYtdBasicEarnedCents = regularPayslips.reduce((sum, slip) => {
      const deductions =
        slip.tardinessDeductionCents +
        slip.undertimeDeductionCents +
        slip.absenceDeductionCents;
      return (
        sum +
        (slip.basicPayCents > deductions ? slip.basicPayCents - deductions : 0n)
      );
    }, 0n);
    const ytdTaxableCompensationCents = payslips.reduce((sum, slip) => {
      const taxable =
        slip.grossPayCents -
        slip.nonTaxableAllowancesCents -
        slip.sssEmployeeCents -
        slip.philhealthEmployeeCents -
        slip.pagibigEmployeeCents;
      return sum + (taxable > 0n ? taxable : 0n);
    }, 0n);
    const totalYtdTaxWithheldCents = payslips.reduce(
      (sum, slip) => sum + slip.withholdingTaxCents,
      0n,
    );
    const thirteenthMonthAlreadyPaidCents = payslips.reduce(
      (sum, slip) =>
        sum +
        (slip.payrollRun.cutoffSequence === 'SPECIAL_RUN' &&
        slip.payrollRun.cutoffEndDate >= yearStart &&
        slip.payrollRun.cutoffEndDate <= exitDate
          ? slip.bonusPaidCents
          : 0n),
      0n,
    );
    const ytdOtherBenefitsCents = payslips.reduce(
      (sum, slip) => sum + slip.bonusPaidCents + slip.deMinimisExcessCents,
      0n,
    );

    const monthlyBasicRateCents = employee.compensation.basicRateMonthlyCents;
    const dailyRateCents = employee.compensation.basicRateDailyCents;

    const hireDate = employee.hireDate;
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
      thirteenthMonthAlreadyPaidCents,
      ytdOtherBenefitsCents,
      isMinimumWageEarner: employee.compensation.isTaxExempt,
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
