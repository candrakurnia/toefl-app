import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import path from 'path';
import { mediaPlaybackPath, MediaUploadResponse } from '@toefl/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUDIO_EXTENSIONS,
  describeMediaBackend,
  mediaObjectKey,
  MediaStorage,
  normalizeAudioMime,
} from './media.storage';

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);
  private readonly storage = new MediaStorage();

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log(`Speaking uploads stored in ${describeMediaBackend()}`);
  }

  async upload(userId: string, file: Express.Multer.File): Promise<MediaUploadResponse> {
    const mimeType = normalizeAudioMime(file.mimetype);
    const extension = AUDIO_EXTENSIONS[mimeType];
    if (!extension) {
      throw new BadRequestException(
        'Only audio uploads are allowed (webm, mp3, wav, m4a, ogg, aac)',
      );
    }
    const asset = await this.prisma.mediaAsset.create({
      data: {
        userId,
        filename: safeFilename(file.originalname, extension),
        mimeType,
        size: file.size,
        storedPath: 'pending',
      },
    });
    const key = mediaObjectKey(asset.id, extension);
    try {
      const storedPath = await this.storage.put(key, file.buffer, mimeType);
      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { storedPath },
      });
      return { mediaId: asset.id, url: mediaPlaybackPath(asset.id), key };
    } catch (error) {
      await this.storage.remove(`local:${key}`).catch(() => undefined);
      await this.storage.remove(`s3:${key}`).catch(() => undefined);
      await this.prisma.mediaAsset.delete({ where: { id: asset.id } }).catch(() => undefined);
      throw error;
    }
  }

  async open(userId: string, mediaId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id: mediaId, userId } });
    if (!asset || !asset.storedPath || asset.storedPath === 'pending') {
      return null;
    }
    const stream = await this.storage.open(asset.storedPath);
    return {
      mimeType: asset.mimeType,
      filename: asset.filename,
      size: asset.size,
      stream,
    };
  }
}

function safeFilename(original: string, extension: string) {
  const base = path.basename(original || `speaking.${extension}`).replace(/[^\w.-]+/g, '_');
  const trimmed = base.slice(0, 120);
  return trimmed || `speaking.${extension}`;
}
