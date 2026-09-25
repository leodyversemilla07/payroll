import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { RouterContext } from './router-context';

// Centavos arrive as decimal strings so browsers never round large amounts.
const centsInput = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform(BigInt);
const referenceInput = z.string().trim().min(1).max(160);

async function withEvidenceErrors<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ConflictException) {
      throw new TRPCError({ code: 'CONFLICT', message: error.message });
    }
    if (error instanceof NotFoundException) {
      throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
    }
    if (error instanceof UnprocessableEntityException) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
    }
    throw error;
  }
}

export function createComplianceRouter(ctx: RouterContext) {
  const {
    trpc,
    payrollProcedure,
    hrProcedure,
    complianceService,
    auditService,
  } = ctx;

  return trpc.router({
    recordPriorEmployerDeclaration: hrProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          taxYear: z.number().int().min(2023).max(2100),
          hasPriorEmployer: z.boolean(),
          sourceReference: referenceInput,
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const record = await withEvidenceErrors(() =>
          complianceService.recordPriorEmployerDeclaration({
            ...input,
            organizationId: ctx.user.organizationId,
            recordedById: ctx.user.id,
          }),
        );
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'CREATE',
          entityType: 'PriorEmployerDeclaration',
          entityId: record.id,
          newValue: {
            employeeId: input.employeeId,
            taxYear: input.taxYear,
            hasPriorEmployer: input.hasPriorEmployer,
          },
        });
        return record;
      }),

    recordPreviousEmployerIncome: hrProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          taxYear: z.number().int().min(2023).max(2100),
          employerName: z.string().trim().min(1).max(200),
          employerTin: z
            .string()
            .trim()
            .regex(/^[0-9-]{9,20}$/),
          periodStart: z.string().date(),
          periodEnd: z.string().date(),
          grossCompensationCents: centsInput,
          taxableCompensationCents: centsInput,
          taxWithheldCents: centsInput,
          documentReference: referenceInput,
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const record = await withEvidenceErrors(() =>
          complianceService.recordPreviousEmployerIncome({
            ...input,
            organizationId: ctx.user.organizationId,
            recordedById: ctx.user.id,
            periodStart: new Date(`${input.periodStart}T00:00:00.000Z`),
            periodEnd: new Date(`${input.periodEnd}T00:00:00.000Z`),
          }),
        );
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'CREATE',
          entityType: 'PreviousEmployerIncome',
          entityId: record.id,
          newValue: { employeeId: input.employeeId, taxYear: input.taxYear },
        });
        return record;
      }),

    recordMonthlyTaxRemittance: hrProcedure
      .input(
        z.object({
          taxYear: z.number().int().min(2023).max(2100),
          month: z.number().int().min(1).max(12),
          remittedCents: centsInput,
          documentReference: referenceInput,
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const record = await withEvidenceErrors(() =>
          complianceService.recordMonthlyTaxRemittance({
            ...input,
            organizationId: ctx.user.organizationId,
            recordedById: ctx.user.id,
          }),
        );
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'CREATE',
          entityType: 'MonthlyTaxRemittanceEvidence',
          entityId: record.id,
          newValue: { taxYear: input.taxYear, month: input.month },
        });
        return record;
      }),

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

    getTaxEvidence: payrollProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          taxYear: z.number().int().min(2023).max(2100),
        }),
      )
      .query(({ input, ctx }) =>
        withEvidenceErrors(() =>
          complianceService.getTaxEvidence(
            input.employeeId,
            ctx.user.organizationId,
            input.taxYear,
          ),
        ),
      ),

    listYearEndReconciliations: payrollProcedure
      .input(z.object({ taxYear: z.number().int().min(2023).max(2100) }))
      .query(({ input, ctx }) =>
        complianceService.listYearEndReconciliations(
          ctx.user.organizationId,
          input.taxYear,
        ),
      ),

    previewBir2316Reconciliation: payrollProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          taxYear: z.number().int().min(2023).max(2100).optional(),
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
          entityType: 'BIR2316Reconciliation',
          entityId: input.employeeId,
          newValue: { taxYear: input.taxYear },
        });
        return result;
      }),

    exportDole13thMonth: payrollProcedure
      .input(
        z.object({
          taxYear: z.number().int().min(2020).max(2100).optional(),
          natureOfBusiness: z.string().trim().min(1).max(200),
          contactPerson: z.string().trim().min(1).max(200),
          contactNumber: z.string().trim().min(1).max(50),
          contactTitle: z.string().trim().min(1).max(200),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const result = await complianceService.generateDole13thMonthReport(
          ctx.user.organizationId,
          {
            natureOfBusiness: input.natureOfBusiness,
            contactPerson: input.contactPerson,
            contactNumber: input.contactNumber,
            contactTitle: input.contactTitle,
          },
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
  });
}
