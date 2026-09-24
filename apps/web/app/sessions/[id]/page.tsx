'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ExamSession } from '../../../components/exam-session';
import { useAuth } from '../../../components/providers';

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const { token, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !token) router.replace('/login');
  }, [ready, token, router]);

  if (!ready || !token) {
    return <div className="min-h-screen bg-canvas" />;
  }

  return <ExamSession sessionId={params.id} />;
}
