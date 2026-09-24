import { mockApi } from './mock-api';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/backend';

const ACCESS_KEY = 'toefl.accessToken';

type TokenListener = (token: string | null) => void;
type SampleListener = () => void;

const listeners = new Set<TokenListener>();
const sampleListeners = new Set<SampleListener>();
let accessToken: string | null = null;
let hydrated = false;
let sampleDataActive = sampleMode() === 'on';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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

export function isSampleDataActive() {
  return sampleDataActive;
}

export function subscribeSampleData(listener: SampleListener) {
  sampleListeners.add(listener);
  return () => {
    sampleListeners.delete(listener);
  };
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  accessToken = sessionStorage.getItem(ACCESS_KEY);
}

let refreshPromise: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  if (sampleMode() === 'on' || sampleDataActive) {
    return Promise.resolve(Boolean(getAccessToken()));
  }
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh() {
  try {
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
  } catch {
    return false;
  }
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  if (sampleMode() === 'on' || sampleDataActive) {
    return mockApi<T>(path, init);
  }
  try {
    return await request<T>(path, init, retry);
  } catch (error) {
    if (sampleMode() === 'fallback' && isUnreachable(error)) {
      activateSampleData();
      return mockApi<T>(path, init);
    }
    throw error;
  }
}

async function request<T>(path: string, init: RequestInit, retry: boolean): Promise<T> {
  const headers = new Headers(init.headers);
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ApiError(0, 'Cannot reach the API');
    }
    throw error;
  }

  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, init, false);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, messageFrom(body));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function messageFrom(body: unknown) {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.map(String).join(' ');
    if (typeof message === 'string') return message;
  }
  return 'Request failed';
}

function sampleMode(): 'on' | 'off' | 'fallback' {
  const flag = process.env.NEXT_PUBLIC_USE_API_MOCK;
  if (flag === '0' || flag === 'false') return 'off';
  if (flag === '1' || flag === 'true') return 'on';
  if (flag === 'fallback') return 'fallback';
  return process.env.NODE_ENV === 'development' ? 'fallback' : 'off';
}

function isUnreachable(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 0 ||
      error.status === 500 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504)
  );
}

function activateSampleData() {
  if (sampleDataActive) return;
  sampleDataActive = true;
  if (typeof console !== 'undefined') {
    console.warn('[toefl] API unreachable. Showing sample exams so the screens stay usable.');
  }
  sampleListeners.forEach((listener) => listener());
}
