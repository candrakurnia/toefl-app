'use client';

import { SampleNotice } from './sample-notice';

export function AuthScreen({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-backdrop flex min-h-screen items-center justify-center px-5 py-12 text-ink">
      <div className="w-full max-w-md rounded-card border border-ink/10 bg-card px-8 py-9 shadow-card">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-control bg-primary text-sm font-semibold text-white shadow-card">
            T
          </span>
          <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">TOEFL Practice</p>
        </div>
        <h1 className="mt-6 font-serif text-4xl leading-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-ink/70">{subtitle}</p>
        <div className="mt-8">
          <SampleNotice />
          {children}
        </div>
        <p className="mt-6 text-sm text-ink/70">{footer}</p>
      </div>
    </div>
  );
}

export function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  name,
  error,
  hint,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  name: string;
  error?: string;
  hint?: string;
}) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  return (
    <div>
      <label htmlFor={name} className="block text-sm">
        <span className="mb-1.5 block font-medium">{label}</span>
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          autoComplete={autoComplete}
          autoCapitalize={type === 'email' ? 'none' : undefined}
          spellCheck={type === 'email' ? false : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-control border bg-white px-3 py-2.5 outline-none transition ${
            error ? 'border-red-400 bg-red-50/50' : 'border-ink/15 focus:border-primary'
          }`}
        />
      </label>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-ink/50">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
