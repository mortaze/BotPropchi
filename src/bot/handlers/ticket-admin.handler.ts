import { Telegraf, Markup } from 'telegraf';
import { redisClient } from '../../utils/redis';
import { logger } from '../../utils/logger';
import { ticketService } from '../../services/ticket.service';
import { ticketCategoryService } from '../../services/ticket-category.service';
import { botAdminService } from '../../services/bot-admin.service';
import { ticketActionKeyboard, adminTicketListKeyboard, adminTicketFilterKeyboard, adminTicketByCategoryKeyboard } from '../keyboards/ticket.keyboards';
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

async function sendTicketHistory(ctx: any, ticket: any): Promise<void> {
  const msgs = ticket.messages || [];
  const recent = msgs.slice(-10);

  const header = [
    `🎫 تیکت #${ticket.id}`,
    `📂 موضوع: ${ticket.category?.title || '—'}`,
    `👤 کاربر: ${ticket.user?.firstName || ''} ${ticket.user?.lastName || ''}`.trim(),
    `📊 وضعیت: ${ticket.status}`,
    `📅 ایجاد: ${new Date(ticket.createdAt).toLocaleString('fa-IR')}`,
    `💬 تعداد پیام: ${msgs.length}`,
  ].join('\n');

  await ctx.reply(header);

  if (recent.length === 0) {
    await ctx.reply('📭 هنوز پیامی ارسال نشده.');
    return;
  }

  for (const m of recent) {
    const senderLabel = m.senderType === 'ADMIN' ? '🛡 پشتیبانی:' : '👤 کاربر:';
    const time = new Date(m.createdAt).toLocaleString('fa-IR');
    try {
      if (m.messageType === 'TEXT' || !m.fileId) {
        await ctx.reply(`${senderLabel} [${time}]\n${m.text || '—'}`);
      } else {
        await ctx.reply(`${senderLabel} [${time}]`);
        await sendTicketMessageLocal(ctx.telegram, ctx.from!.id, m);
      }
    } catch (err) {
      await ctx.reply(`${senderLabel}\n[${m.messageType}]`);
    }
  }
}

async function requireAdmin(ctx: any): Promise<boolean> {
  const admin = await botAdminService.getActive(ctx.from?.id);
  if (!admin) {
    await ctx.answerCbQuery('⛔ دسترسی ندارید');
    return false;
  }
  return true;
}

function buildTicketAdminMenuKeyboard() {
  return Markup.keyboard([
    ['📋 همه تیکت\u200cها', '🟢 تیکت\u200cهای باز'],
    ['🔴 تیکت\u200cهای بسته', '📂 دسته\u200cبندی\u200cها'],
    ['🗂 فیلتر دسته\u200cبندی', '↩️ بازگشت به پنل ادمین'],
  ]).resize().persistent();
}

