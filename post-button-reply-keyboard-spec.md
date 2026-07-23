# قابلیت جدید: «دکمه به‌عنوان Reply Keyboard» در ویرایشگر دکمه‌های پست — طراحی + لوپ اجرا

> 📍 این فایل خودش در ریشهٔ مخزن قرار دارد: `./post-button-reply-keyboard-spec.md`
>
> این سند به بخش «پست‌ها → ویرایش پیام → ویرایش دکمه‌ها» مربوط است — همان صفحه‌ای که دکمه‌های 🔗 لینک یا اشتراک، 🪟 POP-UP، ⌨️ دستور، 🎨 رنگ را دارد. قبل از طراحی، کل مکانیزم فعلی ذخیره‌سازی و تحویل دکمه‌های پست خط‌به‌خط خوانده شد — این مکانیزم به‌طرز غیرمنتظره‌ای لایه‌به‌لایه است (سه سیستم موازی که با هم همگام نگه داشته می‌شوند)، و یک تصمیم صریح شما («رنگش رو آبی کن») با یک قابلیت از قبل موجود در همین صفحه («🎨 رنگ» که خودش گزینهٔ Primary/آبی دارد) برخورد مستقیم دارد. این‌ها را با جزئیات کامل در بخش ۱ توضیح می‌دهم.

## ۰. خلاصه

هر دکمهٔ پست (از هر نوع ⌨️ دستور یا 🪟 POP-UP) یک ویژگی جدید boolean می‌گیرد: «این دکمه در Reply Keyboard نمایش داده شود؟». این کاملاً یک ویژگی **در سطح خودِ دکمه** است (نه در سطح پست)، دقیقاً چون شما گفتید تصمیم برای هر دکمه جداگانه گرفته می‌شود.

- در پنل ادمین، همه‌چیز (ایجاد/حذف/ویرایش/جابجایی) **۱۰۰٪ inline باقی می‌ماند** — این ویژگی جدید فقط یک دکمهٔ inline بیشتر در صفحهٔ «ویرایش این دکمه» است.
- برای کاربر عادی: پستی که حداقل یک دکمهٔ Reply-Keyboard-فعال دارد، هنگام باز شدن، به‌طور خودکار کیبورد پایین صفحه (Reply Keyboard) کاربر را به یک کیبورد جدید متشکل از همان دکمه‌های علامت‌خورده تغییر می‌دهد؛ دکمه‌های علامت‌نخورده دقیقاً مثل امروز inline باقی می‌مانند. با خروج از این پست (رفتن به پستی بدون هیچ دکمهٔ Reply-Keyboard-فعال)، Reply Keyboard به‌طور خودکار به منوی اصلی برمی‌گردد.

## ۱. یافته‌های معماری (باید قبل از هر خط کد خوانده شود)

### ۱.۱. دکمه‌های پست، سه لایهٔ موازیِ همگام‌شده دارند — نه یک منبع واحد

بر خلاف تصور اول (که مدل `PostButton` در schema.prisma منبع اصلی است)، بررسی دقیق نشان داد **`PostButton` عملاً کد مرده است** (دقیقاً مثل `MenuOrder` در ماژول قبلی). سه لایهٔ واقعی که با هم درگیرند:

1. **`Post.buttons` (فیلد Json روی خودِ Post)** — فرمت قدیمی/میراثی، فقط قبل از مهاجرت یک پست به سیستم چندپیامی معنا دارد.
2. **`PostMessage.replyMarkup` (فیلد Json روی هر پیام)** — منبعی که **واقعاً در لحظهٔ ارسال پست به کاربر خوانده می‌شود** (`post-message.service.ts`، خط ۲۳۹-۲۴۰: `msg.replyMarkup` → `buildTelegramKeyboard`).
3. **`PostKeyboard` (مدل رابطه‌ای با ستون‌های `row`/`col`/`payload`)** — یک نسخهٔ آینه‌ای که برای هر پیام نگه داشته می‌شود؛ `payload` کل آبجکت خام دکمه را (با اسپرِد `{ ...kb.payload }`) نگه می‌دارد.

نکتهٔ حیاتی: تابع `postService.update` یک بلوک اختصاصی به اسم «Sync post.buttons to post_messages.replyMarkup» دارد (`src/services/post.service.ts`) که هر بار دکمه‌ها ویرایش می‌شوند، **هر سه لایه را هم‌زمان به‌روز نگه می‌دارد** — و این همگام‌سازی، **تمام کلیدهای اضافی روی هر آبجکت دکمه را عیناً حفظ می‌کند** (نه یک allow-list محدود از فیلدها). یعنی اگر من یک فیلد کاملاً جدید مثل `isReplyKeyboard` به آبجکت دکمه اضافه کنم، **بدون هیچ تغییری در `postService.update`، به‌طور خودکار در هر سه لایه حفظ و همگام می‌ماند.** این خبر خوبی است: صفر تغییر در schema.prisma، صفر تغییر در منطق sync لازم است.

### ۱.۲. رندرر نهایی، هر فیلد اضافهٔ دکمه (مثل `style`) را عیناً به دکمهٔ واقعی تلگرام منتقل می‌کند

در `telegram-native-renderer.service.ts`، تابع `buttonToTelegram` بعد از ساختن دکمهٔ تلگرافی (`Markup.button.callback/url/...`)، این بلوک را دارد:
```ts
// Preserve all extra properties from original button (e.g. style)
if (result && btn) {
  for (const key of Object.keys(btn)) {
    if (!(key in result) && key !== 'type' && key !== 'value' && key !== 'url') {
      (result as any)[key] = btn[key];
    }
  }
}
```
این یعنی: هر فیلد اضافه‌ای که روی دکمهٔ ذخیره‌شده باشد (مثل `style`)، عیناً روی آبجکت نهاییِ ارسالی به تلگرام هم می‌نشیند. **این دقیقاً همان راهی است که «🎨 رنگ» (که در ادامه توضیح می‌دهم) واقعاً و به‌طور بومی — نه فقط با ایموجی — روی دکمهٔ نهاییِ کاربر اعمال می‌شود.**

### ۱.۳. ⚠️ برخورد مستقیم: «🎨 رنگ» موجود از قبل گزینهٔ «Primary (آبی)» دارد

این مهم‌ترین یافته‌ایست که باید قبل از پیاده‌سازی با آن تصمیم بگیریم. صفحهٔ انتخاب رنگ فعلی (`buildButtonColorSelectionKeyboard`) دقیقاً این گزینه‌ها را دارد:
```
🔵 Primary (آبی)
🟢 Success (سبز)
🔴 Danger (قرمز)
⚪ default
```
یعنی «آبی» از قبل یک معنای مشخص و واقعی دارد: **رنگ بومی واقعیِ دکمه، همان‌طور که کاربر نهایی می‌بیند** (طبق بند ۱.۲، `style: 'primary'` مستقیماً به دکمهٔ واقعی تلگرام اعمال می‌شود). اگر من هم برای «این دکمه Reply-Keyboard است» از رنگ بومی آبی استفاده کنم، دقیقاً همین یک فیلد (`style`) را برای دو معنای کاملاً متفاوت به کار برده‌ام — و چون Bot API فقط سه رنگ غیر-دیفالت دارد (Primary/Success/Danger) و هر سه از قبل توسط این ویژگی موجود اشغال شده‌اند، **هیچ رنگ بومیِ آزادی برای این نشانگر جدید باقی نمی‌ماند**، بدون این‌که با معنای «رنگ واقعی این دکمه برای کاربر نهایی» تداخل کند.

**راه‌حلی که در این سند پیاده می‌شود:** به‌جای رنگ بومی، در **لیست/گرید ادمین** (همان صفحه‌ای که دکمه‌ها را برای انتخاب نشان می‌دهد، نه صفحهٔ نهاییِ کاربر) یک **پیشوند ایموجی مجزا** («⌨️») اضافه می‌شود که کاملاً مستقل و غیرقابل‌اشتباه‌گرفتن با پیشوند رنگ فعلی (🔵/🟢/🔴) است. این پیشوند فقط در آن گرید preview ادمین ظاهر می‌شود — نه روی دکمهٔ واقعی که به کاربر نهایی می‌رسد (چون آن دکمه دیگر اصلاً inline نیست، در Reply Keyboard است، و اصلاً چیزی به اسم "رنگ" روی KeyboardButton برای کاربر معنادار/قابل‌مشاهده در این طراحی نیست). این تصمیم را در بخش ۳ (تصمیمات صریح) دوباره با جزئیات کامل توضیح می‌دهم — قابل تغییر است اگر ترجیح دیگری دارید، اما این خطر ابهام را از همان اول برای شما شفاف می‌کنم.

### ۱.۴. محدودیت واقعی Telegram: نوع دکمه «🔗 لینک یا اشتراک» اصلاً نمی‌تواند Reply Keyboard شود

