import {
  AnswerPayload,
  AnswerSnapshot,
  AttemptDetail,
  AttemptSummary,
  AutosaveResponse,
  ExamDetail,
  ExamSummary,
  HeartbeatResponse,
  MediaUploadResponse,
  PublicQuestion,
  SectionNextResponse,
  SectionQuestions,
  SessionState,
  SubmitResult,
  ViolationRecord,
  ViolationType,
  activeSessionConflictBody,
  overallMaxScoreOf,
  overallScoreOf,
} from '@toefl/shared';
import { SAMPLE_EXAM, SampleQuestion, SampleSection, sampleQuestionCount } from './sample-catalog';

const DB_KEY = 'toefl.sampleDb';

export interface SampleResult {
  ok: boolean;
  status: number;
  body: unknown;
}

interface StoredSession {
  id: string;
  examId: string;
  status: SessionState['status'];
  startedAt: string;
  overallEndsAt: string;
  sectionEndsAt: string;
  currentSectionId: string | null;
  answers: AnswerSnapshot[];
  violations: ViolationRecord[];
}

interface SampleDb {
  sessions: StoredSession[];
  attempts: AttemptDetail[];
}

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeSampleDb(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function activeSampleSessionId(examId: string): string | null {
  if (!examId) return null;
  const active = load().sessions.find(
    (session) => session.examId === examId && session.status === 'active',
  );
  return active?.id ?? null;
}

export function dispatchSample(path: string, init: RequestInit = {}): SampleResult {
  const method = (init.method ?? 'GET').toUpperCase();
  const queryAt = path.indexOf('?');
  const pathname = queryAt === -1 ? path : path.slice(0, queryAt);
  const query = new URLSearchParams(queryAt === -1 ? '' : path.slice(queryAt + 1));

  if (method === 'POST' && (pathname === '/auth/login' || pathname === '/auth/register')) {
    return ok({ accessToken: SAMPLE_ACCESS_TOKEN, refreshToken: 'sample-refresh' });
  }
  if (method === 'POST' && pathname === '/auth/refresh') {
    return ok({ accessToken: SAMPLE_ACCESS_TOKEN, refreshToken: 'sample-refresh' });
  }
  if (method === 'GET' && pathname === '/exams') return ok(listExams());
  if (method === 'GET' && pathname.startsWith('/exams/')) {
    return examDetail(pathname.slice('/exams/'.length));
  }
  if (method === 'POST' && /^\/exams\/[^/]+\/sessions$/.test(pathname)) {
    const examId = pathname.split('/')[2] ?? '';
    return createSession(examId);
  }

  const sessionMatch = pathname.match(/^\/sessions\/([^/]+)(?:\/(.*))?$/);
  if (sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1] ?? '');
    const rest = sessionMatch[2] ?? '';
    if (method === 'GET' && rest === '') return getSession(sessionId);
    if (method === 'GET' && rest === 'questions') {
      return getQuestions(sessionId, query.get('sectionId') ?? '');
    }
    if (method === 'PATCH' && rest === 'answers') return saveAnswer(sessionId, init);
    if (method === 'POST' && rest === 'heartbeat') return heartbeat(sessionId);
    if (method === 'POST' && rest === 'sections/next') return nextSection(sessionId, init);
    if (method === 'POST' && rest === 'violations') return addViolation(sessionId, init);
    if (method === 'POST' && rest === 'submit') return submitSession(sessionId, false);
  }

  if (method === 'GET' && pathname === '/attempts') return ok(listAttempts());
  if (method === 'GET' && pathname.startsWith('/attempts/')) {
    return getAttempt(decodeURIComponent(pathname.slice('/attempts/'.length)));
  }
  if (method === 'POST' && pathname === '/media/upload') return ok(uploadMedia());
  if (method === 'GET' && pathname.startsWith('/media/')) return ok({ ok: true });

  return fail(404, 'Not found');
}

export const SAMPLE_ACCESS_TOKEN = 'sample-access-token';

function listExams(): ExamSummary[] {
  const db = load();
  const mine = db.sessions.filter((session) => session.examId === SAMPLE_EXAM.id);
  const active = mine.find((session) => session.status === 'active');
  const status = active
    ? 'in_progress'
    : mine.some((session) => session.status === 'submitted' || session.status === 'expired')
      ? 'completed'
      : 'not_started';
  return [
    {
      id: SAMPLE_EXAM.id,
      title: SAMPLE_EXAM.title,
      durationOverall: SAMPLE_EXAM.durationOverall,
      status,
      activeSessionId: active?.id ?? null,
    },
  ];
}

