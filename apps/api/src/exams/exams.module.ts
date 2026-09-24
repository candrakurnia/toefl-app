import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  imports: [SessionsModule],
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
