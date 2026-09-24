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
import { formatAttemptScore, formatDateTime } from '../../lib/format';

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
          Each submitted exam is listed with its date, score, and scoring status. Open one to review
          the result. Nothing here can be edited.
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
        {attempts.data?.length === 0 ? (
          <p className="rounded-card border border-ink/10 bg-card p-5 text-sm text-ink/70">
            No attempts yet. Finish an exam to see it here.
          </p>
        ) : null}
        {attempts.data?.map((attempt) => (
          <AttemptRow key={attempt.id} attempt={attempt} />
        ))}
      </div>
    </Shell>
  );
}

function AttemptRow({ attempt }: { attempt: AttemptSummary }) {
  return (
    <Link
      href={`/attempts/${attempt.id}`}
      className="block rounded-card border border-ink/10 bg-card p-5 shadow-sm transition hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-serif text-2xl">{attempt.examTitle}</h2>
        <span className="text-sm font-medium text-primary">View</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs tracking-[0.14em] text-ink/45 uppercase">Date</dt>
          <dd className="mt-1 text-sm text-ink/80">{formatDateTime(attempt.submittedAt)}</dd>
          {attempt.forced ? (
            <dd className="mt-1 text-xs text-ink/55">Timer ended the attempt</dd>
          ) : null}
        </div>
        <div>
          <dt className="text-xs tracking-[0.14em] text-ink/45 uppercase">Score</dt>
          <dd className="mt-1 text-sm text-ink/80">
            {formatAttemptScore(attempt.score, attempt.maxScore)}
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-[0.14em] text-ink/45 uppercase">Status</dt>
          <dd className="mt-1">
            <ScorePill status={attempt.scoringStatus} />
          </dd>
        </div>
      </dl>
    </Link>
  );
}