function examDetail(examId: string): SampleResult {
  if (examId !== SAMPLE_EXAM.id) return fail(404, 'Exam not found');
  const detail: ExamDetail = {
    id: SAMPLE_EXAM.id,
    title: SAMPLE_EXAM.title,
    durationOverall: SAMPLE_EXAM.durationOverall,
    rules: SAMPLE_EXAM.rules,
    questionCount: sampleQuestionCount(),
    sections: SAMPLE_EXAM.sections.map((section) => ({
      id: section.id,
      name: section.name,
      durationSec: section.durationSec,
      questionTypes: section.questionTypes,
    })),
  };
  return ok(detail);
}

function createSession(examId: string): SampleResult {
  if (examId !== SAMPLE_EXAM.id) return fail(404, 'Exam not found');
  const db = load();
  const existing = db.sessions.find(
    (session) => session.examId === examId && session.status === 'active',
  );
  if (existing) return fail(409, activeSessionConflictBody(existing.id));

  const first = SAMPLE_EXAM.sections[0];
  if (!first) return fail(400, 'Exam has no sections');
  const now = Date.now();
  const session: StoredSession = {
    id: randomId('sample_sess'),
    examId,
    status: 'active',
    startedAt: new Date(now).toISOString(),
    overallEndsAt: new Date(now + SAMPLE_EXAM.durationOverall * 1000).toISOString(),
    sectionEndsAt: new Date(now + first.durationSec * 1000).toISOString(),
    currentSectionId: first.id,
    answers: [],
    violations: [],
  };
  db.sessions.push(session);
  save(db);
  return ok(toState(session));
}

function getSession(sessionId: string): SampleResult {
  const db = load();
  const session = db.sessions.find((item) => item.id === sessionId);
  if (!session) return fail(404, 'Session not found');
  if (enforceDeadlines(db, session)) save(db);
  return ok(toState(session));
}

function getQuestions(sessionId: string, sectionId: string): SampleResult {
  const db = load();
  const session = db.sessions.find((item) => item.id === sessionId);
  if (!session) return fail(404, 'Session not found');
  const section = SAMPLE_EXAM.sections.find((item) => item.id === sectionId);
  if (!section) return fail(404, 'Section not found');
  const reveal = session.status !== 'active';
  const questions: SectionQuestions = {
    sectionId,
    questions: section.questions.map((question) => toPublic(question, reveal)),
  };
  return ok(questions);
}

function saveAnswer(sessionId: string, init: RequestInit): SampleResult {
  const db = load();
  const session = db.sessions.find((item) => item.id === sessionId);
  if (!session) return fail(404, 'Session not found');
  if (session.status !== 'active') return fail(409, 'Attempt is readonly');
  const body = readJson(init) as { questionId?: unknown; payload?: AnswerPayload } | null;
  if (!body || typeof body.questionId !== 'string' || !body.payload) {
    return fail(400, 'Invalid answer');
  }
  const updatedAt = new Date().toISOString();
  const snapshot: AnswerSnapshot = {
    questionId: body.questionId,
    payload: body.payload,
    updatedAt,
  };
  const index = session.answers.findIndex((answer) => answer.questionId === body.questionId);
  if (index >= 0) session.answers[index] = snapshot;
  else session.answers.push(snapshot);
  save(db);
  const response: AutosaveResponse = snapshot;
  return ok(response);
}

function heartbeat(sessionId: string): SampleResult {
  const db = load();
  const session = db.sessions.find((item) => item.id === sessionId);
  if (!session) return fail(404, 'Session not found');
  const changed = enforceDeadlines(db, session);
  if (changed) save(db);
  const beat: HeartbeatResponse = {
    serverNow: new Date().toISOString(),
    overallEndsAt: session.overallEndsAt,
    sectionEndsAt: session.sectionEndsAt,
    currentSectionId: session.currentSectionId,
    status: session.status,
    forceSubmitted: changed && session.status !== 'active',
  };
  return ok(beat);
}

