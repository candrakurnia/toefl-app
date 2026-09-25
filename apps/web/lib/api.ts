import {
  ACTIVE_SESSION_CONFLICT_CODE,
  ACTIVE_SESSION_CONFLICT_MESSAGE,
  sessionIdFromConflict,
} from '@toefl/shared';
import { enableSampleMode, isSampleMode } from './sample-mode';
import { SAMPLE_ACCESS_TOKEN, dispatchSample } from './sample-store';

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

/**
 * Active-session conflict from `POST /exams/:id/sessions`: 409 with `sessionId`,
 * code `ACTIVE_SESSION_EXISTS`.
 */
export function sessionIdFromError(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const sessionId = sessionIdFromConflict(error.body);
  if (!sessionId) return null;
  if (error.status === 409 || conflictCode(error.body) === ACTIVE_SESSION_CONFLICT_CODE) {
    return sessionId;
  }
  return null;
}

/**
 * Session to open after a start conflict. Uses the 409 body, then a sample-store
 * id when the mock only reported that an active session already exists.
 */
export function resumeSessionId(error: unknown, fallbackId: string | null): string | null {
  const fromBody = sessionIdFromError(error);
  if (fromBody) return fromBody;
  if (!fallbackId) return null;
  const message = error instanceof Error ? error.message : '';
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 409 || message === ACTIVE_SESSION_CONFLICT_MESSAGE) return fallbackId;
  return null;
}

function conflictCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
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
  if (isSampleMode()) {
    setAccessToken(SAMPLE_ACCESS_TOKEN);
    return true;
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    });
  } catch (error) {
    if (!isTransportFailure(error)) throw error;
    enableSampleMode();
    setAccessToken(SAMPLE_ACCESS_TOKEN);
    return true;
  }
  if (await isGatewayFailure(response)) {
    enableSampleMode();
    setAccessToken(SAMPLE_ACCESS_TOKEN);
    return true;
  }
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
  if (isSampleMode()) return sampleCall<T>(path, init);
  try {
    return await liveApi<T>(path, init, retry);
  } catch (error) {
    if (!isTransportFailure(error) && !(error instanceof GatewayError)) throw error;
    enableSampleMode();
    return sampleCall<T>(path, init);
  }
}

async function liveApi<T>(path: string, init: RequestInit, retry: boolean): Promise<T> {
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

  if (await isGatewayFailure(response)) throw new GatewayError();

  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return api<T>(path, init, false);
  }

  const body = await readBody(response);
  if (!response.ok) throw new ApiError(response.status, messageFrom(body), body);
  if (response.status === 204) return undefined as T;
  return body as T;
}

export async function apiBlob(path: string, retry = true): Promise<Blob> {
  if (isSampleMode()) return sampleBlob(path);
  try {
    return await liveBlob(path, retry);
  } catch (error) {
    if (!isTransportFailure(error) && !(error instanceof GatewayError)) throw error;
    enableSampleMode();
    return sampleBlob(path);
  }
}

async function liveBlob(path: string, retry: boolean): Promise<Blob> {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    credentials: 'include',
  });

  if (await isGatewayFailure(response)) throw new GatewayError();

  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiBlob(path, false);
  }

  if (!response.ok) {
    const body = await readBody(response);
    throw new ApiError(response.status, messageFrom(body), body);
  }
  return response.blob();
}

function sampleCall<T>(path: string, init: RequestInit): T {
  const result = dispatchSample(path, init);
  if (!result.ok) throw new ApiError(result.status, messageFrom(result.body), result.body);
  if (result.status === 204) return undefined as T;
  return result.body as T;
}

function sampleBlob(path: string): Blob {
  if (path.startsWith('/media/')) return silentWav();
  throw new ApiError(404, 'Not found', { message: 'Not found' });
}

class GatewayError extends Error {
  constructor() {
    super('API did not respond');
  }
}

function isTransportFailure(error: unknown) {
  return error instanceof TypeError;
}

async function isGatewayFailure(response: Response) {
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    await response.arrayBuffer().catch(() => undefined);
    return true;
  }
  if (response.status !== 500) return false;
  const clone = response.clone();
  const body = await readBody(clone);
  return !isApiErrorBody(body);
}

function isApiErrorBody(body: unknown) {
  if (!body || typeof body !== 'object') return false;
  return 'message' in body || 'statusCode' in body;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function silentWav(): Blob {
  const samples = 800;
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataSize, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

function messageFrom(body: unknown) {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.map(String).join(' ');
    if (typeof message === 'string') return message;
  }
  return 'Request failed';
}
