# مشخصات فنی کامل: ماژول «اخبار / اخبار فارکس» — ربات تلگرامی BotPropchi

> این سند برای اجرا توسط یک ایجنت کدنویسی (مثل Claude Code) نوشته شده. تمام مسیرهای فایل، اسم توابع و قراردادها از روی کد واقعی مخزن `mortaze/BotPropchi` (شاخهٔ main) استخراج شده‌اند، نه به‌صورت فرضی.

## ۰. خلاصهٔ مدیریتی

دو قابلیت جدید و کاملاً مستقل از بقیهٔ سیستم ساخته می‌شود:

| بخش | کجا | چه کسی می‌بیند | خلاصه رفتار |
|---|---|---|---|
| **📰 اخبار** | پنل ادمین ربات، کنار **🤖 اتوماسیون** | فقط ادمین‌های فعال ربات | تقویم میلادی inline با ناوبری ماه؛ با زدن روی هر روز، همان پیام ادیت می‌شود و وارد صفحهٔ مدیریت محتوای آن روز می‌شویم (افزودن/ویرایش/حذف متن با پشتیبانی کامل استایل‌های تلگرام) |
| **📰 اخبار فارکس** | منوی اصلی کاربر عادی | همهٔ کاربران (قابل خاموش/روشن‌کردن توسط ادمین) | با زدن دکمه، پیام «امروز» که ادمین تعیین کرده ارسال می‌شود؛ زیر آن سه دکمهٔ دیروز/امروز/فردا با تاریخ دقیق میلادی؛ با زدن هرکدام همان پیام ادیت می‌شود |

هر دو بخش از **یک منبع داده مشترک** تغذیه می‌کنند (یک ردیف در دیتابیس به‌ازای هر تاریخ میلادی) تا محتوایی که ادمین برای یک روز ثبت می‌کند، دقیقاً همان چیزی باشد که کاربر عادی می‌بیند.

**هیچ فایلی در `admin/` (پنل وب Next.js) لمس نمی‌شود.** طبق درخواست صریح شما، کل کار فقط داخل ربات تلگرامی (پوشهٔ `src/`) انجام می‌شود.

---

## ۱. تصمیمات طراحی (مفروضات صریح — قابل تغییر با یک پیام)

چون توضیح شما شفاهی/تایپ‌شده و طبیعتاً چند نقطه با چند تفسیر ممکن داشت، این‌ها تصمیم‌هایی هستند که برای رفع ابهام گرفته شده‌اند. هرکدام را اگر نمی‌پسندید فقط اعلام کنید، تغییرشان مستقل و کم‌هزینه است.

| # | تصمیم | چرا |
|---|---|---|
| ۱ | تقویم و تاریخ‌ها **۱۰۰٪ میلادی** هستند؛ هیچ ردی از تقویم جلالی در این ماژول نیست. | شما صریحاً و چندبار گفتید «میلادی». اخبار فارکس هم استاندارد جهانی‌اش میلادی است. |
| ۲ | «امروز» بر اساس منطقهٔ زمانی **Asia/Tehran** محاسبه می‌شود، نه UTC و نه ساعت سرور. | این تنها قرارداد timezone موجود در کد شماست (`analytics.service.ts` از همین منطقه زمانی برای مرزبندی «روز» استفاده می‌کند). اگر سرور UTC باشد و این را رعایت نکنیم، نزدیک نیمه‌شب یک باگ «تاریخ اشتباه» کلاسیک می‌سازد. |
| ۳ | عدد روز/ماه/سال با **ارقام لاتین** نمایش داده می‌شود (یعنی 19 — نه ۱۹). نام روزها/ماه‌ها فارسی است. | برای دادهٔ مالی/فارکس، وضوح عددی مهم‌تر از یکدستی بصری است؛ این هم دقیقاً سبکی است که کانال‌های فارکس فارسی معمولاً استفاده می‌کنند. |
| ۴ | هفتهٔ تقویم از **شنبه** شروع می‌شود. | هماهنگ با عرف کاربر ایرانی. یک آرایهٔ ثابت است؛ عوض‌کردنش به یکشنبه/دوشنبه یک خط تغییر می‌طلبد. |
| ۵ | هر تاریخ حداکثر **یک متن** با entities تلگرامی دارد. رسانه (عکس/ویدیو)، دکمهٔ inline اختصاصی، و چند-پیامی بودن **در این فاز نیست** — چون در درخواست شما نبود. | جلوگیری از scope creep و کاهش سطح باگ. |
| ۶ | «حذف» و «حذف متن» که در پیام شما دو بار ذکر شد، **یک عملیات واحد** شدند: پاک‌کردن کامل محتوای آن روز (= حذف ردیف از دیتابیس). به این ترتیب هیچ‌وقت حالت گیج‌کنندهٔ «خالیِ حذف‌شده» در برابر «خالیِ هرگز پر نشده» نداریم — هر دو دقیقاً یک حالت‌اند. | سادگی = کمتر باگ. این خودش یکی از تضمین‌های «بدون باگ» شماست. |
| ۷ | پیامی که به کاربر عادی نشان داده می‌شود، **بدون هیچ متن اضافه (wrapper)** است — دقیقاً همان text + entities ذخیره‌شدهٔ ادمین، بدون کم و زیاد. | هم دقیقاً همان چیزی است که خواستید («دقیقا اون پیامی که ادمین... تعیین کرده بود»)، هم به‌طور کامل خطر جابه‌جایی offset entities را حذف می‌کند (یکی از رایج‌ترین منابع باگ در پیام‌های فرمت‌دار تلگرام). |
| ۸ | دکمه‌های «دیروز/امروز/فردا» **همیشه نسبت به تاریخ واقعیِ امروز** محاسبه می‌شوند، نه نسبت به روزی که فعلاً نمایش داده شده. فقط روی دکمهٔ متناظر با روزِ در حال نمایش یک نشانگر (✅) گذاشته می‌شود. | اگر این دکمه‌ها «لغزان» باشند (نسبت به روز نمایشی فعلی جابه‌جا شوند)، بعد از چند تپ برچسب «امروز» دیگر به‌معنای واقعیِ امروز نیست — همان‌جور باگ ظریفی که باید حذفش کنیم. |
| ۹ | تمام صفحات با **ویرایش درجا (`editMessageText`)** کار می‌کنند، نه پیام جدید — دقیقاً همان‌طور که خواستید («پیام در حال ادیت‌شدن باشه»). تنها استثنا: نخستین باری که ادمین یا کاربر دکمهٔ ورودی را می‌زند (چون هنوز پیامی برای ویرایش وجود ندارد). | صراحتاً درخواست شما بود؛ همچنین دقیقاً همان الگویی است که `sched:list:{page}` در کد فعلی استفاده می‌کند. |
| ۱۰ | هیچ‌جا از `parse_mode` مارک‌داون/HTML استفاده نمی‌شود — همه‌جا فقط **entities خام**. | مطابق روش فعلی خود پروژه (`renderMode: 'telegram_entities'` در Post) که دقیقاً برای فرار از باگ‌های Escape کردن مارک‌داون انتخاب شده. |
| ۱۱ | دکمهٔ کاربر عادی («📰 اخبار فارکس») از طریق مکانیزم موجود **`SERVICE_BUTTONS`** اضافه می‌شود (مثل 🎰 قرعه‌کشی) با یک `FeatureToggle` مستقل به‌نام `forex_news`. این Toggle فقط روی کاربر عادی اثر دارد؛ دسترسی مدیریتی ادمین همیشه باز است (دقیقاً مثل الگوی `posts`/`auto_replies`). | یکدست با تنها مکانیزم فعال/غیرفعال‌سازی که پروژه از قبل دارد؛ اختراع یک سیستم موازی جدید ریسک باگ بی‌دلیل است. |
| ۱۲ | مدل دیتابیس کاملاً **جدید و مستقل** است (`NewsCalendarEntry`) — به `Post`/`PostMessage` دست نمی‌خورد. | صراحتاً خواستید بخش جدید مستقل باشد؛ ضمناً مدل `Post` با ۶۰+ فیلد برای این کاربرد بیش‌ازحد سنگین و پرخطر برای دست‌کاری است. |

---

## ۲. نقشهٔ فایل‌ها

### ۲.۱. فایل‌های کاملاً جدید (صفر تداخل با کد فعلی)

