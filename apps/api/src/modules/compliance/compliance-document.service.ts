import { createHash, randomUUID } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Prisma, prisma } from '@workspace/db';
import { StorageService } from '../../infrastructure/storage/storage.service';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

function safeFileName(name: string): string {
  const normalized = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return normalized.slice(0, 160) || 'document';
}

@Injectable()
export class ComplianceDocumentService {
  private database: Prisma.TransactionClient = prisma;

  constructor(private readonly storage: StorageService) {}

  withDatabase(database: Prisma.TransactionClient): ComplianceDocumentService {
    const service = new ComplianceDocumentService(this.storage);
    service.database = database;
    return service;
  }

  async upload(input: {
    organizationId: string;
    employeeId?: string;
    entityType: string;
    entityId: string;
    originalName: string;
    contentType: string;
    dataBase64: string;
    uploadedById: string;
  }) {
    if (
      !input.dataBase64 ||
      input.dataBase64.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        input.dataBase64,
      )
    ) {
      throw new UnprocessableEntityException('Invalid base64 document data');
    }
    if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
      throw new UnprocessableEntityException(
        'Only PDF, JPEG, and PNG source documents are accepted',
      );
    }

    const body = Buffer.from(input.dataBase64, 'base64');
    if (!body.length || body.length > MAX_DOCUMENT_BYTES) {
      throw new UnprocessableEntityException(
        'Source document must be between 1 byte and 10 MiB',
      );
    }

    if (input.employeeId) {
      const employee = await this.database.employee.findFirst({
        where: { id: input.employeeId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!employee) throw new NotFoundException('Employee not found');
    }

    const targetExists = await this.targetExists(
      input.organizationId,
      input.entityType,
      input.entityId,
    );
    if (!targetExists) {
      throw new NotFoundException('Compliance evidence record not found');
    }

    const id = randomUUID();
    const storagePath = `organizations/${input.organizationId}/compliance/${id}/${safeFileName(input.originalName)}`;
    const uploaded = await this.storage.upload(
      storagePath,
      body,
      input.contentType,
    );

    return this.database.complianceDocument.create({
      data: {
        id,
        organizationId: input.organizationId,
        employeeId: input.employeeId,
        entityType: input.entityType,
        entityId: input.entityId,
        originalName: safeFileName(input.originalName),
        contentType: input.contentType,
        byteSize: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
        storagePath: uploaded.path,
        uploadedById: input.uploadedById,
      },
      select: {
        id: true,
        employeeId: true,
        entityType: true,
        entityId: true,
        originalName: true,
        contentType: true,
        byteSize: true,
        sha256: true,
        createdAt: true,
      },
    });
  }

  private async targetExists(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<boolean> {
    const where = { id: entityId, organizationId };
    switch (entityType) {
      case 'PriorEmployerDeclaration':
        return Boolean(
          await this.database.priorEmployerDeclaration.findFirst({
            where,
            select: { id: true },
          }),
        );
      case 'PreviousEmployerIncome':
        return Boolean(
          await this.database.previousEmployerIncome.findFirst({
            where,
            select: { id: true },
          }),
        );
      case 'MonthlyTaxRemittanceEvidence':
        return Boolean(
          await this.database.monthlyTaxRemittanceEvidence.findFirst({
            where,
            select: { id: true },
          }),
        );
      case 'YearEndTaxSettlement':
        return Boolean(
          await this.database.yearEndTaxSettlement.findFirst({
            where,
            select: { id: true },
          }),
        );
      case 'TaxEvidenceCorrection':
        return Boolean(
          await this.database.taxEvidenceCorrection.findFirst({
            where,
            select: { id: true },
          }),
        );
      default:
        return false;
    }
  }

  list(input: {
    organizationId: string;
    entityType: string;
    entityId: string;
  }) {
    return this.database.complianceDocument.findMany({
      where: input,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        employeeId: true,
        entityType: true,
        entityId: true,
        originalName: true,
        contentType: true,
        byteSize: true,
        sha256: true,
        createdAt: true,
      },
    });
  }

  async read(input: { organizationId: string; id: string }) {
    const document = await this.database.complianceDocument.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
    });
    if (!document) throw new NotFoundException('Compliance document not found');

    const file = await this.storage.getFile(document.storagePath);
    if (!file)
      throw new NotFoundException('Compliance document content not found');

    return {
      fileName: document.originalName,
      contentType: document.contentType,
      sha256: document.sha256,
      dataBase64: file.buffer.toString('base64'),
    };
  }
}
