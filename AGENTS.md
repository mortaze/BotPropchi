# Agent Instructions

## Project Overview

Telegram bot for prop firm discount codes with lottery, scoring, and referral system. Two codebases in one repo:

- **Root** (`src/`): Main Telegram bot + Express API (TypeScript, Telegraf, Prisma)
- **Admin** (`admin/`): Next.js 15 admin panel (calls root API via `NEXT_PUBLIC_API_URL`)

Note: WordPress plugin (`wordpress-plugin/`) is referenced in docs but does NOT exist in this repo — deploy separately or remove references.

## Quick Commands

```bash
# Bot development
npm run dev              # ts-node-dev with hot reload
npm run build            # tsc
npm start                # node dist/index.js

# Database (requires PostgreSQL)
npm run db:push          # push schema to DB
npm run db:generate      # regenerate Prisma client only
npm run db:seed          # seed initial data (admin: admin/admin123)
npm run db:studio        # Prisma Studio UI

# Testing (pure unit tests, no DB/Redis needed)
npm run test             # vitest run — picks up src/__tests__/*.test.ts

# Admin panel (from admin/ directory)
cd admin && npm run dev  # Next.js dev server
cd admin && npm run build
cd admin && npm run lint # next lint
```

## Architecture

Entry point: `src/index.ts` → bootstrap() starts bot, API, scheduler, workers

Layer order: `handlers → services → repositories → prisma`

Middleware stack (applied in order):
1. loggingMiddleware
2. rateLimitMiddleware (20 req/60s)
3. userMiddleware
4. membershipGuard (in `src/middleware/`, not `src/bot/middlewares/`)
5. featureToggleMiddleware
6. groupAccessMiddleware

Background workers: `src/workers/` (membership, leaderboard) use BullMQ with Redis.

AI responses go through WordPress plugin (`wordpress-plugin/`), not direct Gemini calls.

## Key Environment Variables

Required in `.env`:
- `BOT_TOKEN` - Telegram bot token
- `ADMIN_TELEGRAM_ID` - Owner's Telegram numeric ID
- `JWT_SECRET` - For admin API auth
- `DATABASE_URL` - PostgreSQL connection string

Optional:
- `REDIS_URL` - Falls back to in-memory cache if missing
- `WORDPRESS_API_URL` - For AI responses (endpoint: `/wp-json/propchi/v1/message`)
- `WORDPRESS_BOT_API_KEY` - Auth key for WordPress plugin
- `WORDPRESS_SIGNATURE_SECRET` - HMAC signature for WordPress plugin
- `WORDPRESS_API_TIMEOUT_MS` - Timeout for WordPress calls (default 25000)
- `MEMBERSHIP_REQUIRED_CHANNELS` - Comma-separated channel IDs for force-join
- `MEMBERSHIP_CACHE_TTL` - Membership status cache TTL in seconds (default 300)

## Testing

Tests are pure unit tests (no DB/Redis needed). Run with `npm run test`.

Test files: `src/__tests__/*.test.ts`

Note: there is a stray `src/tests/` directory with one file — vitest does NOT pick it up (config only includes `src/__tests__/`).

## TypeScript Config

Root (`tsconfig.json`):
- Target: ES2020, Module: commonjs
- `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`
- Path alias: `@/*` → `src/*`
- Output: `dist/`
- No lint or typecheck script in root `package.json`

Admin (`admin/tsconfig.json`):
- `strict: true`, module: esnext, moduleResolution: bundler
- Excludes `src/api`, `src/index.ts`, `src/scheduler.ts` (legacy dead files)
- Lint: `cd admin && npm run lint` (uses `next lint`)

## Adding Features

1. Add Model to `prisma/schema.prisma`
2. Add Repository in `src/repositories/`
3. Add Service in `src/services/`
4. Add Handler in `src/bot/handlers/`
5. Register handler in `src/index.ts`

## Gotchas

- `docker-compose.yml` is mostly commented out — the active config only runs PostgreSQL 16 and Redis 7 (ports 5432, 6379). The bot service is NOT in docker-compose — deploy via the Dockerfile which runs `npx prisma db push && node dist/index.js` at container start.
- No linter or typecheck configured in root project; admin uses `next lint`
- No CI/CD workflows in repo
- Prisma client wrapper is at `src/prisma/client.ts` (singleton PrismaClient with dev query logging); the generated client lives in `node_modules/.prisma/client`
- All user-facing strings are in Persian (Farsi)
- `admin/src/index.ts`, `admin/src/api/`, `admin/src/scheduler.ts` are legacy/dead code — the real admin app is the Next.js frontend. Admin also has legacy bot scripts (`dev:bot`, `build:bot`, `start:bot`) in its package.json.
- Admin panel uses cookie-based auth (`admin_token` + `admin_user` cookies), root API uses JWT Bearer tokens
- Admin panel middleware blocks non-OWNER/SUPER_ADMIN from `/dashboard/settings` and `/dashboard/admin-users`
- Redis is optional — falls back to in-memory cache (`node-cache`) if `REDIS_URL` not set
- `admin/.env` contains `NEXT_PUBLIC_API_URL` pointing to the root API base URL — must be set for admin to function (currently set to production Railway URL; override for local dev)
- Bot middleware lives in `src/bot/middlewares/`, but `membershipGuard` is in `src/middleware/` (separate directory, same Telegraf interface)
- The Post system (`Post`, `PostMessage`, `PostButton`, `PostEntity`, `PostMedia`, `PostKeyboard`, `PostVersion`) is the richest model — posts support multi-message sequences, rich Telegram entities, inline keyboards, and version snapshots
- Admin uses shadcn/ui components (Radix UI primitives + Tailwind CSS + class-variance-authority)