```
prisma/schema.prisma                          [+model جدید, بدون تغییر مدل‌های قبلی]
src/utils/news-date.ts                         تقویم میلادی، محاسبهٔ امروز/دیروز/فردا، فرمت‌بندی — منطق خالص، بدون وابستگی به DB/تلگرام
src/services/news.service.ts                    لایهٔ دیتابیس (CRUD بر اساس تاریخ)
src/services/news-state.service.ts              وضعیت هر ادمین (در کدام تاریخ/حالت است) — کپی الگوی scheduled-message-state.service.ts
src/bot/keyboards/news-keyboards.ts             تمام کیبوردهای inline و reply این ماژول
src/bot/handlers/news-admin.handlers.ts         فلوی مدیریتی (تقویم، ویرایش روز)
src/bot/handlers/news-user.handlers.ts          فلوی کاربر عادی (دیروز/امروز/فردا)
src/bot/handlers/news.handlers.ts               فقط export یک registerNewsHandlers(bot) که دو فایل بالا را صدا می‌زند
src/__tests__/news-date.test.ts                 تست واحد منطق تاریخ (بدون DB)
src/__tests__/news-entities.test.ts             تست واحد اعتبارسنجی entities مخصوص این ماژول
```

### ۲.۲. فایل‌های موجود که لمس می‌شوند — **فقط همین‌ها، هیچ فایل دیگری نه**

هر خط دقیقاً مشخص شده در بخش ۹. خلاصه:

| فایل | نوع تغییر |
|---|---|
| `prisma/schema.prisma` | افزودن یک `model` جدید در انتهای فایل |
| `src/bot/keyboards/index.ts` | (الف) یک آیتم به آرایهٔ `SERVICE_BUTTONS` ; (ب) یک خط در `buildBotAdminPanelKeyboard` برای هم‌ردیف‌کردن «📰 اخبار» با «🤖 اتوماسیون» |
| `src/services/settings.service.ts` | یک آیتم به `DEFAULT_FEATURES` |
| `src/bot/service-toggle.ts` | یک کلید به `BOT_TEXT_FEATURES` |
| `src/index.ts` | ثبت `registerNewsHandlers(bot)` + پاک‌سازی state جدید در handler سراسری «🔙 بازگشت به پنل ادمین» که از قبل وجود دارد |

هیچ تغییری در: `Post`/`PostMessage`/هیچ مدل دیگر، `post-handlers.ts`، `scheduled-message.handlers.ts`، `auto-reply.handlers.ts`، پوشهٔ `admin/`، هیچ روت API.

### ۲.۳. چرا این چند لمس اجتناب‌ناپذیر است

خواستهٔ شما «فقط یک بخش جدید، دست به بقیه نزن» با خواستهٔ «هیچ باگی در کل طراحی نباشد» وقتی کنار هم می‌آیند، یک واقعیت فنی این پروژه را روشن می‌کنند: تمام زیرسیستم‌های ادمین (اتوماسیون، پست‌ها، پاسخ خودکار) یک قرارداد مشترک دارند — «هنگام ورود به بخش X، وضعیت بخش‌های Y و Z پاک شود؛ هنگام بازگشت به پنل ادمین، وضعیت X هم پاک شود». اگر ماژول اخبار در این قرارداد سهیم نشود، دقیقاً همان باگی ساخته می‌شود که گفتید نباید باشد: state باقی‌مانده از یک بخش وقتی ادمین بین بخش‌ها جابه‌جا می‌شود. بنابراین این لمس‌ها «تغییر رفتار بخش دیگر» نیستند؛ صرفاً «افزودن یک خط برای معرفی state جدید به سیستم پاک‌سازی مشترک» هستند — دقیقاً هم‌سطح با کاری که خود پروژه برای Auto-Reply و Scheduled-Message انجام داده.

---

## ۳. مدل دیتابیس

به انتهای `prisma/schema.prisma` اضافه شود (بدون تغییر هیچ مدل موجود):

```prisma
// ─── News / Forex News module (fully standalone) ───────────
model NewsCalendarEntry {
  id               Int      @id @default(autoincrement())
  date             DateTime @unique @db.Date   // کلید میلادی خالص روز (بدون بخش زمان) — همیشه از طریق news-date.ts ساخته می‌شود
  text             String                        // هرگز خالی نیست؛ نبودِ محتوا = نبودِ ردیف (نه ردیفِ خالی)
  entities         Json     @default("[]")       // آرایهٔ MessageEntity تلگرام، عیناً از ctx.message.entities
  updatedByAdminId BigInt?                        // telegramId ادمینی که آخرین بار ویرایش کرده (بدون FK، هم‌الگو با Post.updatedBy)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([date])
  @@map("news_calendar_entries")
}
```

نکات پیاده‌سازی:
- طبق قرارداد این پروژه، از **`npm run db:push`** استفاده کنید نه `prisma migrate dev` (پروژه migration-based نیست؛ `AGENTS.md` صراحتاً این را مستند کرده).
- بعد از push، `npm run db:generate` (یا معادلش طبق `package.json`) را اجرا کنید تا Prisma Client تایپ‌های جدید را بشناسد.
- «ردیف وجود دارد» = «آن روز محتوا دارد». هیچ فیلد boolean اضافه‌ای مثل `isDeleted` لازم نیست — دقیقاً طبق تصمیم #۶.

---

## ۴. هستهٔ منطق تاریخ — `src/utils/news-date.ts`

این حساس‌ترین فایل کل ماژول است: تقریباً هر باگ محتمل («تاریخ یک روز جابه‌جا شد»، «شبکهٔ تقویم کج چیده شد») از همین‌جا سرچشمه می‌گیرد. پروژه **هیچ کتابخانهٔ تاریخ (dayjs/date-fns/moment) نصب ندارد** — و لازم هم نیست؛ `Intl.DateTimeFormat` بومی Node.js کاملاً کافی است. **کتابخانهٔ جدید اضافه نشود.**

منطق زیر با تاریخ واقعی (یکشنبه ۱۹ جولای ۲۰۲۶) دستی صحت‌سنجی شده — بدون حدس.

```ts
// src/utils/news-date.ts
// منطق خالص — بدون وابستگی به DB یا Telegraf — کاملاً قابل تست واحد

export const NEWS_TIMEZONE = 'Asia/Tehran';

export const GREGORIAN_MONTHS_FA = [
  'ژانویه', 'فوریه', 'مارس', 'آوریل', 'می', 'ژوئن',
  'جولای', 'آگوست', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر',
];

// اندیس = Date.getUTCDay() → 0=یکشنبه ... 6=شنبه
export const WEEKDAYS_FULL_FA = [
  'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه',
];

// چیدمان تقویم از شنبه شروع می‌شود
export const WEEKDAYS_SHORT_SAT_FIRST = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export type DateKey = string; // فرمت ثابت: 'YYYY-MM-DD'، همیشه ۲ رقمی برای ماه/روز

/** امروز را در منطقهٔ زمانی Asia/Tehran به‌صورت YYYY-MM-DD برمی‌گرداند. هرگز new Date() خام مقایسه نکنید. */
export function getTodayDateKey(referenceDate: Date = new Date()): DateKey {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NEWS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

export function utcDateToKey(dt: Date): DateKey {
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function keyToUtcMidnight(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** اعتبارسنجی دفاعی: رد می‌کند تاریخ‌های ناموجود مثل 2026-02-30 را (نه فقط فرمت رجکس). */
export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(key: DateKey, delta: number): DateKey {
  const dt = keyToUtcMidnight(key);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return utcDateToKey(dt);
}

export function addMonths(key: DateKey, delta: number): DateKey {
  const [y, m] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`; // فرمت YYYY-MM برای پیمایش ماه
}

/** برچسب کوتاه برای متن دکمه: «19 جولای 2026» */
export function formatShort(key: DateKey): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${GREGORIAN_MONTHS_FA[m - 1]} ${y}`;
}

/** برچسب کامل برای متن پیام: «یکشنبه 19 جولای 2026» */
export function formatWithWeekday(key: DateKey): string {
  const weekday = WEEKDAYS_FULL_FA[keyToUtcMidnight(key).getUTCDay()];
  return `${weekday} ${formatShort(key)}`;
}

export interface MonthGridCell { day: number; dateKey: DateKey; }

/**
 * شبکهٔ روزهای یک ماه را برمی‌گرداند — سلول‌های خالی ابتدا/انتهای ماه برای
 * تراز هفت‌ستونه (شنبه تا جمعه) با null پر می‌شوند. طول آرایه همیشه مضرب ۷ است.
 * صحت‌سنجی‌شده دستی برای جولای ۲۰۲۶: ۱ جولای = چهارشنبه → ۴ سلول خالی ابتدایی
 * (ش، ی، د، س) سپس چ=1، پ=2، ج=3 ...؛ و ۱۹ جولای درست روی ستون «ی» (یکشنبه) می‌افتد.
 */
export function getMonthGridCells(year: number, month: number /* 1-12 */): (MonthGridCell | null)[] {
  const firstWeekdayJs = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=یکشنبه..6=شنبه
  const leadingBlanks = (firstWeekdayJs + 1) % 7; // تبدیل به آفست چیدمانِ «شنبه اول»
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (MonthGridCell | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, dateKey: `${year}-${pad2(month)}-${pad2(day)}` });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** { yesterday, today, tomorrow } را به‌صورت DateKey برمی‌گرداند — تنها منبعِ حقیقتِ این سه مقدار در کل ماژول. */
export function getYesterdayTodayTomorrow(referenceDate: Date = new Date()) {
  const today = getTodayDateKey(referenceDate);
  return { yesterday: addDays(today, -1), today, tomorrow: addDays(today, 1) };
}
```

