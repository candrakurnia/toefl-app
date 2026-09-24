'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  AnswerPayload,
  AutosaveRequest,
  ExamDetail,
  HeartbeatRequest,
  HeartbeatResponse,
  SectionNextResponse,
  SectionQuestions,
  SessionState,
  SubmitResult,
  ViolationRequest,
  ViolationType,
} from '@toefl/shared';
import { ApiError, api } from '../lib/api';
import { formatCountdown, formatQuestionType } from '../lib/format';
import { QuestionPanel } from './question-panel';

const HEARTBEAT_MS = 12_000;
const AUTOSAVE_MS = 4_000;
const SAVE_DEBOUNCE_MS = 700;

interface Clock {
  serverNow: string;
  sampledAt: number;
  overallEndsAt: string;
  sectionEndsAt: string;
  currentSectionId: string | null;
  status: SessionState['status'];
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function clockFrom(
  session: Pick<
    SessionState,
    'serverNow' | 'overallEndsAt' | 'sectionEndsAt' | 'currentSectionId' | 'status'
  >,
  sampledAt: number,
): Clock {
  return {
    serverNow: session.serverNow,
    sampledAt,
    overallEndsAt: session.overallEndsAt,
    sectionEndsAt: session.sectionEndsAt,
    currentSectionId: session.currentSectionId,
    status: session.status,
  };
}

function clockFromBeat(beat: HeartbeatResponse, sampledAt: number): Clock {
  return {
    serverNow: beat.serverNow,
    sampledAt,
    overallEndsAt: beat.overallEndsAt,
    sectionEndsAt: beat.sectionEndsAt,
    currentSectionId: beat.currentSectionId,
    status: beat.status,
  };
}

function remainingMs(endsAt: string, clock: Clock, now: number) {
  const serverNow = Date.parse(clock.serverNow);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(serverNow) || !Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  return end - (now + (serverNow - clock.sampledAt));
}

export function ExamSession({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api<SessionState>(`/sessions/${sessionId}`),
  });

