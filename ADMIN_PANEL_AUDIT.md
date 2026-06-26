# Admin Panel & Root API - Full Codebase Audit

## 1. AUTHENTICATION ARCHITECTURE

### Two Admin Entity Types

**Panel Admins** (`Admin` model in Prisma):
- File: `prisma/schema.prisma` (line 582)
- Fields: id, username (unique), passwordHash, role (AdminRole), isActive, lastLoginAt, email (unique), firstName, lastName
- Roles: OWNER | SUPER_ADMIN | ADMIN | MODERATOR (line 1080)
- Mapped to table: `admins`

**Bot Admins** (`BotAdmin` model in Prisma):
- Fields: id, telegramId (BigInt unique), username, firstName, lastName, role (BotAdminRole), status (BotAdminStatus)
- Roles: OWNER | SUPER_ADMIN | ADMIN | MODERATOR (line 1047)
- Status: ACTIVE | SUSPENDED (line 1054)
- OWNER auto-created from ADMIN_TELEGRAM_ID env var

### Panel Auth Flow

Step 1 - Login UI: `admin/src/app/login/page.tsx`
  - Username + password form with Zod validation
  - Calls authApi.login() from admin/src/services/api.ts

Step 2 - Backend Login: `src/api/routes/auth.routes.ts` (line 46)
  - POST /api/auth/login validates body, finds admin by username+isActive
  - bcrypt.compare for password check
  - Signs JWT: { adminId, username, role } with config.api.jwtSecret
  - Returns { success, token, admin: { id, firstName, lastName, email, username, role, lastLoginAt } }

Step 3 - Token Persistence: `admin/src/store/auth.store.ts`
  - Custom useSyncExternalStore (not Zustand)
  - Cookies: admin_token (JWT, 7-day), admin_user (JSON, 7-day)
  - Functions: hydrate(), login(token, admin), logout()

Step 4 - Request Interceptor: `admin/src/services/api.ts` (line 25)
  - Axios interceptor reads admin_token cookie, adds Bearer header
  - 401 response interceptor clears cookies, redirects to /login

Step 5 - Route Protection: `admin/src/middleware.ts`
  - Next.js edge middleware on /login and /dashboard/:path*
  - /login: if token exists, redirect to /dashboard
  - /dashboard: if no token, redirect to /login
  - Role check: /dashboard/settings and /dashboard/admin-users restricted to OWNER or SUPER_ADMIN

### Single-Admin Access

NOT single-admin. Multiple panel admins are supported:
- CRUD route: src/api/routes/admin-user.routes.ts
- Management page: admin/src/app/dashboard/admin-users/page.tsx
- Only ONE OWNER can exist (enforced at lines 31, 53)
- OWNER cannot be deleted (line 72)

---

## 2. ROOT API ROUTES (src/api/server.ts)

### Middleware Stack Applied to Express Server:
1. helmet() - security headers
2. CORS - configurable origin
3. express.json() - 2mb limit
4. Request logger middleware
5. Rate limiting: 300 requests / 15 minutes
6. Route-level: authMiddleware + requireFeature()

