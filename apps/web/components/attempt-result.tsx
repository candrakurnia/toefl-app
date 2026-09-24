import Link from 'next/link';
import {
  AttemptDetail,
  ScoredAnswer,
  ScoreStatus,
  SectionScore,
  isAutoScoredType,
  isModelScoredType,
  partialAutoScore,
} from '@toefl/shared';
import {
  formatDateTime,
  formatPoints,
  formatQuestionType,
  formatScoreState,
  formatScoringStatus,
  formatViolation,
} from '../lib/format';

export function AttemptResult({ attempt }: { attempt: AttemptDetail }) {
  const pending = attempt.scoringStatus === 'pending';
  const auto = partialAutoScore(attempt);
  const modelAnswers = attempt.answers.filter((answer) => isModelScoredType(answer.type));
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

      {pending ? <AiScoringBanner /> : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <article className="rounded-card border border-ink/10 bg-card p-5 shadow-sm">
          <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">Auto-scored</p>
          <p className="mt-2 font-serif text-4xl tabular-nums">
            {formatPoints(auto.earned, auto.max)}
          </p>
          <p className="mt-2 text-sm leading-6 text-ink/65">
            Multiple choice and listening. These points are available as soon as the exam is
            submitted.
          </p>
        </article>
        <article className="rounded-card border border-ink/10 bg-card p-5 shadow-sm">
          <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">Essay and speaking</p>
          <p className="mt-2 font-serif text-4xl" aria-live="polite">
            {modelAnswers.length === 0 ? 'None' : modelPending ? 'AI scoring…' : 'Scored'}
          </p>
          <p className="mt-2 text-sm leading-6 text-ink/65">
            {modelAnswers.length === 0
              ? 'This exam has no essay or speaking responses.'
              : modelPending
                ? 'Waiting on AI scoring. This page refreshes until each item is scored.'
                : 'Every essay and speaking response has a scoring status of Scored.'}
          </p>
        </article>
      </div>

      <section className="mt-6 rounded-card border border-ink/10 bg-card p-5 shadow-sm">
        <h2 className="font-serif text-2xl">Section scores</h2>
        <ul className="mt-4 divide-y divide-ink/10">
          {attempt.sectionScores.map((section) => {
            const answers = attempt.answers.filter(
              (answer) => answer.sectionId === section.sectionId,
            );
            const status = sectionStatus(answers);
            return (
              <li key={section.sectionId} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{section.name}</p>
                  <p className="mt-1 text-sm text-ink/65">{sectionScoreLabel(section, answers)}</p>
                </div>
                <ScorePill status={status} tone="state" />
              </li>
            );
          })}
        </ul>
      </section>

      <ViolationList attempt={attempt} />

      <section className="mt-6 space-y-6">
        {attempt.sectionScores.map((section) => {
          const answers = attempt.answers.filter(
            (answer) => answer.sectionId === section.sectionId,
          );
          return (
            <div key={section.sectionId}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-xl">{section.name}</h2>
                <ScorePill status={sectionStatus(answers)} tone="state" />
              </div>
              <ul className="mt-3 space-y-3">
                {answers.map((answer, index) => (
                  <li
                    key={answer.questionId}
                    className="rounded-card border border-ink/10 bg-card px-4 py-3 text-sm"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-ink/80">
                        {index + 1}. {formatQuestionType(answer.type)}
                      </span>
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

function AiScoringBanner() {
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
        <p className="font-medium text-primary">AI scoring…</p>
        <p className="mt-1 text-sm leading-6 text-ink/75">
          Essay and speaking stay Pending until a grade is stored. Multiple choice and listening
          scores are already final. This page checks again on its own.
        </p>
      </div>
    </div>
  );
}

function ViolationList({ attempt }: { attempt: AttemptDetail }) {
  const counts = attempt.violations.reduce<Record<string, number>>((map, violation) => {
    map[violation.type] = (map[violation.type] ?? 0) + 1;
    return map;
  }, {});

  return (
    <section className="mt-6 rounded-card border border-ink/10 bg-card p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-2xl">Violations</h2>
        <span className="text-sm text-ink/60">
          {attempt.violations.length === 0 ? 'None' : attempt.violations.length}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/65">
        Fullscreen exits and tab switches recorded during this session. The timers did not pause.
      </p>
      {attempt.violations.length === 0 ? (
        <p className="mt-4 text-sm text-ink/70">
          No fullscreen exits or tab switches were recorded.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(counts).map(([type, count]) => (
              <span key={type} className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink/80">
                {formatViolation(type)} · {count}
              </span>
            ))}
          </div>
          <ul className="mt-4 divide-y divide-ink/10">
            {attempt.violations.map((violation) => (
              <li
                key={violation.id}
                className="flex items-baseline justify-between gap-3 py-3 text-sm"
              >
                <span>{formatViolation(violation.type)}</span>
                <span className="text-ink/60">{formatDateTime(violation.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function sectionStatus(answers: ScoredAnswer[]): ScoreStatus {
  return answers.some((answer) => answer.scoreStatus === 'pending') ? 'pending' : 'scored';
}

function sectionScoreLabel(section: SectionScore, answers: ScoredAnswer[]) {
  const auto = answers.filter((answer) => isAutoScoredType(answer.type));
  const model = answers.filter((answer) => isModelScoredType(answer.type));
  const pending = answers.some((answer) => answer.scoreStatus === 'pending');
  const autoEarned = auto.reduce((sum, answer) => sum + (answer.score ?? 0), 0);
  const autoMaxKnown =
    auto.length > 0 && auto.every((answer) => typeof answer.maxScore === 'number');
  const autoMax = autoMaxKnown
    ? auto.reduce((sum, answer) => sum + (answer.maxScore ?? 0), 0)
    : auto.length === answers.length
      ? section.maxScore
      : 0;

  if (pending && auto.length === 0) return 'AI scoring…';
  if (pending) {
    const partial = formatPoints(autoEarned, autoMax);
    return `${partial} auto-scored · AI scoring…`;
  }
  if (model.length > 0 && model.every((answer) => answer.score === null)) {
    if (auto.length === 0) return 'Scored';
    return `${formatPoints(autoEarned, autoMax)} auto-scored · essay and speaking scored`;
  }
  if (section.score === null) return `— / ${section.maxScore}`;
  return `${section.score} / ${section.maxScore}`;
}

function outcomeLabel(answer: ScoredAnswer) {
  if (answer.scoreStatus === 'pending') return 'Pending';
  if (isModelScoredType(answer.type)) {
    if (typeof answer.score === 'number' && typeof answer.maxScore === 'number') {
      return `Scored · ${answer.score} / ${answer.maxScore}`;
    }
    if (typeof answer.score === 'number') return `Scored · ${answer.score}`;
    return 'Scored';
  }
  const points =
    typeof answer.score === 'number' && typeof answer.maxScore === 'number'
      ? `${answer.score} / ${answer.maxScore}`
      : typeof answer.score === 'number'
        ? String(answer.score)
        : null;
  if (answer.correct === true) return points ? `Correct · ${points}` : 'Correct';
  if (answer.correct === false) return points ? `Incorrect · ${points}` : 'Incorrect';
  return formatScoreState(answer.scoreStatus);
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

export function ScorePill({
  status,
  tone = 'status',
}: {
  status: string;
  tone?: 'status' | 'state';
}) {
  const pending = status === 'pending';
  const label = tone === 'state' ? formatScoreState(status) : formatScoringStatus(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        pending ? 'bg-primary/10 text-primary' : 'bg-emerald-100 text-emerald-800'
      }`}
    >
      {pending ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
      ) : null}
      {label}
    </span>
  );
}