قانون طلایی برای ایجنت: **هیچ‌کجای هندلرها مستقیماً `new Date()` یا محاسبهٔ تاریخ دستی ننویسد.** همیشه از همین توابع استفاده شود. اگر تابعی لازم بود که این‌جا نیست، همین‌جا (در `news-date.ts`) اضافه شود، نه در فایل هندلر.

### تست واحد الزامی (`src/__tests__/news-date.test.ts`)

با الگوی دقیقاً مشابه `scheduled-message.test.ts` (که از `vi.setSystemTime` استفاده می‌کند)، این موارد باید پوشش داده شوند:
- `getTodayDateKey` نزدیک مرز نیمه‌شب Asia/Tehran (مثلاً ساعت `20:31 UTC` که در تهران `00:01` روز بعد است) — این دقیقاً همان جایی است که اگر منطقهٔ زمانی رعایت نشود، باگ «یک‌روز جابه‌جایی» رخ می‌دهد.
- `getMonthGridCells(2026, 7)` → طول ۳۵ (۵ هفته)، ۴ سلول `null` ابتدایی، سلول با `dateKey: '2026-07-19'` دقیقاً در ایندکس ۲۲ (ردیف ۴، ستون ۱).
- `getMonthGridCells(2026, 2)` (اسفند/فوریهٔ کبیسه) و `getMonthGridCells(2027, 2)` (غیرکبیسه) برای اطمینان از تعداد درست روزها.
- `addMonths('2026-12', 1) === '2027-01'` و `addMonths('2026-01', -1) === '2025-12'` (رفتار صحیح در مرز سال).
- `isValidDateKey('2026-02-30') === false` و `isValidDateKey('2026-07-19') === true`.

---

## ۵. لایهٔ سرویس و state

### ۵.۱. `src/services/news.service.ts` (دسترسی به دیتابیس)

امضای توابع لازم (پیاده‌سازی با Prisma Client استاندارد پروژه):

```ts
getEntry(dateKey: DateKey): Promise<NewsCalendarEntry | null>
upsertEntry(dateKey: DateKey, text: string, entities: any[], adminTelegramId: bigint): Promise<NewsCalendarEntry>
clearEntry(dateKey: DateKey): Promise<void>            // deleteMany — idempotent، اگر ردیف نبود خطا نمی‌دهد
getDatesWithContentInMonth(year: number, month: number): Promise<Set<DateKey>>  // یک کوئری برای کل شبکهٔ تقویم (نشانگر 🟢/⚪️)
```

نکات:
- `getDatesWithContentInMonth` باید فقط با یک `findMany({ where: { date: { gte, lte } }, select: { date: true } })` روی بازهٔ اول تا آخر ماه انجام شود — نه یک کوئری به‌ازای هر روز (۳۰ کوئری در رندر هر صفحهٔ تقویم یک ضدالگوی واضح است).
- محدودیت طول متن: قبل از ذخیره، `text.length` باید کمتر از `TELEGRAM_MESSAGE_TEXT_MAX` (۴۰۹۶، از `src/utils/unicode.ts`) باشد. اگر بلندتر بود، **ذخیره نکنید** و کاربر را برای کوتاه‌کردن متن راهنمایی کنید — هرگز متن را بی‌صدا کوتاه نکنید چون offset تمام entities بعد از نقطهٔ برش نامعتبر می‌شود.
- برای اعتبارسنجی/پاک‌سازی entities، از توابع خالص موجود در `src/services/post-message.service.ts` (مثل `validateEntities`/`validateStyleEntities`) استفاده شود — این فقط import خواندنی است، هیچ تغییری در آن فایل داده نمی‌شود. دلیل: منطق هم‌پوشانی/تودرتوی entities تلگرام ظریف و پرخطا است؛ بازسازی از صفر ریسک بی‌دلیل ساختن باگ جدید است، دقیقاً برخلاف خواستهٔ شما.

### ۵.۲. `src/services/news-state.service.ts` (وضعیتِ هر ادمین)

کپی دقیق الگوی `src/services/scheduled-message-state.service.ts` (همان `cache` از `src/utils/cache.ts`، همان الگوی کلید `news:state:{userId}:{field}`). شکل state لازم:

```ts
interface NewsAdminState {
  currentMonth?: string;        // 'YYYY-MM' — کدام ماه از تقویم را می‌بیند
  editingDate?: DateKey;        // کدام روز را باز کرده
  awaitingText?: boolean;       // true بین لحظهٔ زدن «افزودن/ویرایش متن» و ارسال پیام بعدی ادمین
}
```

توابع لازم: `getState(userId)`, `setCurrentMonth(userId, ym)`, `setEditing(userId, dateKey)`, `setAwaitingText(userId, bool)`, `clearAll(userId)`. دقیقاً هم‌الگو با `scheduledMessageState.clearAll` که همین الان در handler سراسری «🔙 بازگشت به پنل ادمین» صدا زده می‌شود (بخش ۹).

> سمت کاربر عادی (دیروز/امروز/فردا) **به هیچ state ای نیاز ندارد** — تاریخ هدف مستقیماً در callback_data کدگذاری می‌شود و پیام مقصد از طریق خودِ callback_query مشخص است. این طراحی عمداً بدون‌حالت (stateless) است تا کلاس کاملی از باگ‌های «حالت قدیمانده» از اصل حذف شود.

---

## ۶. فلوی ادمین — «📰 اخبار» — صفحه‌به‌صفحه

قانون کلی reply-keyboard در کل این فلو: **دست‌نخورده باقی می‌ماند** (همان `buildBotAdminPanelKeyboard()` که از قبل روی صفحه است)، به‌جز حین تایپ متن که موقتاً به `[['❌ لغو']]` سوییچ می‌شود. تمام ناوبری بین تقویم/روز/تأیید حذف با **ویرایش درجا** یک پیام واحد انجام می‌شود.

### ۶.۱. نقطهٔ ورود — دکمهٔ «📰 اخبار» در پنل ادمین

**رفتار handler** (کپی دقیق الگوی `bot.hears('🤖 اتوماسیون', ...)`):
1. `botAdminService.getActive(ctx.from.id)` — اگر ادمین فعال نبود، بی‌صدا رد شو (یا پیام «دسترسی ندارید»).
2. پاک‌سازی هم‌زمان stateهای خواهر: `clearAllPostStates`، `scheduledMessageState.clearAll`، `autoReplyState.clearAll` + `clearBindingScene` — دقیقاً همان‌طور که «🤖 اتوماسیون» این کار را با خواهرانش می‌کند.
3. `newsState.setCurrentMonth(userId, ماهِ جاری واقعی)`.
4. `ctx.reply(متنِ تقویم, کیبورد تقویمِ inline)` — پیام **جدید** (چون هنوز پیامی برای ویرایش نداریم).

**متن پیام:**
```
📰 مدیریت اخبار فارکس

🗓 امروز: یکشنبه 19 جولای 2026

در حال نمایش: جولای 2026

روی هر روز بزنید تا محتوای آن تاریخ را مدیریت کنید.
🟢 = این روز محتوا دارد   ⚪️ = این روز خالی است
```
(بدون entities — متن کاملاً سیستمی است، خطر جابه‌جایی offset صفر است.)

**دکمه‌های reply-keyboard (پایین صفحه):** بدون تغییر — همان `buildBotAdminPanelKeyboard()` قبلی، شامل «🔙 بازگشت به پنل ادمین».

**دکمه‌های inline (شبکهٔ تقویم):**

| ردیف | محتوا | callback_data |
|---|---|---|
| ۱ (سرستون، غیرفعال) | `ش` `ی` `د` `س` `چ` `پ` `ج` | همه `noop` |
| ۲ تا ۶ (شبکهٔ روز، ۷ ستونه) | هر سلول یکی از سه حالت: خالی/محتوادار/امروز — جدول کامل زیر | `news:day:{YYYY-MM-DD}` یا `noop` برای سلول‌های پدینگ |
| ناوبری | `◀️ ماه قبل` `📍 ماه جاری` `ماه بعد ▶️` | `news:cal:{prevYM}` / `news:cal:current` / `news:cal:{nextYM}` |
| بازگشت | `🔙 پنل ادمین` | `news:back:admin` |

**قاعدهٔ دقیق برچسب هر سلول روز** (برای رفع ابهام «ریز» که خواستید):

