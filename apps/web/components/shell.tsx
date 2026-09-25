'use client';

import Link from 'next/link';
import { SampleDataBanner } from './sample-banner';
import { useAuth } from './providers';

export function Shell({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { token, logout } = useAuth();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SampleDataBanner />
      <header className="border-b border-ink/10 bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/exams" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-control bg-primary text-sm font-semibold text-white">
              T
            </span>
            <span>
              <span className="block text-xs tracking-[0.14em] text-ink/60 uppercase">
                Practice
              </span>
              <span className="font-serif text-lg leading-none">TOEFL</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {action}
            {token ? (
              <button
                type="button"
                onClick={logout}
                className="rounded-control border border-ink/15 px-3 py-2 text-sm text-ink/80"
              >
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
    </div>
  );
}