function nextSection(sessionId: string, init: RequestInit): SampleResult {
  const db = load();
  const session = db.sessions.find((item) => item.id === sessionId);
  if (!session) return fail(404, 'Session not found');
  if (session.status !== 'active') {
    const closed: SectionNextResponse = { submitted: true, session: toState(session) };
    return ok(closed);
  }
  const body = readJson(init) as { fromSectionId?: unknown } | null;
  const fromSectionId = typeof body?.fromSectionId === 'string' ? body.fromSectionId : null;
  if (fromSectionId && fromSectionId !== session.currentSectionId) {
    const synced: SectionNextResponse = { submitted: false, session: toState(session) };
    return ok(synced);
  }
  const sections = SAMPLE_EXAM.sections;
  const index = sections.findIndex((section) => section.id === session.currentSectionId);
  const next = sections[index + 1];
  if (!next) {
    closeSession(db, session, 'submitted');
    save(db);
    const done: SectionNextResponse = { submitted: true, session: toState(session) };
    return ok(done);
  }
  const now = Date.now();
  const overall = Date.parse(session.overallEndsAt);
  session.currentSectionId = next.id;
  session.sectionEndsAt = new Date(Math.min(now + next.durationSec * 1000, overall)).toISOString();
  save(db);
  const moved: SectionNextResponse = { submitted: false, session: toState(session) };
  return ok(moved);
}

function addViolation(sessionId: string, init: RequestInit): SampleResult {
  const db = load();
  const session = db.sessions.find((item) => item.id === sessionId);
  if (!session) return fail(404, 'Session not found');
  if (session.status !== 'active') return fail(409, 'Attempt is readonly');
  const body = readJson(init) as { type?: unknown; at?: unknown } | null;
  const type = body?.type === 'fullscreen_exit' || body?.type === 'tab_blur' ? body.type : null;
  if (!type) return fail(400, 'Invalid violation');
  const record: ViolationRecord = {
    id: randomId('sample_vio'),
    type: type as ViolationType,
    at: typeof body?.at === 'string' ? body.at : new Date().toISOString(),
  };
  session.violations.push(record);
  save(db);
  return ok(record);
}

function submitSession(sessionId: string, forced: boolean): SampleResult {
  const db = load();
  const session = db.sessions.find((item) => item.id === sessionId);
  if (!session) return fail(404, 'Session not found');
  let attempt = db.attempts.find((item) => item.sessionId === sessionId);
  if (!attempt) {
    if (session.status === 'active') session.status = forced ? 'expired' : 'submitted';
    attempt = buildAttempt(session, forced || session.status === 'expired');
    db.attempts.unshift(attempt);
    save(db);
  }
  const result: SubmitResult = { attemptId: attempt.id, forced: attempt.forced };
  return ok(result);
}

function listAttempts(): AttemptSummary[] {
  return load().attempts.map(toSummary);
}

function getAttempt(attemptId: string): SampleResult {
  const attempt = load().attempts.find((item) => item.id === attemptId);
  if (!attempt) return fail(404, 'Attempt not found');
  return ok(attempt);
}

function uploadMedia(): MediaUploadResponse {
  const mediaId = randomId('sample_media');
  return {
    mediaId,
    url: `/media/${mediaId}`,
    key: `speaking/${mediaId}.webm`,
  };
}

function closeSession(db: SampleDb, session: StoredSession, status: 'submitted' | 'expired') {
  session.status = status;
  if (!db.attempts.some((attempt) => attempt.sessionId === session.id)) {
    db.attempts.unshift(buildAttempt(session, status === 'expired'));
  }
}

function enforceDeadlines(db: SampleDb, session: StoredSession): boolean {
  if (session.status !== 'active') return false;
  const now = Date.now();
  if (Date.parse(session.overallEndsAt) <= now) {
    closeSession(db, session, 'expired');
    return true;
  }
  if (Date.parse(session.sectionEndsAt) <= now) {
    const sections = SAMPLE_EXAM.sections;
    const index = sections.findIndex((section) => section.id === session.currentSectionId);
    const next = sections[index + 1];
    if (!next) {
      closeSession(db, session, 'expired');
      return true;
    }
    session.currentSectionId = next.id;
    session.sectionEndsAt = new Date(
      Math.min(now + next.durationSec * 1000, Date.parse(session.overallEndsAt)),
    ).toISOString();
    return true;
  }
  return false;
}

