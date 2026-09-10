import { z } from 'zod';
import {
  PAYROLL_APPROVAL_ROLES,
  PAYROLL_TRIGGER_ROLES,
} from './router-context';
import type { RouterContext } from './router-context';

export function createPayrollRouter(ctx: RouterContext) {
  const { trpc, payrollProcedure, payrollService, auditService } = ctx;
  const payrollTriggerProcedure = trpc.procedureForRoles(
    PAYROLL_TRIGGER_ROLES,
  );

  return trpc.router({
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

    triggerRun: payrollTriggerProcedure.input(
        z.object({
          cutoffStartDate: z.string().date(),
          cutoffEndDate: z.string().date(),
          paymentDate: z.string().date(),
          cutoffSequence: z.enum(['FIRST_CUTOFF', 'SECOND_CUTOFF']),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const payrollRun = await payrollService.executePayrollRun({
          organizationId: ctx.user.organizationId,
          processedById: ctx.user.id,
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

    triggerThirteenthMonthRun: payrollTriggerProcedure
      .input(
        z.object({
          cutoffStartDate: z.string().date(),
          cutoffEndDate: z.string().date(),
          paymentDate: z.string().date(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const payrollRun = await payrollService.executeThirteenthMonthRun({
          organizationId: ctx.user.organizationId,
          processedById: ctx.user.id,
          cutoffStartDate: new Date(input.cutoffStartDate),
          cutoffEndDate: new Date(input.cutoffEndDate),
          paymentDate: new Date(input.paymentDate),
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

    approveRun: trpc
      .procedureForRoles(PAYROLL_APPROVAL_ROLES)
      .input(z.object({ runId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const payrollRun = await payrollService.approvePayrollRun({
          runId: input.runId,
          organizationId: ctx.user.organizationId,
          approvedById: ctx.user.id,
        });
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'APPROVE',
          entityType: 'PayrollRun',
          entityId: payrollRun.id,
          newValue: { status: payrollRun.status },
        });
        return payrollRun;
      }),

    disburseRun: payrollProcedure
      .input(z.object({ runId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const payrollRun = await payrollService.disbursePayrollRun({
          runId: input.runId,
          organizationId: ctx.user.organizationId,
        });
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'UPDATE',
          entityType: 'PayrollRun',
          entityId: payrollRun.id,
          newValue: { status: payrollRun.status },
        });
        return payrollRun;
      }),

    cancelRun: payrollProcedure
      .input(z.object({ runId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const result = await payrollService.cancelPayrollRun({
          runId: input.runId,
          organizationId: ctx.user.organizationId,
        });
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'UPDATE',
          entityType: 'PayrollRun',
          entityId: result.runId,
        });
        return result;
      }),
  });
}
