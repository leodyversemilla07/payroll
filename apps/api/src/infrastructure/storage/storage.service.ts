import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';

export interface StorageResult {
  path: string;
  url?: string;
}

function cleanStorageKey(value: string): string {
  const cleanKey = value
    .replace(/^s3:\/\/[^/]+\//, '')
    .replace(/^local:\/\//, '');

  if (
    !cleanKey ||
    isAbsolute(cleanKey) ||
    // A Windows drive-absolute path (e.g. "C:\\escape.pdf") is absolute on
    // Windows but looks relative to `path.isAbsolute` on POSIX hosts. Reject
    // the drive prefix explicitly so validation is identical on every host.
    /^[A-Za-z]:/.test(cleanKey) ||
    /^[/\\]/.test(cleanKey) ||
    cleanKey.split(/[/\\]+/).some((segment) => segment === '..')
  ) {
    throw new Error('Invalid storage key');
  }

  return cleanKey;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private readonly bucket: string;
  private readonly localStorageDir: string;
  private isS3Available: boolean | null = null;

  constructor() {
    this.bucket = process.env.S3_BUCKET_NAME || 'payroll-payslips';
    this.localStorageDir = join(process.cwd(), 'storage');

    if (
      process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY &&
      process.env.S3_ENDPOINT
    ) {
      try {
        this.s3Client = new S3Client({
          endpoint: process.env.S3_ENDPOINT,
          region: process.env.S3_REGION || 'us-east-1',
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
          },
          forcePathStyle: true,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to initialize S3 client: ${(err as Error).message}. Using local storage fallback.`,
        );
      }
    }
  }

  async upload(
    key: string,
    body: Buffer,
    contentType = 'application/pdf',
  ): Promise<StorageResult> {
    const cleanKey = cleanStorageKey(key);

    // Attempt S3 upload if configured
    if (this.s3Client && this.isS3Available !== false) {
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: cleanKey,
            Body: body,
            ContentType: contentType,
          }),
        );
        this.isS3Available = true;
        const presignedUrl = await this.getPresignedUrl(cleanKey).catch(
          () => undefined,
        );
        return {
          path: `s3://${this.bucket}/${cleanKey}`,
          url: presignedUrl,
        };
      } catch (error) {
        this.logger.warn(
          `S3 upload failed for ${cleanKey} (${(error as Error).message}). Falling back to local storage.`,
        );
        this.isS3Available = false;
      }
    }

    // Local filesystem fallback
    const targetFile = this.resolveLocalPath(cleanKey);
    const parentDir = dirname(targetFile);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }
    writeFileSync(targetFile, body);

    return {
      path: `local://${cleanKey}`,
    };
  }

  async getPresignedUrl(
    key: string,
    expiresIn = 3600,
  ): Promise<string | undefined> {
    if (!this.s3Client) {
      return undefined;
    }
    const cleanKey = cleanStorageKey(key);
    try {
      return await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: cleanKey,
        }),
        { expiresIn },
      );
    } catch {
      return undefined;
    }
  }

  async getFile(
    storagePath: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const isS3 = storagePath.startsWith('s3://');
    const cleanKey = cleanStorageKey(storagePath);

    if (isS3 && this.s3Client) {
      try {
        const response = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: cleanKey,
          }),
        );
        const byteArray = await response.Body?.transformToByteArray();
        if (byteArray) {
          return {
            buffer: Buffer.from(byteArray),
            contentType: response.ContentType || 'application/pdf',
          };
        }
      } catch (err) {
        this.logger.warn(
          `Could not read ${cleanKey} from S3: ${(err as Error).message}. Trying local storage.`,
        );
      }
    }

    // Local fallback check
    const localFile = this.resolveLocalPath(cleanKey);
    if (existsSync(localFile)) {
      return {
        buffer: readFileSync(localFile),
        contentType: 'application/pdf',
      };
    }

    return null;
  }

  private resolveLocalPath(cleanKey: string): string {
    const storageRoot = resolve(this.localStorageDir);
    const targetFile = resolve(storageRoot, cleanKey);
    const pathFromRoot = relative(storageRoot, targetFile);
    if (
      pathFromRoot === '..' ||
      pathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromRoot)
    ) {
      throw new Error('Invalid storage key');
    }
    return targetFile;
  }
}