دکمهٔ نوع URL با کلیک کاربر مستقیماً یک لینک خارجی باز می‌کند — این قابلیت **فقط روی دکمه‌های Inline (`InlineKeyboardButton` با فیلد `url`) وجود دارد**؛ `KeyboardButton` (دکمهٔ Reply Keyboard) هیچ راهی برای باز کردن مستقیم یک URL ندارد. این یک محدودیت واقعی پلتفرم تلگرام است، نه یک انتخاب طراحی. بنابراین: **قابلیت «تبدیل به Reply Keyboard» فقط برای دکمه‌های نوع ⌨️ دستور و 🪟 POP-UP در دسترس قرار می‌گیرد؛ برای نوع 🔗 لینک یا اشتراک، این گزینه اصلاً نمایش داده نمی‌شود** (تا از ساختن یک پیکربندی بی‌معنا و باگ‌زا جلوگیری شود — دقیقاً نوع مشکلی که گفتید نباید وجود داشته باشد).

### ۱.۵. محدودیت واقعی دیگر: یک پیام نمی‌تواند هم‌زمان هم Inline Keyboard و هم Reply Keyboard داشته باشد

در Bot API، فیلد `reply_markup` یک پیام یا `InlineKeyboardMarkup` است یا `ReplyKeyboardMarkup`، هرگز هر دو با هم. یعنی وقتی پستی هم دکمهٔ inline (علامت‌نخورده) و هم دکمهٔ Reply-Keyboard-فعال دارد، این دو **نمی‌توانند روی یک پیام سوار شوند**. راه‌حل (که دقیقاً همان الگویی است که برای ماژول اخبار فارکس هم استفاده شد): محتوای اصلی پست با inline keyboardِ فیلترشده (فقط دکمه‌های علامت‌نخورده) ارسال می‌شود؛ اگر پست حداقل یک دکمهٔ Reply-Keyboard-فعال داشته باشد، **یک پیامِ کوتاهِ جداگانه** (با متن غیرخالی، طبق درسی که از باگ مشابه در ماژول اخبار گرفتیم) Reply Keyboard جدید را حمل می‌کند.

### ۱.۶. برای جلوگیری از اسپم پیام: ردیابی وضعیتِ «کدام Reply Keyboard الان روشنه»

اگر این پیامِ «حامل Reply Keyboard» را در **هر بار** باز شدن هر پستی بفرستیم (حتی وقتی چیزی عوض نشده)، هر پست معمولیِ بدون این ویژگی هم یک پیام اضافهٔ بی‌دلیل می‌گیرد — که تجربهٔ کاربری را خراب می‌کند. راه‌حل: یک مقدار کوچک در cache به‌ازای هر کاربر نگه می‌داریم (`lastReplyKeyboardPostId`) که «آخرین پستی که Reply Keyboard اش را تنظیم کرد کدام بود» را ثبت می‌کند. فقط وقتی این مقدار با پست تازه‌باز‌شده فرق کند، پیامِ حاملِ کیبورد فرستاده می‌شود — دقیقاً منطبق با توصیف خودتان («وقتی از این پست خارج می‌شیم و به پست بعدی می‌ریم»، یعنی یک **گذار**، نه یک تکرار بی‌فایده).

---

## ۲. طراحی دقیق

### ۲.۱. فیلد جدید روی هر دکمه

هیچ تغییری در schema.prisma لازم نیست (طبق بند ۱.۱). فقط یک کلید جدید روی آبجکت دکمه، در همان JSON که همین الان `text`/`type`/`value`/`style` را نگه می‌دارد:
```ts
{ text: 'سرمایه‌گذار برتر', type: 'COMMAND', value: 'top_investor', style: 'success', isReplyKeyboard: true }
```
مقدار پیش‌فرض (نبودنِ این کلید، یا `false`) یعنی دقیقاً همان رفتار امروزی — inline، بدون هیچ تغییری. این طبق همان الگوی «افزودنی، نه تخریبی» است که در فازهای قبلی هم رعایت شد.

### ۲.۲. دکمهٔ جدید در صفحهٔ «ویرایش این دکمه» (`buildEditButtonTypeKeyboard`)

**نکتهٔ دقتِ لازم:** امضای فعلی این تابع اصلاً نوع دکمه را دریافت نمی‌کند (`(postId, row, col, currentColor?)`)؛ برای تصمیم‌گیری «آیا این ردیف نمایش داده شود» (طبق بند ۱.۴، فقط برای COMMAND/POPUP)، باید **دو پارامتر جدید** (نوع فعلی دکمه، و وضعیت فعلی toggle) به‌عنوان آرگومان‌های اختیاریِ انتهایی اضافه شود — این‌طوری هیچ‌کدام از فراخوانی‌های فعلیِ این تابع (که همگی دقیقاً ۴ آرگومان می‌دهند) نمی‌شکنند:

```ts
export const buildEditButtonTypeKeyboard = (
  postId: number, row: number, col: number,
  currentColor?: string,
  currentType?: string,
  isReplyKeyboard?: boolean,
) => {
```

صفحهٔ فعلی:
```
[🔗 لینک یا اشتراک]
[🪟 POP-UP]
[⌨️ دستور]
[🎨 رنگ]
[❌ لغو]
```
تبدیل می‌شود به:
```
[🔗 لینک یا اشتراک]
[🪟 POP-UP]
[⌨️ دستور]
[🎨 رنگ]
[⌨️ نمایش در Reply Keyboard]   ← جدید — فقط اگر currentType === 'COMMAND' یا 'POPUP' باشد
[❌ لغو]
```
وقتی دکمه از قبل `isReplyKeyboard: true` دارد، برچسب به `[↩️ بازگشت به Inline]` تغییر می‌کند — همان الگوی «برچسب = عملی که با زدن رخ می‌دهد»ی که در بقیهٔ این پروژه هم رعایت شده (مثل ✅ انتشار / 📤 لغو انتشار).

```ts
  const colorLabel = currentColor
    ? `🎨 رنگ (${colorIndicator(currentColor)})`
    : '🎨 رنگ';
  const rows = [
    [Markup.button.callback('🔗 لینک یا اشتراک', `pbedit:type:url:${postId}:${row}:${col}`)],
    [Markup.button.callback('🪟 POP-UP', `pbedit:type:popup:${postId}:${row}:${col}`)],
    [Markup.button.callback('⌨️ دستور', `pbedit:type:command:${postId}:${row}:${col}`)],
    [Markup.button.callback(colorLabel, `pbedit:color:${postId}:${row}:${col}`)],
  ];
  if (currentType === 'COMMAND' || currentType === 'POPUP') {
    const kbLabel = isReplyKeyboard ? '↩️ بازگشت به Inline' : '⌨️ نمایش در Reply Keyboard';
    rows.push([Markup.button.callback(kbLabel, `pbedit:replykb:${postId}:${row}:${col}`)]);
  }
  rows.push([Markup.button.callback('❌ لغو', `pbedit:type:cancel:${postId}`)]);
  return Markup.inlineKeyboard(rows);
};
```

**اگر نوع فعلی دکمه URL باشد، این ردیف اصلاً اضافه نمی‌شود** (طبق بند ۱.۴؛ تلاش برای زدن آن هرگز ممکن نیست چون دکمه‌اش وجود ندارد — این بهترین نوع محافظت است: از اول امکان خطا را حذف می‌کند، نه این‌که بعداً پیام خطا نشان بدهد).

### ۲.۳. رفتار با تپ: فوری، بدون مرحلهٔ میانی، بازگشت به همان صفحه

بر خلاف «🎨 رنگ» (که یک صفحهٔ Reply Keyboard میانی برای انتخاب باز می‌کند)، این دکمه یک **toggle مستقیم** است — دقیقاً مثل «✅ انتشار / 📤 لغو انتشار» در ویرایشگر پست: یک تپ، فوراً مقدار برعکس می‌شود، و همان صفحه (`buildEditButtonTypeKeyboard`) با برچسب به‌روزشده دوباره نمایش داده می‌شود (ادیت‌درجا، بدون پیام جدید).

