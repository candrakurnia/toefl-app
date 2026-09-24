'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { SessionState } from '@toefl/shared';
import { Shell } from '../../../components/shell';
import { RequireAuth } from '../../../components/require-auth';
import { ApiError } from '../../../lib/api';
import { createExamSession, fetchExam } from '../../../lib/client';
import { requestExamFullscreen } from '../../../lib/fullscreen';
import { formatDuration, formatQuestionType } from '../../../lib/format';

export default function ExamDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <Shell
      action={
        <Link href="/exams" className="text-sm text-ink/70 hover:text-ink">
          All exams
        </Link>
      }
    >
      <RequireAuth>
        <ExamDetail examId={params.id} />
      </RequireAuth>
    </Shell>
  );
}

function ExamDetail({ examId }: { examId: string }) {
  const queryClient = useQueryClient();
  const [started, setStarted] = useState<SessionState | null>(null);
  const [fullscreenNote, setFullscreenNote] = useState<string | null>(null);

  const exam = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => fetchExam(examId),
    enabled: Boolean(examId),
  });

  const start = useMutation({
    mutationFn: () => createExamSession(examId),
    onSuccess: (session) => {
      setStarted(session);
      void queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });

  async function onMulai() {
    setFullscreenNote(null);
    const entered = await requestExamFullscreen();
    if (!entered) {
      setFullscreenNote('Fullscreen was blocked. The session will still be created.');
    }
    start.mutate();
  }

  if (exam.isError) {
    return (
      <div className="rounded-card border border-red-200 bg-card p-5 text-sm text-red-700 shadow-card">
        <p role="alert">
          {exam.error instanceof Error ? exam.error.message : 'Could not load this exam'}
        </p>
        <Link href="/exams" className="mt-3 inline-block font-medium text-primary">
          Back to exams
        </Link>
      </div>
    );
  }

  if (!exam.data) {
    return <div className="h-64 animate-pulse rounded-card bg-ink/5" />;
  }
  const detail = exam.data;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">Pra-test</p>
        <h1 className="mt-2 font-serif text-4xl">{detail.title}</h1>
        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Questions" value={String(detail.questionCount)} />
          <Stat label="Sections" value={String(detail.sections.length)} />
          <Stat label="Overall window" value={formatDuration(detail.durationOverall)} />
        </dl>

        <ol className="mt-8 space-y-3">
          {detail.sections.map((section, index) => (
            <li
              key={section.id}
              className="rounded-card border border-ink/10 bg-card px-5 py-4 shadow-card"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-serif text-xl">
                  <span className="mr-2 text-primary/80">{index + 1}</span>
                  {section.name}
                </h2>
                <span className="text-sm text-ink/60">{formatDuration(section.durationSec)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {section.questionTypes.map((type) => (
                  <span
                    key={type}
                    className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink/75"
                  >
                    {formatQuestionType(type)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="rounded-card border border-ink/10 bg-card p-5 shadow-card">
          <h2 className="font-serif text-xl">Rules</h2>
          <ul className="mt-3 space-y-3">
            {detail.rules.map((rule) => (
              <li key={rule} className="flex gap-3 text-sm leading-6 text-ink/75">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-card border border-primary/15 bg-card p-5 shadow-card">
          <h2 className="font-serif text-xl">Ready?</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            Mulai requests fullscreen, then opens the only active session for this exam.
          </p>
          <button
            type="button"
            disabled={start.isPending}
            onClick={() => {
              void onMulai();
            }}
            className="mt-4 w-full rounded-control bg-primary px-4 py-3 text-sm font-semibold text-white shadow-card hover:bg-primary-hover disabled:opacity-60"
          >
            {start.isPending ? 'Starting…' : 'Mulai'}
          </button>
          {fullscreenNote ? <p className="mt-3 text-sm text-ink/70">{fullscreenNote}</p> : null}
          {start.isError ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {start.error instanceof ApiError ? start.error.message : 'Could not start'}
            </p>
          ) : null}
        </section>

        {started ? (
          <section className="rounded-card border border-ink/10 bg-card p-5 text-sm shadow-card">
            <h2 className="font-serif text-xl">Session started</h2>
            <p className="mt-2 leading-6 text-ink/70">
              Both clocks are running. The question screens come next.
            </p>
            <dl className="mt-3 space-y-2 text-ink/75">
              <div>
                <dt className="text-xs tracking-wide text-ink/50 uppercase">Session</dt>
                <dd className="break-all">{started.id}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-ink/50 uppercase">Section ends</dt>
                <dd>{new Date(started.sectionEndsAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-ink/50 uppercase">Overall ends</dt>
                <dd>{new Date(started.overallEndsAt).toLocaleString()}</dd>
              </div>
            </dl>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-ink/10 bg-card px-4 py-3 shadow-card">
      <dt className="text-xs tracking-wide text-ink/50 uppercase">{label}</dt>
      <dd className="mt-1 font-serif text-2xl">{value}</dd>
    </div>
  );
}
