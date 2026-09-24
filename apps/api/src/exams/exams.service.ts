import { Injectable, NotFoundException } from '@nestjs/common';
import { ExamDetail, ExamProgressStatus, ExamSummary, QuestionType } from '@toefl/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';

const QUESTION_TYPES = new Set<string>(['multiple_choice', 'essay', 'listening', 'speaking']);

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async list(userId: string): Promise<ExamSummary[]> {
    const exams = await this.prisma.exam.findMany({ orderBy: { createdAt: 'asc' } });
    const sessions = await this.prisma.session.findMany({
      where: { userId, examId: { in: exams.map((exam) => exam.id) } },
      orderBy: { startedAt: 'desc' },
    });
    return exams.map((exam) => {
      const mine = sessions.filter((session) => session.examId === exam.id);
      return {
        id: exam.id,
        title: exam.title,
        durationOverall: exam.durationOverall,
        status: progressFor(mine.map((session) => session.status)),
      };
    });
  }

  async detail(examId: string): Promise<ExamDetail> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: { questions: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return {
      id: exam.id,
      title: exam.title,
      durationOverall: exam.durationOverall,
      rules: exam.rules,
      questionCount: exam.sections.reduce((sum, section) => sum + section.questions.length, 0),
      sections: exam.sections.map((section) => ({
        id: section.id,
        name: section.name,
        durationSec: section.durationSec,
        questionTypes: uniqueTypes(section.questions.map((question) => question.type)),
      })),
    };
  }

  startSession(userId: string, examId: string) {
    return this.sessions.create(userId, examId);
  }
}

function progressFor(statuses: string[]): ExamProgressStatus {
  if (statuses.includes('active')) return 'in_progress';
  if (statuses.some((status) => status === 'submitted' || status === 'expired')) return 'completed';
  return 'not_started';
}

function uniqueTypes(values: string[]): QuestionType[] {
  const seen = new Set<QuestionType>();
  for (const value of values) {
    if (QUESTION_TYPES.has(value)) seen.add(value as QuestionType);
  }
  return [...seen];
}
