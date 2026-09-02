import { Injectable } from "@nestjs/common";
import { prisma } from "@workspace/db";
import type { Prisma } from "@workspace/db";

export interface RegisterEmployeeInput {
  organizationId?: string;
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
  employmentType?: "REGULAR" | "PROBATIONARY" | "CONTRACTUAL" | "PROJECT_BASED" | "PART_TIME";
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  monthlyBasicRatePesos: number;
  isTaxExempt?: boolean;
}

@Injectable()
export class EmployeesService {
  async listEmployees(organizationId?: string) {
    return prisma.employee.findMany({
      where: organizationId ? { organizationId } : undefined,
      include: {
        department: true,
        branch: true,
        compensation: true,
        allowances: true,
      },
      orderBy: { lastName: "asc" },
    });
  }

  async getEmployeeById(id: string) {
    return prisma.employee.findUnique({
      where: { id },
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
    // 1. Resolve default Organization, Branch, and Department if not provided
    let orgId = input.organizationId;
    if (!orgId) {
      const defaultOrg = await prisma.organization.findFirst();
      if (!defaultOrg) {
        const newOrg = await prisma.organization.create({
          data: {
            name: "Default Philippines Enterprise",
            tin: "000-000-000-000",
            rdoCode: "047",
            registeredAddress: "Metro Manila, Philippines",
          },
        });
        orgId = newOrg.id;
      } else {
        orgId = defaultOrg.id;
      }
    }

    let branchId = input.branchId;
    if (!branchId) {
      const defaultBranch = await prisma.branch.findFirst({ where: { organizationId: orgId } });
      if (!defaultBranch) {
        const newBranch = await prisma.branch.create({
          data: {
            organizationId: orgId,
            name: "Headquarters",
            code: "HQ",
            address: "Makati City",
          },
        });
        branchId = newBranch.id;
      } else {
        branchId = defaultBranch.id;
      }
    }

    let deptId = input.departmentId;
    if (!deptId) {
      const defaultDept = await prisma.department.findFirst({ where: { organizationId: orgId } });
      if (!defaultDept) {
        const newDept = await prisma.department.create({
          data: {
            organizationId: orgId,
            name: "General Operations",
            code: "GEN",
          },
        });
        deptId = newDept.id;
      } else {
        deptId = defaultDept.id;
      }
    }

    // 2. Generate unique employee number
    const count = await prisma.employee.count();
    const employeeNumber = `EMP-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;

    // 3. Compute Centavos
    const monthlyRateCents = BigInt(Math.round(input.monthlyBasicRatePesos * 100));
    const dailyRateCents = (monthlyRateCents * 12n) / 261n;
    const hourlyRateCents = dailyRateCents / 8n;

    return prisma.employee.create({
      data: {
        organizationId: orgId,
        branchId,
        departmentId: deptId,
        employeeNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        contactNumber: input.contactNumber || "N/A",
        residentialAddress: input.residentialAddress || "Metro Manila, Philippines",
        gender: input.gender || "Not Specified",
        civilStatus: input.civilStatus || "Single",
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : new Date("1995-01-01"),
        tin: input.tin || "000-000-000-000",
        sssNo: input.sssNo || "00-0000000-0",
        philhealthNo: input.philhealthNo || "00-000000000-0",
        pagibigNo: input.pagibigNo || "0000-0000-0000",
        hireDate: input.hireDate ? new Date(input.hireDate) : new Date(),
        employmentType: input.employmentType || "REGULAR",
        bankName: input.bankName || "BDO",
        bankAccountNumber: input.bankAccountNumber || "0000000000",
        bankAccountName: input.bankAccountName || `${input.firstName} ${input.lastName}`,
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

  async createEmployee(data: Prisma.EmployeeCreateInput) {
    return prisma.employee.create({
      data,
      include: {
        department: true,
        compensation: true,
      },
    });
  }

  async updateCompensation(employeeId: string, data: {
    monthlyBasicRateCents: bigint;
    dailyRateCents: bigint;
    hourlyRateCents: bigint;
    isTaxExempt?: boolean;
    customPagibigDeductionCents?: bigint;
  }) {
    return prisma.compensation.upsert({
      where: { employeeId },
      update: {
        basicRateMonthlyCents: data.monthlyBasicRateCents,
        basicRateDailyCents: data.dailyRateCents,
        basicRateHourlyCents: data.hourlyRateCents,
        isTaxExempt: data.isTaxExempt,
        customPagibigDeductionCents: data.customPagibigDeductionCents,
      },
      create: {
        employeeId,
        basicRateMonthlyCents: data.monthlyBasicRateCents,
        basicRateDailyCents: data.dailyRateCents,
        basicRateHourlyCents: data.hourlyRateCents,
        isTaxExempt: data.isTaxExempt ?? false,
        customPagibigDeductionCents: data.customPagibigDeductionCents,
      },
    });
  }
}
