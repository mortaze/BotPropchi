import { Telegraf } from 'telegraf';
import { redisClient } from '../../utils/redis';
import { logger } from '../../utils/logger';
import { ticketService } from '../../services/ticket.service';
import { ticketCategoryService } from '../../services/ticket-category.service';
import { ticketCategoryKeyboard, ticketViewKeyboard, ticketReplyKeyboard } from '../keyboards/ticket.keyboards';
import { notifyAdminsNewTicket } from '../ticket-notification.service';
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

export function registerTicketUserHandlers(bot: Telegraf) {
  bot.hears('🎫 تیکت', async (ctx: any) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const cd = await redisClient.get<boolean>(cooldownKey(telegramId));
    if (cd) return ctx.reply('⏳ لطفا چند دقیقه صبر کنید');
    const categories = await ticketCategoryService.list();
    await setState(telegramId, { step: 'SELECT_CATEGORY' });
    return ctx.reply('لطفا موضوع تیکت خود را انتخاب کنید', ticketCategoryKeyboard(categories));
  });

  bot.action(/^ticket:cat:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const state = await getState(telegramId);
    if (!state || state.step !== 'SELECT_CATEGORY') return;
    const categoryId = parseInt(ctx.match[1]);
    await setState(telegramId, { step: 'IN_TICKET', categoryId });
    return ctx.reply('پیام خود را ارسال کنید. می‌توانید متن، عکس، ویدیو، فایل یا وویس ارسال کنید.');
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
      const lines = recent.map((m: any) => {
        const sender = m.senderType === 'ADMIN' ? 'پشتیبانی' : 'کاربر';
        const content = m.text || `[${m.messageType}]`;
        return `[${sender}] ${content}`;
      });
      return ctx.reply(lines.join('\n\n'), ticketReplyKeyboard());
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