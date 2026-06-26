# مستند جامع معماری سیستم BotPropchi

## فهرست مطالب

1. [نمای کلی سیستم](#۱-نمای-کلی-سیستم)
2. [معماری سه‌لایه‌ای](#۲-معماری-سه‌لایه‌ای)
3. [نوداهای اصلی (God Nodes)](#۳-نوداهای-اصلی)
4. [ارتباطات غیرمنتظره](#۴-ارتباطات-غیرمنتظره)
5. [ساختار دیتابیس](#۵-ساختار-دیتابیس)
6. [لایه ربات تلگرام](#۶-لایه-ربات-تلگرام)
7. [لایه API و پنل ادمین](#۷-لایه-api-و-پنل-ادمین)
8. [پلاگین وردپرس و هوش مصنوعی](#۸-پلاگین-وردپرس-و-هوش-مصنوعی)
9. [امنیت و کنترل دسترسی](#۹-امنیت-و-کنترل-دسترسی)
10. [نیازمندی‌های استقرار](#۱۰-نیازمندی‌های-استقرار)
11. [ویژگی‌های عملکردی](#۱۱-ویژگی‌های-عملکردی)
12. [پرسش‌های پیشنهادی برای کاوش](#۱۲-پرسش‌های-پیشنهادی)

---

## ۱. نمای کلی سیستم

BotPropchi یک سیستم جامع مدیریت ربات تلگرام برای پراپ فرم‌ها (Prop Firm) است. این سیستم از سه کدپایه جداگانه در یک مخزن تشکیل شده است:

```
BotPropchi/
├── src/                    # ربات اصلی تلگرام + API اکسپرس (TypeScript)
├── admin/                  # پنل ادمین Next.js 15
├── wordpress-plugin/       # پلاگین هوش مصنوعی وردپرس (PHP)
├── prisma/                 # اسکیما و مایگریشن‌های دیتابیس
├── docker-compose.yml      # تنظیمات داکر
└── package.json            # وابستگی‌های پروژه اصلی
```

### نمودار معماری کلی (Mermaid)

```mermaid
graph TB
    subgraph "کاربران"
        TG[کاربر تلگرام]
        WA[کاربر وردپرس/AI]
    end

    subgraph "لایه ربات"
        BOT[Telegraf Bot]
        MW[Middleware Stack]
        HD[Handlers]
        KB[Keyboards]
    end

    subgraph "لایه سرویس‌ها"
        US[User Service]
        DS[Discount Service]
        LS[Lottery Service]
        RS[Referral Service]
        BS[Broadcast Service]
        PS[Post Service]
        SS[Scoring Service]
        AIS[AI Service]
        MS[Membership Service]
    end

    subgraph "لایه API"
        API[Express API Server]
        AUTH[Auth Middleware]
        RBAC[RBAC Guards]
    end

    subgraph "پنل ادمین"
        NEXT[Next.js 15 Admin]
        REDUX[Zustand Store]
        RQ[React Query]
    end

    subgraph "پلاگین وردپرس"
        WP[WordPress Plugin]
        GEM[Gemini AI Engine]
        WPCache[WP Cache Layer]
    end

    subgraph "زیرساخت"
        PG[(PostgreSQL 16)]
        RD[(Redis 7)]
        BM[BullMQ Workers]
    end

    TG --> BOT
    BOT --> MW --> HD --> KB
    HD --> US & DS & LS & RS & BS & PS & SS & AIS & MS
    API --> AUTH --> RBAC
    NEXT --> API
    WA --> WP --> GEM --> WPCache
    US & DS & LS & RS & BS & PS & SS & MS --> PG
    US & DS & LS & RS & BS & PS & SS & MS --> RD
    BM --> RD
    AIS --> WP
```

---

## ۲. معماری سه‌لایه‌ای

### لایه‌بندی پروژه اصلی (`src/`)

```
src/
├── index.ts                    # نقطه شروع - bootstrap()
├── api/
│   ├── server.ts               # سرور Express
│   ├── middlewares/
│   │   └── auth.middleware.ts   # احراز هویت JWT + RBAC
│   └── routes/                 # 30+ مسیر API
├── bot/
│   ├── handlers/index.ts       # 1200+ خط هندلرهای ربات
│   ├── keyboards/              # کیبورد اینلاین و ریپلای
│   ├── middlewares/index.ts     # میانجی‌های ربات
│   ├── shared.ts               # توابع مشترک
│   ├── notifications.ts        # سیستم اعلان‌ها
│   ├── service-toggle.ts       # کلیدهای فعال/غیرفعال سرویس‌ها
│   └── webhooks/               # هندلرهای webhook
├── services/                   # 30+ سرویس تجاری
├── repositories/               # لایه دسترسی به دیتابیس
├── middleware/                  # میانجی‌های سراسری
├── workers/                    # BullMQ workers
├── queue/                      # صف‌های پردازش
├── shared/message-format/      # فرمت‌بندی پیام‌ها
├── utils/                      # ابزارهای کمکی
├── config/                     # تنظیمات محیطی
├── prisma/                     # کلاینت Prisma
├── scheduler.ts                # زمان‌بند اجرای دوره‌ای
├── constants.ts                # ثابت‌های سیستم
└── __tests__/                  # تست‌های واحد
```

### ترتیب اجرای middleware در ربات

```
1. loggingMiddleware()          → لاگ تمام پیام‌ها
2. rateLimitMiddleware(20,60s)  → حداکثر 20 درخواست در دقیقه
3. userMiddleware()             → ثبت/به‌روزرسانی کاربر + ردیابی رویداد
4. registerChatMemberHandlers() → هندلرهای عضویت چت
5. membershipGuard()            → بررسی عضویت اجباری
6. featureToggleMiddleware()    → بررسی فعال بودن سرویس
7. groupAccessMiddleware()      → کنترل دسترسی گروهی
8. registerHandlers()           → ثبت تمام هندلرهای اصلی
```

### ترتیب اجرای middleware در API

```
1. helmet()                     → هدرهای امنیتی HTTP
2. cors()                       → تنظیمات CORS
3. express.json({ limit: 2mb }) → پارسر JSON
4. express.urlencoded()         → پارسر URL-encoded
5. requestLogger                → لاگ درخواست‌ها
6. rateLimit(300/15min)         → حداکثر 300 درخواست در 15 دقیقه
7. authMiddleware               → احراز هویت JWT
8. requireFeature(key)          → بررسی فعال بودن ویژگی
9. requireOwner                 → فقط مالک (برای برخی مسیرها)
```

---

## ۳. نوداهای اصلی (God Nodes)

نوداهایی که بیشترین اتصالات را در سیستم دارند:

| نود | نقش | تعداد اتصالات |
|-----|------|---------------|
| `settingsService` | مدیریت تنظیمات سراسری | بالا - تقریباً همه سرویس‌ها به آن وابسته‌اند |
| `userService` | مدیریت کاربران | بالا - در هر تعامل با ربات استفاده می‌شود |
| `botAdminService` | مدیریت ادمین‌های ربات | بالا - در هر عملیات ادمین |
| `postService` | مدیریت پست‌ها و CMS | بالا - هسته سیستم محتوا |
| `prisma` | کلاینت دیتابیس | بالا - تمام سرویس‌ها به آن وصل‌اند |
| `cache` | کش سراسری (Redis/in-memory) | بالا - برای بهینه‌سازی عملکرد |
| `logger` | سیستم لاگ‌گیری | بالا - در تمام لایه‌ها |

---

## ۴. ارتباطات غیرمنتظره

| ارتباط | توضیح |
|--------|-------|
| `postService` ↔ `settingsService` | پست‌ها به تنظیمات منو وابسته‌اند (عنوان دکمه‌ها از دیتابیس خوانده می‌شود) |
| `membershipGuard` ↔ `requiredChannelsService` | عضویت اجباری مستقیماً سرویس کانال‌ها را فراخوانی می‌کند |
| `wordpressApiClient` ↔ Gemini API | ربات تلگرام به API وردپرس برای پاسخ‌های AI وصل است |
| `broadcastService` ↔ `Telegraf Bot` | سرویس ارسال همگانی مستقیماً نمونه ربات را مصرف می‌کند |
| `leaderboardWorker` ↔ Redis Queue | بازسازی کش لیدربورد در پس‌زمینه انجام می‌شود |
| `membershipWorker` ↔ Redis Queue | پردازش عضویت اجباری در پس‌زمینه |
| `scheduler` ↔ `postService` | زمان‌بند اجرای دوره‌ای پست‌ها را بررسی می‌کند |
| `attributionService` ↔ `userMiddleware` | ردیابی منبع جذب کاربر در میانجی اصلی |

---

## ۵. ساختار دیتابیس

### مدل‌های اصلی (Prisma Schema)

```
┌─────────────────────────────────────────────────────────────┐
│                      مدل‌های اصلی                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User ──────────────── Referral ─────────── User            │
│    │                     │                                  │
│    ├── PointLog          ├── ReferralSettings               │
│    ├── LotteryEntry      └── Season                         │
│    ├── LotteryWinner                                         │
│    ├── ClickLog                                             │
│    ├── UserEvent                                            │
│    └── UserMessageHistory                                   │
│                                                             │
│  PropFirm ─────────── DiscountCode ───────── ClickLog       │
│                                                             │
│  Lottery ──────────── LotteryEntry ───────── User           │
│    │                  LotteryWinner                          │
│    └── WinnerNotification                                   │
│                                                             │
│  Post ─────────────── PostCommand ────────── PostView       │
│    │                                                    │
│    └── PostMessage (multi-message support)              │
│                                                             │
│  Admin (AdminUser) ─── JWT Auth                            │
│                                                             │
│  BotAdmin ──────────── Telegram Bot Panel                  │
│                                                             │
│  RequiredChannel ──── Force Join Channels                  │
│                                                             │
│  TelegramGroup ─────── Group Management                    │
│                                                             │
│  KeywordReply ──────── Auto Replies in Groups              │
│    └── KeywordReplyLog                                      │
│                                                             │
│  Broadcast ─────────── BroadcastLog                        │
│    │                  BroadcastDeliveryLog                  │
│    └── BroadcastDiagnostics                                │
│                                                             │
│  FeatureToggle ─────── Service Toggles                     │
│                                                             │
│  ScoringSettings ───── Points System                       │
│                                                             │
│  Settings ──────────── Key-Value Store                     │
│                                                             │
│  SystemLog ─────────── Audit Trail                         │
│                                                             │
│  MiniAppDebugLog ───── Mini App Debug                      │
│                                                             │
│  AiApiKey ──────────── API Keys for AI                     │
│                                                             │
│  PostMessage ──────── Multi-message Posts                  │
│                                                             │
│  UserAttribution ──── Acquisition Tracking                 │
│                                                             │
│  DeletedUserAudit ─── User Deletion Audit                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### مدل‌های کلیدی و روابط

| مدل | توضیح | روابط کلیدی |
|------|-------|-------------|
| `User` | کاربر تلگرام | ← Referral (referrerId) → User, → PointLog, → LotteryEntry |
| `Admin` | ادمین پنل وب | نقش: OWNER / SUPER_ADMIN / ADMIN |
| `BotAdmin` | ادمین ربات تلگرام | نقش: OWNER / SUPER_ADMIN / ADMIN / MODERATOR |
| `PropFirm` | پراپ فرم | → DiscountCode (1:N) |
| `DiscountCode` | کد تخفیف | → PropFirm (N:1), → ClickLog (1:N) |
| `Lottery` | قرعه‌کشی | → LotteryEntry (1:N), → LotteryWinner (1:N) |
| `Post` | پست CMS | → PostCommand (1:N), → PostView (1:N) |
| `Broadcast` | ارسال همگانی | → BroadcastLog (1:N), → BroadcastDeliveryLog (1:N) |
| `RequiredChannel` | کانال اجباری | وضعیت: PENDING / APPROVED / REJECTED / DISABLED |
| `TelegramGroup` | گروه تلگرام | وضعیت: PENDING / APPROVED / REJECTED / DISABLED |
| `FeatureToggle` | کلید/مقدار فعال/غیرفعال | کلیدهای: lottery, referrals, points, force_join, groups, auto_replies, reports, posts |
| `ScoringSettings` | تنظیمات امتیازدهی | تک‌رکوردی (id=1) |
| `Season` | فصل لیدربورد | → Referral (1:N) |

---

## ۶. لایه ربات تلگرام

### هندلرهای اصلی (`src/bot/handlers/index.ts`)

| هندلر | نوع | توضیح |
|-------|-----|-------|
| `bot.start()` | /start | خوش‌آمدگویی + ثبت کاربر + ارسال منو |
| `hears('👨‍💼 پنل ادمین')` | متن | پنل مدیریت ربات (فقط ادمین) |
| `hears('🎯 کدهای تخفیف')` | متن | لیست پراپ فرم‌ها |
| `hears('🏢 پراپ فرم‌ها')` | متن | لیست پراپ فرم‌ها |
| `hears('🎰 قرعه‌کشی')` | متن | لیست قرعه‌کشی‌های فعال |
| `hears('⭐️ امتیاز من')` | متن | نمایش امتیاز کاربر |
| `hears('🏆 لیدربورد')` | متن | لیدربورد دعوت |
| `hears('👥 دعوت دوستان')` | متن | لینک دعوت + آمار |
| `hears('🤖 هوش مصنوعی')` | متن | فعال‌سازی حالت AI |
| `hears('🔍 جستجو')` | متن | جستجوی کدهای تخفیف |
| `hears('🚀 پروفایل من')` | متن | Mini App پروفایل |
| `hears('📢 پیام همگانی')` | متن | ارسال همگانی (فقط ادمین) |
| `hears('🎛 ویرایش منو')` | متن | ویرایشگر منوی اصلی |
| `hears('📝 پست‌ها')` | متن | مدیریت پست‌ها |
| `hears('📊 گزارشات')` | متن | آمار و گزارشات |
| `hears('⚙️ تنظیمات')` | متن | تنظیمات سیستم |

### هندلرهای اینلاین (Callback Query)

| الگو | توضیح |
|------|-------|
| `propfirm:discounts:{id}` | لیست تخفیف‌های یک پراپ فرم |
| `discount:click:{id}` | ثبت کلیک روی کد تخفیف |
| `lottery:join:{id}` | شرکت در قرعه‌کشی |
| `lottery:history` | تاریخچه قرعه‌کشی‌ها |
| `menu:item:up/down/left/right:{r}:{c}` | جابجایی دکمه‌های منو |
| `menu:item:toggle:{r}:{c}` | فعال/غیرفعال کردن دکمه |
| `menu:item:rename:{r}:{c}` | تغییر نام دکمه |
| `broadcast:confirm/cancel` | تأیید/لغو ارسال همگانی |
| `post:user:view:{id}` | نمایش پست به کاربر |
| `post:user:cmd:{cmd}` | اجرای دستور از دکمه |
| `admin:stats:{userId}` | آمار جامع سیستم |

### سیستم منوی داینامیک

منوی اصلی ربات از دیتابیس خوانده می‌شود (نه کد هاردکد شده):

```
Settings Service
  ├── getMenuLayout()          → خواندن layout از Redis/DB
  ├── getResolvedMenuLayout()  → resolve کردن عنوان پست‌ها
  ├── getEditableLayout()      → layout قابل ویرایش (session)
  ├── getButtonTextMap()       → map عنوان دکمه → ref
  ├── startEditSession()       → شروع جلسه ویرایش
  ├── saveMenuLayout()         → ذخیره تغییرات
  └── cancelEditSession()      → لغو با بازگردانی
```

---

## ۷. لایه API و پنل ادمین

### مسیرهای API (`src/api/server.ts`)

| مسیر | محافظت | توضیح |
|------|--------|-------|
| `/api/auth` | — | ورود/خروج ادمین |
| `/api/mini-app` | — | Mini App تلگرام |
| `/api/discounts` | auth | مدیریت کدهای تخفیف |
| `/api/lotteries` | auth + feature | مدیریت قرعه‌کشی‌ها |
| `/api/users` | auth | مدیریت کاربران |
| `/api/referrals` | auth + feature | مدیریت دعوت‌ها |
| `/api/scoring` | auth + feature | تنظیمات امتیازدهی |
| `/api/leaderboard` | auth | لیدربورد و فصل‌ها |
| `/api/required-channels` | auth + feature | کانال‌های عضویت اجباری |
| `/api/groups` | auth + feature | مدیریت گروه‌ها |
| `/api/keyword-replies` | auth + feature | پاسخ‌های خودکار |
| `/api/bot-admins` | auth | مدیریت ادمین‌های ربات |
| `/api/analytics` | auth + feature | گزارشات و تحلیل‌ها |
| `/api/attribution` | auth + feature | ردیابی منبع جذب |
| `/api/broadcast-diagnostics` | auth + feature | آنالیز پیام همگانی |
| `/api/broadcast-rca` | auth + feature | تحلیل ریشه خطای بROADCAST |
| `/api/broadcast-trace` | auth + feature | ردیابی ارسال |
| `/api/system-integrity` | auth + feature | سلامت سیستم |
| `/api/admin/users` | auth | حذف کاربر |
| `/api/user-events` | auth | رویدادهای کاربر |
| `/api/search` | auth | جستجوی سراسری |
| `/api/ai` | — | هوش مصنوعی |
| `/api/settings` | auth | تنظیمات سیستم |
| `/api/admin-users` | auth + requireOwner | مدیریت ادمین‌های پنل (فقط مالک) |
| `/api/system-logs` | auth | لاگ سیستم |
| `/api/mini-app-logs` | auth | لاگ Mini App |
| `/api/posts` | auth + feature | مدیریت پست‌ها |
| `/api/menu` | auth | مدیریت منو |

### پنل ادمین Next.js 15

ساختار صفحات پنل ادمین:

```
admin/src/app/
├── login/page.tsx                    # صفحه ورود
├── dashboard/
│   ├── page.tsx                      # داشبورد اصلی
│   ├── users/page.tsx                # مدیریت کاربران
│   ├── users/[id]/page.tsx           # جزئیات کاربر
│   ├── deleted-users/page.tsx        # کاربران حذف شده
│   ├── user-journey/[id]/page.tsx    # سفر کاربر
│   ├── posts/page.tsx                # مدیریت پست‌ها
│   ├── posts/create/page.tsx         # ایجاد پست
│   ├── posts/[id]/page.tsx           # جزئیات پست
│   ├── menu/page.tsx                 # ویرایش منو
│   ├── lotteries/page.tsx            # قرعه‌کشی‌ها
│   ├── lotteries/create/page.tsx     # ایجاد قرعه‌کشی
│   ├── discounts/page.tsx            # تخفیف‌ها
│   ├── prop-firms/page.tsx           # پراپ فرم‌ها
│   ├── referrals/page.tsx            # دعوت دوستان
│   ├── seasons/page.tsx              # فصل‌ها
│   ├── leaderboard/page.tsx          # لیدربورد
│   ├── scoring/page.tsx              # تنظیمات امتیازدهی
│   ├── required-channels/page.tsx    # کانال‌های اجباری
│   ├── force-join/page.tsx           # متن‌های عضویت اجباری
│   ├── groups/page.tsx               # مدیریت گروه‌ها
│   ├── keyword-replies/page.tsx      # پاسخ‌های خودکار
│   ├── analytics/page.tsx            # تحلیل کاربران
│   ├── analytics/acquisition/page.tsx # منابع جذب
│   ├── analytics/heatmap/page.tsx    # نقشه حرارتی
│   ├── analytics/attribution/page.tsx # ردیابی
│   ├── settings/page.tsx             # تنظیمات
│   ├── bot-admins/page.tsx           # ادمین‌های ربات
│   ├── admin-users/page.tsx          # ادمین‌های پنل
│   ├── system-integrity/page.tsx     # سلامت سیستم
│   ├── broadcast-diagnostics/page.tsx # آنالیز پیام
│   ├── broadcast-diagnostics/trace/page.tsx  # ردیابی
│   ├── broadcast-diagnostics/rca/page.tsx    # تحلیل ریشه خطا
│   ├── system-logs/page.tsx          # لاگ سیستم
│   ├── mini-app-logs/page.tsx        # لاگ Mini App
│   └── ai-assistant/page.tsx         # دستیار هوش مصنوعی
└── mini-app/page.tsx                 # Mini App پروفایل
```

### فناوری‌های پنل ادمین

| فناوری | نسخه | نقش |
|--------|------|-----|
| Next.js | 15 | فریم‌ورک React |
| React | — | رابط کاربری |
| TypeScript | — | تایپ‌بندی |
| Tailwind CSS | — | استایل‌دهی |
| shadcn/ui | — | کامپوننت‌های UI |
| Zustand | — | مدیریت وضعیت (auth, ui) |
| React Query (TanStack) | — | مدیریت داده سرور |
| sonner | — | نوتیفیکیشن |
| lucide-react | — | آیکون‌ها |

### احراز هویت پنل ادمین

```
┌─────────────────────────────────────────────────┐
│                 فلوی احراز هویت                   │
├─────────────────────────────────────────────────┤
│                                                   │
│  1. کاربر نام کاربری/رمز عبور ارسال می‌کند        │
│  2. API /api/auth/login بررسی می‌کند               │
│  3. توکن JWT صادر می‌شود                          │
│  4. توکن در cookie "admin_token" ذخیره می‌شود     │
│  5. middleware.ts بررسی می‌کند:                    │
│     - /login → اگر توکن داشت → redirect /dashboard│
│     - /dashboard/* → اگر توکن نداشت → redirect /login│
│     - /dashboard/settings → فقط OWNER/SUPER_ADMIN │
│     - /dashboard/admin-users → فقط OWNER/SUPER_ADMIN│
│  6. dashboard/layout.tsx hydration انجام می‌دهد   │
│                                                   │
└─────────────────────────────────────────────────┘
```

---

## ۸. پلاگین وردپرس و هوش مصنوعی

### معماری پلاگین

```
wordpress-plugin/
├── propchi-ai-backend.php          # نقطه ورود پلاگین
├── includes/
│   ├── class-propchi-engine.php    # موتور اصلی AI
│   ├── class-propchi-gemini.php    # اتصال به Gemini API
│   ├── class-propchi-db.php        # مدیریت دیتابیس وردپرس
│   ├── class-propchi-rest.php      # REST API endpoints
│   ├── class-propchi-security.php  # امنیت و اعتبارسنجی
│   ├── class-propchi-settings.php  # تنظیمات پلاگین
│   ├── class-propchi-activator.php # فعال‌سازی پلاگین
│   └── class-propchi-utils.php     # ابزارهای کمکی
└── admin/
    └── class-propchi-admin.php     # صفحه تنظیمات ادمین وردپرس
```

### فلوی پردازش AI

```
کاربر پیام می‌فرستد
    │
    ▼
WordPress REST API دریافت می‌کند
    │
    ▼
Propchi_Engine::handle()
    │
    ├── 1. بررسی دسترسی کاربر
    ├── 2. بررسی کش (cache_get)
    ├── 3. جستجو در دیتابیس وردپرس (find_answer)
    │       └── اگر یافت شد → برگردان پاسخ + cache_set
    └── 4. اگر یافت نشد → Gemini API
            └── Propchi_Gemini::generate()
                └── cache_set + برگردان پاسخ
```

### اتصال ربات به وردپرس

```
src/services/wordpress-api.client.ts
    │
    ▼
WORDPRESS_API_URL (از .env)
    │
    ▼
REST API وردپرس (/wp-json/propchi/v1/chat)
    │
    ▼
Propchi_Engine → Gemini API → پاسخ
```

---

## ۹. امنیت و کنترل دسترسی

### لایه‌های امنیتی

| لایه | مکانیزم | جزئیات |
|------|---------|--------|
| HTTP | Helmet.js | هدرهای امنیتی HTTP |
| API | Rate Limiting | 300 درخواست/15 دقیقه |
| Bot | Rate Limiting | 20 درخواست/دقیقه |
| Auth | JWT | توکن با JWT_SECRET |
| RBAC | نقش‌ها | OWNER > SUPER_ADMIN > ADMIN > MODERATOR |
| Feature | Feature Toggles | غیرفعال کردن سرویس‌ها |
| CORS | Origin Check | توسعه: *, Production: FRONTEND_URL |
| Body | Size Limit | حداکثر 2MB |
| Password | bcrypt | هش رمز عبور |
| API Keys | Per-key | کلیدهای AI با فعال/غیرفعال |

### نقش‌های ادمین پنل وب

| نقش | دسترسی |
|------|--------|
| `OWNER` | همه چیز + مدیریت ادمین‌ها + تنظیمات |
| `SUPER_ADMIN` | تنظیمات + مشاهده ادمین‌ها |
| `ADMIN` | مدیریت محتوا + کاربران |
| `MODERATOR` | فقط مشاهده |

### نقش‌های ادمین ربات تلگرام

| نقش | دسترسی |
|------|--------|
| `OWNER` | همه چیز + ارسال همگانی + مدیریت ادمین‌ها |
| `SUPER_ADMIN` | مدیریت محتوا + گزارشات |
| `ADMIN` | ارسال همگانی + مشاهده |
| `MODERATOR` | فقط مشاهده |

### مسیرهای محافظت‌شده

```typescript
// فقط مالک (API)
/api/admin-users     → requireOwner

// فقط مالک/SuperAdmin (پنل)
/dashboard/settings      → middleware.ts
/dashboard/admin-users   → middleware.ts

// نیاز به فعال بودن ویژگی
/api/lotteries         → requireFeature("lottery")
/api/referrals         → requireFeature("referrals")
/api/scoring           → requireFeature("points")
/api/required-channels → requireFeature("force_join")
/api/groups            → requireFeature("groups")
/api/keyword-replies   → requireFeature("auto_replies")
/api/analytics         → requireFeature("reports")
/api/posts             → requireFeature("posts")
```

---

## ۱۰. نیازمندی‌های استقرار

### متغیرهای محیطی ضروری

```env
# ربات تلگرام
BOT_TOKEN=your_telegram_bot_token

# ادمین
ADMIN_TELEGRAM_ID=123456789

# احراز هویت
JWT_SECRET=your_jwt_secret

# دیتابیس
DATABASE_URL=postgresql://postgres:password@localhost:5432/propbot

# Redis (اختیاری - بدون آن از کش in-memory استفاده می‌شود)
REDIS_URL=redis://localhost:6379

# وردپرس (اختیاری)
WORDPRESS_API_URL=https://your-site.com/wp-json/propchi/v1

# عضویت اجباری (اختیاری)
MEMBERSHIP_REQUIRED_CHANNELS=-1001234567890,-1001234567891
```

### سرویس‌های مورد نیاز

| سرویس | نسخه | پورت | توضیح |
|--------|------|------|-------|
| PostgreSQL | 16 | 5432 | دیتابیس اصلی |
| Redis | 7-alpine | 6379 | کش و صف پردازش |
| Node.js | ES2020+ | — | Runtime |
| TypeScript | — | — | کامپایلر |

### فرمان‌های استقرار

```bash
# نصب وابستگی‌ها
npm install

# ساخت اسکیما دیتابیس
npx prisma db push

# seed کردن داده‌های اولیه
npx ts-node prisma/seed.ts

# کامپایل TypeScript
npm run build

# اجرا
npm start

# یا توسعه با hot reload
npm run dev
```

### Docker Compose

```yaml
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redis_data:/data]
```

---

## ۱۱. ویژگی‌های عملکردی

### سیستم امتیازدهی (Scoring)

```
┌─────────────────────────────────────────────┐
│           سیستم امتیازدهی                     │
├─────────────────────────────────────────────┤
│  شروع: startPoints (پیش‌فرض: 0)              │
│  عضویت کانال: channelJoinPoints              │
│  فعالیت آینده: futureActivityPoints          │
│  فعالیت روزانه: dailyActivityPoints (5)      │
│  کلیک لینک: linkClickPoints (2)              │
│  دعوت دوستان: referralRewardPoints (20)     │
│  تکمیل پروفایل: profileCompletionPoints     │
│                                             │
│  حالت startOnlyMode: فقط /start فعال باشد    │
│  پیام خوش‌آمدگویی: قابل سفارشی‌سازی          │
└─────────────────────────────────────────────┘
```

### سیستم قرعه‌کشی (Lottery)

```
┌─────────────────────────────────────────────┐
│           سیستم قرعه‌کشی                      │
├─────────────────────────────────────────────┤
│  بلیت خریداری شده ← امتیاز صرف شده          │
│  وزن شانس ← تعداد بلیت                       │
│  چرخ قرعه‌کشی ← WheelSpinner                │
│  اعلان برنده ← WinnerNotification           │
│  پیام برنده ← قابل سفارشی‌سازی              │
│  حداقل امتیاز ← minPoints                   │
│  هزینه بلیت ← entryCost                     │
└─────────────────────────────────────────────┘
```

### سیستم ارسال همگانی (Broadcast)

```
┌─────────────────────────────────────────────┐
│         سیستم ارسال همگانی                    │
├─────────────────────────────────────────────┤
│  انواع پیام: TEXT, PHOTO, VIDEO, DOCUMENT,  │
│              VOICE, AUDIO, STICKER,          │
│              ANIMATION, CONTACT, LOCATION,   │
│              POLL, MEDIA_GROUP,              │
│              COPY_MESSAGE, FORWARD_MESSAGE   │
│                                             │
│  وضعیت‌ها: DRAFT → SCHEDULED → QUEUED →     │
│            RUNNING → COMPLETED / FAILED      │
│                                             │
│  روش ارسال: copy (پیش‌فرض) / forward         │
│  بافر Media Group: گروه‌بندی پیام‌های چندرسانه‌ای│
│  آنالیز: BroadcastDiagnostics + RCA         │
└─────────────────────────────────────────────┘
```

### سیستم پست CMS

```
┌─────────────────────────────────────────────┐
│           سیستم پست CMS                      │
├─────────────────────────────────────────────┤
│  وضعیت: DRAFT → PUBLISHED → SCHEDULED →     │
│          ARCHIVED → HIDDEN                   │
│                                             │
│  انواع دکمه: INTERNAL_NAV, URL, COMMAND,   │
│              POPUP, COPY                     │
│                                             │
│  Multi-message: پشتیبانی از پیام‌های چندگانه  │
│  Render Pipeline: Normalizer → Renderer →    │
│                   Telegram API               │
│  منوی داینامیک: پست‌ها به عنوان دکمه منو    │
│  قالب‌بندی: متغیرهای {first_name}, {points}  │
│  آمار: views, clickLogs                      │
└─────────────────────────────────────────────┘
```

### سیستم عضویت اجباری (Force Join)

```
┌─────────────────────────────────────────────┐
│         سیستم عضویت اجباری                    │
├─────────────────────────────────────────────┤
│  ۱. کانال‌های مورد نیاز (RequiredChannel)    │
│  ۲. گروه‌های مورد نیاز (TelegramGroup)       │
│  ۳. بررسی عضویت قبل از هر تعامل              │
│  ۴. پیام‌های قابل سفارشی‌سازی:               │
│     - welcomeMessage                         │
│     - notJoinedMessage                       │
│     - joinButtonText                         │
│     - checkMembershipButtonText              │
│     - successJoinMessage                     │
│     - errorMessage                           │
│  ۵. Worker پس‌زمینه برای بررسی دوره‌ای        │
│  ۶. بررسی وضعیت ربات در کانال                │
└─────────────────────────────────────────────┘
```

### سیستم پاسخ خودکار گروه (Keyword Reply)

```
┌─────────────────────────────────────────────┐
│         سیستم پاسخ خودکار                     │
├─────────────────────────────────────────────┤
│  کلمه کلیدی → پاسخ متنی / عکس / فایل        │
│  وضعیت: فعال/غیرفعال                          │
│  گروه‌های هدف: TelegramGroup با وضعیت APPROVED│
│  ثبت لاگ: KeywordReplyLog                    │
│  Parse Mode: HTML / MARKDOWN                  │
└─────────────────────────────────────────────┘
```

### سیستم Mini App

```
┌─────────────────────────────────────────────┐
│           سیستم Mini App                      │
├─────────────────────────────────────────────┤
│  احراز هویت امن: Telegram initData           │
│  پروفایل کاربر: اطلاعات شخصی                 │
│  تکمیل پروفایل: دریافت شماره تلفن           │
│  Site URL: قابل تنظیم از پنل                 │
│  About Text: متن درباره ما                    │
│  لاگ دیباگ: MiniAppDebugLog                  │
└─────────────────────────────────────────────┘
```

### Workers پس‌زمینه

```
┌─────────────────────────────────────────────┐
│           Workers پس‌زمینه                     │
├─────────────────────────────────────────────┤
│  MembershipWorker:                           │
│    - بررسی عضویت اجباری کاربران              │
│    - Redis Queue → BullMQ                    │
│    - شروع با startMembershipWorker(bot)      │
│                                             │
│  LeaderboardWorker:                          │
│    - بازسازی کش لیدربورد                     │
│    - Redis Queue → BullMQ                    │
│    - شروع با startLeaderboardWorker()        │
│                                             │
│  Scheduler:                                  │
│    - اجرای دوره‌ای تسک‌ها                     │
│    - شروع با startScheduler()               │
│    - پردازش پست‌های زمان‌بندی شده              │
└─────────────────────────────────────────────┘
```

### فرمت پیام (Message Format)

```
src/shared/message-format/
├── types.ts        → انواع داده (MessageContent, ButtonConfig)
├── parser.ts       → پارسر پیام خام
├── normalizer.ts   → نرمال‌سازی فرمت
├── renderer.ts     → رندر برای ارسال
├── serializer.ts   → تبدیل به JSON
├── validator.ts    → اعتبارسنجی
├── telegram.ts     → فرمت‌بندی تلگرام
└── index.ts        → صادرات
```

---

## ۱۲. پرسش‌های پیشنهادی برای کاوش

بر اساس تحلیل گراف دانش، پرسش‌های زیر می‌توانند به درک عمیق‌تر سیستم کمک کنند:

1. **چگونه یک پیام همگانی از لحظه ایجاد تا ارسال به کاربران پردازش می‌شود؟**
   - این پرسش سیستم Broadcast را از API تا Worker و Telegram API ردیابی می‌کند.

2. **چگونه سیستم عضویت اجباری از阻止 کاربر جدید تا فعال‌سازی کامل کار می‌کند؟**
   - این پرسش membershipGuard, requiredChannels, membershipWorker و userMiddleware را متصل می‌کند.

3. **چگونه منوی داینامیک ربات از دیتابیس به کیبورد تلگرام می‌رسد؟**
   - این پرسش settingsService, menu layout, postService و keyboards را متصل می‌کند.

4. **چگونه پاسخ‌های AI از ربات تلگرام به Gemini API و برمی‌گردند؟**
   - این پرسش wordpressApiClient, WordPress Plugin, Gemini API و cache را متصل می‌کند.

5. **چگونه سیستم ردیابی منبع جذب کاربر (Attribution) از اولین تعامل تا گزارش نهایی کار می‌کند؟**
   - این پرسش attributionService, userMiddleware, analytics و heatmap را متصل می‌کند.

---

*این مستند بر اساس تحلیل کامل کد منبع BotPropchi تهیه شده است.*
*آخرین به‌روزرسانی: ژوئن ۲۰۲۶*
