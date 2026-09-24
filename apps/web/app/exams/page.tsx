'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ExamSummary } from '@toefl/shared';
import { Shell } from '../../components/shell';
import { StatusPill } from '../../components/status-pill';
import { useAuth } from '../../components/providers';
import { api } from '../../lib/api';
import { formatDuration } from '../../lib/format';

export default function ExamsPage() {
  const { token, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !token) router.replace('/login');
  }, [ready, token, router]);

  const exams = useQuery({
    queryKey: ['exams'],
    queryFn: () => api<ExamSummary[]>('/exams'),
    enabled: ready && Boolean(token),
  });

  return (
    <Shell>
      <div className="max-w-3xl">
        <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">Exams</p>
        <h1 className="mt-2 font-serif text-4xl">Choose a practice test</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">
          Each test keeps an overall window and a timer for the section you are in. Both are
          enforced by the server.
        </p>
      </div>

      <div className="mt-8 grid gap-4">
        {!ready || exams.isLoading ? <ExamSkeleton /> : null}
        {exams.isError ? (
          <p className="rounded-card border border-red-200 bg-card p-5 text-sm text-red-700">
            {exams.error instanceof Error ? exams.error.message : 'Could not load exams'}
          </p>
        ) : null}
        {exams.data?.length === 0 ? (
          <p className="rounded-card border border-ink/10 bg-card p-5 text-sm text-ink/70">
            No exams are seeded yet. Run the database seed, then refresh this page.
          </p>
        ) : null}
        {exams.data?.map((exam) => (
          <article
            key={exam.id}
            className="flex flex-col justify-between gap-4 rounded-card border border-ink/10 bg-card p-5 sm:flex-row sm:items-center"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-2xl">{exam.title}</h2>
                <StatusPill status={exam.status} />
              </div>
              <p className="mt-2 text-sm text-ink/65">
                Overall window {formatDuration(exam.durationOverall)}
              </p>
            </div>
            <Link
              href={`/exams/${exam.id}`}
              className="inline-flex justify-center rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
            >
              View pra-test
            </Link>
          </article>
        ))}
      </div>
    </Shell>
  );
}

function ExamSkeleton() {
  return <div className="h-28 animate-pulse rounded-card bg-ink/5" />;
}
