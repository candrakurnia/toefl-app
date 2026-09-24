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
- `POST /sessions/:id/sections/next` — also auto-advance / force-submit section when `sectionEndsAt` hit
- `POST /sessions/:id/heartbeat` sync + optional visibility/fullscreen flags
- `POST /sessions/:id/violations` `{ type: fullscreen_exit|tab_blur, at }`
- `POST /sessions/:id/submit` or server force-submit on deadline → attempt + partial scores; essay/speaking `Pending`

## Timers (server-authoritative)

- Dual: section + overall (overall = start + 24h from wireframe)
- Leaving fullscreen does NOT pause timers; warning + violation flag only (MVP)

## History & media

- `GET /attempts`, `GET /attempts/:id`
- `POST /media/upload` (speaking answers; size limit)
- AI scoring async: Pending → Scored for essay/speaking

## Design tokens (web)

- primary `#7B5CFF`, bg `#F6F3FA`, text `#1C1428`, radius 14–16
