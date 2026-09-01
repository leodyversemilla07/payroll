"use client";

import { useState } from "react";
import {
  Users,
  Clock,
  Banknote,
  FileSpreadsheet,
  FileCheck2,
  Calendar,
  Building2,
  Download,
  Plus,
  Play,
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  UserCheck,
  TrendingUp,
  AlertCircle,
  FileText,
  Lock,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
  calculatePhilippinePayroll,
  CutoffType,
  PayBasis,
  WorkDayDivisor,
  DeMinimisCategory,
} from "@workspace/payroll-engine";
import type { PayrollCalculationInput } from "@workspace/payroll-engine";

// Helper to format Centavos to Philippine Pesos string
function formatPHP(cents: bigint | number): string {
  const pesos = Number(cents) / 100;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(pesos);
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
}

const INITIAL_EMPLOYEES: DemoEmployee[] = [
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
  },
  {
    id: "emp-004",
    employeeNo: "EMP-2026-004",
    name: "Ana Gomez",
    department: "Logistics",
    role: "Logistics Assistant",
    payBasis: PayBasis.MONTHLY,
    monthlyBasicRateCents: 1540000n, // PHP 15,400.00 (Minimum Wage Tier)
    isMinimumWageEarner: true,
    tin: "456-789-012-000",
    sssNo: "07-4455667-8",
    philhealthNo: "45-678901234-5",
    pagibigNo: "4567-8901-2345",
    bankName: "Metrobank",
    bankAccount: "209876543211",
    activeLoanCents: 0n,
  },
];

