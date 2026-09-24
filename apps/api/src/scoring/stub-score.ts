import { QuestionType, ScoredAnswer, SectionScore } from '@toefl/shared';

/** Essay length that earns the section's max score. Shorter answers scale linearly. */
export const STUB_ESSAY_WORD_TARGET = 150;

/** How long a new attempt stays `pending` before the practice scorer writes a number. */
export const DEFAULT_STUB_DELAY_MS = 4000;

const DEFAULT_MAX: Record<QuestionType, number> = {
  multiple_choice: 1,
  listening: 1,
  essay: 5,
  speaking: 5,
};

type StoredAnswer = Omit<ScoredAnswer, 'maxScore'> & { maxScore?: number };

export interface AttemptScoreResult {
  sectionScores: SectionScore[];
  answers: Array<StoredAnswer | ScoredAnswer>;
}

/**
 * Practice grade for one essay or speaking answer.
 * Real model scoring is a later replacement: it should persist its own number and leave `stub` unset or false.
 * This function does not call a model.
 *
 * Essay: 0 words → 0. Otherwise `clamp(round(min(1, words / 150) * maxScore), 1, maxScore)`.
 * Speaking: missing media id → 0. Otherwise `1 + (fnv1a(mediaId) % maxScore)` so the same recording always scores the same.
 */
export function deterministicStubScore(
  answer: Pick<ScoredAnswer, 'type' | 'payload' | 'maxScore'>,
): number {
  const max = Math.max(0, Math.floor(answer.maxScore));
  if (max === 0) return 0;
  if (answer.type === 'essay') {
    const text = answer.payload?.kind === 'essay' ? answer.payload.text.trim() : '';
    if (!text) return 0;
    const words = text.split(/\s+/).length;
    const scaled = Math.round(Math.min(1, words / STUB_ESSAY_WORD_TARGET) * max);
    return Math.min(max, Math.max(1, scaled));
  }
  if (answer.type === 'speaking') {
    const mediaId = answer.payload?.kind === 'speaking' ? answer.payload.mediaId.trim() : '';
    if (!mediaId) return 0;
    return 1 + (fnv1a(mediaId) % max);
  }
  return 0;
}

export function withMaxScore(answer: StoredAnswer): ScoredAnswer {
  if (
    typeof answer.maxScore === 'number' &&
    Number.isFinite(answer.maxScore) &&
    answer.maxScore >= 0
  ) {
    return answer as ScoredAnswer;
  }
  return { ...answer, maxScore: DEFAULT_MAX[answer.type] ?? 1 };
}

export function sectionScoresFromAnswers(
  sections: Array<Pick<SectionScore, 'sectionId' | 'name' | 'maxScore'>>,
  answers: ScoredAnswer[],
): SectionScore[] {
  return sections.map((section) => {
    const mine = answers.filter((answer) => answer.sectionId === section.sectionId);
    const waiting = mine.some((answer) => answer.scoreStatus !== 'scored' || answer.score === null);
    const maxScore =
      typeof section.maxScore === 'number' && Number.isFinite(section.maxScore)
        ? section.maxScore
        : 0;
    return {
      sectionId: section.sectionId,
      name: section.name,
      maxScore,
      score: waiting ? null : mine.reduce((sum, answer) => sum + (answer.score ?? 0), 0),
    };
  });
}

/**
 * Fills essay/speaking grades that are still pending, or that an older worker marked
 * `scored` with a null score and `stub: true`. Numeric scores are left alone, including
 * future model grades. Returns null when nothing changed.
 * Pending rows are left pending while `nowMs - submittedAtMs < delayMs`.
 */
export function applyDeterministicStub(
  result: AttemptScoreResult,
  options: { nowMs: number; submittedAtMs: number; delayMs: number },
): { sectionScores: SectionScore[]; answers: ScoredAnswer[] } | null {
  const withinGrace = options.nowMs - options.submittedAtMs < options.delayMs;
  let changed = false;
  const answers = result.answers.map((raw) => {
    const answer = withMaxScore(raw);
    if (answer.maxScore !== raw.maxScore) changed = true;
    if (!needsStubGrade(answer)) return answer;
    if (answer.scoreStatus === 'pending' && withinGrace) return answer;
    changed = true;
    return {
      ...answer,
      scoreStatus: 'scored' as const,
      score: deterministicStubScore(answer),
      stub: true,
    };
  });
  if (!changed) return null;
  return {
    answers,
    sectionScores: sectionScoresFromAnswers(result.sectionScores, answers),
  };
}

export function hasPendingModelAnswer(
  answers: Array<Pick<ScoredAnswer, 'type' | 'scoreStatus'>>,
): boolean {
  return answers.some(
    (answer) =>
      (answer.type === 'essay' || answer.type === 'speaking') && answer.scoreStatus === 'pending',
  );
}

function needsStubGrade(answer: ScoredAnswer): boolean {
  if (answer.type !== 'essay' && answer.type !== 'speaking') return false;
  if (answer.scoreStatus === 'pending') return true;
  return answer.stub === true && answer.score === null;
}

/** FNV-1a 32-bit. Stable across processes so a recording's practice score does not drift. */
export function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
