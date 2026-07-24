# رفع سه باگ در قابلیت «دکمهٔ Reply Keyboard» — سه پرامپت مستقل

> 📍 این فایل خودش در ریشهٔ مخزن قرار دارد: `./post-reply-keyboard-bugfixes.md`
>
> کد فعلیِ پیاده‌سازیِ فاز قبلی (`post-reply-keyboard.service.ts`, `post-handlers.ts`, ...) خط‌به‌خط خوانده شد. هر سه مورد شما بررسی و علتشان پیدا شد — دو موردشان (باگ ۲ و ۳) کاملاً قطعی و مشخص‌اند؛ برای باگ ۱ یک یافتهٔ مهم پیدا شد که توضیحش لازم است قبل از پرامپتش بخوانید. **سه پرامپت کاملاً مستقل** در انتهای هر بخش آماده است تا هرکدام را جدا بفرستید.

## ۰. یک یافتهٔ مهم: باگ ۱ و باگ ۲ ممکن است در واقع یک باگ باشند

قبل از هر چیز این را بخوانید، چون ترتیب پیشنهادی رفع را عوض می‌کند: با خواندن کد، **باگ ۲ (پاک‌شدن Reply-Keyboard با تغییر دستور) کاملاً تأیید و علتش قطعی پیدا شد** — یک خط مشخص در کد که دارد این را خراب می‌کند. اما دربارهٔ **باگ ۱ (ارسال مکرر پیامِ «منوی این بخش»)**، منطق کنترل‌کنندهٔ آن (که دقیقاً برای همین منظور طراحی شده بود) در خواندن مستقیم کد، **درست به‌نظر می‌رسد** — یعنی به‌تنهایی نباید هر بار پیام بفرستد.

فرضیهٔ محتمل: اگر شما در حین تست، مدام یک دکمه را روشن/خاموش (Reply-Keyboard) می‌کرده‌اید تا باگ ۲ را بررسی کنید، و هر بار به‌خاطر باگ ۲ این پرچم بی‌صدا پاک می‌شده، هر بار که دوباره پستِ کاربر را باز می‌کرده‌اید، **واقعاً و به‌درستی** یک گذار (transition) رخ می‌داده (چون وضعیت واقعاً عوض شده بود) — و پیام هم طبق طراحی، درست برای همین گذار فرستاده می‌شده. یعنی چیزی که «باگ ۱: هر بار می‌فرسته» دیده‌اید، ممکن است صرفاً **اثر جانبی باگ ۲** بوده باشد، نه یک باگ کاملاً مستقل.

**به همین دلیل، پیشنهاد می‌کنم اول پرامپت باگ ۲ را بفرستید، دوباره کامل تست کنید، و فقط اگر باگ ۱ همچنان (بدون این‌که مجبور باشید Reply-Keyboard دکمه‌ای را دستی toggle کنید) رخ داد، پرامپت باگ ۱ را هم بفرستید.** پرامپت باگ ۱ طوری طراحی شده که یک تشخیص دقیق و لاگ‌محور انجام می‌دهد، نه یک حدسِ کورکورانه — تا اگر واقعاً یک علت مستقل دیگر هم وجود داشت، پیدا شود.

---

## ۱. باگ ۲ — تغییر دستور، وضعیت Reply-Keyboard را پاک می‌کند (علت قطعی پیدا شد)

### تشخیص

فایل `src/bot/handlers/post-handlers.ts`، دقیقاً همین خط (داخل هندلر مشترک `wait_url`/`wait_popup`/`wait_command`، شاخهٔ «Edit mode»):

```ts
} else if (mode === 'edit' && row !== undefined && col !== undefined) {
  // Edit existing button
  if (buttons[row] && buttons[row][col]) {
    buttons[row][col] = { text: title, type: state === 'wait_popup' ? 'POPUP' : state === 'wait_command' ? 'COMMAND' : 'URL', value, style: buttons[row][col].style };
  }
}
```

