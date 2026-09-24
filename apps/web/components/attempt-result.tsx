import Link from 'next/link';
import {
  AttemptDetail,
  QuestionType,
  ScoredAnswer,
  ScoreStatus,
  SectionScore,
  ViolationsSummary,
} from '@toefl/shared';
import {
  formatDateTime,
  formatOverall,
  formatPoints,
  formatQuestionType,
  formatScoringStatus,
} from '../lib/format';

export function AttemptResult({ attempt }: { attempt: AttemptDetail }) {
  const pending = attempt.scoringStatus === 'pending';
  const auto = partialAutoScore(attempt.answers);
  const modelAnswers = attempt.answers.filter((answer) => isModelScored(answer.type));
  const modelPending = modelAnswers.some((answer) => answer.scoreStatus === 'pending');

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">Result</p>
      <h1 className="mt-2 font-serif text-4xl">{attempt.examTitle}</h1>
      <p className="mt-3 text-sm text-ink/70">
        Submitted {formatDateTime(attempt.submittedAt)}
        {attempt.forced ? ' · timer ended the attempt' : ''}
      </p>
      <p className="mt-3 text-sm text-ink/55">Read only. Submitted answers cannot be changed.</p>

      {pending ? <PendingBanner /> : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <article className="rounded-card border border-ink/10 bg-card p-5 shadow-sm">
          <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">Auto-scored</p>
          <p className="mt-2 font-serif text-4xl tabular-nums">
            {formatPoints(auto.earned, auto.max)}
          </p>
          <p className="mt-2 text-sm leading-6 text-ink/65">
            Multiple choice and listening. These points are on the attempt as soon as it is
            submitted.
          </p>
        </article>
        <article className="rounded-card border border-ink/10 bg-card p-5 shadow-sm">
          <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">Essay and speaking</p>
          <p className="mt-2 font-serif text-4xl" aria-live="polite">
            {modelAnswers.length === 0 ? 'None' : modelPending ? 'Pending' : 'Scored'}
          </p>
          <p className="mt-2 text-sm leading-6 text-ink/65">
            {modelCopy(modelAnswers, modelPending)}
          </p>
        </article>
      </div>

      <p className="mt-6 text-sm text-ink/70">
        Total {formatOverall(attempt.overallScore, attempt.overallMaxScore)}
      </p>

      <section className="mt-6 rounded-card border border-ink/10 bg-card p-5 shadow-sm">
        <h2 className="font-serif text-2xl">Section scores</h2>
        <ul className="mt-4 divide-y divide-ink/10">
          {attempt.sectionScores.map((section) => {
            const answers = attempt.answers.filter(
              (answer) => answer.sectionId === section.sectionId,
            );
            return (
              <li key={section.sectionId} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{section.name}</p>
                  <p className="mt-1 text-sm text-ink/65">{sectionScoreLabel(section)}</p>
                </div>
                <ScorePill status={sectionStatus(section, answers)} />
              </li>
            );
          })}
        </ul>
      </section>

      <ViolationFlags violations={attempt.violations} />

      <section className="mt-6 space-y-6">
        <h2 className="font-serif text-2xl">Breakdown</h2>
        {attempt.sectionScores.map((section) => {
          const answers = attempt.answers.filter(
            (answer) => answer.sectionId === section.sectionId,
          );
          const groups = groupByType(answers);
          return (
            <div key={section.sectionId}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-serif text-xl">{section.name}</h3>
                <ScorePill status={sectionStatus(section, answers)} />
              </div>
              <p className="mt-1 text-sm text-ink/65">{sectionScoreLabel(section)}</p>
              {groups.length === 0 ? (
                <p className="mt-3 text-sm text-ink/60">No responses saved for this section.</p>
              ) : (
                <div className="mt-3 space-y-4">
                  {groups.map((group) => (
                    <div key={group.type}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{formatQuestionType(group.type)}</span>
                        <span
                          className={
                            groupStatus(group.answers) === 'pending'
                              ? 'text-primary'
                              : 'text-ink/70'
                          }
                        >
                          {typeScoreLabel(group.answers)}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-2">
                        {group.answers.map((answer, index) => (
                          <li
                            key={answer.questionId}
                            className="rounded-card border border-ink/10 bg-card px-4 py-3 text-sm"
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-ink/80">{index + 1}.</span>
                              <span
                                className={
                                  answer.scoreStatus === 'pending' ? 'text-primary' : 'text-ink/70'
                                }
                              >
                                {outcomeLabel(answer)}
                              </span>
                            </div>
                            <p className="mt-2 text-ink/60">{preview(answer)}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <p className="mt-8 text-sm">
        <Link href="/attempts" className="font-medium text-primary">
          Attempt history
        </Link>
      </p>
    </div>
  );
}

function PendingBanner() {
  return (
    <div
      role="status"
      className="mt-6 flex items-start gap-3 rounded-card border border-primary/20 bg-primary/10 px-5 py-4"
    >
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-primary"
        aria-hidden
      />
      <div>
        <p className="font-medium text-primary">Pending</p>
        <p className="mt-1 text-sm leading-6 text-ink/75">
          Essay and speaking are Pending. Multiple choice and listening scores are already shown.
          This page refreshes until those sections are Scored.
        </p>
      </div>
    </div>
  );
}

function ViolationFlags({ violations }: { violations: ViolationsSummary }) {
  const flags = [
    violations.fullscreenExit > 0
      ? { key: 'fullscreen', label: 'Fullscreen exit', count: violations.fullscreenExit }
      : null,
    violations.tabBlur > 0 ? { key: 'tab', label: 'Tab blur', count: violations.tabBlur } : null,
  ].filter((flag): flag is { key: string; label: string; count: number } => flag !== null);
  if (flags.length === 0) return null;

  return (
    <section className="mt-6 rounded-card border border-ink/10 bg-card p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-2xl">Violations</h2>
        <span className="text-sm text-ink/60">{violations.total}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/65">
        Fullscreen exits and tab switches recorded before submit. The timers did not pause.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {flags.map((flag) => (
          <span key={flag.key} className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink/80">
            {flag.label} · {flag.count}
          </span>
        ))}
      </div>
    </section>
  );
}

function modelCopy(answers: ScoredAnswer[], pending: boolean) {
  if (answers.length === 0) return 'This exam has no essay or speaking responses.';
  if (pending)
    return 'Pending until a grade is stored. This page refreshes, then these items show Scored.';
  if (answers.some((answer) => answer.stub)) {
    return 'Scored with a practice grade. A later model can replace that number.';
  }
  return 'Scored. Essay and speaking grades are final for this attempt.';
}

function partialAutoScore(answers: ScoredAnswer[]) {
  const auto = answers.filter((answer) => isAutoScored(answer.type));
  return {
    earned: auto.reduce((sum, answer) => sum + (answer.score ?? 0), 0),
    max: auto.reduce((sum, answer) => sum + answer.maxScore, 0),
  };
}

function isAutoScored(type: QuestionType) {
  return type === 'multiple_choice' || type === 'listening';
}

function isModelScored(type: QuestionType) {
  return type === 'essay' || type === 'speaking';
}

function sectionStatus(section: SectionScore, answers: ScoredAnswer[]): ScoreStatus {
  if (section.score === null || answers.some((answer) => answer.scoreStatus === 'pending')) {
    return 'pending';
  }
  return 'scored';
}

function sectionScoreLabel(section: SectionScore) {
  if (section.score === null) return 'Pending';
  return formatPoints(section.score, section.maxScore);
}

const TYPE_ORDER: QuestionType[] = ['multiple_choice', 'listening', 'speaking', 'essay'];

function groupByType(answers: ScoredAnswer[]) {
  const groups = new Map<QuestionType, ScoredAnswer[]>();
  for (const answer of answers) {
    const list = groups.get(answer.type) ?? [];
    list.push(answer);
    groups.set(answer.type, list);
  }
  return TYPE_ORDER.flatMap((type) => {
    const grouped = groups.get(type);
    return grouped ? [{ type, answers: grouped }] : [];
  });
}

function groupStatus(answers: ScoredAnswer[]): ScoreStatus {
  return answers.some((answer) => answer.scoreStatus === 'pending') ? 'pending' : 'scored';
}

function typeScoreLabel(answers: ScoredAnswer[]) {
  if (groupStatus(answers) === 'pending') return 'Pending';
  const earned = answers.reduce((sum, answer) => sum + (answer.score ?? 0), 0);
  const max = answers.reduce((sum, answer) => sum + answer.maxScore, 0);
  if (answers.some((answer) => answer.score === null)) return 'Scored';
  return `Scored · ${formatPoints(earned, max)}`;
}

function outcomeLabel(answer: ScoredAnswer) {
  if (answer.scoreStatus === 'pending' || answer.score === null) return 'Pending';
  const points = formatPoints(answer.score, answer.maxScore);
  if (isModelScored(answer.type)) return `Scored · ${points}`;
  if (answer.correct === true) return `Correct · ${points}`;
  if (answer.correct === false) return `Incorrect · ${points}`;
  return `Scored · ${points}`;
}

function preview(answer: ScoredAnswer) {
  const payload = answer.payload;
  if (!payload) return 'No answer saved';
  if (payload.kind === 'essay') {
    const text = payload.text.trim();
    if (!text) return 'Empty essay';
    return text.length > 180 ? `${text.slice(0, 180)}…` : text;
  }
  if (payload.kind === 'speaking') return 'Recording attached';
  return 'Choice saved';
}

export function ScorePill({ status }: { status: string }) {
  const pending = status === 'pending';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        pending ? 'bg-primary/10 text-primary' : 'bg-emerald-100 text-emerald-800'
      }`}
    >
      {pending ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
      ) : null}
      {formatScoringStatus(status)}
    </span>
  );
}
