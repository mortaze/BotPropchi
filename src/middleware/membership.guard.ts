import { Context, Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { membershipService } from '../services/membership/membership.service';
import { requiredChannelsService } from '../services/requiredChannels.service';

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
          await ctx.answerCbQuery('لطفاً ابتدا در کانال‌های زیر عضو شوید.', { show_alert: true });
        } catch {}
        return;
      }

      const lines: string[] = ['لطفاً برای استفاده از ربات در کانال‌های زیر عضو شوید:'];
      for (const ch of result.notJoined) {
        const link = ch.inviteLink || `https://t.me/${ch.channelId.replace(/^-100/, '')}`;
        lines.push(`\n🔹 ${ch.title}\n${link}`);
      }
      lines.push('\nپس از عضویت، دوباره پیام خود را ارسال کنید.');

      try {
        await ctx.reply(lines.join(''));
      } catch {}
    } catch (err) {
      logger.error(`[MembershipGuard] Error for user ${telegramId}:`, err);
      return next();
    }
  };
}
