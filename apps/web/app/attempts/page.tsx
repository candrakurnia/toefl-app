'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AttemptSummary } from '@toefl/shared';
import { ScorePill } from '../../components/attempt-result';
import { Shell } from '../../components/shell';
import { useAuth } from '../../components/providers';
import { api } from '../../lib/api';
import { formatDateTime, formatOverall } from '../../lib/format';

export default function AttemptsPage() {
  const { token, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !token) router.replace('/login');
  }, [ready, token, router]);

  const attempts = useQuery({
    queryKey: ['attempts'],
    queryFn: () => api<AttemptSummary[]>('/attempts'),
    enabled: ready && Boolean(token),
    refetchInterval: (query) =>
      query.state.data?.some((attempt) => attempt.scoringStatus === 'pending') ? 3000 : false,
  });

  return (
    <Shell
      action={
        <Link href="/exams" className="text-sm text-ink/70">
          All exams
        </Link>
      }
    >
      <div className="max-w-3xl">
        <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">History</p>
        <h1 className="mt-2 font-serif text-4xl">Attempts</h1>
        <p className="mt-3 text-sm leading-6 text-ink/70">
          Every submitted exam is listed with its date, total, and status. Open one to review the
          result. Nothing here can be edited.
        </p>
      </div>

      <div className="mt-8 grid max-w-3xl gap-4">
        {!ready || attempts.isLoading ? (
          <div className="h-28 animate-pulse rounded-card bg-ink/5" />
        ) : null}
        {attempts.isError ? (
          <p className="rounded-card border border-red-200 bg-card p-5 text-sm text-red-700">
            {attempts.error instanceof Error ? attempts.error.message : 'Could not load attempts'}
          </p>
        ) : null}
        {attempts.data?.length === 0 ? <EmptyHistory /> : null}
        {attempts.data?.map((attempt) => (
          <AttemptRow key={attempt.id} attempt={attempt} />
        ))}
      </div>
    </Shell>
  );
}

function AttemptRow({ attempt }: { attempt: AttemptSummary }) {
  const unscored = attempt.scoringStatus === 'pending';
  return (
    <Link
      href={`/attempts/${attempt.id}`}
      className="block rounded-card border border-ink/10 bg-card p-5 shadow-sm transition hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.14em] text-ink/45 uppercase">Exam</p>
          <h2 className="mt-1 font-serif text-2xl">{attempt.examTitle}</h2>
        </div>
        {unscored ? <ScorePill status="pending" /> : null}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs tracking-[0.14em] text-ink/45 uppercase">Date</dt>
          <dd className="mt-1 text-sm text-ink/80">{formatDateTime(attempt.submittedAt)}</dd>
          {attempt.forced ? (
            <dd className="mt-1 text-xs text-ink/55">Timer ended the attempt</dd>
          ) : null}
        </div>
        <div>
          <dt className="text-xs tracking-[0.14em] text-ink/45 uppercase">Total</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/80">
            <span>{formatOverall(attempt.overallScore, attempt.overallMaxScore)}</span>
            {unscored ? null : <ScorePill status={attempt.scoringStatus} />}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

function EmptyHistory() {
  return (
    <div className="rounded-card border border-dashed border-ink/15 bg-card px-6 py-10 text-center">
      <h2 className="font-serif text-2xl">No attempts yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink/70">
        You have not taken a test yet. Finish a practice exam and the result will be listed here.
      </p>
      <Link
        href="/exams"
        className="mt-5 inline-flex rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
      >
        Choose an exam
      </Link>
    </div>
  );
}
