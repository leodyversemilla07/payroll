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
  const juan = await prisma.employee.findFirst({
    where: { employeeNumber: "EMP-2026-001" },
  });
  const carlos = await prisma.employee.findFirst({
    where: { employeeNumber: "EMP-2026-003" },
  });
  const pw = await hashPassword("Password12345!");

  const users: Array<{
    email: string;
    name: string;
    role: Role;
    employeeId: string | null;
  }> = [
    {
      email: "hr@sweldoph.local",
      name: "HR Admin",
      role: Role.HR_ADMIN,
      employeeId: null,
    },
    {
      email: "payroll@sweldoph.local",
      name: "Payroll Specialist",
      role: Role.PAYROLL_SPECIALIST,
      employeeId: null,
    },
    {
      email: "manager@sweldoph.local",
      name: "Carlos Reyes (Manager)",
      role: Role.DEPARTMENT_MANAGER,
      employeeId: carlos?.id ?? null,
    },
    {
      email: "employee@sweldoph.local",
      name: "Juan Dela Cruz (Employee)",
      role: Role.EMPLOYEE,
      employeeId: juan?.id ?? null,
    },
  ];

  for (const u of users) {
    const existing = await prisma.user.findUnique({
      where: { email: u.email },
    });
    if (!existing) {
      await prisma.user.create({
        data: {
          organizationId: org.id,
          email: u.email,
          name: u.name,
          role: u.role,
          employeeId: u.employeeId,
          passwordHash: pw,
        },
      });
      console.log(`Created ${u.role}: ${u.email}`);
    } else {
      console.log(`User already exists: ${u.email}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
