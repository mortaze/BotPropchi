import { Telegraf } from 'telegraf';
import { redisClient } from '../../utils/redis';
import { logger } from '../../utils/logger';
import { ticketService } from '../../services/ticket.service';
import { botAdminService } from '../../services/bot-admin.service';
import { ticketActionKeyboard, adminTicketListKeyboard, adminTicketFilterKeyboard } from '../keyboards/ticket.keyboards';
import { notifyUserNewReply } from '../ticket-notification.service';
import { prisma } from '../../prisma/client';

const REPLY_TTL = 600;

function replyStateKey(adminId: number) {
  return `ticket:admin:reply:${adminId}`;
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

function formatTicketMessages(ticket: any): string {
  const msgs = ticket.messages || [];
  const recent = msgs.slice(-10);
  if (recent.length === 0) return '📭 هیچ پیامی وجود ندارد.';

  const lines = recent.map((m: any) => {
    const sender = m.senderType === 'ADMIN' ? '🧑‍💼 پشتیبانی' : '👤 کاربر';
    const content = m.text || `[${m.messageType}]`;
    return `${sender}:\n${content}`;
  });

  const header = [
    `🎫 تیکت #${ticket.id}`,
    `📂 موضوع: ${ticket.category?.title || '—'}`,
    `👤 کاربر: ${ticket.user?.firstName || ''} ${ticket.user?.lastName || ''}`.trim(),
    `📊 وضعیت: ${ticket.status}`,
    `📅 ایجاد: ${new Date(ticket.createdAt).toLocaleString('fa-IR')}`,
    '',
    '--- پیام‌ها ---',
  ].join('\n');

  return header + '\n\n' + lines.join('\n\n');
}

async function requireAdmin(ctx: any): Promise<boolean> {
  const admin = await botAdminService.getActive(ctx.from?.id);
  if (!admin) {
    await ctx.answerCbQuery('⛔ دسترسی ندارید');
    return false;
  }
  return true;
}

export function registerTicketAdminHandlers(bot: Telegraf) {
  // ─── 🎫 تیکت‌ها (admin ticket list) ────────────────
  bot.hears('🎫 تیکت\u200cها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;

    const result = await ticketService.getAllTickets({ page: 1, limit: 10 });
    const totalPages = Math.ceil(result.total / 10);

    await ctx.reply('تیکت\u200cها:', {
      ...adminTicketListKeyboard(result.items, 1, totalPages),
    });
    await ctx.reply('فیلتر:', adminTicketFilterKeyboard());
  });

  // ─── ticket:admin:view:{id} ────────────────────────
  bot.action(/^ticket:admin:view:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();

    const ticketId = parseInt(ctx.match[1]);
    try {
      const ticket = await ticketService.getTicketWithHistory(ticketId);
      if (!ticket) {
        return ctx.reply('❌ تیکت یافت نشد.');
      }

      await ctx.reply(formatTicketMessages(ticket), ticketActionKeyboard(ticketId));
    } catch (err) {
      logger.error(`[TicketAdmin] view error ticketId=${ticketId}`, err);
      await ctx.reply('❌ خطا در بارگذاری تیکت.');
    }
  });

  // ─── ticket:reply:{ticketId} ───────────────────────
  bot.action(/^ticket:reply:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;

    const ticketId = parseInt(ctx.match[1]);
    await redisClient.set(replyStateKey(ctx.from.id), { ticketId }, REPLY_TTL);
    await ctx.answerCbQuery('✅ حالت پاسخ فعال شد');
    await ctx.reply('✍️ پیام خود را ارسال کنید (متن، عکس، ویدیو، فایل یا وویس)');
  });

  // ─── Admin reply message handler ───────────────────
  bot.on('message', async (ctx: any, next) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return next();

    const replyState = await redisClient.get<{ ticketId: number }>(replyStateKey(ctx.from.id));
    if (!replyState) return next();

    try {
      const messageType = detectMessageType(ctx);
      const fileData = extractFileData(ctx);
      const text = ctx.message?.text || ctx.message?.caption || null;

      await ticketService.addAdminMessage(replyState.ticketId, {
        messageType,
        text,
        ...fileData,
      });

      const ticket = await prisma.ticket.findUnique({ where: { id: replyState.ticketId } });
      if (ticket) {
        const user = await prisma.user.findUnique({ where: { id: ticket.userId } });
        if (user) {
          notifyUserNewReply(user.telegramId, replyState.ticketId, text || `[${messageType}]`)
            .catch(err => logger.error(`[TicketAdmin] notifyUser failed ticketId=${replyState.ticketId}`, err));
        }
      }

      await redisClient.del(replyStateKey(ctx.from.id));
      await ctx.reply('✅ پاسخ ارسال شد');
    } catch (err: any) {
      logger.error(`[TicketAdmin] reply error`, err);
      if (err.message === 'TICKET_NOT_FOUND_OR_CLOSED') {
        await ctx.reply('❌ تیکت یافت نشد یا بسته شده است.');
      } else {
        await ctx.reply('❌ خطا در ارسال پاسخ.');
      }
    }
  });

  // ─── ticket:close:{ticketId} ───────────────────────
  bot.action(/^ticket:close:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;

    const ticketId = parseInt(ctx.match[1]);
    try {
      await ticketService.closeTicket(ticketId, true);
      await ctx.answerCbQuery('🔒 تیکت بسته شد');
      try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      } catch (_) {}
    } catch (err) {
      logger.error(`[TicketAdmin] close error ticketId=${ticketId}`, err);
      await ctx.answerCbQuery('❌ خطا');
    }
  });

  // ─── ticket:delete:{ticketId} ──────────────────────
  bot.action(/^ticket:delete:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;

    const ticketId = parseInt(ctx.match[1]);
    try {
      await ticketService.softDeleteTicket(ticketId);
      await ctx.answerCbQuery('🗑 تیکت حذف شد');
      await ctx.editMessageText('این تیکت حذف شد');
    } catch (err) {
      logger.error(`[TicketAdmin] delete error ticketId=${ticketId}`, err);
      await ctx.answerCbQuery('❌ خطا');
    }
  });

  // ─── ticket:profile:{ticketId} ─────────────────────
  bot.action(/^ticket:profile:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;

    const ticketId = parseInt(ctx.match[1]);
    try {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true } });
      if (!ticket || !ticket.user) {
        return ctx.answerCbQuery('❌ کاربر یافت نشد', { show_alert: true });
      }

      const u = ticket.user;
      const info = [
        `👤 نام: ${u.firstName || ''} ${u.lastName || ''}`.trim(),
        `🆔 آیدی: ${u.telegramId}`,
        `📛 یوزرنیم: ${u.username ? `@${u.username}` : 'ندارد'}`,
        `📅 عضویت: ${new Date(u.createdAt).toLocaleString('fa-IR')}`,
      ].join('\n');

      await ctx.answerCbQuery(info, { show_alert: true });
    } catch (err) {
      logger.error(`[TicketAdmin] profile error ticketId=${ticketId}`, err);
      await ctx.answerCbQuery('❌ خطا', { show_alert: true });
    }
  });

  // ─── ticket:admin:filter:{status} ──────────────────
  bot.action(/^ticket:admin:filter:(all|open|closed)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();

    const filter = ctx.match[1];
    const statusMap: Record<string, any> = { open: 'OPEN', closed: 'CLOSED' };
    const status = statusMap[filter];

    try {
      const result = await ticketService.getAllTickets({ status, page: 1, limit: 10 });
      const totalPages = Math.ceil(result.total / 10);

      await ctx.reply(
        `تیکت\u200cها (${filter === 'all' ? 'همه' : filter === 'open' ? 'باز' : 'بسته'}):`,
        adminTicketListKeyboard(result.items, 1, totalPages),
      );
    } catch (err) {
      logger.error('[TicketAdmin] filter error', err);
      await ctx.reply('❌ خطا در دریافت تیکت\u200cها.');
    }
  });

  // ─── ticket:admin:page:{page} ──────────────────────
  bot.action(/^ticket:admin:page:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();

    const page = parseInt(ctx.match[1]);
    try {
      const result = await ticketService.getAllTickets({ page, limit: 10 });
      const totalPages = Math.ceil(result.total / 10);

      await ctx.reply(
        `تیکت\u200cها (صفحه ${page}):`,
        adminTicketListKeyboard(result.items, page, totalPages),
      );
    } catch (err) {
      logger.error('[TicketAdmin] page error', err);
      await ctx.reply('❌ خطا در دریافت تیکت\u200cها.');
    }
  });
}
