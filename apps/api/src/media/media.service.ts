import { Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { PrismaService } from '../prisma/prisma.service';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

const EXTENSIONS: Record<string, string> = {
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

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(userId: string, file: Express.Multer.File) {
    const extension = EXTENSIONS[file.mimetype] ?? 'bin';
    await mkdir(UPLOAD_DIR, { recursive: true });
    const asset = await this.prisma.mediaAsset.create({
      data: {
        userId,
        filename: path.basename(file.originalname || `recording.${extension}`),
        mimeType: file.mimetype,
        size: file.size,
        storedPath: '',
      },
    });
    const storedPath = path.join(UPLOAD_DIR, `${asset.id}.${extension}`);
    await writeFile(storedPath, file.buffer);
    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { storedPath },
    });
    return { mediaId: asset.id, url: `/media/${asset.id}` };
  }

  async open(userId: string, mediaId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id: mediaId, userId } });
    if (!asset) throw new NotFoundException('Media not found');
    return {
      mimeType: asset.mimeType,
      filename: asset.filename,
      stream: createReadStream(asset.storedPath),
    };
  }
}
