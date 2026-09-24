export const QUESTION_TYPES = ['multiple_choice', 'essay', 'listening', 'speaking'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const EXAM_PROGRESS_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export type ExamProgressStatus = (typeof EXAM_PROGRESS_STATUSES)[number];

export const SESSION_STATUSES = ['active', 'submitted', 'expired'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const VIOLATION_TYPES = ['fullscreen_exit', 'tab_blur'] as const;
export type ViolationType = (typeof VIOLATION_TYPES)[number];

export const SCORE_STATUSES = ['pending', 'scored'] as const;
export type ScoreStatus = (typeof SCORE_STATUSES)[number];

/** Seeded practice exam uses 24 hours, matching the product rule. */
export const OVERALL_WINDOW_SEC = 24 * 60 * 60;

export interface UserPublic {
  id: string;
  email: string;
  createdAt: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshRequest {
  refreshToken?: string;
}

export interface ExamSummary {
  id: string;
  title: string;
  /** Seconds. The seeded exam is {@link OVERALL_WINDOW_SEC} (24 hours). */
  durationOverall: number;
  status: ExamProgressStatus;
  /** Set when `status` is `in_progress`. Resume with `GET /sessions/:sessionId`. */
  activeSessionId: string | null;
}

export interface ExamSection {
  id: string;
  name: string;
  durationSec: number;
  questionTypes: QuestionType[];
}

export interface ExamDetail {
  id: string;
  title: string;
  durationOverall: number;
  sections: ExamSection[];
  rules: string[];
  questionCount: number;
}

export type AnswerPayload =
  | { kind: 'choice'; choiceId: string }
  | { kind: 'essay'; text: string }
  | { kind: 'speaking'; mediaId: string; url?: string };

/** Authenticated playback path for an uploaded speaking recording. */
export function mediaPlaybackPath(mediaId: string): string {
  return `/media/${encodeURIComponent(mediaId)}`;
}

export interface AnswerSnapshot {
  questionId: string;
  payload: AnswerPayload;
  updatedAt: string;
}

export interface ViolationRecord {
  id: string;
  type: ViolationType;
  at: string;
}

export interface SessionState {
  id: string;
  examId: string;
  status: SessionStatus;
  serverNow: string;
  startedAt: string;
  overallEndsAt: string;
  sectionEndsAt: string;
  currentSectionId: string | null;
  answers: AnswerSnapshot[];
  violations: ViolationRecord[];
}

/** `POST /exams/:id/sessions` when this user already has an active session for the exam. */
export const ACTIVE_SESSION_CONFLICT_CODE = 'ACTIVE_SESSION_EXISTS' as const;

export const ACTIVE_SESSION_CONFLICT_MESSAGE = 'An active session already exists for this exam';

export interface ActiveSessionConflict {
  statusCode: 409;
  message: typeof ACTIVE_SESSION_CONFLICT_MESSAGE;
  code: typeof ACTIVE_SESSION_CONFLICT_CODE;
  /** Id of the in-progress session. Resume with `GET /sessions/:sessionId`. */
  sessionId: string;
}

export function activeSessionConflictBody(sessionId: string): ActiveSessionConflict {
  return {
    statusCode: 409,
    message: ACTIVE_SESSION_CONFLICT_MESSAGE,
    code: ACTIVE_SESSION_CONFLICT_CODE,
    sessionId,
  };
}

/** Reads `sessionId` from a 409 body, including a Nest body whose `message` is that object. */
export function sessionIdFromConflict(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as { sessionId?: unknown; message?: unknown };
  if (typeof record.sessionId === 'string' && record.sessionId.length > 0) return record.sessionId;
  if (record.message && typeof record.message === 'object') {
    const nested = (record.message as { sessionId?: unknown }).sessionId;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return null;
}

export interface PublicQuestion {
  id: string;
  sectionId: string;
  type: QuestionType;
  prompt: string;
  order: number;
  choices?: Array<{ id: string; text: string }>;
  audioUrl?: string | null;
  /** Included only after the session has been submitted or force-submitted. */
  correctChoiceId?: string;
}

export interface SectionQuestions {
  sectionId: string;
  questions: PublicQuestion[];
}

export interface AutosaveRequest {
  questionId: string;
  payload: AnswerPayload;
}

export interface AutosaveResponse {
  questionId: string;
  payload: AnswerPayload;
  updatedAt: string;
}

export interface SectionNextRequest {
  /**
   * Section the client is leaving. If the server has already moved on,
   * the call syncs deadlines and does not advance a second time.
   */
  fromSectionId?: string;
}

export interface SectionNextResponse {
  submitted: boolean;
  session: SessionState;
}

export interface HeartbeatRequest {
  visibility?: 'visible' | 'hidden';
  fullscreen?: boolean;
}

export interface HeartbeatResponse {
  serverNow: string;
  overallEndsAt: string;
  sectionEndsAt: string;
  currentSectionId: string | null;
  status: SessionStatus;
  forceSubmitted: boolean;
}

export interface ViolationRequest {
  type: ViolationType;
  at: string;
}

export interface SubmitResult {
  attemptId: string;
  forced: boolean;
}

export interface SectionScore {
  sectionId: string;
  name: string;
  score: number | null;
  maxScore: number;
}

export interface ScoredAnswer {
  questionId: string;
  sectionId: string;
  type: QuestionType;
  payload: AnswerPayload | null;
  correct?: boolean;
  scoreStatus: ScoreStatus;
  /**
   * Points awarded. Null while `scoreStatus` is `pending`.
   * The MVP worker fills essay and speaking with a deterministic practice score and sets `stub`.
   * A later model scorer should write its own number and omit `stub` (or set it false).
   */
  score: number | null;
  maxScore: number;
  /** True when the grade came from the deterministic practice scorer, not a model. */
  stub?: boolean;
}

export interface ViolationsSummary {
  total: number;
  fullscreenExit: number;
  tabBlur: number;
}

export interface AttemptSummary {
  id: string;
  examId: string;
  examTitle: string;
  sessionId: string;
  submittedAt: string;
  forced: boolean;
  /**
   * Pending badge. `pending` while any section score is still null, otherwise `scored`.
   * Clients can poll `GET /attempts/:id` until this flips.
   */
  scoringStatus: ScoreStatus;
  /** Total score. Null while `scoringStatus` is `pending`. */
  overallScore: number | null;
  overallMaxScore: number;
  sectionScores: SectionScore[];
  violations: ViolationsSummary;
}

export interface AttemptDetail extends AttemptSummary {
  answers: ScoredAnswer[];
}

export function overallMaxScoreOf(sectionScores: SectionScore[]): number {
  return sectionScores.reduce((sum, section) => sum + section.maxScore, 0);
}

/** Null while any section is still waiting on a numeric score. */
export function overallScoreOf(sectionScores: SectionScore[]): number | null {
  if (sectionScores.some((section) => section.score === null)) return null;
  return sectionScores.reduce((sum, section) => sum + (section.score ?? 0), 0);
}

export interface MediaUploadResponse {
  mediaId: string;
  /** Authenticated playback path (`/media/:mediaId`). */
  url: string;
  /** Object key (`speaking/<mediaId>.<ext>`) on local disk or in the bucket. */
  key: string;
}

export function isAttemptResult(value: unknown): value is {
  sectionScores: SectionScore[];
  answers: ScoredAnswer[];
} {
  if (!value || typeof value !== 'object') return false;
  const record = value as { sectionScores?: unknown; answers?: unknown };
  return Array.isArray(record.sectionScores) && Array.isArray(record.answers);
}
