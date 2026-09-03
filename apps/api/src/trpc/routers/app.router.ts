import { TRPCError } from '@trpc/server';
import { Role } from '@workspace/db';
import { z } from 'zod';
import { TrpcService } from '../trpc.service';
import { EmployeesService } from '../../modules/employees/employees.service';
import { TimekeepingService } from '../../modules/timekeeping/timekeeping.service';
import { PayrollService } from '../../modules/payroll/payroll.service';
import { LoansService } from '../../modules/loans/loans.service';
import { ComplianceService } from '../../modules/compliance/compliance.service';
import { LeavesService } from '../../modules/leaves/leaves.service';
import { AuthService, type AuthenticatedUser } from '../../auth/auth.service';
import { AuditService } from '../../audit/audit.service';

const EMPLOYEE_RECORD_ROLES = [
  Role.SUPER_ADMIN,
  Role.HR_ADMIN,
  Role.PAYROLL_SPECIALIST,
] as const;
const TIMEKEEPING_READ_ROLES = [
  ...EMPLOYEE_RECORD_ROLES,
  Role.DEPARTMENT_MANAGER,
] as const;
const HR_ROLES = [Role.SUPER_ADMIN, Role.HR_ADMIN] as const;
const TIMEKEEPING_WRITE_ROLES = [
  Role.SUPER_ADMIN,
  Role.HR_ADMIN,
  Role.PAYROLL_SPECIALIST,
  Role.DEPARTMENT_MANAGER,
] as const;
const PAYROLL_ROLES = [
  Role.SUPER_ADMIN,
  Role.HR_ADMIN,
  Role.PAYROLL_SPECIALIST,
] as const;

function assertEmployeeAccess(
  user: AuthenticatedUser,
  employeeId: string,
  staffRoles: readonly Role[],
): void {
  const isOwnRecord =
    user.role === Role.EMPLOYEE && user.employeeId === employeeId;
  if (!isOwnRecord && !staffRoles.includes(user.role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to access this employee record',
    });
  }
}

