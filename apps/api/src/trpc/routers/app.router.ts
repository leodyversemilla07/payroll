import { z } from "zod";
import { TrpcService } from "../trpc.service";
import { EmployeesService } from "../../modules/employees/employees.service";
import { TimekeepingService } from "../../modules/timekeeping/timekeeping.service";
import { PayrollService } from "../../modules/payroll/payroll.service";
import { LoansService } from "../../modules/loans/loans.service";
import { ComplianceService } from "../../modules/compliance/compliance.service";

export function createApiRouter(
  trpc: TrpcService,
  employeesService: EmployeesService,
  timekeepingService: TimekeepingService,
  payrollService: PayrollService,
  loansService: LoansService,
  complianceService: ComplianceService
) {
  const p = trpc.procedure;

  return trpc.router({
    health: p.query(() => {
      return { status: "ok", timestamp: new Date().toISOString() };
    }),

    employees: trpc.router({
      list: p
        .input(z.object({ organizationId: z.string().optional() }))
        .query(async ({ input }) => {
          return employeesService.listEmployees(input.organizationId);
        }),

      getById: p
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
          return employeesService.getEmployeeById(input.id);
        }),

      create: p
        .input(
          z.object({
            organizationId: z.string().optional(),
            branchId: z.string().optional(),
            departmentId: z.string().optional(),
            firstName: z.string(),
            lastName: z.string(),
            email: z.string().email(),
            contactNumber: z.string().optional(),
            residentialAddress: z.string().optional(),
            gender: z.string().optional(),
            civilStatus: z.string().optional(),
            dateOfBirth: z.string().optional(),
            tin: z.string().optional(),
            sssNo: z.string().optional(),
            philhealthNo: z.string().optional(),
            pagibigNo: z.string().optional(),
            hireDate: z.string().optional(),
            employmentType: z
              .enum(["REGULAR", "PROBATIONARY", "CONTRACTUAL", "PROJECT_BASED", "PART_TIME"])
              .optional(),
            bankName: z.string().optional(),
            bankAccountNumber: z.string().optional(),
            bankAccountName: z.string().optional(),
            monthlyBasicRatePesos: z.number().positive(),
            isTaxExempt: z.boolean().optional(),
          })
        )
        .mutation(async ({ input }) => {
          return employeesService.registerEmployee(input);
        }),
    }),

    timekeeping: trpc.router({
      listRecent: p
        .input(z.object({ limit: z.number().optional() }))
        .query(async ({ input }) => {
          return timekeepingService.listRecentRecords(input.limit);
        }),

      getDTR: p
        .input(
          z.object({
            employeeId: z.string(),
            startDate: z.string(),
            endDate: z.string(),
          })
        )
        .query(async ({ input }) => {
          return timekeepingService.getEmployeeDTR(
            input.employeeId,
            new Date(input.startDate),
            new Date(input.endDate)
          );
        }),

      recordPunch: p
        .input(
          z.object({
            employeeId: z.string(),
            date: z.string(),
            timeIn: z.string().optional(),
            timeOut: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          return timekeepingService.recordPunch(
            input.employeeId,
            new Date(input.date),
            input.timeIn ? new Date(input.timeIn) : undefined,
            input.timeOut ? new Date(input.timeOut) : undefined
          );
        }),

      adjustAttendance: p
        .input(
          z.object({
            employeeId: z.string(),
            date: z.string(),
            dayType: z
              .enum([
                "REGULAR_WORKDAY",
                "REST_DAY",
                "SPECIAL_NON_WORKING_HOLIDAY",
                "REGULAR_HOLIDAY",
                "DOUBLE_HOLIDAY",
              ])
              .optional(),
            timeIn: z.string().optional(),
            timeOut: z.string().optional(),
            actualWorkedMinutes: z.number().default(480),
            tardinessMinutes: z.number().optional(),
            undertimeMinutes: z.number().optional(),
            overtimeMinutes: z.number().optional(),
            nightDiffMinutes: z.number().optional(),
            isAbsent: z.boolean().optional(),
            isApproved: z.boolean().optional(),
          })
        )
        .mutation(async ({ input }) => {
          return timekeepingService.adjustAttendanceRecord({
            employeeId: input.employeeId,
            date: new Date(input.date),
            dayType: input.dayType,
            timeIn: input.timeIn ? new Date(input.timeIn) : undefined,
            timeOut: input.timeOut ? new Date(input.timeOut) : undefined,
            actualWorkedMinutes: input.actualWorkedMinutes,
            tardinessMinutes: input.tardinessMinutes,
            undertimeMinutes: input.undertimeMinutes,
            overtimeMinutes: input.overtimeMinutes,
            nightDiffMinutes: input.nightDiffMinutes,
            isAbsent: input.isAbsent,
            isApproved: input.isApproved,
          });
        }),
    }),

    payroll: trpc.router({
      listRuns: p
        .input(z.object({ organizationId: z.string() }))
        .query(async ({ input }) => {
          return payrollService.listPayrollRuns(input.organizationId);
        }),

      getRunDetails: p
        .input(z.object({ runId: z.string() }))
        .query(async ({ input }) => {
          return payrollService.getPayrollRunDetails(input.runId);
        }),

      triggerRun: p
        .input(
          z.object({
            organizationId: z.string(),
            cutoffStartDate: z.string(),
            cutoffEndDate: z.string(),
            paymentDate: z.string(),
            cutoffSequence: z.enum(["FIRST_CUTOFF", "SECOND_CUTOFF", "SPECIAL_RUN"]),
          })
        )
        .mutation(async ({ input }) => {
          return payrollService.executePayrollRun({
            organizationId: input.organizationId,
            cutoffStartDate: new Date(input.cutoffStartDate),
            cutoffEndDate: new Date(input.cutoffEndDate),
            paymentDate: new Date(input.paymentDate),
            cutoffSequence: input.cutoffSequence,
          });
        }),
    }),

    loans: trpc.router({
      listAll: p.query(async () => {
        return loansService.listAllActiveLoans();
      }),

      getActiveLoans: p
        .input(z.object({ employeeId: z.string() }))
        .query(async ({ input }) => {
          return loansService.getEmployeeActiveLoans(input.employeeId);
        }),

      create: p
        .input(
          z.object({
            employeeId: z.string(),
            loanType: z.enum([
              "SSS_SALARY_LOAN",
              "SSS_CALAMITY_LOAN",
              "PAGIBIG_MULTI_PURPOSE",
              "PAGIBIG_HOUSING",
              "COMPANY_CASH_ADVANCE",
              "COMPANY_EMERGENCY_LOAN",
            ]),
            referenceNumber: z.string().optional(),
            principalPesos: z.number().positive(),
            totalAmountPesos: z.number().positive(),
            amortizationPesos: z.number().positive(),
            startDate: z.string(),
            endDate: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          return loansService.createLoan({
            employeeId: input.employeeId,
            loanType: input.loanType,
            referenceNumber: input.referenceNumber,
            principalCents: BigInt(Math.round(input.principalPesos * 100)),
            totalAmountCents: BigInt(Math.round(input.totalAmountPesos * 100)),
            amortizationCents: BigInt(Math.round(input.amortizationPesos * 100)),
            startDate: new Date(input.startDate),
            endDate: input.endDate ? new Date(input.endDate) : undefined,
          });
        }),
    }),

    compliance: trpc.router({
      exportBankTransmittal: p
        .input(
          z.object({
            payrollRunId: z.string(),
            bankFormat: z.enum(["BDO", "BPI", "UNIONBANK", "METROBANK"]),
          })
        )
        .query(async ({ input }) => {
          const csvContent = await complianceService.generateBankTransmittalCsv(
            input.payrollRunId,
            input.bankFormat
          );
          return {
            filename: `${input.bankFormat}_Transmittal_${new Date().toISOString().slice(0, 10)}.csv`,
            csvContent,
          };
        }),

      exportBir1601C: p
        .input(
          z.object({
            month: z.number().min(1).max(12),
            year: z.number().min(2020).max(2030),
          })
        )
        .query(async ({ input }) => {
          return complianceService.getBir1601CSummary(input.month, input.year);
        }),
    }),
  });
}

export type AppRouter = ReturnType<typeof createApiRouter>;
