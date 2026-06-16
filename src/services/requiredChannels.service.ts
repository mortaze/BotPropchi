import { Telegraf } from 'telegraf';
import { channelRepository } from '../repositories/channel.repository';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';

export interface RequiredChannelInfo {
  id: number;
  chatId: string;
  title: string;
  inviteLink: string | null;
  botStatus: string | null;
  isActive: boolean;
}

const CACHE_KEY = 'required:channels:active';

class RequiredChannelsService {
  private channels: RequiredChannelInfo[] = [];
  private loaded = false;

  async initialize(bot: Telegraf): Promise<void> {
    const envIds = this.parseEnvChannels();
    if (envIds.length > 0) {
      logger.info(`[RequiredChannels] ${envIds.length} channel(s) from MEMBERSHIP_REQUIRED_CHANNELS env`);
      for (const id of envIds) {
        try {
          const chat = await bot.telegram.getChat(id);
          const me = await bot.telegram.getMe();
          let memberStatus = 'UNKNOWN';
          try {
            const member = await bot.telegram.getChatMember(id, me.id);
            memberStatus = member.status;
            if (member.status !== 'administrator' && member.status !== 'creator') {
              logger.warn(`[RequiredChannels] Bot is NOT admin in channel ${id} (${(chat as any).title || 'unknown'}) — getChatMember may fail`);
            }
          } catch {
            logger.warn(`[RequiredChannels] Cannot verify bot status in channel ${id} — bot may not be admin`);
          }
          this.channels.push({
            id: -id,
            chatId: String(id),
            title: (chat as any).title || String(id),
            inviteLink: (chat as any).username ? `https://t.me/${(chat as any).username}` : null,
            botStatus: memberStatus,
            isActive: true,
          });
        } catch (err) {
          logger.warn(`[RequiredChannels] Cannot access channel ${id}: ${(err as Error).message}`);
        }
      }
    }

    const dbChannels = await channelRepository.findActive();
    for (const ch of dbChannels) {
      if (!this.channels.some((c) => c.chatId === ch.chatId || c.chatId === ch.channelId)) {
        this.channels.push({
          id: ch.id,
          chatId: ch.chatId || ch.channelId,
          title: ch.displayTitle || ch.title,
          inviteLink: ch.inviteLink || (ch.username ? `https://t.me/${ch.username}` : null),
          botStatus: ch.botStatus,
          isActive: ch.isActive,
        });
      }
    }

    this.loaded = true;
    cache.set(CACHE_KEY, this.channels, 300);
    logger.info(`[RequiredChannels] Loaded ${this.channels.length} required channel(s)`);
  }

  getChannels(): RequiredChannelInfo[] {
    const cached = cache.get<RequiredChannelInfo[]>(CACHE_KEY);
    if (cached) return cached;
    return this.channels;
  }

  async refresh(bot: Telegraf): Promise<void> {
    this.channels = [];
    cache.del(CACHE_KEY);
    await this.initialize(bot);
  }

  private parseEnvChannels(): number[] {
    const raw = process.env.MEMBERSHIP_REQUIRED_CHANNELS || '';
    if (!raw.trim()) return [];
    return raw.split(',').map((s) => {
      const id = s.trim().replace(/^@/, '');
      const num = Number(id);
      return isNaN(num) ? 0 : num;
    }).filter((id) => id !== 0);
  }
}

export const requiredChannelsService = new RequiredChannelsService();
