import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { PayrollMutationAudit } from '../../modules/payroll/payroll.service';
import type { Context } from '../trpc.service';
import type { RouterContext } from './router-context';
import {
  PAYROLL_APPROVAL_ROLES,
  PAYROLL_TRIGGER_ROLES,
} from './router-context';

async function withPayrollErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code =
      error instanceof NotFoundException
        ? 'NOT_FOUND'
        : error instanceof ForbiddenException
          ? 'FORBIDDEN'
          : error instanceof ConflictException
            ? 'CONFLICT'
            : error instanceof UnprocessableEntityException
              ? 'UNPROCESSABLE_CONTENT'
              : error instanceof BadRequestException
                ? 'BAD_REQUEST'
                : 'INTERNAL_SERVER_ERROR';
    throw new TRPCError({
      code,
      message:
        code === 'INTERNAL_SERVER_ERROR'
          ? 'Payroll request failed. Please retry.'
          : (error as Error).message,
      cause: error,
    });
  }
}

export function createPayrollRouter(ctx: RouterContext) {
  const { trpc, payrollProcedure, payrollService, auditService } = ctx;
  const payrollTriggerProcedure = trpc.procedureForRoles(PAYROLL_TRIGGER_ROLES);
  const auditRun =
    (
      context: { user: NonNullable<Context['user']>; req: Context['req'] },
      action: 'CREATE' | 'APPROVE' | 'UPDATE',
    ): PayrollMutationAudit =>
    async ({ previous, run, transaction }) => {
      await auditService.record(
        {
          user: context.user,
          request: context.req,
          action,
          entityType: 'PayrollRun',
          entityId: run.id,
          previousValue: previous ?? undefined,
          newValue: run,
        },
        transaction,
      );
    };

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

    triggerRun: payrollTriggerProcedure
      .input(
        z.object({
          cutoffStartDate: z.string().date(),
          cutoffEndDate: z.string().date(),
          paymentDate: z.string().date(),
          cutoffSequence: z.enum(['FIRST_CUTOFF', 'SECOND_CUTOFF']),
        }),
      )
      .mutation(({ input, ctx }) =>
        withPayrollErrors(() =>
          payrollService.executePayrollRun(
            {
              organizationId: ctx.user.organizationId,
              processedById: ctx.user.id,
              cutoffStartDate: new Date(input.cutoffStartDate),
              cutoffEndDate: new Date(input.cutoffEndDate),
              paymentDate: new Date(input.paymentDate),
              cutoffSequence: input.cutoffSequence,
            },
            auditRun(ctx, 'CREATE'),
          ),
        ),
      ),

    triggerThirteenthMonthRun: payrollTriggerProcedure
      .input(
        z.object({
          cutoffStartDate: z.string().date(),
          cutoffEndDate: z.string().date(),
          paymentDate: z.string().date(),
        }),
      )
      .mutation(({ input, ctx }) =>
        withPayrollErrors(() =>
          payrollService.executeThirteenthMonthRun(
            {
              organizationId: ctx.user.organizationId,
              processedById: ctx.user.id,
              cutoffStartDate: new Date(input.cutoffStartDate),
              cutoffEndDate: new Date(input.cutoffEndDate),
              paymentDate: new Date(input.paymentDate),
            },
            auditRun(ctx, 'CREATE'),
          ),
        ),
      ),

    approveRun: trpc
      .procedureForRoles(PAYROLL_APPROVAL_ROLES)
      .input(z.object({ runId: z.string().uuid() }))
      .mutation(({ input, ctx }) =>
        withPayrollErrors(() =>
          payrollService.approvePayrollRun(
            {
              runId: input.runId,
              organizationId: ctx.user.organizationId,
              approvedById: ctx.user.id,
            },
            auditRun(ctx, 'APPROVE'),
          ),
        ),
      ),

    disburseRun: payrollProcedure
      .input(z.object({ runId: z.string().uuid() }))
      .mutation(({ input, ctx }) =>
        withPayrollErrors(() =>
          payrollService.disbursePayrollRun(
            {
              runId: input.runId,
              organizationId: ctx.user.organizationId,
            },
            auditRun(ctx, 'UPDATE'),
          ),
        ),
      ),

    cancelRun: payrollProcedure
      .input(z.object({ runId: z.string().uuid() }))
      .mutation(({ input, ctx }) =>
        withPayrollErrors(() =>
          payrollService.cancelPayrollRun(
            {
              runId: input.runId,
              organizationId: ctx.user.organizationId,
            },
            auditRun(ctx, 'UPDATE'),
          ),
        ),
      ),
  });
}
