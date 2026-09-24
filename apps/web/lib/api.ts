export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/backend';

const ACCESS_KEY = 'toefl.accessToken';

type TokenListener = (token: string | null) => void;

const listeners = new Set<TokenListener>();
let accessToken: string | null = null;
let hydrated = false;

export class ApiError extends Error {
  readonly body: unknown;

  constructor(
    public status: number,
    message: string,
    body: unknown = null,
  ) {
    super(message);
    this.body = body;
  }
}

export function sessionIdFromError(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object') return null;
  const sessionId = (error.body as { sessionId?: unknown }).sessionId;
  return typeof sessionId === 'string' ? sessionId : null;
}

export function getAccessToken() {
  hydrate();
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) sessionStorage.setItem(ACCESS_KEY, token);
    else sessionStorage.removeItem(ACCESS_KEY);
  }
  listeners.forEach((listener) => listener(token));
}

export function subscribeAccessToken(listener: TokenListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  accessToken = sessionStorage.getItem(ACCESS_KEY);
}

let refreshPromise: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh() {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: '{}',
  });
  if (!response.ok) {
    setAccessToken(null);
    return false;
  }
  const body = (await response.json()) as { accessToken?: string };
  if (!body.accessToken) {
    setAccessToken(null);
    return false;
  }
  setAccessToken(body.accessToken);
  return true;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return api<T>(path, init, false);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, messageFrom(body), body);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiBlob(path: string, retry = true): Promise<Blob> {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiBlob(path, false);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, messageFrom(body), body);
  }
  return response.blob();
}

function messageFrom(body: unknown) {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.map(String).join(' ');
    if (typeof message === 'string') return message;
  }
  return 'Request failed';
}
