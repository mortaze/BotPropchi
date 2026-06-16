import { Context } from 'telegraf';
import { logger } from '../../utils/logger';
import { membershipService } from '../../services/membership/membership.service';

const VALID_ROLES = ['member', 'administrator', 'creator'];
const LEFT_ROLES = ['left', 'kicked'];

export async function handleMyChatMember(ctx: Context): Promise<void> {
  try {
    const update = (ctx as any).update?.my_chat_member;
    if (!update) return;

    const chat = update.chat;
    const newStatus = update.new_chat_member?.status;
    const oldStatus = update.old_chat_member?.status;

    if (newStatus === 'administrator' || newStatus === 'creator') {
      logger.info(`[ChatMember] Bot is now admin in chat ${chat.id} (${chat.title || 'unknown'})`);
    } else if (LEFT_ROLES.includes(newStatus)) {
      logger.warn(`[ChatMember] Bot was removed from chat ${chat.id} (${chat.title || 'unknown'})`);
    }
  } catch (err) {
    logger.error('[ChatMember] my_chat_member handler error:', err);
  }
}

export async function handleChatMember(ctx: Context): Promise<void> {
  try {
    const update = (ctx as any).update?.chat_member;
    if (!update) return;

    const chat = update.chat;
    const from = update.from;
    const newStatus = update.new_chat_member?.status;
    const oldStatus = update.old_chat_member?.status;
    const userId = update.new_chat_member?.user?.id || from?.id;

    if (!userId || !chat) return;
    if (chat.type !== 'channel') return;

    if (LEFT_ROLES.includes(newStatus)) {
      logger.info(`[ChatMember] User ${userId} LEFT channel ${chat.id}`);

      await membershipService.handleChatMemberUpdate(
        userId,
        String(chat.id),
        newStatus,
        oldStatus || 'member'
      ).catch((err) => logger.error('[ChatMember] Failed to process leave:', err));
    } else if (VALID_ROLES.includes(newStatus) && LEFT_ROLES.includes(oldStatus || '')) {
      logger.info(`[ChatMember] User ${userId} JOINED channel ${chat.id}`);

      await membershipService.handleChatMemberUpdate(
        userId,
        String(chat.id),
        newStatus,
        oldStatus || 'left'
      ).catch((err) => logger.error('[ChatMember] Failed to process join:', err));
    }
  } catch (err) {
    logger.error('[ChatMember] chat_member handler error:', err);
  }
}

export function registerChatMemberHandlers(bot: any): void {
  bot.on('my_chat_member', async (ctx: Context, next: () => Promise<void>) => {
    await handleMyChatMember(ctx);
    return next();
  });

  bot.on('chat_member', async (ctx: Context, next: () => Promise<void>) => {
    await handleChatMember(ctx);
    return next();
  });

  logger.info('[ChatMember] Handlers registered (my_chat_member + chat_member)');
}
