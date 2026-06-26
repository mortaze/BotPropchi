# Graph Report - .  (2026-06-26)

## Corpus Check
- 264 files · ~442,876 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1706 nodes · 3702 edges · 90 communities (74 shown, 16 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 50 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_TypeScript Types & Interfaces|TypeScript Types & Interfaces]]
- [[_COMMUNITY_Post Management System|Post Management System]]
- [[_COMMUNITY_Telegram Post Renderer|Telegram Post Renderer]]
- [[_COMMUNITY_Bot Post Handlers & Editor|Bot Post Handlers & Editor]]
- [[_COMMUNITY_Broadcast Diagnostics UI|Broadcast Diagnostics UI]]
- [[_COMMUNITY_Admin User Management|Admin User Management]]
- [[_COMMUNITY_Message Format System|Message Format System]]
- [[_COMMUNITY_Admin Panel Dependencies|Admin Panel Dependencies]]
- [[_COMMUNITY_Root Project Dependencies|Root Project Dependencies]]
- [[_COMMUNITY_Bot Notifications & Events|Bot Notifications & Events]]
- [[_COMMUNITY_Settings Service|Settings Service]]
- [[_COMMUNITY_Mini App Frontend|Mini App Frontend]]
- [[_COMMUNITY_Scheduler & Attribution|Scheduler & Attribution]]
- [[_COMMUNITY_Mini App & Log Routes|Mini App & Log Routes]]
- [[_COMMUNITY_API Auth Middleware|API Auth Middleware]]
- [[_COMMUNITY_Bot Core Handlers|Bot Core Handlers]]
- [[_COMMUNITY_Bot Keyboards & Shared Utils|Bot Keyboards & Shared Utils]]
- [[_COMMUNITY_Admin Lottery & User Details|Admin Lottery & User Details]]
- [[_COMMUNITY_Discount & Lottery Pages|Discount & Lottery Pages]]
- [[_COMMUNITY_Membership Service|Membership Service]]
- [[_COMMUNITY_TypeScript Configuration|TypeScript Configuration]]
- [[_COMMUNITY_Discount CRUD UI|Discount CRUD UI]]
- [[_COMMUNITY_AI Service (Gemini)|AI Service (Gemini)]]
- [[_COMMUNITY_Analytics Service|Analytics Service]]
- [[_COMMUNITY_Acquisition Analytics|Acquisition Analytics]]
- [[_COMMUNITY_Bot Configuration|Bot Configuration]]
- [[_COMMUNITY_Analytics Routes|Analytics Routes]]
- [[_COMMUNITY_Post Message Tests|Post Message Tests]]
- [[_COMMUNITY_AI Assistant Admin|AI Assistant Admin]]
- [[_COMMUNITY_Admin TypeScript Config|Admin TypeScript Config]]
- [[_COMMUNITY_Analytics Dashboard|Analytics Dashboard]]
- [[_COMMUNITY_Broadcast Repository|Broadcast Repository]]
- [[_COMMUNITY_Broadcast Service|Broadcast Service]]
- [[_COMMUNITY_Admin Dev Dependencies|Admin Dev Dependencies]]
- [[_COMMUNITY_Bot Bootstrap & Toggle|Bot Bootstrap & Toggle]]
- [[_COMMUNITY_Lottery Repository|Lottery Repository]]
- [[_COMMUNITY_Post CRUD UI|Post CRUD UI]]
- [[_COMMUNITY_Message Editor Component|Message Editor Component]]
- [[_COMMUNITY_WordPress DB Layer|WordPress DB Layer]]
- [[_COMMUNITY_Membership Channel Checks|Membership Channel Checks]]
- [[_COMMUNITY_Discount Routes & Settings|Discount Routes & Settings]]
- [[_COMMUNITY_Landing Page|Landing Page]]
- [[_COMMUNITY_System Integrity Routes|System Integrity Routes]]
- [[_COMMUNITY_Inline Keyboard Sessions|Inline Keyboard Sessions]]
- [[_COMMUNITY_Lottery CRUD UI|Lottery CRUD UI]]
- [[_COMMUNITY_Force-Join & Membership Worker|Force-Join & Membership Worker]]
- [[_COMMUNITY_Post Messages Migration|Post Messages Migration]]
- [[_COMMUNITY_Trace & User Event APIs|Trace & User Event APIs]]
- [[_COMMUNITY_WordPress Admin & Security|WordPress Admin & Security]]
- [[_COMMUNITY_Admin Build Scripts|Admin Build Scripts]]
- [[_COMMUNITY_Attribution Analytics|Attribution Analytics]]
- [[_COMMUNITY_Forced Membership Service|Forced Membership Service]]
- [[_COMMUNITY_Dashboard Layout & Header|Dashboard Layout & Header]]
- [[_COMMUNITY_Editor Forms|Editor Forms]]
- [[_COMMUNITY_Post Preview & Grapheme|Post Preview & Grapheme]]
- [[_COMMUNITY_Sidebar Navigation|Sidebar Navigation]]
- [[_COMMUNITY_Forced Membership Core|Forced Membership Core]]
- [[_COMMUNITY_Broadcast Trace Service|Broadcast Trace Service]]
- [[_COMMUNITY_Menu Tests|Menu Tests]]
- [[_COMMUNITY_WordPress Admin Class|WordPress Admin Class]]
- [[_COMMUNITY_Admin API Server|Admin API Server]]
- [[_COMMUNITY_WordPress Engine|WordPress Engine]]
- [[_COMMUNITY_Membership Queue|Membership Queue]]
- [[_COMMUNITY_User Delete Routes|User Delete Routes]]
- [[_COMMUNITY_Cache Utility|Cache Utility]]
- [[_COMMUNITY_WordPress Gemini AI|WordPress Gemini AI]]
- [[_COMMUNITY_Force-Join Service|Force-Join Service]]
- [[_COMMUNITY_WordPress API Client|WordPress API Client]]
- [[_COMMUNITY_Admin Auth Store|Admin Auth Store]]
- [[_COMMUNITY_Prisma Error Handling|Prisma Error Handling]]
- [[_COMMUNITY_Admin Package Config|Admin Package Config]]
- [[_COMMUNITY_Admin Discount Routes|Admin Discount Routes]]
- [[_COMMUNITY_App Layout Root|App Layout Root]]
- [[_COMMUNITY_Lottery Wheel Spinner|Lottery Wheel Spinner]]
- [[_COMMUNITY_Post Messages Scripts|Post Messages Scripts]]
- [[_COMMUNITY_WordPress Activator|WordPress Activator]]
- [[_COMMUNITY_Command Resolution Tests|Command Resolution Tests]]
- [[_COMMUNITY_Admin Auth Routes|Admin Auth Routes]]
- [[_COMMUNITY_Prisma Seed Data|Prisma Seed Data]]
- [[_COMMUNITY_Post Message Checker|Post Message Checker]]
- [[_COMMUNITY_Middleware Config|Middleware Config]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]

