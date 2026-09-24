import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AutosaveDto, HeartbeatDto, ViolationDto } from './dto';
import { SessionsService } from './sessions.service';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sessions.get(user.id, id);
  }

  @Get(':id/questions')
  questions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('sectionId') sectionId?: string,
  ) {
    if (!sectionId) throw new BadRequestException('sectionId is required');
    return this.sessions.questions(user.id, id, sectionId);
  }

  @Patch(':id/answers')
  autosave(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: AutosaveDto) {
    return this.sessions.autosave(user.id, id, body.questionId, body.payload);
  }

  @HttpCode(200)
  @Post(':id/sections/next')
  next(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sessions.next(user.id, id);
  }

  @HttpCode(200)
  @Post(':id/heartbeat')
  heartbeat(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: HeartbeatDto) {
    return this.sessions.heartbeat(user.id, id, body);
  }

  @HttpCode(200)
  @Post(':id/violations')
  violations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: ViolationDto) {
    return this.sessions.recordViolation(user.id, id, body.type, body.at);
  }

  @HttpCode(200)
  @Post(':id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sessions.submit(user.id, id);
  }
}
