import {
  base32Decode,
  base32Encode,
  formatOtpauthUri,
  generateBackupCodes,
  generateTotpCode,
  generateTotpSecret,
  hashBackupCode,
  verifyAndConsumeBackupCode,
  verifyTotpCode,
} from './totp';

describe('TOTP (RFC 6238 / RFC 4226)', () => {
  it('encodes and decodes base32 correctly', () => {
    const raw = Buffer.from('Hello, World! 12345', 'utf8');
    const encoded = base32Encode(raw);
    const decoded = base32Decode(encoded);
    expect(decoded.toString('utf8')).toBe('Hello, World! 12345');
  });

  it('generates a 32-character base32 secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(32);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('generates consistent 6-digit codes for a given counter', () => {
    const secret = generateTotpSecret();
    const code1 = generateTotpCode(secret, 123456);
    const code2 = generateTotpCode(secret, 123456);
    expect(code1).toHaveLength(6);
    expect(/^\d{6}$/.test(code1)).toBe(true);
    expect(code1).toBe(code2);
  });

  it('verifies valid codes within window and rejects invalid ones', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const currentStep = Math.floor(now / 1000 / 30);
    const validCurrentCode = generateTotpCode(secret, currentStep);
    const validPrevCode = generateTotpCode(secret, currentStep - 1);
    const validNextCode = generateTotpCode(secret, currentStep + 1);
    const invalidExpiredCode = generateTotpCode(secret, currentStep - 5);

    expect(verifyTotpCode(secret, validCurrentCode, now)).toBe(true);
    expect(verifyTotpCode(secret, validPrevCode, now)).toBe(true);
    expect(verifyTotpCode(secret, validNextCode, now)).toBe(true);
    expect(verifyTotpCode(secret, invalidExpiredCode, now)).toBe(false);
    expect(verifyTotpCode(secret, '123456', now)).toBe(false);
    expect(verifyTotpCode(secret, 'abc', now)).toBe(false);
  });

  it('formats standard otpauth URI correctly', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const uri = formatOtpauthUri('user@example.com', secret, 'Payroll');
    expect(uri).toBe(
      'otpauth://totp/Payroll:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Payroll&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('generates, hashes, and consumes single-use backup codes', () => {
    const codes = generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    }

    const hashedCodes = codes.map(hashBackupCode);
    expect(hashedCodes).toHaveLength(10);

    // Consume first code
    const result1 = verifyAndConsumeBackupCode(codes[0], hashedCodes);
    expect(result1).not.toBeNull();
    expect(result1?.remainingHashes).toHaveLength(9);
    expect(result1?.consumedHash).toBe(hashedCodes[0]);

    // Consuming same code again should fail
    const result2 = verifyAndConsumeBackupCode(
      codes[0],
      result1?.remainingHashes ?? [],
    );
    expect(result2).toBeNull();

    // Consuming invalid code should fail
    const result3 = verifyAndConsumeBackupCode(
      'INVALID-CODE',
      result1?.remainingHashes ?? [],
    );
    expect(result3).toBeNull();
  });
});
