'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ExamDetail, ExamSummary, SessionState } from '@toefl/shared';
import { Shell } from '../../../components/shell';
import { useAuth } from '../../../components/providers';
import { ApiError, api, sessionIdFromError } from '../../../lib/api';
import { formatDuration, formatQuestionType } from '../../../lib/format';

export default function ExamDetailPage() {
  const params = useParams<{ id: string }>();
  const examId = params.id;
  const { token, ready } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fallbackNav = useRef<number | null>(null);
  useEffect(() => {
    if (ready && !token) router.replace('/login');
  }, [ready, token, router]);
  useEffect(() => {
    return () => {
      if (fallbackNav.current !== null) window.clearTimeout(fallbackNav.current);
    };
  }, []);

  const exam = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => api<ExamDetail>(`/exams/${examId}`),
    enabled: ready && Boolean(token) && Boolean(examId),
  });

  const exams = useQuery({
    queryKey: ['exams'],
    queryFn: () => api<ExamSummary[]>('/exams'),
    enabled: ready && Boolean(token),
  });
  const inProgress = exams.data?.find((item) => item.id === examId)?.status === 'in_progress';

  const start = useMutation({
    mutationFn: (id: string) => api<SessionState>(`/exams/${id}/sessions`, { method: 'POST' }),
  });

  function openSession(sessionId: string) {
    void queryClient.invalidateQueries({ queryKey: ['exams'] });
    const path = `/sessions/${sessionId}`;
    router.push(path);
    // Fullscreen can swallow the client navigation and leave the pra-test on screen.
    if (fallbackNav.current !== null) window.clearTimeout(fallbackNav.current);
    fallbackNav.current = window.setTimeout(() => {
      fallbackNav.current = null;
      if (window.location.pathname !== path) window.location.assign(path);
    }, 1200);
  }

  async function begin() {
    if (!examId) return;
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    try {
      const session = await start.mutateAsync(examId);
      openSession(session.id);
    } catch (error) {
      const existing = sessionIdFromError(error);
      if (existing) openSession(existing);
    }
  }

  return (
    <Shell
      action={
        <Link href="/exams" className="text-sm text-ink/70">
          All exams
        </Link>
      }
    >
      {exam.isLoading || !ready ? (
        <div className="h-64 animate-pulse rounded-card bg-ink/5" />
      ) : null}
      {exam.isError ? (
        <p className="rounded-card border border-red-200 bg-card p-5 text-sm text-red-700">
          {exam.error instanceof Error ? exam.error.message : 'Could not load this exam'}
        </p>
      ) : null}
      {exam.data ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">Pra-test</p>
            <h1 className="mt-2 font-serif text-4xl">{exam.data.title}</h1>
            <p className="mt-3 text-sm text-ink/70">
              {exam.data.questionCount} questions · {exam.data.sections.length} sections · overall
              window {formatDuration(exam.data.durationOverall)}
            </p>

            <ol className="mt-8 space-y-3">
              {exam.data.sections.map((section, index) => (
                <li
                  key={section.id}
                  className="rounded-card border border-ink/10 bg-card px-5 py-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-serif text-xl">
                      {index + 1}. {section.name}
                    </h2>
                    <span className="text-sm text-ink/60">
                      {formatDuration(section.durationSec)}
                    </span>
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
            <section className="rounded-card border border-ink/10 bg-card p-5">
              <h2 className="font-serif text-xl">Rules</h2>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-ink/75">
                {exam.data.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-card bg-primary p-5 text-white">
              <h2 className="font-serif text-xl">{inProgress ? 'Lanjutkan' : 'Mulai'}</h2>
              <p className="mt-2 text-sm leading-6 text-white/85">
                {inProgress
                  ? 'Lanjutkan opens the active session and its questions. Both timers are already running.'
                  : 'Mulai opens the only active session for this exam and begins both timers.'}
              </p>
              <button
                type="button"
                disabled={start.isPending || !examId}
                onClick={() => {
                  void begin();
                }}
                className="mt-4 w-full rounded-control bg-white px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-60"
              >
                {start.isPending
                  ? inProgress
                    ? 'Opening…'
                    : 'Starting…'
                  : inProgress
                    ? 'Lanjutkan'
                    : 'Mulai'}
              </button>
              {start.isError && !sessionIdFromError(start.error) ? (
                <p className="mt-3 text-sm text-white">
                  {start.error instanceof ApiError ? start.error.message : 'Could not start'}
                </p>
              ) : null}
            </section>
          </aside>
        </div>
      ) : null}
    </Shell>
  );
}
