import {
  hashDocumentPassword,
  hashPassword,
  verifyDocumentPassword,
  verifyPassword,
} from './password';

describe('password hashing', () => {
  it('hashes and verifies a password without storing the plaintext', async () => {
    const password = 'correct horse battery staple';
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^scrypt\$v=1\$/);
    expect(hash).not.toContain(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('incorrect password', hash)).resolves.toBe(
      false,
    );
  });

  it('rejects short passwords when provisioning users', async () => {
    await expect(hashPassword('too-short')).rejects.toThrow(
      'Password must contain at least 12 characters',
    );
  });

  it('rejects malformed or unsupported hashes', async () => {
    await expect(verifyPassword('any password', 'invalid')).resolves.toBe(
      false,
    );
  });
});

describe('document password hashing', () => {
  it('hashes a short DOB password with a unique salt per document', async () => {
    const first = await hashDocumentPassword('01011995');
    const second = await hashDocumentPassword('01011995');

    expect(first).toMatch(/^pdfscrypt\$v=1\$/);
    expect(first).not.toContain('01011995');
    expect(second).not.toBe(first);
    await expect(verifyDocumentPassword('01011995', first)).resolves.toBe(true);
    await expect(verifyDocumentPassword('01011995', second)).resolves.toBe(
      true,
    );
    await expect(verifyDocumentPassword('02021995', first)).resolves.toBe(
      false,
    );
  });

  it('rejects empty document passwords', async () => {
    await expect(hashDocumentPassword('')).rejects.toThrow(
      'Document password must not be empty',
    );
  });

  it('treats legacy unsalted hashes as unverifiable, never throwing', async () => {
    const legacySha256 =
      '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb0579';
    await expect(
      verifyDocumentPassword('01011995', legacySha256),
    ).resolves.toBe(false);
    await expect(verifyDocumentPassword('01011995', 'invalid')).resolves.toBe(
      false,
    );
  });
});
