/**
 * Browser-stage setup for the synthetic payroll sandbox.
 *
 * Creates the explicitly marked sandbox organization and the five role
 * login accounts used by the end-to-end screen tour, then links the
 * human-operator accounts to seeded fixture employees.
 *
 * Idempotent: safe to run before fixture seeding (links apply on the
 * next run) and after. Never touches any other tenant.
 *
 * Usage (PowerShell):
 *   $env:DATABASE_URL='postgresql://postgres:password@127.0.0.1:5432/payroll_browser?schema=public'
 *   pnpm --filter @workspace/db exec node prisma/setup-browser-stage.mjs
 */
import { randomBytes, scrypt } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const ORG_ID = "1efaa8f7-3e76-4ff1-98f6-533b88786dbf";
const ORG_NAME = "Payroll Browser Sandbox — Synthetic Records Only";
const PASSWORD = "SandboxDemo123!";
const EMPLOYEE_PREFIX = "SANDBOX-LARGE-";

const prisma = new PrismaClient();

function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt);
  return [
    "scrypt",
    "v=1",
    "16384",
    "8",
    "1",
    salt,
    key.toString("base64url"),
  ].join("$");
}

async function main() {
  const database = new URL(process.env.DATABASE_URL || "");
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
    !["/payroll_browser", "/payroll_test"].includes(database.pathname)
  ) {
    throw new Error(
      "Refusing to run: DATABASE_URL must target a local payroll_browser/payroll_test database.",
    );
  }

  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: ORG_NAME },
    create: {
      id: ORG_ID,
      name: ORG_NAME,
      tin: "000-000-000-000",
      rdoCode: "000",
      registeredAddress: "Synthetic stage — no real address",
    },
  });
  console.log(`Staged organization ${ORG_ID}`);

  const passwordHash = await hashPassword(PASSWORD);
  const accounts = [
    // Bootstrap system account: intentionally never linked.
    {
      email: "admin@sandbox.test",
      name: "Sandbox System Administrator",
      role: "SUPER_ADMIN",
      fixtureNumber: null,
    },
    // Maker in the payroll maker-checker pair.
    {
      email: "payroll@sandbox.test",
      name: "Sandbox Payroll Specialist",
      role: "PAYROLL_SPECIALIST",
      fixtureNumber: "0003",
    },
    // Checker: approves runs and leave requests.
    {
      email: "hr@sandbox.test",
      name: "Sandbox HR Admin",
      role: "HR_ADMIN",
      fixtureNumber: "0002",
    },
    // Manages department 0 (fixture indices 0, 8, 16, ...).
    {
      email: "manager@sandbox.test",
      name: "Sandbox Department Manager",
      role: "DEPARTMENT_MANAGER",
      fixtureNumber: "0001",
    },
    // Rank-and-file employee in department 0; files leaves, draws payslips.
    {
      email: "employee@sandbox.test",
      name: "Sandbox Employee",
      role: "EMPLOYEE",
      fixtureNumber: "0009",
    },
  ];

  const fixturesReady =
    (await prisma.employee.count({
      where: {
        organizationId: ORG_ID,
        employeeNumber: { startsWith: EMPLOYEE_PREFIX },
      },
    })) > 0;

  for (const account of accounts) {
    let employeeId = null;
    if (account.fixtureNumber && fixturesReady) {
      const fixture = await prisma.employee.findFirst({
        where: {
          organizationId: ORG_ID,
          employeeNumber: `${EMPLOYEE_PREFIX}${account.fixtureNumber}`,
        },
        select: { id: true },
      });
      employeeId = fixture?.id ?? null;
    }
    const existing = await prisma.user.findUnique({
      where: { email: account.email },
    });
    if (!existing) {
      await prisma.user.create({
        data: {
          organizationId: ORG_ID,
          email: account.email,
          name: account.name,
          role: account.role,
          employeeId,
          passwordHash,
        },
      });
      console.log(
        `Created ${account.role} ${account.email} (linked: ${employeeId ?? "none"})`,
      );
    } else {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          organizationId: ORG_ID,
          name: account.name,
          role: account.role,
          // Never steal an existing link; only fill a missing one. The
          // system administrator is always forced back to unlinked.
          ...(account.email === "admin@sandbox.test"
            ? { employeeId: null }
            : employeeId
              ? { employeeId }
              : {}),
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          isActive: true,
        },
      });
      console.log(`Updated ${account.role} ${account.email}`);
    }
  }

  if (!fixturesReady) {
    console.log(
      "Fixture employees not seeded yet: re-run after seed:sandbox to link operator accounts.",
    );
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
