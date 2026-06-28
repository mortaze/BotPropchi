import { Telegraf, Markup } from 'telegraf';
import { redisClient } from '../../utils/redis';
import { logger } from '../../utils/logger';
import { ticketService } from '../../services/ticket.service';
import { ticketCategoryService } from '../../services/ticket-category.service';
import { ticketCategoryKeyboard, ticketViewKeyboard, ticketReplyKeyboard, ticketUserMenuKeyboard } from '../keyboards/ticket.keyboards';
import { notifyAdminsNewTicket } from '../ticket-notification.service';
import { settingsService } from '../../services/settings.service';
import { prisma } from '../../prisma/client';

interface TicketState {
  step: 'SELECT_CATEGORY' | 'IN_TICKET';
  categoryId?: number;
  ticketId?: number;
}

const STATE_TTL = 1800;
const COOLDOWN_TTL = 300;

function stateKey(telegramId: number) {
  return `ticket:state:${telegramId}`;
}
function cooldownKey(telegramId: number) {
  return `ticket:cooldown:${telegramId}`;
}

async function getState(telegramId: number): Promise<TicketState | undefined> {
  return redisClient.get<TicketState>(stateKey(telegramId));
}

async function setState(telegramId: number, state: TicketState) {
  await redisClient.set(stateKey(telegramId), state, STATE_TTL);
}

function detectMessageType(ctx: any): string {
  if (ctx.message?.photo) return 'PHOTO';
  if (ctx.message?.video) return 'VIDEO';
  if (ctx.message?.voice) return 'VOICE';
  if (ctx.message?.audio) return 'AUDIO';
  if (ctx.message?.document) return 'DOCUMENT';
  if (ctx.message?.sticker) return 'STICKER';
  return 'TEXT';
}

function extractFileData(ctx: any) {
  const msg = ctx.message;
  if (msg?.photo) {
    const largest = msg.photo[msg.photo.length - 1];
    return { fileId: largest.file_id, fileUniqueId: largest.file_unique_id, mimeType: 'photo', fileSize: largest.file_size };
  }
  if (msg?.video) return { fileId: msg.video.file_id, fileUniqueId: msg.video.file_unique_id, mimeType: msg.video.mime_type, fileSize: msg.video.file_size };
  if (msg?.voice) return { fileId: msg.voice.file_id, fileUniqueId: msg.voice.file_unique_id, mimeType: msg.voice.mime_type, fileSize: msg.voice.file_size };
  if (msg?.audio) return { fileId: msg.audio.file_id, fileUniqueId: msg.audio.file_unique_id, mimeType: msg.audio.mime_type, fileSize: msg.audio.file_size };
  if (msg?.document) return { fileId: msg.document.file_id, fileUniqueId: msg.document.file_unique_id, mimeType: msg.document.mime_type, fileSize: msg.document.file_size };
  if (msg?.sticker) return { fileId: msg.sticker.file_id, fileUniqueId: msg.sticker.file_unique_id, mimeType: 'sticker', fileSize: msg.sticker.file_size };
  return {};
}