```ts
bot.action(/^pbedit:replykb:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
  await ctx.answerCbQuery();
  const admin = await requirePostAdmin(ctx);
  if (!isPostAdmin(admin)) return;
  const postId = parseInt(ctx.match[1]);
  if (!requireButtonEditSession(ctx)) return;
  const row = parseInt(ctx.match[2]);
  const col = parseInt(ctx.match[3]);
  const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
  const post = await postService.findById(postId);
  if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
  const buttons: any[][] = JSON.parse(JSON.stringify(extractButtonsForMessage(post, messageIdx)));
  const btn = buttons[row]?.[col];
  if (!btn) return safeEdit(ctx, '❌ دکمه یافت نشد.');
  if (btn.type !== 'COMMAND' && btn.type !== 'POPUP') {
    return ctx.answerCbQuery('⛔ فقط دکمه‌های دستور یا POP-UP می‌توانند Reply Keyboard شوند.', { show_alert: true });
  }
  // مقدار جدید را در یک متغیر مجزا نگه می‌داریم — از هر دو استفادهٔ پایین (متن وضعیت و
  // فراخوانی buildEditButtonTypeKeyboard) *دقیقاً همین یک متغیر* استفاده می‌کند، نه btn.isReplyKeyboard
  // (که بعد از این خط دیگر مقدار قدیمی/منقضی‌شده است). تکیه‌کردن دوباره به‌جای این روی یک
  // نقیض‌مضاعفِ تصادفاً-درستِ «!btn.isReplyKeyboard» دقیقاً از همان دسته باگ‌های ظریفی است که
  // این پروژه باید از آن‌ها در امان بماند.
  const newIsReplyKeyboard = !btn.isReplyKeyboard;
  // اسپرِد — دقیقاً همان الگوی موجود برای تغییر رنگ (خط ۱۹۰۴ فعلی post-handlers.ts):
  buttons[row][col] = { ...btn, isReplyKeyboard: newIsReplyKeyboard };
  await postService.update(postId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);
  const currentType = btn.type === 'POPUP' ? '🪟 POP-UP' : '⌨️ دستور';
  const colorText = btn.style && btn.style !== 'default' ? `🎨 ${btn.style}` : '⚪ بدون رنگ';
  const kbText = newIsReplyKeyboard ? '⌨️ Reply Keyboard: روشن' : '📥 Reply Keyboard: خاموش';
  await safeEdit(ctx,
    `🔧 شما در حالت تنظیمات پیام هستید.\n❇️ حالت دکمه را انتخاب کنید.\n\nℹ️ مقدار فعلی:\n${currentType}\n${btn.text}: ${btn.value || ''}\n${colorText}\n${kbText}`,
    buildEditButtonTypeKeyboard(postId, row, col, btn.style, btn.type, newIsReplyKeyboard));
});
```
(دفاعی: حتی اگر UI به‌درستی این دکمه را فقط برای COMMAND/POPUP نشان بدهد، هندلر خودش هم دوباره نوع را چک می‌کند — در برابر callback_data قدیمی/دستکاری‌شده.)

### ۲.۴. نشانگر «⌨️» در گرید ادمین (لیست دکمه‌ها)

در `buildButtonEditorInlineKeyboard`، خط ساخت برچسب هر دکمه:
```ts
// فعلی:
Markup.button.callback(`${colorIndicator(btn.style)}${icon} ${safe}`, `pbedit:click:${postId}:${r}:${c}`)
// جدید:
Markup.button.callback(`${btn.isReplyKeyboard ? '⌨️' : ''}${colorIndicator(btn.style)}${icon} ${safe}`, `pbedit:click:${postId}:${r}:${c}`)
```
این یعنی ادمین، بدون باز کردن هیچ دکمه‌ای، فقط با نگاه به گرید کلی، می‌فهمد کدام دکمه‌ها Reply-Keyboard-فعال هستند — دقیقاً هدف اصلیِ خواستهٔ شما، فقط با یک نشانگر بدون تداخل با نشانگر رنگ موجود.

### ۲.۵. ساخت Reply Keyboard نهایی — حفظ دقیق چیدمان ردیف‌ها

طبق تأکید صریح شما («جابجایی رو کنار بقیه دکمه‌ها انجام می‌دیم، ولی داخل reply keyboard بر اساس جابجایی که انجام شده قرار می‌گیره»)، هیچ سیستم جابجایی جداگانه‌ای ساخته نمی‌شود. Reply Keyboard مستقیماً از همان چیدمان ردیف/ستونِ ادمین مشتق می‌شود.

**نکتهٔ دقتِ فنی مهم:** این تابع کمکی به یک آرایهٔ ساده از پیام‌ها (`messages: any[]`، هرکدام با `order` و `replyMarkup`) نیاز دارد — **نه** یک آبجکت «پست کامل» با فیلد تودرتوی `.messages`. دلیلش این است که نقطهٔ تزریق اصلی (بند ۲.۶) داخل `sendPostToChat` است، و آن تابع اصلاً یک آبجکت Post کامل بارگذاری نمی‌کند — فقط مستقیماً ردیف‌های `PostMessage` را با `loadPostMessages(postId)` می‌خواند (آرایه‌ای ساده، نه تودرتو). طراحی زیر دقیقاً با همین واقعیت هماهنگ است:

```ts
// فایل جدید: src/services/post-reply-keyboard.service.ts
import { sanitizeTelegramText } from '../utils/unicode';

export function buildReplyKeyboardFromMessages(messages: any[]): { text: string }[][] {
  const rows: { text: string }[][] = [];
  const sorted = (messages || []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  for (const msg of sorted) {
    const grid: any[][] = Array.isArray(msg.replyMarkup) ? msg.replyMarkup : (msg.replyMarkup?.inline_keyboard || []);
    for (const gridRow of grid) {
      if (!Array.isArray(gridRow)) continue;
      const flagged = gridRow.filter((b: any) => b?.isReplyKeyboard);
      if (flagged.length > 0) {
        rows.push(flagged.map((b: any) => ({ text: sanitizeTelegramText(b.text || '', 128) })));
      }
    }
  }
  return rows;
}

export function findReplyKeyboardButtonByText(messages: any[], text: string): any | null {
  const sorted = (messages || []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  for (const msg of sorted) {
    const grid: any[][] = Array.isArray(msg.replyMarkup) ? msg.replyMarkup : (msg.replyMarkup?.inline_keyboard || []);
    for (const gridRow of grid) {
      if (!Array.isArray(gridRow)) continue;
      const found = gridRow.find((b: any) => b?.isReplyKeyboard && b?.text === text);
      if (found) return found;
    }
  }
  return null;
}
```

قوانین دقیق (که همگی از توضیح شما مستقیماً می‌آیند):
- پیام‌ها به ترتیب `order` پیمایش می‌شوند؛ داخل هر پیام، ردیف‌ها از بالا به پایین.
- هر ردیفِ ادمین که **حداقل یک** دکمهٔ علامت‌خورده دارد، **دقیقاً به همان ترتیب چپ‌به‌راست** یک ردیف در Reply Keyboard می‌شود. دکمه‌های علامت‌نخورده در همان ردیف نادیده گرفته می‌شوند (در Reply Keyboard ظاهر نمی‌شوند، چون در Inline باقی می‌مانند).
- ردیفی که هیچ دکمهٔ علامت‌خورده‌ای ندارد، **هیچ ردیفی** (نه یک ردیف خالی) در Reply Keyboard تولید نمی‌کند.
- ردیف‌های حاصل از پیام‌های مختلف هرگز با هم ادغام نمی‌شوند، حتی اگر عدد ردیفشان در گرید محلی خودشان یکسان باشد.

### ۲.۶. نقطهٔ تزریق در تحویل پست — مرکزی، برای هر دو مسیر ادمین و کاربر

تغییر در `sendPostToChat` (`src/services/post-message.service.ts`)، دقیقاً کنار خط موجود:
```ts
// فعلی (خط ۲۳۹-۲۴۰):
const buttons = Array.isArray(msg.replyMarkup) ? msg.replyMarkup : msg.replyMarkup?.inline_keyboard;
const reply_markup = buttons?.length ? { inline_keyboard: buildTelegramKeyboard(cloneJson(buttons), msg.postId) } : undefined;
```
تبدیل به:
```ts
const buttons = Array.isArray(msg.replyMarkup) ? msg.replyMarkup : msg.replyMarkup?.inline_keyboard;
const inlineOnlyButtons = (buttons || []).map((row: any[]) => (row || []).filter((b: any) => !b?.isReplyKeyboard));
const reply_markup = inlineOnlyButtons.some((r: any[]) => r.length > 0)
  ? { inline_keyboard: buildTelegramKeyboard(cloneJson(inlineOnlyButtons), msg.postId) }
  : undefined;
```
(فقط دکمه‌های **غیر**-Reply-Keyboard وارد Inline Keyboard واقعی می‌شوند؛ بقیهٔ منطق این تابع — رسانه، entities، ترتیب پیام‌ها — دست‌نخورده می‌ماند.)

بعد از حلقهٔ ارسال تمام پیام‌های پست (یعنی در انتهای `sendPostToChat`، بعد از پایان `for (let i = 0; i < validated.length; i++) { ... }`)، این یک خط اضافه می‌شود:
```ts
await syncPostReplyKeyboard(ctx, postId, validated);
```
(`postId` و `validated` هر دو از قبل، دقیقاً با همین نام‌ها، در بدنهٔ `sendPostToChat` موجودند — طبق کد واقعی فعلی؛ هیچ متغیر جدیدی برای این فراخوانی لازم نیست.)

