'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AttemptDetail } from '@toefl/shared';
import { AttemptResult } from '../../../components/attempt-result';
import { Shell } from '../../../components/shell';
import { useAuth } from '../../../components/providers';
import { api } from '../../../lib/api';

export default function AttemptPage() {
  const params = useParams<{ id: string }>();
  const attemptId = params.id;
  const { token, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !token) router.replace('/login');
  }, [ready, token, router]);

  const attempt = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => api<AttemptDetail>(`/attempts/${attemptId}`),
    enabled: ready && Boolean(token) && Boolean(attemptId),
    refetchInterval: (query) => (query.state.data?.scoringStatus === 'pending' ? 3000 : false),
  });

  return (
    <Shell
      action={
        <Link href="/attempts" className="text-sm text-ink/70">
          History
        </Link>
      }
    >
      {attempt.isLoading || !ready ? (
        <div className="h-64 animate-pulse rounded-card bg-ink/5" />
      ) : null}
      {attempt.isError ? (
        <p className="rounded-card border border-red-200 bg-card p-5 text-sm text-red-700">
          {attempt.error instanceof Error ? attempt.error.message : 'Could not load this attempt'}
        </p>
      ) : null}
      {attempt.data ? <AttemptResult attempt={attempt.data} /> : null}
    </Shell>
  );
}
