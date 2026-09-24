import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage, MulterError } from 'multer';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AUDIO_EXTENSIONS, normalizeAudioMime } from './media.storage';
import { MediaService } from './media.service';

const MAX_BYTES = 10 * 1024 * 1024;

@Catch(MulterError)
class UploadExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const message =
      exception.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 10MB limit' : 'Upload failed';
    response.status(400).json({ statusCode: 400, message });
  }
}

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @UseFilters(UploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES },
    }),
  )
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('file is required');
    const mimeType = normalizeAudioMime(file.mimetype || '');
    if (!AUDIO_EXTENSIONS[mimeType]) {
      throw new BadRequestException(
        'Only audio uploads are allowed (webm, mp3, wav, m4a, ogg, aac)',
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('File exceeds the 10MB limit');
    }
    return this.media.upload(user.id, file);
  }

  @Get(':id')
  async download(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const file = await this.media.open(user.id, id);
    if (!file) throw new NotFoundException('Media not found');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
    file.stream.pipe(res);
  }
}
