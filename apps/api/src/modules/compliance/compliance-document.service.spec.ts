import type { StorageService } from '../../infrastructure/storage/storage.service';
import { ComplianceDocumentService } from './compliance-document.service';

describe('ComplianceDocumentService', () => {
  const service = new ComplianceDocumentService({} as StorageService);

  const validInput = {
    organizationId: 'org-1',
    entityType: 'PreviousEmployerIncome',
    entityId: 'record-1',
    originalName: 'previous-2316.pdf',
    contentType: 'application/pdf',
    dataBase64: Buffer.from('%PDF-test').toString('base64'),
    uploadedById: 'user-1',
  };

  it('rejects malformed base64 before touching the database or storage', async () => {
    await expect(
      service.upload({ ...validInput, dataBase64: 'not base64' }),
    ).rejects.toThrow('Invalid base64 document data');
  });

  it('rejects unsupported content types', async () => {
    await expect(
      service.upload({
        ...validInput,
        contentType: 'text/plain',
      }),
    ).rejects.toThrow('Only PDF, JPEG, and PNG source documents are accepted');
  });

  it('rejects empty base64 payloads', async () => {
    await expect(
      service.upload({
        ...validInput,
        dataBase64: Buffer.from('').toString('base64'),
      }),
    ).rejects.toThrow('Invalid base64 document data');
  });
});
