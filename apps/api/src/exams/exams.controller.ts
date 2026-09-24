import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExamsService } from './exams.service';

@Controller('exams')
@UseGuards(JwtAuthGuard)
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.exams.list(user.id);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.exams.detail(id);
  }

  @Post(':id/sessions')
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.exams.startSession(user.id, id);
  }
}
