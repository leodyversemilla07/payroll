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

  // The local demo administrator is a pure system account and intentionally
  // has no employee record. It stays unlinked (matching the production
  // bootstrap) so the staff directory, headcount, and payroll runs cover
  // real employees only.

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
      // Bootstrap system account, not a person: it owns global configuration
      // and user provisioning, so it must stay unlinked from employee records.
      // Human operators (HR, payroll, manager) below are linked employees;
      // separation of duties is enforced in workflow (maker-checker on
      // payroll approval), not by unlinking operator accounts.
      email: "admin@sweldoph.local",
      name: "System Administrator",
      role: Role.SUPER_ADMIN,
      employeeId: null,
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
          name: u.name,
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

  // The demo administrator is a pure system account: keep it unlinked even on
  // re-runs against databases seeded before this change.
  await prisma.user.update({
    where: { email: "admin@sweldoph.local" },
    data: { employeeId: null },
  });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