تابع `syncPostReplyKeyboard` در همان فایل کمکی جدید (`src/services/post-reply-keyboard.service.ts`) تعریف می‌شود:
```ts
import { cache } from '../utils/cache';
import { Markup } from 'telegraf';
import { settingsService } from './settings.service';

export async function syncPostReplyKeyboard(ctx: any, postId: number, messages: any[]): Promise<void> {
  const userId = ctx.from.id;
  const cacheKey = `postReplyKb:lastPostId:${userId}`;
  const rows = buildReplyKeyboardFromMessages(messages);
  const hasCustom = rows.length > 0;
  const newState = hasCustom ? String(postId) : 'MAIN_MENU';
  const prevState = cache.get<string>(cacheKey) ?? 'MAIN_MENU';   // فرض اولیه: کاربر روی منوی اصلی است
  if (newState === prevState) return;   // چیزی عوض نشده — هیچ پیام اضافه‌ای فرستاده نمی‌شود

  if (hasCustom) {
    await ctx.reply('⌨️ منوی این بخش:', Markup.keyboard(rows).resize().persistent());
  } else {
    const mainMenuKb = await settingsService.getResolvedMainMenuKeyboard(userId);   // بند ۲.۷ — متد جدید در settings.service.ts
    await ctx.reply('↩️ بازگشت به منوی اصلی:', mainMenuKb);
  }
  cache.setPermanent(cacheKey, newState);
}
```
(متن هر دو پیام کوتاه و غیرخالی است — طبق درسِ باگ رشتهٔ خالی که در ماژول اخبار پیدا شد.)

### ۲.۷. ⚠️ ریسک وابستگیِ حلقوی (Circular Import) — و راه‌حلش

تابع `adminReplyOptions(telegramId?)` (در `src/bot/handlers/index.ts`، خط ۱۲۹) از قبل تمام زمینهٔ لازم (وضعیت ادمین، Feature Toggle ها، چیدمان منو، حالت نمایش) را جمع کرده و مستقیماً `buildMainMenuKeyboard(...)` درست را برمی‌گرداند — دقیقاً چیزی که برای «بازگشت به منوی اصلی» در بند ۲.۶ لازم است.

**اما مستقیماً import کردن این تابع از `handlers/index.ts` داخل `post-reply-keyboard.service.ts` اشتباه است** و باید از آن پرهیز شود: `post-message.service.ts` (که `post-reply-keyboard.service.ts` را import می‌کند) از قبل توسط خودِ `handlers/index.ts` (به‌طور مستقیم یا از طریق `shared.ts`) import می‌شود — یعنی مسیر `post-message.service.ts → post-reply-keyboard.service.ts → handlers/index.ts → (...) → post-message.service.ts` یک **وابستگی حلقوی واقعی** می‌سازد. وابستگی حلقوی در Node.js/TypeScript گاهی «به‌ظاهر» کار می‌کند ولی به‌محض تغییر ترتیب import ها یا زمان مقداردهی، به خطاهای runtime کاملاً نامشخص (مثل `undefined is not a function`) منجر می‌شود — دقیقاً از همان دسته باگ‌های ظریف و بی‌رحمی که این پروژه باید از آن‌ها در امان بماند.

**راه‌حل: انتقال منطق به یک لایهٔ پایین‌تر که هر دو طرف بی‌خطر می‌توانند از آن import کنند.** بررسی importهای فعلی هر دو فایل نشان داد این کاملاً امن است:
- `src/bot/keyboards/index.ts` (که `buildMainMenuKeyboard` در آن است) هیچ importی از `settings.service.ts` ندارد.
- `src/services/settings.service.ts` هیچ importی از `bot-admin.service.ts` یا `bot/keyboards/index.ts` ندارد (فعلاً) — افزودنشان مشکلی ایجاد نمی‌کند چون این‌ها خودشان به‌عقب به `settings.service.ts` وابسته نیستند.

پس منطق تابع، **بدون تغییر رفتار**، به یک متد جدید در `settings.service.ts` منتقل می‌شود:
```ts
// اضافه به src/services/settings.service.ts (importهای جدید لازم در بالای فایل:
// import { botAdminService } from './bot-admin.service';
// import { buildMainMenuKeyboard } from '../bot/keyboards';  )

async getResolvedMainMenuKeyboard(telegramId?: number) {
  const admin = telegramId ? await botAdminService.getActive(telegramId).catch(() => null) : null;
  const features = await this.getFeatureMap();
  const menuLayout = await this.getResolvedMenuLayout(true).catch(() => []);
  const displayMode = await this.getMenuDisplayMode().catch(() => 'always_open' as const);
  return buildMainMenuKeyboard(Boolean(admin), features, menuLayout, displayMode);
}
```
و تابع محلیِ موجود در `handlers/index.ts` به یک پوستهٔ نازک تبدیل می‌شود (بدون تغییر امضا، پس هر ۵ محل فراخوانیِ فعلیِ `adminReplyOptions` در همان فایل دست‌نخورده می‌مانند):
```ts
async function adminReplyOptions(telegramId?: number) {
  return settingsService.getResolvedMainMenuKeyboard(telegramId);
}
```
حالا `post-reply-keyboard.service.ts` فقط از `settingsService.getResolvedMainMenuKeyboard(...)` استفاده می‌کند — یک import کاملاً امن و یک‌طرفه (service → service)، دقیقاً هم‌الگو با importهای دیگرِ خودِ همین پروژه (مثلاً `post.service.ts` که `postRepository` را import می‌کند).

### ۲.۸. مسیر بازگشت: وقتی کاربر روی یک دکمهٔ Reply-Keyboard-فعال می‌زند

چون تپ روی یک دکمهٔ Reply Keyboard هیچ `callback_query` تولید نمی‌کند — فقط متن دکمه را به‌عنوان یک پیام معمولی برمی‌گرداند — نمی‌توان برای هر متنِ دکمه از قبل و به‌طور ثابت یک `bot.hears` مجزا ثبت کرد (چون این متن‌ها توسط ادمین‌ها پویا ساخته/تغییر می‌کنند و ممکن است بین پست‌های مختلف تکراری هم باشند). راه‌حل: **دقیقاً همان cache ای که برای ردیابی «وضعیت فعلی Reply Keyboard» در بند ۱.۶/۲.۶ ساختیم را دوباره استفاده می‌کنیم** — یعنی زمینهٔ لازم برای «این متن به کدام دکمه اشاره دارد» از قبل داریم:

```ts
// یک هندلر عمومی و واحد، ثبت‌شده در انتهای زنجیرهٔ bot.on('text') (بعد از تمام هندلرهای حالت‌دارِ ادمین)
bot.on('text', async (ctx: any, next) => {
  const userId = ctx.from.id;
  const activePostId = cache.get<string>(`postReplyKb:lastPostId:${userId}`);
  if (!activePostId || activePostId === 'MAIN_MENU') return next();

  // برخلاف نقطهٔ تزریق داخل sendPostToChat (بند ۲.۶) که فقط آرایهٔ خام پیام‌ها را در اختیار دارد،
  // این‌جا از postService.findById استفاده می‌کنیم چون این تابع از قبل post.messages را
  // (با include کامل، مرتب‌شده بر اساس order) برمی‌گرداند — دقیقاً همان شکلی که
  // findReplyKeyboardButtonByText نیاز دارد.
  const post = await postService.findById(Number(activePostId));
  if (!post) return next();
  const original = findReplyKeyboardButtonByText(post.messages || [], ctx.message.text);
  if (!original) return next();   // این متن، دکمهٔ این کیبورد نیست — به بقیهٔ هندلرها بده

  if (original.type === 'COMMAND') {
    const target = await postService.resolveCommand(original.value);
    if (!target) return ctx.reply('❌ این بخش دیگر در دسترس نیست.');
    await postService.incrementViews(target.id, undefined, BigInt(userId));
    await sendPostToUser(ctx, target);   // بدون editTarget — این یک bot.hears نیست، پیام کاربر یک متن ساده بود
    return;
  }
  if (original.type === 'POPUP') {
    await ctx.reply(original.value || '✅');
    return;
  }
  return next();
});
```

**چرا این طراحی از تداخل نام دکمه بین پست‌های مختلف در امان است:** تشخیص «این متن به کدام دکمه اشاره دارد» **کاملاً وابسته به context است** — یعنی «کدام پست، طبق cache، الان Reply Keyboard این کاربر خاص را تنظیم کرده»، نه یک جدول سراسری از تمام متن‌های ممکن. دو پست مختلف کاملاً می‌توانند یک دکمه با متن یکسان داشته باشند، بدون هیچ تداخلی — چون هیچ‌وقت هم‌زمان هر دو «فعال» نیستند برای یک کاربر مشخص.

**نکتهٔ حیاتی دربارهٔ ترتیب ثبت:** این هندلر باید **بعد از تمام هندلرهای متنی حالت‌دارِ ادمین** (مثل `wait_url`/`wait_popup`/`wait_command`/`wait_color` که در همین فایل `post-handlers.ts` هستند، و بعد از هندلرهای مشابه در ماژول اخبار/اتوماسیون) ثبت شود — دقیقاً چون همهٔ آن‌ها به‌درستی `return next()` می‌زنند وقتی state خودشان فعال نیست، این هندلر جدید باید در انتهای زنجیره باشد تا هیچ‌وقت پیامی را که برای یک state ادمینِ دیگر در نظر گرفته شده، اشتباهی نبلعد.