| وضعیت | برچسب دکمه | مثال |
|---|---|---|
| بدون محتوا، امروز نیست | `⚪️ {روز}` | `⚪️ 3` |
| محتوادار، امروز نیست | `🟢 {روز}` | `🟢 15` |
| بدون محتوا، امروز است | `⚪️[{روز}]` | `⚪️[19]` |
| محتوادار، امروز است | `🟢[{روز}]` | `🟢[19]` |
| سلول پدینگ (قبل روز ۱ یا بعد آخرین روز) | یک فاصله (` `) | — |

سلول‌های پدینگ همیشه از `getMonthGridCells` می‌آیند (بخش ۴) و `callback_data: 'noop'` می‌گیرند — همان هندلر سراسری `bot.action('noop', ...)` که همین الان در `src/bot/handlers/index.ts` وجود دارد آن‌ها را بی‌ضرر می‌کند؛ هندلر جدیدی برای noop لازم نیست.

**دفاع لازم روی `news:cal:{ym}`:** قبل از پردازش، `ym` باید با رجکس `/^\d{4}-(0[1-9]|1[0-2])$/` معتبرسنجی شود؛ در غیر این صورت `answerCbQuery('تاریخ نامعتبر', {show_alert:true})` و توقف — این یک لایهٔ دفاعی است، چون این callback فقط از دکمه‌های خودمان می‌آید، ولی هیچ‌وقت به ورودی callback اعتماد کورکورانه نکنید.

### ۶.۲. صفحهٔ مدیریت یک روز خاص (بعد از زدن یک تاریخ)

با زدن `news:day:{dateKey}`: همان پیام تقویم با `ctx.editMessageText` ادیت می‌شود. **دو حالت متفاوت:**

#### حالت «این روز محتوا دارد»

- **متن پیام:** دقیقاً `entry.text` — بدون هیچ پیشوند/پسوند، با `entities: entry.entities` عیناً همان‌طور که ذخیره شده. (این دقیقاً همان چیزی است که کاربر عادی هم می‌بیند — سازگاری کامل بین دو فلو.)
- **دکمه‌های inline:**

| ردیف | دکمه‌ها | callback_data |
|---|---|---|
| ۱ (سرستون، غیرفعال) | `📅 یکشنبه 19 جولای 2026` | `noop` |
| ۲ | `✏️ ویرایش متن` `🗑 حذف متن` | `news:edit:{dateKey}` / `news:clear:{dateKey}` |
| ۳ | `◀️ بازگشت به تقویم` | `news:cal:{YYYY-MM استخراج‌شده از dateKey}` |
| ۴ | `🔙 پنل ادمین` | `news:back:admin` |

#### حالت «این روز خالی است»

- **متن پیام:** `🈳 برای این تاریخ (یکشنبه 19 جولای 2026) هنوز محتوایی ثبت نشده است.\n\nبرای افزودن محتوا از دکمهٔ زیر استفاده کنید.` (بدون entities)
- **دکمه‌های inline:**

| ردیف | دکمه‌ها | callback_data |
|---|---|---|
| ۱ (سرستون، غیرفعال) | `📅 یکشنبه 19 جولای 2026 — بدون محتوا` | `noop` |
| ۲ | `➕ افزودن متن` | `news:edit:{dateKey}` |
| ۳ | `◀️ بازگشت به تقویم` | `news:cal:{YYYY-MM}` |
| ۴ | `🔙 پنل ادمین` | `news:back:admin` |

> توجه: هم «➕ افزودن متن» و هم «✏️ ویرایش متن» به **یک هندلر واحد** (`news:edit:{dateKey}`) می‌روند — چون از نظر فنی «افزودن» و «ویرایش» دقیقاً همان عملیات‌اند (منتظرِ متن بعدی ماندن، سپس upsert). تفاوت فقط برچسب دکمه بر اساس خالی/پر بودن است. این دقیقاً معادل چهار فعلی است که در پیام اصلی خواستید (افزودن، ویرایش، حذف، حذف متن) — با طراحی تمیزتر که در بخش ۱ تصمیم #۶ توضیح داده شد.

### ۶.۳. حالت دریافت متن جدید (بعد از زدن ✏️/➕)

1. `newsState.setEditing(userId, dateKey)` + `newsState.setAwaitingText(userId, true)`.
2. `ctx.editMessageText('✍️ متن جدید را با هر فرمتی که می‌خواهید (بولد، ایتالیک، لینک، اسپویلر و ...) ارسال کنید.\n\nبرای انصراف، دکمهٔ «❌ لغو» را بزنید.')` — بدون کیبورد inline (یا فقط یک دکمهٔ `news:cancel-edit:{dateKey}` برای انصراف inline هم، جهت هم‌ارزی با دکمهٔ reply-keyboard).
3. **reply-keyboard موقتاً عوض می‌شود** به `Markup.keyboard([['❌ لغو']]).resize()`.
4. `bot.on('text', ...)` اختصاصی این ماژول (ثبت‌شده در `news-admin.handlers.ts`، بعد از `registerHandlers(bot)` در ترتیب ثبت — بند ۸ را ببینید) بررسی می‌کند: اگر `newsState.getState(userId).awaitingText !== true`، فوراً `return next()` (تا هندلرهای بعدی زنجیره اجرا شوند — این همان الگویی است که هر هندلر متنیِ دیگر در این پروژه استفاده می‌کند).
5. اگر `awaitingText === true`: متن (`ctx.message.text`) و entities (`ctx.message.entities`، map‌شده به همان شکل ساده‌ای که در `scheduled-message.handlers.ts` خط ۵۸۰ انجام می‌شود) را می‌گیرد.
6. اعتبارسنجی: طول متن ≤ ۴۰۹۶ کاراکتر (وگرنه: پیام خطا + بمانید در همان حالت منتظر متن، دوباره بفرستد). entities از `validateEntities`/`validateStyleEntities` (import از `post-message.service.ts`) عبور می‌کنند.
7. `newsService.upsertEntry(dateKey, text, entities, BigInt(ctx.from.id))`.
8. `newsState.setAwaitingText(userId, false)` + reply-keyboard برگردد به `buildBotAdminPanelKeyboard()`.
9. همان پیامِ در حال ویرایش (که هنوز message_id اش را از callback قبلی داریم — باید در state هم نگه داشته شود: `messageId` را به `NewsAdminState` اضافه کنید) به حالت «۶.۲ / محتوادار» ادیت شود، تا ادمین بلافاصله نتیجهٔ نهایی را با فرمت واقعی‌اش ببیند.

### ۶.۴. تأیید حذف متن (بعد از زدن 🗑 حذف متن)

با زدن `news:clear:{dateKey}`: همان پیام (بدون تغییر متن اصلی) فقط ردیف دکمه‌های عملیات موقتاً جایگزین می‌شود با:

| دکمه | callback_data |
|---|---|
| `✅ تایید حذف` | `news:clear:confirm:{dateKey}` |
| `❌ انصراف` | `news:clear:cancel:{dateKey}` |

(برچسب‌ها عمداً عیناً با `scheduledMessageDeleteConfirmKeyboard` یکسان‌اند — یکدستیِ زبان طراحی در کل ربات.)

- `news:clear:confirm:{dateKey}` → `newsService.clearEntry(dateKey)` → ادیت به حالت «۶.۲ / خالی».
- `news:clear:cancel:{dateKey}` → صرفاً بازگشت به حالت «۶.۲ / محتوادار» بدون هیچ تغییری در دیتابیس.

### ۶.۵. «🔙 پنل ادمین» (از داخل تقویم یا صفحهٔ روز)

`news:back:admin` → همان منطقی که handler سراسری «🔙 بازگشت به پنل ادمین» انجام می‌دهد (پاک‌سازی newsState + سایر state ها): چون این یک callback است نه پیام متنی، نمی‌توان reply-keyboard را با `editMessageText` عوض کرد؛ پس: (۱) `answerCbQuery()`، (۲) `ctx.editMessageReplyMarkup(undefined)` برای حذف کیبورد inline از پیام تقویم/روز، (۳) `ctx.reply('👨‍💼 پنل ادمین', buildBotAdminPanelKeyboard(...))` پیام جدید با reply-keyboard اصلی. این دقیقاً هم‌ارزی رفتاری با زدن دکمهٔ فیزیکی «🔙 بازگشت به پنل ادمین» را تضمین می‌کند.

---

## ۷. فلوی کاربر عادی — «📰 اخبار فارکس»

بدون هیچ state سمت سرور (بخش ۵.۲). reply-keyboard در کل این فلو **دست‌نخورده** می‌ماند (همان منوی اصلی).

### ۷.۱. نقطهٔ ورود