این خط، آبجکت دکمه را **از صفر با یک لیست ثابت از فیلدها** (`text`, `type`, `value`, `style`) بازمی‌سازد — نه با اسپرِد (`{...oldButton, ...}`). چون این خط از قبلِ قابلیت Reply-Keyboard نوشته شده بود، فیلد `isReplyKeyboard` اصلاً در این لیست نیست — پس هر بار عنوان/مقدار (دستور، لینک، یا متن POP-UP) یک دکمه را تغییر دهید (حتی وقتی فقط مقدار عوض می‌شود و نوع همان می‌ماند)، `isReplyKeyboard` بی‌صدا به `undefined` (یعنی خاموش) برمی‌گردد. برای مقایسه: هندلر «🎨 رنگ» (چند خط پایین‌تر در همین فایل) این کار را **درست** انجام می‌دهد (`buttons[row][col] = { ...buttons[row][col], style: ... }`، با اسپرِد) — دقیقاً چون آن قبلاً برای حفظ `text`/`type`/`value` نوشته شده بود؛ فقط این یک نقطه از قلم افتاده.

**یک نکتهٔ اضافه که در فیکس باید رعایت شود:** اگر ادمین نوع دکمه را به 🔗 لینک یا اشتراک تغییر دهد، `isReplyKeyboard` باید **همیشه** به `false` برگردد (نه حفظ شود) — چون دکمهٔ URL هرگز نمی‌تواند Reply Keyboard باشد (طبق سند اصلی این قابلیت، محدودیت واقعی Bot API). یعنی فیکس باید «حفظ کن، مگر این‌که نوع جدید URL باشد»، نه «همیشه حفظ کن».

### پرامپت مستقل (این را جدا بفرستید)

```
فایل src/bot/handlers/post-handlers.ts را باز کن. داخل هندلر مشترک متنی که state های
'wait_url'/'wait_popup'/'wait_command' را پردازش می‌کند، شاخهٔ else if (mode === 'edit' ...) را پیدا کن
(دقیقاً همان خطی که buttons[row][col] را با یک آبجکت جدید شامل فقط text/type/value/style بازمی‌سازد).

این خط را با نسخهٔ زیر جایگزین کن — که isReplyKeyboard قبلی دکمه را حفظ می‌کند، مگر این‌که نوع جدید
دکمه URL باشد (چون دکمهٔ URL هرگز نمی‌تواند Reply Keyboard باشد؛ در آن صورت باید false شود):

    } else if (mode === 'edit' && row !== undefined && col !== undefined) {
      // Edit existing button
      if (buttons[row] && buttons[row][col]) {
        const newType = state === 'wait_popup' ? 'POPUP' : state === 'wait_command' ? 'COMMAND' : 'URL';
        const prevBtn = buttons[row][col];
        const preservedIsReplyKeyboard = (newType === 'COMMAND' || newType === 'POPUP') ? prevBtn.isReplyKeyboard : false;
        buttons[row][col] = { text: title, type: newType, value, style: prevBtn.style, isReplyKeyboard: preservedIsReplyKeyboard };
      }
    }

هیچ منطق دیگری در این فایل یا هر فایل دیگر تغییر نکند. بعد از این ویرایش:
1. npx tsc --noEmit را اجرا کن؛ باید تمیز باشد.
2. تست دستی: یک دکمه بساز، Reply-Keyboard را رویش روشن کن (طبق فاز قبلی)، سپس از داخل ویرایشگر دکمه
   دستورش (یا مقدارش) را تغییر بده؛ تأیید کن بعد از این تغییر، دکمه هنوز Reply-Keyboard-فعال است
   (برچسب «↩️ بازگشت به Inline» را نشان می‌دهد، نه «⌨️ نمایش در Reply Keyboard»).
3. یک تست دیگر: همان دکمه را حالا به نوع 🔗 لینک یا اشتراک تغییر بده؛ تأیید کن isReplyKeyboard این‌بار
   واقعاً false شده (چون گزینهٔ Reply-Keyboard اصلاً برای نوع URL نباید نمایش داده شود؛ اگر توی دیتابیس
   نگاه کنی هم باید false/نبود باشد).
گزارش بده که هر دو تست چه نتیجه‌ای دادند.
```

