# Agent Instructions

## Project Overview

Telegram bot for prop firm discount codes with lottery, scoring, and referral system. Two codebases in one repo:

- **Root** (`src/`): Main Telegram bot (Telegraf) + Express API (TypeScript, Prisma, BullMQ)
- **Admin** (`admin/`): Next.js 15 admin panel (calls root API via `NEXT_PUBLIC_API_URL` in `admin/.env`)

WordPress plugin directory was removed — but WordPress API env vars remain in `src/config/index.ts:60-65` for AI response routing (no direct Gemini calls).

## Quick Commands

```bash
npm run dev              # ts-node-dev hot-reload
npm run build            # tsc
npm start                # node dist/index.js
npm run test             # vitest run (pure unit, no DB/Redis)
npx vitest run <pattern> # run single test file
npm run db:push          # prisma db push (NOT migration-based)
npm run db:generate      # regenerate Prisma client
npm run db:seed          # seed (admin: admin/admin123)
npm run db:studio        # Prisma Studio
cd admin && npm run dev  # Next.js dev server
cd admin && npm run build
cd admin && npm run lint # next lint — only lint in repo
```

No lint/typecheck at root. Only admin has lint (`next lint`).

**Prisma schema**: `prisma/schema.prisma` (~1460 lines). Uses `prisma db push`, not migration-based workflow. `npx prisma migrate dev` is not part of the standard flow. Admin has no Prisma schema of its own — root `npm run db:push` is the sole schema source. Admin `package.json` has `db:*` scripts but they are dead (no `admin/prisma/` dir).

## Key Docs (read for deep context)

- `ARCHITECTURE.md` — full system architecture, data model, API routes, deployment (note: still references `wordpress-plugin/` which was removed)
- `README.md` — project docs in Farsi, setup guide (also references `wordpress-plugin/` — stale)
- `ADMIN_PANEL_AUDIT.md` — auth flow (two admin entity types: `Admin` for panel, `BotAdmin` for bot), panel page tree, feature toggles
- `CALLBACK_CROSS_CHECK.md` — all callback_data patterns vs handler regex, with dead-pattern history

## Architecture Essentials

Entry: `src/index.ts` → `bootstrap()` starts bot, API, scheduler, workers.

Layer order: `handlers → services → repositories → prisma`

Middleware stack (applied in `src/index.ts` in this order):
1. `loggingMiddleware`
2. `rateLimitMiddleware` (20 req/60s, MUST answerCbQuery on error)
3. `userMiddleware`
4. `registerChatMemberHandlers` (chat_member events, before membership guard)
5. `membershipGuard` (in `src/middleware/`, NOT `src/bot/middlewares/`)
6. `featureToggleMiddleware`
7. `groupAccessMiddleware`

Background workers (`src/workers/`): membership + leaderboard via BullMQ (Redis). Queue defs in `src/queue/`. Started from bootstrap.

One-off scripts: `src/scripts/`, `scripts/` (not auto-run).

Feature toggle keys (from `DEFAULT_FEATURES` in `src/services/settings.service.ts:10`): `lottery`, `referrals`, `force_join`, `auto_replies`, `reports`, `groups`, `leaderboard`, `points`, `posts`, `ticket_system`, `forex_news`.

Debug commands (admin only): `/debug_post_render <id>`, `/debug_compare_post <id>`, `/debug_delivery <id>`.

## Handler Registration Order (CRITICAL)

Registered in `src/index.ts`:
```
callback trace logger (BEFORE all middleware)
→ middleware chain
→ "🔙 بازگشت به پنل ادمین" hears (global, highest priority — clears all automation state)
→ registerHandlers(bot)
→ registerScheduledMessageHandlers(bot)
→ registerAutoReplyHandlers(bot)
→ registerNewsHandlers(bot)
→ registerPostReplyKeyboardHandlers(bot)
→ anonymous message fallback (bot.on('message') — sends anonymous post to private non-admin users with no active state)
→ forum topic discovery handler (bot.on('message') — group/supergroup messages only)
→ bot.catch (global error handler — MUST answerCbQuery)
→ catch-all [UNMATCHED_CALLBACK] (log + answerCbQuery)
```

Inside `registerHandlers()` (`handlers/index.ts`):
```
my_chat_member / new_chat_members
→ bot.start (HARD RESET clears all user state)
→ admin panel handlers
→ menu editor (bot.on('text') consuming rename inputs)
→ dynamic post button routing (intercepts text for published posts)
→ various admin/user handlers
→ lottery
→ points/leaderboard/referral
→ membership check
→ ticket handlers
→ post-handlers (via registerPostHandlers())
```

Implications:
- Dynamic Post Button Routing only skips when `post_mgmt_mode`, `menu:edit_mode`, or `post:editor:{userId}:active` is set
- `bot.on('text')` in post-handlers has 12+ early returns consuming messages without `next()` — any `bot.hears` after it is unreachable
- Anonymous message fallback is OUTSIDE `registerHandlers()` — it's a standalone `bot.on('message')` in `src/index.ts` that runs after all registered handlers. It checks for admin status, 8 distinct cache state keys, and falls back to `postService.getOrCreateAnonymousPost()`
- Three large handler files: `handlers/index.ts` (~2000 lines), `post-handlers.ts` (~3700 lines), `scheduled-message.handlers.ts`

## Callback Rules (Production Bugs)

