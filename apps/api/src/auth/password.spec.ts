import { hashPassword, verifyPassword } from './password';

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
