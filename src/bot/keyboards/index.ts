// src/bot/keyboards/index.ts
// تمام صفحه‌کلیدهای ربات

import { Markup } from 'telegraf';
import { DiscountCode, PropFirm } from '@prisma/client';

type DiscountWithFirm = DiscountCode & {
  propFirm: PropFirm;
};

// ─── منوی اصلی ────────────────────────────────────────────
export function buildMainMenuKeyboard(isAdmin = false) {
  const rows = [
    ['🎯 کدهای تخفیف', '🏢 پراپ فرم‌ها'],
    ['🎰 قرعه‌کشی', '⭐️ امتیاز من'],
    ['🏆 لیدربورد', '👥 دعوت دوستان'],
    ['🔍 جستجو'],
  ];
  if (isAdmin) rows.push(['⚙️ پنل ادمین']);
  return Markup.keyboard(rows).resize().persistent();
}

export const mainMenuKeyboard = buildMainMenuKeyboard(false);

export const botAdminPanelKeyboard = Markup.keyboard([
  ['📢 فوروارد همگانی', '👥 مدیریت ادمین‌ها'],
  ['📊 گزارشات', '📣 ارسال اعلان'],
  ['⚙️ تنظیمات', '↩️ بازگشت به منوی اصلی'],
]).resize().persistent();

// ─── دسته‌بندی کدهای تخفیف ────────────────────────────────
export const categoryKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback(
      '💸 بیشترین تخفیف',
      'cat:HIGHEST_DISCOUNT'
    ),
    Markup.button.callback(
      '♾ بدون محدودیت زمانی',
      'cat:NO_TIME_LIMIT'
    ),
  ],
  [
    Markup.button.callback(
      '🆕 اولین خرید',
      'cat:FIRST_PURCHASE'
    ),
    Markup.button.callback(
      '2⃣ دو مرحله‌ای',
      'cat:TWO_PHASE_ONLY'
    ),
  ],
  [
    Markup.button.callback(
      '🕐 جدیدترین',
      'cat:NEWEST'
    ),
    Markup.button.callback(
      '🔥 محبوب‌ترین',
      'cat:MOST_POPULAR'
    ),
  ],
  [
    Markup.button.callback(
      '📋 همه کدها',
      'cat:ALL'
    ),
  ],
]);

// ─── نمایش کارت کد تخفیف ─────────────────────────────────
export function discountCardKeyboard(
  discount: DiscountWithFirm
) {
  const buttons: any[] = [];

  // دکمه لینک افیلیت
  if (discount.affiliateLink) {
    buttons.push([
      Markup.button.url(
        '🛒 خرید از لینک افیلیت',
        discount.affiliateLink
      ),
    ]);
  }

  // دکمه کپی کد
  buttons.push([
    Markup.button.callback(
      `📋 کپی کد: ${discount.code}`,
      `copy:${discount.id}`
    ),
  ]);

  // دکمه برگشت
  buttons.push([
    Markup.button.callback(
      '« برگشت',
      'back:discounts'
    ),
  ]);

  return Markup.inlineKeyboard(buttons);
}

// ─── صفحه‌بندی ────────────────────────────────────────────
export function paginationKeyboard(
  currentPage: number,
  totalPages: number,
  callbackPrefix: string
) {
  const buttons: any[] = [];

  if (currentPage > 1) {
    buttons.push(
      Markup.button.callback(
        '◀️ قبلی',
        `${callbackPrefix}:${currentPage - 1}`
      )
    );
  }

  buttons.push(
    Markup.button.callback(
      `${currentPage} از ${totalPages}`,
      'noop'
    )
  );

  if (currentPage < totalPages) {
    buttons.push(
      Markup.button.callback(
        'بعدی ▶️',
        `${callbackPrefix}:${currentPage + 1}`
      )
    );
  }

  return Markup.inlineKeyboard([buttons]);
}

// ─── عضویت اجباری کانال ──────────────────────────────────
export function joinChannelsKeyboard(
  channels: Array<{
    title: string;
    inviteLink: string | null;
    channelId: string;
  }>
) {
  const buttons: any[] = channels.map((ch) => [
    Markup.button.url(
      `📢 عضویت در ${ch.title}`,
      ch.inviteLink ||
        `https://t.me/${ch.channelId.replace('@', '')}`
    ),
  ]);

  buttons.push([
    Markup.button.callback(
      '✅ عضو شدم، بررسی کن',
      'check:membership'
    ),
  ]);

  return Markup.inlineKeyboard(buttons);
}

// ─── قرعه‌کشی ─────────────────────────────────────────────
export function lotteryKeyboard(lotteryId: number, hasEntered: boolean) {
  const buttons = [
    [
      Markup.button.callback('🏆 برندگان', `lottery:winners:${lotteryId}`),
      Markup.button.callback('📜 تاریخچه', 'lottery:history'),
    ],
  ];

  if (hasEntered) {
    buttons.unshift([Markup.button.callback('✅ شما ثبت‌نام کرده‌اید', 'noop')]);
  } else {
    buttons.unshift([Markup.button.callback('🎰 شرکت در قرعه‌کشی', `lottery:enter:${lotteryId}`)]);
  }

  return Markup.inlineKeyboard(buttons);
}

export function lotteryHistoryKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('📜 تاریخچه قرعه‌کشی‌ها', 'lottery:history')]]);
}

