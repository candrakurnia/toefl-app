'use client';

import { useEffect, useRef, useState } from 'react';
import { AnswerPayload, MediaUploadResponse, PublicQuestion } from '@toefl/shared';
import { API_BASE, ApiError, api, apiBlob } from '../lib/api';

const SPEAKING_MAX_MS = 45_000;
const WAVE_BARS = 36;

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
  if (question.type === 'essay') {
    return (
      <EssayAnswer question={question} value={value} disabled={disabled} onChange={onChange} />
    );
  }
  if (question.type === 'speaking') {
    return (
      <SpeakingAnswer
        question={question}
        value={value}
        disabled={disabled}
        onChange={onChange}
        onBusy={onBusy}
      />
    );
  }
  if (question.type === 'listening') {
    return (
      <ListeningAnswer question={question} value={value} disabled={disabled} onChange={onChange} />
    );
  }
  return (
    <ReadingAnswer question={question} value={value} disabled={disabled} onChange={onChange} />
  );
}

function ReadingAnswer({
  question,
  value,
  disabled,
  onChange,
}: {
  question: PublicQuestion;
  value: AnswerPayload | undefined;
  disabled: boolean;
  onChange: (payload: AnswerPayload) => void;
}) {
  const { passage, stem } = splitPrompt(question.prompt);
  return (
    <div className="space-y-5">
      {passage ? (
        <article className="rounded-card border border-ink/10 bg-card p-5 shadow-sm">
          <p className="text-sm leading-7 whitespace-pre-wrap text-ink/80">{passage}</p>
        </article>
      ) : null}
      <h2 className="font-serif text-2xl leading-snug whitespace-pre-wrap">{stem}</h2>
      <ChoiceList
        questionId={question.id}
        choices={question.choices ?? []}
        selectedId={value?.kind === 'choice' ? value.choiceId : null}
        disabled={disabled}
        onSelect={(choiceId) => onChange({ kind: 'choice', choiceId })}
      />
    </div>
  );
}

function EssayAnswer({
  question,
  value,
  disabled,
  onChange,
}: {
  question: PublicQuestion;
  value: AnswerPayload | undefined;
  disabled: boolean;
  onChange: (payload: AnswerPayload) => void;
}) {
  const text = value?.kind === 'essay' ? value.text : '';
  const words = wordCount(text);
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-2xl leading-snug whitespace-pre-wrap">{question.prompt}</h2>
      <label className="block text-sm">
        <span className="sr-only">Essay response</span>
        <textarea
          value={text}
          maxLength={10000}
          disabled={disabled}
          rows={12}
          placeholder="Write your response."
          onChange={(event) => onChange({ kind: 'essay', text: event.target.value })}
          className="w-full rounded-card border border-ink/10 bg-card px-4 py-3 leading-7 shadow-sm outline-none disabled:opacity-70"
        />
      </label>
      <p className="text-sm text-ink/60">{words} words · min 150</p>
      <p className="text-sm text-ink/55">AI scoring: Pending → Scored</p>
    </div>
  );
}

function ListeningAnswer({
  question,
  value,
  disabled,
  onChange,
}: {
  question: PublicQuestion;
  value: AnswerPayload | undefined;
  disabled: boolean;
  onChange: (payload: AnswerPayload) => void;
}) {
  const { passage, stem } = splitPrompt(question.prompt);
  return (
    <div className="space-y-5">
      <ListeningPlayer audioUrl={question.audioUrl} />
      <p className="text-sm text-ink/55">Audio plays once. You cannot rewind.</p>
      {passage ? (
        <p className="text-sm leading-7 whitespace-pre-wrap text-ink/75">{passage}</p>
      ) : null}
      <h2 className="font-serif text-2xl leading-snug whitespace-pre-wrap">{stem}</h2>
      <ChoiceList
        questionId={question.id}
        choices={question.choices ?? []}
        selectedId={value?.kind === 'choice' ? value.choiceId : null}
        disabled={disabled}
        onSelect={(choiceId) => onChange({ kind: 'choice', choiceId })}
      />
    </div>
  );
}

