// src/bot/keyboards/index.ts
// تمام صفحه‌کلیدهای ربات

import { Markup } from 'telegraf';
import { config } from '../../config';
import { buildSafeTelegramButton, sanitizeTelegramText, sanitizeTextArray } from '../../utils/unicode';
import { logger } from '../../utils/logger';

export const SERVICE_BUTTONS = [
  { id: 'lottery', text: '🎰 قرعه‌کشی', featureKey: 'lottery' },
  { id: 'referrals', text: '👥 دعوت دوستان', featureKey: 'referrals' },
  { id: 'points', text: '🏆 امتیازهای من', featureKey: 'leaderboard' },
  { id: 'ticket', text: '🎫 تیکت', featureKey: 'ticket_system' },
];

export function injectServiceButtons(layout: any[][], features: Record<string, boolean>): any[][] {
  const result = layout.map(row => [...row]);
  const allTexts = result.flat().map((btn: any) => btn?.text || btn?.label || btn?.title || btn?.ref || '');
  for (const svc of SERVICE_BUTTONS) {
    if (features[svc.featureKey] !== false && !allTexts.includes(svc.text)) {
      result.push([{ id: `svc_${svc.id}`, text: svc.text, ref: svc.text, visible: true }]);
    }
  }
  return result;
}

export function buildMainMenuKeyboard(
  isAdmin = false,
  features: Record<string, boolean> = {},
  menuLayout?: any[][],
  displayMode: 'always_open' | 'toggle_allowed' = 'always_open'
) {
  if (menuLayout && menuLayout.length > 0) {
    logger.debug(`[MenuKeyboard] rows=${menuLayout.length} admin=${isAdmin}`);

    const visibleRows = menuLayout
      .filter((row: any) => Array.isArray(row))
      .map(row =>
        row
          .filter((btn: any) => {
            if (!btn || btn.visible === false) return false;
            const btnText = btn.text || btn.label || btn.title || btn.ref || '';
            const svc = SERVICE_BUTTONS.find(s => s.text === btnText);
            if (svc && features[svc.featureKey] === false) return false;
            return true;
          })
          .map((btn: any) => buildSafeTelegramButton(btn.text || btn.label || btn.title || btn.ref || '', 128))
          .filter(Boolean)
      )
      .filter((row: string[]) => row.length > 0);

    const allTexts = visibleRows.flat();

    for (const svc of SERVICE_BUTTONS) {
      if (features[svc.featureKey] !== false && !allTexts.includes(svc.text)) {
        visibleRows.push([svc.text]);
      }
    }

    if (isAdmin && !allTexts.includes('👨‍💼 پنل ادمین')) {
      visibleRows.push(['👨‍💼 پنل ادمین']);
    }

    logger.info(`[FeatureMenu] lottery=${features.lottery ?? true} referrals=${features.referrals ?? true} leaderboard=${features.leaderboard ?? true} ticket_system=${features.ticket_system ?? true}`);
    logger.info(`[FeatureMenu] Generated: ${visibleRows.flat().join(' | ')}`);

    if (displayMode === 'toggle_allowed') {
      return Markup.keyboard(visibleRows).resize();
    }
    return Markup.keyboard(visibleRows).resize().persistent();
  }

  if (displayMode === 'toggle_allowed') {
    return Markup.keyboard([['👨‍💼 پنل ادمین']]).resize();
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
  rows.push(['🎫 تیکت‌ها']);
  rows.push(['⚙️ تنظیمات', '↩️ بازگشت به منوی اصلی']);
  return Markup.keyboard(rows).resize().persistent();
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

// ─── منوی دعوت دوستان (reply keyboard) ────────────────────
export function buildReferralMenuKeyboard() {
  return Markup.keyboard([
    ['🏆 لیدربورد'],
    ['🔙 بازگشت به منوی اصلی'],
  ]).resize();
}

// ─── اشتراک‌گذاری دعوت ─────────────────────────────────────
export function buildReferralShareKeyboard(shareUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url('📤 دعوت در تلگرام', shareUrl)],
    [Markup.button.callback('📲 کپی متن آماده', 'referral:copy')],
  ]);
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

