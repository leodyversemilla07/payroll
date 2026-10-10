/**
 * Bulk demo data for the local development organization.
 *
 * Adds ~60 clearly-marked DEV- employees with compensation, allowances,
 * 2026 leave balances, two months of weekday DTR, pending/historical
 * leaves, and active loans. Additive and idempotent: re-runs are a
 * no-op once DEV- records exist. Never modifies existing rows and never
 * creates payroll runs (trigger those through the UI).
 *
 * Guards: local payroll_db only. Refuses browser/test/remote databases.
 *
 * Usage (PowerShell):
 *   $env:DATABASE_URL='postgresql://postgres:password@127.0.0.1:5432/payroll_db?schema=public'
 *   pnpm --filter @workspace/db exec node prisma/seed-dev-data.mjs
 */
import { PrismaClient } from "@prisma/client";

const PREFIX = "DEV-";

// Deterministic PRNG so re-runs and reviews are reproducible.
function mulberry32(seed) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Jose",
  "Maria",
  "Ana",
  "Juan",
  "Rosa",
  "Pedro",
  "Liza",
  "Marco",
  "Nadia",
  "Paolo",
  "Cora",
  "Dante",
  "Elsa",
  "Felix",
  "Gina",
  "Hugo",
  "Irene",
  "Jomar",
  "Katrina",
  "Lorenzo",
];
const LAST = [
  "Reyes",
  "Santos",
  "Dela Cruz",
  "Garcia",
  "Mendoza",
  "Torres",
  "Flores",
  "Ramos",
  "Aquino",
  "Navarro",
  "Salazar",
  "Mercado",
  "Aguilar",
  "Castillo",
  "Villanueva",
];

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function pad(n, width) {
  return String(n).padStart(width, "0");
}

function utcDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(date, n) {
  return new Date(date.getTime() + n * 86_400_000);
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/** Manila wall-clock HH:MM on a civil date -> UTC Date. */
function manilaToUtc(isoDate, hhmm) {
  const [hh, mm] = hhmm.split(":").map(Number);
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 8, mm));
}

const prisma = new PrismaClient();

