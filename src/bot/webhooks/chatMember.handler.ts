import { Context } from 'telegraf';
import { logger } from '../../utils/logger';
import { membershipService } from '../../services/membership/membership.service';

const VALID_ROLES = new Set(['member', 'administrator', 'creator']);
const LEFT_ROLES = new Set(['left', 'kicked', 'banned']);

export async function handleMyChatMember(ctx: Context): Promise<void> {
  try {
    const update = (ctx as any).update?.my_chat_member;
    if (!update) return;

    const chat = update.chat;
    const newStatus = update.new_chat_member?.status;

    if (newStatus === 'administrator' || newStatus === 'creator') {
      logger.info(`[ChatMember] Bot is now admin in chat ${chat.id} (${chat.title || 'unknown'})`);
    } else if (LEFT_ROLES.has(newStatus)) {
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
    const userId = update.new_chat_member?.user?.id;
    const newStatus = update.new_chat_member?.status;
    const oldStatus = update.old_chat_member?.status;

    if (!userId || !chat || !newStatus) return;
    if (chat.type !== 'channel') return;

    const channelId = String(chat.id);

    if (LEFT_ROLES.has(newStatus)) {
      await membershipService.invalidateChannel(userId, channelId);
      logger.info(`[ChatMember] User ${userId} left channel ${channelId} — cache invalidated`);
    } else if (VALID_ROLES.has(newStatus) && (LEFT_ROLES.has(oldStatus || '') || oldStatus === undefined)) {
      await membershipService.setChannelCached(userId, channelId, true);
      logger.info(`[ChatMember] User ${userId} joined channel ${channelId} — cache updated to true`);
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

  logger.info('[ChatMember] Handlers registered with direct cache invalidation');
}
