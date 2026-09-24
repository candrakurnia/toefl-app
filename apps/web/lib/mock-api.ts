import type { ExamDetail, ExamSummary, SessionState, UserPublic } from '@toefl/shared';
import { OVERALL_WINDOW_SEC } from '@toefl/shared';
import { ApiError, getAccessToken } from './api';

interface MockUser {
  id: string;
  email: string;
  password: string;
  createdAt: string;
}

interface StoredSession {
  status: 'active' | 'submitted';
  state: SessionState;
}

const users = new Map<string, MockUser>();
const sessions = new Map<string, StoredSession>();

const practiceRules = [
  'The overall window is 24 hours from the moment you start. The server clock is authoritative.',
  'Each section has its own timer. When a section timer ends, the server advances you or submits the test.',
  'Leaving fullscreen or switching tabs is logged. Neither timer pauses.',
  'Answers autosave. Essay and speaking responses are scored after you submit.',
  'You may have one active session for this exam. Submit it before starting another.',
];

const exams: ExamDetail[] = [
  {
    id: 'exam_practice_1',
    title: 'TOEFL iBT Practice Test 1',
    durationOverall: OVERALL_WINDOW_SEC,
    questionCount: 5,
    rules: practiceRules,
    sections: [
      {
        id: 'sec_reading',
        name: 'Reading',
        durationSec: 20 * 60,
        questionTypes: ['multiple_choice'],
      },
      {
        id: 'sec_listening',
        name: 'Listening',
        durationSec: 10 * 60,
        questionTypes: ['listening'],
      },
      {
        id: 'sec_speaking',
        name: 'Speaking',
        durationSec: 8 * 60,
        questionTypes: ['speaking'],
      },
      {
        id: 'sec_writing',
        name: 'Writing',
        durationSec: 20 * 60,
        questionTypes: ['essay'],
      },
    ],
  },
  {
    id: 'exam_academic_check',
    title: 'Academic Skills Check',
    durationOverall: 90 * 60,
    questionCount: 3,
    rules: [
      'This shorter check still uses one overall window and a timer per section.',
      'You can have only one active session. Finish it before starting again.',
    ],
    sections: [
      {
        id: 'sec_check_reading',
        name: 'Reading',
        durationSec: 35 * 60,
        questionTypes: ['multiple_choice'],
      },
      {
        id: 'sec_check_listening',
        name: 'Listening',
        durationSec: 25 * 60,
        questionTypes: ['listening'],
      },
      {
        id: 'sec_check_writing',
        name: 'Writing',
        durationSec: 30 * 60,
        questionTypes: ['essay'],
      },
    ],
  },
  {
    id: 'exam_completed_sample',
    title: 'Weekend Practice Form',
    durationOverall: OVERALL_WINDOW_SEC,
    questionCount: 2,
    rules: [
      'A finished attempt stays on your list as completed.',
      'Starting again is allowed only when no session is still active.',
    ],
    sections: [
      {
        id: 'sec_weekend_reading',
        name: 'Reading',
        durationSec: 18 * 60,
        questionTypes: ['multiple_choice'],
      },
      {
        id: 'sec_weekend_speaking',
        name: 'Speaking',
        durationSec: 6 * 60,
        questionTypes: ['speaking'],
      },
    ],
  },
];

seedDemo();

export async function mockApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  await delay(220);
  const method = (init.method ?? 'GET').toUpperCase();
  const body = readJson(init.body);
  const url = new URL(path, 'http://local');
  const pathname = decodeURIComponent(url.pathname);

  if (method === 'POST' && pathname === '/auth/register') {
    return register(body) as T;
  }
  if (method === 'POST' && pathname === '/auth/login') {
    return login(body) as T;
  }
  if (method === 'POST' && pathname === '/auth/refresh') {
    const token = getAccessToken();
    if (!token) throw new ApiError(401, 'Refresh token is required');
    return { accessToken: token, refreshToken: 'sample-refresh-token' } as T;
  }

  requireUser();

  if (method === 'GET' && pathname === '/exams') {
    return exams.map(toSummary) as T;
  }

  const detailMatch = pathname.match(/^\/exams\/([^/]+)$/);
  if (method === 'GET' && detailMatch) {
    const exam = findExam(detailMatch[1]);
    return exam as T;
  }

  const sessionMatch = pathname.match(/^\/exams\/([^/]+)\/sessions$/);
  if (method === 'POST' && sessionMatch) {
    return startSession(sessionMatch[1]) as T;
  }

  throw new ApiError(404, 'Not found');
}

