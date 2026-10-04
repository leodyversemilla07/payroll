import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer into RFC 4648 Base32 string (without padding).
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i] ?? 0;
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      const char = BASE32_ALPHABET[(value >>> (bits - 5)) & 31] ?? '';
      output += char;
      bits -= 5;
    }
  }

  if (bits > 0) {
    const char = BASE32_ALPHABET[(value << (5 - bits)) & 31] ?? '';
    output += char;
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string into a Buffer.
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === undefined) {
      continue;
    }
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a random 20-byte base32 TOTP secret.
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * Generates a 6-digit TOTP code for a secret and counter (RFC 6238 / RFC 4226).
 */
export function generateTotpCode(secret: string, counter: number): string {
  const secretBytes = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', secretBytes);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const lastByte = digest[digest.length - 1] ?? 0;
  const offset = lastByte & 0x0f;
  const b0 = digest[offset] ?? 0;
  const b1 = digest[offset + 1] ?? 0;
  const b2 = digest[offset + 2] ?? 0;
  const b3 = digest[offset + 3] ?? 0;
  const binary =
    ((b0 & 0x7f) << 24) |
    ((b1 & 0xff) << 16) |
    ((b2 & 0xff) << 8) |
    (b3 & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code with +/- 1 time step (30s) tolerance.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  timestampMs = Date.now(),
  windowSteps = 1,
): boolean {
  const normalizedCode = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  const currentStep = Math.floor(timestampMs / 1000 / 30);
  const targetBuffer = Buffer.from(normalizedCode, 'utf8');

  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const candidate = generateTotpCode(secret, currentStep + offset);
    const candidateBuffer = Buffer.from(candidate, 'utf8');
    if (
      targetBuffer.length === candidateBuffer.length &&
      timingSafeEqual(targetBuffer, candidateBuffer)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Formats an otpauth URI for authenticator app QR code scanning.
 */
export function formatOtpauthUri(
  accountName: string,
  secret: string,
  issuer = 'SweldoPH',
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates 10 human-friendly 8-character backup codes.
 */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * Hashes a backup code with SHA-256 for secure database storage.
 */
export function hashBackupCode(code: string): string {
  const normalized = code.replace(/[\s-]/g, '').toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Verifies and consumes a backup code against an array of hashed backup codes.
 * Returns the consumed code hash if matched, or null otherwise.
 */
export function verifyAndConsumeBackupCode(
  rawCode: string,
  hashedCodes: string[],
): { consumedHash: string; remainingHashes: string[] } | null {
  const inputHash = hashBackupCode(rawCode);
  const index = hashedCodes.indexOf(inputHash);
  if (index === -1) {
    return null;
  }

  const remainingHashes = [...hashedCodes];
  remainingHashes.splice(index, 1);
  return { consumedHash: inputHash, remainingHashes };
}