function buildAttempt(session: StoredSession, forced: boolean): AttemptDetail {
  const answers = SAMPLE_EXAM.sections.flatMap((section) =>
    section.questions.map((question) => scoreQuestion(section, question, session)),
  );
  const sectionScores = SAMPLE_EXAM.sections.map((section) => {
    const mine = answers.filter((answer) => answer.sectionId === section.id);
    const pending = mine.some((answer) => answer.score === null);
    return {
      sectionId: section.id,
      name: section.name,
      score: pending ? null : mine.reduce((sum, answer) => sum + (answer.score ?? 0), 0),
      maxScore: mine.reduce((sum, answer) => sum + answer.maxScore, 0),
    };
  });
  const violations = {
    total: session.violations.length,
    fullscreenExit: session.violations.filter((item) => item.type === 'fullscreen_exit').length,
    tabBlur: session.violations.filter((item) => item.type === 'tab_blur').length,
  };
  return {
    id: randomId('sample_attempt'),
    examId: session.examId,
    examTitle: SAMPLE_EXAM.title,
    sessionId: session.id,
    submittedAt: new Date().toISOString(),
    forced,
    scoringStatus: sectionScores.some((section) => section.score === null) ? 'pending' : 'scored',
    overallScore: overallScoreOf(sectionScores),
    overallMaxScore: overallMaxScoreOf(sectionScores),
    sectionScores,
    violations,
    answers,
  };
}

function scoreQuestion(section: SampleSection, question: SampleQuestion, session: StoredSession) {
  const saved = session.answers.find((answer) => answer.questionId === question.id);
  const payload = saved?.payload ?? null;
  if (question.type === 'essay') {
    const words =
      payload?.kind === 'essay' ? payload.text.trim().split(/\s+/).filter(Boolean).length : 0;
    const score = Math.max(
      0,
      Math.min(question.maxScore, Math.round((words / 120) * question.maxScore)),
    );
    return scored(section, question, payload, score, true);
  }
  if (question.type === 'speaking') {
    const score =
      payload?.kind === 'speaking' && payload.mediaId ? Math.min(3, question.maxScore) : 0;
    return scored(section, question, payload, score, true);
  }
  const choiceId = payload?.kind === 'choice' ? payload.choiceId : null;
  const correct = Boolean(question.correctChoiceId) && choiceId === question.correctChoiceId;
  return {
    questionId: question.id,
    sectionId: section.id,
    type: question.type,
    payload,
    correct,
    scoreStatus: 'scored' as const,
    score: correct ? question.maxScore : 0,
    maxScore: question.maxScore,
  };
}

function scored(
  section: SampleSection,
  question: SampleQuestion,
  payload: AnswerPayload | null,
  score: number,
  stub: boolean,
) {
  return {
    questionId: question.id,
    sectionId: section.id,
    type: question.type,
    payload,
    scoreStatus: 'scored' as const,
    score,
    maxScore: question.maxScore,
    stub,
  };
}

function toSummary(attempt: AttemptDetail): AttemptSummary {
  const { answers: _answers, ...summary } = attempt;
  return summary;
}

function toState(session: StoredSession): SessionState {
  return {
    id: session.id,
    examId: session.examId,
    status: session.status,
    serverNow: new Date().toISOString(),
    startedAt: session.startedAt,
    overallEndsAt: session.overallEndsAt,
    sectionEndsAt: session.sectionEndsAt,
    currentSectionId: session.currentSectionId,
    answers: session.answers,
    violations: session.violations,
  };
}

function toPublic(question: SampleQuestion, reveal: boolean): PublicQuestion {
  const pub: PublicQuestion = {
    id: question.id,
    sectionId: question.sectionId,
    type: question.type,
    prompt: question.prompt,
    order: question.order,
    choices: question.choices,
    audioUrl: question.audioUrl ?? null,
  };
  if (reveal && question.correctChoiceId) pub.correctChoiceId = question.correctChoiceId;
  return pub;
}

function ok(body: unknown): SampleResult {
  return { ok: true, status: 200, body };
}

function fail(status: number, body: unknown): SampleResult {
  if (typeof body === 'string')
    return { ok: false, status, body: { message: body, statusCode: status } };
  return { ok: false, status, body };
}

function readJson(init: RequestInit): unknown {
  if (typeof init.body !== 'string') return null;
  try {
    return JSON.parse(init.body) as unknown;
  } catch {
    return null;
  }
}

function load(): SampleDb {
  if (typeof window === 'undefined') return { sessions: [], attempts: [] };
  const raw = window.sessionStorage.getItem(DB_KEY);
  if (!raw) return { sessions: [], attempts: [] };
  try {
    const parsed = JSON.parse(raw) as SampleDb;
    if (!parsed || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.attempts)) {
      return { sessions: [], attempts: [] };
    }
    return parsed;
  } catch {
    return { sessions: [], attempts: [] };
  }
}

function save(db: SampleDb) {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(DB_KEY, JSON.stringify(db));
  }
  listeners.forEach((listener) => listener());
}

function randomId(prefix: string) {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else
    for (let index = 0; index < bytes.length; index += 1)
      bytes[index] = Math.floor(Math.random() * 256);
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}
