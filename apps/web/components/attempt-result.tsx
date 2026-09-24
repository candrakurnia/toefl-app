import Link from 'next/link';
import { AttemptDetail, ScoredAnswer, SectionScore } from '@toefl/shared';
import { formatDateTime, formatQuestionType, formatScoringStatus } from '../lib/format';

export function AttemptResult({ attempt }: { attempt: AttemptDetail }) {
  const pending = attempt.scoringStatus === 'pending';
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">Result</p>
      <h1 className="mt-2 font-serif text-4xl">{attempt.examTitle}</h1>
      <p className="mt-3 text-sm text-ink/70">
        Submitted {formatDateTime(attempt.submittedAt)}
        {attempt.forced ? ' · timer ended the attempt' : ''}
      </p>
      <p className="mt-4">
        <ScorePill status={attempt.scoringStatus} />
      </p>
      {pending ? (
        <p className="mt-3 text-sm leading-6 text-ink/70">
          Essay and speaking items stay on Pending AI scoring until a grade is stored. This page
          refreshes while that is open.
        </p>
      ) : null}

      <section className="mt-8 rounded-card border border-ink/10 bg-card p-5 shadow-sm">
        <h2 className="font-serif text-2xl">Section scores</h2>
        <ul className="mt-4 divide-y divide-ink/10">
          {attempt.sectionScores.map((section) => (
            <li key={section.sectionId} className="flex items-baseline justify-between gap-4 py-3">
              <span className="font-medium">{section.name}</span>
              <span className="text-sm text-ink/70">
                {sectionScoreLabel(section, attempt.answers)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 space-y-6">
        {attempt.sectionScores.map((section) => {
          const answers = attempt.answers.filter(
            (answer) => answer.sectionId === section.sectionId,
          );
          return (
            <div key={section.sectionId}>
              <h2 className="font-serif text-xl">{section.name}</h2>
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
                      <span className="text-ink/70">{outcomeLabel(answer)}</span>
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

function sectionScoreLabel(section: SectionScore, answers: ScoredAnswer[]) {
  const mine = answers.filter((answer) => answer.sectionId === section.sectionId);
  if (mine.some((answer) => answer.scoreStatus === 'pending')) return 'Pending AI scoring';
  if (section.score === null) return `— / ${section.maxScore}`;
  return `${section.score} / ${section.maxScore}`;
}

function outcomeLabel(answer: ScoredAnswer) {
  if (answer.scoreStatus === 'pending') return 'Pending AI scoring';
  if (answer.type === 'essay' || answer.type === 'speaking') {
    if (answer.score === null) return answer.stub ? 'Scored · placeholder' : 'Scored';
    return `${answer.score}`;
  }
  if (answer.correct === true) return 'Correct';
  if (answer.correct === false) return 'Incorrect';
  return formatScoringStatus(answer.scoreStatus);
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
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        pending ? 'bg-primary/10 text-primary' : 'bg-emerald-100 text-emerald-800'
      }`}
    >
      {formatScoringStatus(status)}
    </span>
  );
}
