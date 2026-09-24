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
  | { kind: 'speaking'; mediaId: string };

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
  /** Null while a model grade does not exist. Stub scoring leaves this null. */
  score: number | null;
  stub?: boolean;
}

export interface AttemptSummary {
  id: string;
  examId: string;
  examTitle: string;
  sessionId: string;
  submittedAt: string;
  forced: boolean;
  scoringStatus: ScoreStatus;
}

export interface AttemptDetail extends AttemptSummary {
  sectionScores: SectionScore[];
  answers: ScoredAnswer[];
}

export interface MediaUploadResponse {
  mediaId: string;
  url: string;
}

export function isAttemptResult(value: unknown): value is {
  sectionScores: SectionScore[];
  answers: ScoredAnswer[];
} {
  if (!value || typeof value !== 'object') return false;
  const record = value as { sectionScores?: unknown; answers?: unknown };
  return Array.isArray(record.sectionScores) && Array.isArray(record.answers);
}