export function createApiRouter(
  trpc: TrpcService,
  employeesService: EmployeesService,
  timekeepingService: TimekeepingService,
  payrollService: PayrollService,
  loansService: LoansService,
  complianceService: ComplianceService,
  leavesService: LeavesService,
  authService: AuthService,
  auditService: AuditService,
) {
  const publicProcedure = trpc.publicProcedure;
  const protectedProcedure = trpc.protectedProcedure;
  const employeeRecordProcedure = trpc.procedureForRoles(EMPLOYEE_RECORD_ROLES);
  const timekeepingReadProcedure = trpc.procedureForRoles(
    TIMEKEEPING_READ_ROLES,
  );
  const hrProcedure = trpc.procedureForRoles(HR_ROLES);
  const timekeepingWriteProcedure = trpc.procedureForRoles(
    TIMEKEEPING_WRITE_ROLES,
  );
  const payrollProcedure = trpc.procedureForRoles(PAYROLL_ROLES);

  return trpc.router({
    health: publicProcedure.query(() => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })),

    auth: trpc.router({
      login: publicProcedure
        .input(
          z.object({
            email: z.string().email().max(320),
            password: z.string().min(1).max(1024),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          const result = await authService.signIn(
            input.email,
            input.password,
            ctx.req,
            ctx.res,
          );
          if (!result) {
            throw new TRPCError({
              code: 'UNAUTHORIZED',
              message: 'Invalid email or password',
            });
          }

          await auditService.record({
            user: result.user,
            request: ctx.req,
            action: 'LOGIN',
            entityType: 'User',
            entityId: result.user.id,
          });

          return result;
        }),

      me: protectedProcedure.query(({ ctx }) => ctx.user),

      logout: protectedProcedure.mutation(async ({ ctx }) => {
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'LOGOUT',
          entityType: 'User',
          entityId: ctx.user.id,
        });
        await authService.signOut(ctx.req, ctx.res);
        return { success: true };
      }),
    }),

    users: trpc.router({
      list: hrProcedure.query(({ ctx }) =>
        authService.listUsers(ctx.user.organizationId),
      ),

      create: hrProcedure
        .input(
          z.object({
            employeeId: z.string().uuid().optional(),
            name: z.string().trim().min(1).max(200),
            email: z.string().email().max(320),
            password: z.string().min(12).max(1024),
            role: z.nativeEnum(Role),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          if (
            input.role === Role.SUPER_ADMIN &&
            ctx.user.role !== Role.SUPER_ADMIN
          ) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Only super administrators may create this role',
            });
          }

          const user = await authService.createUser({
            ...input,
            organizationId: ctx.user.organizationId,
          });
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'CREATE',
            entityType: 'User',
            entityId: user.id,
            newValue: { email: user.email, role: user.role },
          });
          return user;
        }),

      updateAccess: hrProcedure
        .input(
          z.object({
            userId: z.string().uuid(),
            role: z.nativeEnum(Role),
            isActive: z.boolean(),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          if (input.userId === ctx.user.id) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'You cannot change your own access',
            });
          }

          const user = await authService.updateUserAccess({
            ...input,
            organizationId: ctx.user.organizationId,
            canManageSuperAdmins: ctx.user.role === Role.SUPER_ADMIN,
          });
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'UPDATE',
            entityType: 'User',
            entityId: user.id,
            newValue: { role: user.role, isActive: user.isActive },
          });
          return user;
        }),
    }),

    employees: trpc.router({
      list: employeeRecordProcedure.query(({ ctx }) =>
        employeesService.listEmployees(ctx.user.organizationId),
      ),

      getById: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(({ input, ctx }) => {
          assertEmployeeAccess(ctx.user, input.id, EMPLOYEE_RECORD_ROLES);
          return employeesService.getEmployeeById(
            input.id,
            ctx.user.organizationId,
          );
        }),

      create: hrProcedure
        .input(
          z.object({
            branchId: z.string().uuid().optional(),
            departmentId: z.string().uuid().optional(),
            firstName: z.string().trim().min(1).max(100),
            lastName: z.string().trim().min(1).max(100),
            email: z.string().email().max(320),
            contactNumber: z.string().max(50).optional(),
            residentialAddress: z.string().max(500).optional(),
            gender: z.string().max(50).optional(),
            civilStatus: z.string().max(50).optional(),
            dateOfBirth: z.string().date().optional(),
            tin: z.string().max(50).optional(),
            sssNo: z.string().max(50).optional(),
            philhealthNo: z.string().max(50).optional(),
            pagibigNo: z.string().max(50).optional(),
            hireDate: z.string().date().optional(),
            employmentType: z
              .enum([
                'REGULAR',
                'PROBATIONARY',
                'CONTRACTUAL',
                'PROJECT_BASED',
                'PART_TIME',
              ])
              .optional(),
            bankName: z.string().max(100).optional(),
            bankAccountNumber: z.string().max(100).optional(),
            bankAccountName: z.string().max(200).optional(),
            monthlyBasicRatePesos: z.number().positive().finite(),
            isTaxExempt: z.boolean().optional(),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          const employee = await employeesService.registerEmployee({
            ...input,
            organizationId: ctx.user.organizationId,
          });
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'CREATE',
            entityType: 'Employee',
            entityId: employee.id,
            newValue: {
              employeeNumber: employee.employeeNumber,
              email: employee.email,
            },
          });
          return employee;
        }),

      calculateFinalPay: hrProcedure
        .input(
          z.object({
            employeeId: z.string().uuid(),
            separationType: z.enum([
              'RESIGNATION',
              'REDUNDANCY',
              'RETRENCHMENT',
              'CLOSURE_NON_BANKRUPT',
              'DISEASE',
              'RETIREMENT',
            ]),
            yearsOfService: z.number().nonnegative().optional(),
            unpaidDaysWorked: z.number().nonnegative().optional(),
            unusedLeaveDays: z.number().nonnegative().optional(),
            exitDate: z.string().date().optional(),
          }),
        )
        .query(({ input, ctx }) =>
          employeesService.calculateFinalPaySettlement({
            ...input,
            organizationId: ctx.user.organizationId,
            exitDate: input.exitDate ? new Date(input.exitDate) : undefined,
          }),
        ),
    }),

    timekeeping: trpc.router({
      listRecent: timekeepingReadProcedure
        .input(z.object({ limit: z.number().int().min(1).max(200).optional() }))
        .query(({ input, ctx }) =>
          timekeepingService.listRecentRecords(
            ctx.user.organizationId,
            input.limit,
          ),
        ),

      getDTR: protectedProcedure
        .input(
          z.object({
            employeeId: z.string().uuid(),
            startDate: z.string().date(),
            endDate: z.string().date(),
          }),
        )
        .query(({ input, ctx }) => {
          assertEmployeeAccess(
            ctx.user,
            input.employeeId,
            TIMEKEEPING_READ_ROLES,
          );
          return timekeepingService.getEmployeeDTR(
            input.employeeId,
            ctx.user.organizationId,
            new Date(input.startDate),
            new Date(input.endDate),
          );
        }),

      recordPunch: timekeepingWriteProcedure
        .input(
          z.object({
            employeeId: z.string().uuid(),
            date: z.string().date(),
            timeIn: z.string().datetime().optional(),
            timeOut: z.string().datetime().optional(),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          const record = await timekeepingService.recordPunch(
            input.employeeId,
            ctx.user.organizationId,
            new Date(input.date),
            input.timeIn ? new Date(input.timeIn) : undefined,
            input.timeOut ? new Date(input.timeOut) : undefined,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'UPDATE',
            entityType: 'DailyTimeRecord',
            entityId: record.id,
          });
          return record;
        }),

      adjustAttendance: timekeepingWriteProcedure
        .input(
          z.object({
            employeeId: z.string().uuid(),
            date: z.string().date(),
            dayType: z
              .enum([
                'REGULAR_WORKDAY',
                'REST_DAY',
                'SPECIAL_NON_WORKING_HOLIDAY',
                'REGULAR_HOLIDAY',
                'DOUBLE_HOLIDAY',
              ])
              .optional(),
            timeIn: z.string().datetime().optional(),
            timeOut: z.string().datetime().optional(),
            actualWorkedMinutes: z.number().int().nonnegative().default(480),
            tardinessMinutes: z.number().int().nonnegative().optional(),
            undertimeMinutes: z.number().int().nonnegative().optional(),
            overtimeMinutes: z.number().int().nonnegative().optional(),
            nightDiffMinutes: z.number().int().nonnegative().optional(),
            isAbsent: z.boolean().optional(),
            isApproved: z.boolean().optional(),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          const record = await timekeepingService.adjustAttendanceRecord({
            ...input,
            organizationId: ctx.user.organizationId,
            date: new Date(input.date),
            timeIn: input.timeIn ? new Date(input.timeIn) : undefined,
            timeOut: input.timeOut ? new Date(input.timeOut) : undefined,
          });
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'UPDATE',
            entityType: 'DailyTimeRecord',
            entityId: record.id,
          });
          return record;
        }),

      importBiometricsCsv: timekeepingWriteProcedure
        .input(z.object({ csvContent: z.string().min(1).max(10_000_000) }))
        .mutation(async ({ input, ctx }) => {
          const result = await timekeepingService.importBiometricsCsv(
            input.csvContent,
            ctx.user.organizationId,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'IMPORT',
            entityType: 'BiometricsCsv',
            entityId: ctx.user.organizationId,
            newValue: {
              daysImported: result.daysImported,
              anomaliesDetected: result.anomaliesDetected,
            },
          });
          return result;
        }),
    }),

    payroll: trpc.router({
      listRuns: payrollProcedure.query(({ ctx }) =>
        payrollService.listPayrollRuns(ctx.user.organizationId),
      ),

      getRunDetails: payrollProcedure
        .input(z.object({ runId: z.string().uuid() }))
        .query(({ input, ctx }) =>
          payrollService.getPayrollRunDetails(
            input.runId,
            ctx.user.organizationId,
          ),
        ),

      triggerRun: trpc
        .procedureForRoles([Role.SUPER_ADMIN, Role.PAYROLL_SPECIALIST])
        .input(
          z.object({
            cutoffStartDate: z.string().date(),
            cutoffEndDate: z.string().date(),
            paymentDate: z.string().date(),
            cutoffSequence: z.enum([
              'FIRST_CUTOFF',
              'SECOND_CUTOFF',
              'SPECIAL_RUN',
            ]),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          const payrollRun = await payrollService.executePayrollRun({
            organizationId: ctx.user.organizationId,
            cutoffStartDate: new Date(input.cutoffStartDate),
            cutoffEndDate: new Date(input.cutoffEndDate),
            paymentDate: new Date(input.paymentDate),
            cutoffSequence: input.cutoffSequence,
          });
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'CREATE',
            entityType: 'PayrollRun',
            entityId: payrollRun.id,
            newValue: { status: payrollRun.status },
          });
          return payrollRun;
        }),
    }),

    loans: trpc.router({
      listAll: payrollProcedure.query(({ ctx }) =>
        loansService.listAllActiveLoans(ctx.user.organizationId),
      ),

      getActiveLoans: protectedProcedure
        .input(z.object({ employeeId: z.string().uuid() }))
        .query(({ input, ctx }) => {
          assertEmployeeAccess(ctx.user, input.employeeId, PAYROLL_ROLES);
          return loansService.getEmployeeActiveLoans(
            input.employeeId,
            ctx.user.organizationId,
          );
        }),

      create: payrollProcedure
        .input(
          z.object({
            employeeId: z.string().uuid(),
            loanType: z.enum([
              'SSS_SALARY_LOAN',
              'SSS_CALAMITY_LOAN',
              'PAGIBIG_MULTI_PURPOSE',
              'PAGIBIG_HOUSING',
              'COMPANY_CASH_ADVANCE',
              'COMPANY_EMERGENCY_LOAN',
            ]),
            referenceNumber: z.string().max(100).optional(),
            principalPesos: z.number().positive().finite(),
            totalAmountPesos: z.number().positive().finite(),
            amortizationPesos: z.number().positive().finite(),
            startDate: z.string().date(),
            endDate: z.string().date().optional(),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          const loan = await loansService.createLoan({
            employeeId: input.employeeId,
            organizationId: ctx.user.organizationId,
            loanType: input.loanType,
            referenceNumber: input.referenceNumber,
            principalCents: BigInt(Math.round(input.principalPesos * 100)),
            totalAmountCents: BigInt(Math.round(input.totalAmountPesos * 100)),
            amortizationCents: BigInt(
              Math.round(input.amortizationPesos * 100),
            ),
            startDate: new Date(input.startDate),
            endDate: input.endDate ? new Date(input.endDate) : undefined,
          });
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'CREATE',
            entityType: 'EmployeeLoan',
            entityId: loan.id,
          });
          return loan;
        }),
    }),

    compliance: trpc.router({
      exportBankTransmittal: payrollProcedure
        .input(
          z.object({
            payrollRunId: z.string().uuid(),
            bankFormat: z.enum(['BDO', 'BPI', 'UNIONBANK', 'METROBANK']),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          const csvContent = await complianceService.generateBankTransmittalCsv(
            input.payrollRunId,
            input.bankFormat,
            ctx.user.organizationId,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'EXPORT',
            entityType: 'BankTransmittal',
            entityId: input.payrollRunId,
          });
          return {
            filename: `${input.bankFormat}_Transmittal_${new Date().toISOString().slice(0, 10)}.csv`,
            csvContent,
          };
        }),

      exportBir1601C: payrollProcedure
        .input(
          z.object({
            month: z.number().int().min(1).max(12),
            year: z.number().int().min(2020).max(2100),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          const result = await complianceService.getBir1601CSummary(
            input.month,
            input.year,
            ctx.user.organizationId,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'EXPORT',
            entityType: 'BIR1601C',
            entityId: `${input.year}-${String(input.month).padStart(2, '0')}`,
          });
          return result;
        }),

      exportBir2316: payrollProcedure
        .input(
          z.object({
            employeeId: z.string().uuid(),
            taxYear: z.number().int().min(2020).max(2100).optional(),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          const result = await complianceService.generateBir2316(
            input.employeeId,
            ctx.user.organizationId,
            input.taxYear,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'EXPORT',
            entityType: 'BIR2316',
            entityId: input.employeeId,
            newValue: { taxYear: input.taxYear },
          });
          return result;
        }),

      exportDole13thMonth: payrollProcedure
        .input(z.object({ taxYear: z.number().int().optional() }))
        .mutation(async ({ input, ctx }) => {
          const result = await complianceService.generateDole13thMonthReport(
            ctx.user.organizationId,
            input.taxYear,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'EXPORT',
            entityType: 'Dole13thMonthReport',
            entityId: `${ctx.user.organizationId}:${result.taxYear}`,
          });
          return result;
        }),
    }),

    leaves: trpc.router({
      getBalances: protectedProcedure
        .input(
          z.object({
            employeeId: z.string().uuid(),
            year: z.number().int().optional(),
          }),
        )
        .query(({ input, ctx }) => {
          assertEmployeeAccess(
            ctx.user,
            input.employeeId,
            TIMEKEEPING_READ_ROLES,
          );
          return leavesService.getEmployeeLeaveBalances(
            input.employeeId,
            ctx.user.organizationId,
            input.year,
          );
        }),

      request: protectedProcedure
        .input(
          z.object({
            employeeId: z.string().uuid(),
            leaveType: z.string().trim().min(1).max(50),
            startDate: z.string().date(),
            endDate: z.string().date(),
            daysCount: z.number().positive().finite(),
            isPaid: z.boolean().default(true),
            reason: z.string().trim().min(1).max(2000),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          assertEmployeeAccess(
            ctx.user,
            input.employeeId,
            TIMEKEEPING_READ_ROLES,
          );
          const request = await leavesService.fileLeaveRequest({
            ...input,
            organizationId: ctx.user.organizationId,
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
          });
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'CREATE',
            entityType: 'LeaveRequest',
            entityId: request.id,
          });
          return request;
        }),

      approve: trpc
        .procedureForRoles([
          Role.SUPER_ADMIN,
          Role.HR_ADMIN,
          Role.DEPARTMENT_MANAGER,
        ])
        .input(z.object({ requestId: z.string().uuid() }))
        .mutation(async ({ input, ctx }) => {
          const request = await leavesService.approveLeaveRequest(
            input.requestId,
            ctx.user.organizationId,
            ctx.user.id,
          );
          await auditService.record({
            user: ctx.user,
            request: ctx.req,
            action: 'APPROVE',
            entityType: 'LeaveRequest',
            entityId: request.id,
          });
          return request;
        }),

      monetizeSil: protectedProcedure
        .input(
          z.object({
            employeeId: z.string().uuid(),
            daysToMonetize: z.number().positive().optional(),
          }),
        )
        .query(({ input, ctx }) => {
          assertEmployeeAccess(
            ctx.user,
            input.employeeId,
            TIMEKEEPING_READ_ROLES,
          );
          return leavesService.calculateSilMonetization(
            input.employeeId,
            ctx.user.organizationId,
            input.daysToMonetize,
          );
        }),
    }),
  });
}

export type AppRouter = ReturnType<typeof createApiRouter>;
