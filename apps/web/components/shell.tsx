'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SampleNotice } from './sample-notice';
import { useAuth } from './providers';

export function Shell({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { token, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-ink/10 bg-card/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/exams" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-control bg-primary text-sm font-semibold text-white shadow-card">
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
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true);
                  void logout().finally(() => setSigningOut(false));
                }}
                className="rounded-control border border-ink/15 bg-white px-3 py-2 text-sm text-ink/80 hover:border-ink/25 disabled:opacity-60"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10">
        <SampleNotice />
        {children}
      </main>
    </div>
  );
}
