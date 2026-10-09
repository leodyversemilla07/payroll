import { randomBytes, scrypt } from "node:crypto";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt);
  return [
    "scrypt",
    "v=1",
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELIZATION),
    salt,
    key.toString("base64url"),
  ].join("$");
}

async function main() {
  const org = await prisma.organization.findFirstOrThrow();
  const makatiBranch = await prisma.branch.findFirstOrThrow({
    where: { organizationId: org.id },
  });
  const opsDept = await prisma.department.findFirstOrThrow({
    where: { organizationId: org.id },
  });

  // Ensure Admin Employee Profile (EMP-2026-000) exists
  let adminEmp = await prisma.employee.findFirst({
    where: { employeeNumber: "EMP-2026-000" },
  });

  if (!adminEmp) {
    const basicRateMonthlyCents = 12000000n; // PHP 120,000.00
    const dailyRateCents = (basicRateMonthlyCents * 12n) / 261n;
    const hourlyRateCents = dailyRateCents / 8n;

    adminEmp = await prisma.employee.create({
      data: {
        organizationId: org.id,
        branchId: makatiBranch.id,
        departmentId: opsDept.id,
        employeeNumber: "EMP-2026-000",
        firstName: "Local Demo",
        lastName: "Administrator",
        email: "admin@sweldoph.local",
        contactNumber: "+639170000000",
        residentialAddress: "Makati City, Metro Manila",
        gender: "Male",
        civilStatus: "Single",
        dateOfBirth: new Date("1988-01-01"),
        tin: "111-222-333-000",
        sssNo: "01-1122334-5",
        philhealthNo: "11-123456789-0",
        pagibigNo: "1111-2222-3333",
        hireDate: new Date("2021-01-01"),
        employmentType: "REGULAR",
        employmentStatus: "ACTIVE",
        role: "SUPER_ADMIN",
        payBasis: "MONTHLY",
        bankName: "BDO Unibank",
        bankAccountNumber: "000011223344",
        bankAccountName: "Local Demo Administrator",
        compensation: {
          create: {
            basicRateMonthlyCents,
            basicRateDailyCents: dailyRateCents,
            basicRateHourlyCents: hourlyRateCents,
            isTaxExempt: false,
          },
        },
        allowances: {
          create: [
            {
              name: "Rice Subsidy",
              type: "DE_MINIMIS",
              deMinimisCategory: "RICE_SUBSIDY",
              amountCents: 200000n, // PHP 2,000/mo
              frequency: "MONTHLY",
            },
          ],
        },
      },
    });

    const workDates = [
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
    ];

    for (const dateStr of workDates) {
      await prisma.dailyTimeRecord.create({
        data: {
          employeeId: adminEmp.id,
          date: new Date(dateStr),
          dayType: "REGULAR_WORKDAY",
          timeIn: new Date(`${dateStr}T09:00:00Z`),
          timeOut: new Date(`${dateStr}T18:00:00Z`),
          actualWorkedMinutes: 480,
          tardinessMinutes: 0,
          overtimeMinutes: 0,
          nightDiffMinutes: 0,
          isApproved: true,
        },
      });
    }

    console.log(
      `✅ Created Admin Employee Profile: ${adminEmp.employeeNumber}`,
    );
  }

  // Ensure all employees have 2026 leave balances
  const allEmployees = await prisma.employee.findMany();
  for (const emp of allEmployees) {
    const existingBalance = await prisma.leaveBalance.findFirst({
      where: { employeeId: emp.id, year: 2026 },
    });
    if (!existingBalance) {
      await prisma.leaveBalance.createMany({
        data: [
          {
            employeeId: emp.id,
            leaveType: "VACATION",
            year: 2026,
            totalCredits: 15,
            usedCredits: 0,
            balance: 15,
          },
          {
            employeeId: emp.id,
            leaveType: "SICK",
            year: 2026,
            totalCredits: 15,
            usedCredits: 0,
            balance: 15,
          },
        ],
      });
      console.log(`✅ Seeded 2026 Leave Balances for ${emp.employeeNumber}`);
    }
  }

  const juan = await prisma.employee.findFirst({
    where: { employeeNumber: "EMP-2026-001" },
  });
  const maria = await prisma.employee.findFirst({
    where: { employeeNumber: "EMP-2026-002" },
  });
  const carlos = await prisma.employee.findFirst({
    where: { employeeNumber: "EMP-2026-003" },
  });
  const ana = await prisma.employee.findFirst({
    where: { employeeNumber: "EMP-2026-004" },
  });

  const users: Array<{
    email: string;
    name: string;
    role: Role;
    employeeId: string | null;
    password: string;
  }> = [
    {
      email: "admin@sweldoph.local",
      name: "Local Demo Administrator",
      role: Role.SUPER_ADMIN,
      employeeId: adminEmp.id,
      password: "AdminPassword123!",
    },
    {
      email: "hr@sweldoph.local",
      name: "HR Admin (Maria Santos)",
      role: Role.HR_ADMIN,
      employeeId: maria?.id ?? null,
      password: "AdminPassword123!",
    },
    {
      email: "payroll@sweldoph.local",
      name: "Payroll Specialist (Ana Gomez)",
      role: Role.PAYROLL_SPECIALIST,
      employeeId: ana?.id ?? null,
      password: "AdminPassword123!",
    },
    {
      email: "manager@sweldoph.local",
      name: "Carlos Reyes (Manager)",
      role: Role.DEPARTMENT_MANAGER,
      employeeId: carlos?.id ?? null,
      password: "AdminPassword123!",
    },
    {
      email: "employee@sweldoph.local",
      name: "Juan Dela Cruz (Employee)",
      role: Role.EMPLOYEE,
      employeeId: juan?.id ?? null,
      password: "AdminPassword123!",
    },
  ];

  for (const u of users) {
    const existing = await prisma.user.findUnique({
      where: { email: u.email },
    });
    const passwordHash = await hashPassword(u.password);
    if (!existing) {
      await prisma.user.create({
        data: {
          organizationId: org.id,
          email: u.email,
          name: u.name,
          role: u.role,
          employeeId: u.employeeId,
          passwordHash,
        },
      });
      console.log(`Created ${u.role}: ${u.email}`);
    } else {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          employeeId: u.employeeId ?? undefined,
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          isActive: true,
        },
      });
      console.log(
        `Updated ${u.role} (${u.email}) with password, employeeId: ${u.employeeId}, and reset lock/failed attempts`,
      );
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
