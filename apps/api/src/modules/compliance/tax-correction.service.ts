import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@workspace/db';
import { ComplianceService } from './compliance.service';
import {
  type CorrectionKind,
  type CorrectionPayload,
  declarationCorrection,
  incomeCorrection,
  parseCorrection,
  remittanceCorrection,
  settlementCorrection,
} from './tax-correction.validation';
import { sourceFingerprint } from './tax-source-fingerprint';

/** All writes use the API's serializable transaction, including its audit. */
export class TaxCorrectionService {
  constructor(private readonly database: Prisma.TransactionClient) {}

  private async assertActor(
    organizationId: string,
    userId: string,
    settlementMaker = false,
  ) {
    const actor = await this.database.user.findFirst({
      where: {
        id: userId,
        organizationId,
        isActive: true,
        role: {
          in: settlementMaker
            ? ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_SPECIALIST']
            : ['SUPER_ADMIN', 'HR_ADMIN'],
        },
      },
      select: { id: true },
    });
    if (!actor)
      throw new UnprocessableEntityException(
        'Tax correction requires an active authorized user in this organization',
      );
  }

  private async target(
    organizationId: string,
    kind: CorrectionKind,
    payload: CorrectionPayload,
  ) {
    const base = { organizationId, taxYear: payload.taxYear };
    const employeeId = 'employeeId' in payload ? payload.employeeId : undefined;
    if (
      employeeId &&
      !(await this.database.employee.findFirst({
        where: { id: employeeId, organizationId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Employee not found');
    switch (kind) {
      case 'DECLARATION':
        return this.database.priorEmployerDeclaration.findFirst({
          where: { ...base, employeeId },
          orderBy: { version: 'desc' },
        });
      case 'PREVIOUS_INCOME': {
        const data = incomeCorrection.parse(payload);
        return this.database.previousEmployerIncome.findFirst({
          where: {
            ...base,
            employeeId,
            employerTin: data.employerTin,
            periodStart: new Date(data.periodStart),
            periodEnd: new Date(data.periodEnd),
          },
          orderBy: { version: 'desc' },
        });
      }
      case 'REMITTANCE':
        return this.database.monthlyTaxRemittanceEvidence.findFirst({
          where: { ...base, month: remittanceCorrection.parse(payload).month },
          orderBy: { version: 'desc' },
        });
      case 'SETTLEMENT':
        return this.database.yearEndTaxSettlement.findFirst({
          where: { ...base, employeeId },
          orderBy: { version: 'desc' },
        });
    }
  }

  private async fingerprint(
    organizationId: string,
    kind: CorrectionKind,
    payload: CorrectionPayload,
    target: unknown,
  ) {
    return sourceFingerprint({
      target,
      settlementSources:
        kind === 'SETTLEMENT'
          ? await new ComplianceService()
              .withDatabase(this.database)
              .getTaxSourceFingerprint(
                'employeeId' in payload ? payload.employeeId : '',
                organizationId,
                payload.taxYear,
              )
          : null,
    });
  }

  async submit(
    organizationId: string,
    requestedById: string,
    kind: CorrectionKind,
    input: unknown,
  ) {
    const payload = parseCorrection(kind, input);
    await this.assertActor(
      organizationId,
      requestedById,
      kind === 'SETTLEMENT',
    );
    const target = await this.target(organizationId, kind, payload);
    if (!target) throw new NotFoundException('No evidence exists to correct');
    return this.database.taxEvidenceCorrection.create({
      data: {
        organizationId,
        requestedById,
        kind,
        targetId: target.id,
        taxYear: payload.taxYear,
        employeeId: 'employeeId' in payload ? payload.employeeId : null,
        payload,
        originalEvidence: JSON.parse(
          JSON.stringify(target, (_key, value: unknown) =>
            typeof value === 'bigint' ? value.toString() : value,
          ),
        ) as Prisma.InputJsonObject,
        sourceFingerprint: await this.fingerprint(
          organizationId,
          kind,
          payload,
          target,
        ),
      },
    });
  }

  async list(organizationId: string, taxYear: number) {
    const requests = await this.database.taxEvidenceCorrection.findMany({
      where: { organizationId, taxYear, status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    return Promise.all(
      requests.map(async (request) => {
        if (request.kind !== 'SETTLEMENT' || !request.employeeId)
          return { ...request, settlementPreview: null };
        try {
          const preview = await new ComplianceService()
            .withDatabase(this.database)
            .generateBir2316(request.employeeId, organizationId, taxYear);
          return {
            ...request,
            settlementPreview: {
              computedDifferenceCents:
                preview.certificate.partIVA.taxAdjustmentCents.toString(),
              sourceChanged:
                (await this.fingerprint(
                  organizationId,
                  'SETTLEMENT',
                  parseCorrection('SETTLEMENT', request.payload),
                  await this.target(
                    organizationId,
                    'SETTLEMENT',
                    parseCorrection('SETTLEMENT', request.payload),
                  ),
                )) !== request.sourceFingerprint,
            },
          };
        } catch (error) {
          if (
            error instanceof UnprocessableEntityException ||
            error instanceof NotFoundException ||
            error instanceof RangeError
          )
            return { ...request, settlementPreview: { error: error.message } };
          throw error;
        }
      }),
    );
  }

  async review(
    organizationId: string,
    reviewerId: string,
    id: string,
    decision: 'APPROVE' | 'REJECT',
    reviewReason: string,
  ) {
    await this.assertActor(organizationId, reviewerId);
    const pending = await this.database.taxEvidenceCorrection.findFirst({
      where: { id, organizationId },
    });
    if (!pending) throw new NotFoundException('Correction request not found');
    if (pending.status !== 'PENDING')
      throw new ConflictException(
        'Correction was already reviewed; reload the queue',
      );
    if (pending.requestedById === reviewerId)
      throw new UnprocessableEntityException(
        'A different signed-in HR/admin must review this correction (four-eyes)',
      );
    const reason = reviewReason.trim();
    if (reason.length < 10 || reason.length > 500)
      throw new UnprocessableEntityException(
        'Review requires a reason of 10–500 characters',
      );
    let publishedRecordId: string | null = null;
    if (decision === 'APPROVE') {
      const kind = pending.kind as CorrectionKind;
      const payload = parseCorrection(kind, pending.payload);
      await this.assertActor(
        organizationId,
        pending.requestedById,
        kind === 'SETTLEMENT',
      );
      const current = await this.target(organizationId, kind, payload);
      if (
        !current ||
        current.id !== pending.targetId ||
        (await this.fingerprint(organizationId, kind, payload, current)) !==
          pending.sourceFingerprint
      )
        throw new ConflictException(
          'Evidence changed since this correction was requested; reject it and submit a fresh proposal',
        );
      const service = new ComplianceService().withDatabase(this.database);
      const actors = {
        organizationId,
        recordedById: pending.requestedById,
        reviewerId,
      };
      switch (kind) {
        case 'DECLARATION':
          publishedRecordId = (
            await service.supersedePriorEmployerDeclaration({
              ...declarationCorrection.parse(payload),
              ...actors,
            })
          ).id;
          break;
        case 'PREVIOUS_INCOME': {
          const data = incomeCorrection.parse(payload);
          publishedRecordId = (
            await service.supersedePreviousEmployerIncome({
              ...data,
              ...actors,
              periodStart: new Date(data.periodStart),
              periodEnd: new Date(data.periodEnd),
              grossCompensationCents: BigInt(data.grossCompensationCents),
              taxableCompensationCents: BigInt(data.taxableCompensationCents),
              taxWithheldCents: BigInt(data.taxWithheldCents),
            })
          ).id;
          break;
        }
        case 'REMITTANCE': {
          const data = remittanceCorrection.parse(payload);
          publishedRecordId = (
            await service.supersedeMonthlyTaxRemittance({
              ...data,
              ...actors,
              remittedCents: BigInt(data.remittedCents),
            })
          ).id;
          break;
        }
        case 'SETTLEMENT': {
          const data = settlementCorrection.parse(payload);
          publishedRecordId = (
            await service.supersedeYearEndSettlement({
              ...data,
              ...actors,
              settlementDate: new Date(data.settlementDate),
            })
          ).id;
          break;
        }
      }
    }
    const changed = await this.database.taxEvidenceCorrection.updateMany({
      where: { id, organizationId, status: 'PENDING' },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewReason: reason,
        publishedRecordId,
      },
    });
    if (changed.count !== 1)
      throw new ConflictException(
        'Correction was reviewed concurrently; reload the queue',
      );
    return this.database.taxEvidenceCorrection.findFirstOrThrow({
      where: { id, organizationId },
    });
  }
}
