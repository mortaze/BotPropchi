# Agent Instructions

## Project Overview

Telegram bot for prop firm discount codes with lottery, scoring, and referral system. Two codebases in one repo:

- **Root** (`src/`): Main Telegram bot + Express API (TypeScript, Telegraf, Prisma)
- **Admin** (`admin/`): Next.js 15 admin panel (calls root API via `NEXT_PUBLIC_API_URL`)

WordPress plugin was removed from this repo. `src/config/index.ts:60-65` still references WordPress config — stale, can be cleaned up.

## Quick Commands

```bash
# Bot development
npm run dev              # ts-node-dev with hot reload
npm run build            # tsc
npm start                # node dist/index.js

# Database (requires PostgreSQL)
npm run db:push          # push schema to DB (NOT migration-based)
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

No lint or typecheck script exists in root `package.json`. Only the admin panel has `next lint`.

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

Background workers: `src/workers/` (membership, leaderboard) use BullMQ with Redis. Queue definitions live in `src/queue/`.

One-off migration/repair scripts in `src/scripts/` and `scripts/` (not run automatically).

AI responses go through WordPress plugin (removed from repo), not direct Gemini calls.

## Handler Registration Order (CRITICAL)

The order handlers are registered in `index.ts` determines which handler processes a message/callback. **Do not change this order.**

At the `index.ts` level:
```
callback trace logger (BEFORE all middleware)
→ middleware chain (logging→rateLimit→user→chatMember→membership→featureToggle→groupAccess)
→ registerHandlers(bot)           — all handlers from handlers/index.ts
→ registerScheduledMessageHandlers(bot) — scheduled message feature
→ forum topic discovery handler   — group/supergroup topic events
→ bot.catch                       — global error handler
→ catch-all [UNMATCHED_CALLBACK]  — unmatched callback_data
```

Inside `registerHandlers()` (handlers/index.ts), the order is:
```
my_chat_member / new_chat_members
→ bot.start (HARD RESET clears all user state)
→ admin panel handlers
→ menu editor (with bot.on('text') at L647 consuming rename inputs)
→ dynamic post button routing (L600-643) — intercepts text for published posts
→ various admin/user handlers
→ lottery
→ points/leaderboard/referral
→ membership check
→ ticket handlers
→ post-handlers (L1729 via registerPostHandlers())
→ anonymous message fallback (L1735) — LAST handler in chain
```

Key implications:
- Dynamic Post Button Routing at L600 intercepts text messages before post-handlers sees them. It only skips when `post_mgmt_mode`, `menu:edit_mode`, or `post:editor:{userId}:active` is set.
- `bot.on('text')` in `post-handlers.ts:610` has 12+ early returns that CONSUME messages without `next()`. Any `bot.hears` registered after L610 is unreachable if a state check matches.
- `src/bot/handlers/index.ts` is 1760 lines — all bot handlers in one file; shared helpers live in `src/bot/shared.ts`. `post-handlers.ts` is 3593 lines. `scheduled-message.handlers.ts` is 1356 lines.

## Callback Rules (Production Bugs)

- **`ctx.reply()` is NOT acceptable as fallback for editMessage failures** — fix the cause of editMessage failure, never send a new message
- **answerCbQuery is REQUIRED for ALL callback error paths**: `bot.catch()`, `rateLimitMiddleware`, and catch-all handlers MUST call `ctx.answerCbQuery()`. The Telegram loading spinner only dismisses when answerCbQuery is called.
- **Every keyboard button needs a matching `bot.action()` handler**: orphaned callback_data patterns cause infinite loading spinner with zero logs. Use the catch-all `[UNMATCHED_CALLBACK]` log to detect orphaned patterns.
- **Cache invalidation required after message delete**: both bot handler and API route must call `postService.invalidateCache()` after deleting a message.
- **`safeEdit` in `shared.ts:6`** falls back to `ctx.reply()` on editMessageText failure — violates the rule above. Fix the root cause, not the fallback.

## Bug Verification Protocol

After fixing a bug:
1. Create NEW command
2. Immediately click — must work on FIRST click
3. Repeat 10+ consecutive times
4. If one single first click fails, bug is NOT fixed
5. Run TS check + tests + commit + push

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
- **No CI/CD workflows in repo**
- Prisma client wrapper is at `src/prisma/client.ts` (singleton PrismaClient with dev query logging); the generated client lives in `node_modules/.prisma/client`
- All user-facing strings are in Persian (Farsi)
- `admin/src/index.ts`, `admin/src/api/`, `admin/src/scheduler.ts` are legacy/dead code — the real admin app is the Next.js frontend. Admin also has legacy bot scripts (`dev:bot`, `build:bot`, `start:bot`) in its package.json.
- Admin panel uses cookie-based auth (`admin_token` + `admin_user` cookies), root API uses JWT Bearer tokens
- Admin panel middleware blocks non-OWNER/SUPER_ADMIN from `/dashboard/settings` and `/dashboard/admin-users`
- Redis is optional — falls back to in-memory cache (`node-cache`) if `REDIS_URL` not set
- `admin/.env` contains `NEXT_PUBLIC_API_URL` pointing to the root API base URL — must be set for admin to function (currently set to production Railway URL; override for local dev)
- Bot middleware lives in `src/bot/middlewares/`, but `membershipGuard` is in `src/middleware/` (separate directory, same Telegraf interface)
- The Post system (`Post`, `PostMessage`, `PostButton`, `PostEntity`, `PostMedia`, `PostKeyboard`, `PostVersion`) is the richest model — posts support multi-message sequences, rich Telegram entities, inline keyboards, and version snapshots
- **BigInt serialization**: Any `JSON.stringify` path touching Prisma data MUST use BigInt replacer `(_, v) => typeof v === 'bigint' ? v.toString() : v`. BigInt columns are used across many models (User, Post, Lottery, Ticket, etc.). Helper: `src/utils/serialize.ts`.
- **Do NOT refactor command architecture**: The user explicitly rejected `command.repository.ts` creation and `post.service.ts` command method refactoring. Command button bugs are RUNTIME issues, not architectural. Do NOT create new repositories, do NOT redesign command resolution, do NOT change APIs.
- Admin uses shadcn/ui components (Radix UI primitives + Tailwind CSS + class-variance-authority)
