import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AttemptDetail,
  AttemptSummary,
  ViolationRecord,
  ViolationType,
  VIOLATION_TYPES,
  isAttemptResult,
  rollupAttemptScore,
} from '@toefl/shared';
import { PrismaService } from '../prisma/prisma.service';

const VIOLATION_TYPE_SET = new Set<string>(VIOLATION_TYPES);

@Injectable()
export class AttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AttemptSummary[]> {
    const attempts = await this.prisma.attempt.findMany({
      where: { userId },
      include: { exam: true },
      orderBy: { submittedAt: 'desc' },
      take: 100,
    });
    return attempts.map((attempt) => this.toSummary(attempt));
  }

  async get(userId: string, attemptId: string): Promise<AttemptDetail> {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, userId },
      include: {
        exam: true,
        session: { include: { violations: { orderBy: { at: 'asc' } } } },
      },
    });
    if (!attempt || !isAttemptResult(attempt.result)) {
      throw new NotFoundException('Attempt not found');
    }
    return {
      ...this.toSummary(attempt),
      sectionScores: attempt.result.sectionScores,
      answers: attempt.result.answers,
      violations: attempt.session.violations.flatMap((violation) => {
        if (!VIOLATION_TYPE_SET.has(violation.type)) return [];
        const record: ViolationRecord = {
          id: violation.id,
          type: violation.type as ViolationType,
          at: violation.at.toISOString(),
        };
        return [record];
      }),
    };
  }

  private toSummary(attempt: {
    id: string;
    examId: string;
    sessionId: string;
    submittedAt: Date;
    forced: boolean;
    result: unknown;
    exam: { title: string };
  }): AttemptSummary {
    const result = isAttemptResult(attempt.result)
      ? attempt.result
      : { answers: [], sectionScores: [] };
    const rollup = rollupAttemptScore(result);
    return {
      id: attempt.id,
      examId: attempt.examId,
      examTitle: attempt.exam.title,
      sessionId: attempt.sessionId,
      submittedAt: attempt.submittedAt.toISOString(),
      forced: attempt.forced,
      scoringStatus: rollup.scoringStatus,
      score: rollup.score,
      maxScore: rollup.maxScore,
    };
  }
}
