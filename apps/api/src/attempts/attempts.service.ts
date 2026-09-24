import { Injectable, NotFoundException } from '@nestjs/common';
import { AttemptDetail, AttemptSummary, ScoreStatus, isAttemptResult } from '@toefl/shared';
import { PrismaService } from '../prisma/prisma.service';

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
      include: { exam: true },
    });
    if (!attempt || !isAttemptResult(attempt.result)) {
      throw new NotFoundException('Attempt not found');
    }
    return {
      ...this.toSummary(attempt),
      sectionScores: attempt.result.sectionScores,
      answers: attempt.result.answers,
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
    const scoringStatus: ScoreStatus = result.answers.some(
      (answer) => answer.scoreStatus === 'pending',
    )
      ? 'pending'
      : 'scored';
    return {
      id: attempt.id,
      examId: attempt.examId,
      examTitle: attempt.exam.title,
      sessionId: attempt.sessionId,
      submittedAt: attempt.submittedAt.toISOString(),
      forced: attempt.forced,
      scoringStatus,
    };
  }
}
