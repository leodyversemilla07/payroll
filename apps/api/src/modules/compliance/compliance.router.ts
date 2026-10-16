import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { Prisma, prisma, Role } from '@workspace/db';
import { manilaToday, manilaYear } from '@workspace/payroll-engine';
import { z } from 'zod';
import { TaxCorrectionService } from '../../modules/compliance/tax-correction.service';
import {
  type CorrectionKind,
  declarationCorrection,
  incomeCorrection,
  remittanceCorrection,
  settlementCorrection,
} from '../../modules/compliance/tax-correction.validation';
import type { RouterContext } from '../../trpc/router-context';
import type { Context } from '../../trpc/trpc.service';

// Centavos arrive as decimal strings so browsers never round large amounts.
const centsInput = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform(BigInt);
const referenceInput = z.string().trim().min(1).max(160);
const correctionReasonInput = z.string().trim().min(10).max(500);

async function withEvidenceErrors<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2034'].includes(error.code)
    )
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'Tax evidence changed concurrently or already has a pending correction. Reload before retrying.',
      });
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
    protectedProcedure,
    priorEmploymentService,
    monthlyRemittanceService,
    withholdingExportsService,
    yearEndTaxService,
    doleReportService,
    auditService,
  } = ctx;

  const submitCorrection = (
    userContext: Context & { user: NonNullable<Context['user']> },
    kind: CorrectionKind,
    input: unknown,
  ) =>
    withEvidenceErrors(() =>
      prisma.$transaction(
        async (transaction) => {
          const record = await new TaxCorrectionService(transaction).submit(
            userContext.user.organizationId,
            userContext.user.id,
            kind,
            input,
          );
          await auditService.record(
            {
              user: userContext.user,
              request: userContext.req,
              action: 'CREATE',
              entityType: 'TaxEvidenceCorrection',
              entityId: record.id,
              newValue: { kind, targetId: record.targetId, status: 'PENDING' },
            },
            transaction,
          );
          return record;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

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
      .mutation(({ input, ctx }) =>
        withEvidenceErrors(() =>
          prisma.$transaction(
            async (transaction) => {
              const record = await withEvidenceErrors(() =>
                priorEmploymentService
                  .withDatabase(transaction)
                  .recordPriorEmployerDeclaration({
                    ...input,
                    organizationId: ctx.user.organizationId,
                    recordedById: ctx.user.id,
                  }),
              );
              await auditService.record(
                {
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
                },
                transaction,
              );
              return record;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
        ),
      ),

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
      .mutation(({ input, ctx }) =>
        withEvidenceErrors(() =>
          prisma.$transaction(
            async (transaction) => {
              const record = await withEvidenceErrors(() =>
                priorEmploymentService
                  .withDatabase(transaction)
                  .recordPreviousEmployerIncome({
                    ...input,
                    organizationId: ctx.user.organizationId,
                    recordedById: ctx.user.id,
                    periodStart: new Date(`${input.periodStart}T00:00:00.000Z`),
                    periodEnd: new Date(`${input.periodEnd}T00:00:00.000Z`),
                  }),
              );
              await auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: 'CREATE',
                  entityType: 'PreviousEmployerIncome',
                  entityId: record.id,
                  newValue: {
                    employeeId: input.employeeId,
                    taxYear: input.taxYear,
                  },
                },
                transaction,
              );
              return record;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
        ),
      ),

    recordMonthlyTaxRemittance: hrProcedure
      .input(
        z.object({
          taxYear: z.number().int().min(2023).max(2100),
          month: z.number().int().min(1).max(12),
          remittedCents: centsInput,
          documentReference: referenceInput,
        }),
      )
      .mutation(({ input, ctx }) =>
        withEvidenceErrors(() =>
          prisma.$transaction(
            async (transaction) => {
              const record = await withEvidenceErrors(() =>
                monthlyRemittanceService
                  .withDatabase(transaction)
                  .recordMonthlyTaxRemittance({
                    ...input,
                    organizationId: ctx.user.organizationId,
                    recordedById: ctx.user.id,
                  }),
              );
              await auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: 'CREATE',
                  entityType: 'MonthlyTaxRemittanceEvidence',
                  entityId: record.id,
                  newValue: { taxYear: input.taxYear, month: input.month },
                },
                transaction,
              );
              return record;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
        ),
      ),

    correctPriorEmployerDeclaration: hrProcedure
      .input(declarationCorrection)
      .mutation(({ input, ctx }) =>
        submitCorrection(ctx, 'DECLARATION', input),
      ),

    correctPreviousEmployerIncome: hrProcedure
      .input(incomeCorrection)
      .mutation(({ input, ctx }) =>
        submitCorrection(ctx, 'PREVIOUS_INCOME', input),
      ),

    correctMonthlyTaxRemittance: hrProcedure
      .input(remittanceCorrection)
      .mutation(({ input, ctx }) => submitCorrection(ctx, 'REMITTANCE', input)),

    listTaxCorrections: payrollProcedure
      .input(z.object({ taxYear: z.number().int().min(2023).max(2100) }))
      .query(({ input, ctx }) =>
        prisma.$transaction(
          (transaction) =>
            new TaxCorrectionService(transaction).list(
              ctx.user.organizationId,
              input.taxYear,
            ),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: 60_000,
          },
        ),
      ),

    reviewTaxCorrection: hrProcedure
      .input(
        z
          .object({
            id: z.string().uuid(),
            decision: z.enum(['APPROVE', 'REJECT']),
            reviewReason: correctionReasonInput,
          })
          .strict(),
      )
      .mutation(({ input, ctx }) =>
        withEvidenceErrors(() =>
          prisma.$transaction(
            async (transaction) => {
              const record = await new TaxCorrectionService(transaction).review(
                ctx.user.organizationId,
                ctx.user.id,
                input.id,
                input.decision,
                input.reviewReason,
              );
              await auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: 'UPDATE',
                  entityType: 'TaxEvidenceCorrection',
                  entityId: record.id,
                  previousValue: { status: 'PENDING' },
                  newValue: {
                    status: record.status,
                    publishedRecordId: record.publishedRecordId,
                    reviewedById: ctx.user.id,
                    reviewReason: input.reviewReason,
                  },
                },
                transaction,
              );
              return record;
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              timeout: 60_000,
            },
          ),
        ),
      ),

    exportBankTransmittal: payrollProcedure
      .input(
        z.object({
          payrollRunId: z.string().uuid(),
          bankFormat: z.enum(['BDO', 'BPI', 'UNIONBANK', 'METROBANK']),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const csvContent =
          await withholdingExportsService.generateBankTransmittalCsv(
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
          filename: `${input.bankFormat}_Transmittal_${manilaToday()}.csv`,
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
        const result = await withholdingExportsService.getBir1601CSummary(
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
          monthlyRemittanceService.getTaxEvidence(
            input.employeeId,
            ctx.user.organizationId,
            input.taxYear,
          ),
        ),
      ),

    listYearEndReconciliations: payrollProcedure
      .input(z.object({ taxYear: z.number().int().min(2023).max(2100) }))
      .query(({ input, ctx }) =>
        prisma.$transaction(
          (transaction) =>
            yearEndTaxService
              .withDatabase(transaction)
              .listYearEndReconciliations(
                ctx.user.organizationId,
                input.taxYear,
              ),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: 60_000,
          },
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
        const result = await yearEndTaxService.generateBir2316(
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

    recordYearEndSettlement: payrollProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          taxYear: z.number().int().min(2023).max(2100),
          settlementDate: z.string().date(),
          documentReference: referenceInput,
        }),
      )
      .mutation(({ input, ctx }) =>
        withEvidenceErrors(() =>
          prisma.$transaction(
            async (transaction) => {
              const record = await withEvidenceErrors(() =>
                yearEndTaxService
                  .withDatabase(transaction)
                  .recordYearEndSettlement({
                    employeeId: input.employeeId,
                    organizationId: ctx.user.organizationId,
                    taxYear: input.taxYear,
                    settlementDate: new Date(
                      `${input.settlementDate}T00:00:00.000Z`,
                    ),
                    documentReference: input.documentReference,
                    recordedById: ctx.user.id,
                  }),
              );
              await auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: 'CREATE',
                  entityType: 'YearEndTaxSettlement',
                  entityId: record.id,
                  newValue: {
                    employeeId: input.employeeId,
                    taxYear: input.taxYear,
                    settlementType: record.settlementType,
                  },
                },
                transaction,
              );
              return record;
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              timeout: 60_000,
            },
          ),
        ),
      ),

    correctYearEndSettlement: payrollProcedure
      .input(settlementCorrection)
      .mutation(({ input, ctx }) => submitCorrection(ctx, 'SETTLEMENT', input)),

    issueBir2316: hrProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          taxYear: z.number().int().min(2023).max(2100),
        }),
      )
      .mutation(({ input, ctx }) =>
        withEvidenceErrors(() =>
          prisma.$transaction(
            async (transaction) => {
              const pending = await transaction.taxEvidenceCorrection.count({
                where: {
                  organizationId: ctx.user.organizationId,
                  taxYear: input.taxYear,
                  status: 'PENDING',
                  OR: [
                    { employeeId: input.employeeId },
                    { kind: 'REMITTANCE' },
                  ],
                },
              });
              if (pending)
                throw new ConflictException(
                  'Resolve pending tax evidence corrections before issuing a certificate',
                );
              const record = await withEvidenceErrors(() =>
                yearEndTaxService.withDatabase(transaction).issueBir2316({
                  employeeId: input.employeeId,
                  organizationId: ctx.user.organizationId,
                  taxYear: input.taxYear,
                  issuedById: ctx.user.id,
                }),
              );
              await auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: 'CREATE',
                  entityType: 'Bir2316Issuance',
                  entityId: record.id,
                  newValue: {
                    employeeId: input.employeeId,
                    taxYear: input.taxYear,
                  },
                },
                transaction,
              );
              return record;
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              timeout: 60_000,
            },
          ),
        ),
      ),

    voidBir2316Issuance: hrProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          taxYear: z.number().int().min(2023).max(2100),
          voidReason: correctionReasonInput,
        }),
      )
      .mutation(({ input, ctx }) =>
        withEvidenceErrors(() =>
          prisma.$transaction(
            async (transaction) => {
              const record = await withEvidenceErrors(() =>
                yearEndTaxService
                  .withDatabase(transaction)
                  .voidBir2316Issuance({
                    employeeId: input.employeeId,
                    organizationId: ctx.user.organizationId,
                    taxYear: input.taxYear,
                    voidReason: input.voidReason,
                    voidedById: ctx.user.id,
                  }),
              );
              await auditService.record(
                {
                  user: ctx.user,
                  request: ctx.req,
                  action: 'UPDATE',
                  entityType: 'Bir2316Issuance',
                  entityId: record.id,
                  newValue: { status: record.status },
                },
                transaction,
              );
              return record;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
        ),
      ),

    getBir2316Issuance: protectedProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          taxYear: z.number().int().min(2023).max(2100),
        }),
      )
      .query(({ input, ctx }) => {
        const isStaff =
          ctx.user.role === Role.SUPER_ADMIN ||
          ctx.user.role === Role.HR_ADMIN ||
          ctx.user.role === Role.PAYROLL_SPECIALIST;
        const isOwn = Boolean(
          ctx.user.employeeId && ctx.user.employeeId === input.employeeId,
        );

        if (!isStaff && !isOwn) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You do not have permission to access this employee record',
          });
        }

        return withEvidenceErrors(() =>
          prisma.$transaction(
            (transaction) =>
              yearEndTaxService
                .withDatabase(transaction)
                .getBir2316Issuance(
                  input.employeeId,
                  ctx.user.organizationId,
                  input.taxYear,
                ),
            { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
          ),
        );
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
        const result = await doleReportService.generateDole13thMonthReport(
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

    exportBir1604CAlphalist: payrollProcedure
      .input(
        z.object({
          taxYear: z.number().int().min(2023).max(2100).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const result = await yearEndTaxService.generateBir1604CAlphalist(
          ctx.user.organizationId,
          input.taxYear,
        );
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'EXPORT',
          entityType: 'Bir1604CAlphalist',
          entityId: `${ctx.user.organizationId}:${result.taxYear}`,
        });
        return result;
      }),

    downloadBir2316Pdf: protectedProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          taxYear: z.number().int().min(2023).max(2100).optional(),
          isPreview: z.boolean().optional(),
        }),
      )
      .query(async ({ input, ctx }) => {
        const isStaff =
          ctx.user.role === Role.SUPER_ADMIN ||
          ctx.user.role === Role.HR_ADMIN ||
          ctx.user.role === Role.PAYROLL_SPECIALIST;

        const isOwn = Boolean(
          ctx.user.employeeId && ctx.user.employeeId === input.employeeId,
        );

        if (!isStaff && !isOwn) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You do not have permission to access this employee record',
          });
        }

        const taxYear = input.taxYear ?? manilaYear();

        if (!isStaff) {
          const issuance = await yearEndTaxService.getBir2316Issuance(
            input.employeeId,
            ctx.user.organizationId,
            taxYear,
          );
          if (issuance?.status !== 'ISSUED') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                'Official BIR Form 2316 has not yet been issued for this tax year',
            });
          }
        }

        const result = await yearEndTaxService.generateBir2316Pdf(
          input.employeeId,
          ctx.user.organizationId,
          taxYear,
          isStaff ? Boolean(input.isPreview) : false,
        );

        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'EXPORT',
          entityType: 'BIR2316Pdf',
          entityId: input.employeeId,
          newValue: { taxYear, isPreview: input.isPreview },
        });

        return result;
      }),
  });
}
