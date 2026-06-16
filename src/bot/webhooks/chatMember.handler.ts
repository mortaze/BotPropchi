import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger';
import { membershipService } from '../../services/membership/membership.service';
import { channelService } from '../../services/channel.service';
import { RequiredChannelType } from '@prisma/client';

const VALID_ROLES = new Set(['member', 'administrator', 'creator']);
const ADMIN_ROLES = new Set(['administrator', 'creator']);
const LEFT_ROLES = new Set(['left', 'kicked', 'banned']);

export function registerChatMemberHandlers(bot: Telegraf): void {
  bot.on('my_chat_member', async (ctx: Context, next: () => Promise<void>) => {
    try {
      const update = (ctx as any).update?.my_chat_member;
      if (!update) return next();

      const chat = update.chat;
      const newStatus = update.new_chat_member?.status;
      const user = update.new_chat_member?.user;

      if (!chat || !newStatus || !user) return next();
      if (!user.is_bot) return next();

      const channelId = String(chat.id);

      if (ADMIN_ROLES.has(newStatus)) {
        logger.info(`[ChatMember] Bot is now admin in chat ${chat.id} (${chat.title || 'unknown'})`);

        let inviteLink: string | null = null;
        try {
          inviteLink = await bot.telegram.exportChatInviteLink(channelId as any);
        } catch {
          try { inviteLink = await bot.telegram.createChatInviteLink(channelId as any, { member_limit: 1 } as any).then((r) => r.invite_link); } catch {}
        }

        const type = chat.type === 'group' || chat.type === 'supergroup' ? RequiredChannelType.GROUP : RequiredChannelType.CHANNEL;
        const username = chat.username?.trim().replace(/^@/, '') || null;

        await channelService.registerPendingFromChat({
          id: chat.id,
          title: chat.title,
          username,
          type: chat.type,
          inviteLink: inviteLink || undefined,
        });

        await channelService.updateBotStatus(channelId, newStatus, null);
      } else if (LEFT_ROLES.has(newStatus)) {
        logger.warn(`[ChatMember] Bot was removed from chat ${chat.id} (${chat.title || 'unknown'})`);
        await channelService.updateBotStatus(channelId, newStatus, 'Bot was removed from chat');
        await membershipService.invalidateAll();
      } else {
        logger.info(`[ChatMember] Bot status changed to "${newStatus}" in chat ${chat.id} (${chat.title || 'unknown'})`);
        await channelService.updateBotStatus(channelId, newStatus, null);
      }
    } catch (err) {
      logger.error('[ChatMember] my_chat_member handler error:', err);
    }

    return next();
  });

  bot.on('chat_member', async (ctx: Context, next: () => Promise<void>) => {
    try {
      const update = (ctx as any).update?.chat_member;
      if (!update) return next();

      const chat = update.chat;
      const userId = update.new_chat_member?.user?.id;
      const newStatus = update.new_chat_member?.status;
      const oldStatus = update.old_chat_member?.status;

      if (!userId || !chat || !newStatus) return next();
      if (chat.type !== 'channel') return next();

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

    return next();
  });

  logger.info('[ChatMember] Handlers registered with auto-detection + cache invalidation');
}
