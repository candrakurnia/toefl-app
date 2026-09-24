'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Shell } from '../../components/shell';
import { StatusPill } from '../../components/status-pill';
import { RequireAuth } from '../../components/require-auth';
import { fetchExams } from '../../lib/client';
import { formatDuration } from '../../lib/format';

export default function ExamsPage() {
  return (
    <Shell>
      <RequireAuth>
        <ExamList />
      </RequireAuth>
    </Shell>
  );
}

function ExamList() {
  const exams = useQuery({
    queryKey: ['exams'],
    queryFn: fetchExams,
  });

  return (
    <>
      <div className="max-w-2xl">
        <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">Exams</p>
        <h1 className="mt-2 font-serif text-4xl">Choose a practice test</h1>
        <p className="mt-3 text-sm leading-6 text-ink/70">
          Open a test to review its sections and rules. Starting one keeps an overall window and a
          timer for the section you are in.
        </p>
      </div>

      <div className="mt-8 grid gap-4">
        {exams.isLoading ? <ExamSkeleton /> : null}
        {exams.isError ? (
          <p
            role="alert"
            className="rounded-card border border-red-200 bg-card p-5 text-sm text-red-700"
          >
            {exams.error instanceof Error ? exams.error.message : 'Could not load exams'}
          </p>
        ) : null}
        {exams.data?.length === 0 ? (
          <p className="rounded-card border border-ink/10 bg-card p-5 text-sm text-ink/70 shadow-card">
            No exams are available yet. Seed the database, then refresh this page.
          </p>
        ) : null}
        {exams.data?.map((exam) => (
          <Link
            key={exam.id}
            href={`/exams/${exam.id}`}
            className="group block rounded-card border border-ink/10 bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:border-primary/30"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-serif text-2xl group-hover:text-primary">{exam.title}</h2>
              <StatusPill status={exam.status} />
            </div>
            <p className="mt-3 text-sm text-ink/65">
              Overall window · {formatDuration(exam.durationOverall)}
            </p>
            <p className="mt-4 text-sm font-medium text-primary">Open pra-test</p>
          </Link>
        ))}
      </div>
    </>
  );
}

function ExamSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-card bg-ink/5" />
      <div className="h-32 animate-pulse rounded-card bg-ink/5" />
    </div>
  );
}