export function registerTicketAdminHandlers(bot: Telegraf) {
  bot.hears('\uD83C\uDFAB تیکت\u200cها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    await ctx.reply('مدیریت تیکت\u200cها:', buildTicketAdminMenuKeyboard());
  });

  bot.hears('📋 همه تیکت\u200cها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    const result = await ticketService.getAllTickets({ page: 1, limit: 10 });
    const totalPages = Math.ceil(result.total / 10);
    await ctx.reply('همه تیکت\u200cها:', adminTicketListKeyboard(result.items, 1, totalPages));
  });

  bot.hears('🟢 تیکت\u200cهای باز', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    const result = await ticketService.getAllTickets({ status: 'OPEN', page: 1, limit: 10 });
    const totalPages = Math.ceil(result.total / 10);
    await ctx.reply('تیکت\u200cهای باز:', adminTicketListKeyboard(result.items, 1, totalPages));
  });

  bot.hears('🔴 تیکت\u200cهای بسته', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    const result = await ticketService.getAllTickets({ status: 'CLOSED', page: 1, limit: 10 });
    const totalPages = Math.ceil(result.total / 10);
    await ctx.reply('تیکت\u200cهای بسته:', adminTicketListKeyboard(result.items, 1, totalPages));
  });

  bot.hears('📂 دسته\u200cبندی\u200cها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    const cats = await ticketCategoryService.listAll();
    if (cats.length === 0) {
      await ctx.reply('هیچ دسته\u200cبندی تعریف نشده.\n\nبرای افزودن بنویسید:\n➕ نام دسته\u200cبندی را ارسال کنید',
        Markup.inlineKeyboard([[Markup.button.callback('➕ افزودن دسته\u200cبندی', 'ticket:cat:add')]]));
      return;
    }
    const list = cats.map((c: any, i: number) =>
      `${i + 1}. ${c.title} ${c.enabled ? '✅' : '❌'}`
    ).join('\n');
    await ctx.reply(`دسته\u200cبندی\u200cهای تیکت:\n\n${list}`,
      Markup.inlineKeyboard([
        ...cats.map((c: any) => [
          Markup.button.callback(`\u270F\uFE0F ${c.title}`, `ticket:cat:edit:${c.id}`),
          Markup.button.callback(c.enabled ? '❌ غیرفعال' : '✅ فعال', `ticket:cat:toggle:${c.id}`),
          Markup.button.callback('🗑', `ticket:cat:del:${c.id}`),
        ]),
        [Markup.button.callback('➕ افزودن', 'ticket:cat:add')],
      ])
    );
  });

  bot.hears('🗂 فیلتر دسته\u200cبندی', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;

    const categories = await ticketCategoryService.list();
    if (categories.length === 0) {
      return ctx.reply('❌ هیچ دسته\u200cبندی فعالی وجود ندارد.');
    }

    await ctx.reply('یک دسته\u200cبندی انتخاب کنید:', adminTicketByCategoryKeyboard(categories));
  });

  bot.hears('↩️ بازگشت به پنل ادمین', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    const { buildBotAdminPanelKeyboard } = require('../keyboards');
    const canBroadcast = admin.role === 'OWNER' || admin.role === 'ADMIN';
    await ctx.reply('پنل ادمین:', buildBotAdminPanelKeyboard(canBroadcast));
  });

  bot.action('ticket:cat:add', async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await redisClient.set(`ticket:admin:addcat:${ctx.from.id}`, { waiting: true }, 300);
    await ctx.reply('نام دسته\u200cبندی جدید را ارسال کنید:');
  });

  bot.action(/^ticket:cat:toggle:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    const id = parseInt(ctx.match[1]);
    const cat = await ticketCategoryService.findById(id);
    if (!cat) return ctx.answerCbQuery('❌ یافت نشد');
    await ticketCategoryService.update(id, { enabled: !cat.enabled });
    await ctx.answerCbQuery(cat.enabled ? '❌ غیرفعال شد' : '✅ فعال شد');
  });

  bot.action(/^ticket:cat:del:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    const id = parseInt(ctx.match[1]);
    await ticketCategoryService.remove(id);
    await ctx.answerCbQuery('🗑 حذف شد');
  });

  bot.action(/^ticket:admin:cat:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();

    const categoryId = parseInt(ctx.match[1]);
    try {
      const result = await ticketService.getAllTickets({ categoryId, page: 1, limit: 10 });
      const totalPages = Math.ceil(result.total / 10);

      if (result.total === 0) {
        return ctx.reply('📭 هیچ تیکتی در این دسته\u200cبندی وجود ندارد.');
      }

      await ctx.reply(
        `📂 تیکت\u200cهای این دسته\u200cبندی (${result.total} مورد):`,
        adminTicketListKeyboard(result.items, 1, totalPages)
      );
    } catch (err) {
      logger.error('[TicketAdmin] cat filter error', err);
      await ctx.reply('❌ خطا در دریافت تیکت\u200cها.');
    }
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

      await sendTicketHistory(ctx, ticket);
      await ctx.reply('عملیات:', ticketActionKeyboard(ticketId));
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

    const addCatState = await redisClient.get<{ waiting: boolean }>(`ticket:admin:addcat:${ctx.from?.id}`);
    if (addCatState?.waiting && ctx.message?.text) {
      await redisClient.del(`ticket:admin:addcat:${ctx.from.id}`);
      await ticketCategoryService.create(ctx.message.text.trim());
      await ctx.reply(`✅ دسته\u200cبندی «${ctx.message.text.trim()}» اضافه شد.`);
      return;
    }

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