### Public routes (no auth):
- POST /api/auth/login
- GET /api/auth (test)
- GET /api/auth/me (inline JWT check)
- /api/mini-app/* (Telegram initData auth)
- GET / (status), GET /health

### Protected routes (authMiddleware):
- /api/discounts, /api/lotteries, /api/users
- /api/referrals, /api/scoring, /api/leaderboard
- /api/required-channels, /api/groups, /api/keyword-replies
- /api/bot-admins, /api/analytics, /api/attribution
- /api/broadcast-diagnostics, /api/broadcast-rca, /api/broadcast-trace
- /api/system-integrity, /api/admin/users, /api/user-events
- /api/search, /api/ai, /api/settings
- /api/admin-users (requireOwner), /api/system-logs
- /api/mini-app-logs, /api/posts, /api/menu

### Feature-gated routes:
- lottery, referrals, points, force_join, auto_replies
- reports, groups, posts

### Special (no standard auth middleware):
- /api/admin/membership, /api/admin/force-join

### Auth Middleware Chain: src/api/middlewares/auth.middleware.ts

- authMiddleware: Verifies Bearer JWT, loads admin from DB, attaches req.admin
- requireOwner: Checks isOwnerRole(), returns 403 if not
- requireFeature(key): Checks settingsService.isFeatureEnabled(), returns 503 if disabled

isOwnerRole() from settings.service.ts line 26:
  role === AdminRole.OWNER || role === 'SUPER_ADMIN'

---

## 3. ADMIN PANEL (Next.js 15) - Pages

### Page Structure (App Router):
- / - Landing page
- /login - Login form
- /mini-app - Telegram Mini App (standalone)
- /dashboard - Main dashboard

### Dashboard Pages (30+):
- /dashboard - Overview metrics + charts
- /dashboard/users, /dashboard/users/[id]
- /dashboard/deleted-users, /dashboard/user-journey/[telegramId]
- /dashboard/posts, /dashboard/posts/create, /dashboard/posts/[id]
- /dashboard/menu
- /dashboard/lotteries, create, [id], [id]/execute, edit/[id]
- /dashboard/discounts, create, edit/[id]
- /dashboard/prop-firms
- /dashboard/referrals, /dashboard/seasons, /dashboard/leaderboard
- /dashboard/scoring
- /dashboard/required-channels, /dashboard/force-join, /dashboard/groups
- /dashboard/keyword-replies
- /dashboard/analytics, /dashboard/analytics/acquisition, /dashboard/analytics/heatmap
- /dashboard/broadcast-diagnostics, [id], trace, rca
- /dashboard/system-integrity
- /dashboard/bot-admins, /dashboard/admin-users (OWNER-only)
- /dashboard/settings (OWNER-only)
- /dashboard/system-logs, /dashboard/mini-app-logs, /dashboard/ai-assistant

### Layout:
- Root: admin/src/app/layout.tsx - RTL, Vazir font, dark mode, React Query
- Dashboard: admin/src/app/dashboard/layout.tsx - Sidebar + Header + main

### Navigation (Sidebar): admin/src/components/layout/Sidebar.tsx
- Fixed right sidebar, collapsible mobile drawer
- Hierarchical menu with expandable groups

### Header: admin/src/components/layout/Header.tsx
- Breadcrumb nav, logged-in username, logout button

### UI Library: admin/src/components/ui/index.tsx
- Badge, Skeleton, EmptyState, Pagination
- Card, CardHeader, CardContent
- Button (5 variants), Input, Textarea, Select, Toggle, Modal

### State Management:
- admin/src/store/auth.store.ts - Auth (useSyncExternalStore)
- admin/src/store/ui.store.ts - UI (useSyncExternalStore)
- React Query for server state

---

## 4. LEGACY FILES IN admin/src/

These exist but are NOT used by Next.js:
- admin/src/index.ts - Old bot bootstrap
- admin/src/api/server.ts - Old Express API (subset)
- admin/src/api/routes/auth.routes.ts, discount.routes.ts, lottery.routes.ts, user.routes.ts
- admin/src/scheduler.ts

---

## 5. BOT MIDDLEWARE STACK (src/bot/middlewares/index.ts)

Applied in src/index.ts bootstrap() in order:
1. loggingMiddleware() - logs all messages with timing
2. rateLimitMiddleware(20, 60000) - per-user 20 req/60s
3. userMiddleware() - registers/updates user, tracks events
4. membershipGuard(bot) - checks channel membership
5. featureToggleMiddleware() - blocks disabled features
6. groupAccessMiddleware(bot) - validates group operations

---

## 6. SERVICES (41 files in src/services/)

Key services: user, discount, lottery, referral, scoring, point,
leaderboard, broadcast, channel, group, post, settings, bot-admin,
system-log, mini-app-log, analytics, attribution, ai, membership,
notification, mini-app, user-event, user-delete, system-integrity

---

## 7. REPOSITORIES (6 files in src/repositories/)

user, lottery, discount, post, channel, broadcast

---

## 8. FEATURE TOGGLES

Managed via FeatureToggle Prisma model:
- discount_codes, lottery, referrals, force_join, auto_replies
- reports, groups, leaderboard, points, prop_firms
- prop_firm_check, ai_assistant, posts

Control both bot-side (middleware) and API-side (requireFeature)

---

## 9. CONFIGURATION (src/config/index.ts)

Required: BOT_TOKEN, ADMIN_TELEGRAM_ID, JWT_SECRET, DATABASE_URL
Optional: REDIS_URL, WORDPRESS_API_URL, FRONTEND_URL, MEMBERSHIP_REQUIRED_CHANNELS
JWT expiry: 7 days default
API port: 3000 default
