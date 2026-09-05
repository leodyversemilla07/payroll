import {
  scrypt as nodeScrypt,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function deriveKey(
  password: string,
  salt: string,
  cost = COST,
  blockSize = BLOCK_SIZE,
  parallelization = PARALLELIZATION,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: cost, r: blockSize, p: parallelization },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(key);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error('Password must contain at least 12 characters');
  }

  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt);

  return [
    'scrypt',
    'v=1',
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELIZATION),
    salt,
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [
    algorithm,
    version,
    costValue,
    blockSizeValue,
    parallelValue,
    salt,
    encodedKey,
  ] = encodedHash.split('$');

  const cost = Number(costValue);
  const blockSize = Number(blockSizeValue);
  const parallelization = Number(parallelValue);

  if (
    algorithm !== 'scrypt' ||
    version !== 'v=1' ||
    cost !== COST ||
    blockSize !== BLOCK_SIZE ||
    parallelization !== PARALLELIZATION ||
    !salt ||
    !encodedKey
  ) {
    return false;
  }

  const expectedKey = Buffer.from(encodedKey, 'base64url');
  if (expectedKey.length !== KEY_LENGTH) {
    return false;
  }

  const actualKey = await deriveKey(
    password,
    salt,
    cost,
    blockSize,
    parallelization,
  );

  return timingSafeEqual(actualKey, expectedKey);
}
