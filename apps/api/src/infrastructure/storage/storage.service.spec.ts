import { StorageService } from './storage.service';

describe('StorageService', () => {
  it.each([
    '../escape.pdf',
    'nested/../../escape.pdf',
    '/etc/passwd',
    'local:///etc/passwd',
    'C:\\escape.pdf',
  ])('rejects unsafe storage key %s on upload', async (key) => {
    const service = new StorageService();

    await expect(service.upload(key, Buffer.from('test'))).rejects.toThrow(
      'Invalid storage key',
    );
  });

  it('rejects unsafe local storage paths on read', async () => {
    const service = new StorageService();

    await expect(service.getFile('local://../escape.pdf')).rejects.toThrow(
      'Invalid storage key',
    );
  });
});
