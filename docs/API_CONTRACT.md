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
- `PATCH /sessions/:id/answers` autosave `{ questionId, payload }`. After submit, `409` `Attempt is readonly` and the answer is not written
- `POST /sessions/:id/sections/next` — advance to the next section. Optional `{ fromSectionId }`. If that section is no longer current, deadlines are synced and the server does not advance again. When `sectionEndsAt` has passed, the server auto-advances (or force-submits on the last section) on this route, on `GET /sessions/:id`, on heartbeat, and on a background sweep
- `POST /sessions/:id/heartbeat` sync + optional visibility/fullscreen flags. Flags do not pause either timer
- `POST /sessions/:id/violations` `{ type: fullscreen_exit|tab_blur, at }` — log only; does not pause timers or submit
- `POST /sessions/:id/submit` or server force-submit on deadline → attempt + partial scores; essay/speaking `pending`

## Timers (server-authoritative)

- Dual: section + overall (overall = start + 24h from wireframe)
- Leaving fullscreen does NOT pause timers; warning + violation flag only (MVP)

## History & results (checkpoint 3)

`GET /attempts` is the history list: every attempt for the signed-in user, newest `submittedAt` first. A user who has never submitted gets `[]`.

`GET /attempts/:id` is one attempt. Clients poll it while `scoringStatus` is `pending`. There is no write route on `/attempts`.

Both payloads include:

- `submittedAt` (date), `examId`, `examTitle` (exam)
- `overallScore` / `overallMaxScore` (total). `overallScore` is null while any section is still unscored
- `scoringStatus`: `pending` while any `sectionScores[].score` is null, otherwise `scored`. `pending` is the Pending badge
- `sectionScores[]`: `{ sectionId, name, score, maxScore }`. A number is present as soon as that section is fully scored. Null means that section is still unscored
- `answers[]`: per question, including `type`, `scoreStatus`, `score`, `maxScore`. Multiple choice and listening are `scored` at submit. Essay and speaking are `pending` with `score: null`, then `scored` with a number. This is the section/type breakdown. Speaking `mediaId` / `url` may be present; replaying the recording is not required
- `violations`: `{ total, fullscreenExit, tabBlur }`. A count above zero is that flag. `total: 0` means no flags. Counts come from violations logged before submit

`id` on a list row is the detail link (`GET /attempts/:id`).

After submit or force-submit the attempt is readonly. `PATCH /sessions/:id/answers` returns `409` with message `Attempt is readonly` and does not write the answer. The check is repeated inside the write, so a save that races the submit cannot change the snapshotted answers.

## Media

`POST /media/upload` accepts multipart field `file` (audio only: webm, mp3, wav, m4a, ogg, aac; 10MB) and returns `{ mediaId, url, key }`. `url` is `/media/:mediaId`. `key` is `speaking/<mediaId>.<ext>`. `GET /media/:id` streams the bytes for the owner. Saving a speaking answer (`{ kind: "speaking", mediaId }`) checks that this user uploaded that id and stores `{ kind: "speaking", mediaId, url }`.

Files land on local disk under `MEDIA_DIR` (default `apps/api/uploads`, gitignored) unless `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` are all set. That path uses S3 or R2 (`S3_ENDPOINT`, `S3_REGION`) and still plays back through `GET /media/:id`. Objects are private.

Listening audio for the seeded exam is a public static file, not an upload: `GET /fixtures/listening/q_listen_1.wav`.

### Practice scoring (not a model)

Essay and speaking move from `pending` to `scored` on the server. Submit pushes `{ attemptId, enqueuedAt }` onto the Redis list `scoring:jobs` (RPUSH/LPOP). If Redis is down, the process keeps that job in memory. An in-process worker also scans the newest 100 attempts so a lost pop still completes. The worker is idempotent: a numeric score is never rewritten, and a row with `stub: false` (or `stub` omitted) is left for a future model. Set `SCORING_STUB=false` to stop this worker and leave the Redis list for that model.

The practice grade sets `stub: true`:

- Essay: 0 words → 0. Otherwise `clamp(round(min(1, words / 150) * maxScore), 1, maxScore)`
- Speaking: no `mediaId` → 0. Otherwise `1 + (fnv1a32(mediaId) % maxScore)`, stable for the same recording

New attempts stay `pending` for `SCORING_STUB_DELAY_MS` (default 4000) so clients can observe the transition. A real model is not called.

## Design tokens (web)

- primary `#7B5CFF`, bg `#F6F3FA`, text `#1C1428`, radius 14–16
