import { z } from 'zod';
import type { RouterContext } from './router-context';

export function createComplianceRouter(ctx: RouterContext) {
  const { trpc, payrollProcedure, complianceService, auditService } = ctx;

  return trpc.router({
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
