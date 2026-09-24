import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AttemptDetail,
  ScoreStatus,
  ScoredAnswer,
  SectionScore,
  ViolationsSummary,
  isAttemptResult,
  overallMaxScoreOf,
  overallScoreOf,
} from '@toefl/shared';
import { PrismaService } from '../prisma/prisma.service';
import { sectionScoresFromAnswers, withMaxScore } from '../scoring/stub-score';

const ATTEMPT_INCLUDE = {
  exam: { select: { title: true } },
  session: { select: { violations: { select: { type: true } } } },
} as const;

@Injectable()
export class AttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AttemptDetail[]> {
    const attempts = await this.prisma.attempt.findMany({
      where: { userId },
      include: ATTEMPT_INCLUDE,
      orderBy: { submittedAt: 'desc' },
    });
    return attempts.map((attempt) => this.toDetail(attempt));
  }

  async get(userId: string, attemptId: string): Promise<AttemptDetail> {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, userId },
      include: ATTEMPT_INCLUDE,
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return this.toDetail(attempt);
  }

  private toDetail(attempt: {
    id: string;
    examId: string;
    sessionId: string;
    submittedAt: Date;
    forced: boolean;
    result: unknown;
    exam: { title: string };
    session: { violations: Array<{ type: string }> };
  }): AttemptDetail {
    const violations = summarizeViolations(attempt.session.violations);
    const base = {
      id: attempt.id,
      examId: attempt.examId,
      examTitle: attempt.exam.title,
      sessionId: attempt.sessionId,
      submittedAt: attempt.submittedAt.toISOString(),
      forced: attempt.forced,
      violations,
    };
    if (!isAttemptResult(attempt.result)) {
      return {
        ...base,
        scoringStatus: 'scored',
        overallScore: null,
        overallMaxScore: 0,
        sectionScores: [],
        answers: [],
      };
    }
    const answers = attempt.result.answers.map((answer) => withMaxScore(answer));
    const sectionScores = normalizeSections(attempt.result.sectionScores, answers);
    const scoringStatus: ScoreStatus = sectionScores.some((section) => section.score === null)
      ? 'pending'
      : 'scored';
    return {
      ...base,
      scoringStatus,
      overallScore: overallScoreOf(sectionScores),
      overallMaxScore: overallMaxScoreOf(sectionScores),
      sectionScores,
      answers,
    };
  }
}

function normalizeSections(sections: SectionScore[], answers: ScoredAnswer[]): SectionScore[] {
  return sectionScoresFromAnswers(
    sections.map((section) => ({
      sectionId: section.sectionId,
      name: section.name,
      maxScore: typeof section.maxScore === 'number' ? section.maxScore : 0,
    })),
    answers,
  );
}

function summarizeViolations(violations: Array<{ type: string }>): ViolationsSummary {
  let fullscreenExit = 0;
  let tabBlur = 0;
  for (const violation of violations) {
    if (violation.type === 'fullscreen_exit') fullscreenExit += 1;
    else if (violation.type === 'tab_blur') tabBlur += 1;
  }
  return { total: violations.length, fullscreenExit, tabBlur };
}