با زدن «📰 اخبار فارکس» از منوی اصلی (این دکمه از طریق `SERVICE_BUTTONS` تزریق می‌شود — بخش ۹.۱):
1. Middleware عمومی `featureToggleMiddleware` از قبل چک کرده که `forex_news` روشن است (بخش ۹.۳) — هندلر لازم نیست دوباره چک کند، مطابق الگوی `🎰 قرعه‌کشی`.
2. `today = getTodayDateKey()`.
3. `entry = newsService.getEntry(today)`.
4. `ctx.reply(...)` پیام **جدید** (اولین‌بار، چیزی برای ویرایش نیست).

**متن پیام:**
- اگر `entry` وجود دارد: دقیقاً `entry.text` + `entry.entities` — بدون هیچ افزودنی.
- اگر نبود: `🈳 هنوز خبری برای امروز (یکشنبه 19 جولای 2026) ثبت نشده است.\n\nبعداً دوباره سر بزنید یا تاریخ دیگری را بررسی کنید.` (بدون entities)

**دکمه‌های inline — دقیقاً سه دکمه، سه ردیف** (طبق درخواست صریح شما):

| ردیف | برچسب | callback_data |
|---|---|---|
| ۱ | `📅 دیروز — 18 جولای 2026` | `news:user:{yesterday}` |
| ۲ | `✅ امروز — 19 جولای 2026` | `news:user:{today}` |
| ۳ | `📅 فردا — 20 جولای 2026` | `news:user:{tomorrow}` |

سه تاریخ همیشه از `getYesterdayTodayTomorrow()` (بخش ۴) می‌آیند — **هرگز هاردکد نیستند**، دقیقاً طبق تأکید صریح شما. نشانگر ✅ همیشه روی ردیفی می‌رود که متنِ در حال نمایش با آن مطابقت دارد (اول‌بار = امروز).

### ۷.۲. جابه‌جایی بین دیروز/امروز/فردا (ادیت درجا)

با زدن `news:user:{dateKey}`:
1. اعتبارسنجی دفاعی `isValidDateKey(dateKey)` — اگر نامعتبر، `answerCbQuery` با خطا و توقف.
2. `entry = newsService.getEntry(dateKey)` (همیشه از دیتابیس تازه خوانده می‌شود — هیچ کش‌ای نیست، پس اگر ادمین همین الان محتوا را عوض کرده باشد، همین یک تپ آخرین نسخه را نشان می‌دهد).
3. متن پیام = محتوای همان تاریخ یا پیام «خالی» (با جایگزینی تاریخ در متن پیام خالی).
4. کیبورد سه‌ردیفه **از نو محاسبه می‌شود** — نسبت به تاریخ **واقعیِ امروز** (نه نسبت به `dateKey` درخواستی!) — و فقط ردیفِ منطبق با `dateKey` درخواستی، ✅ می‌گیرد.
5. `ctx.editMessageText(متن، { entities, reply_markup: کیبورد })`.
6. اگر تلگرام خطای `message is not modified` برگرداند (یعنی محتوا و کیبورد دقیقاً با نسخهٔ فعلی یکسان بودند — مثلاً دوبار پشت‌سرهم زدن «امروز»): این خطای خاص را بی‌صدا نادیده بگیرید و فقط `answerCbQuery()` کنید؛ هر خطای دیگر باید لاگ/throw شود، نه قورت داده شود.
7. `answerCbQuery()` در همهٔ مسیرها (موفق/خطا) — الزام صریح `AGENTS.md`.

هیچ‌وقت روی خطای ادیت، پیام جدید (`ctx.reply`) به‌عنوان fallback نفرستید — طبق قانون صریح خود پروژه («safeEdit fallback به ctx.reply یعنی علت ریشه‌ای رفع نشده») باید علت را رفع کرد، نه دور زد.

---

## ۸. جدول کامل callback_data (برای افزودن به `CALLBACK_CROSS_CHECK.md`)

| الگوی callback_data | رجکس هندلر | فایل | توضیح |
|---|---|---|---|
| `news:cal:{YYYY-MM}` | `/^news:cal:(\d{4}-\d{2})$/` | news-admin.handlers.ts | نمایش تقویم یک ماه خاص |
| `news:cal:current` | دقیق (exact) `'news:cal:current'` | news-admin.handlers.ts | پرش به ماه جاری |
| `news:day:{YYYY-MM-DD}` | `/^news:day:(\d{4}-\d{2}-\d{2})$/` | news-admin.handlers.ts | باز کردن صفحهٔ مدیریت یک روز |
| `news:edit:{YYYY-MM-DD}` | `/^news:edit:(\d{4}-\d{2}-\d{2})$/` | news-admin.handlers.ts | ورود به حالت دریافت متن (افزودن یا ویرایش) |
| `news:clear:{YYYY-MM-DD}` | `/^news:clear:(\d{4}-\d{2}-\d{2})$/` | news-admin.handlers.ts | نمایش تأییدیهٔ حذف |
| `news:clear:confirm:{YYYY-MM-DD}` | `/^news:clear:confirm:(\d{4}-\d{2}-\d{2})$/` | news-admin.handlers.ts | اجرای واقعی حذف (ثبت‌شده **قبل از** الگوی عمومی‌تر بالا) |
| `news:clear:cancel:{YYYY-MM-DD}` | `/^news:clear:cancel:(\d{4}-\d{2}-\d{2})$/` | news-admin.handlers.ts | انصراف از حذف |
| `news:back:admin` | دقیق | news-admin.handlers.ts | خروج به پنل ادمین |
| `news:user:{YYYY-MM-DD}` | `/^news:user:(\d{4}-\d{2}-\d{2})$/` | news-user.handlers.ts | جابه‌جایی دیروز/امروز/فردا برای کاربر عادی |
| `noop` | دقیق (از قبل موجود) | handlers/index.ts (بدون تغییر) | سلول‌های غیرفعال/پدینگ شبکهٔ تقویم |

طول همهٔ الگوها به‌طور قابل‌توجهی زیر سقف ۶۴ بایت تلگرام است (طولانی‌ترین: `news:clear:confirm:2026-07-19` = ۳۰ کاراکتر).

**ترتیب ثبت در کد الزامی است:** الگوهای `news:clear:confirm:...` و `news:clear:cancel:...` باید **قبل از** الگوی عمومی‌تر `news:clear:...` ثبت شوند (اگرچه به‌خاطر لنگرگذاری `$` در رجکس، این‌ها اصلاً تصادفی هم‌پوشانی ندارند — ولی رعایت این ترتیب یک عادت دفاعیِ خوانا است).

---

## ۹. لمس‌های دقیق روی فایل‌های موجود (فقط همین ۵ فایل، خط‌به‌خط)

### ۹.۱. `src/bot/keyboards/index.ts`

**تغییر الف — افزودن به `SERVICE_BUTTONS`:**
عنصر جدید با همان shape عناصر موجود (`🎰 قرعه‌کشی` و بقیه) اضافه شود:
```ts
{ id: 'forex_news', text: '📰 اخبار فارکس', featureKey: 'forex_news' }
```
این باعث می‌شود `injectServiceButtons` و `buildMainMenuKeyboard` به‌صورت خودکار این دکمه را — فقط اگر `forex_news` روشن باشد و از قبل در چیدمان سفارشی نیامده باشد — به‌عنوان یک ردیف کامل در انتهای منوی اصلی اضافه کنند. دقیقاً همان مکانیزم لاتاری/دعوت‌دوستان/تیکت، بدون نیاز به منطق جدید.

**تغییر ب — هم‌ردیف‌کردن با اتوماسیون داخل `buildBotAdminPanelKeyboard`:**
خط موجود:
```ts
rows.push(['🤖 اتوماسیون']);
```
جایگزین شود با:
```ts
rows.push(['🤖 اتوماسیون', '📰 اخبار']);
```
(دقیقاً یک خط؛ هیچ منطق دیگری در این تابع تغییر نمی‌کند.)

### ۹.۲. `src/services/settings.service.ts`

یک عنصر به آرایهٔ `DEFAULT_FEATURES` اضافه شود، هم‌شکل با عناصر موجود:
```ts
{ key: 'forex_news', label: 'اخبار فارکس', enabled: true }
```
(نام دقیق فیلدها را با shape واقعی که در فایل واقعی می‌بینید تطبیق دهید — الگو را از نزدیک‌ترین عنصر موجود، مثلاً `posts` یا `auto_replies`، کپی کنید.)

### ۹.۳. `src/bot/service-toggle.ts`