function register(body: Record<string, unknown>): UserPublic {
  const email = emailOf(body);
  const password = passwordOf(body);
  if (users.has(email)) {
    throw new ApiError(409, 'An account with this email already exists');
  }
  const user: MockUser = {
    id: `user_${users.size + 1}`,
    email,
    password,
    createdAt: new Date().toISOString(),
  };
  users.set(email, user);
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

function login(body: Record<string, unknown>) {
  const email = emailOf(body);
  const password = passwordOf(body);
  const user = users.get(email);
  if (!user || user.password !== password) {
    throw new ApiError(401, 'Invalid email or password');
  }
  return {
    accessToken: `sample.${user.id}`,
    refreshToken: 'sample-refresh-token',
  };
}

function startSession(examId: string): SessionState {
  findExam(examId);
  const existing = sessions.get(examId);
  if (existing?.status === 'active') {
    throw new ApiError(409, 'An active session already exists for this exam');
  }
  const exam = findExam(examId);
  const now = new Date();
  const first = exam.sections[0];
  const state: SessionState = {
    id: `sess_${examId}_${now.getTime().toString(36)}`,
    examId,
    status: 'active',
    serverNow: now.toISOString(),
    startedAt: now.toISOString(),
    overallEndsAt: new Date(now.getTime() + exam.durationOverall * 1000).toISOString(),
    sectionEndsAt: new Date(now.getTime() + (first?.durationSec ?? 0) * 1000).toISOString(),
    currentSectionId: first?.id ?? null,
    answers: [],
    violations: [],
  };
  sessions.set(examId, { status: 'active', state });
  return state;
}

function toSummary(exam: ExamDetail): ExamSummary {
  return {
    id: exam.id,
    title: exam.title,
    durationOverall: exam.durationOverall,
    status: statusFor(exam.id),
  };
}

function statusFor(examId: string): ExamSummary['status'] {
  const stored = sessions.get(examId);
  if (stored?.status === 'active') return 'in_progress';
  if (stored?.status === 'submitted') return 'completed';
  return 'not_started';
}

function findExam(examId: string) {
  const exam = exams.find((item) => item.id === examId);
  if (!exam) throw new ApiError(404, 'Exam not found');
  return exam;
}

function requireUser() {
  if (!getAccessToken()) throw new ApiError(401, 'Unauthorized');
}

function emailOf(body: Record<string, unknown>) {
  return typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
}

function passwordOf(body: Record<string, unknown>) {
  return typeof body.password === 'string' ? body.password : '';
}

function readJson(body: RequestInit['body']) {
  if (typeof body !== 'string') return {};
  try {
    const value = JSON.parse(body) as unknown;
    if (value && typeof value === 'object') return value as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function seedDemo() {
  users.set('student@example.com', {
    id: 'user_demo',
    email: 'student@example.com',
    password: 'practice1',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const started = new Date('2026-09-20T09:00:00.000Z');
  sessions.set('exam_academic_check', {
    status: 'active',
    state: {
      id: 'sess_academic_active',
      examId: 'exam_academic_check',
      status: 'active',
      serverNow: started.toISOString(),
      startedAt: started.toISOString(),
      overallEndsAt: new Date(started.getTime() + 90 * 60 * 1000).toISOString(),
      sectionEndsAt: new Date(started.getTime() + 35 * 60 * 1000).toISOString(),
      currentSectionId: 'sec_check_reading',
      answers: [],
      violations: [],
    },
  });
  sessions.set('exam_completed_sample', {
    status: 'submitted',
    state: {
      id: 'sess_weekend_done',
      examId: 'exam_completed_sample',
      status: 'submitted',
      serverNow: '2026-09-18T12:00:00.000Z',
      startedAt: '2026-09-18T10:00:00.000Z',
      overallEndsAt: '2026-09-19T10:00:00.000Z',
      sectionEndsAt: '2026-09-18T10:18:00.000Z',
      currentSectionId: null,
      answers: [],
      violations: [],
    },
  });
}
