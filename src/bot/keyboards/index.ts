// src/bot/keyboards/index.ts
// تمام صفحه‌کلیدهای ربات

import { Markup } from 'telegraf';
import { DiscountCode, PropFirm } from '@prisma/client';
import { config } from '../../config';

type DiscountWithFirm = DiscountCode & {
  propFirm: PropFirm;
};

// ─── منوی اصلی (1:1 mapping from menu_layout stored text) ───
// WARNING: This function must NEVER resolve, transform, or merge buttons.
// The menu_layout is the single source of truth.
export function buildMainMenuKeyboard(
  isAdmin = false,
  _features: Record<string, boolean> = {},
  menuLayout?: any[][],
  displayMode: 'always_open' | 'toggle_allowed' = 'always_open'
) {
  if (menuLayout && menuLayout.length > 0) {
    const visibleRows = menuLayout
      .map(row =>
        row
          .filter((btn: any) => btn.visible !== false)
          .map((btn: any) => btn.text || '')
          .filter(Boolean)
      )
      .filter((row: string[]) => row.length > 0);

    if (isAdmin) {
      const allTexts = visibleRows.flat();
      if (!allTexts.includes('👨‍💼 پنل ادمین')) {
        visibleRows.push(['👨‍💼 پنل ادمین']);
      }
    }

    if (displayMode === 'toggle_allowed') {
      visibleRows.push(['🗕 بستن منو']);
    }

    return Markup.keyboard(visibleRows).resize().persistent();
  }

  return Markup.keyboard([['👨‍💼 پنل ادمین']]).resize().persistent();
}

export const mainMenuKeyboard = buildMainMenuKeyboard(false);

export function buildMiniAppProfileKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.webApp('🚀 باز کردن پروفایل من', config.miniApp.url)]]);
}

export function buildBotAdminPanelKeyboard(canBroadcast = false) {
  const rows: string[][] = [];
  if (canBroadcast) rows.push(['📢 پیام همگانی']);
  rows.push(['📝 پست‌ها']);
  rows.push(['🎛 ویرایش منو']);
  rows.push(['👥 مدیریت ادمین‌ها']);
  rows.push(['📊 گزارشات']);
  rows.push(['⚙️ تنظیمات', '↩️ بازگشت به منوی اصلی']);
  return Markup.keyboard(rows).resize().persistent();
}

// ─── انتخاب پراپ فرم برای کدهای تخفیف ─────────────────────
export function propFirmDiscountKeyboard(firms: Array<PropFirm & { _count?: { discountCodes: number } }>) {
  const rows = firms.map((firm) => [
    Markup.button.callback(`🏢 ${firm.name} (${firm._count?.discountCodes ?? 0})`, `firm:${firm.id}`),
  ]);
  return Markup.inlineKeyboard(rows.length ? rows : [[Markup.button.callback('کدی موجود نیست', 'noop')]]);
}

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
      '« برگشت به پراپ فرم‌ها',
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
    buttonText?: string | null;
  }>,
  checkButtonText?: string
) {
  const buttons: any[] = channels.map((ch) => [
    Markup.button.url(
      ch.buttonText || 'عضویت در کانال',
      ch.inviteLink ||
        `https://t.me/${ch.channelId.replace('@', '')}`
    ),
  ]);

  buttons.push([
    Markup.button.callback(
      checkButtonText || '✅ عضو شدم، بررسی کن',
      'check:membership'
    ),
  ]);

  return Markup.inlineKeyboard(buttons);
}

export function buildForceJoinKeyboard(
  notJoined: Array<{
    title: string;
    inviteLink: string | null;
    channelId: string;
    buttonText?: string | null;
  }>,
  joinButtonText: string,
  checkButtonText: string
) {
  const buttons: any[] = notJoined.map((ch) => [
    Markup.button.url(
      ch.buttonText || joinButtonText,
      ch.inviteLink ||
        `https://t.me/${ch.channelId.replace('@', '')}`
    ),
  ]);

  buttons.push([
    Markup.button.callback(checkButtonText, 'check:membership'),
  ]);

  return Markup.inlineKeyboard(buttons);
}

// ─── قرعه‌کشی ─────────────────────────────────────────────
export function lotteryKeyboard(lotteryId: number, currentTickets = 0) {
  const buttons = [
    [
      Markup.button.callback('🏆 برندگان', `lottery:winners:${lotteryId}`),
      Markup.button.callback('📜 تاریخچه', 'lottery:history'),
    ],
  ];

  buttons.unshift([Markup.button.callback(currentTickets ? `🎟 خرید بلیت بیشتر (فعلی: ${currentTickets})` : '🎰 خرید بلیت', `lottery:enter:${lotteryId}`)]);

  return Markup.inlineKeyboard(buttons);
}

export function lotteryHistoryKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('📜 تاریخچه قرعه‌کشی‌ها', 'lottery:history')]]);
}

