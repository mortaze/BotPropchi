import { Context } from 'telegraf';
import { logger } from '../../utils/logger';
import { membershipService } from '../../services/membership/membership.service';
import { forcedMembershipSettingsService } from '../../services/membership/forcedMembership.service';

const VALID_ROLES = ['member', 'administrator', 'creator'];
const LEFT_ROLES = ['left', 'kicked'];

export async function handleChatMemberUpdate(ctx: Context): Promise<void> {
  try {
    const update = (ctx as any).update;
    if (!update?.my_chat_member) return;

    const chat = update.my_chat_member.chat;
    const from = update.my_chat_member.from;
    const newStatus = update.my_chat_member.new_chat_member?.status;
    const oldStatus = update.my_chat_member.old_chat_member?.status;
    const chatType = chat?.type;

    if (chatType !== 'channel') return;

    const isEnabled = await forcedMembershipSettingsService.isEnabled();
    if (!isEnabled) return;

    if (from?.id) {
      await membershipService.processChatMemberUpdate(
        from.id,
        String(chat.id),
        newStatus,
        oldStatus
      );
    }

    if (newStatus === 'administrator' || newStatus === 'creator') {
      logger.info(`[ChatMemberHandler] Bot is admin in channel ${chat.id}`);
    } else if (newStatus === 'left' || newStatus === 'kicked') {
      logger.warn(`[ChatMemberHandler] Bot was removed from channel ${chat.id}`);
    }
  } catch (err) {
    logger.error('[ChatMemberHandler] Error:', err);
  }
}

export function registerChatMemberHandler(bot: any): void {
  bot.on('my_chat_member', async (ctx: Context, next: () => Promise<void>) => {
    await handleChatMemberUpdate(ctx);
    return next();
  });
  logger.info('[ChatMemberHandler] Registered my_chat_member handler');
}
