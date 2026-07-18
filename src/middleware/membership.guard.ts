import { Context, Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { membershipService } from '../services/membership/membership.service';
import { requiredChannelsService } from '../services/requiredChannels.service';
import { buildForceJoinKeyboard } from '../bot/keyboards';

const NOT_JOINED_MESSAGE = `🔒 برای استفاده از ربات، ابتدا عضو شوید:`;
const CHECK_BUTTON_TEXT = '✅ بررسی عضویت';

export function membershipGuard(bot: Telegraf) {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (!ctx.from) return next();

    const updateType = (ctx as any).updateType as string;
    if (updateType === 'chat_member' || updateType === 'my_chat_member') return next();

    if (ctx.chat && ctx.chat.type !== 'private') return next();

    const telegramId = ctx.from.id;

    try {
      const channels = requiredChannelsService.getChannels();
      if (channels.length === 0) return next();

      const result = await membershipService.checkMembershipConcurrent(telegramId, channels);

      if (result.isMember) return next();

      if (ctx.callbackQuery) {
        try {
          await ctx.answerCbQuery('❌ هنوز عضو تمام کانال‌ها یا گروه‌های الزامی نشده‌اید.', { show_alert: true });
        } catch {}
        return;
      }

      const channelList = result.notJoined
        .map((ch, i) => `${i + 1}. ${ch.displayTitle || ch.title}`)
        .join('\n');

      const message = `${NOT_JOINED_MESSAGE}\n${channelList}\n\n✅ پس از عضویت روی دکمه زیر کلیک کنید.`;

      const keyboard = buildForceJoinKeyboard(
        result.notJoined.map((ch) => ({
          title: ch.title,
          displayTitle: ch.displayTitle,
          inviteLink: ch.inviteLink,
          channelId: ch.channelId,
        })),
      );

      try {
        await ctx.reply(message, { reply_markup: keyboard.reply_markup });
      } catch {}
    } catch (err) {
      logger.error(`[MembershipGuard] Error for user ${telegramId}:`, err);
      return next();
    }
  };
}
