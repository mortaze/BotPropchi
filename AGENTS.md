# Agent Instructions

## Project Overview

Telegram bot for prop firm discount codes with lottery, scoring, and referral system. Two codebases in one repo:

- **Root** (`src/`): Main Telegram bot + Express API (TypeScript, Telegraf, Prisma)
- **Admin** (`admin/`): Next.js 15 admin panel (calls root API via `NEXT_PUBLIC_API_URL`)

WordPress plugin directory was removed from this repo, but WordPress API env vars remain in `src/config/index.ts:60-65` for AI response routing.

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

Entry point: `src/index.ts` → `bootstrap()` starts bot, API, scheduler, workers

Layer order: `handlers → services → repositories → prisma`

Middleware stack (applied in order):
1. `loggingMiddleware` (src/bot/middlewares/)
2. `rateLimitMiddleware` (20 req/60s)
3. `userMiddleware`
4. `registerChatMemberHandlers` (chat_member events, before membership guard)
5. `membershipGuard` (in `src/middleware/`, not `src/bot/middlewares/`)
6. `featureToggleMiddleware`
7. `groupAccessMiddleware`

Background workers: `src/workers/` (membership, leaderboard) use BullMQ with Redis. Queue definitions live in `src/queue/`.

One-off migration/repair scripts in `src/scripts/` and `scripts/` (not run automatically).

AI responses go through WordPress API endpoint (`/wp-json/propchi/v1/message`), not direct Gemini calls.

## Handler Registration Order (CRITICAL)

The order handlers are registered in `src/index.ts` determines which handler processes a message/callback. **Do not change this order.**

At the `src/index.ts` level:
```
callback trace logger (BEFORE all middleware)
→ middleware chain
→ registerHandlers(bot)            — all handlers from handlers/index.ts
→ registerScheduledMessageHandlers(bot)
→ forum topic discovery handler    — group/supergroup topic events
→ bot.catch                        — global error handler
→ catch-all [UNMATCHED_CALLBACK]   — unmatched callback_data
```

Inside `registerHandlers()` (handlers/index.ts), the order is:
```
my_chat_member / new_chat_members
→ bot.start (HARD RESET clears all user state)
→ admin panel handlers
→ menu editor (bot.on('text') consuming rename inputs)
→ dynamic post button routing       — intercepts text for published posts
→ various admin/user handlers
→ lottery
→ points/leaderboard/referral
→ membership check
→ ticket handlers
→ post-handlers (via registerPostHandlers())
→ anonymous message fallback        — LAST handler in chain
```

Key implications:
- Dynamic Post Button Routing intercepts text messages before post-handlers sees them. It only skips when `post_mgmt_mode`, `menu:edit_mode`, or `post:editor:{userId}:active` is set.
- `bot.on('text')` in post-handlers has 12+ early returns that CONSUME messages without `next()`. Any `bot.hears` registered after it is unreachable if a state check matches.
- Handlers in `src/bot/handlers/index.ts`, post-handlers, and scheduled-message handlers are the three large handler files.

## Callback Rules (Production Bugs)

- **`ctx.reply()` is NOT acceptable as fallback for editMessage failures** — fix the root cause, never send a new message
- **answerCbQuery is REQUIRED for ALL callback error paths**: `bot.catch()`, `rateLimitMiddleware`, and catch-all handlers MUST call `ctx.answerCbQuery()`. The Telegram loading spinner only dismisses when answerCbQuery is called.
- **Every keyboard button needs a matching `bot.action()` handler**: orphaned callback_data patterns cause infinite loading spinner with zero logs. Use the catch-all `[UNMATCHED_CALLBACK]` log to detect orphaned patterns.
- **Cache invalidation required after message delete**: both bot handler and API route must call `postService.invalidateCache()` after deleting a message.
- **`safeEdit` in `shared.ts`** falls back to `ctx.reply()` on editMessageText failure — violates the rule above. Fix the root cause, not the fallback.

## Button Move Bug (Fixed 2026-07-04)

Root cause in `handleSchedMoveDirection` (`src/bot/handlers/scheduled-message.handlers.ts:1336`):

1. **Sparse grid crash**: `buttonsToGrid()` creates sparse arrays (skips rows with gaps), causing `grid[r].length` to crash on `undefined` entries. Fixed by adding `normalizeGrid()` that packs sparse arrays into dense form (`[{id,text},...][]`) before any move operation, and `findButtonInGrid()` to locate button by DB `id` after normalization shifts indices.

2. **Singleton down push → unshift**: Singleton row moving down was using `.push()` (end of target row) instead of `.unshift()` (beginning). This contradicted the expected behavior where singleton down should merge at the start of the row below. **All four directions now**:
   - ⬇️ Non-singleton → extract into new singleton row below
   - ⬇️ Singleton → merge at **start** of next row (`.unshift()`)
   - ⬆️ Non-singleton → extract into new singleton row above
   - ⬆️ Singleton → merge at **start** of previous row (`.unshift()`)
    - ⬅️➡️ Swap adjacent buttons within same row