async function main() {
  const database = new URL(process.env.DATABASE_URL || "");
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
    database.pathname !== "/payroll_db"
  ) {
    throw new Error(
      "Refusing to run: this script targets local payroll_db only.",
    );
  }

  const org = await prisma.organization.findFirstOrThrow();
  const branches = await prisma.branch.findMany({
    where: { organizationId: org.id },
  });
  const departments = await prisma.department.findMany({
    where: { organizationId: org.id },
  });
  if (branches.length === 0 || departments.length === 0) {
    throw new Error(
      "Organization needs branches and departments first (run db:seed on an empty database).",
    );
  }

  const existing = await prisma.employee.count({
    where: { organizationId: org.id, employeeNumber: { startsWith: PREFIX } },
  });
  if (existing > 0) {
    console.log(`DEV- records already present (${existing}). Nothing to do.`);
    return;
  }

  const holidays = new Set(
    (
      await prisma.holidayCalendar.findMany({
        where: { organizationId: org.id },
        select: { date: true },
      })
    ).map((h) => isoDay(h.date)),
  );

  const rand = mulberry32(20261010);
  const COUNT = 60;
  const employees = [];
  const compensations = [];
  const allowances = [];
  const balances = [];

  for (let i = 0; i < COUNT; i++) {
    const n = pad(i + 1, 4);
    const firstName = pick(rand, FIRST);
    const lastName = `${pick(rand, LAST)} ${n}`;
    const monthlyPesos = 25000 + Math.floor(rand() * 54) * 1000 + (i % 2) * 500;
    const basis =
      i % 12 === 11 ? "DAILY" : i % 12 === 10 ? "HOURLY" : "MONTHLY";
    const hireYear = 2023 + Math.floor(rand() * 3);
    const hireMonth = 1 + Math.floor(rand() * 12);
    const hireDay = 1 + Math.floor(rand() * 28);
    employees.push({
      organizationId: org.id,
      branchId: branches[i % branches.length].id,
      departmentId: departments[i % departments.length].id,
      employeeNumber: `${PREFIX}${n}`,
      firstName,
      lastName,
      dateOfBirth: utcDay(`${1975 + Math.floor(rand() * 25)}-06-15`),
      gender: rand() < 0.5 ? "Female" : "Male",
      civilStatus: rand() < 0.6 ? "Single" : "Married",
      email: `dev.emp${n}@example.com`,
      contactNumber: `0917${pad(100000 + Math.floor(rand() * 899999), 6)}`,
      residentialAddress: `${100 + i} Demo Street, Makati City`,
      tin: `900-${n}-000`,
      sssNo: `90-${n}-0`,
      philhealthNo: `90-${n}-0`,
      pagibigNo: `9000-000${n.slice(0, 2)}-${n.slice(2)}`,
      hireDate: utcDay(`${hireYear}-${pad(hireMonth, 2)}-${pad(hireDay, 2)}`),
      employmentType: "REGULAR",
      employmentStatus: i % 20 === 19 ? "ON_LEAVE" : "ACTIVE",
      payBasis: basis,
      bankName: ["BDO Unibank", "BPI", "UnionBank", "Metrobank"][i % 4],
      bankAccountNumber: `100000${n}01`,
      bankAccountName: `${firstName} ${lastName}`,
    });
    const monthlyCents = BigInt(monthlyPesos) * 100n;
    compensations.push({
      employeeNumber: `${PREFIX}${n}`,
      basicRateMonthlyCents: monthlyCents,
      basicRateDailyCents: monthlyCents / 22n,
      basicRateHourlyCents: monthlyCents / 22n / 8n,
    });
    if (rand() < 0.45) {
      allowances.push({
        employeeNumber: `${PREFIX}${n}`,
        name: "Rice subsidy",
        type: "DE_MINIMIS",
        deMinimisCategory: "RICE_SUBSIDY",
        amountCents: 250000n,
        frequency: "MONTHLY",
      });
    } else if (rand() < 0.25) {
      allowances.push({
        employeeNumber: `${PREFIX}${n}`,
        name: "Transport allowance",
        type: "TAXABLE",
        amountCents: 150000n,
        frequency: "PER_CUTOFF",
      });
    }
    for (const [leaveType, total] of [
      ["VACATION", 15],
      ["SICK", 15],
      ["SIL", 5],
    ]) {
      balances.push({
        employeeNumber: `${PREFIX}${n}`,
        leaveType,
        total,
        used: 0,
      });
    }
  }

  // Employees first (ids needed downstream).
  for (let offset = 0; offset < employees.length; offset += 50) {
    await prisma.employee.createMany({
      data: employees.slice(offset, offset + 50),
    });
  }
  const created = await prisma.employee.findMany({
    where: { organizationId: org.id, employeeNumber: { startsWith: PREFIX } },
    select: { id: true, employeeNumber: true },
  });
  const idByNumber = Object.fromEntries(
    created.map((e) => [e.employeeNumber, e.id]),
  );

  await prisma.compensation.createMany({
    data: compensations.map((c) => ({
      employeeId: idByNumber[c.employeeNumber],
      basicRateMonthlyCents: c.basicRateMonthlyCents,
      basicRateDailyCents: c.basicRateDailyCents,
      basicRateHourlyCents: c.basicRateHourlyCents,
      effectiveDate: utcDay("2026-01-01"),
    })),
  });
  if (allowances.length > 0) {
    await prisma.employeeAllowance.createMany({
      data: allowances.map((a) => ({
        ...a,
        employeeId: idByNumber[a.employeeNumber],
        employeeNumber: undefined,
      })),
    });
  }
  await prisma.leaveBalance.createMany({
    data: balances.map((b) => ({
      employeeId: idByNumber[b.employeeNumber],
      leaveType: b.leaveType,
      totalCredits: b.total,
      usedCredits: b.used,
      balance: b.total - b.used,
      year: 2026,
    })),
  });

  // Weekday DTR for Aug 1 – Oct 9 2026 (skips holidays).
  const dtrRows = [];
  for (
    let d = utcDay("2026-08-01");
    d <= utcDay("2026-10-09");
    d = addDays(d, 1)
  ) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const iso = isoDay(d);
    if (holidays.has(iso)) continue;
    for (let i = 0; i < COUNT; i++) {
      const number = `${PREFIX}${pad(i + 1, 4)}`;
      const roll = rand();
      if (roll < 0.03) {
        dtrRows.push({
          employeeId: idByNumber[number],
          date: d,
          dayType: "REGULAR_WORKDAY",
          isAbsent: true,
          isApproved: true,
          remarks: "No show — marked absent",
        });
        continue;
      }
      const inMin = 8 * 60 + Math.floor(rand() * 75); // 08:00–09:15 Manila
      const outMin = 17 * 60 + Math.floor(rand() * 90); // 17:00–18:30 Manila
      const worked = outMin - inMin - 60; // 1h lunch
      const missingOut = roll > 0.97;
      dtrRows.push({
        employeeId: idByNumber[number],
        date: d,
        dayType: "REGULAR_WORKDAY",
        timeIn: manilaToUtc(
          iso,
          `${pad(Math.floor(inMin / 60), 2)}:${pad(inMin % 60, 2)}`,
        ),
        timeOut: missingOut
          ? null
          : manilaToUtc(
              iso,
              `${pad(Math.floor(outMin / 60), 2)}:${pad(outMin % 60, 2)}`,
            ),
        actualWorkedMinutes: missingOut ? 0 : worked,
        tardinessMinutes: Math.max(0, inMin - 8 * 60),
        undertimeMinutes: 0,
        overtimeMinutes: Math.max(0, outMin - 18 * 60) > 30 ? 60 : 0,
        isApproved: roll < 0.92,
        remarks: missingOut ? "Missing time-out — for review" : null,
      });
    }
  }
  for (let offset = 0; offset < dtrRows.length; offset += 500) {
    await prisma.dailyTimeRecord.createMany({
      data: dtrRows.slice(offset, offset + 500),
    });
  }

  // Pending leaves (Oct/Nov weekdays) + approved September history with
  // matching balance usage.
  const leaveRows = [];
  const pendingDays = [
    "2026-10-14",
    "2026-10-15",
    "2026-10-20",
    "2026-10-21",
    "2026-11-18",
    "2026-11-19",
  ];
  for (let k = 0; k < 12; k++) {
    const number = `${PREFIX}${pad(k + 1, 4)}`;
    const day = pendingDays[k % pendingDays.length];
    leaveRows.push({
      employeeId: idByNumber[number],
      leaveType: k % 3 === 2 ? "SICK" : "VACATION",
      startDate: utcDay(day),
      endDate: utcDay(day),
      daysCount: 1,
      isPaid: true,
      reason: "Demo pending leave for approval walkthrough",
      status: "PENDING",
    });
  }
  const usedByEmp = {};
  for (let k = 12; k < 32; k++) {
    const number = `${PREFIX}${pad(k + 1, 4)}`;
    const day = `2026-09-${pad(1 + ((k * 7) % 28), 2)}`;
    const dow = utcDay(day).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    leaveRows.push({
      employeeId: idByNumber[number],
      leaveType: "VACATION",
      startDate: utcDay(day),
      endDate: utcDay(day),
      daysCount: 1,
      isPaid: true,
      reason: "Approved September vacation",
      status: "APPROVED",
    });
    usedByEmp[number] = (usedByEmp[number] ?? 0) + 1;
  }
  await prisma.leaveRequest.createMany({ data: leaveRows });
  for (const [number, used] of Object.entries(usedByEmp)) {
    await prisma.leaveBalance.updateMany({
      where: {
        employeeId: idByNumber[number],
        leaveType: "VACATION",
        year: 2026,
      },
      data: { usedCredits: used, balance: 15 - used },
    });
  }

  // Active loans with remaining balances.
  const loanKinds = [
    "SSS_SALARY_LOAN",
    "PAGIBIG_MULTI_PURPOSE",
    "COMPANY_CASH_ADVANCE",
  ];
  const loanRows = [];
  for (let k = 0; k < 12; k++) {
    const number = `${PREFIX}${pad(k + 5, 4)}`;
    const principal = BigInt(15000 + (k % 5) * 10000) * 100n;
    const amort = BigInt(1200 + (k % 4) * 500) * 100n;
    const paid = amort * BigInt(2 + (k % 4));
    loanRows.push({
      employeeId: idByNumber[number],
      loanType: loanKinds[k % loanKinds.length],
      referenceNumber: `${PREFIX}LOAN-${pad(k + 1, 3)}`,
      principalCents: principal,
      totalAmountCents: principal,
      amortizationCents: amort,
      balanceCents: principal - paid,
      startDate: utcDay(`2026-0${1 + (k % 6)}-01`),
      isActive: true,
    });
  }
  await prisma.employeeLoan.createMany({ data: loanRows });

  console.log(
    JSON.stringify(
      {
        employees: COUNT,
        dtr: dtrRows.length,
        leaves: leaveRows.length,
        loans: loanRows.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