### ۲.۹. تعامل با قابلیت «ادیت‌درجا» (فاز قبلی)

قابلیت «ادیت‌درجا» (`navEditInPlace`، فاز قبلی) و این قابلیت جدید، **کاملاً مستقل و متعامد** هستند — هرکدام یک بُعد متفاوت از «چطور یک پست تحویل داده می‌شود» را کنترل می‌کنند:

| بُعد | کنترل‌شده توسط | تأثیر می‌گذارد روی |
|---|---|---|
| آیا محتوای پیام ادیت می‌شود یا پیام تازه ساخته می‌شود | `post.navEditInPlace` (روی خودِ پست) | حباب پیامِ محتوای اصلی |
| آیا Reply Keyboard پایین صفحه عوض می‌شود | `button.isReplyKeyboard` (روی هر دکمه) | کیبورد سطح-چت، مستقل از حباب پیام |

این دو کاملاً می‌توانند هم‌زمان فعال باشند: یک پست می‌تواند هم `navEditInPlace: true` داشته باشد (محتوایش ادیت می‌خورد) و هم دکمه‌های Reply-Keyboard-فعال (کیبورد پایین هم عوض می‌شود) — این دو تغییر **در دو پیام متفاوت** اتفاق می‌افتند (یکی ادیت پیام موجود، دیگری یک پیام کوتاه جدید برای کیبورد)، دقیقاً به این خاطر که Bot API ادیت‌کردن و تغییرِ Reply Keyboard را در یک عملیات ترکیب نمی‌کند (طبق بند ۱.۵).

**یک نکتهٔ ظریف مهم:** وقتی کاربر از طریق تپ روی یک دکمهٔ Reply-Keyboard (بند ۲.۸) به پست بعدی می‌رود، این یک **پیام متنی معمولی** است، نه یک callback از دکمهٔ inline — یعنی هیچ `ctx.callbackQuery.message` ای برای ادیت‌درجا وجود ندارد. پس حتی اگر پست مقصد `navEditInPlace: true` داشته باشد، این مسیر همیشه پیام محتوای جدید می‌سازد (نه ادیت) — دقیقاً هم‌راستا با تصمیم #۲ سند «ادیت‌درجا» («ادیت‌درجا فقط روی مسیر کلیک روی دکمهٔ inline اثر دارد؛ رسیدن از طریق ریپلای‌کیبورد، پیام جدید می‌فرستد»). این رفتار از قبل، بدون هیچ تغییر اضافه‌ای، درست است — چون `sendPostToUser(ctx, target)` در بند ۲.۸ بدون `editTarget` فراخوانی می‌شود.

---

## ۳. تصمیمات صریح (قابل تغییر با یک پیام)

| # | تصمیم | چرا |
|---|---|---|
| ۱ | نشانگر «این دکمه Reply-Keyboard است» در گرید ادمین، یک **پیشوند ایموجی («⌨️»)** است، نه رنگ بومی آبی. | طبق بند ۱.۳: «آبی» (Primary) از قبل معنای واقعی و متفاوتی دارد («رنگ نهاییِ این دکمه برای کاربر»)؛ استفادهٔ دوباره از همان رنگ برای این نشانگر، دقیقاً همان ابهامی می‌سازد که هدف شما («ادمین بفهمه») را نقض می‌کند. |
| ۲ | این قابلیت فقط برای دکمه‌های نوع ⌨️ دستور و 🪟 POP-UP در دسترس است؛ برای 🔗 لینک یا اشتراک اصلاً نمایش داده نمی‌شود. | محدودیت واقعی پلتفرم تلگرام (بند ۱.۴) — دکمهٔ Reply Keyboard هیچ راهی برای باز‌کردن مستقیم URL ندارد. |
| ۳ | تپ روی یک دکمهٔ Reply-Keyboard از نوع POP-UP، متن آن را به‌صورت یک **پیام معمولی** نشان می‌دهد، نه یک Alert بومی تلگرام. | تپ روی دکمهٔ Reply Keyboard هیچ `callback_query` تولید نمی‌کند؛ `answerCbQuery` (که Alert بومی را می‌سازد) اصلاً در این مسیر در دسترس نیست. این نزدیک‌ترین معادل ممکن است. |
| ۴ | Style/رنگ دکمه (🎨) به دکمهٔ Reply Keyboard منتقل نمی‌شود — دکمه‌های Reply Keyboard همیشه ساده و بدون رنگ‌اند. | شما فقط دربارهٔ محل نمایش (inline/reply) صحبت کردید، نه رنگ آن‌جا؛ ساده نگه‌داشتن این مسیر (بدون نیاز به بررسی/تست جداگانهٔ رفتار `style` روی `KeyboardButton`) ریسک را کم می‌کند. اگر خواستید تغییر کند، درخواستی جداست. |
| ۵ | تپ روی toggle، **فوری** است (بدون صفحهٔ تأیید میانی) — دقیقاً مثل ✅ انتشار / 📤 لغو انتشار. | این یک عملیات کم‌خطر و کاملاً قابل‌بازگشت است (یک تپ دیگر آن را برمی‌گرداند)؛ افزودن یک مرحلهٔ تأیید فقط اصطکاک بی‌دلیل اضافه می‌کند. |
| ۶ | ردیابیِ «کدام Reply Keyboard الان فعال است» بر اساس **شناسهٔ پست** انجام می‌شود، نه هش کامل محتوای دکمه‌ها. | ساده‌ترین انتخابِ کافی: اگر ادمین وسط بازدید یک کاربر از همان پست، دکمه‌هایش را عوض کند (سناریویی بسیار نادر)، تا بازدید بعدیِ همان کاربر از یک پست دیگر، به‌روز می‌شود. پیچیده‌کردن این مکانیزم برای این edge-case کمیاب، ارزش ریسک اضافه را ندارد. |
| ۷ | این رفتار (تغییر خودکار Reply Keyboard) برای **همهٔ** کاربران، شامل خودِ ادمین وقتی پیش‌نمایش می‌گیرد، یکسان اعمال می‌شود — بدون حالت خاص برای ادمین. | `sendPostToChat` راهی ساده برای تشخیص «این فراخوانی از طرف ادمین است یا کاربر عادی» ندارد؛ اعمال یکسان، ساده‌ترین و کم‌ریسک‌ترین راه است، و برای پیش‌نمایش هم منطقی است (ادمین دقیقاً همان چیزی را می‌بیند که کاربر خواهد دید). |
| ۸ | پیامِ حاملِ Reply Keyboard فقط در **گذار** (وقتی وضعیت واقعاً عوض می‌شود) فرستاده می‌شود، نه در هر بار باز شدن هر پستی. | جلوگیری از اسپم پیام برای پست‌های معمولیِ بی‌ربط به این قابلیت (بند ۱.۶) — دقیقاً مطابق توصیف خودتان («وقتی از این پست خارج می‌شیم و به پست بعدی می‌ریم»). |
| ۹ | هیچ سقف تعداد برای دکمه‌های Reply-Keyboard-فعال یک پست اعمال نشده. | چیزی در درخواست شما به این سقف اشاره نداشت؛ اگر در عمل به مشکل خورد (کیبورد خیلی شلوغ شد)، افزودن یک محدودیت بعداً ساده است. |

---

## ۴. تغییرات دقیق، فایل‌به‌فایل

### ۴.۱. `src/services/settings.service.ts`

⚠️ **نکتهٔ پیاده‌سازی:** `settingsService` نمونه‌ای از `class SettingsService { ... }` است (نه یک object literal ساده)؛ متد جدید زیر باید **داخل بدنهٔ همان کلاس** (کنار متدهای موجود مثل `getFeatureMap`) اضافه شود، نه به‌عنوان یک تابع مستقل بعد از بستن کلاس — وگرنه `this.getFeatureMap()` و بقیهٔ فراخوانی‌های داخلی کار نمی‌کنند.

- دو import جدید در بالای فایل: `import { botAdminService } from './bot-admin.service';` و `import { buildMainMenuKeyboard } from '../bot/keyboards';`
- متد جدید `getResolvedMainMenuKeyboard(telegramId?: number)` طبق کد کامل بند ۲.۷ اضافه شود.

### ۴.۲. `src/bot/handlers/index.ts`

- بدنهٔ تابع محلیِ `adminReplyOptions` (خط ۱۲۹) با یک خط جایگزین شود: `return settingsService.getResolvedMainMenuKeyboard(telegramId);` — امضای تابع و هر ۵ محل فراخوانی‌اش کاملاً دست‌نخورده می‌مانند. هیچ تغییر دیگری در این فایل لازم نیست.

### ۴.۳. `src/bot/keyboards/post-keyboards.ts`

