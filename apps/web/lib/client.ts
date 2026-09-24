import type {
  AuthTokens,
  ExamDetail,
  ExamSummary,
  LoginRequest,
  RegisterRequest,
  SessionState,
  UserPublic,
} from '@toefl/shared';
import { api, setAccessToken } from './api';

export function registerAccount(body: RegisterRequest) {
  return api<UserPublic>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function loginAccount(body: LoginRequest) {
  const tokens = await api<AuthTokens>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  setAccessToken(tokens.accessToken);
  return tokens;
}

export function fetchExams() {
  return api<ExamSummary[]>('/exams');
}

export function fetchExam(examId: string) {
  return api<ExamDetail>(`/exams/${encodeURIComponent(examId)}`);
}

export function createExamSession(examId: string) {
  return api<SessionState>(`/exams/${encodeURIComponent(examId)}/sessions`, {
    method: 'POST',
  });
}