یک کلید به `BOT_TEXT_FEATURES` اضافه شود:
```ts
'📰 اخبار فارکس': 'forex_news',
```
این تنها راهی است که `featureToggleMiddleware` جلوی اجرای هندلر کاربر عادی را می‌گیرد وقتی ادمین این قابلیت را خاموش کرده — بدون این خط، خاموش‌کردن از پنل تنظیمات فقط دکمه را از منو پنهان می‌کند ولی اگر کسی متن دکمه را دستی بفرستد باز هم اجرا می‌شود؛ این دقیقاً یک باگ امنیتی/رفتاری کوچک است که با یک خط رفع می‌شود.

(بخش ادمین — «📰 اخبار» — عمداً به این Toggle وصل **نیست**؛ مثل «🤖 اتوماسیون»، دسترسی مدیریتی صرفاً با `botAdminService.getActive` کنترل می‌شود، نه Feature Toggle. این هم‌راستا با تصمیم #۱۱ در بخش ۱ است.)

### ۹.۴. `src/index.ts`

**تغییر الف** — کنار دو فراخوانی موجود:
```ts
registerScheduledMessageHandlers(bot);
registerAutoReplyHandlers(bot);
```
این خط اضافه شود:
```ts
registerNewsHandlers(bot);
```
به همراه import متناظر در بالای فایل. **ترتیب مهم است:** باید بعد از `registerHandlers(bot)` باشد (همان دلیلی که باعث می‌شود `scheduled-message`/`auto-reply` هم بعد از آن ثبت شوند — بخش ۱۱.۱ را ببینید).

**تغییر ب** — داخل handler سراسری موجود `bot.hears('🔙 بازگشت به پنل ادمین', ...)` که همین الان `scheduledMessageState.clearAll(...)` و `autoReplyState.clearAll(...)` را صدا می‌زند، این خط هم اضافه شود:
```ts
newsState.clearAll(ctx.from.id);
```
(به همراه import). این همان قرارداد مشترک پاک‌سازی state است که در بخش ۲.۳ توضیح داده شد — بدون این خط، اگر ادمین وسط ویرایش متن یک روز باشد و فیزیکی «🔙 بازگشت به پنل ادمین» را بزند، `awaitingText` روشن می‌ماند و اولین پیام بعدی‌اش (که ربطی به اخبار ندارد) به‌اشتباه به‌عنوان محتوای آن روز ذخیره می‌شود — دقیقاً یک نمونهٔ واقعی از باگی که گفتید نباید وجود داشته باشد.

هیچ خط دیگری در `src/index.ts` تغییر نمی‌کند.

---

## ۱۰. چک‌لیست حیاتی ضدباگ (باید همه، بدون استثنا، رعایت شوند)

| # | قانون | چرا مهم است |
|---|---|---|
| ۱ | هرگز `parse_mode` مارک‌داون/HTML استفاده نشود؛ فقط `entities` خام. | فرار کامل از باگ‌های Escape-کردن که در تلگرام بسیار رایج‌اند. |
| ۲ | همیشه `answerCbQuery()` در انتهای هر `bot.action`، حتی مسیرهای خطا. | بدون آن، دکمه در کلاینت تلگرام برای چند ثانیه در حالت لودینگ گیر می‌کند. |
| ۳ | قبل از هر `editMessageText`، احتمال خطای `message is not modified` را با try/catch مدیریت کنید و فقط همین خطای خاص را بی‌صدا نادیده بگیرید. | تپ دوبارهٔ یک دکمه یا برگشت به محتوای یکسان، بدون این محافظت یک خطای ۴۰۰ کنترل‌نشده می‌سازد. |
| ۴ | هرگز روی شکست `editMessageText` به `ctx.reply()` سقوط نکنید. | قانون صریح خود پروژه (`AGENTS.md`) — علت ریشه‌ای را رفع کنید، دور نزنید. |
| ۵ | `bot.on('text')` این ماژول باید اول از همه چک کند `awaitingText === true` است یا نه؛ اگر نه، فوراً `return next()`. | بدون این، این هندلر پیام‌های متنیِ بی‌ربط به کل ربات (که به هندلرهای بعدی نیاز دارند) را می‌بلعد. |
| ۶ | هرگز مستقیم `new Date()` برای «امروز» در منطق تجاری استفاده نشود — همیشه `getTodayDateKey()` از `news-date.ts`. | تنها راه تضمین ثبات با منطقهٔ زمانی Asia/Tehran؛ وگرنه نزدیک نیمه‌شب یک‌روز جابه‌جا می‌شود. |
| ۷ | طول متن ورودی ادمین قبل از ذخیره با `TELEGRAM_MESSAGE_TEXT_MAX` (۴۰۹۶) چک شود؛ هرگز بی‌صدا truncate نشود. | truncate کورکورانه باعث نامعتبرشدن offset entities بعد از نقطهٔ برش می‌شود. |
| ۸ | هیچ callback_data ورودی بدون رجکس/`isValidDateKey` مصرف نشود. | یک لایهٔ دفاعی ارزان در برابر callback_data دستکاری‌شده یا نسخه‌های قدیمی کیبورد. |
| ۹ | تمام سلول‌های پدینگ/غیرفعال شبکهٔ تقویم `callback_data: 'noop'` بگیرند، هرگز رشتهٔ دلخواه بدون هندلر. | `AGENTS.md` صراحتاً «callback_data یتیم = اسپینر بی‌نهایت بدون هیچ لاگ» را به‌عنوان یک الگوی باگ واقعیِ قبلی این پروژه ثبت کرده. |
| ۱۰ | State جدید (`newsState`) در نقطهٔ پاک‌سازی سراسری موجود (`🔙 بازگشت به پنل ادمین`) ثبت شود. | جلوگیری از نشتِ state بین بخش‌ها — دقیقاً بند ۹.۴-ب. |
| ۱۱ | `registerNewsHandlers(bot)` باید بعد از `registerHandlers(bot)` در `src/index.ts` فراخوانی شود. | ترتیب ثبت میان‌افزارهای `bot.on('text')` در Telegraf مستقیماً رفتار را تعیین می‌کند؛ این پروژه دقیقاً همین قاعده را برای Scheduled-Message/Auto-Reply رعایت کرده. |
| ۱۲ | کتابخانهٔ تاریخ جدیدی (dayjs/moment/date-fns) اضافه نشود. | پروژه از قبل هیچ‌کدام ندارد؛ `Intl.DateTimeFormat` بومی کافی است؛ افزودن وابستگی جدید بی‌دلیل ریسک را بالا می‌برد. |

---

## ۱۱. لوپ اجرایی برای ایجنت

### ۱۱.۱. نحوهٔ استفاده

این سند را به‌طور کامل به ایجنت کدنویسی (مثلاً Claude Code) بدهید، سپس **مرحله‌به‌مرحله** پرامپت‌های زیر را به‌ترتیب اجرا کنید — نه همه را یک‌جا. بعد از هر مرحله، «معیار پذیرش» همان مرحله را با ایجنت (یا خودتان) تأیید کنید و فقط بعد از تأیید به مرحلهٔ بعد بروید. ترتیب مراحل عمداً بر اساس وابستگی‌هاست (هر مرحله روی مرحلهٔ قبلی سوار می‌شود) — جابه‌جاکردن ترتیب توصیه نمی‌شود.

هر پرامپت را همراه با این جمله شروع کنید تا ایجنت context کامل داشته باشد:

> «سند مشخصات فنی «ماژول اخبار / اخبار فارکس» که پیوست شده را به‌طور کامل بخوان و به‌عنوان مرجع اصلی در نظر بگیر. اگر بین این سند و وضعیت فعلی کد تناقضی دیدی (مثلاً فایل/تابعی که سند به آن اشاره کرده دیگر وجود ندارد یا شکلش عوض شده)، **متوقف شو و آن را گزارش بده**، به‌جای این‌که بی‌صدا چیز دیگری فرض کنی.»

---

### مرحلهٔ ۰ — شناسایی و صحت‌سنجی (فقط خواندن، صفر تغییر)

```
مخزن را کلون/باز کن و این فایل‌ها را دقیقاً بررسی کن تا مطمئن شوی مسیرها و توابعی که سند ازشان نام برده هنوز
با همین شکل وجود دارند:
- src/bot/keyboards/index.ts (تابع buildBotAdminPanelKeyboard و آرایهٔ SERVICE_BUTTONS)
- src/bot/handlers/scheduled-message.handlers.ts (handler «🤖 اتوماسیون» و الگوی entities در خط نزدیک به ۵۸۰)
- src/services/scheduled-message-state.service.ts (کل فایل، به‌عنوان الگوی news-state.service.ts)
- src/services/post-message.service.ts (توابع validateEntities/validateStyleEntities)
- src/bot/service-toggle.ts
- src/services/settings.service.ts (آرایهٔ DEFAULT_FEATURES)
- src/index.ts (ترتیب فراخوانی registerHandlers/registerScheduledMessageHandlers/registerAutoReplyHandlers،
  و handler سراسری bot.hears('🔙 بازگشت به پنل ادمین', ...))
- prisma/schema.prisma (انتهای فایل، برای افزودن مدل جدید)

اگر همه چیز مطابق سند بود، فقط بنویس «تأیید شد، آماده برای مرحلهٔ ۱». اگر مغایرتی دیدی، دقیقاً همان مغایرت
را با مسیر فایل و شماره خط گزارش بده و منتظر تصمیم من بمان. در این مرحله هیچ فایلی ایجاد/ویرایش نکن.
```

**معیار پذیرش:** پیام تأیید یا فهرست دقیق مغایرت‌ها — بدون هیچ diff کد.

---

### مرحلهٔ ۱ — مدل دیتابیس

```
طبق بخش ۳ سند، مدل NewsCalendarEntry را دقیقاً همان‌طور که آمده به انتهای prisma/schema.prisma اضافه کن.
هیچ مدل دیگری را تغییر نده. سپس:
1. npm run db:push  (نه prisma migrate dev — این پروژه migration-based نیست)
2. دستور generate پرایسما را طبق package.json اجرا کن
3. با `npx prisma studio` یا یک کوئری ساده تأیید کن جدول news_calendar_entries ساخته شده
گزارش بده: خروجی کامل هر دو دستور + تأیید ساخت جدول.
```

**معیار پذیرش:** `db push` بدون خطا؛ جدول `news_calendar_entries` با ستون‌های `id, date, text, entities, updatedByAdminId, createdAt, updatedAt` در دیتابیس موجود است؛ `git diff` فقط شامل افزودن (نه حذف/تغییر خط موجود) در `schema.prisma` است.

---

### مرحلهٔ ۲ — هستهٔ منطق تاریخ (بدون DB، بدون تلگرام)

```
طبق بخش ۴ سند، فایل src/utils/news-date.ts را دقیقاً با همان کدی که در سند آمده بساز (کد آماده و
صحت‌سنجی‌شدهٔ داخل سند را عیناً کپی کن، حدس نزن). سپس src/__tests__/news-date.test.ts را طبق موارد
فهرست‌شده در انتهای بخش ۴ بنویس (با الگوی vi.setSystemTime دقیقاً مثل src/__tests__/scheduled-message.test.ts).
اجرا کن: npx vitest run news-date
همهٔ تست‌ها باید سبز شوند. اگر تستی قرمز شد، قبل از ادامه آن را دیباگ و رفع کن — به مرحلهٔ بعد نرو.
```

**معیار پذیرش:** `npx vitest run news-date` صد‌درصد سبز؛ به‌خصوص تست مرز نیمه‌شب Asia/Tehran و تست شبکهٔ جولای ۲۰۲۶ (ایندکس ۲۲ برای ۱۹ جولای) باید صریحاً وجود داشته باشند و پاس شوند.

---

### مرحلهٔ ۳ — لایهٔ دیتابیس

```
طبق بخش ۵.۱ سند، src/services/news.service.ts را با چهار تابع مشخص‌شده (getEntry, upsertEntry,
clearEntry, getDatesWithContentInMonth) بساز. برای اعتبارسنجی entities از import خواندنی
validateEntities/validateStyleEntities از src/services/post-message.service.ts استفاده کن — آن فایل
را ویرایش نکن. برای محدودیت طول متن از TELEGRAM_MESSAGE_TEXT_MAX در src/utils/unicode.ts استفاده کن.
مطمئن شو getDatesWithContentInMonth دقیقاً یک کوئری findMany روی بازهٔ تاریخ ماه اجرا می‌کند، نه یک
کوئری به‌ازای هر روز.
```

**معیار پذیرش:** `npx tsc --noEmit` بدون خطای جدید؛ بازبینی دستی کد نشان دهد فقط یک کوئری در `getDatesWithContentInMonth` است؛ هیچ فایلی خارج از `news.service.ts` ویرایش نشده.

---

### مرحلهٔ ۴ — وضعیت هر ادمین

```
طبق بخش ۵.۲ سند، src/services/news-state.service.ts را بساز — کپی دقیق الگوی
src/services/scheduled-message-state.service.ts (همان cache از src/utils/cache.ts) با شکل state
مشخص‌شده در سند (currentMonth, editingDate, awaitingText, و messageId که در بخش ۶.۳ اشاره شد).
توابع لازم: getState, setCurrentMonth, setEditing, setAwaitingText, setMessageId, clearAll.
```

**معیار پذیرش:** امضای توابع دقیقاً مطابق سند؛ `clearAll` تمام کلیدهای این ماژول را برای آن userId پاک می‌کند؛ هیچ فایل دیگری لمس نشده.

---

### مرحلهٔ ۵ — کیبوردها

```
طبق بخش‌های ۶ و ۷ سند، src/bot/keyboards/news-keyboards.ts را بساز، شامل:
- کیبورد سرستون تقویم (ش ی د س چ پ ج)
- تابعی که getMonthGridCells را می‌گیرد و شبکهٔ ۷ستونهٔ inline با برچسب‌های دقیق جدول بخش ۶.۱
  (⚪️/🟢/⚪️[..]/🟢[..]) می‌سازد
- ردیف ناوبری ماه (◀️ ماه قبل / 📍 ماه جاری / ماه بعد ▶️)
- کیبورد صفحهٔ روزِ محتوادار (بخش ۶.۲)
- کیبورد صفحهٔ روزِ خالی (بخش ۶.۲)
- کیبورد تأیید حذف (بخش ۶.۴، برچسب‌ها عیناً «✅ تایید حذف» / «❌ انصراف»)
- کیبورد reply-keyboard موقتِ «❌ لغو» حین تایپ متن
- کیبورد سه‌ردیفهٔ دیروز/امروز/فردا برای کاربر عادی (بخش ۷.۱)، با نشانگر ✅ روی ردیف در حال نمایش
همهٔ متن‌های دکمه باید از توابع src/utils/news-date.ts (formatShort/formatWithWeekday) بگیرند، هرگز
دستی فرمت تاریخ نسازند. از buildSafeTelegramButton (src/utils/unicode.ts) برای امن‌سازی متن دکمه‌ها
استفاده کن. این ماژول کاملاً مستقل بماند — هیچ importای از news-keyboards.ts به فایل‌های کیبورد سایر
ویژگی‌ها (scheduled-message-keyboards.ts و ...) نداشته باش.
```

**معیار پذیرش:** خروجی هر تابع کیبورد یک آرایهٔ معتبر برای `Markup.inlineKeyboard`/`Markup.keyboard` تلگراف است؛ طول هیچ callback_data از ۶۴ بایت بیشتر نیست؛ بازبینی بصری/اسنپ‌شات نشان دهد شبکهٔ جولای ۲۰۲۶ دقیقاً با جدولی که در بخش ۴ صحت‌سنجی شد مطابقت دارد.

---

### مرحلهٔ ۶ — فلوی ادمین

```
طبق بخش ۶ کامل سند، src/bot/handlers/news-admin.handlers.ts را بساز که یک تابع registerNewsAdminHandlers(bot)
را export می‌کند، شامل همهٔ موارد زیر — دقیقاً به همان ترتیب و با همان قوانین دفاعی که در بخش‌های ۶ و ۱۰ سند
آمده:
- bot.hears('📰 اخبار', ...) → بخش ۶.۱ (شامل پاک‌سازی state خواهر، دقیقاً مثل «🤖 اتوماسیون»)
- bot.action(/^news:cal:(\d{4}-\d{2})$/, ...) و bot.action('news:cal:current', ...) → ناوبری ماه
- bot.action(/^news:day:(\d{4}-\d{2}-\d{2})$/, ...) → بخش ۶.۲ (هر دو حالت خالی/محتوادار)
- bot.action(/^news:edit:(\d{4}-\d{2}-\d{2})$/, ...) → بخش ۶.۳ (شروع حالت انتظار متن)
- یک bot.on('text', ...) اختصاصی → ادامهٔ بخش ۶.۳ (دریافت و ذخیرهٔ متن) — این هندلر باید همان اول تابعش
  چک کند awaitingText برای این کاربر true است یا نه؛ اگر نه، فوراً return next()
- bot.action(/^news:clear:confirm:(\d{4}-\d{2}-\d{2})$/, ...) — ثبت‌شده قبل از الگوی عمومی‌تر
- bot.action(/^news:clear:cancel:(\d{4}-\d{2}-\d{2})$/, ...) — ثبت‌شده قبل از الگوی عمومی‌تر
- bot.action(/^news:clear:(\d{4}-\d{2}-\d{2})$/, ...) → بخش ۶.۴ (نمایش تأییدیه)
- bot.action('news:back:admin', ...) → بخش ۶.۵
تمام قوانین چک‌لیست بخش ۱۰ را رعایت کن — مخصوصاً: همیشه answerCbQuery، هرگز fallback به ctx.reply روی
شکست editMessageText، مدیریت خطای «message is not modified»، اعتبارسنجی هر پارامتر ورودی با isValidDateKey.
```

**معیار پذیرش:** `npx tsc --noEmit` تمیز؛ بررسی دستی نشان دهد همهٔ ۹ الگوی callback_data بخش ۸ که با پیشوند `news:` شروع می‌شوند و به این فایل تعلق دارند، دقیقاً یک هندلر منطبق دارند (نه صفر، نه بیشتر از یک)؛ تست دستی در یک بات تست: زدن هر دکمهٔ توصیف‌شده در بخش ۶ نتیجهٔ دقیقاً همان بخش را می‌دهد.

---

### مرحلهٔ ۷ — فلوی کاربر عادی

```
طبق بخش ۷ کامل سند، src/bot/handlers/news-user.handlers.ts را بساز که یک تابع registerNewsUserHandlers(bot)
را export می‌کند، شامل:
- bot.hears('📰 اخبار فارکس', ...) → بخش ۷.۱ (بدون چک تکراری Feature Toggle — middleware از قبل این کار را می‌کند)
- bot.action(/^news:user:(\d{4}-\d{2}-\d{2})$/, ...) → بخش ۷.۲ (ادیت درجا، بدون هیچ state سمت سرور)
دقت کن که سه‌تاریخ «دیروز/امروز/فردا» در کیبورد جدید همیشه نسبت به تاریخ واقعیِ لحظهٔ فعلی (نه dateKey
درخواستی) بازمحاسبه شوند — طبق تصمیم #۸ در بخش ۱.
```

**معیار پذیرش:** تست دستی: از منوی اصلی «📰 اخبار فارکس» بزنید → پیام امروز + سه دکمه بیاید؛ روی «فردا» بزنید → همان پیام ادیت شود، دکمهٔ «فردا» علامت ✅ بگیرد؛ دوباره روی «فردا» (که الان نمایشی است) بزنید → هیچ خطایی در لاگ نیاید (خطای «not modified» باید بی‌صدا مدیریت شود).

---

### مرحلهٔ ۸ — یکپارچه‌سازی نهایی (تنها مرحله‌ای که فایل‌های موجود را لمس می‌کند)

```
طبق بخش ۹ سند، این پنج تغییر را دقیقاً و فقط همین‌ها اعمال کن — هیچ خط اضافه‌ای غیر از موارد زیر:
1. src/bot/keyboards/index.ts — دو تغییر ۹.۱ (الف و ب)
2. src/services/settings.service.ts — تغییر ۹.۲
3. src/bot/service-toggle.ts — تغییر ۹.۳
4. src/index.ts — دو تغییر ۹.۴ (الف و ب)
همچنین src/bot/handlers/news.handlers.ts را بساز که فقط یک تابع registerNewsHandlers(bot) دارد و
داخلش registerNewsAdminHandlers(bot) و registerNewsUserHandlers(bot) را صدا می‌زند — این تنها چیزی
است که از news.handlers.ts در src/index.ts ایمپورت می‌شود.
بعد از این تغییرات: git diff را نگاه کن. اگر حتی یک خط خارج از این پنج فایل + فایل‌های کاملاً جدید
ماژول اخبار تغییر کرده، متوقف شو و گزارش بده.
```

**معیار پذیرش:** `git diff --stat` نشان دهد فقط پنج فایل موجود (`keyboards/index.ts`, `settings.service.ts`, `service-toggle.ts`, `index.ts`, `schema.prisma`) تغییر کرده‌اند، به‌علاوهٔ فایل‌های کاملاً جدید ماژول اخبار؛ `npm run build` (یا معادل TypeScript build پروژه) بدون خطا کامل شود.

---

### مرحلهٔ ۹ — QA نهایی و مستندسازی

```
1. npx tsc --noEmit  و  npx vitest run  را کامل اجرا کن؛ همه باید سبز باشند.
2. جدول بخش ۸ سند (۱۰ الگوی callback_data) را عیناً به‌عنوان یک بخش جدید در انتهای CALLBACK_CROSS_CHECK.md
   اضافه کن، با همان فرمت جدول موجود در آن فایل.
3. یک بخش کوتاه به AGENTS.md اضافه کن که ماژول جدید (فایل‌ها، پیشوند callback_data «news:»، کلید
   Feature Toggle «forex_news») را برای ایجنت‌های آینده معرفی کند — کوتاه، در حد چند خط، هم‌سبک بقیهٔ سند.
4. چک‌لیست QA دستی زیر را یک‌به‌یک روی یک بات تستی اجرا کن و نتیجهٔ هرکدام را گزارش بده (بخش ۱۲ همین سند).
```

**معیار پذیرش:** تمام موارد چک‌لیست بخش ۱۲ زیر با ✅ گزارش شوند.

---

## ۱۲. چک‌لیست QA دستیِ نهایی (پوشش صددرصد درخواست اولیهٔ شما)

- [ ] «📰 اخبار» دقیقاً کنار «🤖 اتوماسیون» در پنل ادمین دیده می‌شود (هم‌ردیف).
- [ ] با زدنش، یک پیام واحد با تقویم میلادی + تاریخ امروز داخل متن پیام دیده می‌شود.
- [ ] «ماه بعد»/«ماه قبل» همان پیام را ادیت می‌کنند (پیام جدید ساخته نمی‌شود).
- [ ] زدن یک روز (مثلاً ۱۵) همان پیام را به صفحهٔ مدیریت آن روز ادیت می‌کند.
- [ ] در آن روز: افزودن متن، ویرایش متن، حذف متن هرکدام کار می‌کنند و بدون باگ به تقویم/حالت قبلی برمی‌گردند.
- [ ] متن ارسالی با بولد/ایتالیک/زیرخط/spoiler/لینک/کد ذخیره و بعداً با همان فرمت دقیق نمایش داده می‌شود.
- [ ] «📰 اخبار فارکس» در منوی کاربر عادی دیده می‌شود.
- [ ] زدنش پیامی می‌فرستد که دقیقاً با محتوای «امروز» که ادمین ثبت کرده یکی است (کاراکتر‌به‌کاراکتر، فرمت‌به‌فرمت).
- [ ] زیر آن پیام دقیقاً سه دکمه در سه ردیف: دیروز، امروز، فردا — هرکدام با تاریخ دقیق میلادی.
- [ ] این سه تاریخ هاردکد نیستند؛ فردا اجرای مجدد ربات، همه یک روز جلو می‌آیند بدون تغییر کد.
- [ ] زدن هرکدام همان پیام را (نه پیام جدید) به محتوای همان تاریخ ادیت می‌کند.
- [ ] جابه‌جایی بین این سه تاریخ همیشه با محتوای ثبت‌شدهٔ ادمین برای همان تاریخ در پنل ادمین یکی است.
- [ ] ادمین از «↩️ بازگشت به منوی اصلی» می‌تواند به فلوی کاربر عادی (شامل اخبار فارکس) برسد؛ کاربر عادی به بخش ادمین دسترسی ندارد (چون botAdminService.getActive رد می‌کند) — هر دو طبق انتظار.
- [ ] خاموش‌کردن Feature Toggle «forex_news» از پنل تنظیمات، هم دکمه را از منو حذف می‌کند و هم اگر کسی متنش را دستی بفرستد، هندلر اجرا نمی‌شود.
- [ ] هیچ کدام از فایل‌های `Post`/`PostMessage`/پنل وب Next.js تغییر نکرده‌اند (`git diff` را با فهرست بخش ۲.۲ تطبیق دهید).
- [ ] رفتن به بخش‌های دیگر ادمین (مثلاً 🤖 اتوماسیون) و برگشت، هیچ اثر باقی‌ماندهٔ state از ماژول اخبار ندارد و برعکس.

---

## ۱۳. خارج از دامنهٔ این فاز (عمداً اضافه نشده — تا از پراکنده‌شدن دامنه جلوگیری شود)

این‌ها را در درخواست شما ندیدم؛ به همین دلیل در طراحی بالا نیستند. اگر خواستید، هرکدام یک فاز بعدی جداست:
- رسانه (عکس/ویدیو) یا دکمهٔ inline اختصاصی داخل محتوای هر روز.
- تاریخچهٔ نسخه‌ها/ویرایش‌های قبلی هر روز (چیزی شبیه `PostVersion`).
- ناوبری فراتر از دیروز/امروز/فردا در سمت کاربر عادی (مثلاً دکمهٔ «هفتهٔ قبل»).
- آمار بازدید/کلیک روی پیام‌های اخبار (چیزی شبیه `PostView`/`PostClickLog`).
- محدودیت نقش خاص برای مدیریت اخبار (فعلاً هر ادمین فعال، مثل اتوماسیون، دسترسی دارد).