3. **Test helpers also fixed**: `src/__tests__/button-editor-move.test.ts` had standalone `moveDown/moveUp/moveLeft/moveRight` helpers using the old `push` behavior, plus 8 pre-existing wrong expectations (swap tests expected same order after swap, up tests expected wrong merge target). All 20 tests now pass.

## Button Move UX Fixes (2026-07-04)

Three UX improvements in `buildDynamicMoveKeyboard()` and `refreshButtonEditor()`:

1. **Split first row (⬆️)**: Previously the ⬆️ button was hidden when the selected button was in the first row (`row > 0` guard). Now it's also shown when the row has >1 buttons, allowing splitting the first row. Handler was already correct — the keyboard condition was the only blocker.

2. **Split last row (⬇️)**: Previously the ⬇️ button was hidden when the selected button was in the last row (`row < grid.length - 1` guard). Now it's also shown when the row has >1 buttons, allowing splitting the last row.

3. **Selection preservation (✅)**: `refreshButtonEditor()` was calling `renderScheduledButtonEditor()` without the `selectedPos` argument, causing the ✅ marker to disappear on every move. Now it reads the current selection from state and passes it through, so the selected button stays highlighted after every move direction.

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
- `REDIS_URL` - Falls back to in-memory cache (`node-cache`) if missing
- `WORDPRESS_API_URL` - For AI responses (endpoint: `/wp-json/propchi/v1/message`)
- `WORDPRESS_BOT_API_KEY` - Auth key for WordPress plugin
- `WORDPRESS_SIGNATURE_SECRET` - HMAC signature for WordPress plugin
- `WORDPRESS_API_TIMEOUT_MS` - Timeout for WordPress calls (default 25000)
- `MEMBERSHIP_REQUIRED_CHANNELS` - Comma-separated channel IDs for force-join
- `MEMBERSHIP_CACHE_TTL` - Membership status cache TTL in seconds (default 300)
- `WINNER_CONTACT` - Telegram username for lottery winner contact
- `PORT` - Express API port (default 3000)
- `JWT_EXPIRES_IN` - JWT token expiry (default 7d)
- `CACHE_TTL_SECONDS` - General cache TTL in seconds (default 300)

## Testing

Tests are pure unit tests (no DB/Redis needed). Run with `npm run test`.

Test files: `src/__tests__/*.test.ts` (vitest configured to only include this path).

Note: there is a stray `src/tests/` directory with one file — vitest does NOT pick it up.

## TypeScript Config

Root (`tsconfig.json`):
- Target: ES2020, Module: commonjs
- `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`
- Path alias: `@/*` → `src/*`
- Output: `dist/`

Admin (`admin/tsconfig.json`):
- `strict: true`, module: esnext, moduleResolution: bundler
- Excludes `src/api`, `src/index.ts`, `src/scheduler.ts` (legacy dead files in admin/)
- Lint: `cd admin && npm run lint` (uses `next lint`)

## Gotchas

- `docker-compose.yml` runs PostgreSQL 16 and Redis 7 (ports 5432, 6379). The bot service is NOT in docker-compose — deploy via the Dockerfile which runs `npx prisma db push && node dist/index.js` at container start.
- **No CI/CD workflows in repo**
- Prisma client wrapper is at `src/prisma/client.ts` (singleton with dev query logging); generated client in `node_modules/.prisma/client`
- All user-facing strings are in Persian (Farsi)
- `admin/src/index.ts`, `admin/src/api/`, `admin/src/scheduler.ts` are legacy/dead code — the real admin app is the Next.js frontend. Admin also has legacy bot scripts (`dev:bot`, `build:bot`, `start:bot`) in its package.json.
- Admin panel uses cookie-based auth (`admin_token` + `admin_user` cookies), root API uses JWT Bearer tokens
- Admin panel middleware blocks non-OWNER/SUPER_ADMIN from `/dashboard/settings` and `/dashboard/admin-users`
- Redis is optional — falls back to in-memory cache (`node-cache`) if `REDIS_URL` not set
- `admin/.env` contains `NEXT_PUBLIC_API_URL` pointing to the root API base URL — override for local dev
- Bot middleware lives in `src/bot/middlewares/`, but `membershipGuard` is in `src/middleware/` (separate directory, same Telegraf interface)
- **BigInt serialization**: Any `JSON.stringify` path touching Prisma data MUST use BigInt replacer. Helper: `src/utils/serialize.ts` (`serializeBigInts`)
- **Do NOT refactor command architecture**: The user explicitly rejected `command.repository.ts` creation and `post.service.ts` command method refactoring. Command button bugs are RUNTIME issues, not architectural. Do NOT create new repositories, do NOT redesign command resolution, do NOT change APIs.
- Admin uses shadcn/ui components (Radix UI primitives + Tailwind CSS + class-variance-authority)
