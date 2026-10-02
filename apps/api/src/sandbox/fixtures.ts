import { createHash } from 'node:crypto';
import { Prisma } from '@workspace/db';
import {
  type AttendanceSummary,
  CutoffType,
  calculatePhilippinePayroll,
  deriveRates,
  PayBasis,
  WorkDayDivisor,
} from '@workspace/payroll-engine';

export const SANDBOX_SEED_VERSION = 'large-sandbox-2026-v1';
export const SANDBOX_EMPLOYEE_PREFIX = 'SANDBOX-LARGE-';

export function fixtureId(organizationId: string, key: string): string {
  const hash = createHash('sha256')
    .update(`${SANDBOX_SEED_VERSION}:${organizationId}:${key}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function sandboxSeedOptions(env: NodeJS.ProcessEnv) {
  if (
    !['test', 'development'].includes(env.NODE_ENV ?? '') ||
    env.PAYROLL_SANDBOX_SEED !== '1'
  ) {
    throw new Error(
      'Sandbox seeding requires NODE_ENV=test/development and PAYROLL_SANDBOX_SEED=1.',
    );
  }
  const database = new URL(env.DATABASE_URL || '');
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
    !['/payroll_browser', '/payroll_test'].includes(database.pathname) ||
    (database.searchParams.get('schema') ?? 'public') !== 'public'
  ) {
    throw new Error(
      'Sandbox seeding only accepts local payroll_browser/payroll_test databases with the public schema.',
    );
  }
  const organizationId = env.PAYROLL_SANDBOX_ORGANIZATION_ID ?? '';
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      organizationId,
    )
  ) {
    throw new Error(
      'An explicit PAYROLL_SANDBOX_ORGANIZATION_ID UUID is required.',
    );
  }
  const rawCount = env.PAYROLL_SANDBOX_EMPLOYEES ?? '200';
  if (
    !/^\d+$/.test(rawCount) ||
    Number(rawCount) < 20 ||
    Number(rawCount) > 500
  ) {
    throw new Error(
      'PAYROLL_SANDBOX_EMPLOYEES must be an integer between 20 and 500.',
    );
  }
  return { organizationId, employeeCount: Number(rawCount) };
}

interface SeedActors {
  organizationId: string;
  employeeCount: number;
  adminId: string;
  adminEmail: string;
  makerId: string;
}

export interface SandboxDataset {
  branches: Prisma.BranchCreateManyInput[];
  departments: Prisma.DepartmentCreateManyInput[];
  employees: Prisma.EmployeeCreateManyInput[];
  compensations: Prisma.CompensationCreateManyInput[];
  allowances: Prisma.EmployeeAllowanceCreateManyInput[];
  attendance: Prisma.DailyTimeRecordCreateManyInput[];
  balances: Prisma.LeaveBalanceCreateManyInput[];
  creditChanges: Prisma.LeaveCreditChangeCreateManyInput[];
  leaves: Prisma.LeaveRequestCreateManyInput[];
  overtime: Prisma.OvertimeRequestCreateManyInput[];
  loans: Prisma.EmployeeLoanCreateManyInput[];
  payments: Prisma.LoanPaymentCreateManyInput[];
  runs: Prisma.PayrollRunCreateManyInput[];
  payslips: Prisma.PayslipCreateManyInput[];
  declarations: Prisma.PriorEmployerDeclarationCreateManyInput[];
  remittances: Prisma.MonthlyTaxRemittanceEvidenceCreateManyInput[];
  audits: Prisma.AuditLogCreateManyInput[];
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
function weekdayInMonth(month: number, offset: number) {
  const result = new Date(Date.UTC(2026, month - 1, 5));
  let remaining = offset % 10;
  while (
    result.getUTCDay() === 0 ||
    result.getUTCDay() === 6 ||
    remaining > 0
  ) {
    if (result.getUTCDay() !== 0 && result.getUTCDay() !== 6) remaining--;
    result.setUTCDate(result.getUTCDate() + 1);
  }
  return result;
}

function emptyAttendance(): AttendanceSummary {
  return {
    regularHoursWorked: 0,
    tardinessMinutes: 0,
    undertimeMinutes: 0,
    absentDays: 0,
    paidLeaveDays: 0,
    regularOvertimeHours: 0,
    restDayHours: 0,
    restDayOvertimeHours: 0,
    specialHolidayHours: 0,
    specialHolidayOvertimeHours: 0,
    specialHolidayRestDayHours: 0,
    specialHolidayRestDayOvertimeHours: 0,
    regularHolidayHours: 0,
    regularHolidayOvertimeHours: 0,
    regularHolidayRestDayHours: 0,
    regularHolidayRestDayOvertimeHours: 0,
    regularNightDiffHours: 0,
    overtimeNightDiffHours: 0,
    restDayNightDiffHours: 0,
    holidayNightDiffHours: 0,
  };
}

// Deliberately synthetic weekday schedules, not a Philippine holiday calendar or
// verified legal entitlements. No certificates, settlement attestations, bank
// batches, PDFs, real payments, new login accounts or password changes are made.
export function buildSandboxDataset(actors: SeedActors): SandboxDataset {
  const id = (key: string) => fixtureId(actors.organizationId, key);
  const data: SandboxDataset = {
    branches: [],
    departments: [],
    employees: [],
    compensations: [],
    allowances: [],
    attendance: [],
    balances: [],
    creditChanges: [],
    leaves: [],
    overtime: [],
    loans: [],
    payments: [],
    runs: [],
    payslips: [],
    declarations: [],
    remittances: [],
    audits: [],
  };
  const branchNames = ['Makati', 'Taguig', 'Quezon City', 'Cebu', 'Davao'];
  const departmentNames = [
    'Engineering',
    'Operations',
    'Finance',
    'Human Resources',
    'Customer Support',
    'Sales',
    'Design',
    'Logistics',
  ];
  for (const [index, name] of branchNames.entries())
    data.branches.push({
      id: id(`branch:${index}`),
      organizationId: actors.organizationId,
      name: `Synthetic ${name} office`,
      code: `SYN-${index + 1}`,
      address: 'Fictional sandbox address — not an actual workplace',
    });
  for (const [index, name] of departmentNames.entries())
    data.departments.push({
      id: id(`department:${index}`),
      organizationId: actors.organizationId,
      name: `Synthetic ${name}`,
      code: `SYN-D${index + 1}`,
    });
  const firstNames = [
    'Ana',
    'Miguel',
    'Sofia',
    'Paolo',
    'Isabel',
    'Diego',
    'Camille',
    'Gabriel',
    'Andrea',
    'Luis',
  ];
  const lastNames = [
    'Santos',
    'Reyes',
    'Cruz',
    'Garcia',
    'Mendoza',
    'Ramos',
    'Torres',
    'Flores',
    'Lim',
    'Tan',
  ];
  const monthlyTax = Array<bigint>(9).fill(0n);
  const runs = Array.from(
    { length: 18 },
    (_, index): Prisma.PayrollRunCreateManyInput => {
      const month = Math.floor(index / 2);
      const first = index % 2 === 0;
      const end = new Date(Date.UTC(2026, month + 1, 0));
      return {
        id: id(`run:${index}`),
        organizationId: actors.organizationId,
        cutoffSequence: first ? 'FIRST_CUTOFF' : 'SECOND_CUTOFF',
        cutoffStartDate: new Date(Date.UTC(2026, month, first ? 1 : 16)),
        cutoffEndDate: first ? new Date(Date.UTC(2026, month, 15)) : end,
        paymentDate: first
          ? new Date(Date.UTC(2026, month, 16))
          : new Date(Date.UTC(2026, month + 1, 1)),
        status:
          index < 16 ? 'DISBURSED' : index === 16 ? 'APPROVED' : 'AUDITED',
        processedById: actors.makerId,
        approvedById: index < 17 ? actors.adminId : null,
        totalGrossCents: 0n,
        totalDeductionsCents: 0n,
        totalNetCents: 0n,
        totalEmployerCostCents: 0n,
        createdAt: first
          ? new Date(Date.UTC(2026, month, 15, 12))
          : new Date(Date.UTC(2026, month + 1, 0, 12)),
      };
    },
  );
  data.runs = runs;

  for (let index = 0; index < actors.employeeCount; index++) {
    const number = String(index + 1).padStart(4, '0');
    const employeeId = id(`employee:${index}`);
    const firstName = `Synthetic ${firstNames[index % firstNames.length]}`;
    const lastName = `${lastNames[Math.floor(index / firstNames.length) % lastNames.length]} ${number}`;
    const monthly = BigInt(28000 + (index % 25) * 2500) * 100n;
    const basis =
      index % 10 === 8
        ? PayBasis.DAILY
        : index % 10 === 9
          ? PayBasis.HOURLY
          : PayBasis.MONTHLY;
    const compensation = {
      payBasis: basis,
      monthlyBasicRateCents: monthly,
      divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
      isMinimumWageEarner: false,
    };
    const rates = deriveRates(compensation);
    data.employees.push({
      id: employeeId,
      organizationId: actors.organizationId,
      branchId: id(`branch:${index % 5}`),
      departmentId: id(`department:${index % 8}`),
      employeeNumber: `${SANDBOX_EMPLOYEE_PREFIX}${number}`,
      firstName,
      lastName,
      email: `synthetic-${number}@sandbox.test`,
      contactNumber: `0900000${number}`,
      residentialAddress: 'Synthetic address — no real personal information',
      dateOfBirth: day(`${1985 + (index % 15)}-06-15`),
      gender: index % 2 ? 'Female' : 'Male',
      civilStatus: index % 3 ? 'Single' : 'Married',
      tin: `000-${number}-000`,
      sssNo: `00-${number}-0`,
      philhealthNo: `00-${number}-0`,
      pagibigNo: `0000-${number}-0000`,
      hireDate: day('2024-01-01'),
      regularizationDate: day('2024-07-01'),
      employmentType: index % 5 === 0 ? 'CONTRACTUAL' : 'REGULAR',
      employmentStatus: 'ACTIVE',
      payBasis: basis,
      bankName: 'Synthetic bank — no transfers',
      bankAccountNumber: `000000${number}`,
      bankAccountName: `${firstName} ${lastName}`,
    });
    data.compensations.push({
      id: id(`compensation:${index}`),
      employeeId,
      basicRateMonthlyCents: monthly,
      basicRateDailyCents: rates.dailyRateCents,
      basicRateHourlyCents: rates.hourlyRateCents,
      effectiveDate: day('2026-01-01'),
      isTaxExempt: false,
    });
    data.allowances.push(
      {
        id: id(`allowance:${index}:rice`),
        employeeId,
        name: 'Synthetic rice allowance',
        type: 'DE_MINIMIS',
        deMinimisCategory: 'RICE_SUBSIDY',
        amountCents: 50000n,
        frequency: 'PER_CUTOFF',
      },
      {
        id: id(`allowance:${index}:internet`),
        employeeId,
        name: 'Synthetic internet allowance',
        type: 'TAXABLE',
        amountCents: 20000n,
        frequency: 'PER_CUTOFF',
      },
    );
    for (const [leaveType, total, used] of [
      ['SIL', 5, 0],
      ['VACATION', 12, 1],
      ['SICK', 7, 0.5],
    ] as const) {
      const balanceId = id(`balance:${index}:${leaveType}`);
      data.balances.push({
        id: balanceId,
        employeeId,
        leaveType,
        year: 2026,
        totalCredits: total,
        usedCredits: used,
        balance: total - used,
        revision: 1,
      });
      data.creditChanges.push({
        id: id(`credit:${index}:${leaveType}`),
        balanceId,
        kind: 'ALLOCATION',
        totalCredits: total,
        usedCredits: 0,
        availableBalance: total,
        revision: 1,
        actorId: actors.adminId,
        sourceReference: `SYNTHETIC-POLICY-${leaveType}-2026`,
        reason:
          'Synthetic fixture allocation only — not a verified legal entitlement',
        createdAt: day('2026-01-01'),
      });
    }
    const vacation = weekdayInMonth(1, index);
    const sick = weekdayInMonth(6, index);
    const cancellation = weekdayInMonth(9, index);
    const requests: Prisma.LeaveRequestCreateManyInput[] = [
      {
        id: id(`leave:${index}:vacation`),
        employeeId,
        leaveType: 'VACATION',
        startDate: vacation,
        endDate: vacation,
        daysCount: 1,
        isPaid: true,
        status: 'APPROVED',
        approvedById: actors.adminId,
        debitedBalanceId: id(`balance:${index}:VACATION`),
        debitedDays: 1,
        reason: 'Synthetic approved vacation fixture',
        createdAt: vacation,
      },
      {
        id: id(`leave:${index}:sick`),
        employeeId,
        leaveType: 'SICK',
        startDate: sick,
        endDate: sick,
        partialDate: sick,
        daysCount: 0.5,
        isPaid: true,
        status: 'APPROVED',
        approvedById: actors.adminId,
        debitedBalanceId: id(`balance:${index}:SICK`),
        debitedDays: 0.5,
        reason: 'Synthetic approved half-day sick leave fixture',
        createdAt: sick,
      },
      {
        id: id(`leave:${index}:rejected`),
        employeeId,
        leaveType: 'SICK',
        startDate: weekdayInMonth(8, index),
        endDate: weekdayInMonth(8, index),
        daysCount: 1,
        isPaid: true,
        status: 'REJECTED',
        rejectedById: actors.adminId,
        rejectionReason:
          'Synthetic rejection scenario — no real employee decision',
        reason: 'Synthetic rejected leave fixture',
        createdAt: weekdayInMonth(8, index),
      },
      {
        id: id(`leave:${index}:cancelled`),
        employeeId,
        leaveType: 'VACATION',
        startDate: cancellation,
        endDate: cancellation,
        daysCount: 1,
        isPaid: true,
        status: 'CANCELLED',
        approvedById: actors.adminId,
        debitedBalanceId: id(`balance:${index}:VACATION`),
        debitedDays: 1,
        cancelledById: actors.adminId,
        cancelledFromStatus: 'APPROVED',
        refundedDays: 1,
        cancelledAt: cancellation,
        cancellationReason: 'Synthetic approved-leave reversal scenario',
        reason: 'Synthetic cancelled leave fixture',
        createdAt: cancellation,
      },
      {
        id: id(`leave:${index}:pending`),
        employeeId,
        leaveType: 'VACATION',
        startDate: weekdayInMonth(10, index),
        endDate: weekdayInMonth(10, index),
        daysCount: 1,
        isPaid: true,
        status: 'PENDING',
        reason: 'Synthetic pending vacation request',
        createdAt: day('2026-10-02'),
      },
      {
        id: id(`leave:${index}:unpaid`),
        employeeId,
        leaveType: 'SPECIAL_UNPAID',
        startDate: day('2026-10-26'),
        endDate: day('2026-10-26'),
        daysCount: 1,
        isPaid: false,
        status: 'PENDING',
        reason: 'Synthetic pending unpaid request',
        createdAt: day('2026-10-02'),
      },
    ];
    data.leaves.push(...requests);
    const attendance: Prisma.DailyTimeRecordCreateManyInput[] = [];
    for (
      let cursor = day('2026-01-01');
      cursor <= day('2026-10-02');
      cursor = new Date(cursor.getTime() + 86400000)
    ) {
      if ([0, 6].includes(cursor.getUTCDay())) continue;
      const key = dateKey(cursor);
      const onVacation = key === dateKey(vacation);
      const onSick = key === dateKey(sick);
      const selector = index + Math.floor(cursor.getTime() / 86400000);
      const absent = !onVacation && !onSick && selector % 41 === 0;
      const tardiness =
        !onVacation && !onSick && !absent && selector % 17 === 0 ? 15 : 0;
      const undertime =
        !onVacation && !onSick && !absent && selector % 31 === 0 ? 60 : 0;
      const overtime =
        !onVacation && !onSick && !absent && !undertime && selector % 13 === 0
          ? 60
          : 0;
      const night =
        !onVacation &&
        !onSick &&
        !absent &&
        !undertime &&
        !overtime &&
        !tardiness &&
        index % 12 === 0;
      const start = new Date(`${key}T${night ? '18' : '09'}:00:00+08:00`);
      start.setUTCMinutes(start.getUTCMinutes() + tardiness);
      const end = new Date(
        start.getTime() +
          (onSick ? 240 : 540 + overtime - undertime - tardiness) * 60000,
      );
      const record: Prisma.DailyTimeRecordCreateManyInput = {
        id: id(`attendance:${index}:${key}`),
        employeeId,
        date: new Date(cursor),
        dayType: 'REGULAR_WORKDAY',
        actualWorkedMinutes:
          onVacation || absent
            ? 0
            : onSick
              ? 240
              : 480 + overtime - tardiness - undertime,
        timeIn: onVacation || absent ? null : start,
        timeOut: onVacation || absent ? null : end,
        tardinessMinutes: tardiness,
        undertimeMinutes: undertime,
        overtimeMinutes: overtime,
        nightDiffMinutes: night ? 300 : 0,
        isAbsent: absent,
        isApproved: cursor < day('2026-10-01') || index % 7 !== 0,
        remarks: onVacation
          ? 'Synthetic paid full-day leave — no work/punches'
          : onSick
            ? 'Synthetic four-hour work plus paid half-day leave'
            : 'Synthetic weekday schedule; 60-minute unpaid break; not a verified shift/holiday calendar',
      };
      attendance.push(record);
      if (overtime)
        data.overtime.push({
          id: id(`overtime:${index}:${key}`),
          employeeId,
          date: new Date(cursor),
          requestedMinutes: overtime,
          actualMinutes: overtime,
          status: 'APPROVED',
          approvedById: actors.adminId,
          reason: 'Synthetic overtime scenario — no real authorization',
        });
    }
    data.attendance.push(...attendance);
    const loanId = index % 4 === 0 ? id(`loan:${index}`) : null;
    let loanBalance = loanId ? 1000000n : 0n;
    let firstTaxable = 0n;
    let firstWithheld = 0n;
    let ytdBenefits = 0n;
    for (const [runIndex, run] of runs.entries()) {
      const summary = emptyAttendance();
      const start = (run.cutoffStartDate as Date).getTime();
      const end = (run.cutoffEndDate as Date).getTime();
      for (const record of attendance) {
        const timestamp = (record.date as Date).getTime();
        if (timestamp < start || timestamp > end || !record.isApproved)
          continue;
        summary.regularHoursWorked +=
          ((record.actualWorkedMinutes ?? 0) - (record.overtimeMinutes ?? 0)) /
          60;
        summary.tardinessMinutes += record.tardinessMinutes ?? 0;
        summary.undertimeMinutes += record.undertimeMinutes ?? 0;
        summary.absentDays += record.isAbsent ? 1 : 0;
        summary.regularOvertimeHours += (record.overtimeMinutes ?? 0) / 60;
        summary.regularNightDiffHours += (record.nightDiffMinutes ?? 0) / 60;
      }
      summary.paidLeaveDays = requests
        .filter(
          (request) =>
            request.status === 'APPROVED' &&
            (request.startDate as Date).getTime() >= start &&
            (request.startDate as Date).getTime() <= end,
        )
        .reduce((sum, request) => sum + Number(request.daysCount), 0);
      const result = calculatePhilippinePayroll({
        compensation,
        attendance: summary,
        cutoffType:
          runIndex % 2 === 0
            ? CutoffType.FIRST_CUTOFF
            : CutoffType.SECOND_CUTOFF,
        schedule: {
          deductSssIn: 'FIRST_CUTOFF',
          deductPhilhealthIn: 'FIRST_CUTOFF',
          deductPagibigIn: 'FIRST_CUTOFF',
          deductTaxIn: 'SECOND_CUTOFF',
        },
        allowances: [
          {
            name: 'Synthetic rice allowance',
            amountCents: 50000n,
            isTaxable: false,
          },
          {
            name: 'Synthetic internet allowance',
            amountCents: 20000n,
            isTaxable: true,
          },
        ],
        loans: loanId
          ? [
              {
                loanId,
                name: 'Synthetic company cash advance',
                amountCents: loanBalance < 10000n ? loanBalance : 10000n,
              },
            ]
          : [],
        ytdOtherBenefitsCents: ytdBenefits,
        ...(runIndex % 2
          ? {
              priorMonthlyTaxableIncomeCents: firstTaxable,
              priorMonthlyTaxWithheldCents: firstWithheld,
            }
          : {}),
      });
      if (runIndex % 2 === 0) {
        firstTaxable = result.taxableIncomeCents;
        firstWithheld = result.withholdingTaxCents;
      }
      ytdBenefits = result.ytdOtherBenefitsTotalCents;
      const payslipId = id(`payslip:${index}:${runIndex}`);
      data.payslips.push({
        id: payslipId,
        payrollRunId: run.id as string,
        employeeId,
        basicPayCents: result.basicPayForPeriodCents,
        paidLeavePayCents: result.paidLeavePayCents,
        overtimePayCents: result.overtimePayCents,
        nightDiffPayCents: result.nightDiffPayCents,
        holidayPayCents: result.holidayPayCents,
        restDayPayCents: result.restDayPayCents,
        taxableAllowancesCents: result.taxableAllowancesCents,
        nonTaxableAllowancesCents: result.nonTaxableAllowancesCents,
        grossPayCents: result.grossPayCents,
        tardinessDeductionCents: result.tardinessDeductionCents,
        undertimeDeductionCents: result.undertimeDeductionCents,
        absenceDeductionCents: result.absenceDeductionCents,
        sssEmployeeCents: result.sssContribution.employeeShareCents,
        sssWispEmployeeCents: result.sssContribution.wispEmployeeCents ?? 0n,
        philhealthEmployeeCents:
          result.philhealthContribution.employeeShareCents,
        pagibigEmployeeCents: result.pagibigContribution.employeeShareCents,
        withholdingTaxCents: result.withholdingTaxCents,
        sssEmployerCents: result.sssContribution.employerShareCents,
        sssWispEmployerCents: result.sssContribution.wispEmployerCents ?? 0n,
        sssECCents: result.sssContribution.ecShareCents ?? 0n,
        philhealthEmployerCents:
          result.philhealthContribution.employerShareCents,
        pagibigEmployerCents: result.pagibigContribution.employerShareCents,
        loanDeductionsCents: result.loanDeductionsCents,
        otherDeductionsCents: result.otherDeductionsCents,
        totalDeductionsCents: result.totalDeductionsCents,
        netPayCents: result.netPayCents,
        thirteenthMonthAccrualCents: result.thirteenthMonthAccrualCents,
        deMinimisExcessCents: result.deMinimisExcessTaxableCents,
        createdAt: run.createdAt,
      });
      if (loanId && result.loanDeductionsCents) {
        loanBalance -= result.loanDeductionsCents;
        data.payments.push({
          id: id(`payment:${index}:${runIndex}`),
          loanId,
          payslipId,
          amountPaidCents: result.loanDeductionsCents,
          balanceAfterCents: loanBalance,
          paymentDate: run.paymentDate,
        });
      }
      run.totalGrossCents =
        BigInt(run.totalGrossCents ?? 0) + result.grossPayCents;
      run.totalDeductionsCents =
        BigInt(run.totalDeductionsCents ?? 0) + result.totalDeductionsCents;
      run.totalNetCents = BigInt(run.totalNetCents ?? 0) + result.netPayCents;
      run.totalEmployerCostCents =
        BigInt(run.totalEmployerCostCents ?? 0) +
        result.totalStatutoryEmployerCents;
      if (run.status === 'DISBURSED')
        monthlyTax[Math.floor(runIndex / 2)] += result.withholdingTaxCents;
    }
    if (loanId)
      data.loans.push({
        id: loanId,
        employeeId,
        loanType: 'COMPANY_CASH_ADVANCE',
        referenceNumber: `SYNTHETIC-LOAN-${number}`,
        principalCents: 1000000n,
        totalAmountCents: 1000000n,
        amortizationCents: 10000n,
        balanceCents: loanBalance,
        startDate: day('2026-01-01'),
        isActive: loanBalance > 0n,
      });
    // Leave some evidence absent so the year-end UI includes blocked scenarios.
    if (index % 5 !== 0)
      data.declarations.push({
        id: id(`declaration:${index}`),
        organizationId: actors.organizationId,
        employeeId,
        taxYear: 2026,
        hasPriorEmployer: false,
        sourceReference: `SYNTHETIC-NOT-VERIFIED-${number}`,
        recordedById: actors.adminId,
      });
    data.audits.push({
      id: id(`audit:employee:${index}`),
      organizationId: actors.organizationId,
      userId: actors.adminId,
      userEmail: actors.adminEmail,
      action: 'SANDBOX_SEED',
      entityType: 'Employee',
      entityId: employeeId,
      newData: {
        synthetic: true,
        seedVersion: SANDBOX_SEED_VERSION,
        employeeNumber: `${SANDBOX_EMPLOYEE_PREFIX}${number}`,
        notActualEmploymentHistory: true,
      },
    });
    for (const request of requests)
      data.audits.push({
        id: id(`audit:${request.id}`),
        organizationId: actors.organizationId,
        userId: actors.adminId,
        userEmail: actors.adminEmail,
        action: 'SANDBOX_SEED',
        entityType: 'LeaveRequest',
        entityId: request.id as string,
        newData: {
          synthetic: true,
          seedVersion: SANDBOX_SEED_VERSION,
          status: request.status as string,
          notActualEmployeeDecision: true,
        },
      });
  }
  for (let index = 0; index < 9; index++)
    data.remittances.push({
      id: id(`remittance:${index}`),
      organizationId: actors.organizationId,
      taxYear: 2026,
      month: index + 1,
      remittedCents: monthlyTax[index],
      documentReference: `SYNTHETIC-NOT-FILED-2026-${String(index + 1).padStart(2, '0')}`,
      recordedById: actors.adminId,
    });
  for (const run of runs)
    data.audits.push({
      id: id(`audit:${run.id}`),
      organizationId: actors.organizationId,
      userId: actors.adminId,
      userEmail: actors.adminEmail,
      action: 'SANDBOX_SEED',
      entityType: 'PayrollRun',
      entityId: run.id as string,
      newData: {
        synthetic: true,
        seedVersion: SANDBOX_SEED_VERSION,
        status: run.status as string,
        noBankPaymentSent: true,
        fixtureEmployeesOnly: true,
        notActualApproval: true,
      },
    });
  return data;
}
