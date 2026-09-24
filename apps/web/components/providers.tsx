'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getAccessToken, setAccessToken, subscribeAccessToken } from '../lib/api';

interface AuthContextValue {
  token: string | null;
  ready: boolean;
  logout: () => void;
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
    setToken(getAccessToken());
    setReady(true);
    return subscribeAccessToken(setToken);
  }, []);

  const auth = useMemo<AuthContextValue>(
    () => ({
      token,
      ready,
      logout: () => setAccessToken(null),
    }),
    [token, ready],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </QueryClientProvider>
  );
}
