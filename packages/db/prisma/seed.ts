import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Philippine Payroll Database Seed...");

  // Bootstrap only: never erase an existing employee/payroll database.
  const database = new URL(process.env.DATABASE_URL || "");
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)
  ) {
    throw new Error(
      "Bootstrap seeding is restricted to local non-production databases.",
    );
  }
  if (await prisma.organization.count()) {
    throw new Error(
      "Refusing to seed a populated database. Use the additive sandbox seed instead.",
    );
  }

  // 2. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: "Santiago Reyes & Torres Law Offices",
      tin: "123-456-789-000",
      sssNumber: "03-9876543-2",
      philhealthNumber: "12-345678901-2",
      pagibigNumber: "1234-5678-9012",
      rdoCode: "047",
      registeredAddress:
        "Level 25, Ayala Tower One, Ayala Triangle, Makati City, Philippines",
    },
  });

  console.log(`✅ Created Organization: ${org.name} (${org.id})`);

  // 3. Create Branches
  const makatiBranch = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: "Makati Head Office",
      code: "MKT",
      address: "Ayala Avenue, Makati City",
    },
  });

  const bgcBranch = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: "Cebu Branch Office",
      code: "CEB",
      address: "Cebu Business Park, Cebu City",
    },
  });

  // 4. Create Departments
  const engDept = await prisma.department.create({
    data: {
      organizationId: org.id,
      name: "Litigation & Dispute Resolution",
      code: "LIT",
    },
  });

  const designDept = await prisma.department.create({
    data: {
      organizationId: org.id,
      name: "Corporate & Commercial Law",
      code: "COR",
    },
  });

  const opsDept = await prisma.department.create({
    data: {
      organizationId: org.id,
      name: "Admin & Finance",
      code: "ADM",
    },
  });

  await prisma.department.create({
    data: {
      organizationId: org.id,
      name: "Labor & Employment Law",
      code: "LAB",
    },
  });

  await prisma.department.create({
    data: {
      organizationId: org.id,
      name: "Taxation Law",
      code: "TAX",
    },
  });

  // 5. Create Employees with Compensations & Allowances
  // NOTE: The demo administrator (admin@sweldoph.local) is a pure system
  // account and intentionally has no employee record. It stays unlinked,
  // matching the production bootstrap, so the staff directory, headcount,
  // and payroll runs cover real employees only.
  const employeesData = [
    {
      employeeNumber: "EMP-2026-001",
      firstName: "Juan",
      lastName: "Dela Cruz",
      email: "juan.delacruz@acme.ph",
      contactNumber: "+639171234567",
      residentialAddress: "Quezon City, Metro Manila",
      gender: "Male",
      civilStatus: "Married",
      dateOfBirth: new Date("1990-05-15"),
      tin: "123-456-789-000",
      sssNo: "34-1234567-8",
      philhealthNo: "12-345678901-2",
      pagibigNo: "1234-5678-9012",
      hireDate: new Date("2022-01-10"),
      employmentType: "REGULAR" as const,
      employmentStatus: "ACTIVE" as const,
      role: "EMPLOYEE" as const,
      payBasis: "MONTHLY" as const,
      branchId: makatiBranch.id,
      departmentId: engDept.id,
      bankName: "BDO Unibank",
      bankAccountNumber: "001234567890",
      bankAccountName: "Juan Dela Cruz",
      basicRateMonthlyCents: 9500000n, // PHP 95,000.00
      isTaxExempt: false,
      loan: {
        loanType: "SSS_SALARY_LOAN" as const,
        principalCents: 1500000n,
        totalAmountCents: 1500000n,
        amortizationCents: 50000n, // PHP 500 / cutoff
        balanceCents: 1500000n,
      },
    },
    {
      employeeNumber: "EMP-2026-002",
      firstName: "Maria",
      lastName: "Santos",
      email: "maria.santos@acme.ph",
      contactNumber: "+639182345678",
      residentialAddress: "Pasig City, Metro Manila",
      gender: "Female",
      civilStatus: "Single",
      dateOfBirth: new Date("1993-08-20"),
      tin: "234-567-890-000",
      sssNo: "03-9876543-2",
      philhealthNo: "23-456789012-3",
      pagibigNo: "2345-6789-0123",
      hireDate: new Date("2023-03-15"),
      employmentType: "REGULAR" as const,
      employmentStatus: "ACTIVE" as const,
      role: "EMPLOYEE" as const,
      payBasis: "MONTHLY" as const,
      branchId: bgcBranch.id,
      departmentId: designDept.id,
      bankName: "BPI",
      bankAccountNumber: "1234567890",
      bankAccountName: "Maria Santos",
      basicRateMonthlyCents: 6500000n, // PHP 65,000.00
      isTaxExempt: false,
    },
    {
      employeeNumber: "EMP-2026-003",
      firstName: "Carlos",
      lastName: "Reyes",
      email: "carlos.reyes@acme.ph",
      contactNumber: "+639193456789",
      residentialAddress: "Mandaluyong City, Metro Manila",
      gender: "Male",
      civilStatus: "Single",
      dateOfBirth: new Date("1995-11-12"),
      tin: "345-678-901-000",
      sssNo: "09-1122334-5",
      philhealthNo: "34-567890123-4",
      pagibigNo: "3456-7890-1234",
      hireDate: new Date("2024-02-01"),
      employmentType: "REGULAR" as const,
      employmentStatus: "ACTIVE" as const,
      role: "EMPLOYEE" as const,
      payBasis: "MONTHLY" as const,
      branchId: makatiBranch.id,
      departmentId: engDept.id,
      bankName: "UnionBank",
      bankAccountNumber: "109876543210",
      bankAccountName: "Carlos Reyes",
      basicRateMonthlyCents: 4800000n, // PHP 48,000.00
      isTaxExempt: false,
      loan: {
        loanType: "PAGIBIG_MULTI_PURPOSE" as const,
        principalCents: 1000000n,
        totalAmountCents: 1000000n,
        amortizationCents: 40000n, // PHP 400 / cutoff
        balanceCents: 850000n,
      },
    },
    {
      employeeNumber: "EMP-2026-004",
      firstName: "Ana",
      lastName: "Gomez",
      email: "ana.gomez@acme.ph",
      contactNumber: "+639204567890",
      residentialAddress: "Taguig City, Metro Manila",
      gender: "Female",
      civilStatus: "Single",
      dateOfBirth: new Date("1998-02-28"),
      tin: "456-789-012-000",
      sssNo: "07-4455667-8",
      philhealthNo: "45-678901234-5",
      pagibigNo: "4567-8901-2345",
      hireDate: new Date("2024-06-15"),
      employmentType: "PROBATIONARY" as const,
      employmentStatus: "ACTIVE" as const,
      role: "EMPLOYEE" as const,
      payBasis: "MONTHLY" as const,
      branchId: bgcBranch.id,
      departmentId: engDept.id,
      bankName: "Metrobank",
      bankAccountNumber: "209876543211",
      bankAccountName: "Ana Gomez",
      basicRateMonthlyCents: 3200000n, // PHP 32,000.00
      isTaxExempt: false,
    },
    {
      employeeNumber: "EMP-2026-005",
      firstName: "Pedro",
      lastName: "Penduko",
      email: "pedro.penduko@acme.ph",
      contactNumber: "+639215678901",
      residentialAddress: "Manila City, Metro Manila",
      gender: "Male",
      civilStatus: "Single",
      dateOfBirth: new Date("2000-09-05"),
      tin: "567-890-123-000",
      sssNo: "08-5566778-9",
      philhealthNo: "56-789012345-6",
      pagibigNo: "5678-9012-3456",
      hireDate: new Date("2025-01-05"),
      employmentType: "REGULAR" as const,
      employmentStatus: "ACTIVE" as const,
      role: "EMPLOYEE" as const,
      payBasis: "MONTHLY" as const,
      branchId: makatiBranch.id,
      departmentId: opsDept.id,
      bankName: "Security Bank",
      bankAccountNumber: "309876543212",
      bankAccountName: "Pedro Penduko",
      // NCR minimum wage under Wage Order No. NCR-27 (PHP 755/day from
      // 2026-07-25): PHP 755 x 313 / 12 = PHP 19,692.92 / mo, rounded.
      basicRateMonthlyCents: 1969300n, // PHP 19,693.00 Minimum Wage Earner
      isTaxExempt: true,
    },
  ];

  for (const emp of employeesData) {
    const { basicRateMonthlyCents, isTaxExempt, loan, ...empFields } = emp;

    const dailyRateCents = (basicRateMonthlyCents * 12n) / 261n;
    const hourlyRateCents = dailyRateCents / 8n;

    const createdEmp = await prisma.employee.create({
      data: {
        ...empFields,
        organizationId: org.id,
        compensation: {
          create: {
            basicRateMonthlyCents,
            basicRateDailyCents: dailyRateCents,
            basicRateHourlyCents: hourlyRateCents,
            isTaxExempt,
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
        ...(loan
          ? {
              loans: {
                create: {
                  loanType: loan.loanType,
                  principalCents: loan.principalCents,
                  totalAmountCents: loan.totalAmountCents,
                  amortizationCents: loan.amortizationCents,
                  balanceCents: loan.balanceCents,
                  startDate: new Date("2026-01-01"),
                  isActive: true,
                },
              },
            }
          : {}),
      },
    });

    // 6. Create Daily Time Records for pay cutoff Aug 16 - 31, 2026 (10 working days)
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

    for (const [i, dateStr] of workDates.entries()) {
      const date = new Date(dateStr);
      const isOvertimeDay = i === 3 || i === 7;
      const isTardyDay =
        i === 1 && createdEmp.employeeNumber === "EMP-2026-001";

      await prisma.dailyTimeRecord.create({
        data: {
          employeeId: createdEmp.id,
          date,
          dayType: "REGULAR_WORKDAY",
          timeIn: new Date(`${dateStr}T09:${isTardyDay ? "15" : "00"}:00Z`),
          timeOut: new Date(
            `${dateStr}T${isOvertimeDay ? "20:00" : "18:00"}:00Z`,
          ),
          actualWorkedMinutes: 480,
          tardinessMinutes: isTardyDay ? 15 : 0,
          overtimeMinutes: isOvertimeDay ? 120 : 0, // 2 hours OT on OT days
          nightDiffMinutes: isOvertimeDay ? 60 : 0,
          isApproved: true,
        },
      });
    }

    // 7. Create Leave Balances for current year (15 Vacation, 15 Sick)
    await prisma.leaveBalance.createMany({
      data: [
        {
          employeeId: createdEmp.id,
          leaveType: "VACATION",
          year: 2026,
          totalCredits: 15,
          usedCredits: 0,
          balance: 15,
        },
        {
          employeeId: createdEmp.id,
          leaveType: "SICK",
          year: 2026,
          totalCredits: 15,
          usedCredits: 0,
          balance: 15,
        },
      ],
    });

    console.log(
      `✅ Seeded Employee: ${createdEmp.firstName} ${createdEmp.lastName} (${createdEmp.employeeNumber})`,
    );
  }

  console.log("🎉 Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
