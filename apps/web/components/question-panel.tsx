'use client';

import { useEffect, useRef, useState } from 'react';
import { AnswerPayload, MediaUploadResponse, PublicQuestion } from '@toefl/shared';
import { API_BASE, ApiError, api, apiBlob } from '../lib/api';
import { formatCountdown } from '../lib/format';

export function QuestionPanel({
  question,
  value,
  disabled,
  onChange,
  onBusy,
}: {
  question: PublicQuestion;
  value: AnswerPayload | undefined;
  disabled: boolean;
  onChange: (payload: AnswerPayload) => void;
  onBusy: (busy: boolean) => void;
}) {
  return (
    <article className="rounded-card border border-ink/10 bg-card p-6 shadow-sm">
      <p className="text-xs tracking-[0.14em] text-ink/50 uppercase">{labelFor(question.type)}</p>
      <h2 className="mt-3 font-serif text-2xl leading-snug whitespace-pre-wrap">
        {question.prompt}
      </h2>
      <div className="mt-6">
        {question.type === 'essay' ? (
          <EssayAnswer value={value} disabled={disabled} onChange={onChange} />
        ) : null}
        {question.type === 'speaking' ? (
          <SpeakingAnswer value={value} disabled={disabled} onChange={onChange} onBusy={onBusy} />
        ) : null}
        {question.type === 'listening' ? (
          <div className="space-y-5">
            <ListeningAudio audioUrl={question.audioUrl} />
            <ChoiceList
              questionId={question.id}
              choices={question.choices ?? []}
              selectedId={value?.kind === 'choice' ? value.choiceId : null}
              disabled={disabled}
              onSelect={(choiceId) => onChange({ kind: 'choice', choiceId })}
            />
          </div>
        ) : null}
        {question.type === 'multiple_choice' ? (
          <ChoiceList
            questionId={question.id}
            choices={question.choices ?? []}
            selectedId={value?.kind === 'choice' ? value.choiceId : null}
            disabled={disabled}
            onSelect={(choiceId) => onChange({ kind: 'choice', choiceId })}
          />
        ) : null}
      </div>
    </article>
  );
}

function labelFor(type: PublicQuestion['type']) {
  switch (type) {
    case 'multiple_choice':
      return 'Multiple choice';
    case 'essay':
      return 'Essay';
    case 'listening':
      return 'Listening';
    case 'speaking':
      return 'Speaking';
    default:
      return type;
  }
}

