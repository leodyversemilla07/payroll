import { z } from "zod";
import { TrpcService } from "../trpc.service.js";
import { EmployeesService } from "../../modules/employees/employees.service.js";
import { TimekeepingService } from "../../modules/timekeeping/timekeeping.service.js";
import { PayrollService } from "../../modules/payroll/payroll.service.js";
import { LoansService } from "../../modules/loans/loans.service.js";

export function createApiRouter(
  trpc: TrpcService,
  employeesService: EmployeesService,
  timekeepingService: TimekeepingService,
  payrollService: PayrollService,
  loansService: LoansService
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
    }),

    timekeeping: trpc.router({
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
      getActiveLoans: p
        .input(z.object({ employeeId: z.string() }))
        .query(async ({ input }) => {
          return loansService.getEmployeeActiveLoans(input.employeeId);
        }),
    }),
  });
}

export type AppRouter = ReturnType<typeof createApiRouter>;
