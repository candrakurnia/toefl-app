'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from './providers';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || token) return;
    const next = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [ready, token, router]);

  if (!ready) {
    return <p className="text-sm text-ink/60">Checking your session…</p>;
  }
  if (!token) return null;
  return children;
}