  const [clock, setClock] = useState<Clock | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerPayload>>({});
  const [index, setIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [banner, setBanner] = useState<string | null>(null);
  const [warning, setWarning] = useState<ViolationType | null>(null);
  const [violationNote, setViolationNote] = useState<string | null>(null);
  const [deadlineNote, setDeadlineNote] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [responseBusy, setResponseBusy] = useState(false);
  const responseBusyRef = useRef(false);
  const [advancing, setAdvancing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const dirtyRef = useRef(new Set<string>());
  const flightsRef = useRef(new Map<string, Promise<void>>());
  const saveTimersRef = useRef(new Map<string, number>());
  const leavingRef = useRef(false);
  const deadlineLock = useRef(false);
  const placedSection = useRef<string | null>(null);
  const hydrated = useRef(false);
  const saveQuestionRef = useRef<(questionId: string) => Promise<void>>(async () => undefined);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const finishRef = useRef<() => Promise<void>>(async () => undefined);
  const heartbeatRef = useRef<() => Promise<HeartbeatResponse | null>>(async () => null);
  const deadlineRef = useRef<() => Promise<void>>(async () => undefined);
  const reportRef = useRef<(type: ViolationType) => Promise<void>>(async () => undefined);
  const continueRef = useRef<HTMLButtonElement>(null);

  const examQuery = useQuery({
    queryKey: ['exam', sessionQuery.data?.examId],
    queryFn: () => api<ExamDetail>(`/exams/${sessionQuery.data!.examId}`),
    enabled: Boolean(sessionQuery.data?.examId),
  });

  const sectionId = clock?.currentSectionId ?? null;
  const questionsQuery = useQuery({
    queryKey: ['session-questions', sessionId, sectionId],
    queryFn: () =>
      api<SectionQuestions>(
        `/sessions/${sessionId}/questions?sectionId=${encodeURIComponent(sectionId ?? '')}`,
      ),
    enabled: Boolean(sectionId) && clock?.status === 'active',
  });

  function rememberAnswers(session: SessionState) {
    const merged = { ...answersRef.current };
    for (const answer of session.answers) {
      if (dirtyRef.current.has(answer.questionId) || merged[answer.questionId]) continue;
      merged[answer.questionId] = answer.payload;
    }
    answersRef.current = merged;
    setAnswers(merged);
  }

  function applyClock(next: Clock) {
    clockRef.current = next;
    setClock(next);
  }

  function applySession(session: SessionState) {
    applyClock(clockFrom(session, Date.now()));
    rememberAnswers(session);
  }

  async function saveQuestion(questionId: string): Promise<void> {
    const existing = flightsRef.current.get(questionId);
    if (existing) {
      await existing;
      if (dirtyRef.current.has(questionId)) await saveQuestion(questionId);
      return;
    }
    const payload = answersRef.current[questionId];
    if (!payload || !dirtyRef.current.has(questionId) || leavingRef.current) return;
    const fingerprint = JSON.stringify(payload);
    const run = (async () => {
      setSaveState('saving');
      try {
        const body: AutosaveRequest = { questionId, payload };
        await api(`/sessions/${sessionId}/answers`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (JSON.stringify(answersRef.current[questionId]) === fingerprint) {
          dirtyRef.current.delete(questionId);
        }
        setSaveState(dirtyRef.current.size === 0 ? 'saved' : 'saving');
      } catch (error) {
        dirtyRef.current.add(questionId);
        setSaveState('error');
        if (error instanceof ApiError && error.status === 409 && !leavingRef.current) {
          void finishRef.current();
        }
      } finally {
        flightsRef.current.delete(questionId);
      }
    })();
    flightsRef.current.set(questionId, run);
    await run;
  }
  saveQuestionRef.current = saveQuestion;

  function setBusy(busy: boolean) {
    responseBusyRef.current = busy;
    setResponseBusy(busy);
  }

  async function waitForRecorder() {
    const started = Date.now();
    while (responseBusyRef.current && Date.now() - started < 15_000) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  async function flushDirty() {
    await waitForRecorder();
    for (const timer of saveTimersRef.current.values()) window.clearTimeout(timer);
    saveTimersRef.current.clear();
    await Promise.all(
      [...dirtyRef.current].map((questionId) => saveQuestionRef.current(questionId)),
    );
  }
  flushRef.current = flushDirty;

  async function finish() {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setDeadlineNote((current) => current ?? 'Submitting…');
    try {
      await flushRef.current();
    } catch {
      // A closed session rejects late autosaves. Submit still returns the attempt.
    }
    try {
      const result = await api<SubmitResult>(`/sessions/${sessionId}/submit`, { method: 'POST' });
      router.push(`/attempts/${result.attemptId}`);
    } catch (error) {
      leavingRef.current = false;
      setDeadlineNote(null);
      setBanner(error instanceof ApiError ? error.message : 'Could not submit');
    }
  }
  finishRef.current = finish;

  async function postHeartbeat() {
    if (leavingRef.current) return null;
    const body: HeartbeatRequest = {
      visibility: document.visibilityState === 'visible' ? 'visible' : 'hidden',
      fullscreen: Boolean(document.fullscreenElement),
    };
    try {
      const beat = await api<HeartbeatResponse>(`/sessions/${sessionId}/heartbeat`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const previous = clockRef.current?.currentSectionId;
      applyClock(clockFromBeat(beat, Date.now()));
      if (beat.forceSubmitted || beat.status !== 'active') {
        await finishRef.current();
        return beat;
      }
      if (beat.currentSectionId !== previous) {
        await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      }
      return beat;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        setBanner(error.message);
      }
      return null;
    }
  }
  heartbeatRef.current = postHeartbeat;

  async function advanceSection() {
    await flushRef.current();
    const result = await api<SectionNextResponse>(`/sessions/${sessionId}/sections/next`, {
      method: 'POST',
    });
    applySession(result.session);
    if (result.submitted || result.session.status !== 'active') {
      await finishRef.current();
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
  }

  async function handleDeadline() {
    if (leavingRef.current || deadlineLock.current) return;
    const current = clockRef.current;
    if (!current || current.status !== 'active') return;
    deadlineLock.current = true;
    setDeadlineNote('Time is up. Syncing with the server…');
    try {
      await flushRef.current();
      if (leavingRef.current) return;
      const beat = await heartbeatRef.current();
      if (leavingRef.current) return;
      if (!beat) throw new Error('Could not sync the timer');
      const serverNow = Date.parse(beat.serverNow);
      const overallOver = Number.isFinite(serverNow) && Date.parse(beat.overallEndsAt) <= serverNow;
      const sectionOver = Number.isFinite(serverNow) && Date.parse(beat.sectionEndsAt) <= serverNow;
      if (beat.forceSubmitted || beat.status !== 'active' || overallOver) {
        setDeadlineNote('Overall time is up. Submitting the exam…');
        await finishRef.current();
        return;
      }
      if (beat.currentSectionId !== current.currentSectionId) return;
      if (sectionOver) {
        setDeadlineNote('Section time is up. Moving to the next section…');
        await advanceSection();
      }
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'Could not sync the timer');
      window.setTimeout(() => {
        const current = clockRef.current;
        const now = Date.now();
        if (!current || leavingRef.current || current.status !== 'active') return;
        const expired =
          remainingMs(current.overallEndsAt, current, now) <= 0 ||
          remainingMs(current.sectionEndsAt, current, now) <= 0;
        if (expired) void deadlineRef.current();
      }, 1000);
    } finally {
      deadlineLock.current = false;
      if (!leavingRef.current) setDeadlineNote(null);
    }
  }
  deadlineRef.current = handleDeadline;

  async function reportViolation(type: ViolationType) {
    if (leavingRef.current || clockRef.current?.status !== 'active') return;
    setWarning(type);
    void flushRef.current();
    try {
      const body: ViolationRequest = { type, at: new Date().toISOString() };
      await api(`/sessions/${sessionId}/violations`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setViolationNote(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        void finishRef.current();
        return;
      }
      setViolationNote('The timer is still running. This event could not be saved.');
    }
    void heartbeatRef.current();
  }
  reportRef.current = reportViolation;

  useEffect(() => {
    const session = sessionQuery.data;
    if (!session) return;
    rememberAnswers(session);
    const current = clockRef.current;
    if (
      !current ||
      current.currentSectionId !== session.currentSectionId ||
      current.sectionEndsAt !== session.sectionEndsAt ||
      current.overallEndsAt !== session.overallEndsAt ||
      current.status !== session.status
    ) {
      applyClock(clockFrom(session, Date.now()));
    }
    if (session.status !== 'active' && !hydrated.current) {
      hydrated.current = true;
      void finishRef.current();
      return;
    }
    hydrated.current = true;
  }, [sessionQuery.data]);

  useEffect(() => {
    const id = window.setInterval(() => {
      for (const questionId of dirtyRef.current) void saveQuestionRef.current(questionId);
    }, AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!clock || clock.status !== 'active') return;
    void heartbeatRef.current();
    const id = window.setInterval(() => void heartbeatRef.current(), HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [clock?.status, sessionId]);

  useEffect(() => {
    let wasFullscreen = Boolean(document.fullscreenElement);
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        void reportRef.current('tab_blur');
        return;
      }
      const current = clockRef.current;
      const now = Date.now();
      if (
        current &&
        current.status === 'active' &&
        (remainingMs(current.overallEndsAt, current, now) <= 0 ||
          remainingMs(current.sectionEndsAt, current, now) <= 0)
      ) {
        void deadlineRef.current();
        return;
      }
      void heartbeatRef.current();
    }
    function onFullscreen() {
      const active = Boolean(document.fullscreenElement);
      setFullscreen(active);
      if (wasFullscreen && !active) void reportRef.current('fullscreen_exit');
      else void heartbeatRef.current();
      wasFullscreen = active;
    }
    setFullscreen(wasFullscreen);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [sessionId]);

  useEffect(() => {
    const section = clock?.currentSectionId;
    const questions = questionsQuery.data?.questions;
    if (!section || !questions) return;
    if (questions.length > 0 && questions[0]?.sectionId !== section) return;
    if (placedSection.current === section) return;
    placedSection.current = section;
    const firstOpen = questions.findIndex((question) => !answersRef.current[question.id]);
    setIndex(firstOpen < 0 ? 0 : firstOpen);
  }, [clock?.currentSectionId, questionsQuery.data]);

  useEffect(() => {
    if (warning) continueRef.current?.focus();
  }, [warning]);

  useEffect(() => {
    const previous = document.title;
    const name = examQuery.data?.sections.find((section) => section.id === sectionId)?.name;
    document.title = name ? `${name} · TOEFL` : 'Exam · TOEFL';
    return () => {
      document.title = previous;
    };
  }, [examQuery.data, sectionId]);

  function scheduleSave(questionId: string) {
    const existing = saveTimersRef.current.get(questionId);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      saveTimersRef.current.delete(questionId);
      void saveQuestionRef.current(questionId);
    }, SAVE_DEBOUNCE_MS);
    saveTimersRef.current.set(questionId, timer);
  }

  function updateAnswer(questionId: string, payload: AnswerPayload) {
    dirtyRef.current.add(questionId);
    const next = { ...answersRef.current, [questionId]: payload };
    answersRef.current = next;
    setAnswers(next);
    setSaveState('saving');
    scheduleSave(questionId);
  }

  async function nextSection() {
    if (advancing || leavingRef.current) return;
    setAdvancing(true);
    setBanner(null);
    try {
      await advanceSection();
    } catch (error) {
      setBanner(error instanceof ApiError ? error.message : 'Could not open the next section');
    } finally {
      setAdvancing(false);
    }
  }

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      setBanner('Fullscreen was blocked. You can continue, and leaving the tab is still recorded.');
    }
  }

  const sections = examQuery.data?.sections ?? [];
  const sectionIndex = sections.findIndex((section) => section.id === sectionId);
  const sectionMeta = sectionIndex >= 0 ? sections[sectionIndex] : undefined;
  const isLastSection = sections.length > 0 && sectionIndex === sections.length - 1;
  const questions = questionsQuery.data?.questions ?? [];
  const questionIndex = questions.length === 0 ? 0 : Math.min(index, questions.length - 1);
  const question = questions[questionIndex];
  const locked = Boolean(deadlineNote) || advancing;

  function goTo(nextIndex: number) {
    if (question) void saveQuestionRef.current(question.id);
    setIndex(nextIndex);
  }

  if (sessionQuery.isLoading || (sessionQuery.data?.status === 'active' && !clock)) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <div className="h-64 animate-pulse rounded-card bg-ink/5" />
        </div>
      </div>
    );
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <div className="min-h-screen bg-canvas px-5 py-16 text-ink">
        <div className="mx-auto max-w-xl rounded-card border border-red-200 bg-card p-6 text-sm text-red-700">
          <p>
            {sessionQuery.error instanceof Error
              ? sessionQuery.error.message
              : 'Could not load this session'}
          </p>
          <Link href="/exams" className="mt-4 inline-block font-medium text-primary">
            Back to exams
          </Link>
        </div>
      </div>
    );
  }

  if (sessionQuery.data.status !== 'active' || clock?.status !== 'active') {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-5 text-ink">
        <div className="w-full max-w-md rounded-card border border-ink/10 bg-card p-6 shadow-sm">
          <h1 className="font-serif text-2xl">Opening your result</h1>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            This session is already closed. The attempt keeps any partial scores.
          </p>
          {banner ? <p className="mt-3 text-sm text-red-700">{banner}</p> : null}
          {banner ? (
            <button
              type="button"
              onClick={() => void finishRef.current()}
              className="mt-4 rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-white"
            >
              Try again
            </button>
          ) : (
            <p className="mt-4 text-sm text-ink/60">Submitting…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-card/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0">
            <Link href="/exams" className="text-xs tracking-[0.14em] text-ink/50 uppercase">
              {examQuery.data?.title ?? 'TOEFL'}
            </Link>
            <p className="truncate font-serif text-xl">{sectionMeta?.name ?? 'Section'}</p>
          </div>
          {clock ? <DualTimer clock={clock} onExpire={() => void deadlineRef.current()} /> : null}
        </div>
      </header>

      <main className={`mx-auto max-w-3xl px-5 py-8 ${locked ? 'pointer-events-none' : ''}`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-ink/65">
          <p>
            {questions.length > 0
              ? `Question ${questionIndex + 1} of ${questions.length}`
              : 'Loading questions'}
            {question ? ` · ${formatQuestionType(question.type)}` : ''}
          </p>
          <p>{saveLabel(saveState)}</p>
        </div>

        {!fullscreen ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-ink/10 bg-card px-4 py-3 text-sm shadow-sm">
            <p className="text-ink/75">
              Enter fullscreen. Leaving it is recorded, and the timers keep running.
            </p>
            <button
              type="button"
              onClick={() => void enterFullscreen()}
              className="rounded-control bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Enter fullscreen
            </button>
          </div>
        ) : null}

        {banner ? (
          <p className="mb-5 rounded-card border border-red-200 bg-card px-4 py-3 text-sm text-red-700">
            {banner}
          </p>
        ) : null}

        {questionsQuery.isLoading ? (
          <div className="h-64 animate-pulse rounded-card bg-ink/5" />
        ) : null}
        {questionsQuery.isError ? (
          <div className="rounded-card border border-red-200 bg-card p-5 text-sm text-red-700">
            <p>
              {questionsQuery.error instanceof Error
                ? questionsQuery.error.message
                : 'Could not load questions'}
            </p>
            <button
              type="button"
              onClick={() => void questionsQuery.refetch()}
              className="mt-3 font-medium text-primary"
            >
              Try again
            </button>
          </div>
        ) : null}

        {questions.length > 1 ? (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {questions.map((item, itemIndex) => {
              const current = itemIndex === questionIndex;
              const answered = Boolean(answers[item.id]);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={responseBusy || locked}
                  onClick={() => goTo(itemIndex)}
                  aria-current={current ? 'true' : undefined}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm ${
                    current
                      ? 'border-primary bg-primary text-white'
                      : answered
                        ? 'border-primary/30 bg-primary/10 text-ink'
                        : 'border-ink/15 bg-card text-ink/70'
                  }`}
                >
                  {itemIndex + 1}
                </button>
              );
            })}
          </div>
        ) : null}

        {question ? (
          <QuestionPanel
            key={question.id}
            question={question}
            value={answers[question.id]}
            disabled={locked}
            onChange={(payload) => updateAnswer(question.id, payload)}
            onBusy={setBusy}
          />
        ) : null}
        {!questionsQuery.isLoading && !questionsQuery.isError && questions.length === 0 ? (
          <p className="rounded-card border border-ink/10 bg-card p-5 text-sm text-ink/70">
            This section has no questions.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={questionIndex <= 0 || responseBusy || locked}
              onClick={() => goTo(Math.max(0, questionIndex - 1))}
              className="rounded-control border border-ink/15 bg-card px-4 py-2.5 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            {questionIndex < questions.length - 1 ? (
              <button
                type="button"
                disabled={responseBusy || locked}
                onClick={() => setConfirmSubmit(true)}
                className="text-sm text-ink/60"
              >
                Submit exam
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {!isLastSection ? (
              <button
                type="button"
                disabled={responseBusy || locked}
                onClick={() => void nextSection()}
                className="rounded-control border border-ink/15 bg-card px-4 py-2.5 text-sm disabled:opacity-50"
              >
                {advancing ? 'Opening…' : 'Next section'}
              </button>
            ) : null}
            {questionIndex < questions.length - 1 ? (
              <button
                type="button"
                disabled={responseBusy || locked}
                onClick={() => goTo(questionIndex + 1)}
                className="rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                disabled={responseBusy || locked}
                onClick={() => setConfirmSubmit(true)}
                className="rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
              >
                Submit exam
              </button>
            )}
          </div>
        </div>
      </main>

      {warning && !deadlineNote ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1c1428]/40 px-4 py-6 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="violation-title"
            className="w-full max-w-md rounded-card bg-card p-6 shadow-lg"
          >
            <h2 id="violation-title" className="font-serif text-2xl">
              Timer still running
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink/75">
              {warning === 'fullscreen_exit'
                ? 'You left fullscreen. The section timer and the overall timer keep running, and this has been recorded.'
                : 'You switched away from this tab. The section timer and the overall timer keep running, and this has been recorded.'}
            </p>
            {violationNote ? <p className="mt-3 text-sm text-red-700">{violationNote}</p> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                ref={continueRef}
                type="button"
                onClick={() => setWarning(null)}
                className="rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
              >
                Continue
              </button>
              {warning === 'fullscreen_exit' ? (
                <button
                  type="button"
                  onClick={() => void enterFullscreen()}
                  className="rounded-control border border-ink/15 px-4 py-2.5 text-sm"
                >
                  Return to fullscreen
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {confirmSubmit ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1c1428]/40 px-4 py-6 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-title"
            className="w-full max-w-md rounded-card bg-card p-6 shadow-lg"
          >
            <h2 id="submit-title" className="font-serif text-2xl">
              Submit this exam?
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink/75">
              The server closes the session. Essay and speaking scores can stay on Pending AI
              scoring. Choice questions are scored now.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmSubmit(false);
                  void finishRef.current();
                }}
                className="rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
              >
                Submit
              </button>
              <button
                type="button"
                onClick={() => setConfirmSubmit(false)}
                className="rounded-control border border-ink/15 px-4 py-2.5 text-sm"
              >
                Keep working
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deadlineNote ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#1c1428]/40 px-4">
          <div
            role="status"
            className="w-full max-w-md rounded-card bg-card p-6 text-sm leading-6 shadow-lg"
          >
            <h2 className="font-serif text-2xl">Time is up</h2>
            <p className="mt-3 text-ink/75">{deadlineNote}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DualTimer({ clock, onExpire }: { clock: Clock; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const firedFor = useRef<string | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const stamp = `${clock.sampledAt}|${clock.sectionEndsAt}|${clock.overallEndsAt}|${clock.status}|${clock.currentSectionId}`;

  useEffect(() => {
    firedFor.current = null;
  }, [stamp]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (clock.status !== 'active') return;
      const overallLeft = remainingMs(clock.overallEndsAt, clock, next);
      const sectionLeft = remainingMs(clock.sectionEndsAt, clock, next);
      if ((overallLeft <= 0 || sectionLeft <= 0) && firedFor.current !== stamp) {
        firedFor.current = stamp;
        onExpireRef.current();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [clock, stamp]);

  const sectionLeft = remainingMs(clock.sectionEndsAt, clock, now);
  const overallLeft = remainingMs(clock.overallEndsAt, clock, now);
  const urgent = sectionLeft < 60_000;

  return (
    <div className="flex items-stretch gap-2">
      <div
        className={`rounded-control px-4 py-2 text-white ${urgent ? 'bg-amber-600' : 'bg-primary'}`}
      >
        <p className="text-[10px] tracking-[0.14em] text-white/80 uppercase">Section</p>
        <p className="font-serif text-2xl leading-none tabular-nums">
          {formatCountdown(sectionLeft)}
        </p>
      </div>
      <div className="rounded-control border border-ink/10 bg-canvas px-3 py-2">
        <p className="text-[10px] tracking-[0.14em] text-ink/50 uppercase">Overall</p>
        <p className="font-serif text-lg leading-none text-ink/80 tabular-nums">
          {formatCountdown(overallLeft)}
        </p>
      </div>
    </div>
  );
}

function saveLabel(state: SaveState) {
  switch (state) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Could not save';
    default:
      return 'Answers save automatically';
  }
}
