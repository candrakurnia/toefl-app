import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isAttemptResult } from '@toefl/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { applyDeterministicStub, DEFAULT_STUB_DELAY_MS, hasPendingModelAnswer } from './stub-score';

export const SCORING_QUEUE = 'scoring:jobs';

interface ScoringJob {
  attemptId: string;
  enqueuedAt: string;
}

type JobOutcome = 'done' | 'wait' | 'drop';

/**
 * In-process consumer for the Redis list `scoring:jobs` (FIFO via RPUSH/LPOP).
 * If Redis is down, the same payload stays on an in-memory queue.
 * This is a deterministic practice scorer, not a model. Set `SCORING_STUB=false`
 * to leave jobs on the list for a future model worker.
 */
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
    if (!stubEnabled()) {
      this.logger.log('Practice scoring stub is off (SCORING_STUB=false); jobs stay on the queue');
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, 2000);
    this.logger.log(
      `Practice scoring stub polling ${SCORING_QUEUE} (delay ${stubDelayMs()}ms). Model scoring is not wired.`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueue(attemptId: string) {
    const payload = JSON.stringify({
      attemptId,
      enqueuedAt: new Date().toISOString(),
    } satisfies ScoringJob);
    const queued = await this.redis.rpush(SCORING_QUEUE, payload);
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
      if (raw) {
        const outcome = await this.applyRaw(raw);
        if (outcome === 'wait') {
          const queued = await this.redis.rpush(SCORING_QUEUE, raw);
          if (!queued) this.memoryQueue.push(raw);
        }
      }
      await this.sweep();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Scoring tick failed: ${message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async applyRaw(raw: string): Promise<JobOutcome> {
    let job: ScoringJob;
    try {
      job = JSON.parse(raw) as ScoringJob;
    } catch {
      this.logger.warn('Dropped malformed scoring job');
      return 'drop';
    }
    if (!job || typeof job.attemptId !== 'string' || job.attemptId.length === 0) {
      this.logger.warn('Dropped scoring job without an attempt id');
      return 'drop';
    }
    return this.scoreAttempt(job.attemptId);
  }

  /** Heals jobs lost between LPOP and the write. Limited to the newest 100 attempts. */
  private async sweep() {
    const attempts = await this.prisma.attempt.findMany({
      orderBy: { submittedAt: 'desc' },
      take: 100,
      select: { id: true, submittedAt: true, result: true },
    });
    const nowMs = Date.now();
    const delayMs = stubDelayMs();
    for (const attempt of attempts) {
      if (!isAttemptResult(attempt.result)) continue;
      const pending = hasPendingModelAnswer(attempt.result.answers);
      const nullStub = attempt.result.answers.some(
        (answer) =>
          (answer.type === 'essay' || answer.type === 'speaking') &&
          answer.stub === true &&
          answer.score === null,
      );
      if (!pending && !nullStub) continue;
      if (pending && !nullStub && nowMs - attempt.submittedAt.getTime() < delayMs) continue;
      await this.scoreAttempt(attempt.id);
    }
  }

  private async scoreAttempt(attemptId: string): Promise<JobOutcome> {
    const delayMs = stubDelayMs();
    const nowMs = Date.now();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id: attemptId } });
      if (!attempt || !isAttemptResult(attempt.result)) return 'drop' as const;
      const next = applyDeterministicStub(attempt.result, {
        nowMs,
        submittedAtMs: attempt.submittedAt.getTime(),
        delayMs,
      });
      if (next) {
        await tx.attempt.update({
          where: { id: attempt.id },
          data: { result: next as unknown as Prisma.InputJsonValue },
        });
      }
      const answers = next?.answers ?? attempt.result.answers;
      const graded =
        next !== null &&
        !hasPendingModelAnswer(answers) &&
        answers.some((answer) => answer.stub === true && typeof answer.score === 'number');
      const waiting =
        nowMs - attempt.submittedAt.getTime() < delayMs && hasPendingModelAnswer(answers);
      return { outcome: waiting ? ('wait' as const) : ('done' as const), graded, id: attempt.id };
    });
    if (outcome !== 'drop' && outcome.graded) {
      this.logger.log(`Practice scorer graded attempt ${outcome.id}`);
    }
    return outcome === 'drop' ? 'drop' : outcome.outcome;
  }
}

function stubEnabled() {
  return process.env.SCORING_STUB !== 'false';
}

function stubDelayMs() {
  const raw = Number(process.env.SCORING_STUB_DELAY_MS ?? DEFAULT_STUB_DELAY_MS);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_STUB_DELAY_MS;
  return raw;
}