## God Nodes (most connected - your core abstractions)
1. `logger` - 74 edges
2. `prisma` - 55 edges
3. `SettingsService` - 55 edges
4. `formatNumber()` - 47 edges
5. `CardContent()` - 46 edges
6. `Card` - 45 edges
7. `EmptyState()` - 36 edges
8. `CardHeader()` - 34 edges
9. `Button()` - 31 edges
10. `getApiError()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `bootstrap()` --calls--> `registerHandlers()`  [INFERRED]
  admin/src/index.ts → src/bot/handlers/index.ts
- `bootstrap()` --calls--> `loggingMiddleware()`  [INFERRED]
  admin/src/index.ts → src/bot/middlewares/index.ts
- `bootstrap()` --calls--> `rateLimitMiddleware()`  [INFERRED]
  admin/src/index.ts → src/bot/middlewares/index.ts
- `bootstrap()` --calls--> `userMiddleware()`  [INFERRED]
  admin/src/index.ts → src/bot/middlewares/index.ts
- `CustomTooltip()` --calls--> `formatNumber()`  [EXTRACTED]
  admin/src/app/dashboard/analytics/acquisition/page.tsx → admin/src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (90 total, 16 thin omitted)

### Community 0 - "TypeScript Types & Interfaces"
Cohesion: 0.02
Nodes (86): AcquisitionResponse, AcquisitionSourceItem, AdminRole, AiApiKeyItem, AiAssistantSettings, AnalyticsDashboard, AttributionEvent, AttributionValidation (+78 more)

### Community 1 - "Post Management System"
Cohesion: 0.06
Nodes (57): sendPostToUser(), postRepository, basePostSchema, postMessageSchema, postRouter, updateSchema, applyTemplateVars(), applyVarsToRow() (+49 more)

### Community 2 - "Telegram Post Renderer"
Cohesion: 0.08
Nodes (37): DeliveryDebugService, RENDERER_TYPE, buildTelegramKeyboard(), buttonToTelegram(), cleanEntities(), cloneJson(), ensureNoSharedRefs(), ENTITY_TYPES (+29 more)

### Community 3 - "Bot Post Handlers & Editor"
Cohesion: 0.06
Nodes (44): adminMainMenu(), clearButtonEditorState(), clearEditorKeyState(), editorKey(), ensureMessagesFormat(), extractButtonsForMessage(), getMessageButtons(), pendingKey() (+36 more)

### Community 4 - "Broadcast Diagnostics UI"
Cohesion: 0.07
Nodes (35): BroadcastDiagnosticsPage(), ERROR_COLORS, ERROR_LABELS, ErrorTooltip(), gregorianToJalali(), isoToJalaliDateTime(), isoToJalaliFull(), DashboardCharts() (+27 more)

### Community 5 - "Admin User Management"
Cohesion: 0.06
Nodes (29): empty, empty, statusLabel, statusVariant, emptyForm, eventOptions, emptyForm, adminUsersApi (+21 more)

### Community 6 - "Message Format System"
Cohesion: 0.12
Nodes (42): deduplicateEntities(), doEntitiesOverlap(), mergeEntities(), normalizeEntities(), recalculateOffsets(), resolveOverlaps(), HtmlTag, parseHtmlContent() (+34 more)

### Community 7 - "Admin Panel Dependencies"
Cohesion: 0.04
Nodes (49): dependencies, axios, bcryptjs, class-variance-authority, clsx, cors, date-fns, @dnd-kit/core (+41 more)

### Community 8 - "Root Project Dependencies"
Cohesion: 0.04
Nodes (44): dependencies, bcrypt, bcryptjs, bullmq, cors, dotenv, express, express-rate-limit (+36 more)

### Community 9 - "Bot Notifications & Events"
Cohesion: 0.10
Nodes (21): userRouter, notifyNewUserFromService(), sendNewUserNotification(), prisma, discountRepository, userRepository, listQuerySchema, meQuerySchema (+13 more)

### Community 11 - "Mini App Frontend"
Cohesion: 0.06
Nodes (23): AppDataResponse, DiscountCode, DiscountsResponse, ForceJoinChannel, getInitDataCandidate(), getLaunchParams(), jsonFetch(), MiniAppFetchError (+15 more)

### Community 12 - "Scheduler & Attribution"
Cohesion: 0.07
Nodes (21): attributionRouter, broadcastRcaRouter, leaderboardRouter, userEventRouter, attributionService, SOURCE_LABELS, broadcastRcaService, ErrorAnalysis (+13 more)

### Community 13 - "Mini App & Log Routes"
Cohesion: 0.09
Nodes (23): miniAppLogRouter, debugLogSchema, discountClickSchema, initDataSchema, miniAppRouter, profileSchema, propFirmParamSchema, MINI_APP_FAILURE_EVENTS (+15 more)

### Community 14 - "API Auth Middleware"
Cohesion: 0.11
Nodes (27): AdminPayload, authMiddleware(), Request, requireFeature(), requireOwner(), adminUserRouter, baseSchema, select (+19 more)

### Community 15 - "Bot Core Handlers"
Cohesion: 0.09
Nodes (25): setBotInstance(), adminReplyOptions(), buildSafeMenuEditorKeyboard(), detectBroadcastType(), finalizeBotBroadcast(), formatDuration(), isForwardedMessage(), mediaGroupBuffers (+17 more)

### Community 16 - "Bot Keyboards & Shared Utils"
Cohesion: 0.15
Nodes (28): safeEdit(), discountCardKeyboard(), buildPostListFromMenuLayout(), isDryRun, main(), needsRepair(), prisma, repairField() (+20 more)

### Community 17 - "Admin Lottery & User Details"
Cohesion: 0.13
Nodes (14): LotteryDetailsPage(), UserDetailsPage(), userLabel(), LeaderboardPage(), safeDateFormat(), WinnerModalProps, WinnerPanelProps, SeasonCard() (+6 more)

### Community 18 - "Discount & Lottery Pages"
Cohesion: 0.11
Nodes (15): ReferralsPage(), referralsApi, SearchAction, SearchColumn, SearchConsoleProps, SearchFetcherParams, SearchFetcherResult, ReferralSettings (+7 more)

### Community 19 - "Membership Service"
Cohesion: 0.12
Nodes (12): ChannelCheckResult, VALID_MEMBER_STATUSES, channelRepository, channelSchema, ADMIN_ROLES, channelService, LEFT_STATUSES, VALID_MEMBER_STATUSES (+4 more)

### Community 20 - "TypeScript Configuration"
Cohesion: 0.08
Nodes (24): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, declarationMap, emitDecoratorMetadata, esModuleInterop, experimentalDecorators (+16 more)

### Community 21 - "Discount CRUD UI"
Cohesion: 0.12
Nodes (13): FormValues, Props, schema, defaults, schema, Values, DiscountPayload, discountsApi (+5 more)

### Community 22 - "AI Service (Gemini)"
Cohesion: 0.13
Nodes (7): AiService, AiServiceError, AiSettings, INJECTION_PATTERNS, normalizeUrls(), sanitizeText(), TOPIC_PATTERNS

### Community 23 - "Analytics Service"
Cohesion: 0.12
Nodes (6): dailyNewUsers(), safeNumber(), SOURCE_LABELS, utcDateRange(), utcDayKey(), RedisClient

### Community 24 - "Acquisition Analytics"
Cohesion: 0.12
Nodes (16): AcquisitionPage(), CustomTooltip(), daysAgoIso(), gregorianToJalali(), isoToJalaliFull(), nowIso(), PERSIAN_MONTHS_FA, PIE_COLORS (+8 more)

### Community 25 - "Bot Configuration"
Cohesion: 0.13
Nodes (14): config, buildQueueOptions(), getQueue(), LeaderboardJobData, LeaderboardJobType, leaderboardQueue, RebuildLeaderboardJobData, botAdminService (+6 more)

### Community 26 - "Analytics Routes"
Cohesion: 0.12
Nodes (11): analyticsRouter, botAdminRouter, schema, keywordReplyRouter, schema, searchRouter, systemLogRouter, analyticsService (+3 more)

### Community 27 - "Post Message Tests"
Cohesion: 0.12
Nodes (14): buildMessageContext(), ContentSegment, ensureMessagesFormat(), extractContentEntitiesForSegment(), extractSnapshotEntitiesForSegment(), MessageRenderContext, msgSnapshotResolver(), PostMessage (+6 more)

### Community 28 - "AI Assistant Admin"
Cohesion: 0.10
Nodes (13): FormKey, INPUT_MAX, LABELS, TEXTAREA_MAX, TEXTAREAS, cn(), aiApi, forceJoinApi (+5 more)

### Community 29 - "Admin TypeScript Config"
Cohesion: 0.10
Nodes (20): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+12 more)

### Community 30 - "Analytics Dashboard"
Cohesion: 0.15
Nodes (15): AnalyticsPage(), daysAgoIso(), downloadCSV(), downloadJSON(), formatJalaliDateInput(), gregorianToJalali(), isoToJalaliFull(), isoToJalaliShortFa() (+7 more)

### Community 31 - "Broadcast Repository"
Cohesion: 0.12
Nodes (13): broadcastRepository, broadcastDiagnosticsRouter, repairBroadcastData(), RepairReport, validateBroadcastRecipients(), broadcastDiagnosticsService, CRITICAL_ERROR_CATEGORIES, ERROR_CATEGORIES (+5 more)

### Community 33 - "Admin Dev Dependencies"
Cohesion: 0.11
Nodes (19): devDependencies, autoprefixer, eslint, eslint-config-next, postcss, prisma, tailwindcss, ts-node (+11 more)

### Community 34 - "Bot Bootstrap & Toggle"
Cohesion: 0.21
Nodes (14): bootstrap(), BOT_TEXT_FEATURES, featureForCallback(), registerHandlers(), registerPostHandlers(), membershipGuard(), featureToggleMiddleware(), groupAccessMiddleware() (+6 more)

### Community 35 - "Lottery Repository"
Cohesion: 0.14
Nodes (8): lotteryRepository, dateField, lotterySchema, numberField, lotteryService, bot, notificationService, Recipient

### Community 36 - "Post CRUD UI"
Cohesion: 0.17
Nodes (10): PostDetailPage(), statusConfig, statusConfig, schema, Values, getApiError(), postsApi, scoringApi (+2 more)

### Community 37 - "Message Editor Component"
Cohesion: 0.15
Nodes (7): doEntitiesCollide(), entityEnd(), MessageEditor(), Props, serializeMessages(), STYLE_BUTTONS, TelegramEntity

### Community 39 - "Membership Channel Checks"
Cohesion: 0.20
Nodes (4): getChannelTitleCacheKey(), getPerChannelCacheKey(), MembershipService, RequiredChannelInfo

### Community 40 - "Discount Routes & Settings"
Cohesion: 0.16
Nodes (9): DEFAULT_FEATURES, MenuEditSession, codeSchema, discountRouter, optionalUrl, eventBus, EventPayloads, Events (+1 more)

### Community 41 - "Landing Page"
Cohesion: 0.14
Nodes (8): advanced, benefits, comparison, fadeUp, features, stagger, testimonials, trustCards

### Community 42 - "System Integrity Routes"
Cohesion: 0.15
Nodes (7): systemIntegrityRouter, DebugReport, HealthIssue, HealthSection, SCHEMA_FIELDS, SystemHealthReport, systemIntegrityService

### Community 43 - "Inline Keyboard Sessions"
Cohesion: 0.35
Nodes (5): chatSessionsKey(), iksManager, InlineKeyboardSession, InlineKeyboardSessionManager, sessionKey()

### Community 44 - "Lottery CRUD UI"
Cohesion: 0.21
Nodes (8): FormValues, LotteryForm(), schema, toLocal(), safeToISOString(), lotteriesApi, LotteryPayload, Lottery

### Community 45 - "Force-Join & Membership Worker"
Cohesion: 0.26
Nodes (10): buildForceJoinKeyboard(), getBot(), handleJobInline(), processChatMemberUpdate(), processCheckMembership(), processVerifyMembership(), setBotInstance(), startBullMQWorker() (+2 more)

### Community 46 - "Post Messages Migration"
Cohesion: 0.23
Nodes (12): ContentSegment, extractButtonsForMessage(), extractEntitiesForSegment(), isDryRun, isRollback, MigrateLog, migratePostMessages(), rollbackMigration() (+4 more)

### Community 47 - "Trace & User Event APIs"
Cohesion: 0.17
Nodes (7): broadcastTraceApi, userEventApi, EVENT_COLORS, EVENT_TYPE_LABELS, gregorianToJalali(), isoToJalaliDateTime(), Card

### Community 48 - "WordPress Admin & Security"
Cohesion: 0.17
Nodes (3): Propchi_Security, Propchi_Settings, WP_REST_Request

### Community 49 - "Admin Build Scripts"
Cohesion: 0.17
Nodes (12): scripts, build, build:bot, db:generate, db:push, db:seed, db:studio, dev (+4 more)

### Community 50 - "Attribution Analytics"
Cohesion: 0.21
Nodes (8): AttributionPage(), EVENT_LABELS, gregorianToJalali(), isoToJalaliDateTime(), isoToJalaliFull(), PERSIAN_MONTHS_FA, SOURCE_LABELS, attributionApi

### Community 51 - "Forced Membership Service"
Cohesion: 0.23
Nodes (3): ForcedMembershipSettingsService, toLegacy(), RequiredChannelsService

### Community 52 - "Dashboard Layout & Header"
Cohesion: 0.25
Nodes (8): DashboardLayout(), Header(), labels, FormValues, LoginPage(), schema, authApi, useAuthStore()

### Community 53 - "Editor Forms"
Cohesion: 0.24
Nodes (8): EditorMessage, parseMessagesJson(), extractMessages(), FormValues, Props, schema, PostPayload, PostItem

### Community 54 - "Post Preview & Grapheme"
Cohesion: 0.42
Nodes (8): formatPostPreview(), getSegmenter(), graphemeCount(), graphemeSafeLength(), graphemeSlice(), graphemeTruncate(), safeSubstring(), validateTelegramLength()

### Community 55 - "Sidebar Navigation"
Cohesion: 0.24
Nodes (6): MenuItem, menuItems, Sidebar(), listeners, UIState, useUIStore()

### Community 56 - "Forced Membership Core"
Cohesion: 0.22
Nodes (8): ForcedMembershipSettingsData, LEGACY_FALLBACKS, DEFAULT_SETTINGS, FALLBACKS, FIELD_TO_TYPE, ForceJoinMessageType, ForceJoinSettingsData, TYPE_TO_FIELD

### Community 57 - "Broadcast Trace Service"
Cohesion: 0.33
Nodes (8): createBroadcastTraceRouter(), batchTraceTest(), BOT_TOKEN_FINGERPRINT, ComparisonReport, liveTestGetChat(), LiveTestResult, liveTestSend(), setBotInstanceForTrace()

### Community 58 - "Menu Tests"
Cohesion: 0.29
Nodes (7): Button, cloneLayout(), Layout, moveDown(), moveUp(), swapLeft(), swapRight()

### Community 60 - "Admin API Server"
Cohesion: 0.22
Nodes (3): metadata, createSchema, lotteryRouter

### Community 61 - "WordPress Engine"
Cohesion: 0.22
Nodes (3): Propchi_Engine, Propchi_REST, WP_REST_Request

### Community 62 - "Membership Queue"
Cohesion: 0.25
Nodes (8): buildQueueOptions(), ChatMemberUpdateJobData, CheckMembershipJobData, getQueue(), MembershipJobData, MembershipJobType, membershipQueue, VerifyMembershipJobData

### Community 63 - "User Delete Routes"
Cohesion: 0.29
Nodes (5): userDeleteRouter, DeletePreview, DeleteResult, PROTECTED_ROLES, userDeleteService

### Community 67 - "WordPress API Client"
Cohesion: 0.29
Nodes (4): TelegramUserData, WordPressApiClient, WordPressApiClientError, WordPressMessageResult

### Community 68 - "Admin Auth Store"
Cohesion: 0.38
Nodes (5): AuthState, emit(), listeners, setState(), AdminUser

### Community 69 - "Prisma Error Handling"
Cohesion: 0.33
Nodes (6): ParsedPrismaError, parsePrismaError(), PRISMA_NOT_FOUND_CODES, PRISMA_TIMEOUT_CODES, PRISMA_UNIQUE_CONSTRAINT_CODES, prismaErrorHandler()

### Community 70 - "Admin Package Config"
Cohesion: 0.33
Nodes (5): description, main, name, private, version

### Community 71 - "Admin Discount Routes"
Cohesion: 0.33
Nodes (3): codeSchema, discountRouter, optionalUrl

### Community 72 - "App Layout Root"
Cohesion: 0.40
Nodes (3): metadata, vazirFont, Providers()

### Community 73 - "Lottery Wheel Spinner"
Cohesion: 0.40
Nodes (4): COLORS, WheelSegment, WheelSpinner(), WheelSpinnerProps

### Community 74 - "Post Messages Scripts"
Cohesion: 0.60
Nodes (4): scopedEntities(), splitLegacyContent(), main(), prisma

## Knowledge Gaps
- **507 isolated node(s):** `extends`, `nextConfig`, `name`, `version`, `private` (+502 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `logger` connect `Scheduler & Attribution` to `Post Management System`, `Telegram Post Renderer`, `Bot Post Handlers & Editor`, `Message Format System`, `Bot Notifications & Events`, `Mini App & Log Routes`, `API Auth Middleware`, `Bot Core Handlers`, `Bot Keyboards & Shared Utils`, `Membership Service`, `Analytics Service`, `Bot Configuration`, `Analytics Routes`, `Broadcast Repository`, `Bot Bootstrap & Toggle`, `Lottery Repository`, `Discount Routes & Settings`, `System Integrity Routes`, `Inline Keyboard Sessions`, `Force-Join & Membership Worker`, `Forced Membership Service`, `Forced Membership Core`, `Broadcast Trace Service`, `Admin API Server`, `Membership Queue`, `User Delete Routes`, `Prisma Error Handling`?**
  _High betweenness centrality (0.434) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Admin Panel Dependencies` to `Admin Package Config`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `@prisma/client` connect `Admin Panel Dependencies` to `Bot Notifications & Events`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `formatNumber()` (e.g. with `BroadcastDetailPage()` and `LotteryDetailsPage()`) actually correct?**
  _`formatNumber()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `extends`, `nextConfig`, `name` to the rest of the system?**
  _507 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `TypeScript Types & Interfaces` be split into smaller, more focused modules?**
  _Cohesion score 0.022988505747126436 - nodes in this community are weakly interconnected._
- **Should `Post Management System` be split into smaller, more focused modules?**
  _Cohesion score 0.055944055944055944 - nodes in this community are weakly interconnected._