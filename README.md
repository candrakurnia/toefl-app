# TOEFL Practice

Monorepo for a timed TOEFL practice app. The API owns the clocks, sessions, and scoring status. The web app covers account entry, the pra-test screen, the exam session, and attempt results.

The MVP contract is in [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

## Structure

```
apps/api            NestJS + PostgreSQL (Prisma) + Redis
apps/web            Next.js App Router + Tailwind + TanStack Query
packages/shared     Shared request and response types
docker-compose.yml  Postgres 16 and Redis 7
```

`apps/api` and `apps/web` depend on `@toefl/shared`.

## Requirements

- Node.js 22+
- pnpm 10
- Docker, for Postgres and Redis

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d
pnpm --filter @toefl/api db:migrate
pnpm --filter @toefl/api db:seed
```

`db:migrate` applies `apps/api/prisma/migrations`. The seed inserts one exam, `exam_practice_1`, with Reading, Listening, Speaking, and Writing questions. Re-running the seed leaves that exam in place.

## Run

```bash
pnpm --filter @toefl/api dev
pnpm --filter @toefl/web dev
```

- Web: http://localhost:3000
- API: http://localhost:3001

Register, sign in, open the practice test, and choose Mulai. That creates the only active session for that user and exam, then opens the session. The sticky bar shows the section timer and the 24-hour overall timer from `serverNow`, `sectionEndsAt`, and `overallEndsAt`. Neither clock pauses on the client. Leaving fullscreen or hiding the tab records a violation and leaves both timers running. Submit opens the attempt, with Pending AI scoring for essay and speaking. Past attempts are listed at `/attempts`.

Check types and production builds:

```bash
pnpm typecheck
pnpm build
```

## Environment

`apps/api/.env`

| Variable              | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `DATABASE_URL`        | Postgres connection string                         |
| `REDIS_URL`           | Redis connection string                            |
| `JWT_ACCESS_SECRET`   | HMAC secret for access tokens                      |
| `JWT_REFRESH_SECRET`  | Pepper mixed into the stored refresh-token hash    |
| `JWT_ACCESS_TTL_SEC`  | Access token lifetime in seconds (default 900)     |
| `JWT_REFRESH_TTL_SEC` | Refresh token lifetime in seconds (default 604800) |
| `PORT`                | API port (default 3001)                            |
| `WEB_ORIGIN`          | Browser origin allowed by CORS                     |

`apps/web/.env.local`

| Variable                   | Purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Browser base URL. Default `/backend`, rewritten by Next.js           |
| `API_PROXY_TARGET`         | API origin the rewrite forwards to (default `http://localhost:3001`) |

The refresh token is set as an httpOnly cookie and is also returned in the JSON body, matching the contract. The web app keeps the access token in `sessionStorage` and sends it as a bearer token.

## API behavior

Authenticated routes expect `Authorization: Bearer <accessToken>`.

| Method  | Path                                 | Notes                                                                                         |
| ------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `POST`  | `/auth/register`                     | `{ email, password }` → user                                                                  |
| `POST`  | `/auth/login`                        | `{ accessToken, refreshToken }` and refresh cookie                                            |
| `POST`  | `/auth/refresh`                      | Cookie or `{ refreshToken }`                                                                  |
| `GET`   | `/exams`                             | List with `not_started`, `in_progress`, or `completed`                                        |
| `GET`   | `/exams/:id`                         | Sections, rules, question count                                                               |
| `POST`  | `/exams/:id/sessions`                | Starts timers. `409` if an active session exists                                              |
| `GET`   | `/sessions/:id`                      | State, both deadlines, answers, violations                                                    |
| `GET`   | `/sessions/:id/questions?sectionId=` | Hides correct choices until submit                                                            |
| `PATCH` | `/sessions/:id/answers`              | `{ questionId, payload }`                                                                     |
| `POST`  | `/sessions/:id/sections/next`        | Advances. Optional `{ fromSectionId }` does not advance again if that section is already over |
| `POST`  | `/sessions/:id/heartbeat`            | Syncs clocks. Optional `visibility` and `fullscreen`                                          |
| `POST`  | `/sessions/:id/violations`           | `{ type: fullscreen_exit \| tab_blur, at }`                                                   |
| `POST`  | `/sessions/:id/submit`               | Creates an attempt. Deadline paths force-submit                                               |
| `GET`   | `/attempts`                          | Current user's attempts                                                                       |
| `GET`   | `/attempts/:id`                      | Section scores and per-question status                                                        |
| `POST`  | `/media/upload`                      | Multipart field `file`, audio only, 10MB                                                      |
| `GET`   | `/media/:id`                         | Owner download for an uploaded file                                                           |

Timers are stored on the session as `overallEndsAt` and `sectionEndsAt`. The seeded exam sets the overall window to 24 hours (`durationOverall = 86400`). A section deadline advances to the next section. The overall deadline, or the end of the last section, force-submits the session (`forced: true`, status `expired`). Those deadlines are applied on session reads, heartbeats, `sections/next`, and a sweep that runs about once a second so a closed browser still submits. The next deadline is also written to the Redis sorted set `sessions:due`. If Redis is down, the sweep reads Postgres. `POST /sessions/:id/sections/next` accepts an optional `{ fromSectionId }`; when that section is no longer current, the server does not advance again. Leaving fullscreen or blurring the tab writes a violation and does not move either deadline or submit the exam.

Choice questions are scored when the attempt is created. Essay and speaking answers are stored as `pending`, pushed onto the Redis list `scoring:jobs`, and marked `scored` by an in-process stub worker. If Redis is down, that job stays on an in-memory queue so the status change still happens. Stub grades leave `score` null and set `stub: true`.

Answer payloads:

```json
{ "kind": "choice", "choiceId": "q_read_1_b" }
{ "kind": "essay", "text": "..." }
{ "kind": "speaking", "mediaId": "..." }
```