---

## ۲. باگ ۱ — ارسال مکرر «⌨️ منوی این بخش» (نیازمند تشخیص دقیق قبل از فیکس)

### چرا این یکی را کورکورانه فیکس نمی‌کنیم

طبق بخش ۰، ممکن است این اصلاً باگ مستقلی نباشد. منطق فعلی (`src/services/post-reply-keyboard.service.ts`، تابع `syncPostReplyKeyboard`) این‌طور است:

```ts
const newState = hasCustom ? String(postId) : 'MAIN_MENU';
const prevState = cache.get<string>(cacheKey) ?? 'MAIN_MENU';
if (newState === prevState) return;   // اگر چیزی عوض نشده، هیچ پیامی فرستاده نمی‌شود
...
cache.setPermanent(cacheKey, newState);
```

این در نگاه اول درست است. **اگر بعد از فیکس باگ ۲ (بخش قبل) و تست دوباره، هنوز می‌بینید که با هر بار باز کردن یک پستِ Reply-Keyboard-فعال (بدون این‌که خودتان دستی چیزی toggle کرده باشید) پیام تکرار می‌شود، این پرامپت را بفرستید** — چون در آن صورت واقعاً یک علت مستقل دیگر هست که باید با لاگ واقعی پیدایش کنیم، نه حدس زد.

### پرامپت مستقل (فقط اگر بعد از فیکس باگ ۲ هنوز رخ می‌داد، این را بفرستید)

```
در src/services/post-reply-keyboard.service.ts، داخل تابع syncPostReplyKeyboard، بلافاصله بعد از خط
"const prevState = cache.get<string>(cacheKey) ?? 'MAIN_MENU';" این خط تشخیصی موقت را اضافه کن:

    logger.info(`[ReplyKbSync][DIAG] userId=${userId} postId=${postId} hasCustom=${hasCustom} newState=${newState} prevState=${prevState} willSend=${newState !== prevState}`);

(import { logger } from '../utils/logger'; را اگر بالای فایل نیست اضافه کن.)

سپس با یک اکانت کاربر عادی (نه ادمین)، بدون هیچ toggle دستی‌ای در ویرایشگر، این سناریو را دقیقاً تکرار کن:
1. یک پست با دکمهٔ Reply-Keyboard-فعال را باز کن.
2. صبر کن پیام «⌨️ منوی این بخش:» بیاید.
3. دوباره، بدون تغییر هیچ‌چیزی در پنل ادمین، همان دکمهٔ همان پست (یا خودِ همین پست) را دوباره باز کن.
4. لاگ [DIAG] هر دو بار را نگاه کن.

گزارش بده:
- آیا postId در هر دو لاگ دقیقاً یکسان بود؟
- آیا newState در هر دو لاگ دقیقاً یکسان بود؟
- در بار دوم، prevState چه مقداری داشت — همان مقدار newState بار اول بود، یا چیز دیگری (مثلاً هنوز
  'MAIN_MENU')؟
- willSend در بار دوم true بود یا false؟

این گزارش را برای من بیاور و منتظر بمان — قبل از این‌که هیچ فیکسی بر اساس حدس اعمال کنی. بر اساس این
مقادیر دقیق، علت واقعی (مثلاً کش بین دو درخواست پاک می‌شود، یا userId یکی نیست، یا چیز دیگر) را پیدا و
گزارش می‌کنیم، سپس فیکس دقیق را در یک پرامپت بعدی انجام می‌دهیم. خطوط [DIAG] را در همین مرحله حذف نکن —
تا وقتی تشخیص کامل تأیید نشده، بمانند.
```