- `buildEditButtonTypeKeyboard`: دو پارامتر اختیاری جدید (`currentType?`, `isReplyKeyboard?`) + منطق شرطیِ ردیف جدید، دقیقاً طبق کد کامل بند ۲.۲.
- `buildButtonEditorInlineKeyboard`: خط ساخت برچسب هر دکمه در گرید (`Markup.button.callback(...)`) طبق بند ۲.۴ تغییر کند تا پیشوند `⌨️` را (وقتی `btn.isReplyKeyboard` باشد) اضافه کند.

### ۴.۴. `src/bot/handlers/post-handlers.ts`

- هندلر جدید `bot.action(/^pbedit:replykb:(\d+):(\d+):(\d+)$/, ...)` طبق کد کامل بند ۲.۳ اضافه شود — پیشنهاد می‌شود بلافاصله بعد از هندلر موجود `bot.action(/^pbedit:color:(\d+):(\d+):(\d+)$/, ...)`.
- تنها محل فراخوانی موجودِ `buildEditButtonTypeKeyboard` (داخل `pbedit:click`، شاخهٔ `mode === 'edit'`، خط ۲۰۴۴ فعلی) به‌روزرسانی شود تا دو آرگومان جدید را هم بدهد:
  ```ts
  // فعلی:
  buildEditButtonTypeKeyboard(postId, row, col, btn.style));
  // جدید:
  buildEditButtonTypeKeyboard(postId, row, col, btn.style, btn.type, btn.isReplyKeyboard));
  ```

### ۴.۵. فایل کاملاً جدید: `src/services/post-reply-keyboard.service.ts`

شامل `buildReplyKeyboardFromMessages`، `findReplyKeyboardButtonByText`، `syncPostReplyKeyboard` — دقیقاً طبق کد کامل بندهای ۲.۵ و ۲.۶.

### ۴.۶. `src/services/post-message.service.ts`

- import جدید: `import { syncPostReplyKeyboard } from './post-reply-keyboard.service';`
- در `sendPostToChat`: خط ساخت `reply_markup` (خط ۲۳۹-۲۴۰ فعلی) طبق بند ۲.۶ به فیلترکردن `isReplyKeyboard` مجهز شود.
- در انتهای `sendPostToChat` (بعد از پایان حلقهٔ `for`): `await syncPostReplyKeyboard(ctx, postId, validated);`

### ۴.۷. فایل کاملاً جدید: `src/bot/handlers/post-reply-keyboard.handlers.ts`

```ts
import { Telegraf } from 'telegraf';
import { postService } from '../../services/post.service';
import { sendPostToUser } from '../shared';
import { cache } from '../../utils/cache';
import { findReplyKeyboardButtonByText } from '../../services/post-reply-keyboard.service';

export function registerPostReplyKeyboardHandlers(bot: Telegraf) {
  bot.on('text', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const activePostId = cache.get<string>(`postReplyKb:lastPostId:${userId}`);
    if (!activePostId || activePostId === 'MAIN_MENU') return next();

    const post = await postService.findById(Number(activePostId));
    if (!post) return next();
    const original = findReplyKeyboardButtonByText(post.messages || [], ctx.message.text);
    if (!original) return next();

    if (original.type === 'COMMAND') {
      const target = await postService.resolveCommand(original.value);
      if (!target) return ctx.reply('❌ این بخش دیگر در دسترس نیست.');
      await postService.incrementViews(target.id, undefined, BigInt(userId));
      await sendPostToUser(ctx, target);
      return;
    }
    if (original.type === 'POPUP') {
      await ctx.reply(original.value || '✅');
      return;
    }
    return next();
  });
}
```
(دقیقاً کد کامل بند ۲.۸، فقط این‌بار در قالب یک فایل و تابع export-شدهٔ مستقل — تا بتوان آن را **آخرین** مورد در `src/index.ts` ثبت کرد، بدون این‌که مجبور باشیم فایل‌های handler دیگر را برای جای‌دادن این یک هندلر باز کنیم.)

### ۴.۸. `src/index.ts`

کنار importهای موجود:
```ts
import { registerPostReplyKeyboardHandlers } from './bot/handlers/post-reply-keyboard.handlers';
```
و کنار فراخوانی‌های موجود، **آخرین مورد** (بعد از `registerNewsHandlers(bot);`):
```ts
registerPostReplyKeyboardHandlers(bot);
```
**این ترتیب آخر بودن، عمدی و حیاتی است** (طبق بند ۲.۸) — تا این هندلر جدید هرگز پیامی را که برای یک state حالت‌دارِ ادمینِ دیگر (مثلاً `wait_url`/`wait_color`/حالت‌های ماژول اخبار) در نظر گرفته شده، اشتباهی نبلعد؛ همهٔ آن‌ها اول شانس رسیدگی به پیام را دارند و فقط اگر واقعاً به آن‌ها مربوط نبود (`next()` زده باشند)، نوبت به این هندلر می‌رسد.

هیچ تغییری در: `prisma/schema.prisma`، هیچ مدل دیتابیس، ویرایشگر منوی اصلی (فاز قبلی)، ماژول اخبار فارکس، یا هیچ فایل خارج از این ۸ مورد.

---

## ۵. نقاط ریسک و لبه‌های تیز (باید صریحاً تست شوند)

