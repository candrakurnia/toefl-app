'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
  subscribeAccessToken,
} from '../lib/api';

interface AuthContextValue {
  token: string | null;
  ready: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within Providers');
  return value;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeAccessToken((next) => {
      if (active) setToken(next);
    });
    const existing = getAccessToken();
    setToken(existing);
    if (existing) {
      setReady(true);
    } else {
      void refreshAccessToken().finally(() => {
        if (!active) return;
        setToken(getAccessToken());
        setReady(true);
      });
    }
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const auth = useMemo<AuthContextValue>(
    () => ({
      token,
      ready,
      logout: async () => {
        try {
          await fetch('/api/session', { method: 'DELETE', credentials: 'include' });
        } catch {
          // Clearing the local access token still ends the browser session.
        }
        setAccessToken(null);
        queryClient.clear();
      },
    }),
    [token, ready, queryClient],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </QueryClientProvider>
  );
}