function ChoiceList({
  questionId,
  choices,
  selectedId,
  disabled,
  onSelect,
}: {
  questionId: string;
  choices: Array<{ id: string; text: string }>;
  selectedId: string | null;
  disabled: boolean;
  onSelect: (choiceId: string) => void;
}) {
  if (choices.length === 0) {
    return <p className="text-sm text-ink/70">This item has no choices.</p>;
  }
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">Choose one answer</legend>
      {choices.map((choice) => {
        const selected = selectedId === choice.id;
        return (
          <label
            key={choice.id}
            className={`flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3 text-sm leading-6 ${
              selected ? 'border-primary bg-primary/10' : 'border-ink/10 bg-canvas'
            } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
          >
            <input
              type="radio"
              name={questionId}
              value={choice.id}
              checked={selected}
              onChange={() => onSelect(choice.id)}
              className="mt-1 accent-primary"
            />
            <span>{choice.text}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

function EssayAnswer({
  value,
  disabled,
  onChange,
}: {
  value: AnswerPayload | undefined;
  disabled: boolean;
  onChange: (payload: AnswerPayload) => void;
}) {
  const text = value?.kind === 'essay' ? value.text : '';
  return (
    <label className="block text-sm">
      <span className="sr-only">Essay response</span>
      <textarea
        value={text}
        maxLength={10000}
        disabled={disabled}
        rows={12}
        placeholder="Write your response."
        onChange={(event) => onChange({ kind: 'essay', text: event.target.value })}
        className="w-full rounded-control border border-ink/15 bg-canvas px-3 py-3 leading-6 outline-none disabled:opacity-70"
      />
      <span className="mt-2 block text-xs text-ink/50">{text.length} / 10000</span>
    </label>
  );
}

function ListeningAudio({ audioUrl }: { audioUrl?: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const absolute = audioUrl.startsWith('http://') || audioUrl.startsWith('https://');
    const owned = audioUrl.includes('/media/');
    if (absolute && !owned) {
      setSrc(audioUrl);
      return;
    }
    const path = toApiPath(audioUrl);
    if (!owned) {
      setSrc(`${API_BASE}${path}`);
      return;
    }
    apiBlob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioUrl]);

  if (!audioUrl) {
    return (
      <p className="rounded-control bg-canvas px-4 py-3 text-sm leading-6 text-ink/70">
        No audio file is attached to this item. Use the prompt, then choose an answer.
      </p>
    );
  }
  if (failed) {
    return (
      <p className="rounded-control border border-red-200 bg-card px-4 py-3 text-sm text-red-700">
        The audio could not be loaded.
      </p>
    );
  }
  if (!src) {
    return <p className="text-sm text-ink/60">Loading audio…</p>;
  }
  return <audio controls preload="none" src={src} className="w-full" />;
}

function SpeakingAnswer({
  value,
  disabled,
  onChange,
  onBusy,
}: {
  value: AnswerPayload | undefined;
  disabled: boolean;
  onChange: (payload: AnswerPayload) => void;
  onBusy: (busy: boolean) => void;
}) {
  const mediaId = value?.kind === 'speaking' ? value.mediaId : null;
  const [phase, setPhase] = useState<'idle' | 'recording' | 'uploading' | 'saved'>(
    mediaId ? 'saved' : 'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onBusy(false);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [onBusy]);

  useEffect(() => {
    if (!disabled) return;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') recorder.stop();
  }, [disabled]);

  useEffect(() => {
    if (!mediaId) return;
    setPhase((current) => (current === 'recording' || current === 'uploading' ? current : 'saved'));
  }, [mediaId]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    apiBlob(`/media/${mediaId}`)
      .then((blob) => {
        if (cancelled || !mounted.current) return;
        const url = URL.createObjectURL(blob);
        setPlaybackUrl((current) => {
          if (current) {
            URL.revokeObjectURL(url);
            return current;
          }
          return url;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  useEffect(() => {
    return () => {
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    };
  }, [playbackUrl]);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mime = preferred.find((item) => MediaRecorder.isTypeSupported(item)) ?? '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = (recorder.mimeType || mime || 'audio/webm').split(';')[0] || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (!mounted.current) return;
        if (blob.size === 0) {
          setPhase(mediaId ? 'saved' : 'idle');
          onBusy(false);
          setError('The recording was empty. Try again.');
          return;
        }
        void upload(blob, type);
      };
      recorderRef.current = recorder;
      recorder.start();
      setElapsed(0);
      setPhase('recording');
      onBusy(true);
    } catch {
      setError('Allow microphone access to record a speaking answer.');
      onBusy(false);
    }
  }

  function stop() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  async function upload(blob: Blob, mime: string) {
    setPhase('uploading');
    onBusy(true);
    try {
      const extension = mime.includes('mp4')
        ? 'm4a'
        : mime.includes('ogg')
          ? 'ogg'
          : mime.includes('wav')
            ? 'wav'
            : 'webm';
      const file = new File([blob], `speaking.${extension}`, { type: mime });
      const form = new FormData();
      form.append('file', file);
      const uploaded = await api<MediaUploadResponse>('/media/upload', {
        method: 'POST',
        body: form,
      });
      if (!mounted.current) return;
      setPlaybackUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
      setPhase('saved');
      onChange({ kind: 'speaking', mediaId: uploaded.mediaId });
    } catch (err) {
      if (!mounted.current) return;
      setPhase(mediaId ? 'saved' : 'idle');
      setError(err instanceof ApiError ? err.message : 'Could not upload the recording');
    } finally {
      if (mounted.current) onBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-ink/70">
        Record your answer. It uploads, then saves to this question.
      </p>
      {phase === 'recording' ? (
        <div className="flex items-center justify-between gap-3 rounded-control bg-canvas px-4 py-3">
          <span className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            Recording {formatCountdown(elapsed)}
          </span>
          <button
            type="button"
            onClick={stop}
            className="rounded-control bg-ink px-3 py-2 text-sm text-white"
          >
            Stop
          </button>
        </div>
      ) : null}
      {phase === 'uploading' ? <p className="text-sm text-ink/70">Uploading recording…</p> : null}
      {phase === 'saved' && mediaId ? (
        <div className="space-y-3 rounded-control bg-canvas px-4 py-3">
          <p className="text-sm text-ink/80">Recording saved.</p>
          {playbackUrl ? <audio controls src={playbackUrl} className="w-full" /> : null}
        </div>
      ) : null}
      {phase !== 'recording' && phase !== 'uploading' ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void start()}
          className="rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {mediaId ? 'Record again' : 'Record answer'}
        </button>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function toApiPath(url: string) {
  if (url.startsWith('/backend/')) return url.slice('/backend'.length);
  if (url.startsWith('/')) return url;
  return `/${url}`;
}