**توجه:** این پرامپت عمداً فقط **تشخیص** می‌دهد، فیکس نمی‌کند — چون همان‌طور که بخش ۰ توضیح داد، ممکن است این باگ اصلاً مستقل نباشد. بعد از دیدن گزارش این پرامپت، اگر خواستید، یک پرامپت فیکسِ دقیق برایتان می‌نویسم که مستقیماً به همان علتِ دیده‌شده در لاگ می‌پردازد.

---

## ۳. باگ/درخواست ۳ — رنگ باید روی دکمهٔ Reply Keyboard هم اعمال شود

### توضیح

این در واقع یک باگ نیست — در سند اصلی این قابلیت (`post-button-reply-keyboard-spec.md`)، **تصمیم صریح #۴** دقیقاً همین رفتار فعلی را عمداً انتخاب کرده بود: «رنگ به دکمهٔ Reply Keyboard منتقل نمی‌شود؛ دکمه‌های Reply Keyboard همیشه ساده‌اند» — چون در درخواست اول شما فقط دربارهٔ *محل نمایش* (inline یا reply) صحبت شده بود، نه رنگ آن‌جا. الان با این پیام، آن تصمیم را عوض می‌کنید — کاملاً قابل انجام است.

**یافتهٔ فنی لازم:** طبق changelog رسمی Bot API (نسخهٔ ۹.۴، فوریهٔ ۲۰۲۶)، فیلد `style` هم به `InlineKeyboardButton` و هم به `KeyboardButton` اضافه شده — یعنی این کاملاً ممکن است، فقط تا الان پیاده نشده بود.

### طراحی دقیق فیکس

در `src/services/post-reply-keyboard.service.ts`:

1. `buildReplyKeyboardFromMessages` باید `style` هر دکمه را هم در خروجی نگه دارد (نه فقط `text`):
```ts
export function buildReplyKeyboardFromMessages(messages: any[]): { text: string; style?: string }[][] {
  const rows: { text: string; style?: string }[][] = [];
  const sorted = (messages || []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  for (const msg of sorted) {
    const grid: any[][] = Array.isArray(msg.replyMarkup) ? msg.replyMarkup : (msg.replyMarkup?.inline_keyboard || []);
    for (const gridRow of grid) {
      if (!Array.isArray(gridRow)) continue;
      const flagged = gridRow.filter((b: any) => b?.isReplyKeyboard);
      if (flagged.length > 0) {
        rows.push(flagged.map((b: any) => ({
          text: sanitizeTelegramText(b.text || '', 128),
          style: (b.style && b.style !== 'default') ? b.style : undefined,
        })));
      }
    }
  }
  return rows;
}
```

2. یک تابع کمکی جدید برای ساخت دکمهٔ رنگی — دقیقاً هم‌الگو با تابع مشابهی که برای دکمه‌های inline (تقویم اخبار فارکس) استفاده شد، چون `telegraf` هنوز فیلد `style` (Bot API 9.4) را در تایپ TypeScript خودش برای `KeyboardButton` نمی‌شناسد؛ این فقط یک type assertion امن در زمان کامپایل است — تلگرام خودش این فیلد را کامل پردازش می‌کند:
```ts
function styledKeyboardButton(text: string, style?: string) {
  const btn = Markup.button.text(text);
  return style ? ({ ...btn, style } as typeof btn) : btn;
}
```

3. در `syncPostReplyKeyboard`، خط ساخت کیبورد تغییر می‌کند:
```ts
// فعلی:
await ctx.reply('⌨️ منوی این بخش:', Markup.keyboard(rows).resize().persistent());
// جدید:
const kbRows = rows.map((row) => row.map((b) => styledKeyboardButton(b.text, b.style)));
await ctx.reply('⌨️ منوی این بخش:', Markup.keyboard(kbRows).resize().persistent());
```

