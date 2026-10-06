import { z } from 'zod';
import type { RouterContext } from './router-context';
import { assertEmployeeAccess, PAYROLL_ROLES } from './router-context';

const LOAN_TYPES = [
  'SSS_SALARY_LOAN',
  'SSS_CALAMITY_LOAN',
  'PAGIBIG_MULTI_PURPOSE',
  'PAGIBIG_HOUSING',
  'COMPANY_CASH_ADVANCE',
  'COMPANY_EMERGENCY_LOAN',
] as const;

export function createLoansRouter(ctx: RouterContext) {
  const {
    trpc,
    protectedProcedure,
    payrollProcedure,
    loansService,
    auditService,
  } = ctx;

  return trpc.router({
    listAll: payrollProcedure.query(({ ctx }) =>
      loansService.listAllActiveLoans(ctx.user.organizationId),
    ),

    list: payrollProcedure
      .input(
        z
          .object({
            status: z.enum(['ACTIVE', 'PAID', 'ALL']).default('ACTIVE'),
            loanType: z.enum(LOAN_TYPES).optional(),
            employeeId: z.string().uuid().optional(),
            search: z.string().trim().max(100).optional(),
          })
          .default({ status: 'ACTIVE' }),
      )
      .query(({ input, ctx }) =>
        loansService.listLoans(ctx.user.organizationId, {
          status: input.status,
          loanType: input.loanType,
          employeeId: input.employeeId,
          search: input.search,
        }),
      ),

    getSummary: payrollProcedure.query(({ ctx }) =>
      loansService.getLoanSummary(ctx.user.organizationId),
    ),

    getById: protectedProcedure
      .input(z.object({ loanId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        const loan = await loansService.getLoanDetails(
          input.loanId,
          ctx.user.organizationId,
        );
        assertEmployeeAccess(ctx.user, loan.employeeId, PAYROLL_ROLES);
        return loan;
      }),

    getActiveLoans: protectedProcedure
      .input(z.object({ employeeId: z.string().uuid() }))
      .query(({ input, ctx }) => {
        assertEmployeeAccess(ctx.user, input.employeeId, PAYROLL_ROLES);
        return loansService.getEmployeeActiveLoans(
          input.employeeId,
          ctx.user.organizationId,
        );
      }),

    getMyLoans: protectedProcedure.query(({ ctx }) => {
      if (!ctx.user.employeeId) {
        return [];
      }
      return loansService.getMyLoans(
        ctx.user.employeeId,
        ctx.user.organizationId,
      );
    }),

    create: payrollProcedure
      .input(
        z
          .object({
            employeeId: z.string().uuid(),
            loanType: z.enum(LOAN_TYPES),
            referenceNumber: z.string().trim().max(100).optional(),
            principalPesos: z.number().positive().finite(),
            totalAmountPesos: z.number().positive().finite(),
            amortizationPesos: z.number().positive().finite(),
            startDate: z.string().date(),
            endDate: z.string().date().optional(),
          })
          .refine(
            (input) => !input.endDate || input.endDate >= input.startDate,
            {
              message: 'Repayment end date must not be before the start date',
              path: ['endDate'],
            },
          ),
      )
      .mutation(async ({ input, ctx }) => {
        const loan = await loansService.createLoan({
          employeeId: input.employeeId,
          organizationId: ctx.user.organizationId,
          loanType: input.loanType,
          referenceNumber: input.referenceNumber || undefined,
          principalCents: BigInt(Math.round(input.principalPesos * 100)),
          totalAmountCents: BigInt(Math.round(input.totalAmountPesos * 100)),
          amortizationCents: BigInt(Math.round(input.amortizationPesos * 100)),
          startDate: new Date(input.startDate),
          endDate: input.endDate ? new Date(input.endDate) : undefined,
        });
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'CREATE',
          entityType: 'EmployeeLoan',
          entityId: loan.id,
          newValue: {
            employeeId: input.employeeId,
            loanType: input.loanType,
            referenceNumber: input.referenceNumber,
            principalCents: loan.principalCents.toString(),
            totalAmountCents: loan.totalAmountCents.toString(),
            amortizationCents: loan.amortizationCents.toString(),
          },
        });
        return loan;
      }),

    recordPayment: payrollProcedure
      .input(
        z.object({
          loanId: z.string().uuid(),
          amountPesos: z.number().positive().finite(),
          notes: z.string().trim().max(500).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const amountCents = BigInt(Math.round(input.amountPesos * 100));
        const result = await loansService.recordManualPayment({
          loanId: input.loanId,
          organizationId: ctx.user.organizationId,
          amountCents,
        });
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'UPDATE',
          entityType: 'EmployeeLoan',
          entityId: input.loanId,
          newValue: {
            action: 'MANUAL_PAYMENT',
            amountPaidCents: amountCents.toString(),
            balanceAfterCents: result.payment.balanceAfterCents.toString(),
            notes: input.notes,
          },
        });
        return result;
      }),

    deactivate: payrollProcedure
      .input(z.object({ loanId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const loan = await loansService.deactivateLoan(
          input.loanId,
          ctx.user.organizationId,
        );
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'UPDATE',
          entityType: 'EmployeeLoan',
          entityId: input.loanId,
          newValue: {
            action: 'DEACTIVATE',
            isActive: false,
          },
        });
        return loan;
      }),
  });
}