- **`ctx.reply()` is NOT acceptable fallback for editMessage failures** — fix root cause, never send new message
- **`answerCbQuery()` is REQUIRED for ALL callback error paths**: `bot.catch()`, `rateLimitMiddleware`, catch-all handler. Telegram spinner only dismisses on answerCbQuery.
- **Every keyboard button needs matching `bot.action()` handler**: orphaned callback_data causes infinite spinner with zero logs. Use catch-all `[UNMATCHED_CALLBACK]` log to detect.
- **Cache invalidation required after message delete**: both handler and API route must call `postService.invalidateCache()` after deleting a message.
- **`safeEdit` in `shared.ts`** falls back to `ctx.reply()` on editMessageText failure — fix root cause, not fallback.

## Button Grid Gotchas

`scheduled-message.handlers.ts` and `auto-reply.handlers.ts`: button grids use `normalizeGrid()` (dense `[{id,text},...][]`) before any move/swap — `buttonsToGrid()` can produce sparse arrays that crash on index access. `findButtonInGrid()` locates by DB `id` after normalization shifts positions.

## Two Auto-Reply Systems (CRITICAL)

Bot has TWO separate systems — do NOT confuse them:
- **`KeywordReply`** model (old, empty on production) — legacy, not used
- **`AutoReply`** model (current, active) — uses `AutoReplyBinding`, `AutoReplyKeyword`, `AutoReplyMessage` sub-models

Admin panel MUST query `AutoReply` tables. Querying `KeywordReply` produces zero results on production.

## Key Constraints & Gotchas

- **BigInt serialization**: Prisma BigInt in `JSON.stringify` paths → use `src/utils/serialize.ts:serializeBigInts` or BigInt replacer
- **Do NOT refactor command architecture**: command bugs are runtime issues, not architectural. No new repositories, no command resolution redesign.
- **Admin auth**: cookies (`admin_token` + `admin_user`), root API uses JWT Bearer. Admin stores use `useSyncExternalStore` (auth.store.ts + ui.store.ts), not Zustand (despite zustand in admin/package.json).
- **`isOwnerRole()`** in `src/services/settings.service.ts:24` includes `OWNER`, `SUPER_ADMIN`, **and `ADMIN`** — broader than the `requireOwner` name suggests. Used by both API `requireOwner` middleware and panel route guards.
- **Redis optional**: falls back to `node-cache` in-memory when `REDIS_URL` not set
- **All user-facing strings**: Persian (Farsi)
- **Bot middleware**: `src/bot/middlewares/` except `membershipGuard` in `src/middleware/`
- **Admin dead files**: `admin/src/index.ts`, `admin/src/api/`, `admin/src/scheduler.ts` — legacy, not used by Next.js. Admin `tsconfig.json` explicitly excludes them.
- **Admin legacy bot scripts** in `admin/package.json`: `dev:bot`, `build:bot`, `start:bot` — ignore
- **Admin unused dep**: `zustand` in `admin/package.json` — stores use `useSyncExternalStore`
- **Prisma client**: `src/prisma/client.ts` (singleton with dev query logging); generated in `node_modules/.prisma/client`
- **Docker**: `docker-compose.yml` runs PostgreSQL 16 + Redis 7 only (bot service is commented out — built via Dockerfile at deploy)
- **Dockerfile** uses `CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]` — runs schema push before start
- **No CI/CD, no husky, no prettier, no editorconfig**
- **Tests**: `src/__tests__/` (~22 test files, pure unit — no DB/Redis). Vitest config (`vitest.config.ts`) includes `src/__tests__/**/*.test.ts`. Also has `src/__tests__/__snapshots__/`. Stray dir `src/tests/` (1 file) is NOT picked up by vitest.
- **TypeScript strictness differs**: root `tsconfig.json` has `strict: false` / `noImplicitAny: false`; admin has `strict: true`
- **Path alias**: both root and admin use `@/*` → `src/*`
- **Admin strict excludes**: `admin/tsconfig.json` excludes `src/api/`, `src/index.ts`, `src/scheduler.ts` from compilation
- **Admin tsconfig includes only**: `src/app`, `src/components`, `src/lib`, `src/services`, `src/store`, `src/types`, `src/middleware.ts` — other admin `src/` dirs are not compiled

## News / Forex News Module

Callback prefix: `news:` | Feature toggle: `forex_news`

Files:
- `src/utils/news-date.ts` — pure date logic (Asia/Tehran timezone, Gregorian calendar), no DB/Telegram deps
- `src/services/news.service.ts` — DB CRUD (`NewsCalendarEntry` model)
- `src/services/news-state.service.ts` — admin state cache (`news:` prefix)
- `src/bot/keyboards/news-keyboards.ts` — all inline/reply keyboards for this module
- `src/bot/handlers/news-admin.handlers.ts` — admin flow (calendar, day management, text input)
- `src/bot/handlers/news-user.handlers.ts` — user flow (yesterday/today/tomorrow, stateless)
- `src/bot/handlers/news.handlers.ts` — wrapper: `registerNewsHandlers(bot)`
- `src/__tests__/news-date.test.ts` — unit tests for date logic

Key rules: raw entities only (no parse_mode), always `answerCbQuery`, never fallback to `ctx.reply` on edit failure, validate `isValidDateKey` on all input.

## Env Variables

Required: `BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `JWT_SECRET`, `DATABASE_URL`

Notable optional: `REDIS_URL` (no Redis = in-memory cache), `WORDPRESS_API_URL` + `WORDPRESS_BOT_API_KEY` + `WORDPRESS_SIGNATURE_SECRET` (AI routing), `MEMBERSHIP_REQUIRED_CHANNELS`, `WINNER_CONTACT`, `CACHE_TTL_SECONDS` (default 300), `PORT` (default 3000), `TELEGRAM_MINI_APP_URL` / `FRONTEND_URL` (Mini App profile).

Admin panel env: `admin/.env` has `NEXT_PUBLIC_API_URL` pointing to the root API (e.g. Railway production URL).