**صداقت فنی:** این دقیقاً همان مکانیزمی است که برای رنگ دکمه‌های Inline در فازهای قبلی (تقویم اخبار فارکس) استفاده و با موفقیت پیاده شد. برای `KeyboardButton` مشخصاً، این پروژه تا امروز هیچ‌جا از `style` استفاده نکرده بود؛ بر اساس changelog رسمی Bot API باید عیناً همین‌طور کار کند، ولی چون این اولین‌بار است که در **این پروژهٔ خاص** برای Reply Keyboard امتحان می‌شود، مرحلهٔ تست دستیِ زیر (که در پرامپت هم آمده) از قبل هم برای اطمینان لازم است — نه یک احتیاط اضافی بی‌دلیل.

### پرامپت مستقل (این را جدا بفرستید)

```
در src/services/post-reply-keyboard.service.ts، این سه تغییر را دقیقاً اعمال کن:

1. امضا و بدنهٔ buildReplyKeyboardFromMessages را طوری تغییر بده که هر آیتم خروجی، علاوه بر text، یک
   style اختیاری هم داشته باشد (از روی b.style دکمهٔ اصلی، فقط اگر b.style موجود و متفاوت از 'default'
   بود):

    export function buildReplyKeyboardFromMessages(messages: any[]): { text: string; style?: string }[][] {
      const rows: { text: string; style?: string }[][] = [];
      const sorted = (messages || []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
      for (const msg of sorted) {
        const grid: any[][] = Array.isArray(msg.replyMarkup) ? msg.replyMarkup : (msg.replyMarkup?.inline_keyboard || []);
        for (const gridRow of grid) {
          if (!Array.isArray(gridRow)) continue;
          const flagged = gridRow.filter((b: any) => b?.isReplyKeyboard);
          if (flagged.length > 0) {
            rows.push(flagged.map((b: any) => ({
              text: sanitizeTelegramText(b.text || '', 128),
              style: (b.style && b.style !== 'default') ? b.style : undefined,
            })));
          }
        }
      }
      return rows;
    }

2. یک تابع کمکی جدید styledKeyboardButton اضافه کن (قبل از syncPostReplyKeyboard):

    function styledKeyboardButton(text: string, style?: string) {
      const btn = Markup.button.text(text);
      return style ? ({ ...btn, style } as typeof btn) : btn;
    }

3. داخل syncPostReplyKeyboard، خط ساخت کیبورد را تغییر بده:

    // قبل:
    await ctx.reply('⌨️ منوی این بخش:', Markup.keyboard(rows).resize().persistent());
    // بعد:
    const kbRows = rows.map((row) => row.map((b) => styledKeyboardButton(b.text, b.style)));
    await ctx.reply('⌨️ منوی این بخش:', Markup.keyboard(kbRows).resize().persistent());

هیچ فایل دیگری تغییر نکند. بعد از این تغییرات:
1. npx tsc --noEmit را اجرا کن؛ باید تمیز باشد.
2. تست دستی: یک دکمهٔ نوع دستور بساز، هم رنگش را (🎨 رنگ) روی مثلاً 🟢 Success بگذار و هم
   Reply-Keyboard را رویش روشن کن؛ پستش را به‌عنوان کاربر عادی باز کن؛ تأیید کن دکمه در Reply Keyboard
   پایین صفحه با رنگ سبز واقعی (نه پیش‌فرض) دیده می‌شود.
3. اگر نسخهٔ اپ تلگرام کاربر خیلی قدیمی بود و رنگ اصلاً دیده نشد، این یک محدودیت شناخته‌شدهٔ نسخهٔ
   کلاینت است، نه باگ — فقط در گزارش ذکر کن کدام نسخهٔ اپ تست شد.
گزارش بده که تست چه نتیجه‌ای داد.
```