export default function PayrollDashboard() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "employees" | "timekeeping" | "payroll-wizard" | "ess-portal" | "compliance"
  >("overview");

  const [employees, setEmployees] = useState<DemoEmployee[]>(INITIAL_EMPLOYEES);
  const [selectedCutoff, setSelectedCutoff] = useState<"FIRST_CUTOFF" | "SECOND_CUTOFF">("FIRST_CUTOFF");
  const [payrollStatus, setPayrollStatus] = useState<"READY" | "RUNNING" | "COMPLETED">("READY");
  const [searchQuery, setSearchQuery] = useState("");

  // Live Payroll Calculation across all employees for selected cutoff
  const computedPayrollResults = employees.map((emp) => {
    const input: PayrollCalculationInput = {
      cutoffType: selectedCutoff === "FIRST_CUTOFF" ? CutoffType.FIRST_CUTOFF : CutoffType.SECOND_CUTOFF,
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
        regularHoursWorked: 80,
        tardinessMinutes: emp.id === "emp-001" ? 15 : 0,
        undertimeMinutes: 0,
        absentDays: 0,
        regularOvertimeHours: emp.id === "emp-001" ? 4 : emp.id === "emp-003" ? 6 : 0,
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
        regularNightDiffHours: emp.id === "emp-003" ? 8 : 0,
        overtimeNightDiffHours: 0,
        restDayNightDiffHours: 0,
        holidayNightDiffHours: 0,
      },
      allowances: [
        {
          name: "Rice Subsidy",
          amountCents: 100000n, // PHP 1,000.00 / cutoff
          isTaxable: false,
          deMinimisCategory: DeMinimisCategory.RICE_SUBSIDY,
        },
      ],
      loans: emp.activeLoanCents > 0n ? [
        {
          loanId: `loan-${emp.id}`,
          name: "SSS Salary Loan",
          amountCents: 50000n, // PHP 500.00 amortization
        },
      ] : [],
    };

    return {
      employee: emp,
      calc: calculatePhilippinePayroll(input),
    };
  });

  const totalGrossCents = computedPayrollResults.reduce((sum, item) => sum + item.calc.grossPayCents, 0n);
  const totalDeductionsCents = computedPayrollResults.reduce((sum, item) => sum + item.calc.totalDeductionsCents, 0n);
  const totalNetCents = computedPayrollResults.reduce((sum, item) => sum + item.calc.netPayCents, 0n);
  const totalEmployerCostCents = computedPayrollResults.reduce((sum, item) => sum + item.calc.totalStatutoryEmployerCents, 0n);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">
            ₱
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base tracking-tight text-white">Acme Enterprise Philippines</span>
              <span className="text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-medium">
                DOLE & BIR Compliant
              </span>
            </div>
            <p className="text-xs text-slate-400">Philippine Payroll Management System (PMS)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <Calendar className="size-3.5 text-blue-400" />
            <span>Pay Cutoff: <strong>Aug 16 – 31, 2026</strong></span>
          </div>
          <Button
            size="sm"
            onClick={() => setActiveTab("payroll-wizard")}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            <Play className="size-3.5 mr-1.5 fill-current" />
            Run Payroll
          </Button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/40 px-6">
        <nav className="flex space-x-6">
          {[
            { id: "overview", label: "Overview & Metrics", icon: TrendingUp },
            { id: "employees", label: "Employees Directory", icon: Users },
            { id: "timekeeping", label: "Daily Time Records (DTR)", icon: Clock },
            { id: "payroll-wizard", label: "Payroll Processing Wizard", icon: Banknote },
            { id: "compliance", label: "Government & Banking Exports", icon: FileSpreadsheet },
            { id: "ess-portal", label: "Employee Self-Service (ESS)", icon: UserCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3.5 text-xs font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content Area */}
      <main className="p-6 max-w-7xl mx-auto space-y-6">
        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW & METRICS */}
        {/* ========================================================================= */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Total Gross Compensation</span>
                  <Banknote className="size-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">{formatPHP(totalGrossCents)}</div>
                <p className="text-[11px] text-slate-400 mt-1">For Semi-Monthly Cutoff</p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Net Take-Home Pay</span>
                  <CheckCircle2 className="size-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-white">{formatPHP(totalNetCents)}</div>
                <p className="text-[11px] text-slate-400 mt-1">{employees.length} Active Employees</p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Statutory Deductions (EE)</span>
                  <ShieldCheck className="size-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white">{formatPHP(totalDeductionsCents)}</div>
                <p className="text-[11px] text-slate-400 mt-1">SSS, PhilHealth, Pag-IBIG, Tax</p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Employer Contributions (ER)</span>
                  <Building2 className="size-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-white">{formatPHP(totalEmployerCostCents)}</div>
                <p className="text-[11px] text-slate-400 mt-1">Mandatory ER Share + EC + WISP</p>
              </div>
            </div>

            {/* Statutory Compliance Table Overview */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-white">Philippine Statutory Mandates Status</h2>
                  <p className="text-xs text-slate-400">Current schedules and contribution ceilings applied</p>
                </div>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" /> All Rates Up-to-Date
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
                  <div className="text-xs font-semibold text-blue-400">SSS & WISP</div>
                  <div className="text-sm font-bold text-white mt-1">15.0% Contribution</div>
                  <div className="text-xs text-slate-400 mt-1">10% ER / 5% EE | MSC Cap: ₱35,000</div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
                  <div className="text-xs font-semibold text-emerald-400">PhilHealth</div>
                  <div className="text-sm font-bold text-white mt-1">5.0% Premium Rate</div>
                  <div className="text-xs text-slate-400 mt-1">2.5% ER / 2.5% EE | Ceiling: ₱100,000</div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
                  <div className="text-xs font-semibold text-amber-400">Pag-IBIG Fund</div>
                  <div className="text-sm font-bold text-white mt-1">2.0% + 2.0% Rate</div>
                  <div className="text-xs text-slate-400 mt-1">Base Cap: ₱10,000 | ₱200 EE / ₱200 ER</div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
                  <div className="text-xs font-semibold text-purple-400">BIR TRAIN Law Tax</div>
                  <div className="text-sm font-bold text-white mt-1">Graduated Rates (0-35%)</div>
                  <div className="text-xs text-slate-400 mt-1">₱0 tax under ₱10,417 / semi-monthly</div>
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
                <h2 className="text-base font-semibold text-white">Employee Master Directory</h2>
                <p className="text-xs text-slate-400">Manage compensation structures, bank accounts, and statutory numbers</p>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="Search employee by name, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs px-3.5 py-2 rounded-xl text-slate-200 focus:outline-none focus:border-blue-500 w-full md:w-64"
                />
                <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white shrink-0">
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
                    <th className="py-3.5 px-4">Government IDs</th>
                    <th className="py-3.5 px-4">Disbursement Bank</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {employees
                    .filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.employeeNo.includes(searchQuery))
                    .map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-medium text-white">
                          <div>{emp.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{emp.employeeNo}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div>{emp.role}</div>
                          <div className="text-[11px] text-slate-500">{emp.department}</div>
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
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                          <div>TIN: {emp.tin}</div>
                          <div>SSS: {emp.sssNo}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-200">{emp.bankName}</div>
                          <div className="font-mono text-[11px] text-slate-500">{emp.bankAccount}</div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button size="xs" variant="outline" className="border-slate-700 hover:bg-slate-800 text-xs">
                            Edit Rates
                          </Button>
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
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Daily Time Records & Attendance Logs</h2>
                <p className="text-xs text-slate-400">Ingested biometric punches, overtime hours, and tardiness adjustments</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="border-slate-700 text-slate-300">
                  <Download className="size-3.5 mr-1.5" /> Import Biometric CSV
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Regular Work Hours</th>
                    <th className="py-3 px-4">Tardiness / Undertime</th>
                    <th className="py-3 px-4">Regular Overtime</th>
                    <th className="py-3 px-4">Night Shift Diff</th>
                    <th className="py-3 px-4">Holiday / Rest Day</th>
                    <th className="py-3 px-4 text-right">Approval Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {computedPayrollResults.map(({ employee, calc }) => (
                    <tr key={employee.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-white">
                        {employee.name}
                        <div className="text-[11px] text-slate-500">{employee.department}</div>
                      </td>
                      <td className="py-3 px-4">80.0 hrs</td>
                      <td className="py-3 px-4">
                        {calc.tardinessDeductionCents > 0n ? (
                          <span className="text-rose-400 font-mono font-medium">
                            -{formatPHP(calc.tardinessDeductionCents)} (15 mins)
                          </span>
                        ) : (
                          <span className="text-slate-500">0 mins</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {calc.overtimePayCents > 0n ? (
                          <span className="text-emerald-400 font-medium">+{formatPHP(calc.overtimePayCents)}</span>
                        ) : (
                          <span className="text-slate-500">0.0 hrs</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {calc.nightDiffPayCents > 0n ? (
                          <span className="text-purple-400 font-medium">+{formatPHP(calc.nightDiffPayCents)}</span>
                        ) : (
                          <span className="text-slate-500">0.0 hrs</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500">None</td>
                      <td className="py-3 px-4 text-right">
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-medium">
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
        {/* TAB 4: PAYROLL PROCESSING WIZARD */}
        {/* ========================================================================= */}
        {activeTab === "payroll-wizard" && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">Payroll Calculation & Run Wizard</h2>
                <p className="text-xs text-slate-400">Review real-time DOLE, SSS, PhilHealth, Pag-IBIG & BIR tax computations before finalizing</p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={selectedCutoff}
                  onChange={(e) => setSelectedCutoff(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 text-xs px-3 py-2 rounded-xl text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="FIRST_CUTOFF">1st Cutoff (1st – 15th of the month)</option>
                  <option value="SECOND_CUTOFF">2nd Cutoff (16th – 30th/31st of the month)</option>
                </select>

                <Button
                  onClick={() => {
                    setPayrollStatus("RUNNING");
                    setTimeout(() => setPayrollStatus("COMPLETED"), 1000);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-500/20"
                >
                  <CheckCircle2 className="size-3.5 mr-1.5" />
                  {payrollStatus === "RUNNING" ? "Processing..." : "Finalize & Disburse"}
                </Button>
              </div>
            </div>

            {payrollStatus === "COMPLETED" && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between text-emerald-400 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>Payroll run finalized successfully! Payslips generated and ready for disbursement.</span>
                </div>
                <Button size="xs" variant="outline" className="border-emerald-500/30 text-emerald-300">
                  View Disbursement Batch
                </Button>
              </div>
            )}

            {/* Detailed Itemized Payslip Table */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-3">Employee</th>
                      <th className="py-3 px-3">Basic Pay</th>
                      <th className="py-3 px-3">Overtime / Premiums</th>
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
                      <tr key={employee.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3 font-medium text-white">
                          {employee.name}
                          <div className="text-[10px] text-slate-500 font-mono">{employee.employeeNo}</div>
                        </td>
                        <td className="py-3 px-3 font-mono">{formatPHP(calc.basicPayForPeriodCents)}</td>
                        <td className="py-3 px-3 font-mono text-emerald-400">
                          {calc.totalPremiumPayCents > 0n ? `+${formatPHP(calc.totalPremiumPayCents)}` : "₱0.00"}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-white">{formatPHP(calc.grossPayCents)}</td>
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
                          {calc.withholdingTaxCents > 0n ? `-${formatPHP(calc.withholdingTaxCents)}` : "₱0.00"}
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
        {/* TAB 5: GOVERNMENT & BANKING EXPORTS */}
        {/* ========================================================================= */}
        {activeTab === "compliance" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bank Transmittal Exporter */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <CreditCard className="size-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Bank Batch Transmittals</h3>
                  <p className="text-xs text-slate-400">Export pre-formatted direct deposit transmittal files</p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                {[
                  { name: "BDO Electronic Payroll (.csv)", count: 1, total: "₱32,842.10" },
                  { name: "BPI ExpressLink / BizLink (.txt)", count: 1, total: "₱22,500.00" },
                  { name: "UnionBank The Portal (.csv)", count: 1, total: "₱11,850.40" },
                  { name: "Metrobank Direct Export (.txt)", count: 1, total: "₱8,200.00" },
                ].map((b) => (
                  <div key={b.name} className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs">
                    <div>
                      <div className="font-medium text-white">{b.name}</div>
                      <div className="text-[11px] text-slate-500">{b.count} Record • {b.total}</div>
                    </div>
                    <Button size="xs" variant="outline" className="border-slate-700 hover:bg-slate-800 text-xs">
                      <Download className="size-3 mr-1" /> Download
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Government Filings Exporter */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <FileCheck2 className="size-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Philippine Regulatory Returns</h3>
                  <p className="text-xs text-slate-400">Generate official BIR, SSS, PhilHealth & Pag-IBIG files</p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                {[
                  { name: "BIR Form 1601-C Summary", desc: "Monthly Remittance Return of Income Taxes" },
                  { name: "BIR Form 2316 Batch (PDF)", desc: "Annual Certificate of Compensation" },
                  { name: "BIR Alphalist Data (.DAT)", desc: "Formatted for BIR Validation Engine" },
                  { name: "SSS R-3 Transmittal File", desc: "Monthly SSS Contribution Collection List" },
                  { name: "PhilHealth EPRS Report", desc: "Electronic Premium Remittance System" },
                ].map((g) => (
                  <div key={g.name} className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs">
                    <div>
                      <div className="font-medium text-white">{g.name}</div>
                      <div className="text-[11px] text-slate-500">{g.desc}</div>
                    </div>
                    <Button size="xs" variant="outline" className="border-slate-700 hover:bg-slate-800 text-xs">
                      <Download className="size-3 mr-1" /> Generate
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: EMPLOYEE SELF-SERVICE (ESS) */}
        {/* ========================================================================= */}
        {activeTab === "ess-portal" && (
          <div className="max-w-2xl mx-auto bg-slate-900/90 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-medium">
                  Employee Self-Service (ESS)
                </span>
                <h3 className="text-lg font-bold text-white mt-1">Digital Payslip Preview</h3>
                <p className="text-xs text-slate-400">Pay Period: Aug 16 – 31, 2026</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl font-mono">
                <Lock className="size-3 text-amber-400" /> Password: DOB (MMDDYYYY)
              </div>
            </div>

            {/* Employee Info Header */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <div>
                <div className="text-slate-500 text-[10px] uppercase">Employee Name</div>
                <div className="font-semibold text-white">Juan Dela Cruz</div>
                <div className="text-slate-500 font-mono text-[11px]">EMP-2026-001</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase">Department / Position</div>
                <div className="font-semibold text-white">Software Engineering</div>
                <div className="text-slate-400 text-[11px]">Senior Full-Stack Engineer</div>
              </div>
            </div>

            {/* Earnings & Deductions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Earnings */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                  Earnings
                </h4>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">Basic Pay (Semi-Monthly)</span>
                  <span className="font-mono text-white font-medium">₱32,500.00</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">Regular Overtime (4 hrs)</span>
                  <span className="font-mono text-emerald-400 font-medium">+₱1,556.52</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">Rice Subsidy (De Minimis)</span>
                  <span className="font-mono text-emerald-400 font-medium">+₱1,000.00</span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-slate-800 font-bold">
                  <span className="text-white">Gross Pay</span>
                  <span className="font-mono text-white">₱35,056.52</span>
                </div>
              </div>

              {/* Deductions */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                  Deductions
                </h4>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">Tardiness (15 mins)</span>
                  <span className="font-mono text-rose-400">-₱97.28</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-300">SSS Contribution & WISP</span>
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

            {/* Net Take-Home Pay Banner */}
            <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-blue-400 uppercase font-bold">Net Take-Home Pay</span>
                <div className="text-2xl font-black text-white font-mono">₱30,884.24</div>
              </div>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white">
                <Download className="size-3.5 mr-1.5" /> Download Encrypted PDF
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
