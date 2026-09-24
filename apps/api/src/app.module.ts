import { Module } from '@nestjs/common';
import { AttemptsModule } from './attempts/attempts.module';
import { AuthModule } from './auth/auth.module';
import { ExamsModule } from './exams/exams.module';
import { MediaModule } from './media/media.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { ScoringModule } from './scoring/scoring.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuthModule,
    ScoringModule,
    SessionsModule,
    ExamsModule,
    AttemptsModule,
    MediaModule,
  ],
})
export class AppModule {}
