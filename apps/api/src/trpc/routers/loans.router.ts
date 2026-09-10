import { z } from 'zod';
import { PAYROLL_ROLES, assertEmployeeAccess } from './router-context';
import type { RouterContext } from './router-context';

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
  });
}
