"use client";

import type {
  PayrollCalculationInput,
  ProcessedDtrDay,
} from "@workspace/payroll-engine";
import {
  CutoffType,
  calculate13thMonthBatch,
  calculateFinalPay,
  calculatePhilippinePayroll,
  calculateSilCashConversion,
  DeMinimisCategory,
  deriveRates,
  formatBir2316TextDocument,
  formatDole13thMonthComplianceReport,
  generateBir2316Certificate,
  PayBasis,
  parseBiometricCsv,
  processBiometricLogs,
  SeparationType,
  WorkDayDivisor,
} from "@workspace/payroll-engine";
import { Button } from "@workspace/ui/components/button";
import {
  Banknote,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Lock,
  Play,
  Plus,
  ShieldCheck,
  TrendingUp,
  UploadCloud,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";

// Helper to format Centavos to Philippine Pesos string
function formatPHP(cents: bigint | number): string {
  const pesos = Number(cents) / 100;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(pesos);
}

// Helper to download content as client-side file
function downloadFile(
  filename: string,
  content: string,
  mimeType = "text/csv;charset=utf-8;",
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface DemoEmployee {
  id: string;
  employeeNo: string;
  name: string;
  department: string;
  role: string;
  payBasis: PayBasis;
  monthlyBasicRateCents: bigint;
  isMinimumWageEarner: boolean;
  tin: string;
  sssNo: string;
  philhealthNo: string;
  pagibigNo: string;
  bankName: string;
  bankAccount: string;
  activeLoanCents: bigint;
  silBalanceDays: number;
  silCashBonusCents: bigint;
  attendance: {
    regularHoursWorked: number;
    tardinessMinutes: number;
    undertimeMinutes: number;
    absentDays: number;
    regularOvertimeHours: number;
    regularNightDiffHours: number;
  };
}

type ActiveTab =
  | "overview"
  | "employees"
  | "timekeeping"
  | "leaves-sil"
  | "payroll-wizard"
  | "ess-portal"
  | "compliance";

interface DemoLeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  isPaid: boolean;
  reason: string;
  status: "APPROVED" | "PENDING";
}

const INITIAL_EMPLOYEES: [DemoEmployee, ...DemoEmployee[]] = [
  {
    id: "emp-001",
    employeeNo: "EMP-2026-001",
    name: "Juan Dela Cruz",
    department: "Software Engineering",
    role: "Senior Full-Stack Engineer",
    payBasis: PayBasis.MONTHLY,
    monthlyBasicRateCents: 6500000n, // PHP 65,000.00
    isMinimumWageEarner: false,
    tin: "123-456-789-000",
    sssNo: "34-1234567-8",
    philhealthNo: "12-345678901-2",
    pagibigNo: "1234-5678-9012",
    bankName: "BDO Unibank",
    bankAccount: "001234567890",
    activeLoanCents: 1500000n,
    silBalanceDays: 5.0,
    silCashBonusCents: 0n,
    attendance: {
      regularHoursWorked: 80,
      tardinessMinutes: 15,
      undertimeMinutes: 0,
      absentDays: 0,
      regularOvertimeHours: 4,
      regularNightDiffHours: 0,
    },
  },
  {
    id: "emp-002",
    employeeNo: "EMP-2026-002",
    name: "Maria Santos",
    department: "Product & Design",
    role: "Lead UI/UX Designer",
    payBasis: PayBasis.MONTHLY,
    monthlyBasicRateCents: 4500000n, // PHP 45,000.00
    isMinimumWageEarner: false,
    tin: "234-567-890-000",
    sssNo: "03-9876543-2",
    philhealthNo: "23-456789012-3",
    pagibigNo: "2345-6789-0123",
    bankName: "BPI",
    bankAccount: "1234567890",
    activeLoanCents: 0n,
    silBalanceDays: 5.0,
    silCashBonusCents: 0n,
    attendance: {
      regularHoursWorked: 80,
      tardinessMinutes: 0,
      undertimeMinutes: 0,
      absentDays: 0,
      regularOvertimeHours: 0,
      regularNightDiffHours: 0,
    },
  },
  {
    id: "emp-003",
    employeeNo: "EMP-2026-003",
    name: "Carlos Reyes",
    department: "Operations & Support",
    role: "Operations Specialist",
    payBasis: PayBasis.MONTHLY,
    monthlyBasicRateCents: 2200000n, // PHP 22,000.00
    isMinimumWageEarner: false,
    tin: "345-678-901-000",
    sssNo: "09-1122334-5",
    philhealthNo: "34-567890123-4",
    pagibigNo: "3456-7890-1234",
    bankName: "UnionBank",
    bankAccount: "109876543210",
    activeLoanCents: 500000n,
    silBalanceDays: 4.0,
    silCashBonusCents: 0n,
    attendance: {
      regularHoursWorked: 80,
      tardinessMinutes: 0,
      undertimeMinutes: 0,
      absentDays: 0,
      regularOvertimeHours: 6,
      regularNightDiffHours: 8,
    },
  },
  {
    id: "emp-004",
    employeeNo: "EMP-2026-004",
    name: "Ana Gomez",
    department: "Logistics",
    role: "Logistics Assistant",
    payBasis: PayBasis.MONTHLY,
    // NCR minimum wage under Wage Order No. NCR-27 (PHP 755/day from
    // 2026-07-25): PHP 755 x 313 / 12 = PHP 19,692.92 / mo, rounded.
    monthlyBasicRateCents: 1969300n, // PHP 19,693.00 (Minimum Wage Tier)
    isMinimumWageEarner: true,
    tin: "456-789-012-000",
    sssNo: "07-4455667-8",
    philhealthNo: "45-678901234-5",
    pagibigNo: "4567-8901-2345",
    bankName: "Metrobank",
    bankAccount: "209876543211",
    activeLoanCents: 0n,
    silBalanceDays: 5.0,
    silCashBonusCents: 0n,
    attendance: {
      regularHoursWorked: 80,
      tardinessMinutes: 0,
      undertimeMinutes: 0,
      absentDays: 0,
      regularOvertimeHours: 0,
      regularNightDiffHours: 0,
    },
  },
];

const INITIAL_LEAVE_REQUESTS: DemoLeaveRequest[] = [
  {
    id: "req-001",
    employeeId: "emp-001",
    employeeName: "Juan Dela Cruz",
    leaveType: "Vacation Leave",
    startDate: "2026-08-10",
    endDate: "2026-08-11",
    daysCount: 2,
    isPaid: true,
    reason: "Family vacation to Batangas",
    status: "APPROVED",
  },
  {
    id: "req-002",
    employeeId: "emp-003",
    employeeName: "Carlos Reyes",
    leaveType: "Sick Leave",
    startDate: "2026-08-14",
    endDate: "2026-08-14",
    daysCount: 1,
    isPaid: true,
    reason: "Acute migraine & rest advised",
    status: "APPROVED",
  },
];

export default function PayrollDashboard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  const [employees, setEmployees] = useState<DemoEmployee[]>(INITIAL_EMPLOYEES);
  const [leaveRequests, setLeaveRequests] = useState<DemoLeaveRequest[]>(
    INITIAL_LEAVE_REQUESTS,
  );
  const [selectedCutoff, setSelectedCutoff] = useState<
    "FIRST_CUTOFF" | "SECOND_CUTOFF"
  >("FIRST_CUTOFF");
  const [payrollStatus, setPayrollStatus] = useState<
    "READY" | "RUNNING" | "COMPLETED"
  >("READY");
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [isDtrModalOpen, setIsDtrModalOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isBiometricsModalOpen, setIsBiometricsModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isSilModalOpen, setIsSilModalOpen] = useState(false);
  const [isFinalPayModalOpen, setIsFinalPayModalOpen] = useState(false);
  const [selectedFinalPayEmpId, setSelectedFinalPayEmpId] = useState<string>(
    INITIAL_EMPLOYEES[0].id,
  );
  const [finalPayReason, setFinalPayReason] = useState<SeparationType>(
    SeparationType.RESIGNATION,
  );
  const [finalPayYearsOfService, setFinalPayYearsOfService] =
    useState<number>(2.5);
  const [finalPayUnpaidDays, setFinalPayUnpaidDays] = useState<number>(5);
  const [finalPayUnusedLeaves, setFinalPayUnusedLeaves] = useState<number>(5);
  const [isBir2316ModalOpen, setIsBir2316ModalOpen] = useState(false);
  const [selectedBir2316EmpId, setSelectedBir2316EmpId] = useState<string>(
    INITIAL_EMPLOYEES[0].id,
  );
  const [is13thMonthModalOpen, setIs13thMonthModalOpen] = useState(false);
  const [selected13thMonthYear, _setSelected13thMonthYear] =
    useState<number>(2026);

  // Biometrics Import state
  const [biometricsCsv, setBiometricsCsv] =
    useState(`Employee_ID,Timestamp,Punch_Type
EMP-2026-001,2026-08-25 09:18:00,CHECK_IN
EMP-2026-001,2026-08-25 20:30:00,CHECK_OUT
EMP-2026-002,2026-08-25 08:50:00,CHECK_IN
EMP-2026-002,2026-08-25 18:05:00,CHECK_OUT
EMP-2026-003,2026-08-25 09:00:00,CHECK_IN
EMP-2026-003,2026-08-25 23:00:00,CHECK_OUT`);

  // New Employee Form State
  const [empForm, setEmpForm] = useState({
    firstName: "",
    lastName: "",
    department: "Software Engineering",
    role: "",
    monthlySalaryPesos: 35000,
    isMinimumWage: false,
    bankName: "BDO Unibank",
    bankAccount: "",
  });

  // DTR Form State
  const [dtrForm, setDtrForm] = useState({
    employeeId: INITIAL_EMPLOYEES[0].id,
    date: "2026-08-25",
    tardinessMinutes: 0,
    regularOvertimeHours: 2,
    regularNightDiffHours: 0,
  });

  // Loan Form State
  const [loanForm, setLoanForm] = useState({
    employeeId: INITIAL_EMPLOYEES[0].id,
    loanType: "SSS Salary Loan",
    principalPesos: 15000,
    amortizationPesos: 500,
  });

  // Leave Form State
  const [leaveForm, setLeaveForm] = useState({
    employeeId: INITIAL_EMPLOYEES[0].id,
    leaveType: "Service Incentive Leave (SIL)",
    startDate: "2026-08-28",
    endDate: "2026-08-29",
    daysCount: 2,
    isPaid: true,
    reason: "Personal / Annual SIL utilization",
  });

  // SIL Monetization State
  const [silEmployeeId, setSilEmployeeId] = useState(INITIAL_EMPLOYEES[0].id);
  const [silDaysToMonetize, setSilDaysToMonetize] = useState(5.0);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }

  // Live Payroll Calculation across all employees for selected cutoff
  const computedPayrollResults = employees.map((emp) => {
    const input: PayrollCalculationInput = {
      cutoffType:
        selectedCutoff === "FIRST_CUTOFF"
          ? CutoffType.FIRST_CUTOFF
          : CutoffType.SECOND_CUTOFF,
      schedule: {
        deductSssIn: "FIRST_CUTOFF",
        deductPhilhealthIn: "FIRST_CUTOFF",
        deductPagibigIn: "FIRST_CUTOFF",
        deductTaxIn: "SECOND_CUTOFF",
      },
      compensation: {
        payBasis: emp.payBasis,
        monthlyBasicRateCents: emp.monthlyBasicRateCents,
        divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
        isMinimumWageEarner: emp.isMinimumWageEarner,
      },
      attendance: {
        regularHoursWorked: emp.attendance.regularHoursWorked,
        tardinessMinutes: emp.attendance.tardinessMinutes,
        undertimeMinutes: emp.attendance.undertimeMinutes,
        absentDays: emp.attendance.absentDays,
        regularOvertimeHours: emp.attendance.regularOvertimeHours,
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
        regularNightDiffHours: emp.attendance.regularNightDiffHours,
        overtimeNightDiffHours: 0,
        restDayNightDiffHours: 0,
        holidayNightDiffHours: 0,
      },
      allowances: [
        {
          name: "Rice Subsidy",
          amountCents: 100000n, // PHP 1,000 / cutoff
          isTaxable: false,
          deMinimisCategory: DeMinimisCategory.RICE_SUBSIDY,
        },
        ...(emp.silCashBonusCents > 0n
          ? [
              {
                name: "Monetized SIL (De Minimis)",
                amountCents: emp.silCashBonusCents,
                isTaxable: false,
                deMinimisCategory: DeMinimisCategory.OTHER,
              },
            ]
          : []),
      ],
      loans:
        emp.activeLoanCents > 0n
          ? [
              {
                loanId: `loan-${emp.id}`,
                name: "Mandatory/Statutory Loan",
                amountCents:
                  emp.activeLoanCents > 50000n ? 50000n : emp.activeLoanCents,
              },
            ]
          : [],
    };

    return {
      employee: emp,
      calc: calculatePhilippinePayroll(input),
    };
  });

  // Aggregated Summary
  const totalGrossCents = computedPayrollResults.reduce(
    (acc, curr) => acc + curr.calc.grossPayCents,
    0n,
  );
  const totalNetCents = computedPayrollResults.reduce(
    (acc, curr) => acc + curr.calc.netPayCents,
    0n,
  );
  const totalDeductionsCents = computedPayrollResults.reduce(
    (acc, curr) => acc + curr.calc.totalDeductionsCents,
    0n,
  );
  const totalEmployerCostCents = computedPayrollResults.reduce(
    (acc, curr) => acc + curr.calc.totalStatutoryEmployerCents,
    0n,
  );

  // Form Handlers
  function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!empForm.firstName || !empForm.lastName) return;

    const newEmp: DemoEmployee = {
      id: `emp-${Date.now()}`,
      employeeNo: `EMP-2026-00${employees.length + 1}`,
      name: `${empForm.firstName} ${empForm.lastName}`,
      department: empForm.department,
      role: empForm.role || "Associate",
      payBasis: PayBasis.MONTHLY,
      monthlyBasicRateCents: BigInt(
        Math.round(empForm.monthlySalaryPesos * 100),
      ),
      isMinimumWageEarner: empForm.isMinimumWage,
      tin: "888-999-000-000",
      sssNo: "09-8877665-4",
      philhealthNo: "78-990011223-4",
      pagibigNo: "9988-7766-5544",
      bankName: empForm.bankName,
      bankAccount: empForm.bankAccount || "1122334455",
      activeLoanCents: 0n,
      silBalanceDays: 5.0,
      silCashBonusCents: 0n,
      attendance: {
        regularHoursWorked: 80,
        tardinessMinutes: 0,
        undertimeMinutes: 0,
        absentDays: 0,
        regularOvertimeHours: 0,
        regularNightDiffHours: 0,
      },
    };

    setEmployees([...employees, newEmp]);
    setIsAddEmployeeOpen(false);
    setEmpForm({
      firstName: "",
      lastName: "",
      department: "Software Engineering",
      role: "",
      monthlySalaryPesos: 35000,
      isMinimumWage: false,
      bankName: "BDO Unibank",
      bankAccount: "",
    });
    showToast(
      `✅ Successfully registered employee: ${newEmp.name} (${newEmp.employeeNo})`,
    );
  }

  function handleSaveAttendance(e: React.FormEvent) {
    e.preventDefault();
    setEmployees(
      employees.map((emp) => {
        if (emp.id === dtrForm.employeeId) {
          return {
            ...emp,
            attendance: {
              ...emp.attendance,
              tardinessMinutes: Number(dtrForm.tardinessMinutes),
              regularOvertimeHours: Number(dtrForm.regularOvertimeHours),
              regularNightDiffHours: Number(dtrForm.regularNightDiffHours),
            },
          };
        }
        return emp;
      }),
    );
    setIsDtrModalOpen(false);
    showToast(
      "✅ Attendance adjustments applied and recalculated across live payroll!",
    );
  }

  function handleSaveLoan(e: React.FormEvent) {
    e.preventDefault();
    setEmployees(
      employees.map((emp) => {
        if (emp.id === loanForm.employeeId) {
          return {
            ...emp,
            activeLoanCents: BigInt(Math.round(loanForm.principalPesos * 100)),
          };
        }
        return emp;
      }),
    );
    setIsLoanModalOpen(false);
    showToast("✅ Loan deduction registered and amortized for this pay cycle!");
  }

  function handleSaveLeaveRequest(e: React.FormEvent) {
    e.preventDefault();
    const emp = employees.find((e) => e.id === leaveForm.employeeId);
    if (!emp) return;

    const newReq: DemoLeaveRequest = {
      id: `req-${Date.now()}`,
      employeeId: emp.id,
      employeeName: emp.name,
      leaveType: leaveForm.leaveType,
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      daysCount: Number(leaveForm.daysCount),
      isPaid: leaveForm.isPaid,
      reason: leaveForm.reason,
      status: "APPROVED",
    };

    if (leaveForm.isPaid) {
      setEmployees(
        employees.map((e) => {
          if (e.id === emp.id && leaveForm.leaveType.includes("SIL")) {
            return {
              ...e,
              silBalanceDays: Math.max(0, e.silBalanceDays - newReq.daysCount),
            };
          }
          return e;
        }),
      );
    }

    setLeaveRequests([newReq, ...leaveRequests]);
    setIsLeaveModalOpen(false);
    showToast(
      `✅ Approved ${newReq.daysCount} days ${newReq.leaveType} for ${emp.name}!`,
    );
  }

  // Selected Employee for SIL Monetization Calculation
  const selectedSilEmp =
    employees.find((e) => e.id === silEmployeeId) ??
    employees[0] ??
    INITIAL_EMPLOYEES[0];
  const silDailyRateResult = deriveRates({
    payBasis: selectedSilEmp.payBasis,
    monthlyBasicRateCents: selectedSilEmp.monthlyBasicRateCents,
    divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
    isMinimumWageEarner: selectedSilEmp.isMinimumWageEarner,
  });
  const silDailyRateCents = silDailyRateResult.dailyRateCents;

  const silMonetizationCalc = calculateSilCashConversion({
    dailyRateCents: silDailyRateCents,
    unusedLeaveDays: silDaysToMonetize,
  });

  function handleApplySilMonetization() {
    setEmployees(
      employees.map((emp) => {
        if (emp.id === selectedSilEmp.id) {
          return {
            ...emp,
            silBalanceDays: Math.max(0, emp.silBalanceDays - silDaysToMonetize),
            silCashBonusCents: silMonetizationCalc.totalMonetizedCashCents,
          };
        }
        return emp;
      }),
    );
    setIsSilModalOpen(false);
    showToast(
      `💰 Monetized ${silDaysToMonetize} days SIL (${formatPHP(silMonetizationCalc.totalMonetizedCashCents)}) credited to ${selectedSilEmp.name}!`,
    );
  }

  // Selected Employee for DOLE Final Pay & Separation Settlement
  const selectedFinalPayEmp =
    employees.find((e) => e.id === selectedFinalPayEmpId) ??
    employees[0] ??
    INITIAL_EMPLOYEES[0];
  const finalPayDailyRateResult = deriveRates({
    payBasis: selectedFinalPayEmp.payBasis,
    monthlyBasicRateCents: selectedFinalPayEmp.monthlyBasicRateCents,
    divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
    isMinimumWageEarner: selectedFinalPayEmp.isMinimumWageEarner,
  });
  const finalPayDailyRateCents = finalPayDailyRateResult.dailyRateCents;

  const finalPayResult = calculateFinalPay({
    separationType: finalPayReason,
    monthlyBasicRateCents: selectedFinalPayEmp.monthlyBasicRateCents,
    dailyRateCents: finalPayDailyRateCents,
    yearsOfService: finalPayYearsOfService,
    unpaidDaysWorkedInLastPeriod: finalPayUnpaidDays,
    totalYtdBasicEarnedCents: selectedFinalPayEmp.monthlyBasicRateCents * 8n,
    unusedLeaveDays: finalPayUnusedLeaves,
    ytdTaxableCompensationCents: selectedFinalPayEmp.monthlyBasicRateCents * 8n,
    totalYtdTaxWithheldCents:
      (selectedFinalPayEmp.monthlyBasicRateCents * 8n * 10n) / 100n,
    outstandingLoanBalanceCents: selectedFinalPayEmp.activeLoanCents,
  });

  function handleFinalizeSeparation() {
    setEmployees(employees.filter((emp) => emp.id !== selectedFinalPayEmp.id));
    setIsFinalPayModalOpen(false);
    showToast(
      `🕊️ Completed Separation Clearance & Final Pay for ${selectedFinalPayEmp.name}!`,
    );
  }

  // Selected Employee for BIR Form 2316 Certificate
  const selectedBir2316Emp =
    employees.find((e) => e.id === selectedBir2316EmpId) ??
    employees[0] ??
    INITIAL_EMPLOYEES[0];
  const annualBasicSalaryCents = selectedBir2316Emp.monthlyBasicRateCents * 12n;
  const annual13thMonthCents = selectedBir2316Emp.monthlyBasicRateCents;
  const annualOvertimeCents =
    BigInt(selectedBir2316Emp.attendance.regularOvertimeHours * 24) * 20000n;
  const annualSssEeCents = 2100000n;
  const annualPhicEeCents = (annualBasicSalaryCents * 25n) / 1000n;
  const annualPagibigEeCents = 240000n;
  const annualTaxWithheldCents = selectedBir2316Emp.isMinimumWageEarner
    ? 0n
    : (annualBasicSalaryCents * 8n) / 100n;

  const bir2316Cert = generateBir2316Certificate(
    2026,
    {
      employeeNumber: selectedBir2316Emp.employeeNo,
      firstName: selectedBir2316Emp.name.split(" ")[0] || "Juan",
      lastName:
        selectedBir2316Emp.name.split(" ").slice(1).join(" ") || "Dela Cruz",
      tin: selectedBir2316Emp.tin,
      residentialAddress: "Metro Manila, Philippines",
      isMinimumWageEarner: selectedBir2316Emp.isMinimumWageEarner,
    },
    {
      registeredName: "Acme Philippines Technologies Inc.",
      tin: "123-456-789-000",
      rdoCode: "047",
      registeredAddress: "Ayala Avenue, Makati City, Metro Manila",
    },
    {
      totalBasicSalaryCents: annualBasicSalaryCents,
      totalOvertimePayCents: annualOvertimeCents,
      totalHolidayPayCents: 0n,
      totalNightDiffPayCents: 0n,
      totalDeMinimisBenefitsCents: 2400000n,
      totalThirteenthMonthAndBonusesCents: annual13thMonthCents,
      totalOtherTaxableAllowancesCents: 0n,
      totalSssEmployeeShareCents: annualSssEeCents,
      totalPhilhealthEmployeeShareCents: annualPhicEeCents,
      totalPagibigEmployeeShareCents: annualPagibigEeCents,
      totalTaxWithheldCents: annualTaxWithheldCents,
    },
  );

  // DOLE 13th Month Pay Batch Calculation
  const thirteenthMonthBatchResult = calculate13thMonthBatch(
    selected13thMonthYear,
    employees.map((e) => {
      const monthsWorked = e.employeeNo.includes("004") ? 8 : 12;
      return {
        employeeId: e.id,
        employeeNumber: e.employeeNo,
        fullName: e.name,
        monthlyBasicRateCents: e.monthlyBasicRateCents,
        hireDate: "2025-01-01",
        monthsWorkedInYear: monthsWorked,
        unpaidAbsenceDays: 0,
      };
    }),
  );

  // Parse Biometrics Logs Preview
  const parsedBiometricDays: ProcessedDtrDay[] = (() => {
    try {
      const logs = parseBiometricCsv(biometricsCsv);
      return processBiometricLogs(logs);
    } catch {
      return [];
    }
  })();

  function handleApplyBiometrics() {
    if (parsedBiometricDays.length === 0) return;

    setEmployees(
      employees.map((emp) => {
        const matchingDay = parsedBiometricDays.find(
          (d) => d.employeeNumber === emp.employeeNo,
        );
        if (matchingDay && !matchingDay.hasMissingPunch) {
          return {
            ...emp,
            attendance: {
              ...emp.attendance,
              tardinessMinutes: matchingDay.tardinessMinutes,
              regularOvertimeHours: matchingDay.overtimeMinutes / 60,
              regularNightDiffHours: matchingDay.nightDiffMinutes / 60,
            },
          };
        }
        return emp;
      }),
    );

    setIsBiometricsModalOpen(false);
    showToast(
      `✅ Successfully ingested biometric punches for ${parsedBiometricDays.length} records!`,
    );
  }

  // Export File Generators
  function exportBankTransmittal(bank: string) {
    const matching = computedPayrollResults.filter((r) =>
      r.employee.bankName.toLowerCase().includes(bank.toLowerCase()),
    );
    const records = matching.length > 0 ? matching : computedPayrollResults;

    const rows = [
      "Account_Number,Beneficiary_Name,Amount_PHP,Employee_ID,Reference",
      ...records.map(
        (r) =>
          `"${r.employee.bankAccount}","${r.employee.name}",${(Number(r.calc.netPayCents) / 100).toFixed(2)},"${r.employee.employeeNo}","PAYROLL-${selectedCutoff}"`,
      ),
    ];

    downloadFile(
      `${bank}_Transmittal_${selectedCutoff}.csv`,
      rows.join("\r\n"),
    );
    showToast(
      `📥 Exported ${bank} Direct Deposit batch file with ${records.length} records!`,
    );
  }

  function exportBir1601C() {
    const grossPesos = (Number(totalGrossCents) / 100).toFixed(2);
    const deductionsPesos = (Number(totalDeductionsCents) / 100).toFixed(2);
    const content = [
      "BUREAU OF INTERNAL REVENUE - FORM 1601-C SUMMARY",
      "Monthly Remittance Return of Income Taxes Withheld on Compensation",
      `Taxable Period: 2026-08`,
      `Employer: Acme Philippines Technologies Inc.`,
      `Employer TIN: 123-456-789-000 | RDO: 047`,
      "--------------------------------------------------",
      `Total Headcount: ${employees.length}`,
      `Total Gross Compensation: PHP ${grossPesos}`,
      `Total Non-Taxable / Exempt / Statutory: PHP ${deductionsPesos}`,
      `Total Tax Withheld Due for Remittance: PHP ${(Number(computedPayrollResults.reduce((acc, c) => acc + c.calc.withholdingTaxCents, 0n)) / 100).toFixed(2)}`,
    ].join("\r\n");

    downloadFile(
      "BIR_1601C_Monthly_Return_Aug2026.txt",
      content,
      "text/plain;charset=utf-8;",
    );
    showToast("📥 Exported official BIR 1601-C Monthly Remittance Summary!");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs border border-emerald-400/30 animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 className="size-4" />
          <span className="font-medium">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 hover:opacity-75"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div
        role="note"
        className="border-b border-amber-600 bg-amber-950 px-4 py-3 text-center text-sm font-semibold text-amber-100"
      >
        DEMO ONLY — simulated, in-memory data. Nothing here is saved or sent to
        the payroll API. Do not use for live payroll.{" "}
        <a className="underline" href="/">
          Return to portal
        </a>
      </div>

      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              🇵🇭
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                Payroll
                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.2 rounded font-medium">
                  DOLE & BIR 2026
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Acme Philippines Technologies Inc. • RDO 047
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 hidden sm:inline">
              Pay Cycle:
            </span>
            <div className="bg-slate-900 border border-slate-800 p-1 rounded-xl flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setSelectedCutoff("FIRST_CUTOFF")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  selectedCutoff === "FIRST_CUTOFF"
                    ? "bg-blue-600 text-white font-medium shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                1st Cutoff (1st–15th)
              </button>
              <button
                type="button"
                onClick={() => setSelectedCutoff("SECOND_CUTOFF")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  selectedCutoff === "SECOND_CUTOFF"
                    ? "bg-blue-600 text-white font-medium shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                2nd Cutoff (16th–31st)
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3 overflow-x-auto text-xs">
          {(
            [
              { id: "overview", label: "Overview & Metrics", icon: TrendingUp },
              {
                id: "employees",
                label: `Employees (${employees.length})`,
                icon: Users,
              },
              { id: "timekeeping", label: "DTR & Attendance", icon: Clock },
              { id: "leaves-sil", label: "Leaves & SIL", icon: CalendarDays },
              {
                id: "payroll-wizard",
                label: "Payroll Run Wizard",
                icon: Banknote,
              },
              {
                id: "compliance",
                label: "Bank & Tax Exports",
                icon: FileSpreadsheet,
              },
              { id: "ess-portal", label: "ESS Digital Payslip", icon: Lock },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
                  active
                    ? "bg-blue-600/10 text-blue-400 font-semibold border border-blue-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW & METRICS */}
        {/* ========================================================================= */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">
                    Gross Payroll (Cutoff)
                  </span>
                  <Banknote className="size-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {formatPHP(totalGrossCents)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Basic + Overtime + De Minimis
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Net Take-Home Pay</span>
                  <CreditCard className="size-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {formatPHP(totalNetCents)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Disbursement batch total
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">
                    Statutory Deductions (EE)
                  </span>
                  <ShieldCheck className="size-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {formatPHP(totalDeductionsCents)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  SSS, PhilHealth, Pag-IBIG, Tax
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">
                    Employer Contributions (ER)
                  </span>
                  <Building2 className="size-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {formatPHP(totalEmployerCostCents)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Mandatory ER Share + EC + WISP
                </p>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Philippine Statutory Mandates Status
                  </h2>
                  <p className="text-xs text-slate-400">
                    Current schedules and contribution ceilings applied
                  </p>
                </div>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" /> All Rates Up-to-Date
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
                  <div className="text-xs font-semibold text-blue-400">
                    SSS & WISP
                  </div>
                  <div className="text-sm font-bold text-white mt-1">
                    15.0% Contribution
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    10% ER / 5% EE | MSC Cap: ₱35,000
                  </div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
                  <div className="text-xs font-semibold text-emerald-400">
                    PhilHealth
                  </div>
                  <div className="text-sm font-bold text-white mt-1">
                    5.0% Premium Rate
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    2.5% ER / 2.5% EE | Ceiling: ₱100,000
                  </div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
                  <div className="text-xs font-semibold text-amber-400">
                    Pag-IBIG Fund
                  </div>
                  <div className="text-sm font-bold text-white mt-1">
                    2.0% + 2.0% Rate
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Base Cap: ₱10,000 | ₱200 EE / ₱200 ER
                  </div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
                  <div className="text-xs font-semibold text-purple-400">
                    BIR TRAIN Law Tax
                  </div>
                  <div className="text-sm font-bold text-white mt-1">
                    Graduated Rates (0-35%)
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    ₱0 tax under ₱10,417 / semi-monthly
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: EMPLOYEES DIRECTORY */}
        {/* ========================================================================= */}
        {activeTab === "employees" && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Employee Master Directory
                </h2>
                <p className="text-xs text-slate-400">
                  Manage compensation structures, bank accounts, and statutory
                  numbers
                </p>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="Search employee by name, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs px-3.5 py-2 rounded-xl text-slate-200 focus:outline-none focus:border-blue-500 w-full md:w-64"
                />
                <Button
                  size="sm"
                  onClick={() => setIsAddEmployeeOpen(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white shrink-0"
                >
                  <Plus className="size-3.5 mr-1" /> Add Employee
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Employee</th>
                    <th className="py-3.5 px-4">Department & Role</th>
                    <th className="py-3.5 px-4">Monthly Basic Rate</th>
                    <th className="py-3.5 px-4">Tax Status</th>
                    <th className="py-3.5 px-4">SIL Balance</th>
                    <th className="py-3.5 px-4">Active Loan</th>
                    <th className="py-3.5 px-4">Disbursement Bank</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {employees
                    .filter(
                      (e) =>
                        e.name
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase()) ||
                        e.employeeNo
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase()),
                    )
                    .map((emp) => (
                      <tr
                        key={emp.id}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium text-white">
                          <div>{emp.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {emp.employeeNo}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div>{emp.role}</div>
                          <div className="text-[11px] text-slate-500">
                            {emp.department}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-emerald-400">
                          {formatPHP(emp.monthlyBasicRateCents)}
                        </td>
                        <td className="py-3 px-4">
                          {emp.isMinimumWageEarner ? (
                            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-medium">
                              Minimum Wage (Tax Exempt)
                            </span>
                          ) : (
                            <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-medium">
                              TRAIN Graduated
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span className="text-purple-400 font-semibold">
                            {emp.silBalanceDays.toFixed(1)} Days
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {emp.activeLoanCents > 0n ? (
                            <span className="text-amber-400 font-medium">
                              {formatPHP(emp.activeLoanCents)} Bal
                            </span>
                          ) : (
                            <span className="text-slate-500">None</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-200">
                            {emp.bankName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {emp.bankAccount}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => {
                                setLoanForm({
                                  ...loanForm,
                                  employeeId: emp.id,
                                });
                                setIsLoanModalOpen(true);
                              }}
                              className="border-slate-700 hover:bg-slate-800 text-xs"
                            >
                              Add Loan
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => {
                                setSelectedFinalPayEmpId(emp.id);
                                setIsFinalPayModalOpen(true);
                              }}
                              className="border-rose-900/60 text-rose-400 hover:bg-rose-950/40 text-xs"
                            >
                              Final Pay
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: DAILY TIME RECORDS (DTR) */}
        {/* ========================================================================= */}
        {activeTab === "timekeeping" && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Daily Time Records & Attendance Logs
                </h2>
                <p className="text-xs text-slate-400">
                  Biometric clock punches, tardiness, overtime, and night shift
                  differentials
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsBiometricsModalOpen(true)}
                  className="border-slate-700 hover:bg-slate-800 text-xs text-blue-400"
                >
                  <FileSpreadsheet className="size-3.5 mr-1.5" /> Import
                  Biometrics CSV
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsDtrModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  <Plus className="size-3.5 mr-1" /> Record / Adjust Attendance
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Employee</th>
                    <th className="py-3.5 px-4">Regular Hours</th>
                    <th className="py-3.5 px-4">Tardiness / Lates</th>
                    <th className="py-3.5 px-4">Overtime Hours</th>
                    <th className="py-3.5 px-4">Night Diff (10PM-6AM)</th>
                    <th className="py-3.5 px-4 text-right">Approval Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {employees.map((emp) => (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-white">
                        <div>{emp.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {emp.employeeNo}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {emp.attendance.regularHoursWorked} hrs
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {emp.attendance.tardinessMinutes > 0 ? (
                          <span className="text-rose-400 font-semibold">
                            {emp.attendance.tardinessMinutes} mins
                          </span>
                        ) : (
                          <span className="text-slate-500">0 mins</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {emp.attendance.regularOvertimeHours > 0 ? (
                          <span className="text-emerald-400 font-semibold">
                            +{emp.attendance.regularOvertimeHours} hrs (125%)
                          </span>
                        ) : (
                          <span className="text-slate-500">0 hrs</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {emp.attendance.regularNightDiffHours > 0 ? (
                          <span className="text-purple-400 font-semibold">
                            +{emp.attendance.regularNightDiffHours} hrs (+10%)
                          </span>
                        ) : (
                          <span className="text-slate-500">0 hrs</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[10px] font-medium">
                          Approved
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: LEAVES & SIL MONETIZATION */}
        {/* ========================================================================= */}
        {activeTab === "leaves-sil" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="text-xs font-semibold text-purple-400 flex items-center justify-between">
                  <span>Mandatory SIL (DOLE Art. 95)</span>
                  <CalendarDays className="size-4" />
                </div>
                <div className="text-xl font-bold text-white mt-1">
                  5 Days / Year
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Legally convertible to cash at year-end
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="text-xs font-semibold text-blue-400 flex items-center justify-between">
                  <span>Vacation Leave (VL)</span>
                  <Calendar className="size-4" />
                </div>
                <div className="text-xl font-bold text-white mt-1">
                  10 Days / Year
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Company-provided paid annual leave
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="text-xs font-semibold text-emerald-400 flex items-center justify-between">
                  <span>Sick Leave (SL)</span>
                  <ShieldCheck className="size-4" />
                </div>
                <div className="text-xl font-bold text-white mt-1">
                  5 Days / Year
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Medical recuperation & doctor certificate
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="text-xs font-semibold text-amber-400 flex items-center justify-between">
                  <span>BIR De Minimis Exemption</span>
                  <Coins className="size-4" />
                </div>
                <div className="text-xl font-bold text-white mt-1">
                  Max 12 Days
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  100% Tax-Exempt leave cash conversion
                </p>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Leave Requests & Statutory Absence Ledger
                  </h2>
                  <p className="text-xs text-slate-400">
                    Track approved paid leaves, unpaid leave (LWOP), and SIL
                    credits
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsSilModalOpen(true)}
                    className="border-slate-700 hover:bg-slate-800 text-xs text-amber-400"
                  >
                    <Coins className="size-3.5 mr-1.5" /> Monetize Unused SIL to
                    Cash
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setIsLeaveModalOpen(true)}
                    className="bg-purple-600 hover:bg-purple-500 text-white"
                  >
                    <Plus className="size-3.5 mr-1" /> File Leave Request
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Employee</th>
                      <th className="py-3.5 px-4">Leave Type</th>
                      <th className="py-3.5 px-4">Inclusive Dates</th>
                      <th className="py-3.5 px-4">Duration</th>
                      <th className="py-3.5 px-4">Pay Status</th>
                      <th className="py-3.5 px-4">Reason</th>
                      <th className="py-3.5 px-4 text-right">
                        Approval Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {leaveRequests.map((req) => (
                      <tr
                        key={req.id}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium text-white">
                          {req.employeeName}
                        </td>
                        <td className="py-3 px-4 font-semibold text-purple-400">
                          {req.leaveType}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {req.startDate} to {req.endDate}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-white">
                          {req.daysCount} Day(s)
                        </td>
                        <td className="py-3 px-4">
                          {req.isPaid ? (
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-medium">
                              Paid Leave
                            </span>
                          ) : (
                            <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded text-[10px] font-medium">
                              Unpaid (LWOP)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {req.reason}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[10px] font-medium">
                            {req.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: PAYROLL RUN WIZARD */}
        {/* ========================================================================= */}
        {activeTab === "payroll-wizard" && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-medium uppercase">
                  Active Cutoff
                </span>
                <h2 className="text-lg font-bold text-white mt-1">
                  {selectedCutoff === "FIRST_CUTOFF"
                    ? "1st Cutoff (Aug 1 - 15, 2026)"
                    : "2nd Cutoff (Aug 16 - 31, 2026)"}
                </h2>
                <p className="text-xs text-slate-400">
                  Statutory Deductions (SSS, PhilHealth, Pag-IBIG) & TRAIN Law
                  Withholding Taxes will be applied.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => {
                    setPayrollStatus("RUNNING");
                    setTimeout(() => {
                      setPayrollStatus("COMPLETED");
                      showToast(
                        "🎉 Payroll Run Finalized and ready for Bank Disbursement!",
                      );
                    }, 800);
                  }}
                  disabled={payrollStatus === "RUNNING"}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  <Play className="size-3.5 mr-1.5" />
                  {payrollStatus === "RUNNING"
                    ? "Computing Engine..."
                    : "Finalize & Disburse Run"}
                </Button>
              </div>
            </div>

            {payrollStatus === "COMPLETED" && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between text-emerald-400 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>
                    Payroll run finalized successfully! Payslips generated and
                    ready for disbursement.
                  </span>
                </div>
                <Button
                  size="xs"
                  onClick={() => setActiveTab("compliance")}
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-300"
                >
                  View Bank Transmittal Files
                </Button>
              </div>
            )}

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-3">Employee</th>
                      <th className="py-3 px-3">Basic Pay</th>
                      <th className="py-3 px-3">Overtime / Premiums</th>
                      <th className="py-3 px-3">De Minimis & SIL</th>
                      <th className="py-3 px-3">Gross Pay</th>
                      <th className="py-3 px-3">SSS & WISP</th>
                      <th className="py-3 px-3">PhilHealth</th>
                      <th className="py-3 px-3">Pag-IBIG</th>
                      <th className="py-3 px-3">Withholding Tax</th>
                      <th className="py-3 px-3">Net Take-Home</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {computedPayrollResults.map(({ employee, calc }) => (
                      <tr
                        key={employee.id}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-3 font-medium text-white">
                          {employee.name}
                          <div className="text-[10px] text-slate-500 font-mono">
                            {employee.employeeNo}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono">
                          {formatPHP(calc.basicPayForPeriodCents)}
                        </td>
                        <td className="py-3 px-3 font-mono text-emerald-400">
                          {calc.totalPremiumPayCents > 0n
                            ? `+${formatPHP(calc.totalPremiumPayCents)}`
                            : "₱0.00"}
                        </td>
                        <td className="py-3 px-3 font-mono text-purple-400">
                          {calc.nonTaxableAllowancesCents > 0n
                            ? `+${formatPHP(calc.nonTaxableAllowancesCents)}`
                            : "₱0.00"}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-white">
                          {formatPHP(calc.grossPayCents)}
                        </td>
                        <td className="py-3 px-3 font-mono text-amber-400">
                          {calc.sssContribution.employeeShareCents > 0n
                            ? `-${formatPHP(calc.sssContribution.employeeShareCents)}`
                            : "₱0.00"}
                        </td>
                        <td className="py-3 px-3 font-mono text-amber-400">
                          {calc.philhealthContribution.employeeShareCents > 0n
                            ? `-${formatPHP(calc.philhealthContribution.employeeShareCents)}`
                            : "₱0.00"}
                        </td>
                        <td className="py-3 px-3 font-mono text-amber-400">
                          {calc.pagibigContribution.employeeShareCents > 0n
                            ? `-${formatPHP(calc.pagibigContribution.employeeShareCents)}`
                            : "₱0.00"}
                        </td>
                        <td className="py-3 px-3 font-mono text-rose-400">
                          {calc.withholdingTaxCents > 0n
                            ? `-${formatPHP(calc.withholdingTaxCents)}`
                            : "₱0.00"}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-blue-400 bg-blue-500/5">
                          {formatPHP(calc.netPayCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: GOVERNMENT & BANKING EXPORTS */}
        {/* ========================================================================= */}
        {activeTab === "compliance" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <CreditCard className="size-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Bank Batch Transmittals
                  </h3>
                  <p className="text-xs text-slate-400">
                    Export pre-formatted direct deposit transmittal files
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                {[
                  {
                    name: "BDO Electronic Payroll (.csv)",
                    bank: "BDO",
                    total: formatPHP(totalNetCents),
                  },
                  {
                    name: "BPI ExpressLink / BizLink (.csv)",
                    bank: "BPI",
                    total: formatPHP(totalNetCents),
                  },
                  {
                    name: "UnionBank The Portal (.csv)",
                    bank: "UnionBank",
                    total: formatPHP(totalNetCents),
                  },
                  {
                    name: "Metrobank Direct Export (.csv)",
                    bank: "Metrobank",
                    total: formatPHP(totalNetCents),
                  },
                ].map((b) => (
                  <div
                    key={b.name}
                    className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs"
                  >
                    <div>
                      <div className="font-medium text-white">{b.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {employees.length} Records • Total {b.total}
                      </div>
                    </div>
                    <Button
                      size="xs"
                      onClick={() => exportBankTransmittal(b.bank)}
                      variant="outline"
                      className="border-slate-700 hover:bg-slate-800 text-xs text-blue-400"
                    >
                      <Download className="size-3 mr-1" /> Download
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <FileCheck2 className="size-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Philippine Regulatory Returns
                  </h3>
                  <p className="text-xs text-slate-400">
                    Generate official BIR, SSS, PhilHealth & Pag-IBIG files
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                {[
                  {
                    name: "BIR Form 1601-C Summary",
                    desc: "Monthly Remittance Return of Income Taxes",
                    action: () => exportBir1601C(),
                  },
                  {
                    name: "Demo tax reconciliation (individual)",
                    desc: "Illustrative annual totals only — not BIR Form 2316",
                    action: () => setIsBir2316ModalOpen(true),
                  },
                  {
                    name: "Demo annual tax summary (batch)",
                    desc: "Illustrative data only — not a BIR certificate",
                    action: () => {
                      const text = [
                        "DEMO ANNUAL TAX SUMMARY - NOT BIR FORM 2316 - DO NOT FILE",
                        `Employer: Acme Philippines Technologies Inc. (TIN: 123-456-789-000)`,
                        "----------------------------------------------------------------",
                        ...computedPayrollResults.map(
                          (r) =>
                            `Employee: ${r.employee.name} | TIN: ${r.employee.tin} | Gross Annualized: ${formatPHP(r.employee.monthlyBasicRateCents * 12n)} | Tax Status: ${r.employee.isMinimumWageEarner ? "MWE (EXEMPT)" : "GRADUATED"}`,
                        ),
                      ].join("\r\n");
                      downloadFile(
                        "DEMO_Annual_Tax_Summary.txt",
                        text,
                        "text/plain;charset=utf-8;",
                      );
                      showToast("Downloaded demo-only tax summary");
                    },
                  },
                  {
                    name: "SSS R-3 Transmittal Summary",
                    desc: "Monthly SSS Contribution Collection List",
                    action: () => {
                      const text = [
                        "SSS R-3 MONTHLY COLLECTION LIST",
                        "Employer SSS: 03-9876543-2 | Acme Philippines Technologies Inc.",
                        "SS_Number,Employee_Name,EE_Share,ER_Share,EC_Share,Total",
                        ...computedPayrollResults.map(
                          (r) =>
                            `"${r.employee.sssNo}","${r.employee.name}",${(Number(r.calc.sssContribution.employeeShareCents) / 100).toFixed(2)},${(Number(r.calc.sssContribution.employerShareCents) / 100).toFixed(2)},30.00,${(Number(r.calc.sssContribution.totalCents) / 100).toFixed(2)}`,
                        ),
                      ].join("\r\n");
                      downloadFile("SSS_R3_Monthly_Collection.csv", text);
                      showToast("📥 Exported SSS R-3 Collection Schedule!");
                    },
                  },
                  {
                    name: "DOLE 13th Month Pay Report (PD 851)",
                    desc: "Mandatory Annual Compliance Report for DOLE BWC / ERS",
                    action: () => setIs13thMonthModalOpen(true),
                  },
                ].map((g) => (
                  <div
                    key={g.name}
                    className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs"
                  >
                    <div>
                      <div className="font-medium text-white">{g.name}</div>
                      <div className="text-[11px] text-slate-500">{g.desc}</div>
                    </div>
                    <Button
                      size="xs"
                      onClick={g.action}
                      variant="outline"
                      className="border-slate-700 hover:bg-slate-800 text-xs text-purple-400"
                    >
                      <Download className="size-3 mr-1" /> Generate
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 7: EMPLOYEE SELF-SERVICE (ESS) */}
        {/* ========================================================================= */}
        {activeTab === "ess-portal" && (
          <div className="max-w-2xl mx-auto bg-slate-900/90 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-medium">
                  Employee Self-Service (ESS)
                </span>
                <h3 className="text-lg font-bold text-white mt-1">
                  Digital Payslip Preview
                </h3>
                <p className="text-xs text-slate-400">
                  Pay Period: Aug 16 – 31, 2026
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl font-mono">
                <Lock className="size-3 text-amber-400" /> Password: DOB
                (MMDDYYYY)
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <div>
                <div className="text-slate-500 text-[10px] uppercase">
                  Employee Name
                </div>
                <div className="font-semibold text-white">Juan Dela Cruz</div>
                <div className="text-slate-500 font-mono text-[11px]">
                  EMP-2026-001
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase">
                  Department / Position
                </div>
                <div className="font-semibold text-white">
                  Software Engineering
                </div>
                <div className="text-slate-400 text-[11px]">
                  Senior Full-Stack Engineer
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                  Earnings
                </h4>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">
                    Basic Pay (Semi-Monthly)
                  </span>
                  <span className="font-mono text-white font-medium">
                    ₱32,500.00
                  </span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">
                    Regular Overtime (4 hrs)
                  </span>
                  <span className="font-mono text-emerald-400 font-medium">
                    +₱1,556.52
                  </span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">
                    Rice Subsidy (De Minimis)
                  </span>
                  <span className="font-mono text-emerald-400 font-medium">
                    +₱1,000.00
                  </span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-slate-800 font-bold">
                  <span className="text-white">Gross Pay</span>
                  <span className="font-mono text-white">₱35,056.52</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                  Deductions
                </h4>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">Tardiness (15 mins)</span>
                  <span className="font-mono text-rose-400">-₱97.28</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">
                    SSS Contribution & WISP
                  </span>
                  <span className="font-mono text-amber-400">-₱1,750.00</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">PhilHealth (2.5%)</span>
                  <span className="font-mono text-amber-400">-₱1,625.00</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">Pag-IBIG Fund</span>
                  <span className="font-mono text-amber-400">-₱200.00</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">SSS Salary Loan</span>
                  <span className="font-mono text-slate-300">-₱500.00</span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-slate-800 font-bold">
                  <span className="text-white">Total Deductions</span>
                  <span className="font-mono text-rose-400">-₱4,172.28</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-blue-400 uppercase font-bold">
                  Net Take-Home Pay
                </span>
                <div className="text-2xl font-black text-white font-mono">
                  ₱30,884.24
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedBir2316EmpId(
                      (employees[0] ?? INITIAL_EMPLOYEES[0]).id,
                    );
                    setIsBir2316ModalOpen(true);
                  }}
                  className="border-purple-500/30 text-purple-300 hover:bg-purple-950/40 text-xs"
                >
                  <FileText className="size-3.5 mr-1.5 text-purple-400" /> View
                  BIR Form 2316
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const content = [
                      "===========================================================",
                      "            ACME PHILIPPINES TECHNOLOGIES INC.            ",
                      "                OFFICIAL DIGITAL PAYSLIP                  ",
                      "===========================================================",
                      "Employee: Juan Dela Cruz (EMP-2026-001)",
                      "Department: Software Engineering",
                      "Pay Period: Aug 16 - 31, 2026",
                      "PIN Security: Password Encrypted",
                      "-----------------------------------------------------------",
                      "EARNINGS:",
                      "  Basic Pay: PHP 32,500.00",
                      "  Overtime (4 hrs): PHP 1,556.52",
                      "  De Minimis (Rice): PHP 1,000.00",
                      "  GROSS PAY: PHP 35,056.52",
                      "-----------------------------------------------------------",
                      "DEDUCTIONS:",
                      "  Tardiness (15m): PHP 97.28",
                      "  SSS & WISP: PHP 1,750.00",
                      "  PhilHealth: PHP 1,625.00",
                      "  Pag-IBIG: PHP 200.00",
                      "  SSS Salary Loan: PHP 500.00",
                      "  TOTAL DEDUCTIONS: PHP 4,172.28",
                      "-----------------------------------------------------------",
                      "NET TAKE-HOME PAY: PHP 30,884.24",
                      "===========================================================",
                    ].join("\r\n");
                    downloadFile(
                      "Payslip_Juan_Dela_Cruz_Aug2026.txt",
                      content,
                      "text/plain;charset=utf-8;",
                    );
                    showToast("📥 Exported Official Payslip (Protected)!");
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  <Download className="size-3.5 mr-1.5" /> Download Payslip
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD EMPLOYEE MODAL */}
      {/* ========================================================================= */}
      {isAddEmployeeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="size-4 text-blue-400" /> Add New Employee
              </h3>
              <button
                type="button"
                onClick={() => setIsAddEmployeeOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleAddEmployee} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="employee-first-name"
                    className="text-slate-400 block mb-1"
                  >
                    First Name
                  </label>
                  <input
                    id="employee-first-name"
                    type="text"
                    required
                    placeholder="e.g. Maria"
                    value={empForm.firstName}
                    onChange={(e) =>
                      setEmpForm({ ...empForm, firstName: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="employee-last-name"
                    className="text-slate-400 block mb-1"
                  >
                    Last Name
                  </label>
                  <input
                    id="employee-last-name"
                    type="text"
                    required
                    placeholder="e.g. Clara"
                    value={empForm.lastName}
                    onChange={(e) =>
                      setEmpForm({ ...empForm, lastName: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="employee-department"
                    className="text-slate-400 block mb-1"
                  >
                    Department
                  </label>
                  <select
                    id="employee-department"
                    value={empForm.department}
                    onChange={(e) =>
                      setEmpForm({ ...empForm, department: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Software Engineering">
                      Software Engineering
                    </option>
                    <option value="Product & Design">Product & Design</option>
                    <option value="Operations & Logistics">
                      Operations & Logistics
                    </option>
                    <option value="Finance & Accounting">
                      Finance & Accounting
                    </option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="employee-role"
                    className="text-slate-400 block mb-1"
                  >
                    Role / Title
                  </label>
                  <input
                    id="employee-role"
                    type="text"
                    placeholder="e.g. QA Engineer"
                    value={empForm.role}
                    onChange={(e) =>
                      setEmpForm({ ...empForm, role: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="employee-monthly-rate"
                    className="text-slate-400 block mb-1"
                  >
                    Monthly Basic Rate (PHP)
                  </label>
                  <input
                    id="employee-monthly-rate"
                    type="number"
                    required
                    min={10000}
                    step={500}
                    value={empForm.monthlySalaryPesos}
                    onChange={(e) =>
                      setEmpForm({
                        ...empForm,
                        monthlySalaryPesos: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="isMwe"
                    checked={empForm.isMinimumWage}
                    onChange={(e) =>
                      setEmpForm({
                        ...empForm,
                        isMinimumWage: e.target.checked,
                      })
                    }
                    className="size-4 rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-0"
                  />
                  <label
                    htmlFor="isMwe"
                    className="text-slate-300 select-none cursor-pointer"
                  >
                    Minimum Wage Earner (Tax Exempt)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="employee-bank"
                    className="text-slate-400 block mb-1"
                  >
                    Disbursement Bank
                  </label>
                  <select
                    id="employee-bank"
                    value={empForm.bankName}
                    onChange={(e) =>
                      setEmpForm({ ...empForm, bankName: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="BDO Unibank">BDO Unibank</option>
                    <option value="BPI">BPI</option>
                    <option value="UnionBank">UnionBank</option>
                    <option value="Metrobank">Metrobank</option>
                    <option value="Security Bank">Security Bank</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="employee-bank-account"
                    className="text-slate-400 block mb-1"
                  >
                    Bank Account Number
                  </label>
                  <input
                    id="employee-bank-account"
                    type="text"
                    placeholder="e.g. 001234567890"
                    value={empForm.bankAccount}
                    onChange={(e) =>
                      setEmpForm({ ...empForm, bankAccount: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddEmployeeOpen(false)}
                  className="border-slate-800 hover:bg-slate-800 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  Register Employee
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DTR / ATTENDANCE ADJUSTMENT MODAL */}
      {/* ========================================================================= */}
      {isDtrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="size-4 text-emerald-400" /> Attendance
                Adjustment
              </h3>
              <button
                type="button"
                onClick={() => setIsDtrModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAttendance} className="space-y-4 text-xs">
              <div>
                <label
                  htmlFor="attendance-employee"
                  className="text-slate-400 block mb-1"
                >
                  Select Employee
                </label>
                <select
                  id="attendance-employee"
                  value={dtrForm.employeeId}
                  onChange={(e) =>
                    setDtrForm({ ...dtrForm, employeeId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeNo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="attendance-tardiness"
                    className="text-slate-400 block mb-1"
                  >
                    Tardiness (Mins)
                  </label>
                  <input
                    id="attendance-tardiness"
                    type="number"
                    min={0}
                    value={dtrForm.tardinessMinutes}
                    onChange={(e) =>
                      setDtrForm({
                        ...dtrForm,
                        tardinessMinutes: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="attendance-overtime"
                    className="text-slate-400 block mb-1"
                  >
                    Overtime (Hrs)
                  </label>
                  <input
                    id="attendance-overtime"
                    type="number"
                    min={0}
                    step={0.5}
                    value={dtrForm.regularOvertimeHours}
                    onChange={(e) =>
                      setDtrForm({
                        ...dtrForm,
                        regularOvertimeHours: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="attendance-night-diff"
                    className="text-slate-400 block mb-1"
                  >
                    Night Diff (Hrs)
                  </label>
                  <input
                    id="attendance-night-diff"
                    type="number"
                    min={0}
                    step={0.5}
                    value={dtrForm.regularNightDiffHours}
                    onChange={(e) =>
                      setDtrForm({
                        ...dtrForm,
                        regularNightDiffHours: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDtrModalOpen(false)}
                  className="border-slate-800 hover:bg-slate-800 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Save Adjustments
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: APPLY / RECORD LOAN MODAL */}
      {/* ========================================================================= */}
      {isLoanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Banknote className="size-4 text-amber-400" /> Apply / File Loan
                Deduction
              </h3>
              <button
                type="button"
                onClick={() => setIsLoanModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLoan} className="space-y-4 text-xs">
              <div>
                <label
                  htmlFor="loan-employee"
                  className="text-slate-400 block mb-1"
                >
                  Select Employee
                </label>
                <select
                  id="loan-employee"
                  value={loanForm.employeeId}
                  onChange={(e) =>
                    setLoanForm({ ...loanForm, employeeId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeNo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="loan-facility"
                  className="text-slate-400 block mb-1"
                >
                  Loan Facility
                </label>
                <select
                  id="loan-facility"
                  value={loanForm.loanType}
                  onChange={(e) =>
                    setLoanForm({ ...loanForm, loanType: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="SSS Salary Loan">SSS Salary Loan</option>
                  <option value="SSS Calamity Loan">SSS Calamity Loan</option>
                  <option value="Pag-IBIG Multi-Purpose">
                    Pag-IBIG Multi-Purpose Loan
                  </option>
                  <option value="Company Emergency Advance">
                    Company Emergency Advance
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="loan-principal"
                    className="text-slate-400 block mb-1"
                  >
                    Total Principal (PHP)
                  </label>
                  <input
                    id="loan-principal"
                    type="number"
                    min={1000}
                    step={500}
                    value={loanForm.principalPesos}
                    onChange={(e) =>
                      setLoanForm({
                        ...loanForm,
                        principalPesos: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="loan-cutoff-deduction"
                    className="text-slate-400 block mb-1"
                  >
                    Cutoff Deduction (PHP)
                  </label>
                  <input
                    id="loan-cutoff-deduction"
                    type="number"
                    min={100}
                    step={50}
                    value={loanForm.amortizationPesos}
                    onChange={(e) =>
                      setLoanForm({
                        ...loanForm,
                        amortizationPesos: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLoanModalOpen(false)}
                  className="border-slate-800 hover:bg-slate-800 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-500 text-white"
                >
                  Record Loan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: BIOMETRICS CSV IMPORT & PREVIEW MODAL */}
      {/* ========================================================================= */}
      {isBiometricsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UploadCloud className="size-4 text-blue-400" /> Biometric
                  Time Clock Ingestion
                </h3>
                <p className="text-[11px] text-slate-400">
                  Parse ZKTeco, Granding, or facial biometric logs with
                  automatic DOLE overtime & late computation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBiometricsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="biometrics-csv"
                  className="text-slate-300 font-medium"
                >
                  Paste Biometric Punch CSV Log:
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setBiometricsCsv(`Employee_ID,Timestamp,Punch_Type
EMP-2026-001,2026-08-25 09:18:00,CHECK_IN
EMP-2026-001,2026-08-25 20:30:00,CHECK_OUT
EMP-2026-002,2026-08-25 08:50:00,CHECK_IN
EMP-2026-002,2026-08-25 18:05:00,CHECK_OUT
EMP-2026-003,2026-08-25 09:00:00,CHECK_IN
EMP-2026-003,2026-08-25 23:00:00,CHECK_OUT`)
                  }
                  className="text-blue-400 hover:underline text-[11px]"
                >
                  Load Sample ZKTeco Log
                </button>
              </div>

              <textarea
                id="biometrics-csv"
                rows={5}
                value={biometricsCsv}
                onChange={(e) => setBiometricsCsv(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
              />

              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-950 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                  <span>
                    Parsed Punch Preview ({parsedBiometricDays.length} Days
                    Detected)
                  </span>
                  <span>DOLE Compliance Evaluated</span>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-800/60 text-[11px]">
                  {parsedBiometricDays.map((day) => (
                    <div
                      key={`${day.employeeNumber}-${day.dateStr}`}
                      className="p-2.5 flex items-center justify-between hover:bg-slate-800/30"
                    >
                      <div>
                        <span className="font-semibold text-white font-mono">
                          {day.employeeNumber}
                        </span>
                        <span className="text-slate-500 ml-2">
                          {day.dateStr}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          In:{" "}
                          {day.timeIn
                            ? day.timeIn.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "N/A"}{" "}
                          • Out:{" "}
                          {day.timeOut
                            ? day.timeOut.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "N/A"}
                        </div>
                      </div>
                      <div className="text-right">
                        {day.tardinessMinutes > 0 && (
                          <span className="text-rose-400 font-mono block text-[10px]">
                            {day.tardinessMinutes}m Late
                          </span>
                        )}
                        {day.overtimeMinutes > 0 && (
                          <span className="text-emerald-400 font-mono block text-[10px]">
                            +{(day.overtimeMinutes / 60).toFixed(1)}h OT
                          </span>
                        )}
                        {day.nightDiffMinutes > 0 && (
                          <span className="text-purple-400 font-mono block text-[10px]">
                            +{(day.nightDiffMinutes / 60).toFixed(1)}h NSD
                          </span>
                        )}
                        {day.tardinessMinutes === 0 &&
                          day.overtimeMinutes === 0 && (
                            <span className="text-emerald-400 text-[10px]">
                              Standard 8h Shift
                            </span>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsBiometricsModalOpen(false)}
                  className="border-slate-800 hover:bg-slate-800 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyBiometrics}
                  disabled={parsedBiometricDays.length === 0}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  Apply & Ingest to DTR
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: FILE LEAVE REQUEST MODAL */}
      {/* ========================================================================= */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CalendarDays className="size-4 text-purple-400" /> File Leave
                Request
              </h3>
              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveLeaveRequest}
              className="space-y-4 text-xs"
            >
              <div>
                <label
                  htmlFor="leave-employee"
                  className="text-slate-400 block mb-1"
                >
                  Select Employee
                </label>
                <select
                  id="leave-employee"
                  value={leaveForm.employeeId}
                  onChange={(e) =>
                    setLeaveForm({ ...leaveForm, employeeId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (SIL: {emp.silBalanceDays}d remaining)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="leave-classification"
                  className="text-slate-400 block mb-1"
                >
                  Leave Classification
                </label>
                <select
                  id="leave-classification"
                  value={leaveForm.leaveType}
                  onChange={(e) =>
                    setLeaveForm({ ...leaveForm, leaveType: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Service Incentive Leave (SIL)">
                    Service Incentive Leave (SIL - Art. 95)
                  </option>
                  <option value="Vacation Leave">Vacation Leave (VL)</option>
                  <option value="Sick Leave">Sick Leave (SL)</option>
                  <option value="Maternity Leave">
                    Maternity Leave (RA 11210 - 105 Days)
                  </option>
                  <option value="Paternity Leave">
                    Paternity Leave (RA 8187 - 7 Days)
                  </option>
                  <option value="Solo Parent Leave">
                    Solo Parent Leave (RA 8972 - 7 Days)
                  </option>
                  <option value="Emergency Leave">
                    Emergency / Compassionate Leave
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="leave-start-date"
                    className="text-slate-400 block mb-1"
                  >
                    Start Date
                  </label>
                  <input
                    id="leave-start-date"
                    type="date"
                    value={leaveForm.startDate}
                    onChange={(e) =>
                      setLeaveForm({ ...leaveForm, startDate: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="leave-end-date"
                    className="text-slate-400 block mb-1"
                  >
                    End Date
                  </label>
                  <input
                    id="leave-end-date"
                    type="date"
                    value={leaveForm.endDate}
                    onChange={(e) =>
                      setLeaveForm({ ...leaveForm, endDate: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="leave-days"
                    className="text-slate-400 block mb-1"
                  >
                    Days Count
                  </label>
                  <input
                    id="leave-days"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={leaveForm.daysCount}
                    onChange={(e) =>
                      setLeaveForm({
                        ...leaveForm,
                        daysCount: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="isPaidLeave"
                    checked={leaveForm.isPaid}
                    onChange={(e) =>
                      setLeaveForm({ ...leaveForm, isPaid: e.target.checked })
                    }
                    className="size-4 rounded border-slate-800 bg-slate-950 text-purple-600 focus:ring-0"
                  />
                  <label
                    htmlFor="isPaidLeave"
                    className="text-slate-300 select-none cursor-pointer"
                  >
                    Paid Leave Credit
                  </label>
                </div>
              </div>

              <div>
                <label
                  htmlFor="leave-reason"
                  className="text-slate-400 block mb-1"
                >
                  Reason / Notes
                </label>
                <input
                  id="leave-reason"
                  type="text"
                  placeholder="e.g. Annual leave with family"
                  value={leaveForm.reason}
                  onChange={(e) =>
                    setLeaveForm({ ...leaveForm, reason: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="border-slate-800 hover:bg-slate-800 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-500 text-white"
                >
                  Approve & Record Leave
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: SIL CASH MONETIZATION CALCULATOR MODAL */}
      {/* ========================================================================= */}
      {isSilModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Coins className="size-4 text-amber-400" /> DOLE SIL Cash
                  Monetization
                </h3>
                <p className="text-[11px] text-slate-400">
                  Convert unused Service Incentive Leave credits into cash at
                  daily rate (BIR De Minimis exempt)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSilModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label
                  htmlFor="sil-employee"
                  className="text-slate-400 block mb-1"
                >
                  Select Employee
                </label>
                <select
                  id="sil-employee"
                  value={silEmployeeId}
                  onChange={(e) => {
                    setSilEmployeeId(e.target.value);
                    const emp = employees.find(
                      (emp) => emp.id === e.target.value,
                    );
                    if (emp) setSilDaysToMonetize(emp.silBalanceDays);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — Balance: {emp.silBalanceDays.toFixed(1)} Days
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    Derived Daily Rate
                  </span>
                  <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                    {formatPHP(silDailyRateCents)}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Divisor: 261 days/yr
                  </span>
                </div>
                <div>
                  <label
                    htmlFor="sil-days"
                    className="text-slate-400 block mb-1"
                  >
                    Days to Monetize
                  </label>
                  <input
                    id="sil-days"
                    type="number"
                    min={0.5}
                    max={selectedSilEmp.silBalanceDays}
                    step={0.5}
                    value={silDaysToMonetize}
                    onChange={(e) =>
                      setSilDaysToMonetize(Number(e.target.value))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-base focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Max balance: {selectedSilEmp.silBalanceDays} days
                  </span>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Total Cash Payout:</span>
                  <span className="font-bold text-amber-300 font-mono text-sm">
                    {formatPHP(silMonetizationCalc.totalMonetizedCashCents)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Tax-Exempt De Minimis (Up to 12 days):</span>
                  <span className="text-emerald-400 font-mono">
                    {formatPHP(silMonetizationCalc.taxExemptDeMinimisCents)}
                  </span>
                </div>
                {silMonetizationCalc.taxablePortionCents > 0n && (
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Taxable Excess (over 12-day cap):</span>
                    <span className="text-rose-400 font-mono">
                      {formatPHP(silMonetizationCalc.taxablePortionCents)}
                    </span>
                  </div>
                )}
                <div className="text-[10px] text-amber-400/90 pt-1 border-t border-amber-500/20">
                  {silMonetizationCalc.remarks}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSilModalOpen(false)}
                  className="border-slate-800 hover:bg-slate-800 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplySilMonetization}
                  disabled={silDaysToMonetize <= 0}
                  className="bg-amber-600 hover:bg-amber-500 text-white"
                >
                  Credit Cash to Next Payroll Run
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: DOLE FINAL PAY & SEPARATION CLEARANCE SETTLEMENT */}
      {/* ========================================================================= */}
      {isFinalPayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-xl w-full space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserMinus className="size-4 text-rose-400" /> DOLE Final Pay
                  & Separation Clearance
                </h3>
                <p className="text-[11px] text-slate-400">
                  Labor Advisory No. 06-2020 • 30-day statutory release mandate
                  • Art. 298-299
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFinalPayModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label
                  htmlFor="final-pay-employee"
                  className="text-slate-400 block mb-1"
                >
                  Employee for Separation
                </label>
                <select
                  id="final-pay-employee"
                  value={selectedFinalPayEmpId}
                  onChange={(e) => setSelectedFinalPayEmpId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeNo}) — Basic:{" "}
                      {formatPHP(emp.monthlyBasicRateCents)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="final-pay-reason"
                    className="text-slate-400 block mb-1"
                  >
                    Separation Reason / Cause
                  </label>
                  <select
                    id="final-pay-reason"
                    value={finalPayReason}
                    onChange={(e) =>
                      setFinalPayReason(e.target.value as SeparationType)
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value={SeparationType.RESIGNATION}>
                      Voluntary Resignation (No Sep Pay)
                    </option>
                    <option value={SeparationType.REDUNDANCY}>
                      Redundancy (Art. 298: 1 mo/yr)
                    </option>
                    <option value={SeparationType.RETRENCHMENT}>
                      Retrenchment / Losses (Art. 298: 0.5 mo/yr)
                    </option>
                    <option value={SeparationType.CLOSURE_NON_BANKRUPT}>
                      Closure of Business (0.5 mo/yr)
                    </option>
                    <option value={SeparationType.DISEASE}>
                      Disease / Health (Art. 299: 0.5 mo/yr)
                    </option>
                    <option value={SeparationType.RETIREMENT}>
                      Retirement (RA 7641: 22.5 days/yr)
                    </option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="final-pay-tenure"
                    className="text-slate-400 block mb-1"
                  >
                    Tenure / Years of Service
                  </label>
                  <input
                    id="final-pay-tenure"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={finalPayYearsOfService}
                    onChange={(e) =>
                      setFinalPayYearsOfService(Number(e.target.value))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500">
                    $\ge 6$ mos counted as 1 yr per DOLE
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="final-pay-unpaid-days"
                    className="text-slate-400 block mb-1"
                  >
                    Unpaid Days Worked (Exit Cutoff)
                  </label>
                  <input
                    id="final-pay-unpaid-days"
                    type="number"
                    min={0}
                    step={0.5}
                    value={finalPayUnpaidDays}
                    onChange={(e) =>
                      setFinalPayUnpaidDays(Number(e.target.value))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500">
                    Rate: {formatPHP(finalPayDailyRateCents)}/day
                  </span>
                </div>
                <div>
                  <label
                    htmlFor="final-pay-unused-leave"
                    className="text-slate-400 block mb-1"
                  >
                    Unused Leave Credits (SIL / VL)
                  </label>
                  <input
                    id="final-pay-unused-leave"
                    type="number"
                    min={0}
                    step={0.5}
                    value={finalPayUnusedLeaves}
                    onChange={(e) =>
                      setFinalPayUnusedLeaves(Number(e.target.value))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500">
                    Up to 10d tax-exempt (BIR)
                  </span>
                </div>
              </div>

              {/* Settlement Engine Breakdown Card */}
              <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-2.5">
                <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-1.5 flex justify-between items-center">
                  <span>DOLE Itemized Final Settlement</span>
                  <span className="text-blue-400 font-mono text-[10px]">
                    30-Day Clearance
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">
                    1. Unpaid Salary ({finalPayUnpaidDays} days):
                  </span>
                  <span className="font-mono text-white">
                    {formatPHP(finalPayResult.unpaidSalaryCents)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">
                    2. Pro-rated 13th Month Pay (Tax-Exempt):
                  </span>
                  <span className="font-mono text-emerald-400">
                    +{formatPHP(finalPayResult.proratedThirteenthMonthCents)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">
                    3. Monetized Unused Leaves ({finalPayUnusedLeaves} days):
                  </span>
                  <span className="font-mono text-purple-400">
                    +{formatPHP(finalPayResult.monetizedLeaveCents)}
                  </span>
                </div>

                {finalPayResult.separationPayCents > 0n && (
                  <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-xl">
                    <div>
                      <span className="text-emerald-300 font-medium">
                        4. Statutory Separation Pay:
                      </span>
                      <div className="text-[10px] text-emerald-400/80">
                        {finalPayReason} ({finalPayYearsOfService} yrs) • 100%
                        Tax-Exempt
                      </div>
                    </div>
                    <span className="font-mono font-bold text-emerald-300 text-sm">
                      +{formatPHP(finalPayResult.separationPayCents)}
                    </span>
                  </div>
                )}

                {finalPayResult.taxAdjustmentCents !== 0n && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      5. BIR 2316 Tax Annualization:
                    </span>
                    <span
                      className={`font-mono ${finalPayResult.taxAdjustmentCents < 0n ? "text-emerald-400" : "text-rose-400"}`}
                    >
                      {finalPayResult.taxAdjustmentCents < 0n
                        ? `Refund +${formatPHP(-finalPayResult.taxAdjustmentCents)}`
                        : `Deficiency -${formatPHP(finalPayResult.taxAdjustmentCents)}`}
                    </span>
                  </div>
                )}

                {finalPayResult.outstandingLoanDeductionsCents > 0n && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      6. Company Loan Deductions:
                    </span>
                    <span className="font-mono text-rose-400">
                      -
                      {formatPHP(finalPayResult.outstandingLoanDeductionsCents)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-bold">
                  <span className="text-white">NET FINAL PAY PAYOUT:</span>
                  <span className="text-emerald-400 font-mono text-base">
                    {formatPHP(finalPayResult.netFinalPayCents)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const text = [
                      "===========================================================",
                      "         ACME PHILIPPINES TECHNOLOGIES INC.                ",
                      "       DOLE FINAL PAY & SEPARATION SETTLEMENT              ",
                      "    Compliant with DOLE Labor Advisory No. 06-2020        ",
                      "===========================================================",
                      `Employee Name: ${selectedFinalPayEmp.name}`,
                      `Employee ID: ${selectedFinalPayEmp.employeeNo}`,
                      `TIN: ${selectedFinalPayEmp.tin}`,
                      `Separation Cause: ${finalPayReason}`,
                      `Years of Service: ${finalPayYearsOfService} year(s)`,
                      "-----------------------------------------------------------",
                      "FINAL PAY BREAKDOWN:",
                      `  Unpaid Salary (${finalPayUnpaidDays} days): PHP ${(Number(finalPayResult.unpaidSalaryCents) / 100).toFixed(2)}`,
                      `  Pro-rated 13th Month Pay: PHP ${(Number(finalPayResult.proratedThirteenthMonthCents) / 100).toFixed(2)}`,
                      `  Monetized Leaves (${finalPayUnusedLeaves} days): PHP ${(Number(finalPayResult.monetizedLeaveCents) / 100).toFixed(2)}`,
                      `  Statutory Separation Pay: PHP ${(Number(finalPayResult.separationPayCents) / 100).toFixed(2)}`,
                      `  Tax Annualization Adjustment: PHP ${(Number(-finalPayResult.taxAdjustmentCents) / 100).toFixed(2)}`,
                      `  Less Outstanding Loans: PHP ${(Number(finalPayResult.outstandingLoanDeductionsCents) / 100).toFixed(2)}`,
                      "-----------------------------------------------------------",
                      `NET FINAL SETTLEMENT: PHP ${(Number(finalPayResult.netFinalPayCents) / 100).toFixed(2)}`,
                      "===========================================================",
                      "RELEASE, WAIVER, AND QUITCLAIM:",
                      "I hereby acknowledge receipt of the full and final settlement of all",
                      "monetary claims arising from my employment with the Company.",
                      "",
                      "Employee Signature: _______________________ Date: ____________",
                    ].join("\r\n");
                    downloadFile(
                      `Final_Pay_${selectedFinalPayEmp.name.replace(/\s+/g, "_")}.txt`,
                      text,
                      "text/plain;charset=utf-8;",
                    );
                    showToast(
                      "📥 Exported Official DOLE Final Pay & Quitclaim Document!",
                    );
                  }}
                  className="border-slate-800 hover:bg-slate-800 text-slate-300"
                >
                  <Download className="size-3.5 mr-1.5" /> Download Settlement
                  Slip
                </Button>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFinalPayModalOpen(false)}
                    className="border-slate-800 hover:bg-slate-800 text-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleFinalizeSeparation}
                    className="bg-rose-600 hover:bg-rose-500 text-white"
                  >
                    Release & Finalize Separation
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: SIMULATED TAX RECONCILIATION WORKSHEET (NOT BIR FORM 2316) */}
      {/* ========================================================================= */}
      {isBir2316ModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-3xl w-full space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileCheck2 className="size-4 text-purple-400" /> Demo tax
                  reconciliation worksheet
                </h3>
                <p className="text-[11px] text-slate-400">
                  Not an official BIR Form 2316. Simulated values only; tax
                  differences are not settled. Do not file or issue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBir2316ModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label
                  htmlFor="bir-2316-employee"
                  className="text-slate-400 block mb-1"
                >
                  Select Employee
                </label>
                <select
                  id="bir-2316-employee"
                  value={selectedBir2316EmpId}
                  onChange={(e) => setSelectedBir2316EmpId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeNo}) — TIN: {emp.tin}
                    </option>
                  ))}
                </select>
              </div>

              {/* Header Details */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">
                    Employee Details (Part I)
                  </div>
                  <div className="font-bold text-white mt-0.5">
                    {bir2316Cert.employee.lastName},{" "}
                    {bir2316Cert.employee.firstName}
                  </div>
                  <div className="text-slate-400 font-mono text-[11px]">
                    TIN: {bir2316Cert.employee.tin}
                  </div>
                  <div className="text-slate-400 text-[10px] mt-0.5">
                    Status:{" "}
                    {bir2316Cert.isMwe
                      ? "Minimum Wage Earner (MWE - Tax Exempt)"
                      : "Regular Employee (TRAIN Graduated)"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">
                    Employer Details (Part II)
                  </div>
                  <div className="font-bold text-white mt-0.5">
                    {bir2316Cert.employer.registeredName}
                  </div>
                  <div className="text-slate-400 font-mono text-[11px]">
                    TIN: {bir2316Cert.employer.tin} • RDO:{" "}
                    {bir2316Cert.employer.rdoCode}
                  </div>
                  <div className="text-slate-400 text-[10px] mt-0.5">
                    {bir2316Cert.employer.registeredAddress}
                  </div>
                </div>
              </div>

              {/* Part IV-A Summary */}
              <div className="bg-purple-950/20 border border-purple-800/30 p-4 rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-purple-300 uppercase tracking-wider border-b border-purple-800/40 pb-1 flex justify-between">
                  <span>Internal summary (not official form fields)</span>
                  <span className="font-mono text-[10px]">
                    Tax Year {bir2316Cert.taxYear}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-300">
                      Gross compensation income:
                    </span>
                    <span className="font-mono text-white font-semibold">
                      {formatPHP(
                        bir2316Cert.partIVA.grossCompensationIncomeCents,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">
                      Calculated annual tax due:
                    </span>
                    <span className="font-mono text-white font-semibold">
                      {formatPHP(bir2316Cert.partIVA.taxDueAnnualCents)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Non-taxable income:</span>
                    <span className="font-mono text-emerald-400">
                      {formatPHP(
                        bir2316Cert.partIVA.totalNonTaxableCompensationCents,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">
                      Simulated taxes withheld:
                    </span>
                    <span className="font-mono text-amber-400">
                      {formatPHP(bir2316Cert.partIVA.totalTaxWithheldCents)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Taxable income:</span>
                    <span className="font-mono text-blue-400 font-bold">
                      {formatPHP(
                        bir2316Cert.partIVA.totalTaxableCompensationCents,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">
                      Unsettled difference to review:
                    </span>
                    <span
                      className={`font-mono font-bold ${bir2316Cert.partIVA.refundDueEmployeeCents > 0n ? "text-emerald-400" : "text-slate-300"}`}
                    >
                      {bir2316Cert.partIVA.taxAdjustmentCents < 0n
                        ? `Refund to review ${formatPHP(-bir2316Cert.partIVA.taxAdjustmentCents)}`
                        : bir2316Cert.partIVA.taxAdjustmentCents > 0n
                          ? `Deficiency to review ${formatPHP(bir2316Cert.partIVA.taxAdjustmentCents)}`
                          : "No calculated difference"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown: Part IV-B & IV-C */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                    Non-Taxable / Exempt Income
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">
                      13th Month & Bonuses (≤₱90k):
                    </span>
                    <span className="font-mono text-white">
                      {formatPHP(
                        bir2316Cert.partIVB.thirteenthMonthExemptCents,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">De Minimis Benefits:</span>
                    <span className="font-mono text-white">
                      {formatPHP(bir2316Cert.partIVB.deMinimisBenefitsCents)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">
                      Statutory SSS/PHIC/HDMF:
                    </span>
                    <span className="font-mono text-white">
                      {formatPHP(
                        bir2316Cert.partIVB.statutoryContributionsCents,
                      )}
                    </span>
                  </div>
                  {bir2316Cert.isMwe && (
                    <div className="flex justify-between text-[11px] text-amber-400">
                      <span>Basic & OT (MWE Exempt):</span>
                      <span className="font-mono">
                        {formatPHP(
                          bir2316Cert.partIVB.basicMweCents +
                            bir2316Cert.partIVB.overtimePayMweCents,
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                    Taxable Income
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">
                      Regular Basic Salary:
                    </span>
                    <span className="font-mono text-white">
                      {formatPHP(bir2316Cert.partIVC.basicSalaryRegularCents)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">
                      Taxable Overtime / Premiums:
                    </span>
                    <span className="font-mono text-white">
                      {formatPHP(bir2316Cert.partIVC.overtimePayTaxableCents)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">
                      Bonuses in Excess of ₱90k:
                    </span>
                    <span className="font-mono text-white">
                      {formatPHP(
                        bir2316Cert.partIVC.thirteenthMonthExcessTaxableCents,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold pt-1 border-t border-slate-800">
                    <span className="text-slate-300">
                      Total Taxable Income:
                    </span>
                    <span className="font-mono text-blue-400">
                      {formatPHP(
                        bir2316Cert.partIVC.totalTaxableCompensationCents,
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const text = formatBir2316TextDocument(bir2316Cert);
                    downloadFile(
                      `DEMO_Tax_Reconciliation_${selectedBir2316Emp.name.replace(/\s+/g, "_")}_2026.txt`,
                      text,
                      "text/plain;charset=utf-8;",
                    );
                    showToast("Downloaded demo-only reconciliation worksheet");
                  }}
                  className="border-slate-800 hover:bg-slate-800 text-slate-300"
                >
                  <Download className="size-3.5 mr-1.5" /> Download demo
                  worksheet (.txt)
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsBir2316ModalOpen(false)}
                  className="bg-purple-600 hover:bg-purple-500 text-white"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 9: DOLE 13TH MONTH PAY BATCH & ANNUAL COMPLIANCE REPORT */}
      {/* ========================================================================= */}
      {is13thMonthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-4xl w-full space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Banknote className="size-4 text-emerald-400" /> DOLE 13th
                  Month Pay Batch & Compliance
                </h3>
                <p className="text-[11px] text-slate-400">
                  Presidential Decree No. 851 • Statutory December 24 release
                  mandate • DOLE BWC / ERS Filing
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIs13thMonthModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Summary Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    Benefited Employees
                  </span>
                  <div className="text-lg font-bold text-white mt-0.5">
                    {thirteenthMonthBatchResult.totalBenefitedEmployees}{" "}
                    Employees
                  </div>
                  <span className="text-[10px] text-slate-500">
                    100% Rank-and-File
                  </span>
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    Total Payout Granted
                  </span>
                  <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                    {formatPHP(
                      thirteenthMonthBatchResult.totalThirteenthMonthPayCents,
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Total Company Outlay
                  </span>
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    Tax-Exempt (≤₱90k)
                  </span>
                  <div className="text-lg font-bold text-blue-400 font-mono mt-0.5">
                    {formatPHP(thirteenthMonthBatchResult.totalTaxExemptCents)}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    TRAIN Law Exemption
                  </span>
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    Taxable Excess (&gt;₱90k)
                  </span>
                  <div className="text-lg font-bold text-amber-400 font-mono mt-0.5">
                    {formatPHP(
                      thirteenthMonthBatchResult.totalTaxableExcessCents,
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Subject to Withholding
                  </span>
                </div>
              </div>

              {/* Employee Breakdown Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-3">Employee</th>
                      <th className="py-3 px-3">Tenure / Service</th>
                      <th className="py-3 px-3">Annual Basic Earned</th>
                      <th className="py-3 px-3">13th Month Pay</th>
                      <th className="py-3 px-3">Tax-Exempt Share</th>
                      <th className="py-3 px-3">Taxable Excess</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {thirteenthMonthBatchResult.employeeResults.map((r) => (
                      <tr
                        key={r.employeeId}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-medium text-white">
                          {r.fullName}
                          <div className="text-[10px] text-slate-500 font-mono">
                            {r.employeeNumber}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={
                              r.isProrated ? "text-amber-400" : "text-slate-300"
                            }
                          >
                            {r.monthsWorked} mos{" "}
                            {r.isProrated ? "(Pro-rated)" : "(Full 12m)"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {formatPHP(r.totalBasicEarnedCents)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                          {formatPHP(r.thirteenthMonthPayCents)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-blue-400">
                          {formatPHP(r.taxExemptPortionCents)}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {r.taxableExcessCents > 0n ? (
                            <span className="text-amber-400">
                              +{formatPHP(r.taxableExcessCents)}
                            </span>
                          ) : (
                            <span className="text-slate-500">₱0.00</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const report = formatDole13thMonthComplianceReport({
                        taxYear: selected13thMonthYear,
                        establishmentName: "Acme Philippines Technologies Inc.",
                        registeredAddress: "Ayala Avenue, Makati City",
                        natureOfBusiness: "Information Technology & Services",
                        contactPerson: "HR & Payroll Director",
                        contactNumber: "+63 2 8123 4567",
                        batchResult: thirteenthMonthBatchResult,
                      });
                      downloadFile(
                        `DOLE_13th_Month_Report_${selected13thMonthYear}.txt`,
                        report,
                        "text/plain;charset=utf-8;",
                      );
                      showToast(
                        "📥 Exported Official DOLE 13th Month Pay Annual Report!",
                      );
                    }}
                    className="border-slate-800 hover:bg-slate-800 text-slate-300"
                  >
                    <Download className="size-3.5 mr-1.5" /> Export DOLE Report
                    (PD 851)
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const rows = [
                        "Account_Number,Beneficiary_Name,Amount_PHP,Employee_ID,Reference",
                        ...thirteenthMonthBatchResult.employeeResults.map(
                          (r) => {
                            const emp = employees.find(
                              (e) => e.id === r.employeeId,
                            );
                            return `"${emp?.bankAccount || "1122334455"}","${r.fullName}",${(Number(r.thirteenthMonthPayCents) / 100).toFixed(2)},"${r.employeeNumber}","13TH-MONTH-${selected13thMonthYear}"`;
                          },
                        ),
                      ];
                      downloadFile(
                        `13th_Month_Bank_Batch_${selected13thMonthYear}.csv`,
                        rows.join("\r\n"),
                      );
                      showToast(
                        "📥 Exported 13th Month Bank Transmittal Batch CSV!",
                      );
                    }}
                    className="border-slate-800 hover:bg-slate-800 text-slate-300"
                  >
                    <Download className="size-3.5 mr-1.5" /> Export Bank
                    Transmittal (.csv)
                  </Button>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIs13thMonthModalOpen(false)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