function SpeakingAnswer({
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
  const mediaId = value?.kind === 'speaking' ? value.mediaId : null;
  const [phase, setPhase] = useState<'idle' | 'recording' | 'uploading' | 'saved'>(
    mediaId ? 'saved' : 'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: WAVE_BARS }, () => 0.18),
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mounted = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const onBusyRef = useRef(onBusy);
  onBusyRef.current = onBusy;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onBusyRef.current(false);
      cancelAnimationFrame(rafRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== 'closed') void context.close();
    };
  }, []);

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
    const id = window.setInterval(() => setElapsed(Date.now() - started), 200);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'recording' && elapsed >= SPEAKING_MAX_MS) {
      const recorder = recorderRef.current;
      if (recorder && recorder.state === 'recording') recorder.stop();
    }
  }, [elapsed, phase]);

  function stopWave() {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }

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
        stopWave();
        const type = (recorder.mimeType || mime || 'audio/webm').split(';')[0] || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const context = audioContextRef.current;
        audioContextRef.current = null;
        if (context && context.state !== 'closed') void context.close();
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
      watchWave(stream);
    } catch {
      setError('Allow microphone access to record a speaking answer.');
      onBusyRef.current(false);
    }
  }

  function watchWave(stream: MediaStream) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    audioContextRef.current = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let last = 0;
    const paint = (time: number) => {
      if (!mounted.current || recorderRef.current?.state !== 'recording') return;
      if (time - last > 80) {
        last = time;
        analyser.getByteTimeDomainData(data);
        const bucket = Math.floor(data.length / WAVE_BARS);
        const next = Array.from({ length: WAVE_BARS }, (_, index) => {
          let sum = 0;
          for (let offset = 0; offset < bucket; offset += 1) {
            sum += Math.abs(data[index * bucket + offset] - 128);
          }
          return Math.min(1, sum / bucket / 28);
        });
        setLevels(next);
      }
      rafRef.current = requestAnimationFrame(paint);
    };
    rafRef.current = requestAnimationFrame(paint);
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

  const recording = phase === 'recording';
  const shownElapsed = Math.min(elapsed, SPEAKING_MAX_MS);
  const progress = recording ? shownElapsed / SPEAKING_MAX_MS : phase === 'saved' ? 1 : 0;

  return (
    <div className="space-y-5">
      <h2 className="font-serif text-2xl leading-snug whitespace-pre-wrap">{question.prompt}</h2>
      <div className="rounded-card border border-ink/10 bg-card p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={disabled || phase === 'uploading'}
            onClick={() => (recording ? stop() : void start())}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
            className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-white disabled:opacity-50 ${
              recording ? 'bg-red-500' : 'bg-primary'
            }`}
          >
            {recording ? <span className="h-4 w-4 rounded-sm bg-white" /> : <MicIcon />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-2xl tabular-nums text-ink">
              {formatPair(shownElapsed, SPEAKING_MAX_MS)}
            </p>
            <Waveform levels={recording ? levels : undefined} progress={progress} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={disabled || recording || phase === 'uploading' || !mediaId}
            onClick={() => void start()}
            className="rounded-control border border-ink/15 px-3 py-2 text-sm disabled:opacity-40"
          >
            Re-record
          </button>
          <p className="text-sm text-ink/55">
            {phase === 'uploading'
              ? 'Uploading…'
              : phase === 'saved'
                ? 'Recording saved'
                : 'AI scoring: Pending'}
          </p>
        </div>
      </div>
      <p className="text-sm text-ink/55">AI scoring: Pending → Scored</p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function ListeningPlayer({ audioUrl }: { audioUrl?: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [spent, setSpent] = useState(false);

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

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || spent || !src) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setFailed(true);
      }
      return;
    }
    audio.pause();
  }

  function onSeek(next: number) {
    const audio = audioRef.current;
    if (!audio || spent) return;
    if (next + 0.05 < audio.currentTime) return;
    audio.currentTime = next;
    setCurrent(next);
  }

  return (
    <div className="rounded-card border border-ink/10 bg-card p-4 shadow-sm">
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
          onEnded={() => {
            setPlaying(false);
            setSpent(true);
          }}
        />
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!src || spent || failed}
          onClick={() => void toggle()}
          aria-label={playing ? 'Pause' : 'Play'}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-white disabled:opacity-40"
        >
          {playing ? <span className="h-3.5 w-3.5 rounded-sm bg-white" /> : <PlayIcon />}
        </button>
        <div className="min-w-0 flex-1">
          <Waveform progress={progress} />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            disabled={!src || !duration || spent}
            aria-label="Seek forward"
            onChange={(event) => onSeek(Number(event.target.value))}
            className="mt-2 w-full accent-primary"
          />
        </div>
        <p className="w-16 text-right text-xs text-ink/50 tabular-nums">
          {formatPair(current * 1000, (duration || 0) * 1000)}
        </p>
      </div>
      {!audioUrl ? (
        <p className="mt-3 text-sm text-ink/60">No audio file is attached to this item.</p>
      ) : null}
      {failed ? <p className="mt-3 text-sm text-red-700">The audio could not be loaded.</p> : null}
      {spent ? <p className="mt-3 text-sm text-ink/55">Playback is finished.</p> : null}
    </div>
  );
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
    <fieldset className="space-y-2.5" disabled={disabled}>
      <legend className="sr-only">Choose one answer</legend>
      {choices.map((choice, index) => {
        const selected = selectedId === choice.id;
        const letter = String.fromCharCode(65 + index);
        return (
          <label
            key={choice.id}
            className={`flex cursor-pointer items-center gap-3 rounded-control border bg-card px-4 py-3 text-sm leading-6 shadow-sm ${
              selected ? 'border-primary' : 'border-ink/10'
            } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
          >
            <input
              type="radio"
              name={questionId}
              value={choice.id}
              checked={selected}
              onChange={() => onSelect(choice.id)}
              className="sr-only"
            />
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                selected ? 'bg-primary text-white' : 'bg-canvas text-ink/70'
              }`}
            >
              {letter}
            </span>
            <span className="flex-1">{choice.text}</span>
            {selected ? <CheckIcon /> : <span className="h-5 w-5" />}
          </label>
        );
      })}
    </fieldset>
  );
}

function Waveform({ levels, progress = 0 }: { levels?: number[]; progress?: number }) {
  const bars =
    levels ?? Array.from({ length: WAVE_BARS }, (_, index) => 0.28 + ((index * 17) % 10) / 18);
  return (
    <div className="flex h-10 items-center gap-0.5" aria-hidden="true">
      {bars.map((level, index) => {
        const filled = levels ? true : index / bars.length <= progress;
        const height = Math.max(4, Math.round(levels ? 8 + level * 28 : 10 + level * 22));
        return (
          <span
            key={index}
            className={`w-1 rounded-full ${filled ? 'bg-primary' : 'bg-primary/20'}`}
            style={{ height }}
          />
        );
      })}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 text-primary" aria-hidden="true">
      <path fill="currentColor" d="M7.6 13.2 4.4 10l-1.2 1.2 4.4 4.4L17 6.2 15.8 5z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" className="ml-0.5 h-5 w-5" aria-hidden="true">
      <path fill="currentColor" d="M7 5.2v9.6l8-4.8z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
      />
    </svg>
  );
}

function splitPrompt(prompt: string) {
  const parts = prompt
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return { passage: null as string | null, stem: prompt.trim() };
  return { passage: parts.slice(0, -1).join('\n\n'), stem: parts[parts.length - 1] };
}

function wordCount(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatPair(elapsedMs: number, totalMs: number) {
  return `${formatShort(elapsedMs)}/${formatShort(totalMs)}`;
}

function formatShort(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function toApiPath(url: string) {
  if (url.startsWith('/backend/')) return url.slice('/backend'.length);
  if (url.startsWith('/')) return url;
  return `/${url}`;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
