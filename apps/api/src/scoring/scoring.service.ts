import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isAttemptResult, ScoredAnswer } from '@toefl/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const SCORING_QUEUE = 'scoring:jobs';

interface ScoringJob {
  attemptId: string;
  enqueuedAt: string;
}

@Injectable()
export class ScoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScoringService.name);
  private timer: NodeJS.Timeout | undefined;
  private readonly memoryQueue: string[] = [];
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    void this.redis.ping();
    this.timer = setInterval(() => {
      void this.tick();
    }, 5000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueue(attemptId: string) {
    const payload = JSON.stringify({
      attemptId,
      enqueuedAt: new Date().toISOString(),
    } satisfies ScoringJob);
    const queued = await this.redis.lpush(SCORING_QUEUE, payload);
    if (!queued) {
      this.memoryQueue.push(payload);
      this.logger.warn(`Redis queue unavailable; held scoring job ${attemptId} in memory`);
    } else {
      this.logger.log(`Enqueued scoring job ${attemptId}`);
    }
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const raw = (await this.redis.lpop(SCORING_QUEUE)) ?? this.memoryQueue.shift() ?? null;
      if (!raw) return;
      await this.applyStub(raw);
    } finally {
      this.ticking = false;
    }
  }

  private async applyStub(raw: string) {
    let job: ScoringJob;
    try {
      job = JSON.parse(raw) as ScoringJob;
    } catch {
      this.logger.warn('Dropped malformed scoring job');
      return;
    }
    const attempt = await this.prisma.attempt.findUnique({ where: { id: job.attemptId } });
    if (!attempt || !isAttemptResult(attempt.result)) return;

    let changed = false;
    const answers: ScoredAnswer[] = attempt.result.answers.map((answer) => {
      if (answer.scoreStatus !== 'pending') return answer;
      changed = true;
      return {
        ...answer,
        scoreStatus: 'scored',
        score: null,
        stub: true,
      };
    });
    if (!changed) return;

    const sectionScores = attempt.result.sectionScores.map((section) => {
      const sectionAnswers = answers.filter((answer) => answer.sectionId === section.sectionId);
      const waiting = sectionAnswers.some(
        (answer) => answer.scoreStatus === 'pending' || answer.score === null,
      );
      return {
        ...section,
        score: waiting
          ? null
          : sectionAnswers.reduce((sum, answer) => sum + (answer.score ?? 0), 0),
      };
    });

    await this.prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        result: { sectionScores, answers } as unknown as Prisma.InputJsonValue,
      },
    });
    this.logger.log(`Stub scorer marked attempt ${attempt.id} as scored`);
  }
}
