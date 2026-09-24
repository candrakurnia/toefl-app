import { Readable } from 'stream';
import { createReadStream } from 'fs';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

const LOCAL_PREFIX = 'local:';
const S3_PREFIX = 's3:';
const KEY_PATTERN = /^speaking\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

export const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
};

export interface ObjectStorageConfig {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpoint?: string;
}

/** `apps/api` both when compiled to `dist/` and when loaded from `src/`. */
export function apiPackageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function resolveMediaDir(): string {
  const configured = process.env.MEDIA_DIR?.trim();
  if (!configured) return path.join(apiPackageRoot(), 'uploads');
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(apiPackageRoot(), configured);
}

export function mediaObjectKey(mediaId: string, extension: string): string {
  return `speaking/${mediaId}.${extension}`;
}

export function normalizeAudioMime(mime: string): string {
  return mime.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function s3Config(): ObjectStorageConfig | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  const endpoint = process.env.S3_ENDPOINT?.trim();
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.S3_REGION?.trim() || 'auto',
    endpoint: endpoint || undefined,
  };
}

export function describeMediaBackend(): string {
  const config = s3Config();
  if (config) return `s3://${config.bucket}`;
  return resolveMediaDir();
}

/**
 * Local disk unless bucket, access key, and secret are all set.
 * Playback always goes through `GET /media/:id`; objects are not public.
 */
type S3Sdk = typeof import('@aws-sdk/client-s3');

export class MediaStorage {
  private readonly logger = new Logger(MediaStorage.name);
  private sdkModule: S3Sdk | null = null;
  private clientInstance: InstanceType<S3Sdk['S3Client']> | null = null;

  async put(key: string, body: Buffer, mimeType: string): Promise<string> {
    assertKey(key);
    const config = s3Config();
    if (!config) {
      const absolute = absoluteLocalPath(key);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, body);
      return `${LOCAL_PREFIX}${key}`;
    }
    const { sdk, client } = await this.load(config);
    try {
      await client.send(
        new sdk.PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: mimeType,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`S3 upload failed: ${message}`);
      throw new ServiceUnavailableException('Object storage is unavailable');
    }
    return `${S3_PREFIX}${key}`;
  }

  async remove(storedPath: string): Promise<void> {
    if (storedPath.startsWith(LOCAL_PREFIX)) {
      const key = storedPath.slice(LOCAL_PREFIX.length);
      if (!KEY_PATTERN.test(key)) return;
      await unlink(absoluteLocalPath(key)).catch(() => undefined);
      return;
    }
    if (!storedPath.startsWith(S3_PREFIX)) return;
    const config = s3Config();
    if (!config) return;
    const key = storedPath.slice(S3_PREFIX.length);
    if (!KEY_PATTERN.test(key)) return;
    const { sdk, client } = await this.load(config);
    await client
      .send(new sdk.DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
      .catch(() => undefined);
  }

  async open(storedPath: string): Promise<Readable> {
    if (storedPath.startsWith(LOCAL_PREFIX)) {
      const key = storedPath.slice(LOCAL_PREFIX.length);
      assertKey(key);
      return openLocal(absoluteLocalPath(key));
    }
    if (storedPath.startsWith(S3_PREFIX)) {
      const key = storedPath.slice(S3_PREFIX.length);
      assertKey(key);
      return this.openS3(key);
    }
    return openLegacy(storedPath);
  }

  private async openS3(key: string): Promise<Readable> {
    const config = s3Config();
    if (!config) throw new NotFoundException('Media not found');
    const { sdk, client } = await this.load(config);
    try {
      const result = await client.send(
        new sdk.GetObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      if (!result.Body) throw new NotFoundException('Media not found');
      const bytes = await result.Body.transformToByteArray();
      return Readable.from(Buffer.from(bytes));
    } catch (error) {
      if (error instanceof NotFoundException || isMissingObject(error)) {
        throw new NotFoundException('Media not found');
      }
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`S3 download failed: ${message}`);
      throw new ServiceUnavailableException('Object storage is unavailable');
    }
  }

  private async load(config: ObjectStorageConfig) {
    if (!this.sdkModule) this.sdkModule = await import('@aws-sdk/client-s3');
    if (!this.clientInstance) {
      this.clientInstance = new this.sdkModule.S3Client({
        region: config.region,
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        forcePathStyle: Boolean(config.endpoint),
      });
    }
    return { sdk: this.sdkModule, client: this.clientInstance };
  }
}

function assertKey(key: string) {
  if (!KEY_PATTERN.test(key)) throw new NotFoundException('Media not found');
}

function absoluteLocalPath(key: string): string {
  const root = resolveMediaDir();
  const absolute = path.resolve(root, key);
  if (!isInside(root, absolute)) throw new NotFoundException('Media not found');
  return absolute;
}

async function openLocal(absolute: string): Promise<Readable> {
  try {
    await access(absolute);
  } catch {
    throw new NotFoundException('Media not found');
  }
  return createReadStream(absolute);
}

async function openLegacy(storedPath: string): Promise<Readable> {
  if (!path.isAbsolute(storedPath)) throw new NotFoundException('Media not found');
  const resolved = path.resolve(storedPath);
  const roots = [
    resolveMediaDir(),
    path.resolve(process.cwd(), 'uploads'),
    path.join(apiPackageRoot(), 'uploads'),
  ];
  if (!roots.some((root) => isInside(root, resolved))) {
    throw new NotFoundException('Media not found');
  }
  return openLocal(resolved);
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== 'object' || !('name' in error)) return false;
  const name = String((error as { name: unknown }).name);
  return name === 'NoSuchKey' || name === 'NotFound';
}

function isInside(root: string, target: string) {
  const relative = path.relative(path.resolve(root), target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
