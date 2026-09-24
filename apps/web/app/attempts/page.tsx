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
import { formatDateTime, formatOverall, formatViolations } from '../../lib/format';

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
          Submitted exams stay here, including partial scores and items still waiting on AI scoring.
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
          <article
            key={attempt.id}
            className="flex flex-col justify-between gap-4 rounded-card border border-ink/10 bg-card p-5 shadow-sm sm:flex-row sm:items-center"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-2xl">{attempt.examTitle}</h2>
                <ScorePill status={attempt.scoringStatus} />
              </div>
              <p className="mt-2 text-sm text-ink/65">
                {formatDateTime(attempt.submittedAt)}
                {attempt.forced ? ' · timer ended the attempt' : ''}
                {' · '}
                {formatOverall(attempt.overallScore, attempt.overallMaxScore)}
              </p>
              <p className="mt-1 text-sm text-ink/55">{formatViolations(attempt.violations)}</p>
            </div>
            <Link
              href={`/attempts/${attempt.id}`}
              className="inline-flex justify-center rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
            >
              View result
            </Link>
          </article>
        ))}
      </div>
    </Shell>
  );
}