async function sendTicketMessageLocal(
  telegram: any,
  chatId: number,
  msg: { messageType: string; text?: string | null; fileId?: string | null; caption?: string | null },
): Promise<void> {
  const caption = msg.text || msg.caption || undefined;
  switch (msg.messageType) {
    case 'TEXT':
      if (msg.text) await telegram.sendMessage(chatId, msg.text);
      break;
    case 'PHOTO':
      if (msg.fileId) await telegram.sendPhoto(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'VIDEO':
      if (msg.fileId) await telegram.sendVideo(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'VOICE':
      if (msg.fileId) await telegram.sendVoice(chatId, msg.fileId);
      break;
    case 'AUDIO':
      if (msg.fileId) await telegram.sendAudio(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'DOCUMENT':
      if (msg.fileId) await telegram.sendDocument(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'STICKER':
      if (msg.fileId) await telegram.sendSticker(chatId, msg.fileId);
      break;
    default:
      if (msg.text) await telegram.sendMessage(chatId, msg.text);
  }
}

export function registerTicketUserHandlers(bot: Telegraf) {
  bot.hears('🎫 تیکت', async (ctx: any) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const isEnabled = await settingsService.isFeatureEnabled('ticket_system');
    if (!isEnabled) {
      return ctx.reply('❌ سیستم پشتیبانی موقتاً غیرفعال است.');
    }

    await ctx.reply('بخش پشتیبانی — چه کاری می\u200cتوانم برایتان انجام دهم؟', ticketUserMenuKeyboard());
  });

  bot.hears('🎫 ایجاد تیکت جدید', async (ctx: any) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const isEnabled = await settingsService.isFeatureEnabled('ticket_system');
    if (!isEnabled) return ctx.reply('❌ سیستم پشتیبانی غیرفعال است.');

    const cd = await redisClient.get<boolean>(cooldownKey(telegramId));
    if (cd) return ctx.reply('⏳ لطفاً چند دقیقه صبر کنید قبل از ارسال تیکت جدید.');

    const categories = await ticketCategoryService.list();
    await setState(telegramId, { step: 'SELECT_CATEGORY' });
    return ctx.reply('لطفاً موضوع تیکت خود را انتخاب کنید:', ticketCategoryKeyboard(categories));
  });

  bot.hears('📋 تیکت\u200cهای من', async (ctx: any) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) return ctx.reply('❌ ابتدا /start را بزنید.');

    const result = await ticketService.getUserTickets(user.id, 1, 10);
    if (result.total === 0) {
      return ctx.reply('📭 هیچ تیکتی ثبت نکرده\u200cاید.\n\nبرای ارسال تیکت از «🎫 ایجاد تیکت جدید» استفاده کنید.');
    }

    const lines = result.items.map((t: any) => {
      const status = t.status === 'OPEN' ? '🟢 باز' : '🔴 بسته';
      const cat = t.category?.title || '';
      const date = new Date(t.createdAt).toLocaleDateString('fa-IR');
      return `${status} تیکت #${t.id} — ${cat} — ${date}`;
    });

    const text = `📋 تیکت\u200cهای شما (${result.total} مورد):\n\n` + lines.join('\n');

    const keyboard = Markup.inlineKeyboard(
      result.items.map((t: any) => {
        const emoji = t.status === 'OPEN' ? '🟢' : '🔴';
        return [Markup.button.callback(`${emoji} تیکت #${t.id}`, `ticket:view:${t.id}`)];
      })
    );

    return ctx.reply(text, keyboard);
  });

  bot.hears('↩️ بازگشت به منو', async (ctx: any) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    await redisClient.del(stateKey(telegramId));
    const { adminReplyOptions } = require('./index');
    const keyboard = await adminReplyOptions(telegramId).catch(() => null);
    if (keyboard) {
      return ctx.reply('منوی اصلی:', keyboard);
    }
    return ctx.reply('منوی اصلی:');
  });

  bot.action(/^ticket:cat:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const state = await getState(telegramId);
    if (!state || state.step !== 'SELECT_CATEGORY') return;
    const categoryId = parseInt(ctx.match[1]);
    await setState(telegramId, { step: 'IN_TICKET', categoryId });
    return ctx.reply('پیام خود را ارسال کنید. می\u200cتوانید متن، عکس، ویدیو، فایل یا وویس ارسال کنید.');
  });

  bot.on('message', async (ctx: any, next) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return next();
    const state = await getState(telegramId);
    if (!state || state.step !== 'IN_TICKET' || !state.categoryId) return next();
    try {
      const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
      if (!user) {
        await ctx.reply('❌ کاربر یافت نشد. ابتدا /start را بزنید.');
        return;
      }
      const messageType = detectMessageType(ctx);
      const fileData = extractFileData(ctx);
      const text = ctx.message?.text || ctx.message?.caption || null;
      let ticketId = state.ticketId;
      const isFirstMessage = !ticketId;
      if (isFirstMessage) {
        const ticket = await ticketService.createTicket(user.id, state.categoryId);
        ticketId = ticket.id;
        await setState(telegramId, { ...state, ticketId });
      }
      await ticketService.addUserMessage(ticketId!, user.id, { messageType, text, ...fileData });
      if (isFirstMessage) {
        await redisClient.set(cooldownKey(telegramId), true, COOLDOWN_TTL);
        await ctx.reply('✅ تیکت شما ثبت شد.', ticketViewKeyboard(ticketId!));
        const category = await ticketCategoryService.findById(state.categoryId);
        notifyAdminsNewTicket({
          ticketId: ticketId!, userId: user.id, telegramId,
          firstName: user.firstName || '', username: (ctx.from as any).username,
          categoryTitle: category?.title || 'نامشخص',
          messagePreview: text || `[${messageType}]`, createdAt: new Date(),
          firstMessage: { messageType, text, fileId: (fileData as any).fileId ?? null },
        }).catch(err => logger.error(`[TicketUser] notifyAdmins failed ticketId=${ticketId}`, err));
      } else {
        await ctx.reply('📨 پیام ارسال شد');
      }
    } catch (err: any) {
      logger.error(`[TicketUser] message handler error telegramId=${telegramId}`, err);
      if (err.message === 'TOO_MANY_OPEN_TICKETS') {
        await ctx.reply('⚠️ شما بیش از ۳ تیکت باز دارید.');
      } else if (err.message === 'TICKET_NOT_FOUND_OR_CLOSED') {
        await ctx.reply('❌ تیکت یافت نشد یا بسته شده است.');
      } else {
        await ctx.reply('❌ خطا رخ داد. لطفا دوباره تلاش کنید.');
      }
    }
  });

  bot.action(/^ticket:view:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const ticketId = parseInt(ctx.match[1]);
    try {
      const ticket = await ticketService.getTicketWithHistory(ticketId);
      if (!ticket) return ctx.reply('❌ تیکت یافت نشد.');
      const messages = ticket.messages || [];
      const recent = messages.slice(-5);
      if (recent.length === 0) return ctx.reply('📭 هنوز پیامی در این تیکت وجود ندارد.');

      const summary = `📋 تیکت #${ticket.id} — ${ticket.category?.title || ''} — ${recent.length} پیام`;
      await ctx.reply(summary);

      for (const m of recent) {
        const senderLabel = m.senderType === 'ADMIN' ? '🛡 پشتیبانی:' : '👤 شما:';
        try {
          if (m.messageType === 'TEXT' || !m.fileId) {
            await ctx.reply(`${senderLabel}\n${m.text || '—'}`);
          } else {
            await ctx.reply(senderLabel);
            await sendTicketMessageLocal(ctx.telegram, ctx.from!.id, m);
          }
        } catch (err) {
          await ctx.reply(`${senderLabel}\n[${m.messageType}]`);
        }
      }
      return ctx.reply('برای پاسخ دادن:', ticketReplyKeyboard());
    } catch (err) {
      logger.error(`[TicketUser] view error ticketId=${ticketId}`, err);
      return ctx.reply('❌ خطا در بارگذاری تیکت.');
    }
  });

  bot.action('ticket:my_reply', async (ctx: any) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const state = await getState(telegramId);
    if (!state || !state.ticketId) return ctx.reply('❌ تیکت فعالی یافت نشد.');
    return ctx.reply('پیام خود را ارسال کنید.');
  });
}
