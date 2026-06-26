# Agent Instructions

## Project Overview

Telegram bot for prop firm discount codes with lottery, scoring, and referral system. Three separate codebases in one repo:

- **Root** (`src/`): Main Telegram bot + Express API (TypeScript, Telegraf, Prisma)
- **Admin** (`admin/`): Next.js 15 admin panel
- **Plugin** (`wordpress-plugin/`): WordPress AI backend plugin (PHP)

## Quick Commands

```bash
# Bot development
npm run dev              # ts-node-dev with hot reload
npm run build            # tsc
npm start                # node dist/index.js

# Database (requires PostgreSQL)
npm run db:push          # push schema to DB
npm run db:seed          # seed initial data (admin: admin/admin123)
npm run db:studio        # Prisma Studio UI

# Testing
npm run test             # vitest run (tests in src/__tests__/)

# Admin panel (from admin/ directory)
cd admin && npm run dev  # Next.js dev server
cd admin && npm run build
```

## Architecture

Entry point: `src/index.ts` → bootstrap() starts bot, API, scheduler, workers

Layer order: `handlers → services → repositories → prisma`

Middleware stack (applied in order):
1. loggingMiddleware
2. rateLimitMiddleware (20 req/60s)
3. userMiddleware
4. membershipGuard
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
- `WORDPRESS_API_URL` - For AI responses
- `MEMBERSHIP_REQUIRED_CHANNELS` - Comma-separated channel IDs for force-join

## Testing

Tests are pure unit tests (no DB/Redis needed). Run with `npm run test`.

Test files: `src/__tests__/*.test.ts`

## TypeScript Config

- Target: ES2020, Module: commonjs
- `strict: false`, `noImplicitAny: false`
- Path alias: `@/*` → `src/*`
- Output: `dist/`

## Adding Features

1. Add Model to `prisma/schema.prisma`
2. Add Repository in `src/repositories/`
3. Add Service in `src/services/`
4. Add Handler in `src/bot/handlers/`
5. Register handler in `src/index.ts`

## Gotchas

- `docker-compose.yml` runs PostgreSQL 16 and Redis 7 (ports 5432, 6379)
- Docker production runs `prisma db push` on container start
- No linter configured in root project; admin uses `next lint`
- No CI/CD workflows in repo
- Prisma client is generated at `src/prisma/client.ts`
- All user-facing strings are in Persian (Farsi)
- Admin panel `src/index.ts` and `src/api/server.ts` are legacy/dead code — the real app is the Next.js frontend that calls the root API via `NEXT_PUBLIC_API_URL`
- Admin panel uses cookie-based auth (`admin_token` cookie), root API uses JWT Bearer tokens
- Admin panel middleware blocks non-OWNER/SUPER_ADMIN from `/dashboard/settings` and `/dashboard/admin-users`
- Redis is optional — falls back to in-memory cache (`node-cache`) if `REDIS_URL` not set
- `admin/tsconfig.json` excludes `src/api`, `src/index.ts`, `src/scheduler.ts` from Next.js build (those are legacy files)
