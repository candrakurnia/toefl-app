import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { SessionDeadlineService } from './session-deadline.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [ScoringModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionDeadlineService],
  exports: [SessionsService],
})
export class SessionsModule {}
