# TOEFL Practice App — MVP API Contract (draft)

## Stack

- Monorepo: `apps/api` (NestJS + TypeScript + PostgreSQL + Redis + S3/R2), `apps/web` (Next.js App Router + TS + Tailwind + TanStack Query)
- Shared: `packages/shared` for API types/DTOs

## Auth

- `POST /auth/register` `{ email, password }` → user
- `POST /auth/login` → `{ accessToken, refreshToken }` (prefer httpOnly cookie for web)
- `POST /auth/refresh`

## Exams

- `GET /exams` → `{ id, title, durationOverall, status: not_started|in_progress|completed }[]`
- `GET /exams/:id` → pra-test detail `{ sections[{ id, name, durationSec, questionTypes }], rules, questionCount }`
- `POST /exams/:id/sessions` → create session; start overall + first section timers; reject if active session exists for user/exam

## Sessions / timer / anti-cheat

- `GET /sessions/:id` → state + `serverNow`, `overallEndsAt`, `sectionEndsAt`, `currentSectionId`, answers snapshot, `violations[]`
- `GET /sessions/:id/questions?sectionId=` → questions for section (MC / essay / listening / speaking payloads; no correct answers until submit where applicable)
- `PATCH /sessions/:id/answers` autosave `{ questionId, payload }`
- `POST /sessions/:id/sections/next` — advance to the next section. Optional `{ fromSectionId }`. If that section is no longer current, deadlines are synced and the server does not advance again. When `sectionEndsAt` has passed, the server auto-advances (or force-submits on the last section) on this route, on `GET /sessions/:id`, on heartbeat, and on a background sweep
- `POST /sessions/:id/heartbeat` sync + optional visibility/fullscreen flags. Flags do not pause either timer
- `POST /sessions/:id/violations` `{ type: fullscreen_exit|tab_blur, at }` — log only; does not pause timers or submit
- `POST /sessions/:id/submit` or server force-submit on deadline → attempt + partial scores; essay/speaking `pending`

## Timers (server-authoritative)

- Dual: section + overall (overall = start + 24h from wireframe)
- Leaving fullscreen does NOT pause timers; warning + violation flag only (MVP)

## History & media

- `GET /attempts` → every attempt for the user: `{ id, examId, examTitle, sessionId, submittedAt, forced, scoringStatus: pending|scored, score, maxScore }`. `score` is the known total (auto-scored points immediately, plus a numeric essay/speaking grade when one exists). It is null only when no numeric points exist yet. `scoringStatus` is `pending` while any section item is still unscored.
- `GET /attempts/:id` → the summary plus `sectionScores`, per-answer `scoreStatus` (`pending`|`scored`), and `violations[]` (`fullscreen_exit`|`tab_blur`) copied from the session.
- `POST /media/upload` (speaking answers; size limit)
- AI scoring async: Pending → Scored for essay/speaking. Choice and listening scores are available on submit.

## Design tokens (web)

- primary `#7B5CFF`, bg `#F6F3FA`, text `#1C1428`, radius 14–16
