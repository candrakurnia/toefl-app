import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Session } from '@prisma/client';
import {
  HeartbeatResponse,
  mediaPlaybackPath,
  PublicQuestion,
  QuestionType,
  SectionNextResponse,
  SectionQuestions,
  SessionState,
  SessionStatus,
  SubmitResult,
  ViolationRecord,
  ViolationType,
} from '@toefl/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ScoringService } from '../scoring/scoring.service';
import { assertPayloadForQuestion, parseAnswerPayload, parseChoices } from './answer-payload';
import { buildAttemptResult } from './score-session';

const SESSION_INCLUDE = {
  answers: true,
  violations: true,
} satisfies Prisma.SessionInclude;

type SessionRecord = Prisma.SessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

const QUESTION_TYPES = new Set<string>(['multiple_choice', 'essay', 'listening', 'speaking']);

/** Redis sorted set of active sessions, scored by the next deadline in epoch ms. */
const SESSION_DUE_KEY = 'sessions:due';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly scoring: ScoringService,
  ) {}

  async create(userId: string, examId: string): Promise<SessionState> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { sections: { orderBy: { order: 'asc' } } },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    const first = exam.sections[0];
    if (!first) throw new BadRequestException('Exam has no sections');

    const active = await this.prisma.session.findFirst({
      where: { userId, examId, status: 'active' },
    });
    if (active) {
      throw new ConflictException({
        message: 'An active session already exists for this exam',
        sessionId: active.id,
      });
    }

    const now = new Date();
    const overallEndsAt = new Date(now.getTime() + exam.durationOverall * 1000);
    const sectionEndsAt = capEnd(new Date(now.getTime() + first.durationSec * 1000), overallEndsAt);

    try {
      const session = await this.prisma.session.create({
        data: {
          userId,
          examId,
          status: 'active',
          startedAt: now,
          overallEndsAt,
          sectionEndsAt,
          currentSectionId: first.id,
        },
        include: SESSION_INCLUDE,
      });
      await this.schedule(session);
      return this.toState(session);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.prisma.session.findFirst({
          where: { userId, examId, status: 'active' },
        });
        throw new ConflictException({
          message: 'An active session already exists for this exam',
          sessionId: existing?.id,
        });
      }
      throw error;
    }
  }

  async get(userId: string, sessionId: string): Promise<SessionState> {
    const session = await this.enforce(await this.loadOwned(userId, sessionId));
    return this.toState(session);
  }

  async questions(userId: string, sessionId: string, sectionId: string): Promise<SectionQuestions> {
    const session = await this.enforce(await this.loadOwned(userId, sessionId));
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, examId: session.examId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!section) throw new NotFoundException('Section not found');
    const reveal = session.status !== 'active';
    const questions: PublicQuestion[] = section.questions.map((question) => {
      const type = asQuestionType(question.type);
      const choices = parseChoices(question.choices);
      const pub: PublicQuestion = {
        id: question.id,
        sectionId: section.id,
        type,
        prompt: question.prompt,
        order: question.order,
        choices,
        audioUrl: question.audioUrl,
      };
      if (reveal && question.correctChoiceId) {
        pub.correctChoiceId = question.correctChoiceId;
      }
      return pub;
    });
    return { sectionId: section.id, questions };
  }

  async autosave(userId: string, sessionId: string, questionId: string, payload: unknown) {
    const session = await this.enforce(await this.loadOwned(userId, sessionId));
    this.assertAttemptWritable(session);
    const question = await this.prisma.question.findFirst({
      where: { id: questionId, section: { examId: session.examId } },
    });
    if (!question) throw new NotFoundException('Question not found');
    const type = asQuestionType(question.type);
    const parsed = assertPayloadForQuestion(type, payload, parseChoices(question.choices));
    let stored = parsed;
    if (parsed.kind === 'speaking') {
      const media = await this.prisma.mediaAsset.findFirst({
        where: { id: parsed.mediaId, userId },
      });
      if (!media || !media.storedPath || media.storedPath === 'pending') {
        throw new BadRequestException('mediaId was not uploaded by this user');
      }
      stored = { kind: 'speaking', mediaId: media.id, url: mediaPlaybackPath(media.id) };
    }
    const saved = await this.prisma.$transaction(async (tx) => {
      const writable = await tx.session.findFirst({
        where: { id: session.id, userId, status: 'active' },
        select: { id: true },
      });
      if (!writable) return null;
      return tx.answer.upsert({
        where: { sessionId_questionId: { sessionId: session.id, questionId } },
        create: {
          sessionId: session.id,
          questionId,
          payload: stored as unknown as Prisma.InputJsonValue,
        },
        update: { payload: stored as unknown as Prisma.InputJsonValue },
      });
    });
    if (!saved) throw new ConflictException('Attempt is readonly');
    return {
      questionId: saved.questionId,
      payload: stored,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async next(
    userId: string,
    sessionId: string,
    fromSectionId?: string,
  ): Promise<SectionNextResponse> {
    const loaded = await this.loadOwned(userId, sessionId);
    if (fromSectionId && fromSectionId !== loaded.currentSectionId) {
      const synced = await this.enforce(loaded);
      return {
        submitted: synced.status !== 'active',
        session: this.toState(synced),
      };
    }
    const now = new Date();
    const due =
      loaded.status === 'active' &&
      (now.getTime() >= loaded.sectionEndsAt.getTime() ||
        now.getTime() >= loaded.overallEndsAt.getTime());
    const session = due ? await this.enforce(loaded) : await this.advance(loaded, false, 0);
    return {
      submitted: session.status !== 'active',
      session: this.toState(session),
    };
  }

  async heartbeat(
    userId: string,
    sessionId: string,
    flags: { visibility?: 'visible' | 'hidden'; fullscreen?: boolean },
  ): Promise<HeartbeatResponse> {
    const before = await this.loadOwned(userId, sessionId);
    const session = await this.enforce(before);
    // Presence is diagnostic. It does not move either deadline.
    await this.redis.setex(
      `session:${session.id}:presence`,
      120,
      JSON.stringify({ ...flags, at: new Date().toISOString() }),
    );
    return {
      serverNow: new Date().toISOString(),
      overallEndsAt: session.overallEndsAt.toISOString(),
      sectionEndsAt: session.sectionEndsAt.toISOString(),
      currentSectionId: session.currentSectionId,
      status: asStatus(session.status),
      forceSubmitted: session.status === 'expired',
    };
  }

  async recordViolation(
    userId: string,
    sessionId: string,
    type: ViolationType,
    at: string,
  ): Promise<ViolationRecord> {
    const session = await this.loadOwned(userId, sessionId);
    this.assertActive(session);
    const when = new Date(at);
    if (Number.isNaN(when.getTime())) throw new BadRequestException('at is not a valid time');
    // A violation is a log line. It does not pause either timer and it does not submit.
    const violation = await this.prisma.violation.create({
      data: { sessionId: session.id, type, at: when },
    });
    return { id: violation.id, type, at: violation.at.toISOString() };
  }

  async submit(userId: string, sessionId: string): Promise<SubmitResult> {
    const session = await this.loadOwned(userId, sessionId);
    if (session.status !== 'active') {
      return this.existingResult(session.id);
    }
    const now = new Date();
    const forced = await this.deadlineForcesSubmit(session, now);
    const attemptId = await this.finalize(session.id, forced);
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return { attemptId: attempt.id, forced: attempt.forced };
  }

  /**
   * Applies deadlines that have already passed.
   * Overall deadline force-submits. A section deadline advances once, or force-submits on the last section.
   */
  private async enforce(session: SessionRecord, steps = 0): Promise<SessionRecord> {
    if (session.status !== 'active') {
      await this.schedule(session);
      return session;
    }
    if (steps > 24) {
      await this.finalize(session.id, true);
      return this.reload(session.id);
    }
    const now = new Date();
    if (now.getTime() >= session.overallEndsAt.getTime()) {
      await this.finalize(session.id, true);
      return this.reload(session.id);
    }
    if (now.getTime() >= session.sectionEndsAt.getTime()) {
      return this.advance(session, true, steps);
    }
    await this.schedule(session);
    return session;
  }

  /** Closes the current section. `forced` is true when the close is caused by a deadline. */
  private async advance(
    session: SessionRecord,
    forced: boolean,
    steps: number,
  ): Promise<SessionRecord> {
    if (session.status !== 'active') {
      await this.schedule(session);
      return session;
    }
    const now = new Date();
    if (now.getTime() >= session.overallEndsAt.getTime()) {
      await this.finalize(session.id, true);
      return this.reload(session.id);
    }

    const sections = await this.prisma.section.findMany({
      where: { examId: session.examId },
      orderBy: { order: 'asc' },
    });
    const index = sections.findIndex((section) => section.id === session.currentSectionId);
    const next = index >= 0 ? sections[index + 1] : undefined;
    if (!next) {
      await this.finalize(session.id, forced);
      return this.reload(session.id);
    }

    const sectionEndsAt = capEnd(
      new Date(now.getTime() + next.durationSec * 1000),
      session.overallEndsAt,
    );
    const moved = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        status: 'active',
        currentSectionId: session.currentSectionId,
      },
      data: { currentSectionId: next.id, sectionEndsAt },
    });
    const updated = await this.reload(session.id);
    if (moved.count === 0) {
      return this.enforce(updated, steps + 1);
    }
    const after = new Date();
    if (
      after.getTime() >= updated.sectionEndsAt.getTime() ||
      after.getTime() >= updated.overallEndsAt.getTime()
    ) {
      return this.enforce(updated, steps + 1);
    }
    await this.schedule(updated);
    return updated;
  }

  /** Force-submit or auto-advance sessions whose deadline has passed, even with no open client. */
  async sweepDue(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const now = new Date();
      const ids = new Set<string>(
        await this.redis.zrangebyscore(SESSION_DUE_KEY, 0, now.getTime()),
      );
      const rows = await this.prisma.session.findMany({
        where: {
          status: 'active',
          OR: [{ overallEndsAt: { lte: now } }, { sectionEndsAt: { lte: now } }],
        },
        select: { id: true },
        take: 100,
      });
      for (const row of rows) ids.add(row.id);
      for (const id of ids) {
        try {
          const session = await this.prisma.session.findUnique({
            where: { id },
            include: SESSION_INCLUDE,
          });
          if (!session || session.status !== 'active') {
            await this.redis.zrem(SESSION_DUE_KEY, id);
            continue;
          }
          await this.enforce(session);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          // Keep sweeping other sessions. The next tick retries this one.
          this.logger.warn(`Deadline sweep failed for ${id}: ${message}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Deadline sweep failed: ${message}`);
    } finally {
      this.sweeping = false;
    }
  }

  private async existingResult(sessionId: string): Promise<SubmitResult> {
    const attempt = await this.prisma.attempt.findUnique({ where: { sessionId } });
    if (!attempt) throw new ConflictException('Session is no longer active');
    return { attemptId: attempt.id, forced: attempt.forced };
  }

  /** Overall deadline, or a section deadline on the final section, closes the exam. */
  private async deadlineForcesSubmit(session: SessionRecord, now: Date): Promise<boolean> {
    if (now.getTime() >= session.overallEndsAt.getTime()) return true;
    if (now.getTime() < session.sectionEndsAt.getTime()) return false;
    const sections = await this.prisma.section.findMany({
      where: { examId: session.examId },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    const index = sections.findIndex((section) => section.id === session.currentSectionId);
    return index < 0 || index >= sections.length - 1;
  }

  private async schedule(
    session: Pick<Session, 'id' | 'status' | 'sectionEndsAt' | 'overallEndsAt'>,
  ) {
    if (session.status !== 'active') {
      await this.redis.zrem(SESSION_DUE_KEY, session.id);
      return;
    }
    const dueAt = Math.min(session.sectionEndsAt.getTime(), session.overallEndsAt.getTime());
    await this.redis.zadd(SESSION_DUE_KEY, dueAt, session.id);
  }

  private async finalize(sessionId: string, forced: boolean): Promise<string> {
    try {
      const attemptId = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.attempt.findUnique({ where: { sessionId } });
        if (existing) return existing.id;

        const session = await tx.session.findUnique({
          where: { id: sessionId },
          include: {
            answers: true,
            exam: {
              include: { sections: { include: { questions: true }, orderBy: { order: 'asc' } } },
            },
          },
        });
        if (!session) throw new NotFoundException('Session not found');
        if (session.status !== 'active') {
          const raced = await tx.attempt.findUnique({ where: { sessionId } });
          if (raced) return raced.id;
          throw new ConflictException('Session is no longer active');
        }

        const sections = [...session.exam.sections].sort((a, b) => a.order - b.order);
        const result = buildAttemptResult(sections, session.answers);
        const attempt = await tx.attempt.create({
          data: {
            userId: session.userId,
            sessionId: session.id,
            examId: session.examId,
            forced,
            result: result as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.session.update({
          where: { id: session.id },
          data: { status: forced ? 'expired' : 'submitted' },
        });
        return attempt.id;
      });
      await this.redis.zrem(SESSION_DUE_KEY, sessionId);
      await this.scoring.enqueue(attemptId);
      return attemptId;
    } catch (error) {
      const existing = await this.prisma.attempt.findUnique({ where: { sessionId } });
      if (existing && (isUniqueViolation(error) || error instanceof ConflictException)) {
        await this.redis.zrem(SESSION_DUE_KEY, sessionId);
        return existing.id;
      }
      throw error;
    }
  }

  private async loadOwned(userId: string, sessionId: string): Promise<SessionRecord> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private async reload(sessionId: string): Promise<SessionRecord> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private assertActive(session: Session) {
    if (session.status !== 'active') {
      throw new ConflictException('Session is no longer active');
    }
  }

  /** Submitted and expired sessions keep the answers that were snapshotted onto the attempt. */
  private assertAttemptWritable(session: Session) {
    if (session.status !== 'active') {
      throw new ConflictException('Attempt is readonly');
    }
  }

  private toState(session: SessionRecord): SessionState {
    return {
      id: session.id,
      examId: session.examId,
      status: asStatus(session.status),
      serverNow: new Date().toISOString(),
      startedAt: session.startedAt.toISOString(),
      overallEndsAt: session.overallEndsAt.toISOString(),
      sectionEndsAt: session.sectionEndsAt.toISOString(),
      currentSectionId: session.currentSectionId,
      answers: session.answers
        .map((answer) => ({
          questionId: answer.questionId,
          payload: parseAnswerPayload(answer.payload) ?? { kind: 'essay' as const, text: '' },
          updatedAt: answer.updatedAt.toISOString(),
        }))
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)),
      violations: [...session.violations]
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .map((violation) => ({
          id: violation.id,
          type: violation.type as ViolationType,
          at: violation.at.toISOString(),
        })),
    };
  }
}

function capEnd(sectionEndsAt: Date, overallEndsAt: Date) {
  return sectionEndsAt.getTime() < overallEndsAt.getTime() ? sectionEndsAt : overallEndsAt;
}

function asStatus(value: string): SessionStatus {
  if (value === 'active' || value === 'submitted' || value === 'expired') return value;
  return 'submitted';
}

function asQuestionType(value: string): QuestionType {
  if (!QUESTION_TYPES.has(value)) {
    throw new BadRequestException(`Unsupported question type ${value}`);
  }
  return value as QuestionType;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
