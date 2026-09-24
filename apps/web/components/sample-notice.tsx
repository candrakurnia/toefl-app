'use client';

import { useSyncExternalStore } from 'react';
import { isSampleDataActive, subscribeSampleData } from '../lib/api';

export function SampleNotice() {
  const active = useSyncExternalStore(subscribeSampleData, isSampleDataActive, isSampleDataActive);
  if (!active) return null;
  return (
    <p className="mb-4 rounded-control border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm leading-6 text-ink/80">
      Sample data is on because the API did not respond. Sign in with{' '}
      <span className="font-medium">student@example.com</span> /{' '}
      <span className="font-medium">practice1</span>, or register a new account.
    </p>
  );
}