| # | سناریو | رفتار مورد انتظار |
|---|---|---|
| ۱ | ادمین سعی می‌کند دکمهٔ نوع 🔗 لینک یا اشتراک را Reply-Keyboard کند | ردیف toggle اصلاً نمایش داده نمی‌شود (بند ۱.۴)؛ حتی با callback_data دستکاری‌شده، هندلر خودش هم رد می‌کند (پیام هشدار، بدون تغییر داده) |
| ۲ | دو پست مختلف، هرکدام یک دکمهٔ Reply-Keyboard-فعال با متن کاملاً یکسان دارند | چون تشخیص «این متن به کدام دکمه اشاره دارد» وابسته به context (کدام پست الان برای این کاربر خاص فعال است) است، نه یک جدول سراسری، هیچ تداخلی رخ نمی‌دهد |
| ۳ | کاربر از پستی با Reply Keyboard سفارشی، به پستی بدون هیچ دکمهٔ Reply-Keyboard-فعال می‌رود | یک پیامِ کوتاهِ «↩️ بازگشت به منوی اصلی» با کیبورد اصلی فرستاده می‌شود؛ کش وضعیت به‌روزرسانی می‌شود |
| ۴ | کاربر بین چند پستِ معمولیِ بدون این ویژگی جابه‌جا می‌شود | چون وضعیتِ ردیابی‌شده («MAIN_MENU») هیچ‌وقت عوض نمی‌شود، **هیچ پیام اضافه‌ای** فرستاده نمی‌شود — نه در اولین پست، نه در بقیه |
| ۵ | ادمین، درست وقتی کاربری آن پست را باز کرده، یک دکمه را از حالت Reply-Keyboard خارج می‌کند | تپ بعدیِ کاربر روی همان دکمهٔ (فیزیکاً هنوز قابل‌مشاهده در کیبوردش) هیچ اثری نمی‌کند و بی‌صدا به هندلرهای بعدی سپرده می‌شود (`findReplyKeyboardButtonByText` هر بار دادهٔ تازه می‌خواند)؛ کیبورد پایینِ کاربر با اولین باز‌کردنِ پستِ بعدی خودش را اصلاح می‌کند. این یک اثر جانبیِ شناخته‌شده و بی‌خطرِ طراحیِ «فقط در گذار پیام بفرست» (تصمیم #۸) است، نه یک باگ. |
| ۶ | یک پیام از یک پست چندپیامی، هم دکمهٔ Reply-Keyboard-فعال دارد و هم دکمهٔ inline معمولی | همان پیام، Inline Keyboard اش را فقط با دکمه‌های غیرعلامت‌خورده می‌سازد؛ دکمهٔ علامت‌خورده منحصراً در پیامِ جداگانهٔ حاملِ Reply Keyboard ظاهر می‌شود — هرگز روی هر دو هم‌زمان |
| ۷ | دکمهٔ Reply-Keyboard-فعال روی پیامِ **میانیِ** یک پست چندپیامی است (نه اول، نه آخر) | بدون مشکل جمع‌آوری می‌شود؛ `buildReplyKeyboardFromMessages` تمام پیام‌ها را صرف‌نظر از موقعیتشان می‌گردد |
| ۸ | تپ روی دکمهٔ Reply-Keyboard از نوع COMMAND، به پستی اشاره دارد که دیگر وجود ندارد/حذف شده | پیام خطای «❌ این بخش دیگر در دسترس نیست.» بدون کرش |
| ۹ | تپ سریع و پشت‌سرهم روی همان دکمهٔ Reply-Keyboard | هر تپ مستقل پردازش می‌شود؛ هیچ state مشترکی بین دو تپ نیست که خراب شود — دقیقاً هم‌رفتار با تپ مکرر روی دکمه‌های inline |
| ۱۰ | متنی که کاربر می‌فرستد، تصادفاً با متنِ یک دکمهٔ Reply-Keyboard **پستِ دیگری** (نه پستِ فعلاً ردیابی‌شده برای این کاربر) یکی است | تشخیص فقط بر اساس پستِ **ردیابی‌شده برای همین کاربر** انجام می‌شود؛ تطبیق با پست‌های دیگر اصلاً بررسی نمی‌شود |
| ۱۱ | یک ادمین (که خودش هم کاربر است) وسط تایپ عنوان یک پست جدید در پنل ادمین است، و متنش تصادفاً با یک دکمهٔ Reply-Keyboard تطابق دارد | چون هندلر جدید **آخرین** مورد در زنجیرهٔ `bot.on('text')` ثبت شده، هندلر state-دارِ ادمین (که زودتر ثبت شده) پیام را زودتر می‌بلعد و هرگز به این هندلر نمی‌رسد |

---

## ۶. لوپ اجرایی — مرحله‌به‌مرحله برای ایجنت

هر پرامپت را با این جمله شروع کنید:

> «فایل `post-button-reply-keyboard-spec.md` را که در ریشهٔ مخزن است کامل بخوان و مرجع اصلی قرار بده. قبل از هر ویرایش، فایل واقعی مقصد را از دیسک بخوان تا نقل‌قول‌های سند را با کد فعلی مطابقت بدهی؛ اگر مطابقت نداشت، بر اساس جست‌وجوی متنیِ نام تابع (نه شمارهٔ خط) نقطهٔ درست را پیدا کن و اگر پیدا نشد متوقف شو و گزارش بده.»

### مرحلهٔ ۰ — صحت‌سنجی پیش از شروع

```
طبق بخش ۱ فایل post-button-reply-keyboard-spec.md، این موارد را در کد فعلی تأیید کن:
- src/services/post.service.ts → بلوک «Sync post.buttons to post_messages.replyMarkup» داخل update()
  (باید هنوز کل آبجکت دکمه را بدون allow-list محدود، هم در replyMarkup و هم در post_keyboards.payload حفظ کند)
- src/services/renderer/telegram-native-renderer.service.ts → بلوک «Preserve all extra properties from
  original button» در buttonToTelegram
- src/bot/keyboards/post-keyboards.ts → buildEditButtonTypeKeyboard (امضای فعلی، ۴ پارامتر) و
  buildButtonColorSelectionKeyboard (گزینهٔ «🔵 Primary (آبی)»)
- src/bot/handlers/post-handlers.ts → هندلر pbedit:click (شاخهٔ mode==='edit')، تنها محل فراخوانی
  buildEditButtonTypeKeyboard
- src/services/post-message.service.ts → sendPostToChat (خط ساخت buttons/reply_markup، و این‌که از
  loadPostMessages/validated استفاده می‌کند نه یک آبجکت Post کامل)
- src/bot/handlers/index.ts → تابع adminReplyOptions (خط ۱۲۹) و هر ۵ محل فراخوانی‌اش
- src/services/settings.service.ts و src/bot/keyboards/index.ts → تأیید کن هیچ‌کدام از این دو، دیگری را
  import نمی‌کند (برای اطمینان از عدم وابستگی حلقوی طبق بند ۲.۷)
اگر همه مطابق بود، بنویس «تأیید شد، آماده برای مرحلهٔ ۱». اگر مغایرتی دیدی، دقیق گزارش بده و منتظر بمان —
مخصوصاً اگر ساختار سه‌لایهٔ ذخیره‌سازی دکمه (بند ۱.۱) دیگر برقرار نبود، چون کل این قابلیت روی آن سوار است.
```

**معیار پذیرش:** تأیید صریح یا گزارش دقیق مغایرت‌ها؛ صفر تغییر کد در این مرحله.

### مرحلهٔ ۱ — رفع وابستگی حلقویِ بالقوه (پیش‌نیاز، قبل از هر چیز دیگر)

```
طبق بخش ۲.۷ و بند ۴.۱/۴.۲ فایل post-button-reply-keyboard-spec.md:
1. متد getResolvedMainMenuKeyboard را دقیقاً طبق کد سند به src/services/settings.service.ts اضافه کن
   (با دو import جدید: botAdminService از './bot-admin.service'، و buildMainMenuKeyboard از '../bot/keyboards').
2. بدنهٔ تابع adminReplyOptions در src/bot/handlers/index.ts را با یک خط جایگزین کن که
   settingsService.getResolvedMainMenuKeyboard(telegramId) را صدا می‌زند و برمی‌گرداند — امضای تابع و
   نام آن دست‌نخورده بماند تا هر ۵ محل فراخوانی فعلی‌اش نیازی به تغییر نداشته باشند.
npx tsc --noEmit را اجرا کن؛ باید تمیز باشد. با یک تست دستی سریع (مثلاً زدن /start یا هر دکمه‌ای که
منوی اصلی را نشان می‌دهد) تأیید کن منوی اصلی هنوز دقیقاً مثل قبل ظاهر می‌شود — این مرحله نباید هیچ
تغییر رفتاری قابل‌مشاهده‌ای داشته باشد.
```

**معیار پذیرش:** `tsc --noEmit` تمیز؛ منوی اصلی/پنل ادمین دقیقاً مثل قبل از این تغییر کار می‌کند (رگرسیون صفر).

### مرحلهٔ ۲ — فیلد جدید و کیبورد ویرایشگر دکمه

```
طبق بخش‌های ۲.۱، ۲.۲، ۲.۴ و ۴.۳ فایل post-button-reply-keyboard-spec.md، در src/bot/keyboards/post-keyboards.ts:
1. buildEditButtonTypeKeyboard را با دو پارامتر اختیاری جدید (currentType?, isReplyKeyboard?) و منطق
   شرطیِ ردیف toggle، دقیقاً طبق کد سند بازنویسی کن.
2. در buildButtonEditorInlineKeyboard، خط ساخت برچسب هر دکمه در گرید را طبق بند ۲.۴ تغییر بده تا پیشوند
   ⌨️ را (وقتی btn.isReplyKeyboard) اضافه کند.
npx tsc --noEmit را اجرا کن — چون هنوز محل فراخوانی موجود بازنویسی‌شدهٔ تابع اول به‌روز نشده، ممکن است
بدون خطا کامپایل شود (چون پارامترهای جدید اختیاری‌اند) — این طبیعی است.
```

**معیار پذیرش:** `tsc --noEmit` تمیز.

### مرحلهٔ ۳ — هندلر toggle و به‌روزرسانی محل فراخوانی موجود

```
طبق بخش‌های ۲.۳ و ۴.۴ فایل post-button-reply-keyboard-spec.md، در src/bot/handlers/post-handlers.ts:
1. هندلر جدید bot.action(/^pbedit:replykb:(\d+):(\d+):(\d+)$/, ...) را دقیقاً طبق کد کامل سند اضافه کن
   — با دقت کامل که از متغیر newIsReplyKeyboard (نه btn.isReplyKeyboard که بعد از خط جایگزینی دیگر
   مقدار قدیمی/منقضی است) در همه‌جای بعد از toggle استفاده شود؛ این دقیقاً همان نکته‌ای است که سند با
   جزئیات کامل توضیح داده — لطفاً این بخش را با دقت مضاعف بررسی کن.
2. تنها محل فراخوانی موجود buildEditButtonTypeKeyboard (داخل pbedit:click، شاخهٔ mode==='edit') را طبق
   بند ۴.۴ به‌روزرسانی کن تا btn.type و btn.isReplyKeyboard را هم بدهد.
npx tsc --noEmit را اجرا کن.
```

**معیار پذیرش:** `tsc --noEmit` تمیز؛ تست دستی: باز‌کردن یک دکمهٔ نوع دستور در ویرایشگر → دکمهٔ «⌨️ نمایش در Reply Keyboard» دیده می‌شود → زدنش → همان پیام (بدون پیام جدید) با برچسب «↩️ بازگشت به Inline» و متن وضعیت «⌨️ Reply Keyboard: روشن» به‌روزرسانی می‌شود؛ در گرید کلی دکمه‌ها، همین دکمه حالا پیشوند ⌨️ دارد.

### مرحلهٔ ۴ — لایهٔ ساخت Reply Keyboard و تزریق در تحویل پست

```
طبق بخش‌های ۲.۵، ۲.۶ و ۴.۵/۴.۶ فایل post-button-reply-keyboard-spec.md:
1. فایل جدید src/services/post-reply-keyboard.service.ts را با سه تابع
   (buildReplyKeyboardFromMessages, findReplyKeyboardButtonByText, syncPostReplyKeyboard) دقیقاً طبق
   کد کامل سند بساز.
2. در src/services/post-message.service.ts، خط ساخت buttons/reply_markup داخل sendPostToChat را طبق
   بند ۲.۶ به فیلترکردن isReplyKeyboard مجهز کن، و بعد از پایان حلقهٔ ارسال پیام‌ها،
   await syncPostReplyKeyboard(ctx, postId, validated); را اضافه کن — با استفاده از دقیقاً همین دو
   متغیر موجود (postId, validated)، نه متغیر جدید.
npx tsc --noEmit را اجرا کن.
```

**معیار پذیرش:** `tsc --noEmit` تمیز؛ بازبینی دستی diff نشان دهد فقط همین دو نقطهٔ مشخص در `sendPostToChat` تغییر کرده.

### مرحلهٔ ۵ — مسیریابی تپ روی دکمهٔ Reply-Keyboard

```
طبق بخش‌های ۲.۸ و ۴.۷/۴.۸ فایل post-button-reply-keyboard-spec.md:
1. فایل جدید src/bot/handlers/post-reply-keyboard.handlers.ts را دقیقاً طبق کد کامل سند بساز.
2. در src/index.ts، import و فراخوانیِ registerPostReplyKeyboardHandlers(bot) را اضافه کن — با تضمین
   این‌که این فراخوانی *آخرین* مورد در کل زنجیرهٔ registerXxxHandlers(bot) باشد (بعد از
   registerNewsHandlers(bot))؛ این ترتیب طبق بند ۲.۸ سند حیاتی است.
npx tsc --noEmit و npx vitest run را اجرا کن؛ همه باید سبز باشند.
```

**معیار پذیرش:** `tsc --noEmit` تمیز؛ `git diff --stat` نشان دهد دقیقاً ۸ فایل بخش ۴ همین سند تغییر/اضافه شده‌اند، هیچ فایل دیگری.

### مرحلهٔ ۶ — تست دستی سناریوی کامل شما

```
با یک ربات تست، به‌عنوان ادمین:
1. یک پست با چند دکمهٔ نوع «⌨️ دستور» بساز (یا از پست موجود «کد تخفیف پراپ‌ها» با زیرپست‌هایش
   «سرمایه‌گذار برتر»، «فنفیکس»، «پراپکو» استفاده کن).
2. روی دکمهٔ «سرمایه‌گذار برتر» و «فنفیکس»، از داخل ویرایشگر دکمه، «⌨️ نمایش در Reply Keyboard» را
   روشن کن؛ «پراپکو» را دست‌نزن (باید inline بماند).
3. تأیید کن در گرید کلی دکمه‌ها، فقط این دو دکمه پیشوند ⌨️ دارند.
4. به‌عنوان یک کاربر عادی، پست «کد تخفیف پراپ‌ها» را باز کن.
5. تأیید کن Inline Keyboard پیام فقط «پراپکو» را نشان می‌دهد (نه دو دکمهٔ دیگر).
6. تأیید کن بلافاصله یک پیام کوتاه با Reply Keyboard جدید می‌آید که «سرمایه‌گذار برتر» و «فنفیکس» را
   (در همان چیدمان ردیفی که در ادمین داشتند) نشان می‌دهد.
7. روی «سرمایه‌گذار برتر» در Reply Keyboard بزن؛ تأیید کن پست هدف باز می‌شود (به‌عنوان پیام جدید، چون
   این مسیر یک پیام متنی است نه کلیک inline).
8. از پستِ باز‌شده، به یک پستِ بدون هیچ دکمهٔ Reply-Keyboard-فعال برو؛ تأیید کن Reply Keyboard به‌طور
   خودکار به منوی اصلی برمی‌گردد.
9. دوباره یک پست معمولیِ بی‌ربط را باز کن؛ تأیید کن **هیچ** پیام اضافه‌ای برای Reply Keyboard فرستاده
   نمی‌شود (چون از قبل روی منوی اصلی بودی).
10. چک‌لیست بخش ۷ سند را کامل، یک‌به‌یک اجرا کن و نتیجه را گزارش بده.
```

**معیار پذیرش:** تمام موارد چک‌لیست بخش ۷ با ✅ گزارش شوند.

---

## ۷. چک‌لیست QA دستیِ نهایی (پوشش صددرصد این درخواست)

- [ ] در صفحهٔ «ویرایش این دکمه» (کنار 🔗 لینک یا اشتراک، 🪟 POP-UP، ⌨️ دستور، 🎨 رنگ)، یک دکمهٔ جدید inline برای Reply Keyboard دیده می‌شود — فقط وقتی نوع دکمه دستور یا POP-UP باشد.
- [ ] برای دکمهٔ نوع 🔗 لینک یا اشتراک، این گزینه اصلاً نمایش داده نمی‌شود.
- [ ] با تپ، بدون هیچ پیام جدید یا مرحلهٔ میانی، همان صفحه با برچسب و متن وضعیت به‌روزشده نمایش داده می‌شود.
- [ ] در گرید کلی دکمه‌های یک پست (لیستی که برای ایجاد/ویرایش/حذف/جابجایی نشان داده می‌شود)، هر دکمهٔ Reply-Keyboard-فعال یک پیشوند «⌨️» دارد که با نشانگر رنگ فعلی (🔵/🟢/🔴) تداخل ندارد.
- [ ] چهار عمل ایجاد، حذف، ویرایش، جابجایی — دقیقاً مثل قبل، بدون هیچ تغییر رفتاری — کار می‌کنند؛ همه‌چیز در پنل ادمین ۱۰۰٪ Inline باقی مانده.
- [ ] پستی با دکمه‌های ترکیبی (برخی Reply-Keyboard-فعال، برخی نه)، برای کاربر عادی: Inline Keyboard فقط دکمه‌های غیرعلامت‌خورده را نشان می‌دهد.
- [ ] بلافاصله بعد، یک پیامِ کوتاهِ جداگانه، Reply Keyboard جدید را با دقیقاً همان چیدمان ردیفی که در ادمین داشتند، نشان می‌دهد.
- [ ] تپ روی یک دکمهٔ Reply-Keyboard از نوع دستور، به پست هدفش می‌رود (به‌عنوان پیام جدید).
- [ ] تپ روی یک دکمهٔ Reply-Keyboard از نوع POP-UP، متنش را به‌عنوان یک پیام معمولی نشان می‌دهد.
- [ ] خروج از یک پست با Reply Keyboard سفارشی، به پستی بدون هیچ دکمهٔ فعال، Reply Keyboard را خودکار به منوی اصلی برمی‌گرداند.
- [ ] جابه‌جایی بین چند پستِ معمولیِ بی‌ربط به این ویژگی، هیچ پیام اضافهٔ غیرضروری تولید نمی‌کند.
- [ ] دو پست مختلف با دکمه‌های Reply-Keyboard هم‌نام، بدون هیچ تداخلی، هرکدام درست کار می‌کنند.
- [ ] `git diff --stat` نشان می‌دهد فقط ۸ فایل بخش ۴ همین سند تغییر/اضافه شده‌اند — هیچ فایل دیگری، از جمله ماژول اخبار، ویرایشگر منو، یا مدل‌های دیتابیس.
- [ ] `npx tsc --noEmit` تمیز است.

---

## ۸. خارج از دامنهٔ این فاز (عمداً دست‌نخورده)

| مورد | چرا خارج از دامنه است |
|---|---|
| مدل رابطه‌ای `PostButton` در schema.prisma | کد مرده است (بند ۱.۱) — منبع واقعی دکمه‌ها `PostMessage.replyMarkup` (+ `PostKeyboard` به‌عنوان آینه) است. لمس یا حذف این مدل بی‌ربط به این قابلیت و ریسک بی‌دلیل است. |
| انتقال رنگ (🎨) به دکمهٔ نهاییِ Reply Keyboard | طبق تصمیم #۴، عمداً ساده نگه داشته شد. دکمه‌های Reply Keyboard همیشه ساده‌اند. اگر خواستید بعداً اضافه شود، یک درخواست جداست. |
| سقف تعداد دکمه‌های Reply-Keyboard-فعال یک پست | طبق تصمیم #۹، هیچ محدودیتی تحمیل نشده؛ اگر در عمل کیبورد خیلی شلوغ شد، افزودن یک سقف ساده است. |
| نمایش Alert بومی (به‌جای پیام معمولی) برای POP-UP در حالت Reply Keyboard | یک محدودیت واقعی Bot API است (بند ۲.۸ / تصمیم #۳) — تپ روی دکمهٔ Reply Keyboard اصلاً `callback_query` تولید نمی‌کند. |
| اصلاح دو هندلر مردهٔ `post:nav:`/`post:user:nav:` (از فاز «ادیت‌درجا») | این‌ها ربطی به این قابلیت ندارند؛ همان‌طور که در سند «ادیت‌درجا» ثبت شد، عمداً دست‌نخورده می‌مانند. |
| تغییر صفحهٔ «🎨 رنگ» یا برچسب‌های آن (مثلاً تغییرِ نام «Primary (آبی)» به چیز دیگری برای کاهش ابهام آینده) | شما فقط دربارهٔ افزودن این قابلیت جدید صحبت کردید؛ دست‌نزدن به یک ویژگیِ کاملاً کارآمدِ موجود، طبق همان اصل «چهار عمل هیچ تغییری نکنه» است. |
